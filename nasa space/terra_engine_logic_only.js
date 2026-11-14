// TerraAnalog v5.0 — Planetary Engine (language-neutral: returns keys & numbers; UI localizes via i18n.js)
// Features: live SRTM + offline fallback, 3D DEM synthesis, bi-directional lookup, hardware-readiness matrix, environmental deltas

// DB placeholder: `python build_engine.py` replaces the next line with planetary_db.json to produce terra_engine.js (single source of truth).
const EMBEDDED_PLANETARY_DB = { earth_ref: [], mars: [], moon: [], earth_analogs: [], planet_sites: {}, bodies: {}, meta: {} };
let planetaryDB = EMBEDDED_PLANETARY_DB;


let _dbNormalized = false;
let _refSorted = null;

// Sorted copies of the Earth reference metrics → O(log n) percentile lookups
function buildRefIndex(db) {
    const idx = {};
    ["slope", "roughness", "relief", "curvature"].forEach(m => {
        idx[m] = (db.earth_ref || []).map(p => p[m]).filter(Number.isFinite).sort((a, b) => a - b);
    });
    return idx;
}

// percentile rank (≤) of v inside an ascending array, 0–100
function pctRank(sortedArr, v) {
    if (!sortedArr.length) return 50;
    let lo = 0, hi = sortedArr.length;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (sortedArr[mid] <= v) lo = mid + 1; else hi = mid; }
    return (lo / sortedArr.length) * 100;
}

// The shipped Mars/Moon catalogs store *_pct relative to their OWN population while Earth sites are ranked
// against earth_ref. Mixing baselines mis-ranks matches (e.g. Sinai → Gale instead of Valles/Noctis).
// Re-rank every planetary point against earth_ref so all percentiles share one baseline. Idempotent.
function normalizeDB(db) {
    _refSorted = buildRefIndex(db);
    if (!db.meta) db.meta = {};
    if (db.meta.pctBaseline === "earth_ref") { _dbNormalized = true; return db; }
    ["mars", "moon"].forEach(body => (db[body] || []).forEach(pt => {
        ["slope", "roughness", "relief", "curvature"].forEach(m => {
            if (Number.isFinite(pt[m])) pt[m + "_pct"] = Number(pctRank(_refSorted[m], pt[m]).toFixed(2));
        });
    }));
    db.meta.pctBaseline = "earth_ref";
    _dbNormalized = true;
    return db;
}

// Cheap structural validation — warns instead of throwing so the app still boots
function validateDB(db) {
    const problems = [];
    ["earth_ref", "mars", "moon", "earth_analogs"].forEach(k => { if (!Array.isArray(db[k]) || !db[k].length) problems.push(`empty ${k}`); });
    if (!db.bodies || !db.bodies.earth || !db.bodies.mars || !db.bodies.moon) problems.push("bodies{earth,mars,moon} missing");
    (db.mars || []).concat(db.moon || []).forEach(p => { if (!(db.planet_sites || {})[p.region]) problems.push(`no planet_sites entry for ${p.region}`); });
    return [...new Set(problems)];
}

async function initTerraEngine(customJsonPath = null) {
    if (customJsonPath) {
        try {
            const res = await fetch(customJsonPath);
            if (res.ok) { planetaryDB = await res.json(); _dbNormalized = false; }
        } catch (e) {
            console.info("Using embedded planetary database.");
        }
    }
    if (!_dbNormalized) {
        normalizeDB(planetaryDB);
        const issues = validateDB(planetaryDB);
        if (issues.length) console.warn("[TerraEngine] DB validation:", issues);
    }
    return planetaryDB;
}

// Check if coordinate is in a known ocean basin when offline

function isLikelyOceanCoordinate(lat, lon) {
    // Conservative open-ocean boxes (offline guard only). Atlantic box stops short of Brazil's bulge (-34.8°) and Africa (-17.5°).
    if (lat > -55 && lat < 45 && lon > -33 && lon < -19) return true;
    if (lat > -50 && lat < 40 && lon > -175 && lon < -125 && !(lat > 18 && lat < 23 && lon > -160 && lon < -154)) return true; // Pacific, Hawaii excluded
    if (lat > -45 && lat < 5 && lon > 55 && lon < 95) return true;                                                            // Indian Ocean
    return false;
}

// Synthesize a realistic 8x8 DEM matrix from morphological parameters (slope, relief, curvature)
function synthesizeMorphologyDEM(baseElev, slopeDeg, reliefM, curvatureVal, seed = 1.0) {
    const grid = [];
    for (let r = 0; r < 8; r++) {
        const row = [];
        for (let c = 0; c < 8; c++) {
            const nx = (c - 3.5) / 3.5;
            const ny = (r - 3.5) / 3.5;
            const r2 = nx * nx + ny * ny;
            const grad = (nx * 0.38 + ny * 0.26) * reliefM * 0.45;
            const shape = (curvatureVal * 1.35) * (0.5 - r2) * reliefM * 0.55;
            const micro = Math.sin((r + seed) * 1.2) * Math.cos((c + seed) * 1.1) * (reliefM * 0.20);
            row.push(Number((baseElev + grad + shape + micro).toFixed(1)));
        }
        grid.push(row);
    }
    return grid;
}

// Analyze any Earth coordinate with 2.5s timeout + automatic offline fallback to cached SRTM matrices

function _nearestAnalog(lat, lon) {
    let best = null, bd = Infinity;
    (planetaryDB.earth_analogs || []).forEach(a => {
        const dLat = Math.abs(a.lat - lat), dLon = Math.abs(a.lon - lon);
        if (dLat < 0.15 && dLon < 0.15 && dLat + dLon < bd) { bd = dLat + dLon; best = a; }
    });
    return best;
}

async function analyzeEarthLocation(lat, lon) {
    const nLat = Number(lat), nLon = Number(lon);
    if (!Number.isFinite(nLat) || !Number.isFinite(nLon) || Math.abs(nLat) > 90 || Math.abs(nLon) > 180) throw new Error("INVALID_COORDINATE");
    const r = await _analyzeRaw(nLat, nLon);
    const a = _nearestAnalog(nLat, nLon);
    r.analogId = a ? a.id : null;
    return r;
}


async function _analyzeRaw(lat, lon) {
    await initTerraEngine();
    const numLat = Number(lat), numLon = Number(lon);
    const cachedSite = _nearestAnalog(numLat, numLon);

    const gridSize = 8, stepDeg = 0.0025, pixelMeters = 275.0;
    // Longitude step widens with 1/cos(lat) so cells stay ≈275 m square at every latitude
    const cosLat = Math.max(0.2, Math.cos(numLat * Math.PI / 180));
    const wrapLon = x => ((x + 540) % 360) - 180;
    const lats = [], lons = [];
    for (let r = 0; r < gridSize; r++) {
        for (let c = 0; c < gridSize; c++) {
            const dLat = (r - (gridSize - 1) / 2) * stepDeg;
            const dLon = (c - (gridSize - 1) / 2) * stepDeg / cosLat;
            lats.push(Math.max(-90, Math.min(90, numLat - dLat)).toFixed(5));
            lons.push(wrapLon(numLon + dLon).toFixed(5));
        }
    }

    try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 2600);
        let data;
        try {
            const url = `https://api.open-meteo.com/v1/elevation?latitude=${lats.join(',')}&longitude=${lons.join(',')}`;
            const response = await fetch(url, { signal: controller.signal });
            if (!response.ok) throw new Error("API_LIMIT");
            data = await response.json();          // still covered by the timer
        } finally { clearTimeout(timer); }

        const elevations = data && data.elevation;
        if (!Array.isArray(elevations) || elevations.length < gridSize * gridSize) throw new Error("NO_DATA");
        const finite = elevations.filter(Number.isFinite);
        if (finite.length < elevations.length * 0.9) throw new Error("NO_DATA");
        const nonZero = finite.filter(e => Math.abs(e) > 0.01);
        const maxDiff = Math.max(...finite) - Math.min(...finite);
        if (nonZero.length < 15 && maxDiff === 0) throw new Error("OCEAN_SURFACE_ERROR");

        const grid = [];
        for (let r = 0; r < gridSize; r++) grid.push(elevations.slice(r * gridSize, (r + 1) * gridSize));
        const result = computeMetricsFromGrid(numLat, numLon, grid, pixelMeters);
        result.dataSource = "LIVE_DEM";
        return result;
    } catch (err) {
        if (err.message === "OCEAN_SURFACE_ERROR") throw err;
        if (isLikelyOceanCoordinate(numLat, numLon)) throw new Error("OCEAN_SURFACE_ERROR");

        if (cachedSite && cachedSite.demGrid) {
            const res = computeMetricsFromGrid(numLat, numLon, cachedSite.demGrid, pixelMeters);
            res.dataSource = "CACHED_SRTM";
            return res;
        }

        // Deterministic SYNTHETIC estimate (not measured data) so the UI keeps working offline. Flagged in the UI.
        const seed = Math.abs(Math.sin(numLat * 12.9898 + numLon * 78.233)) * 10;
        const synthRelief = 65 + (seed % 5) * 95;
        const synthSlope = 2.5 + (seed % 4) * 4.2;
        const synthCurv = ((seed % 2) - 1) * 0.35 + 0.175 * Math.sin(seed * 3.1);   // both signs (old formula was always ≤ 0)
        const synthElev = 150 + (seed % 7) * 240;
        const fallbackGrid = synthesizeMorphologyDEM(synthElev, synthSlope, synthRelief, synthCurv, seed);
        const res = computeMetricsFromGrid(numLat, numLon, fallbackGrid, pixelMeters);
        res.dataSource = "OFFLINE_GEODETIC";
        res.synthetic = true;
        return res;
    }
}


// Pure terrain measurement of a DEM grid (no matching) — also used to score cached analog sites consistently
function measureGrid(lat, lon, grid, pixelMeters) {
    if (!_dbNormalized) normalizeDB(planetaryDB);
    if (!Array.isArray(grid) || !grid.length || !Array.isArray(grid[0])) throw new Error("INVALID_GRID");
    const rows = grid.length, cols = grid[0].length;
    if (rows < 3 || cols < 3) throw new Error("INVALID_GRID");
    const dx = typeof pixelMeters === "object" ? pixelMeters.dx : pixelMeters;
    const dy = typeof pixelMeters === "object" ? pixelMeters.dy : pixelMeters;
    if (!(dx > 0) || !(dy > 0)) throw new Error("INVALID_GRID");

    // null/NaN-safe copy: gaps become the mean of valid cells
    const valid = grid.flat().filter(Number.isFinite);
    if (!valid.length) throw new Error("NO_DATA");
    const fill = valid.reduce((a, b) => a + b, 0) / valid.length;
    grid = grid.map(row => row.map(v => Number.isFinite(v) ? v : fill));

    const elevations = grid.flat();
    let slopeSum = 0, curvSum = 0, n = 0;
    for (let r = 1; r < rows - 1; r++) {
        for (let c = 1; c < cols - 1; c++) {
            const dz_dx = (grid[r][c + 1] - grid[r][c - 1]) / (2 * dx);
            const dz_dy = (grid[r - 1][c] - grid[r + 1][c]) / (2 * dy);
            slopeSum += Math.atan(Math.hypot(dz_dx, dz_dy)) * (180 / Math.PI);
            const d2x = (grid[r][c + 1] - 2 * grid[r][c] + grid[r][c - 1]) / (dx * dx);
            const d2y = (grid[r - 1][c] - 2 * grid[r][c] + grid[r + 1][c]) / (dy * dy);
            curvSum += (d2x + d2y) * 1000;
            n++;
        }
    }
    let minE = Infinity, maxE = -Infinity, sum = 0;
    for (const v of elevations) { sum += v; if (v < minE) minE = v; if (v > maxE) maxE = v; }
    const meanElev = sum / elevations.length;

    const earthPoint = {
        lat: Number(Number(lat).toFixed(4)),
        lon: Number(Number(lon).toFixed(4)),
        elevation: Number(meanElev.toFixed(1)),
        slope: Number((slopeSum / n).toFixed(2)),
        roughness: Number(Math.sqrt(elevations.reduce((s, v) => s + (v - meanElev) ** 2, 0) / elevations.length).toFixed(2)),
        relief: Number((maxE - minE).toFixed(1)),
        curvature: Number((curvSum / n).toFixed(4)),
        demGrid: grid
    };
    ["slope", "roughness", "relief", "curvature"].forEach(m => {
        earthPoint[`${m}_pct`] = Number(pctRank(_refSorted[m], earthPoint[m]).toFixed(2));
    });

    return earthPoint;
}

function computeMetricsFromGrid(lat, lon, grid, pixelMeters) {
    const earthPoint = measureGrid(lat, lon, grid, pixelMeters);
    return {
        earthSite: earthPoint,
        marsMatches: matchWithPlanet(earthPoint, planetaryDB.mars || [], 3),
        moonMatches: matchWithPlanet(earthPoint, planetaryDB.moon || [], 3)
    };
}


const MATCH_WEIGHTS = { slope_pct: 0.35, roughness_pct: 0.30, relief_pct: 0.25, curvature_pct: 0.10 };

function _matchDistance(a, b) {
    const w = MATCH_WEIGHTS;
    const dSlope = Math.abs(a.slope_pct - b.slope_pct), dRough = Math.abs(a.roughness_pct - b.roughness_pct);
    const dRelief = Math.abs(a.relief_pct - b.relief_pct), dCurv = Math.abs(a.curvature_pct - b.curvature_pct);
    const dist = Math.sqrt(w.slope_pct * dSlope ** 2 + w.roughness_pct * dRough ** 2 + w.relief_pct * dRelief ** 2 + w.curvature_pct * dCurv ** 2);
    return { dist, dSlope, dRough, dRelief, dCurv, score: Number(Math.max(0, 100 - dist).toFixed(1)) };
}

function matchWithPlanet(earthPt, planetCatalog, topK = 3) {
    // 1) cheap scoring of every catalog point, 2) keep top-K unique regions, 3) synthesize DEMs only for the winners
    const scored = planetCatalog.map((pt, idx) => ({ pt, idx, d: _matchDistance(earthPt, pt) }))
        .filter(s => Number.isFinite(s.d.dist))
        .sort((a, b) => b.d.score - a.d.score);
    const seen = new Set(), out = [];
    for (const s of scored) {
        if (seen.has(s.pt.region)) continue;
        seen.add(s.pt.region);
        const pt = s.pt, d = s.d;
        out.push({
            regionName: pt.region, regionKey: pt.region,
            regionNameAr: ((planetaryDB.planet_sites || {})[pt.region] || {}).nameAr || pt.region,
            lat: pt.lat, lon: pt.lon, totalScore: d.score,
            slopeScore: Number((100 - d.dSlope).toFixed(1)),
            roughnessScore: Number((100 - d.dRough).toFixed(1)),
            reliefScore: Number((100 - d.dRelief).toFixed(1)),
            curvatureScore: Number((100 - d.dCurv).toFixed(1)),
            metrics: { slope: pt.slope, roughness: pt.roughness, relief: pt.relief, curvature: pt.curvature },
            demGrid: synthesizeMorphologyDEM(0, pt.slope, pt.relief, pt.curvature, (s.idx % 7) + 1.2)
        });
        if (out.length === topK) break;
    }
    return out;
}

// Bi-Directional Reverse Lookup: Find the best Earth Analog for a target Mars or Moon Mission!

// Bi-Directional Reverse Lookup: best Earth analog for a Mars / Moon target region
async function findEarthAnalogForMission(body, regionKeyword) {
    await initTerraEngine();
    if (body !== "mars" && body !== "moon") throw new Error("UNKNOWN_BODY");
    const catalog = body === "mars" ? planetaryDB.mars : planetaryDB.moon;
    const kw = String(regionKeyword || "").trim().toLowerCase();
    const regionPts = kw ? catalog.filter(p => p.region.toLowerCase().includes(kw)) : [];
    if (!regionPts.length) throw new Error("UNKNOWN_REGION");
    const analogs = planetaryDB.earth_analogs || [];
    if (!analogs.length) throw new Error("NO_ANALOGS");

    // Score each analog on the terrain the app will actually show (its cached DEM), not on the hand-entered table values
    const measured = analogs.map(a => (Array.isArray(a.demGrid) && a.demGrid.length >= 3) ? measureGrid(a.lat, a.lon, a.demGrid, 275.0) : a);
    let bestEarth = null, bestPt = null, bestScore = -1;
    for (let i = 0; i < analogs.length; i++) for (const pt of regionPts) {
        const earthCand = analogs[i];
        const s = _matchDistance(measured[i], pt).score;
        if (s > bestScore) { bestScore = s; bestEarth = earthCand; bestPt = pt; }
    }
    const analysis = await analyzeEarthLocation(bestEarth.lat, bestEarth.lon);
    analysis.analogId = bestEarth.id;
    analysis.labelKey = { type: "analog", id: bestEarth.id };
    const targetMatch = matchWithPlanet(analysis.earthSite, [bestPt], 1)[0];
    // score shown to the user = score of the terrain actually analysed (live/cached), not the pre-selection estimate
    analysis.reverseMissionTarget = { body, region: bestPt.region, score: targetMatch.totalScore, selectionScore: bestScore, match: targetMatch };
    return analysis;
}


// SRTM voids (-32768) → null, then filled from neighbours so they never become fake 0 m cliffs
function fillHgtVoids(grid, passes = 12) {
    const rows = grid.length, cols = grid[0].length;
    let holes = [];
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) if (grid[r][c] === null) holes.push([r, c]);
    if (holes.length === rows * cols) return grid.map(row => row.map(() => 0));
    while (holes.length && passes-- > 0) {
        const next = [], fills = [];
        for (const [r, c] of holes) {
            let s = 0, k = 0;
            for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
                const v = grid[r + dr]?.[c + dc];
                if (v !== null && v !== undefined) { s += v; k++; }
            }
            k ? fills.push([r, c, s / k]) : next.push([r, c]);
        }
        fills.forEach(([r, c, v]) => { grid[r][c] = v; });
        holes = next;
        if (!fills.length) break;
    }
    const valid = grid.flat().filter(v => v !== null);
    const mean = valid.length ? valid.reduce((a, b) => a + b, 0) / valid.length : 0;
    return grid.map(row => row.map(v => v === null ? mean : v));
}

function parseLocalHgtArrayBuffer(arrayBuffer, fileName = "N13E040.hgt") {
    if (!(arrayBuffer instanceof ArrayBuffer) || arrayBuffer.byteLength % 2 !== 0) throw new Error("INVALID_HGT_FORMAT");
    const view = new DataView(arrayBuffer);
    const totalSamples = arrayBuffer.byteLength / 2;
    const side = Math.round(Math.sqrt(totalSamples));
    if (side < 10 || side * side !== totalSamples) throw new Error("INVALID_HGT_FORMAT");

    const match = String(fileName).match(/([NS])(\d{2})([EW])(\d{3})/i);
    let baseLat = 13.0, baseLon = 40.0;
    if (match) {
        baseLat = parseInt(match[2], 10) * (match[1].toUpperCase() === 'N' ? 1 : -1);
        baseLon = parseInt(match[4], 10) * (match[3].toUpperCase() === 'E' ? 1 : -1);
    }
    const win = Math.min(48, side);
    const startR = Math.floor((side - win) / 2), startC = Math.floor((side - win) / 2);
    const cellDeg = 1 / (side - 1);                       // 1° tile → cell size in degrees (1201→90 m, 3601→30 m)
    const centerLat = baseLat + 0.5;
    const pixelMeters = { dy: 110574 * cellDeg, dx: 111320 * Math.cos(centerLat * Math.PI / 180) * cellDeg };

    let grid = [];
    for (let r = 0; r < win; r++) {
        const row = [];
        for (let c = 0; c < win; c++) {
            const v = view.getInt16(((startR + r) * side + (startC + c)) * 2, false);
            row.push(v < -10000 ? null : v);
        }
        grid.push(row);
    }
    grid = fillHgtVoids(grid);
    const res = computeMetricsFromGrid(centerLat, baseLon + 0.5, grid, pixelMeters);
    res.dataSource = "LOCAL_HGT_BINARY";
    res.filenameParsed = !!match;                         // lets the UI warn when coordinates were guessed
    return res;
}


async function analyzeRandomEarthLocation() {
    await initTerraEngine();
    const list = planetaryDB.earth_analogs || [];
    if (!list.length) throw new Error("NO_ANALOGS");
    const pick = list[Math.floor(Math.random() * list.length)];
    const jitterLat = Number((pick.lat + (Math.random() - 0.5) * 0.08).toFixed(4));
    const jitterLon = Number((pick.lon + (Math.random() - 0.5) * 0.08).toFixed(4));
    const result = await analyzeEarthLocation(jitterLat, jitterLon);
    result.zoneAr = pick.nameAr;
    result.zoneEn = pick.nameEn;
    return result;
}


function calculateRoverPhysics(slopeDeg, roughnessM, roverMassKg = 1025, cgHeightM = 1.1, trackWidthM = 2.7) {
    const bodies = [{ id: "earth", g: 9.81 }, { id: "mars", g: 3.721 }, { id: "moon", g: 1.625 }];
    const num = (v, d, lo, hi) => Number.isFinite(Number(v)) ? Math.min(hi, Math.max(lo, Number(v))) : d;
    const mass = num(roverMassKg, 1025, 1, 1e5), cg = num(cgHeightM, 1.1, 0.05, 10), track = num(trackWidthM, 2.7, 0.1, 10);
    const slope = num(slopeDeg, 0, 0, 89), rough = num(roughnessM, 0, 0, 1e4);

    const criticalTipAngle = Math.atan((track / 2) / cg) * (180 / Math.PI);
    const effectiveSlope = Math.min(89, slope + Math.min(18, rough * 0.18));
    return bodies.map(b => {
        const weightN = mass * b.g;
        const safetyMarginPct = Math.max(0, Math.min(100, ((criticalTipAngle - effectiveSlope) / criticalTipAngle) * 100));
        return {
            bodyId: b.id, gravity: b.g,
            weightN: Math.round(weightN),
            normalForceN: Math.round(weightN * Math.cos(effectiveSlope * Math.PI / 180)),
            downhillForceN: Math.round(weightN * Math.sin(effectiveSlope * Math.PI / 180)),
            criticalAngleDeg: Number(criticalTipAngle.toFixed(1)),
            effectiveTiltDeg: Number(effectiveSlope.toFixed(1)),
            stabilityScore: Number(safetyMarginPct.toFixed(1)),
            statusKey: safetyMarginPct > 45 ? 'safe' : (safetyMarginPct > 20 ? 'caution' : 'critical')
        };
    });
}

// ---------- v5: environment, hardware readiness, deltas ----------
const clamp = (v, a = 0, b = 100) => Math.max(a, Math.min(b, v));
const r1 = v => Number(Number(v).toFixed(1));

function getSiteMeta(regionKey) { return (planetaryDB.planet_sites || {})[regionKey] || null; }
function getAnalogMeta(id) { return (planetaryDB.earth_analogs || []).find(a => a.id === id) || null; }
function getBodies() { return planetaryDB.bodies; }

function earthEnvironment(res) {
    const a = getAnalogMeta(res.analogId);
    const e = res.earthSite;
    if (a && a.env) return { tMaxC: a.env.tMaxC, tMinC: a.env.tMinC, soilTags: a.soilTags || [], estimated: false };
    const alat = Math.abs(e.lat);
    const tMax = r1(44 - 0.35 * alat - 6.5 * (e.elevation / 1000));
    return { tMaxC: tMax, tMinC: r1(tMax - (22 + 0.35 * alat)), soilTags: [], estimated: true };
}


function _siteFallback(body) { return body === "moon" ? { tMaxC: 120, tMinC: -170, soilTags: [] } : { tMaxC: 0, tMinC: -90, soilTags: [] }; }

function evaluateHardware(res, target, rover = {}) {
    const e = res.earthSite, env = earthEnvironment(res), t = target.site;
    const site = getSiteMeta(t.regionKey) || _siteFallback(target.body);
    const siteTags = site.soilTags || [];
    // 1. Rover traction & mobility (uses the same rover parameters as the Physics Lab)
    const base = (t.slopeScore + t.roughnessScore) / 2;
    const margin = calculateRoverPhysics(e.slope, e.roughness, rover.massKg, rover.cgHeightM)[0].stabilityScore;
    const mob = clamp(base - (margin < 20 ? 15 : 0));
    // 2. EVA suit thermal stress
    const swE = Math.max(1, env.tMaxC - env.tMinC), swT = Math.max(1, site.tMaxC - site.tMinC);
    const overlap = Math.max(0, Math.min(env.tMaxC, site.tMaxC) - Math.max(env.tMinC, site.tMinC));
    const therm = clamp(50 * (Math.min(swE, swT) / Math.max(swE, swT)) + 50 * Math.min(1, overlap / swT));
    // 3. ISRU drilling & soil mechanics
    const shared = siteTags.filter(x => env.soilTags.includes(x));
    const compat = env.soilTags.length ? shared.length / Math.max(1, siteTags.length) : 0.4;
    const isru = clamp(50 * compat + 0.25 * (t.roughnessScore + t.curvatureScore));
    const lvl = v => v >= 75 ? 'ideal' : (v >= 50 ? 'good' : 'risky');
    const items = [
        { id: 'mobility', score: r1(mob), level: lvl(mob), vals: { eSlope: e.slope, tSlope: t.metrics.slope, eRough: e.roughness, tRough: t.metrics.roughness, margin: r1(margin) } },
        { id: 'thermal', score: r1(therm), level: lvl(therm), vals: { eMax: env.tMaxC, eMin: env.tMinC, tMax: site.tMaxC, tMin: site.tMinC, swE, swT, est: env.estimated } },
        { id: 'isru', score: r1(isru), level: lvl(isru), vals: { shared, targetTags: siteTags, earthTags: env.soilTags, known: env.soilTags.length > 0 } }
    ];
    return { items, overall: r1((mob + therm + isru) / 3) };
}


function environmentDeltas(res, target) {
    const e = res.earthSite, t = target.site, env = earthEnvironment(res);
    const site = getSiteMeta(t.regionKey) || _siteFallback(target.body);
    const B = planetaryDB.bodies, tb = B[target.body];
    const h = Math.min(11000, Math.max(-500, e.elevation));      // ISA troposphere formula; allows depressions like Danakil (-125 m)
    const ePress = B.earth.pressureKPa * Math.pow(1 - 2.25577e-5 * h, 5.25588);
    const eRad = B.earth.radiationMSvDay * Math.pow(2, h / 1500);
    const sg = v => (v !== 0 && Math.abs(v) < 10) ? Number(Number(v).toPrecision(3)) : r1(v);
    const row = (key, ev, tv, unit) => ({ key, earth: sg(ev), target: sg(tv), delta: sg(tv - ev), unit });
    return [
        row('slope', e.slope, t.metrics.slope, 'deg'),
        row('roughness', e.roughness, t.metrics.roughness, 'm'),
        row('relief', e.relief, t.metrics.relief, 'm'),
        row('gravity', B.earth.gravity, tb.gravity, 'ms2'),
        row('tMax', env.tMaxC, site.tMaxC, 'C'),
        row('tMin', env.tMinC, site.tMinC, 'C'),
        row('pressure', ePress, tb.pressureKPa, 'kPa'),
        row('radiation', eRad, tb.radiationMSvDay, 'mSv')
    ];
}

window.TerraEngine = {
    getSiteMeta,
    getAnalogMeta,
    getBodies,
    earthEnvironment,
    evaluateHardware,
    environmentDeltas,
    getDB: () => planetaryDB,
    initTerraEngine,
    analyzeEarthLocation,
    analyzeRandomEarthLocation,
    findEarthAnalogForMission,
    parseLocalHgtArrayBuffer,
    synthesizeMorphologyDEM,
    calculateRoverPhysics,
    matchWithPlanet,
    computeMetricsFromGrid,
    measureGrid,
    normalizeDB,
    validateDB,
    fillHgtVoids
};

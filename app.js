// TerraAnalog v5.0 — Controller
// Strict EN/AR localization • Voice briefing with guided tour • Hardware readiness matrix • Mission dossier
// Depends on: i18n.js (I18n, t), terra_engine.js (TerraEngine), Leaflet, Three.js

let currentLang = "ar";
let lastEvaluationResult = null;
let selectedTarget = null;            // { body: 'mars'|'moon', site: matchObject }
let statusState = { kind: "idle" };   // re-rendered on every language switch
let hudSites = { mars: null, moon: null };
let meshInfo = null;                  // { kind:'earth'|'orbital', name?, site?, slope, relief }
let earthMap = null, marsMap = null, moonMap = null;
let earthMarker = null, marsMarker = null, moonMarker = null;
let earthSatLayer = null, earthTopoLayer = null, usingSatLayer = true;
let wireframeMode = false;
let autoSpin3D = true;
let threeRenderer = null, threeScene = null, threeCamera = null, terrainMesh = null;

// Interactive 3D camera state
let isDragging3D = false;
let prevMouse = { x: 0, y: 0 };
let meshRotZ = 0;
let meshTiltX = -Math.PI / 2.25;
let camDist = 48;

const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
const esc = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
// Rover parameters shared by the Physics Lab and the Hardware Readiness matrix
function currentRover() {
    const m = document.getElementById("roverMassRange"), g = document.getElementById("roverCgRange");
    return { massKg: m ? parseFloat(m.value) : undefined, cgHeightM: g ? parseFloat(g.value) : undefined };
}
let evalSeq = 0;            // request token: ignore stale async results
let dirty3D = true;         // render-on-demand flag for the Three.js loop
const pct = v => `${v}${currentLang === "ar" ? "٪" : "%"}`;
const tl = (lang, key, params) => { const o = I18n.lang; I18n.lang = lang; const s = I18n.t(key, params); I18n.lang = o; return s; };
const placeName = (site, lang = currentLang) => lang === "ar" ? (site.regionNameAr || site.regionName) : site.regionName;
const bodyName = (b, lang = currentLang) => tl(lang, b === "mars" ? "bodyMars" : (b === "moon" ? "bodyMoon" : "bodyEarth"));
const levelWord = (lv, lang = currentLang) => tl(lang, "lv" + cap(lv));

function loadSavedLang() {
    try { const s = localStorage.getItem("terraanalog.lang"); if (s === "en" || s === "ar") return s; } catch (e) { /* storage unavailable */ }
    return "ar";
}

window.addEventListener("DOMContentLoaded", async () => {
    currentLang = loadSavedLang();
    I18n.setLang(currentLang);
    applyTranslations();
    initTripleSatelliteMaps();
    initThreeTerrainViewport();
    Voice.init();
    document.addEventListener("keydown", ev => { if (ev.key === "Escape") closeDossier(); });
    await selectAnalog("afar");
});

/* ============================== LABELS ============================== */

function siteLabel(res, lang = currentLang) {
    const k = res.labelKey || { type: "custom" };
    let base;
    const analog = res.analogId ? TerraEngine.getAnalogMeta(res.analogId) : null;
    if (k.type === "hgt") base = tl(lang, "lblHgt", { file: k.file });
    else if (k.type === "sample") base = tl(lang, "lblSampleHgt");
    else if (analog) base = lang === "ar" ? analog.nameAr : analog.nameEn;
    else if (k.type === "sat") base = tl(lang, "lblSatSel");
    else base = tl(lang, "lblCustom");
    if (res.reverseMissionTarget) {
        base += " [" + tl(lang, "lblReverseTag", { target: placeName(res.reverseMissionTarget.match, lang) }) + "]";
    }
    return base;
}

function srcTag(res) {
    return t({ LIVE_DEM: "srcLive", LIVE_SRTM: "srcLive", CACHED_SRTM: "srcCache", OFFLINE_GEODETIC: "srcOffline", LOCAL_HGT_BINARY: "srcHgt" }[res.dataSource] || "srcOffline");
}

/* ============================== STATUS ============================== */

function setStatus(kind, extra = {}) { statusState = Object.assign({ kind }, extra); renderStatus(); }

function errorKey(err) {
    const m = err && err.message;
    if (m === "OCEAN_SURFACE_ERROR") return "errOcean";
    if (m === "INVALID_HGT_FORMAT") return "errHgt";
    if (m === "INVALID_COORDINATE") return "errRange";
    return "errGeneric";
}

function renderStatus() {
    const b = document.getElementById("statusBanner");
    if (!b) return;
    const s = statusState;
    if (s.kind === "loading") { b.style.color = "#fbbf24"; b.textContent = t("msgLoading"); }
    else if (s.kind === "success") {
        b.style.color = "#6ee7b7";
        b.textContent = t("msgSuccess", { name: placeName(s.res.marsMatches[0]), score: s.res.marsMatches[0].totalScore, src: srcTag(s.res) });
    } else if (s.kind === "reverse") {
        b.style.color = "#38bdf8";
        b.textContent = t("msgReverse", { target: placeName(s.res.reverseMissionTarget.match), earth: siteLabel(s.res).split(" [")[0], score: s.res.reverseMissionTarget.score });
    } else if (s.kind === "error") { b.style.color = "#ef4444"; b.textContent = "❌ " + t(s.key); }
    else { b.style.color = ""; b.textContent = t("statusIdle"); }
}

/* ============================== MAPS ============================== */

function initTripleSatelliteMaps() {
    const mk = id => L.map(id, { zoomControl: true, attributionControl: false });
    earthMap = mk("earthMap").setView([13.50, 40.60], 10);
    earthSatLayer = L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", { maxZoom: 17 });
    earthTopoLayer = L.tileLayer("https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png", { maxZoom: 15 });
    earthSatLayer.addTo(earthMap);
    earthMarker = L.circleMarker([13.50, 40.60], { radius: 8, color: "#10b981", fillColor: "#10b981", fillOpacity: 0.45, weight: 2 }).addTo(earthMap);

    earthMap.on("click", async (e) => {
        const ll = e.latlng.wrap();           // Leaflet returns unwrapped longitudes on world copies
        const lat = Number(ll.lat.toFixed(4));
        const lon = Number(ll.lng.toFixed(4));
        document.getElementById("latInput").value = lat;
        document.getElementById("lonInput").value = lon;
        await runEvaluation(lat, lon, { type: "sat" });
    });

    marsMap = mk("marsMap").setView([18.38, 77.58], 5);
    L.tileLayer("https://cartocdn-gusc.global.ssl.fastly.net/opmbuilder/api/v1/map/named/opm-mars-basemap-v0-2/all/{z}/{x}/{y}.png", { maxZoom: 9, minZoom: 1 }).addTo(marsMap);
    marsMarker = L.circleMarker([18.38, 77.58], { radius: 8, color: "#f97316", fillColor: "#f97316", fillOpacity: 0.45, weight: 2 }).addTo(marsMap);

    moonMap = mk("moonMap").setView([-3.65, -17.47], 5);
    L.tileLayer("https://cartocdn-gusc.global.ssl.fastly.net/opmbuilder/api/v1/map/named/opm-moon-basemap-v0-1/all/{z}/{x}/{y}.png", { maxZoom: 9, minZoom: 1 }).addTo(moonMap);
    moonMarker = L.circleMarker([-3.65, -17.47], { radius: 8, color: "#38bdf8", fillColor: "#38bdf8", fillOpacity: 0.45, weight: 2 }).addTo(moonMap);

    setTimeout(() => { earthMap.invalidateSize(); marsMap.invalidateSize(); moonMap.invalidateSize(); updateLeafletUI(); }, 300);
}

function updateLeafletUI() {
    document.querySelectorAll(".leaflet-control-zoom-in").forEach(el => { el.title = t("zoomIn"); el.setAttribute("aria-label", t("zoomIn")); });
    document.querySelectorAll(".leaflet-control-zoom-out").forEach(el => { el.title = t("zoomOut"); el.setAttribute("aria-label", t("zoomOut")); });
}

function flyHud(body, zoom = 5) {
    const site = hudSites[body];
    if (!site) return;
    const map = body === "mars" ? marsMap : moonMap, marker = body === "mars" ? marsMarker : moonMarker;
    if (!map) return;
    const lat = body === "moon" ? Math.max(-85, Math.min(85, site.lat)) : site.lat;
    marker.setLatLng([lat, site.lon]);
    map.flyTo([lat, site.lon], zoom, { duration: 1.0 });
}

function refreshHudText() {
    const e = lastEvaluationResult ? lastEvaluationResult.earthSite : null;
    const _ehc = document.getElementById("earthHudCoords");
    if (e && _ehc) _ehc.textContent = `${t("hudCoord", { lat: e.lat, lon: e.lon })} | ${t("lblElev")} ${e.elevation} ${t("uM")}`;
    ["mars", "moon"].forEach(b => {
        const s = hudSites[b];
        if (!s) return;
        document.getElementById(b + "HudName").textContent = placeName(s);
        document.getElementById(b + "HudCoords").textContent = `${t("hudCoord", { lat: s.lat, lon: s.lon })} (${pct(s.totalScore)})`;
    });
}

/* ============================== EVALUATION FLOWS ============================== */

async function runEvaluation(lat, lon, labelKey = null) {
    const seq = ++evalSeq;
    setStatus("loading");
    if (!(Math.abs(lat) <= 90 && Math.abs(lon) <= 180)) { setStatus("error", { key: "errRange" }); return; }
    earthMarker.setLatLng([lat, lon]);
    earthMap.flyTo([lat, lon], 10, { duration: 1.0 });
    try {
        const res = await TerraEngine.analyzeEarthLocation(lat, lon);
        if (seq !== evalSeq) return;                       // a newer request superseded this one
        res.labelKey = labelKey || { type: "custom" };
        commitResult(res, { body: "mars", site: res.marsMatches[0] });
        setStatus("success", { res });
    } catch (err) { if (seq === evalSeq) setStatus("error", { key: errorKey(err) }); }
}

function commitResult(res, target) {
    lastEvaluationResult = res;
    selectedTarget = target;
    document.getElementById("latInput").value = res.earthSite.lat;
    document.getElementById("lonInput").value = res.earthSite.lon;
    renderAllPanels(res);
}

async function handleReverseMission(body, keyword) {
    const seq = ++evalSeq;
    setStatus("loading");
    try {
        const res = await TerraEngine.findEarthAnalogForMission(body, keyword);
        if (seq !== evalSeq) return;
        earthMarker.setLatLng([res.earthSite.lat, res.earthSite.lon]);
        earthMap.flyTo([res.earthSite.lat, res.earthSite.lon], 10, { duration: 1.1 });
        commitResult(res, { body, site: res.reverseMissionTarget.match });
        setStatus("reverse", { res });
    } catch (err) { if (seq === evalSeq) setStatus("error", { key: errorKey(err) }); }
}

async function handleManualAnalyze() {
    const lat = parseFloat(document.getElementById("latInput").value);
    const lon = parseFloat(document.getElementById("lonInput").value);
    if (isNaN(lat) || isNaN(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) { setStatus("error", { key: "errRange" }); return; }
    await runEvaluation(lat, lon, { type: "custom" });
}

async function selectAnalog(id) {
    const a = TerraEngine.getAnalogMeta(id);
    if (!a) return;
    document.getElementById("latInput").value = a.lat;
    document.getElementById("lonInput").value = a.lon;
    await runEvaluation(a.lat, a.lon, { type: "analog", id });
}

async function handleRandomEarth() {
    const seq = ++evalSeq;
    setStatus("loading");
    try {
        const res = await TerraEngine.analyzeRandomEarthLocation();
        if (seq !== evalSeq) return;
        res.labelKey = { type: "analog", id: res.analogId };
        earthMarker.setLatLng([res.earthSite.lat, res.earthSite.lon]);
        earthMap.flyTo([res.earthSite.lat, res.earthSite.lon], 9, { duration: 1.0 });
        commitResult(res, { body: "mars", site: res.marsMatches[0] });
        setStatus("success", { res });
    } catch (err) { if (seq === evalSeq) setStatus("error", { key: errorKey(err) }); }
}

function handleHgtFileUpload(event) {
    const file = event.target.files[0];
    event.target.value = "";
    if (!file) return;
    if (file.size > 30 * 1024 * 1024 || file.size % 2 !== 0) { setStatus("error", { key: "errHgt" }); return; }   // SRTM1 ≈ 25.9 MB
    evalSeq++;
    const reader = new FileReader();
    reader.onerror = () => setStatus("error", { key: "errHgt" });
    reader.onload = function (e) {
        try {
            const res = TerraEngine.parseLocalHgtArrayBuffer(e.target.result, file.name);
            res.labelKey = { type: "hgt", file: file.name };
            earthMarker.setLatLng([res.earthSite.lat, res.earthSite.lon]);
            earthMap.flyTo([res.earthSite.lat, res.earthSite.lon], 10, { duration: 1.0 });
            commitResult(res, { body: "mars", site: res.marsMatches[0] });
            setStatus("success", { res });
        } catch (err) { setStatus("error", { key: errorKey(err) === "errGeneric" ? "errHgt" : errorKey(err) }); }
    };
    reader.readAsArrayBuffer(file);
}

function runBuiltInSampleHgt() {
    const side = 121;
    const buffer = new ArrayBuffer(side * side * 2);
    const view = new DataView(buffer);
    for (let r = 0; r < side; r++) {
        for (let c = 0; c < side; c++) {
            const nx = (c - side / 2) / (side / 2);
            const ny = (r - side / 2) / (side / 2);
            const dist = Math.sqrt(nx * nx + ny * ny);
            const cone = 480 * Math.exp(-dist * dist * 4.5);
            const rift = -140 * Math.exp(-(nx * nx) * 12.0);
            const rough = 18 * Math.sin(c * 0.45) * Math.cos(r * 0.45) + 9 * Math.sin(c * 1.1 + r * 0.9);
            view.setInt16((r * side + c) * 2, Math.round(120 + cone + rift + rough), false);
        }
    }
    const res = TerraEngine.parseLocalHgtArrayBuffer(buffer, "N13E040.hgt");
    res.labelKey = { type: "sample" };
    earthMarker.setLatLng([res.earthSite.lat, res.earthSite.lon]);
    earthMap.flyTo([res.earthSite.lat, res.earthSite.lon], 10, { duration: 1.0 });
    commitResult(res, { body: "mars", site: res.marsMatches[0] });
    setStatus("success", { res });
}

/* ============================== RENDERING ============================== */

// Full render (new analysis): maps, 3D mesh and all text panels
function renderAllPanels(res) {
    const e = res.earthSite;
    hudSites.mars = res.marsMatches[0];
    hudSites.moon = res.moonMatches[0];
    if (selectedTarget) hudSites[selectedTarget.body] = selectedTarget.site;
    flyHud("mars");
    flyHud("moon");
    meshInfo = { kind: "earth", slope: e.slope, relief: e.relief };
    renderRealDEMMesh(e.demGrid, e.slope, e.relief, "earth");
    renderTextPanels();
}

// Language-dependent text only (no map flights, no mesh rebuild) — used on language switch too
function renderTextPanels() {
    const res = lastEvaluationResult;
    renderStatus();
    renderMeshBadge();
    if (!res) return;
    const e = res.earthSite;
    document.getElementById("siteTitle").textContent = `📍 ${siteLabel(res)} (${e.lat}°, ${e.lon}°)`;
    document.getElementById("valElev").textContent = `${e.elevation} ${t("uM")}`;
    document.getElementById("valSlope").textContent = `${e.slope}° (${pct(e.slope_pct)})`;
    document.getElementById("valRough").textContent = `${e.roughness} ${t("uM")} (${pct(e.roughness_pct)})`;
    document.getElementById("valRelief").textContent = `${e.relief} ${t("uM")} (${pct(e.relief_pct)})`;
    refreshHudText();
    renderAnalogList(res.marsMatches, "marsList", true);
    renderAnalogList(res.moonMatches, "moonList", false);
    drawElevationProfileChart(res);
    renderTargetDependent();
    updatePhysicsSimulator();
}

function renderMeshBadge() {
    const el = document.getElementById("meshBadgeText");
    if (!el) return;
    if (!meshInfo || !lastEvaluationResult) { el.textContent = t("demReady"); return; }
    el.textContent = meshInfo.kind === "earth"
        ? t("demBadgeEarth", { name: siteLabel(lastEvaluationResult).split(" [")[0], slope: meshInfo.slope, relief: meshInfo.relief })
        : t("demBadgeOrbital", { name: placeName(meshInfo.site), slope: meshInfo.slope, relief: meshInfo.relief });
}

// Everything that depends on the selected planetary target
function renderTargetDependent() {
    if (!lastEvaluationResult || !selectedTarget) return;
    drawRadarChart();
    renderHardwareMatrix();
    renderDeltaTable();
    if (document.getElementById("dossierModal") && !document.getElementById("dossierModal").hidden) buildDossier();
}

function drawElevationProfileChart(res) {
    const canvas = document.getElementById("profileChartCanvas");
    if (!canvas || !res) return;
    const ctx = canvas.getContext("2d");
    const w = canvas.width = canvas.clientWidth || 460;
    const h = canvas.height = canvas.clientHeight || 120;
    const rtl = I18n.isRTL();
    ctx.clearRect(0, 0, w, h);
    ctx.strokeStyle = "rgba(148, 163, 184, 0.12)";
    ctx.lineWidth = 1;
    for (let y = 20; y < h; y += 25) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }

    const midRow = g => (g && g.length) ? g[g.length >> 1] : null;   // middle row (HGT window is 48 rows; row 4 is the northern edge)
    const earthRow = midRow(res.earthSite.demGrid) || [0, 0];
    const marsRow = midRow(res.marsMatches[0] && res.marsMatches[0].demGrid) || [0, 0];
    const moonRow = midRow(res.moonMatches[0] && res.moonMatches[0].demGrid) || [0, 0];

    function plot(row, color, label, slot) {
        const minV = Math.min(...row), maxV = Math.max(...row), span = Math.max(1, maxV - minV);
        ctx.strokeStyle = color;
        ctx.lineWidth = 2.4;
        ctx.beginPath();
        row.forEach((val, idx) => {
            const frac = idx / (row.length - 1);
            const x = 18 + (rtl ? 1 - frac : frac) * (w - 36);
            const y = (h - 22) - ((val - minV) / span) * (h - 46);
            if (idx === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        });
        ctx.stroke();
        ctx.fillStyle = color;
        ctx.font = "bold 11px Cairo, JetBrains Mono, monospace";
        ctx.direction = rtl ? "rtl" : "ltr";
        ctx.textAlign = rtl ? "right" : "left";
        ctx.fillText(label, rtl ? w - 12 - slot * (w / 3) : 12 + slot * (w / 3), 14);
    }
    const d = t("chDelta"), m = t("uM");
    plot(earthRow, "#10b981", `${t("chEarth")} (${d} ${res.earthSite.relief} ${m})`, 0);
    plot(marsRow, "#f97316", `${t("chMars")} (${d} ${res.marsMatches[0].metrics.relief} ${m})`, 1);
    plot(moonRow, "#38bdf8", `${t("chMoon")} (${d} ${res.moonMatches[0].metrics.relief} ${m})`, 2);
}

function renderAnalogList(matches, containerId, isMars) {
    const container = document.getElementById(containerId);
    const pillClass = isMars ? "score-pill-mars" : "score-pill-moon";
    const fillClass = isMars ? "sim-fill-mars" : "sim-fill-moon";
    const bodyMode = isMars ? "mars" : "moon";
    const row = (label, v) => `
            <div class="sim-row">
                <div class="sim-labels"><span>${label}</span><span class="mono-num">${pct(v)}</span></div>
                <div class="sim-track"><div class="${fillClass}" style="width:${v}%"></div></div>
            </div>`;
    container.innerHTML = matches.map((m, idx) => {
        const active = selectedTarget && selectedTarget.site === m;
        const meta = TerraEngine.getSiteMeta(m.regionKey);
        const desc = meta ? (currentLang === "ar" ? meta.descAr : meta.descEn) : "";
        return `
        <div class="analog-item ${active ? "active-match" : ""}" onclick="focusPlanetarySite('${bodyMode}', ${idx})">
            <div class="analog-top">
                <strong>#${idx + 1} — ${placeName(m)}</strong>
                <span class="${pillClass}">${pct(m.totalScore)} ${t("matchWord")}</span>
            </div>
            <div class="analog-desc">${desc}</div>
            <div class="analog-meta">${t("metaLine", { lat: m.lat, lon: m.lon, slope: m.metrics.slope, rough: m.metrics.roughness, relief: m.metrics.relief })}</div>
            ${row(t("simSlope"), m.slopeScore)}${row(t("simRough"), m.roughnessScore)}${row(t("simRelief"), m.reliefScore)}${row(t("simCurv"), m.curvatureScore)}
        </div>`;
    }).join("");
}

function focusPlanetarySite(bodyMode, matchIdx) {
    if (!lastEvaluationResult) return;
    const item = bodyMode === "mars" ? lastEvaluationResult.marsMatches[matchIdx] : lastEvaluationResult.moonMatches[matchIdx];
    if (!item) return;
    selectedTarget = { body: bodyMode, site: item };
    hudSites[bodyMode] = item;
    flyHud(bodyMode, 6);
    meshInfo = { kind: "orbital", site: item, slope: item.metrics.slope, relief: item.metrics.relief };
    renderRealDEMMesh(item.demGrid, item.metrics.slope, item.metrics.relief, bodyMode);
    renderMeshBadge();
    refreshHudText();
    renderAnalogList(lastEvaluationResult.marsMatches, "marsList", true);
    renderAnalogList(lastEvaluationResult.moonMatches, "moonList", false);
    renderTargetDependent();
}

/* ---------- Similarity radar ---------- */
function drawRadarChart() {
    const canvas = document.getElementById("radarCanvas");
    if (!canvas || !selectedTarget) return;
    const res = lastEvaluationResult;
    const ctx = canvas.getContext("2d");
    const W = canvas.width, H = canvas.height, cx = W / 2, cy = H / 2 + 6, R = Math.min(W, H) / 2 - 46;
    const rtl = I18n.isRTL();
    ctx.clearRect(0, 0, W, H);
    const axes = [["axSlope", "slopeScore"], ["axRough", "roughnessScore"], ["axRelief", "reliefScore"], ["axCurv", "curvatureScore"]];
    const ang = i => -Math.PI / 2 + (i * 2 * Math.PI) / axes.length;
    ctx.strokeStyle = "rgba(148,163,184,0.22)";
    ctx.lineWidth = 1;
    for (let ring = 1; ring <= 4; ring++) {
        ctx.beginPath();
        axes.forEach((_, i) => { const x = cx + Math.cos(ang(i)) * R * ring / 4, y = cy + Math.sin(ang(i)) * R * ring / 4; i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); });
        ctx.closePath(); ctx.stroke();
    }
    ctx.font = "bold 12px Cairo, sans-serif";
    ctx.fillStyle = "#cbd5e1";
    ctx.direction = rtl ? "rtl" : "ltr";
    axes.forEach(([k], i) => {
        ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(ang(i)) * R, cy + Math.sin(ang(i)) * R); ctx.stroke();
        const lx = cx + Math.cos(ang(i)) * (R + 24), ly = cy + Math.sin(ang(i)) * (R + 18) + 4;
        ctx.textAlign = "center";
        ctx.fillText(t(k), lx, ly);
    });
    const other = selectedTarget.body === "mars" ? { body: "moon", site: res.moonMatches[0] } : { body: "mars", site: res.marsMatches[0] };
    const colorOf = b => b === "mars" ? "#f97316" : "#38bdf8";
    const poly = (site, color, alpha, lw) => {
        ctx.beginPath();
        axes.forEach(([, key], i) => { const v = site[key] / 100, x = cx + Math.cos(ang(i)) * R * v, y = cy + Math.sin(ang(i)) * R * v; i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); });
        ctx.closePath();
        ctx.fillStyle = color + alpha; ctx.fill();
        ctx.strokeStyle = color; ctx.lineWidth = lw; ctx.stroke();
    };
    poly(other.site, colorOf(other.body), "22", 1.5);
    poly(selectedTarget.site, colorOf(selectedTarget.body), "55", 2.6);
    const lg = document.getElementById("radarLegend");
    const entry = (tg, strong) => `<div class="legend-row ${strong ? "legend-strong" : ""}"><i style="background:${colorOf(tg.body)}"></i><span>${bodyName(tg.body)} — ${placeName(tg.site)}</span><b class="mono-num">${pct(tg.site.totalScore)}</b></div>`;
    lg.innerHTML = `<div class="legend-badge">${t("selectedBadge")}</div>${entry(selectedTarget, true)}${entry(other, false)}`;
}

/* ---------- Hardware readiness matrix ---------- */
function hardwareReason(item) {
    const v = item.vals;
    const key = "r" + cap(item.id) + cap(item.level);
    if (item.id === "mobility") return t(key, v);
    if (item.id === "thermal") return t(key, { eMin: v.eMin, eMax: v.eMax, tMin: v.tMin, tMax: v.tMax }) + (v.est ? " " + t("rThermalEst") : "");
    const rest = v.targetTags.filter(x => !v.shared.includes(x));
    return t(key, { shared: I18n.tags(v.shared), targetTags: I18n.tags(item.level === "good" ? rest : v.targetTags) }) + (v.known ? "" : " " + t("rIsruUnknown"));
}

function renderHardwareMatrix() {
    const res = lastEvaluationResult;
    const hw = TerraEngine.evaluateHardware(res, selectedTarget, currentRover());
    const names = { mobility: "hwMobility", thermal: "hwThermal", isru: "hwIsru" };
    const icons = { mobility: "🛞", thermal: "🧑‍🚀", isru: "⛏️" };
    document.getElementById("hwGrid").innerHTML = hw.items.map(it => `
        <div class="hw-card hw-${it.level}">
            <div class="hw-head"><span class="hw-icon">${icons[it.id]}</span><strong>${t(names[it.id])}</strong></div>
            <div class="hw-score"><span class="mono-num">${pct(it.score)}</span><em class="hw-badge">${levelWord(it.level)}</em></div>
            <div class="sim-track"><div class="hw-fill" style="width:${it.score}%"></div></div>
            <p>${hardwareReason(it)}</p>
        </div>`).join("");
    document.getElementById("overallTag").textContent = `${t("hwOverall")}: ${pct(hw.overall)}`;
    document.getElementById("matrixSub").textContent = t("matrixSub", { earth: siteLabel(res).split(" [")[0], target: placeName(selectedTarget.site), body: bodyName(selectedTarget.body) });
    return hw;
}

function fmtVal(v) { return (v !== 0 && Math.abs(v) < 0.001) ? v.toExponential(1) : v; }

function renderDeltaTable() {
    const rows = TerraEngine.environmentDeltas(lastEvaluationResult, selectedTarget);
    document.getElementById("deltaBody").innerHTML = rows.map(r => {
        const u = I18n.unit(r.unit);
        const sign = r.delta > 0 ? "+" : "";
        return `<tr><td>${t("dm_" + r.key)}</td><td class="mono-num">${fmtVal(r.earth)} ${u}</td><td class="mono-num">${fmtVal(r.target)} ${u}</td><td class="mono-num delta-${r.delta > 0 ? "up" : (r.delta < 0 ? "down" : "flat")}">${sign}${fmtVal(r.delta)} ${u}</td></tr>`;
    }).join("");
}

/* ---------- Presets ---------- */
function renderPresetPills() {
    const box = document.getElementById("presetPills");
    if (!box) return;
    box.innerHTML = TerraEngine.getDB().earth_analogs.map(a => {
        const full = currentLang === "ar" ? a.nameAr : a.nameEn;
        const short = full.split(" - ")[0].replace(/\s*\(N\d+E\d+\)/, "");
        return `<button class="preset-pill" title="${full}" onclick="selectAnalog('${a.id}')">${short}</button>`;
    }).join("");
}

/* ============================== PHYSICS LAB ============================== */

function updatePhysicsSimulator() {
    const mass = parseFloat(document.getElementById("roverMassRange").value);
    const cg = parseFloat(document.getElementById("roverCgRange").value);
    document.getElementById("roverMassVal").textContent = `${mass} ${t("uKg")}`;
    document.getElementById("roverCgVal").textContent = `${cg} ${t("uM")}`;
    const slope = lastEvaluationResult ? lastEvaluationResult.earthSite.slope : 6.5;
    const rough = lastEvaluationResult ? lastEvaluationResult.earthSite.roughness : 18.0;
    const simData = TerraEngine.calculateRoverPhysics(slope, rough, mass, cg, 2.7);
    document.getElementById("physicsTableBody").innerHTML = simData.map(d => `
            <tr>
                <td style="font-weight:700;">${bodyName(d.bodyId)}</td>
                <td class="mono-num">${d.gravity} ${t("uMs2")}</td>
                <td class="mono-num">${d.weightN} ${t("uN")}</td>
                <td class="mono-num">${d.effectiveTiltDeg}° / ${d.criticalAngleDeg}°</td>
                <td style="color:${d.stabilityScore > 45 ? "#10b981" : "#f59e0b"}; font-weight:700;">
                    <span class="mono-num">${pct(d.stabilityScore)}</span> — ${t({ safe: "stSafe", caution: "stCaution", critical: "stCritical" }[d.statusKey])}
                </td>
            </tr>`).join("");
    drawRoverTiltCanvas(slope, simData);
    if (lastEvaluationResult && selectedTarget) renderHardwareMatrix();   // mobility score depends on the rover CG
}

function drawRoverTiltCanvas(slopeDeg, simData) {
    const canvas = document.getElementById("gravitySimCanvas");
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const w = canvas.width = canvas.clientWidth || 500;
    const h = canvas.height = canvas.clientHeight || 230;
    ctx.clearRect(0, 0, w, h);
    const rad = (Math.min(35, slopeDeg) * Math.PI) / 180;
    ctx.save();
    ctx.translate(w * 0.30, h * 0.70);
    ctx.rotate(-rad);
    ctx.strokeStyle = "#10b981"; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(-130, 0); ctx.lineTo(150, 0); ctx.stroke();
    ctx.fillStyle = "#38bdf8"; ctx.fillRect(-42, -36, 84, 22);
    ctx.fillStyle = "#f97316";
    ctx.beginPath(); ctx.arc(-30, -10, 9, 0, Math.PI * 2); ctx.arc(0, -10, 9, 0, Math.PI * 2); ctx.arc(30, -10, 9, 0, Math.PI * 2); ctx.fill();
    ctx.restore();

    const startX = w * 0.58;
    const colors = ["#10b981", "#f97316", "#38bdf8"];
    ctx.direction = I18n.isRTL() ? "rtl" : "ltr";
    ctx.textAlign = "left";
    simData.forEach((item, i) => {
        const x = startX + i * 62;
        const barH = (item.gravity / 9.81) * 120;
        ctx.fillStyle = colors[i];
        ctx.fillRect(x, h - 34 - barH, 32, barH);
        ctx.fillStyle = "#e2e8f0";
        ctx.font = "bold 11px Cairo, JetBrains Mono, monospace";
        ctx.fillText(`${item.gravity}`, x, h - 40 - barH);
        ctx.fillText(bodyName(item.bodyId), x, h - 15);
    });
}

/* ============================== EXPORTS ============================== */

function exportReportData(format = "json") {
    if (!lastEvaluationResult) return;
    const e = lastEvaluationResult.earthSite;
    const download = (blob, name) => {
        const url = URL.createObjectURL(blob), a = document.createElement("a");
        a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);          // was leaking one blob per export
    };
    const q = s => '"' + String(s).replace(/"/g, '""') + '"';
    if (format === "json") {
        download(new Blob([JSON.stringify(lastEvaluationResult, null, 2)], { type: "application/json" }), `TerraAnalog_${e.lat}_${e.lon}.json`);
    } else {
        let csv = "Body,Region,Lat,Lon,MatchScorePct,SlopeDeg,RoughnessM,ReliefM,DataSource\n";
        csv += `Earth,${q(siteLabel(lastEvaluationResult, "en"))},${e.lat},${e.lon},100,${e.slope},${e.roughness},${e.relief},${lastEvaluationResult.dataSource || ""}\n`;
        lastEvaluationResult.marsMatches.forEach(m => { csv += `Mars,${q(m.regionName)},${m.lat},${m.lon},${m.totalScore},${m.metrics.slope},${m.metrics.roughness},${m.metrics.relief},catalog\n`; });
        lastEvaluationResult.moonMatches.forEach(m => { csv += `Moon,${q(m.regionName)},${m.lat},${m.lon},${m.totalScore},${m.metrics.slope},${m.metrics.roughness},${m.metrics.relief},catalog\n`; });
        download(new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8;" }), `TerraAnalog_${e.lat}_${e.lon}.csv`);
    }
}

/* ============================== MISSION DOSSIER ============================== */

function openDossier() {
    const modal = document.getElementById("dossierModal");
    buildDossier();
    modal.hidden = false;
    document.body.classList.add("modal-open");
}

function closeDossier() {
    const modal = document.getElementById("dossierModal");
    if (modal) modal.hidden = true;
    document.body.classList.remove("modal-open");
}

function buildDossier() {
    const box = document.getElementById("dossierContent");
    if (!lastEvaluationResult || !selectedTarget) { box.innerHTML = `<p class="dos-empty">${t("dosNoData")}</p>`; return; }
    const res = lastEvaluationResult, e = res.earthSite, tg = selectedTarget.site;
    const hw = TerraEngine.evaluateHardware(res, selectedTarget, currentRover());
    const deltas = TerraEngine.environmentDeltas(res, selectedTarget);
    const analog = res.analogId ? TerraEngine.getAnalogMeta(res.analogId) : null;
    const meta = TerraEngine.getSiteMeta(tg.regionKey);
    const env = TerraEngine.earthEnvironment(res);
    const date = new Date().toLocaleDateString(currentLang === "ar" ? "ar-EG-u-nu-latn" : "en-GB", { year: "numeric", month: "long", day: "numeric" });
    const names = { mobility: "hwMobility", thermal: "hwThermal", isru: "hwIsru" };
    const kv = (k, v) => `<div class="dos-kv"><span>${k}</span><b>${v}</b></div>`;
    const sub = (label, v) => `<div class="dos-sub"><span>${label}</span><b class="mono-num">${pct(v)}</b></div>`;
    box.innerHTML = `
        <div class="dos-head">
            <div class="brand-emblem">TA</div>
            <div><h2 id="dossierTitleText">${t("dosTitle")}</h2><p>${t("dosSub")}</p><small>${t("dosGenerated", { date })}</small></div>
        </div>
        <div class="dos-score">
            <div class="dos-score-ring"><b class="mono-num">${pct(tg.totalScore)}</b><span>${t("dosScore")}</span></div>
            <div class="dos-subs">
                <div class="dos-sub-title">${t("dosSubScores")}</div>
                ${sub(t("simSlope"), tg.slopeScore)}${sub(t("simRough"), tg.roughnessScore)}${sub(t("simRelief"), tg.reliefScore)}${sub(t("simCurv"), tg.curvatureScore)}
            </div>
        </div>
        <div class="dos-cols">
            <section>
                <h3>🌍 ${t("dosEarth")}</h3>
                <div class="dos-name">${esc(siteLabel(res))}</div>
                ${kv(t("dosCoords"), `<span class="mono-num">${e.lat}°, ${e.lon}°</span>`)}
                ${kv(t("dosElev"), `${e.elevation} ${t("uM")}`)}
                ${kv(t("lblSlope"), `${e.slope}°`)}
                ${kv(t("lblRough"), `${e.roughness} ${t("uM")}`)}
                ${kv(t("lblRelief"), `${e.relief} ${t("uM")}`)}
                ${kv(t("dosSoil"), I18n.tags(env.soilTags))}
                ${analog ? `<p class="dos-desc">${currentLang === "ar" ? analog.descAr : analog.descEn}</p>` : ""}
            </section>
            <section>
                <h3>${selectedTarget.body === "mars" ? "🔴" : "🌕"} ${t("dosTarget")}</h3>
                <div class="dos-name">${placeName(tg)}</div>
                ${kv(t("dosBody"), bodyName(selectedTarget.body))}
                ${kv(t("dosCoords"), `<span class="mono-num">${tg.lat}°, ${tg.lon}°</span>`)}
                ${kv(t("lblSlope"), `${tg.metrics.slope}°`)}
                ${kv(t("lblRough"), `${tg.metrics.roughness} ${t("uM")}`)}
                ${kv(t("lblRelief"), `${tg.metrics.relief} ${t("uM")}`)}
                ${meta ? kv(t("dosSoil"), I18n.tags(meta.soilTags)) : ""}
                ${meta ? `<p class="dos-desc">${currentLang === "ar" ? meta.descAr : meta.descEn}</p>` : ""}
            </section>
        </div>
        <h3>${t("dosDeltas")}</h3>
        <table class="physics-table dos-table">
            <thead><tr><th>${t("dltMetric")}</th><th>${t("dltEarth")}</th><th>${t("dltTarget")}</th><th>${t("dltDelta")}</th></tr></thead>
            <tbody>${deltas.map(r => { const u = I18n.unit(r.unit); return `<tr><td>${t("dm_" + r.key)}</td><td class="mono-num">${fmtVal(r.earth)} ${u}</td><td class="mono-num">${fmtVal(r.target)} ${u}</td><td class="mono-num">${r.delta > 0 ? "+" : ""}${fmtVal(r.delta)} ${u}</td></tr>`; }).join("")}</tbody>
        </table>
        <h3>🛠️ ${t("dosHardware")} — ${t("hwOverall")}: ${pct(hw.overall)}</h3>
        <div class="dos-hw">${hw.items.map(it => `<div class="dos-hw-item hw-${it.level}"><div><strong>${t(names[it.id])}</strong><b class="mono-num">${pct(it.score)} · ${levelWord(it.level)}</b></div><p>${hardwareReason(it)}</p></div>`).join("")}</div>
        <p class="dos-foot">${t("dltNote")}<br>${t("dosFooter")}</p>`;
}

/* ============================== LANGUAGE ============================== */

function applyTranslations() {
    I18n.setLang(currentLang);
    document.documentElement.lang = currentLang;
    document.documentElement.dir = currentLang === "ar" ? "rtl" : "ltr";
    document.title = t("appTitle");
    document.querySelectorAll("[data-i18n]").forEach(el => { el.textContent = t(el.getAttribute("data-i18n")); });
    document.querySelectorAll("[data-i18n-ph]").forEach(el => { el.placeholder = t(el.getAttribute("data-i18n-ph")); });
    document.querySelectorAll("[data-i18n-title]").forEach(el => { el.title = t(el.getAttribute("data-i18n-title")); });
    if (window.TerraEngine) renderPresetPills();
    updateLeafletUI();
    renderTextPanels();
    updatePhysicsSimulator();
    Voice.renderUI();
}

function toggleLanguage() {
    currentLang = currentLang === "ar" ? "en" : "ar";
    try { localStorage.setItem("terraanalog.lang", currentLang); } catch (e) { /* ignore */ }
    applyTranslations();
    Voice.onLanguageChange();
    const modal = document.getElementById("dossierModal");
    if (modal && !modal.hidden) buildDossier();
}

/* ============================== VOICE BRIEFING + GUIDED TOUR ============================== */

const TOUR_TARGETS = { hero: "sec-hero", selector: "sec-selector", metrics: "sec-metrics", hardware: "sec-hardware" };

const Voice = {
    state: "idle",          // idle | playing | paused | done
    queue: [],
    i: 0,
    token: 0,
    voice: null,
    supported: ("speechSynthesis" in window) && ("SpeechSynthesisUtterance" in window),

    init() {
        if (!this.supported) { this.renderUI(); return; }
        this.voice = this.pickVoice(currentLang);
        const refresh = () => { this.voice = this.pickVoice(currentLang); this.renderUI(); };
        if (typeof speechSynthesis.addEventListener === "function") speechSynthesis.addEventListener("voiceschanged", refresh);
        else speechSynthesis.onvoiceschanged = refresh;
        window.addEventListener("beforeunload", () => speechSynthesis.cancel());
        this.renderUI();
    },

    // Intelligent voice selection: en-US/en-GB for English, ar-EG/ar-SA for Arabic; prefer natural/neural voices
    pickVoice(lang) {
        if (!this.supported) return null;
        const prefs = lang === "ar" ? ["ar-eg", "ar-sa"] : ["en-us", "en-gb"];
        let best = null, bestScore = -1;
        speechSynthesis.getVoices().forEach(v => {
            const l = (v.lang || "").replace("_", "-").toLowerCase();
            let s;
            const pi = prefs.indexOf(l);
            if (pi >= 0) s = 100 - pi * 10;
            else if (l.startsWith(lang)) s = 50;
            else return;
            if (/natural|neural|online|google|premium|enhanced|siri/i.test(v.name)) s += 20;
            if (v.localService) s += 2;
            if (s > bestScore) { best = v; bestScore = s; }
        });
        return best;
    },

    buildScript() {
        const out = [];
        out.push({ section: "hero", text: t("bf_hero") });
        out.push({ section: "selector", text: t("bf_selector") });
        const res = lastEvaluationResult;
        if (res && selectedTarget) {
            const e = res.earthSite, tg = selectedTarget.site;
            const hw = TerraEngine.evaluateHardware(res, selectedTarget, currentRover());
            const byId = id => hw.items.find(x => x.id === id);
            out.push({
                section: "metrics",
                text: t("bf_metrics", {
                    earth: siteLabel(res).split(" [")[0], lat: Math.abs(e.lat), ns: t(e.lat >= 0 ? "dirN" : "dirS"),
                    lon: Math.abs(e.lon), ew: t(e.lon >= 0 ? "dirE" : "dirW"), slope: e.slope, rough: e.roughness, relief: e.relief,
                    target: placeName(tg), body: bodyName(selectedTarget.body), score: tg.totalScore,
                    s1: tg.slopeScore, s2: tg.roughnessScore, s3: tg.reliefScore
                })
            });
            out.push({
                section: "hardware",
                text: t("bf_hardware", {
                    m: byId("mobility").score, mLv: levelWord(byId("mobility").level), t: byId("thermal").score, tLv: levelWord(byId("thermal").level),
                    i: byId("isru").score, iLv: levelWord(byId("isru").level), o: hw.overall
                })
            });
        } else {
            out.push({ section: "metrics", text: t("bf_noData") });
        }
        out.push({ section: "hardware", text: t("bf_close") });
        // split into short chunks (long utterances are cut off by several browsers)
        const chunks = [];
        out.forEach(seg => {
            const sentences = seg.text.match(/(?:[^.!?؟]|\.(?=\d))+[.!?؟]?/g) || [seg.text];   // keeps "6.5" intact
            let buf = "";
            sentences.forEach(s => {
                if ((buf + s).length > 200 && buf) { chunks.push({ section: seg.section, text: buf.trim() }); buf = ""; }
                buf += s;
            });
            if (buf.trim()) chunks.push({ section: seg.section, text: buf.trim() });
        });
        return chunks;
    },

    start() {
        if (!this.supported) return;
        this.token++;
        speechSynthesis.cancel();
        this.voice = this.pickVoice(currentLang);
        this.queue = this.buildScript();
        this.i = 0;
        this.state = "playing";
        this.renderUI();
        setTimeout(() => this.speakNext(), 80);
    },

    speakNext() {
        if (this.state !== "playing") return;
        if (this.i >= this.queue.length) { this.finish(); return; }
        const chunk = this.queue[this.i];
        const tok = ++this.token;
        const u = new SpeechSynthesisUtterance(chunk.text);
        if (this.voice) { u.voice = this.voice; u.lang = this.voice.lang; }
        else u.lang = currentLang === "ar" ? "ar-SA" : "en-US";
        u.rate = currentLang === "ar" ? 0.92 : 0.97;
        u.pitch = 1;
        u.onstart = () => { if (tok === this.token) this.highlight(chunk.section); };
        u.onend = () => { if (tok === this.token && this.state === "playing") { this.i++; this.speakNext(); } };
        u.onerror = (ev) => {
            if (tok !== this.token) return;
            if (ev.error === "interrupted" || ev.error === "canceled") return;
            if (this.state === "playing") { this.i++; this.speakNext(); }
        };
        this.current = u;           // strong reference: Chrome may GC the utterance before onend fires
        speechSynthesis.speak(u);
    },

    pause() {
        if (this.state !== "playing") return;
        this.state = "paused";
        this.token++;
        speechSynthesis.cancel();   // resume restarts the current sentence (reliable across browsers)
        this.renderUI();
    },

    resume() {
        if (this.state !== "paused") return;
        this.state = "playing";
        this.renderUI();
        setTimeout(() => this.speakNext(), 60);
    },

    stop() {
        this.token++;
        if (this.supported) speechSynthesis.cancel();
        this.state = "idle";
        this.i = 0;
        this.clearHighlight();
        this.renderUI();
    },

    finish() {
        this.state = "done";
        this.clearHighlight();
        this.renderUI();
    },

    toggle() {
        if (!this.supported) return;
        if (this.state === "playing") this.pause();
        else if (this.state === "paused") this.resume();
        else this.start();
    },

    // Auto-sync: switch engine voice + script language immediately
    onLanguageChange() {
        if (!this.supported) return;
        const was = this.state;
        this.token++;
        speechSynthesis.cancel();
        this.voice = this.pickVoice(currentLang);
        if (was === "playing") {
            this.queue = this.buildScript();
            this.i = 0;
            this.state = "playing";
            this.renderUI();
            setTimeout(() => this.speakNext(), 120);
        } else if (was === "paused") {
            this.queue = this.buildScript();
            this.i = 0;
            this.renderUI();
        } else {
            this.renderUI();
        }
    },

    highlight(section) {
        this.clearHighlight();
        const el = document.getElementById(TOUR_TARGETS[section]);
        if (!el) return;
        el.classList.add("tour-active");
        const reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        el.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
    },

    clearHighlight() { document.querySelectorAll(".tour-active").forEach(el => el.classList.remove("tour-active")); },

    renderUI() {
        const play = document.getElementById("voicePlayBtn");
        if (!play) return;
        const stop = document.getElementById("voiceStopBtn");
        const wave = document.getElementById("voiceWave");
        const status = document.getElementById("voiceStatus");
        const bar = document.getElementById("voiceBar");
        if (!this.supported) {
            play.disabled = true; stop.disabled = true;
            play.textContent = t("voicePlay");
            status.textContent = t("voiceUnsupported");
            return;
        }
        play.textContent = this.state === "playing" ? t("voicePause") : (this.state === "paused" ? t("voiceResume") : t("voicePlay"));
        stop.disabled = (this.state === "idle");
        wave.classList.toggle("active", this.state === "playing");
        bar.classList.toggle("is-playing", this.state === "playing");
        const msg = { idle: "voiceIdle", playing: "voicePlaying", paused: "voicePaused", done: "voiceDone" }[this.state];
        const engine = this.voice ? t("voiceEngine", { name: this.voice.name }) : t("voiceNoVoice");
        status.textContent = `${t(msg)} · ${engine}`;
    }
};

/* ============================== 3D TERRAIN & MAP HELPERS (carried over from v4) ============================== */

// Initialize Three.js Real DEM Heightmap Renderer with Interactive Mouse Drag & Wheel Zoom
function initThreeTerrainViewport() {
    const container = document.getElementById("terrain3DCanvas");
    if (!window.THREE || !container) return;

    const w = container.clientWidth || 520;
    const h = container.clientHeight || 360;

    threeScene = new THREE.Scene();
    threeCamera = new THREE.PerspectiveCamera(42, w / h, 0.1, 1000);
    updateCameraPosition();

    threeRenderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    threeRenderer.setSize(w, h);
    threeRenderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.insertBefore(threeRenderer.domElement, container.firstChild);

    threeScene.add(new THREE.AmbientLight(0xcbd5e1, 0.88));
    const sun = new THREE.DirectionalLight(0xffffff, 1.4);
    sun.position.set(30, 55, 35);
    threeScene.add(sun);

    const rim = new THREE.DirectionalLight(0x38bdf8, 0.65);
    rim.position.set(-30, 20, -25);
    threeScene.add(rim);

    // Mouse / Touch Interactive Orbit & Zoom Controls
    container.addEventListener("pointerdown", (e) => {
        isDragging3D = true;
        prevMouse = { x: e.clientX, y: e.clientY };
        try { container.setPointerCapture(e.pointerId); } catch (_) { /* unsupported */ }
    });

    window.addEventListener("pointermove", (e) => {
        if (!isDragging3D || !terrainMesh) return;
        const dx = e.clientX - prevMouse.x;
        const dy = e.clientY - prevMouse.y;
        prevMouse = { x: e.clientX, y: e.clientY };
        meshRotZ += dx * 0.008;
        meshTiltX = Math.max(-Math.PI / 1.65, Math.min(-Math.PI / 3.6, meshTiltX + dy * 0.006));
        terrainMesh.rotation.z = meshRotZ;
        terrainMesh.rotation.x = meshTiltX;
        dirty3D = true;
    });

    const endDrag = () => { isDragging3D = false; };
    window.addEventListener("pointerup", endDrag);
    window.addEventListener("pointercancel", endDrag);

    container.addEventListener("wheel", (e) => {
        e.preventDefault();
        camDist = Math.max(24, Math.min(78, camDist + e.deltaY * 0.03));
        updateCameraPosition();
        dirty3D = true;
    }, { passive: false });

    function animate() {
        requestAnimationFrame(animate);
        if (document.hidden) return;
        const spinning = terrainMesh && autoSpin3D && !isDragging3D;
        if (spinning) { meshRotZ += 0.0028; terrainMesh.rotation.z = meshRotZ; }
        if (spinning || dirty3D) { threeRenderer.render(threeScene, threeCamera); dirty3D = false; }   // idle = zero GPU work
    }
    animate();

    window.addEventListener("resize", () => {
        if (!container || !threeRenderer) return;
        const nw = container.clientWidth;
        const nh = container.clientHeight;
        if (!nw || !nh) return;
        dirty3D = true;
        threeCamera.aspect = nw / nh;
        threeCamera.updateProjectionMatrix();
        threeRenderer.setSize(nw, nh);
        if (lastEvaluationResult) drawElevationProfileChart(lastEvaluationResult);
    });
}

function updateCameraPosition() {
    if (!threeCamera) return;
    threeCamera.position.set(0, camDist * 0.75, camDist);
    threeCamera.lookAt(0, 0, 0);
}

function toggleAutoSpin3D() {
    autoSpin3D = !autoSpin3D;
}

function renderRealDEMMesh(demGrid, slopeDeg, reliefM, tintMode = "earth") {
    if (!threeScene) return;
    if (terrainMesh) {
        threeScene.remove(terrainMesh);
        terrainMesh.geometry.dispose();
        terrainMesh.material.dispose();
    }

    const segs = 46;
    const geom = new THREE.PlaneGeometry(40, 40, segs, segs);
    const pos = geom.attributes.position;
    const colors = [];

    let flat = [];
    const gRows = demGrid ? demGrid.length : 0;
    const gCols = gRows > 0 ? demGrid[0].length : 0;
    if (gRows > 1 && gCols > 1) {
        for (let r = 0; r < gRows; r++) {
            for (let c = 0; c < gCols; c++) flat.push(demGrid[r][c]);
        }
    }
    const minE = flat.length ? Math.min(...flat) : 0;
    const maxE = flat.length ? Math.max(...flat) : 100;
    const span = Math.max(1, maxE - minE);
    const verticalExaggeration = Math.min(13.5, Math.max(2.4, (reliefM / 95) * 3.2 + (slopeDeg / 6) * 1.8));

    for (let i = 0; i < pos.count; i++) {
        const vx = pos.getX(i);
        const vy = pos.getY(i);
        const u = (vx + 20) / 40;
        const v = 1 - (vy + 20) / 40;          // row 0 = north; was N-S mirrored

        let normH = 0.5;
        if (gRows > 1 && gCols > 1) {
            const gr = v * (gRows - 1);
            const gc = u * (gCols - 1);
            const r0 = Math.floor(gr), r1 = Math.min(gRows - 1, r0 + 1);
            const c0 = Math.floor(gc), c1 = Math.min(gCols - 1, c0 + 1);
            const dr = gr - r0, dc = gc - c0;

            const e00 = demGrid[r0][c0], e01 = demGrid[r0][c1];
            const e10 = demGrid[r1][c0], e11 = demGrid[r1][c1];
            const eTop = e00 * (1 - dc) + e01 * dc;
            const eBot = e10 * (1 - dc) + e11 * dc;
            const eVal = eTop * (1 - dr) + eBot * dr;
            normH = (eVal - minE) / span;
        }

        const zHeight = (normH - 0.5) * verticalExaggeration;
        pos.setZ(i, zHeight);

        const c = new THREE.Color();
        if (tintMode === "mars") {
            c.setHSL(0.04 + normH * 0.05, 0.86, 0.26 + normH * 0.40);
        } else if (tintMode === "moon") {
            c.setHSL(0.55, 0.30 + normH * 0.25, 0.28 + normH * 0.46);
        } else {
            c.setHSL(0.43 - normH * 0.28, 0.80, 0.25 + normH * 0.42);
        }
        colors.push(c.r, c.g, c.b);
    }

    geom.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
    geom.computeVertexNormals();

    const mat = new THREE.MeshStandardMaterial({
        vertexColors: true,
        roughness: 0.50,
        metalness: 0.18,
        wireframe: wireframeMode,
        flatShading: true
    });

    dirty3D = true;
    terrainMesh = new THREE.Mesh(geom, mat);
    terrainMesh.rotation.x = meshTiltX;
    terrainMesh.rotation.z = meshRotZ;
    threeScene.add(terrainMesh);
}

function toggle3DWireframe() {
    wireframeMode = !wireframeMode;
    if (terrainMesh && terrainMesh.material) {
        terrainMesh.material.wireframe = wireframeMode;
        dirty3D = true;
    }
}

function toggleEarthBaseLayer() {
    if (!earthMap) return;
    if (usingSatLayer) {
        earthMap.removeLayer(earthSatLayer);
        earthTopoLayer.addTo(earthMap);
        usingSatLayer = false;
    } else {
        earthMap.removeLayer(earthTopoLayer);
        earthSatLayer.addTo(earthMap);
        usingSatLayer = true;
    }
}

// Initialize Three.js Real DEM Heightmap Renderer with Interactive Mouse Drag & Wheel Zoom
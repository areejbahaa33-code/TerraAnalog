// TerraAnalog engine test suite — run from project root: node tests/test_engine.js
const fs = require("fs"), vm = require("vm"), path = require("path");
const root = path.join(__dirname, "..");
const ctx = { window: {}, console, fetch: () => Promise.reject(new Error("offline")), AbortController, setTimeout, clearTimeout, ArrayBuffer, DataView };
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(root, "terra_engine.js"), "utf8"), ctx);
const T = ctx.window.TerraEngine;
let pass = 0, fail = 0;
const ok = (c, n) => { c ? pass++ : (fail++, console.log("FAIL:", n)); };
const rej = async (p, msg, n) => { try { await p; ok(false, n); } catch (e) { ok(e.message === msg, n + " (" + e.message + ")"); } };
(async () => {
  await T.initTerraEngine();
  const db = T.getDB();
  ok(T.validateDB(db).length === 0, "DB validates");
  ok(db.meta.pctBaseline === "earth_ref", "pct baseline baked");
  // analog stored metrics == engine measurement (parity)
  for (const a of db.earth_analogs) {
    const m = T.measureGrid(a.lat, a.lon, a.demGrid, 275.0);
    for (const k of ["slope", "roughness", "relief", "curvature", "elevation"]) ok(Math.abs(m[k] - a[k]) < 0.011 + Math.abs(a[k]) * 1e-4, `parity ${a.id}.${k} ${m[k]} vs ${a[k]}`);
  }
  // matching
  const e = T.measureGrid(13.5, 40.6, db.earth_analogs[0].demGrid, 275);
  const mm = T.matchWithPlanet(e, db.mars, 3);
  ok(mm.length === 3 && new Set(mm.map(x => x.regionKey)).size === 3, "3 unique Mars regions");
  ok(mm[0].totalScore >= mm[1].totalScore && mm[1].totalScore >= mm[2].totalScore, "sorted scores");
  let t0 = process.hrtime.bigint(); for (let i = 0; i < 200; i++) T.matchWithPlanet(e, db.mars, 3);
  ok(Number(process.hrtime.bigint() - t0) / 2e8 < 5e6, "matchWithPlanet < 5 ms");
  // inputs / ocean / offline
  await rej(T.analyzeEarthLocation(95, 0), "INVALID_COORDINATE", "lat>90");
  await rej(T.analyzeEarthLocation("x", 0), "INVALID_COORDINATE", "NaN");
  await rej(T.analyzeEarthLocation(0, -150), "OCEAN_SURFACE_ERROR", "Pacific ocean offline");
  const poles = await T.analyzeEarthLocation(-89.9, 10); ok(poles.synthetic === true && Number.isFinite(poles.earthSite.slope), "polar offline synthetic");
  const antimer = await T.analyzeEarthLocation(10, 179.99); ok(Number.isFinite(antimer.earthSite.slope), "antimeridian");
  const a = db.earth_analogs[0], c = await T.analyzeEarthLocation(a.lat, a.lon); ok(c.dataSource === "CACHED_SRTM" && c.analogId === a.id, "cached analog fallback");
  // reverse mission
  const r = await T.findEarthAnalogForMission("mars", "Jezero"); ok(r.reverseMissionTarget && r.reverseMissionTarget.score > 0, "reverse Mars");
  await rej(T.findEarthAnalogForMission("moon", "Nowhere"), "UNKNOWN_REGION", "unknown region");
  await rej(T.findEarthAnalogForMission("venus", "x"), "UNKNOWN_BODY", "unknown body");
  // HGT parsing + void filling
  const side = 121, buf = new ArrayBuffer(side * side * 2), dv = new DataView(buf);
  for (let i = 0; i < side * side; i++) dv.setInt16(i * 2, (i % side) * 3 + Math.floor(i / side) * 2, false);
  for (let i = 0; i < 40; i++) dv.setInt16((60 * side + 40 + i) * 2, -32768, false);
  const h = T.parseLocalHgtArrayBuffer(buf, "N28E033.hgt");
  ok(h.dataSource === "LOCAL_HGT_BINARY" && h.filenameParsed && h.earthSite.elevation > 0 && h.earthSite.relief < 400, "hgt void-filled, no fake 0 m cliffs");
  const allVoid = Array.from({ length: 4 }, () => [null, null, null, null]); ok(T.fillHgtVoids(allVoid).flat().every(v => v === 0), "all-void grid");
  let bad = false; try { T.parseLocalHgtArrayBuffer(new ArrayBuffer(10)); } catch (x) { bad = x.message === "INVALID_HGT_FORMAT"; } ok(bad, "bad hgt rejected");
  // null-safe grid
  const g = db.earth_analogs[1].demGrid.map(row => row.slice()); g[2][2] = null; g[3][3] = NaN;
  ok(Number.isFinite(T.measureGrid(0, 0, g, 275).slope), "null/NaN grid safe");
  // physics
  const p = T.calculateRoverPhysics(10, 5); ok(p.length === 3 && p[1].gravity === 3.721 && p[0].weightN > p[1].weightN && p[1].weightN > p[2].weightN, "physics gravity order");
  ok(T.calculateRoverPhysics(NaN, -5, "x", 0)[0].stabilityScore >= 0, "physics bad input clamped");
  // hardware + deltas
  const rr = await T.analyzeEarthLocation(a.lat, a.lon), tgt = { body: "mars", site: rr.marsMatches[0] };
  const hw = T.evaluateHardware(rr, tgt); ok(hw.items.length === 3 && hw.overall >= 0 && hw.overall <= 100, "hardware matrix");
  ok(T.environmentDeltas(rr, tgt).length === 8, "8 delta rows");
  console.log(`${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();

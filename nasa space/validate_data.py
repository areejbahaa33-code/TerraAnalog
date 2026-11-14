#!/usr/bin/env python3
"""TerraAnalog data integrity gate. Usage: python validate_data.py [data_dir]   (exit 1 on any ERROR)"""
import json, re, sys, os
import numpy as np, pandas as pd
D = sys.argv[1] if len(sys.argv) > 1 else "."
P = lambda f: os.path.join(D, f)
errs, warns = [], []
M = ["slope", "roughness", "relief", "curvature"]
db = json.load(open(P("planetary_db.json"), encoding="utf8"))

# 1. embedded DB (terra_engine.js) must equal planetary_db.json
if os.path.exists(P("terra_engine.js")):
    line = next((l for l in open(P("terra_engine.js"), encoding="utf8") if l.startswith("const EMBEDDED_PLANETARY_DB = {")), None)
    if line is None: errs.append("terra_engine.js has no embedded DB")
    else:
        emb = json.loads(line[line.index("{"):line.rindex("}") + 1])
        if emb != db: errs.append("embedded DB != planetary_db.json (run build_engine.py)")

# 2. percentile baseline (engine re-normalizes at load, but shipped data should agree)
er = np.array([[p[m] for m in M] for p in db["earth_ref"]])
def drift(rows):
    return max(abs(100 * (er[:, j] <= r[m]).mean() - r[m + "_pct"]) for r in rows for j, m in enumerate(M))
for b in ("mars", "moon"):
    d = drift(db[b])
    (warns if d > 1 else []).append(f"{b}: *_pct drift vs earth_ref up to {d:.1f} pts (engine normalizes at load; regenerate DB to fix at source)") if d > 1 else None

# 3. planet_sites coverage
for b in ("mars", "moon"):
    for r in {p["region"] for p in db[b]}:
        if r not in db["planet_sites"]: errs.append(f"planet_sites missing '{r}'")

# 4. analog stored metrics vs their own demGrid (what the app shows offline)
def measure(g, px=275.0):
    g = np.array(g, float); a = g[1:-1, 2:] - g[1:-1, :-2]; b = g[:-2, 1:-1] - g[2:, 1:-1]
    return {"slope": np.degrees(np.arctan(np.hypot(a, b) / (2 * px))).mean(), "roughness": g.std(), "relief": np.ptp(g)}
for a in db["earth_analogs"]:
    m = measure(a["demGrid"])
    for k in ("slope", "roughness", "relief"):
        if abs(m[k] - a[k]) / max(a[k], 1e-6) > 0.25:
            warns.append(f"analog {a['id']}: stored {k}={a[k]} vs demGrid-measured {m[k]:.1f} (>25% off)")

# 5. earth_ref realism vs the real decoded Earth cells
if os.path.exists(P("all_cells_463m.csv")):
    c = pd.read_csv(P("all_cells_463m.csv"))
    real = c[~c.source.isin(["mars_jezero", "moon_ref_south"])]
    if abs(np.median(er[:, 0]) - real.slope_deg.median()) > 2:
        warns.append(f"earth_ref median slope {np.median(er[:,0]):.1f}° vs real cells {real.slope_deg.median():.1f}° — reference ladder is synthetic")
    idx = open(P("DATA_INDEX.md"), encoding="utf8").read() if os.path.exists(P("DATA_INDEX.md")) else ""
    for t in sorted(set(real.source)):
        if t not in idx: errs.append(f"tile {t} present in all_cells_463m.csv but undocumented in DATA_INDEX.md")

# 6. attribution placeholders
if os.path.exists(P("ref_sources.csv")) and re.search(r"TODO", open(P("ref_sources.csv"), encoding="utf8").read(), re.I):
    errs.append("ref_sources.csv still contains TODO placeholders (PDS product versions / citations)")

print("ERRORS:", *errs, sep="\n  - ") if errs else print("ERRORS: none")
print("WARNINGS:", *warns, sep="\n  - ") if warns else print("WARNINGS: none")
sys.exit(1 if errs else 0)

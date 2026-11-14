# TerraAnalog v5.2 — Source Code Package

## Project Overview
TerraAnalog v5.2 is an interactive Planetary Terrain Intelligence web application comparing Earth terrestrial analog sites against NASA Mars (MOLA) and Moon (LOLA) orbital terrain datasets.

## Included Files
1. `index.html` — Main RTL/LTR bilingual interface (Triple-synchronized Leaflet orbital maps + Three.js 3D DEM mesh viewer + Rover Stability & Hardware Readiness panels).
2. `style.css` — Dark obsidian & glassmorphic sci-fi UI styling.
3. `app.js` — UI controller, map synchronization, Three.js terrain renderer, guided voice tour, and CSV exporter.
4. `i18n.js` — Strictly separated English (`en`) and Arabic (`ar`) localization dictionaries.
5. `terra_engine.js` — Generated file: `terra_engine_logic_only.js` + `planetary_db.json` via `python build_engine.py`. Do not edit by hand.
6. `terra_engine_logic_only.js` — **Token-Optimized Engine (~14 KB vs 301 KB)** with the 283 KB single-line JSON database removed so AI assistants (like Claude Free Tier) can inspect and edit all logic without exhausting token quotas.
7. `build_engine.py`, `validate_data.py`, `tests/test_engine.js` — build, data gate and engine test suite.
8. `read_hgt_dem.py` — Standalone Python utility to parse binary SRTM `.hgt` elevation tiles into readable CSV/JSON.

## How to Run Locally
Open `index.html` directly in any modern browser (or serve via `python -m http.server 8000`).

## v5.2 workflow
1. Edit logic only in `terra_engine_logic_only.js`, data only in `planetary_db.json`.
2. `python build_engine.py` regenerates `terra_engine.js`.
3. `python validate_data.py .` (data gate) and `node tests/test_engine.js` (engine suite).

## Data provenance (read before presenting)
* Live Earth elevation = Copernicus GLO-90 (~90 m) via Open-Meteo (CC-BY 4.0, non-commercial free tier; attribution to Copernicus + Open-Meteo required). It is **not** SRTM.
* Mars/Moon catalogs are MOLA/LOLA-*calibrated* generated points, and the 10 cached analog DEMs are generated morphology, **not** measured grids. The UI labels reflect this.
* Offline fallback outside the 10 analog sites is a deterministic **synthetic estimate** and is labelled as such.

## Scale dependency (read before comparing numbers)
Slope, roughness and relief all depend on the sampling window and pixel size. Values from different pipelines are **not interchangeable**:
| Pipeline | Pixel / window | Where used |
|:--|:--|:--|
| Live analysis | 8x8 samples at ~275 m spacing (~2 km window), Copernicus GLO-90 via Open-Meteo | `analyzeEarthLocation`, cached analog `demGrid`s |
| Local HGT upload | SRTM1 window of ~1.4-4.3 km (depends on latitude/cell size) | `parseLocalHgtArrayBuffer` |
| 463 m reference cells | 5x5 px cells (~463 m; Mars MOLA 463.09 m native, Moon LOLA 118.45 m native resampled) | `all_cells_463m.csv`, `top_mars.csv`, `top_moon.csv` |
A larger window generally yields larger relief/roughness. The catalog percentile ranks (`*_pct`) are computed against `earth_ref`, so they inherit the same scale caveat. Treat matches as screening-level analogs, not measurements.

## Attribution
* Elevation (live Earth): Copernicus DEM GLO-90, "Contains modified Copernicus data" (ESA / European Union), via the Open-Meteo Elevation API (CC BY 4.0; free tier is non-commercial). Not SRTM.
* Open-Meteo: https://open-meteo.com/ ; Copernicus: https://dataspace.copernicus.eu/
* Mars: NASA MGS MOLA (https://pds-geosciences.wustl.edu/missions/mgs/mola.html). Moon: NASA LRO LOLA (https://pds-geosciences.wustl.edu/missions/lro/lola.html). Full citations in `ref_sources.csv`.

See `DATA_INDEX.md` for N70E025 and top_mars/top_moon reconciliation, and `SYNC_REPORT.md` for the analog metric sync.

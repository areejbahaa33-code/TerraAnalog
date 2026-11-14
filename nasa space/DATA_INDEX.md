# TerraAnalog v5.2 — Readable Data Index (Token-Safe Guide)

All binary `.hgt` SRTM elevation files have been decoded into readable JSON/CSV formats, double `.csv.xls` extensions have been fixed to standard `.csv`, and duplicate `(1)` files have been removed.

## Tier 1: Lightweight Summary Files (Read First — Low Token Cost)
| File | Format | Rows / Items | Description |
| :--- | :--- | :--- | :--- |
| `hgt_decoded_summary.json` | JSON | 4 SRTM1 tiles (pre-dates `N70E025`) | Complete decoded stats, bounds, elevation percentiles & 48x48 window slope/roughness/relief for `N13E040`, `N28E033`, `N35E083`, `N42E064`. |
| `tiles_summary.csv` | CSV | 4 rows | CRS, bounds, pixel size, and min/max/mean elevation of the 4 SRTM tiles. |
| `ref_sources.csv` | CSV | 2 rows | NASA PDS metadata for `mars_jezero` (MOLA) and `moon_ref_south` (LOLA). |
| `top_mars.csv` / `top_mars.geojson` | CSV / GeoJSON | 200 rows | Top 200 Earth grid cells matching Mars Jezero Crater (5 tiles) (`similarity` up to `0.9828`). |
| `top_moon.csv` / `top_moon.geojson` | CSV / GeoJSON | 200 rows | Top 200 Earth grid cells matching Moon South Pole (`similarity` up to `0.9136`). |
| `hgt_grids_readable/*.csv` | CSV (4 files) | 1,296 rows each | Downsampled 36x36 `(lat, lon, elevation_m)` elevation surfaces extracted from the 4 binary `.hgt` files. |

## Tier 2: Full Reference & Gridded Datasets (Query via Python / Targeted Inspection)
| File | Format | Rows / Items | Description |
| :--- | :--- | :--- | :--- |
| `planetary_db.json` | JSON | 400 Earth + 480 Mars + 480 Moon + 10 Earth Analogs + 24 Planet Sites | Active runtime database powering `terra_engine.js`. |
| `ref_cells_463m.csv` | CSV | 3,876 rows | Reference planetary terrain cells (`mars_jezero`: 2,601; `moon_ref_south`: 1,275). |
| `all_cells_463m.csv` | CSV | 11,874 rows | 7,998 Earth cells across 5 SRTM tiles (incl. `N70E025`, 592 cells) + 3,876 Mars/Moon reference cells (`slope_deg`, `roughness_deg`, `relief_m`, `rough_elev_m`). |
| `grid_features_clean.csv` | CSV | 43,906 rows | Cleaned multi-tile Earth terrain feature grid (`N42E064`, `N13E040`, `N35E083`, `N28E033`). |

> **Package note (v5.2):** the files `hgt_decoded_summary.json`, `tiles_summary.csv`, `hgt_grids_readable/`, `ref_cells_463m.csv` and `grid_features_clean.csv` are listed above from the earlier data drop but were **not included** in this package; their descriptions are unverified here. `ref_sources.csv` now has 4 rows (Mars, Moon, Copernicus live DEM, SRTM tiles).

## N70E025 and ranking reconciliation
* Tile `N70E025` (northern Fennoscandia, lat 70-71N, lon 25-26E) contributes **592 cells** to `all_cells_463m.csv`. No cached analog site lies in this tile (Iceland and Devon Island are the nearest), so it has no catalog counterpart.
* `all_cells_463m.csv` has 11,874 rows = 7,998 Earth cells (5 tiles) + 3,876 planetary reference cells (`mars_jezero` 2,601, `moon_ref_south` 1,275). The earlier "4 tiles / 11,874 Earth cells" wording was wrong.
* `top_mars.csv` ranks Earth cells against the single Mars Jezero reference cluster; `top_moon.csv` against the single Moon South Pole cluster (similarity = 1 - distance). The app's catalog scoring instead uses percentile distances over 480 Mars / 480 Moon catalog points (`totalScore`, 0-100). **The two scores are different scales and must not be compared numerically**; only the ordering of tiles is comparable.
* Max similarity: Mars 0.9828 (N13E040), Moon 0.9136 (N28E033). Mars matches come mainly from N35E083, N13E040; Moon matches from N28E033, N13E040.
* Per-tile 463 m statistics (Earth cells):

| Tile | Cells | Median slope (deg) | Median roughness (deg) | Median relief (m) | In top_mars | In top_moon |
|:--|--:|--:|--:|--:|--:|--:|
| N13E040 | 2,296 | 1.25 | 0.41 | 49.3 | 46 | 40 |
| N28E033 | 1,475 | 3.08 | 1.57 | 119.1 | 25 | 155 |
| N35E083 | 1,907 | 1.68 | 0.75 | 63.4 | 106 | 2 |
| N42E064 | 1,728 | 0.97 | 0.46 | 33.3 | 5 | 0 |
| N70E025 | 592 | 3.41 | 1.91 | 126.2 | 18 | 3 |

* Cached analog metrics were re-synced to their own grids (see `SYNC_REPORT.md`); they describe ~2 km 275 m windows, so they are systematically larger in relief than 463 m cell medians above.

## Scale dependency (read before comparing numbers)
Slope, roughness and relief all depend on the sampling window and pixel size. Values from different pipelines are **not interchangeable**:
| Pipeline | Pixel / window | Where used |
|:--|:--|:--|
| Live analysis | 8x8 samples at ~275 m spacing (~2 km window), Copernicus GLO-90 via Open-Meteo | `analyzeEarthLocation`, cached analog `demGrid`s |
| Local HGT upload | SRTM1 window of ~1.4-4.3 km (depends on latitude/cell size) | `parseLocalHgtArrayBuffer` |
| 463 m reference cells | 5x5 px cells (~463 m; Mars MOLA 463.09 m native, Moon LOLA 118.45 m native resampled) | `all_cells_463m.csv`, `top_mars.csv`, `top_moon.csv` |
A larger window generally yields larger relief/roughness. The catalog percentile ranks (`*_pct`) are computed against `earth_ref`, so they inherit the same scale caveat. Treat matches as screening-level analogs, not measurements.

## Known limitation: earth_ref percentile ladder
`earth_ref` (400 points) is a *normalisation ladder* shared by Earth, Mars and Moon percentiles, built at ~2 km / 275 m scale. Its median slope (9.5 deg) is therefore not comparable with the 463 m real-cell median (1.4 deg); `validate_data.py` keeps reporting this as a WARNING on purpose. Rankings are relative, screening-level.

## Attribution
* Elevation (live Earth): Copernicus DEM GLO-90, "Contains modified Copernicus data" (ESA / European Union), via the Open-Meteo Elevation API (CC BY 4.0; free tier is non-commercial). Not SRTM.
* Open-Meteo: https://open-meteo.com/ ; Copernicus: https://dataspace.copernicus.eu/
* Mars: NASA MGS MOLA (https://pds-geosciences.wustl.edu/missions/mgs/mola.html). Moon: NASA LRO LOLA (https://pds-geosciences.wustl.edu/missions/lro/lola.html). Full citations in `ref_sources.csv`.

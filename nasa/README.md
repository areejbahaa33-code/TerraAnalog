# TerraAnalog — Planetary Analog Discovery Platform
**NASA Space Apps Challenge 2026**  
*Challenge: Identify Earth Locations that Analog the Permanent Moon Base Locations and Mars*

## Overview
**TerraAnalog** discovers and evaluates Earth analog regions against lunar (**Artemis III — Shackleton Ridge**) and Martian (**Jezero Crater**) baselines using quantitative geomorphological telemetry extracted from NASA Digital Elevation Models (**SRTM**, **LRO LOLA**, and **MGS MOLA**).

## Project Architecture
* `make_mock_cells.py`: Fetches and computes 4 terrain metrics (Elevation, Slope, Surface Roughness, Local Relief) from NASA SRTM GeoTIFF subsets and outputs `earth_cells_MOCK.csv`.
* `analyze_analogs.py`: Normalizes features (`[0, 1]`), applies Weighted Euclidean Distance against LOLA/MOLA baselines, and exports `config.json` and `data.geojson`.
* `index.html`, `style.css`, `app.js`: Zero-dependency static SPA utilizing **Leaflet.js** and **Chart.js**.

## Quick Start
1. Run the Python pipeline (optional, pre-computed files are included):
   ```bash
   pip install -r requirements.txt
   python make_mock_cells.py
   python analyze_analogs.py 

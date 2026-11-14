#!/usr/bin/env python3
"""
TerraAnalog v5.0 — SRTM1 / SRTM3 Binary .HGT Decoder
Converts big-endian int16 binary .hgt elevation files into human-readable JSON & CSV grids.
"""
import os, re, sys, json
import numpy as np
import pandas as pd

def decode_hgt(hgt_path, out_dir="decoded_hgt", grid_step=100):
    os.makedirs(out_dir, exist_ok=True)
    fname = os.path.basename(hgt_path)
    raw = np.fromfile(hgt_path, dtype=">i2")
    side = int(round(np.sqrt(raw.size)))
    if side * side != raw.size:
        raise ValueError(f"Invalid .hgt file size: {raw.size} samples")
    dem = raw.reshape((side, side))

    m = re.search(r"([NS])(\d{2})([EW])(\d{3})", fname, re.I)
    base_lat = int(m.group(2)) * (1 if m.group(1).upper() == "N" else -1) if m else 0.0
    base_lon = int(m.group(4)) * (1 if m.group(3).upper() == "E" else -1) if m else 0.0

    valid = dem[dem > -10000].astype(np.float64)
    idx = np.arange(0, side - 1, grid_step)
    sub_grid = dem[np.ix_(idx, idx)]
    lats = np.round(base_lat + 1.0 - (idx / (side - 1)), 5)
    lons = np.round(base_lon + (idx / (side - 1)), 5)

    rows = [(float(la), float(lo), int(sub_grid[r, c]))
            for r, la in enumerate(lats) for c, lo in enumerate(lons)]
    csv_out = os.path.join(out_dir, fname.replace(".hgt", "_grid.csv"))
    pd.DataFrame(rows, columns=["lat", "lon", "elevation_m"]).to_csv(csv_out, index=False)

    meta = {
        "file": fname,
        "dimensions": [side, side],
        "bounds": {"lat_min": base_lat, "lat_max": base_lat + 1.0,
                   "lon_min": base_lon, "lon_max": base_lon + 1.0},
        "min_m": float(np.min(valid)),
        "mean_m": round(float(np.mean(valid)), 2),
        "median_m": round(float(np.median(valid)), 2),
        "max_m": float(np.max(valid)),
        "std_m": round(float(np.std(valid)), 2),
        "csv_grid": csv_out
    }
    return meta

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python read_hgt_dem.py <tile.hgt> [more_tiles.hgt ...]")
        sys.exit(1)
    results = [decode_hgt(p) for p in sys.argv[1:]]
    print(json.dumps(results, indent=2))

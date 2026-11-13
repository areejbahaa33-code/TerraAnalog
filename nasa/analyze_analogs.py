import json
import math
import pandas as pd

# بيانات المراجع الفضائية الرسمية من NASA LRO LOLA (القمر) و NASA MGS MOLA (المريخ)
CELESTIAL_BASELINES = {
    "moon": {
        "id": "moon_artemis",
        "name": "Artemis III — Shackleton Connecting Ridge",
        "body": "Moon",
        "instrument": "NASA LRO LOLA (Lunar Orbiter Laser Altimeter)",
        "api_layer": "LRO_LOLA_ClrShade_Global_128ppd_v04",
        "coordinates": [-89.45, 222.0],
        "description": "High-altitude polar ridge near Shackleton Crater at the Lunar South Pole; characterized by moderate-to-steep slopes, cratered roughness, and persistent solar illumination.",
        "metrics": {
            "elevation": 2150.0,
            "slope": 11.4,
            "roughness": 6.8,
            "local_relief": 480.0
        }
    },
    "mars": {
        "id": "mars_jezero",
        "name": "Jezero Crater — Western Delta Basin",
        "body": "Mars",
        "instrument": "NASA MGS MOLA (Mars Orbiter Laser Altimeter)",
        "api_layer": "Mars_MGS_MOLA_DEM_mosaic_global_463m",
        "coordinates": [18.38, 77.58],
        "description": "Ancient lacustrine delta deposit explored by the Perseverance rover; features low-angle basin slopes ideal for landing and traversal with moderate boulder roughness.",
        "metrics": {
            "elevation": 2540.0,
            "slope": 6.2,
            "roughness": 4.3,
            "local_relief": 310.0
        }
    }
}

FEATURE_KEYS = ["elevation", "slope", "roughness", "local_relief"]

FEATURE_WEIGHTS = {
    "elevation": 0.15,
    "slope": 0.35,
    "roughness": 0.30,
    "local_relief": 0.20
}


def run_pipeline(
    input_csv: str = "earth_cells_MOCK.csv",
    output_config: str = "config.json",
    output_geojson: str = "data.geojson"
):
    df = pd.read_csv(input_csv)

    # 1. حساب حدود التطبيع (Min-Max Normalization Bounds)
    bounds = {}
    for feat in FEATURE_KEYS:
        all_vals = list(df[feat].astype(float).values) + [
            b["metrics"][feat] for b in CELESTIAL_BASELINES.values()
        ]
        min_v, max_v = min(all_vals), max(all_vals)
        span = (max_v - min_v) if max_v != min_v else 1.0
        bounds[feat] = {
            "min": round(min_v - 0.15 * span, 2),
            "max": round(max_v + 0.15 * span, 2)
        }

    def normalize(val: float, feat: str) -> float:
        b = bounds[feat]
        return (val - b["min"]) / (b["max"] - b["min"])

    features_list = []

    # 2. حساب المسافة الإقليدية الموزونة ونسب التشابه لكل خلية أرضية
    for _, row in df.iterrows():
        cand_norm = {f: normalize(float(row[f]), f) for f in FEATURE_KEYS}
        scores = {}
        breakdown = {}

        for target_key, base_obj in CELESTIAL_BASELINES.items():
            base_norm = {f: normalize(base_obj["metrics"][f], f) for f in FEATURE_KEYS}

            weighted_sq_dist = 0.0
            feat_matches = {}

            for f in FEATURE_KEYS:
                diff = abs(cand_norm[f] - base_norm[f])
                w = FEATURE_WEIGHTS[f]
                weighted_sq_dist += w * (diff ** 2)
                feat_matches[f] = round(max(0.0, (1.0 - diff) * 100.0), 1)

            euclidean_dist = math.sqrt(weighted_sq_dist)
            similarity_score = round(max(0.0, (1.0 - euclidean_dist) * 100.0), 1)

            scores[target_key] = similarity_score
            breakdown[target_key] = feat_matches

        best_target = "Moon" if scores["moon"] >= scores["mars"] else "Mars"

        lat, lon = float(row["lat"]), float(row["lon"])
        d = 0.28
        polygon_coords = [[
            [round(lon - d, 4), round(lat - d, 4)],
            [round(lon + d, 4), round(lat - d, 4)],
            [round(lon + d, 4), round(lat + d, 4)],
            [round(lon - d, 4), round(lat + d, 4)],
            [round(lon - d, 4), round(lat - d, 4)]
        ]]

        features_list.append({
            "type": "Feature",
            "id": str(row["cell_id"]),
            "properties": {
                "id": str(row["cell_id"]),
                "name": str(row["name"]),
                "country": str(row["country"]),
                "region": str(row["region"]),
                "lat": lat,
                "lon": lon,
                "dataset": str(row["dataset"]),
                "geology": str(row["geology"]),
                "metrics": {
                    "elevation": float(row["elevation"]),
                    "slope": float(row["slope"]),
                    "roughness": float(row["roughness"]),
                    "local_relief": float(row["local_relief"])
                },
                "similarity": {
                    "moon": scores["moon"],
                    "mars": scores["mars"],
                    "best_target": best_target
                },
                "feature_match": {
                    "moon": breakdown["moon"],
                    "mars": breakdown["mars"]
                }
            },
            "geometry": {
                "type": "Polygon",
                "coordinates": polygon_coords
            }
        })

    geojson_data = {
        "type": "FeatureCollection",
        "metadata": {
            "project": "TerraAnalog — NASA Space Apps Challenge 2026",
            "crs": "EPSG:4326",
            "total_candidates": len(features_list)
        },
        "features": features_list
    }

    config_data = {
        "project": "TerraAnalog",
        "challenge": "Identify Earth Locations that Analog the Permanent Moon Base Locations and Mars",
        "weights": FEATURE_WEIGHTS,
        "normalization_bounds": bounds,
        "baselines": CELESTIAL_BASELINES
    }

    with open(output_config, "w", encoding="utf-8") as f:
        json.dump(config_data, f, ensure_ascii=False, indent=2)

    with open(output_geojson, "w", encoding="utf-8") as f:
        json.dump(geojson_data, f, ensure_ascii=False, indent=2)

    print(f"[+] Successfully generated '{output_config}' and '{output_geojson}'.")


if __name__ == "__main__":
    run_pipeline()
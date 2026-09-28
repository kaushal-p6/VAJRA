"""
VAJRA ML Service — Batch Prediction Orchestrator
=================================================
Implements Part B, Item 1 of VAJRA_DevTeam_Report_and_Handoff.md:

    "This will make ~9,986 separate live NASA/Copernicus API calls if run
    naively ... Needs restructuring to fetch the rainfall/soil-moisture
    GRID ONCE per cycle and then do fast local zonal-stats lookups per
    unit, rather than one live API call per unit."

This module is the fix for that: it separates the ONE slow, network-bound
step (fetch the grid) from the MANY fast, CPU-bound steps (score each
watershed/slope-unit against that already-downloaded grid).

WIRE-UP NOTE FOR YOU (the ML engineer):
This file cannot run as-is in this sandbox — it doesn't have access to
your actual trained models, feature tables, or NASA/Copernicus credentials.
Everywhere you see `# >>> WIRE UP:`, replace the stub with the real call
into your own notebook code (per Part B of your handoff doc, these
functions already exist — this module just re-arranges how they're
called, it doesn't reimplement them).
"""

import json
import time
import traceback
from datetime import datetime, timezone
from pathlib import Path

import joblib
import pandas as pd

# ---------------------------------------------------------------------------
# Paths — adjust to match your actual project layout
# (per your handoff: ~/Projects/Disaster_Management_SIH)
# ---------------------------------------------------------------------------
PROJECT_ROOT = Path.home() / "Projects" / "Disaster_Management_SIH"
MODELS_DIR = PROJECT_ROOT / "models"
DATA_DIR = PROJECT_ROOT / "data"
CACHE_DIR = Path(__file__).parent / "cache"
CACHE_DIR.mkdir(exist_ok=True)
CACHE_FILE = CACHE_DIR / "latest_predictions.json"


# ---------------------------------------------------------------------------
# 1. Load static artifacts ONCE at process start (not per-request, not per-unit)
# ---------------------------------------------------------------------------
def load_static_artifacts():
    """Load everything that doesn't change between prediction cycles:
    models, thresholds, feature tables, unit geometries."""
    artifacts = {}

    artifacts["flood_model"] = joblib.load(MODELS_DIR / "flood_model_v1.pkl")
    artifacts["flood_feature_cols"] = joblib.load(MODELS_DIR / "flood_feature_cols_v1.pkl")
    artifacts["landslide_model"] = joblib.load(MODELS_DIR / "landslide_model_v1.pkl")
    artifacts["landslide_feature_cols"] = joblib.load(MODELS_DIR / "landslide_feature_cols_v1.pkl")
    artifacts["tier_thresholds"] = joblib.load(MODELS_DIR / "tier_thresholds_v1.pkl")

    artifacts["watershed_static"] = pd.read_csv(DATA_DIR / "features" / "watershed_static_features.csv")
    artifacts["slope_static"] = pd.read_csv(DATA_DIR / "features" / "slope_units_features.csv")

    # Item 2 from the handoff: danger_area_shape needs the unit polygons.
    # >>> WIRE UP: use geopandas to read these once and keep them in memory
    # as a dict keyed by unit id, e.g.:
    #   import geopandas as gpd
    #   wsheds = gpd.read_file(DATA_DIR / "watersheds" / "watersheds.geojson")
    #   artifacts["watershed_geometry"] = {
    #       row.watershed_id: row.geometry.__geo_interface__
    #       for row in wsheds.itertuples()
    #   }
    #   slope_units = gpd.read_file(DATA_DIR / "dem" / "slope_units.geojson")
    #   artifacts["slope_geometry"] = {
    #       row.slope_unit_id: row.geometry.__geo_interface__
    #       for row in slope_units.itertuples()
    #   }
    artifacts["watershed_geometry"] = {}
    artifacts["slope_geometry"] = {}

    # village_lookup.geojson is a GeoJSON (850 rows, per your handoff) —
    # needs geopandas, not pandas, to read correctly.
    # >>> WIRE UP:
    #   import geopandas as gpd
    #   artifacts["village_lookup"] = gpd.read_file(DATA_DIR / "boundaries" / "village_lookup.geojson")
    artifacts["village_lookup"] = None

    return artifacts


# ---------------------------------------------------------------------------
# 2. Fetch the shared rainfall/soil-moisture GRID exactly ONCE per cycle
#    (this is the fix for the batch-efficiency caveat)
# ---------------------------------------------------------------------------
def fetch_shared_environmental_grid():
    """
    Fetch today's rainfall accumulation and best-available soil moisture
    ONCE, covering the whole district, instead of once per unit.

    >>> WIRE UP: replace the two calls below with your actual bulk-fetch
    functions from Part B of your handoff:
        - get_todays_accumulated_rainfall()  (IMERG Early Run, ~4hr latency)
        - get_best_available_soil_moisture() (ERA5-Land, ~5-7 day latency)
    Both already return district-wide data per your notes — the point of
    this function is just to call them ONCE here, not per watershed.
    """
    # >>> WIRE UP:
    # rainfall_grid = get_todays_accumulated_rainfall()
    # soil_moisture_grid, soil_moisture_date = get_best_available_soil_moisture()
    rainfall_grid = None
    soil_moisture_grid = None
    soil_moisture_date = None
    return {
        "rainfall_grid": rainfall_grid,
        "soil_moisture_grid": soil_moisture_grid,
        "soil_moisture_date": soil_moisture_date,
        "fetched_at": datetime.now(timezone.utc).isoformat(),
    }


# ---------------------------------------------------------------------------
# 3. Fast, local, per-unit scoring against the already-fetched grid
#    (this replaces calling predict_*_risk_live() — those do a live fetch
#    internally, which is exactly the per-unit network call we're avoiding)
# ---------------------------------------------------------------------------
def score_single_watershed(watershed_row, env_grid, artifacts):
    """
    Local zonal-stats + model scoring for ONE watershed, using the
    already-downloaded grid — no network call happens in this function.

    >>> WIRE UP: this should mirror the internals of your existing
    predict_flood_risk() (NOT predict_flood_risk_live()) — the version
    that takes already-fetched rainfall/soil-moisture values as arguments
    rather than fetching them itself. Pull the per-watershed rain_1d/3d
    values out of `env_grid["rainfall_grid"]` via the same zonal-stats
    approach used to build watershed_daily_rainfall.csv, then call:
        risk_score = artifacts["flood_model"].predict_proba(feature_row)[:, 1]
        risk_tier = tier_from_score(risk_score, artifacts["tier_thresholds"]["flood"])
    """
    watershed_id = int(watershed_row["watershed_id"])

    # >>> WIRE UP: replace with real feature extraction + model.predict_proba
    risk_score = None
    risk_tier = None
    expected_time_to_impact_hours = None

    if risk_score is None:
        return {"watershed_id": watershed_id, "error": "scoring not wired up yet"}

    village_name, village_distance_km = lookup_nearest_village(
        watershed_row, artifacts["village_lookup"]
    )
    village_label = village_name
    if village_distance_km is not None and village_distance_km > 5:
        village_label = f"{village_name} (nearest known settlement, {village_distance_km}km away - area may be sparsely populated)"

    now = datetime.now(timezone.utc)
    alert = {
        "alert_id": f"UK-WS-{watershed_id}-{now.strftime('%Y%m%d-%H%M')}",
        "generated_at": now.isoformat(),
        "hazard_type": "flood",
        "location": {
            "watershed_id": watershed_id,
            "village": village_label,
        },
        "risk_score": round(float(risk_score), 2),
        "risk_tier": risk_tier,
        "expected_time_to_impact_hours": expected_time_to_impact_hours,
        "nearest_safe_zone": lookup_nearest_safe_zone(watershed_id, "flood", artifacts),
        "model_version": "vajra-flood-v1",
        "data_freshness": {
            "rainfall_granules_used": None,  # >>> WIRE UP
            "soil_moisture_date": env_grid.get("soil_moisture_date"),
            "soil_moisture_lag_days": _lag_days(env_grid.get("soil_moisture_date")),
        },
    }

    # Item 2: attach the real polygon if we have it loaded
    geom = artifacts["watershed_geometry"].get(watershed_id)
    if geom:
        alert["location"]["danger_area_shape"] = geom

    return alert


def score_single_slope_unit(slope_row, env_grid, artifacts):
    """Same pattern as score_single_watershed, for landslide/slope units.
    >>> WIRE UP following the same approach as above, using
    landslide_model_v1.pkl + landslide_feature_cols_v1.pkl."""
    slope_unit_id = int(slope_row["slope_unit_id"])

    risk_score = None
    risk_tier = None

    if risk_score is None:
        return {"slope_unit_id": slope_unit_id, "error": "scoring not wired up yet"}

    village_name, village_distance_km = lookup_nearest_village(
        slope_row, artifacts["village_lookup"]
    )
    village_label = village_name
    if village_distance_km is not None and village_distance_km > 5:
        village_label = f"{village_name} (nearest known settlement, {village_distance_km}km away - area may be sparsely populated)"

    now = datetime.now(timezone.utc)
    alert = {
        "alert_id": f"UK-SU-{slope_unit_id}-{now.strftime('%Y%m%d-%H%M')}",
        "generated_at": now.isoformat(),
        "hazard_type": "landslide",
        "location": {
            "slope_unit_id": slope_unit_id,
            "village": village_label,
        },
        "risk_score": round(float(risk_score), 2),
        "risk_tier": risk_tier,
        # Per the handoff: always null for landslide currently — not yet modeled.
        "expected_time_to_impact_hours": None,
        "nearest_safe_zone": lookup_nearest_safe_zone(slope_unit_id, "landslide", artifacts),
        "model_version": "vajra-landslide-v1",
        "data_freshness": {
            "soil_moisture_date": env_grid.get("soil_moisture_date"),
            "soil_moisture_lag_days": _lag_days(env_grid.get("soil_moisture_date")),
        },
    }

    geom = artifacts["slope_geometry"].get(slope_unit_id)
    if geom:
        alert["location"]["danger_area_shape"] = geom

    return alert


def _lag_days(date_str):
    if not date_str:
        return None
    try:
        d = datetime.fromisoformat(date_str)
        return (datetime.now(timezone.utc) - d.replace(tzinfo=timezone.utc)).days
    except Exception:
        return None


def lookup_nearest_village(unit_row, village_lookup_df):
    """>>> WIRE UP: call your existing find_nearest_village_uid() here.
    IMPORTANT per your own bug list (#3, #9): reproject to EPSG:32644
    before any .distance() call, and this function returns (uid, name,
    distance) as 3 values now — don't unpack it as 2 anywhere new."""
    return "Unknown", None


def lookup_nearest_safe_zone(unit_id, hazard_type, artifacts):
    """>>> WIRE UP: read from features/village_safe_zone_routes.csv.
    Per bug #5 in your handoff: if the nearest safe zone resolves to the
    village's own location, return None (that's the correct "already
    safe terrain" result), not a self-referencing recommendation."""
    return None


# ---------------------------------------------------------------------------
# 4. Full batch cycle — this is what the scheduler calls every 30 min
# ---------------------------------------------------------------------------
def run_batch_cycle(artifacts):
    started_at = time.monotonic()
    env_grid = fetch_shared_environmental_grid()  # the ONE slow network step

    flood_results = []
    for _, row in artifacts["watershed_static"].iterrows():
        try:
            flood_results.append(score_single_watershed(row, env_grid, artifacts))
        except Exception as e:
            flood_results.append({
                "watershed_id": int(row.get("watershed_id", -1)),
                "error": f"{type(e).__name__}: {e}",
                "traceback": traceback.format_exc(),
            })

    landslide_results = []
    for _, row in artifacts["slope_static"].iterrows():
        try:
            landslide_results.append(score_single_slope_unit(row, env_grid, artifacts))
        except Exception as e:
            landslide_results.append({
                "slope_unit_id": int(row.get("slope_unit_id", -1)),
                "error": f"{type(e).__name__}: {e}",
                "traceback": traceback.format_exc(),
            })

    duration_s = round(time.monotonic() - started_at, 1)

    return {
        "cycle_generated_at": datetime.now(timezone.utc).isoformat(),
        "cycle_duration_seconds": duration_s,
        "environmental_grid_fetched_at": env_grid["fetched_at"],
        "flood_alerts": flood_results,
        "landslide_alerts": landslide_results,
    }


def write_cache_atomic(payload):
    """Write to a temp file then rename — avoids the API ever reading a
    half-written cache file mid-write."""
    tmp_path = CACHE_FILE.with_suffix(".tmp")
    with open(tmp_path, "w") as f:
        json.dump(payload, f, indent=2, default=str)
    tmp_path.replace(CACHE_FILE)


if __name__ == "__main__":
    print("Loading static artifacts (models, feature tables)...")
    artifacts = load_static_artifacts()
    print("Running one batch cycle...")
    payload = run_batch_cycle(artifacts)
    write_cache_atomic(payload)
    print(f"Wrote {len(payload['flood_alerts'])} flood + "
          f"{len(payload['landslide_alerts'])} landslide alerts to {CACHE_FILE} "
          f"in {payload['cycle_duration_seconds']}s")

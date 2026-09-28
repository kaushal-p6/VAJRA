"""
VAJRA ML Service - Batch Prediction Orchestrator (wired up)
============================================================
Runs one full prediction cycle for every watershed (flood) and slope unit
(landslide) and writes the result to cache/latest_predictions.json.

Design (matches Part A of VAJRA_DevTeam_Report_and_Handoff.md):

  1. load_static_artifacts()  - once per process: models, feature tables,
     geometries, and every per-unit lookup that never changes between
     cycles (nearest village, safe zone, time-of-concentration).
  2. fetch_shared_environmental_grid() - ONCE per cycle: IMERG Early Run
     rainfall grids + ERA5-Land soil moisture grid for the whole district.
  3. Vectorised scoring - the trained models score all 1,029 watersheds and
     all 8,957 slope units in one predict_proba call each. No per-unit
     network calls, no per-unit Python loops on the hot path.

Things you MUST know (also summarised in the hand-back message):

  * Earthdata login is non-interactive here (scheduler cannot type a
    password). Create ~/.netrc:
        machine urs.earthdata.nasa.gov login <user> password <pass>
    (chmod 600), or export EARTHDATA_USERNAME / EARTHDATA_PASSWORD.
    Copernicus CDS uses your existing ~/.cdsapirc.
  * If fresh rainfall cannot be obtained, the cycle RAISES instead of
    scoring with zero rain. The scheduler keeps serving the last good
    cache. All-Green from missing data would be false reassurance.
  * Only Yellow-and-above units are published in flood_alerts /
    landslide_alerts. Tier counts for ALL units are in payload["summary"].
"""

import json
import os
import re
import tempfile
import time
import traceback
import zipfile
from datetime import datetime, timedelta, timezone
from pathlib import Path

import geopandas as gpd
import joblib
import numpy as np
import pandas as pd
from scipy import sparse
from scipy.spatial import cKDTree
from shapely.geometry import MultiPolygon, Polygon

# ---------------------------------------------------------------------------
# Paths / constants
# ---------------------------------------------------------------------------
PROJECT_ROOT = Path(os.environ.get(
    "VAJRA_PROJECT_ROOT", Path.home() / "Projects" / "Disaster_Management_SIH"))
MODELS_DIR = PROJECT_ROOT / "models"
DATA_DIR = PROJECT_ROOT / "data"
REALTIME_DIR = DATA_DIR / "realtime_cache"          # IMERG Early Run granules
CACHE_DIR = Path(__file__).parent / "cache"
CACHE_FILE = CACHE_DIR / "latest_predictions.json"
CACHE_DIR.mkdir(exist_ok=True)
REALTIME_DIR.mkdir(parents=True, exist_ok=True)

# Same clip box used when the training features were built (77.81,30.47,79.42,31.46)
# so live nearest-pixel lookups behave exactly like the training ones.
BBOX = (77.81, 30.47, 79.42, 31.46)                 # W, S, E, N
UTM = "EPSG:32644"                                  # metric CRS for distances/centroids

TIER_ORDER = ["Green", "Yellow", "Orange", "Red"]
PUBLISH_MIN_TIER = "Yellow"                         # lowest tier written to the cache

# The landslide model was trained on rain_1d/3d/7d measured over COMPLETE days
# BEFORE the event date (today excluded). False = identical to training.
# True = include today's partial rainfall (more reactive, but outside what
# the model was validated on).
INCLUDE_TODAY_IN_LANDSLIDE_WINDOWS = False

# The landslide model was trained with negatives drawn ONLY from the ~500
# riskiest slope units (plus the positives), so it has never seen ordinary
# low-risk terrain and its scores there are extrapolation. True = publish
# landslide alerts only for the units present in final_training_dataset_hard.csv;
# every other unit is reported as "NotAssessed" instead of a misleading tier.
LANDSLIDE_ASSESS_ONLY_VALIDATED_UNITS = True

MAX_GRANULE_AGE_HOURS = 12        # refuse to score if newest rainfall is older
GRANULE_LOOKBACK_DAYS = 8         # 7 complete days + today
MIN_GRANULES_PER_FULL_DAY = 44    # of 48; below this a day counts as incomplete
SOIL_MOISTURE_TTL_HOURS = 6       # ERA5-Land only changes daily; don't re-request every cycle
SOIL_MOISTURE_BUDGET_SECONDS = 240
FAR_VILLAGE_THRESHOLD_M = 5000

_GRANULE_RE = re.compile(r"\.(\d{8})-S(\d{6})-E")


# ---------------------------------------------------------------------------
# 1. Static artifacts (once per process)
# ---------------------------------------------------------------------------
def _mean_col(path, col, default=0.40):
    try:
        return float(pd.read_csv(path, usecols=[col])[col].mean())
    except Exception:
        return default


def _centroids_and_nearest_village(gdf, id_col, village_xy, village_tree):
    """Centroids computed in a metric CRS (never in degrees), returned as
    lat/lon, plus nearest-village index + distance in metres."""
    proj = gdf.to_crs(UTM)
    cent = proj.geometry.centroid
    cent_ll = cent.to_crs("EPSG:4326")
    dist_m, idx = village_tree.query(np.column_stack([cent.x.values, cent.y.values]))
    return pd.DataFrame({
        id_col: gdf[id_col].astype(int).values,
        "cent_lat": cent_ll.y.values,
        "cent_lon": cent_ll.x.values,
        "village_idx": idx,
        "village_dist_m": dist_m,
    })


def load_static_artifacts():
    a = {}
    a["flood_model"] = joblib.load(MODELS_DIR / "flood_model_v1.pkl")
    a["flood_feature_cols"] = joblib.load(MODELS_DIR / "flood_feature_cols_v1.pkl")
    a["landslide_model"] = joblib.load(MODELS_DIR / "landslide_model_v1.pkl")
    a["landslide_feature_cols"] = joblib.load(MODELS_DIR / "landslide_feature_cols_v1.pkl")
    a["tier_thresholds"] = joblib.load(MODELS_DIR / "tier_thresholds_v1.pkl")

    feat_dir = DATA_DIR / "features"
    watershed_static = pd.read_csv(feat_dir / "watershed_static_features.csv")
    slope_static = pd.read_csv(feat_dir / "slope_units_features.csv")
    tc_df = pd.read_csv(feat_dir / "watershed_time_of_concentration_v2.csv")[["watershed_id", "Tc_hours"]]
    routes = pd.read_csv(feat_dir / "village_safe_zone_routes.csv")

    # Fallback soil moisture = training-set mean (used only if ERA5 is unreachable)
    a["flood_sm_fallback"] = _mean_col(feat_dir / "final_strict_leadtime_dataset.csv", "soil_moisture")
    a["landslide_sm_fallback"] = _mean_col(feat_dir / "final_training_dataset_hard.csv", "soil_moisture")

    # ---- villages (cleaned, uid-based; never join on name) ----
    villages = gpd.read_file(DATA_DIR / "boundaries" / "village_lookup.geojson")
    v_proj = villages.to_crs(UTM)
    v_xy = np.column_stack([v_proj.geometry.x.values, v_proj.geometry.y.values])
    v_tree = cKDTree(v_xy)
    a["village_uid"] = villages["village_uid"].astype(int).values
    a["village_name"] = villages["name"].astype(str).values

    # safe zone per village_uid; a village that is its own safe zone gets
    # NO recommendation (already safe terrain), per bug #5 in the handoff.
    safe = {}
    for r in routes.itertuples(index=False):
        if pd.isna(r.nearest_safe_zone) or r.nearest_safe_zone == r.village:
            continue
        dist = None if pd.isna(r.route_distance_km) else float(r.route_distance_km)
        safe[int(r.village_uid)] = {"name": str(r.nearest_safe_zone), "distance_km": dist}
    a["safe_zone_by_uid"] = safe

    # ---- watersheds ----
    watersheds = gpd.read_file(DATA_DIR / "watersheds" / "watersheds.geojson")
    if watersheds.crs is None:
        watersheds = watersheds.set_crs("EPSG:4326")
    watersheds["watershed_id"] = watersheds["watershed_id"].astype(int)
    ws_base = _centroids_and_nearest_village(watersheds, "watershed_id", v_xy, v_tree)
    ws_table = (ws_base.merge(watershed_static, on="watershed_id", how="inner")
                       .merge(tc_df, on="watershed_id", how="left")
                       .reset_index(drop=True))
    lost = len(watersheds) - len(ws_table)
    if lost:
        print(f"WARNING: {lost} watersheds have no row in watershed_static_features.csv - not scored")
    a["ws_table"] = ws_table
    ws_geom = dict(zip(watersheds["watershed_id"], watersheds.geometry))
    a["ws_geoms"] = [ws_geom[i] for i in ws_table["watershed_id"]]
    a["flood_static_cols"] = [c for c in a["flood_feature_cols"]
                              if c not in ("rainfall_mm", "soil_moisture")]

    # ---- slope units ----
    slope_units = gpd.read_file(DATA_DIR / "dem" / "slope_units.geojson")
    if slope_units.crs is None:
        slope_units = slope_units.set_crs("EPSG:4326")
    slope_units["slope_unit_id"] = slope_units["slope_unit_id"].astype(int)
    su_base = _centroids_and_nearest_village(slope_units, "slope_unit_id", v_xy, v_tree)
    su_table = su_base.merge(slope_static, on="slope_unit_id", how="inner").reset_index(drop=True)
    lost = len(slope_units) - len(su_table)
    if lost:
        print(f"WARNING: {lost} slope units have no row in slope_units_features.csv - not scored")
    a["su_table"] = su_table
    su_geom = dict(zip(slope_units["slope_unit_id"], slope_units.geometry))
    a["su_geoms"] = [su_geom[i] for i in su_table["slope_unit_id"]]
    a["landslide_static_cols"] = [c for c in a["landslide_feature_cols"]
                                  if c not in ("rain_1d", "rain_3d", "rain_7d", "soil_moisture")]

    try:
        a["landslide_validated_units"] = set(pd.read_csv(
            feat_dir / "final_training_dataset_hard.csv", usecols=["slope_unit_id"]
        )["slope_unit_id"].dropna().astype(int))
    except Exception as e:
        print(f"WARNING: could not read validated landslide units ({e}) - all slope units will be assessed")
        a["landslide_validated_units"] = set()

    missing = [c for c in a["flood_static_cols"] if c not in ws_table.columns] + \
              [c for c in a["landslide_static_cols"] if c not in su_table.columns]
    if missing:
        raise RuntimeError(f"Feature columns the models expect are missing from the tables: {missing}")

    a["_shape_cache"] = {}
    print(f"Artifacts loaded: {len(ws_table)} watersheds, {len(su_table)} slope units, "
          f"{len(villages)} villages, {len(safe)} villages with a safe-zone route.")
    return a


# ---------------------------------------------------------------------------
# 2a. Rainfall: NASA IMERG Early Run (half-hourly), fetched ONCE per cycle
# ---------------------------------------------------------------------------
_EARTHDATA_OK = False
_GRANULE_CACHE = {}     # filename -> (datetime_utc, 2D mm array north-up); persists across cycles
_RAIN_AXES = {}         # {"lats": ..., "lons": ...}


def _earthdata_login():
    """Non-interactive on purpose - a scheduler cannot answer a password prompt."""
    global _EARTHDATA_OK
    if _EARTHDATA_OK:
        return
    import earthaccess
    for strategy in ("netrc", "environment"):
        try:
            auth = earthaccess.login(strategy=strategy)
            if getattr(auth, "authenticated", False):
                _EARTHDATA_OK = True
                return
        except Exception:
            continue
    raise RuntimeError(
        "NASA Earthdata login failed non-interactively. Create ~/.netrc containing "
        "'machine urs.earthdata.nasa.gov login <user> password <pass>' (chmod 600), "
        "or set EARTHDATA_USERNAME / EARTHDATA_PASSWORD.")


def _read_granule(path):
    """One IMERG Early Run HDF5 -> (timestamp, mm-in-30-min array [lat desc, lon asc], lats, lons).
    Structure learned the hard way: group 'Grid', variable 'precipitation',
    dims (time, lon, lat), global 3600x1800 grid -> clip BEFORE loading."""
    import xarray as xr
    m = _GRANULE_RE.search(path.name)
    ts = datetime.strptime(m.group(1) + m.group(2), "%Y%m%d%H%M%S").replace(tzinfo=timezone.utc)
    with xr.open_dataset(path, group="Grid", engine="h5netcdf") as ds:
        da = ds["precipitation"]
        if "time" in da.dims:
            da = da.isel(time=0)
        lat_ascending = bool(ds["lat"].values[0] < ds["lat"].values[-1])
        lat_slice = slice(BBOX[1], BBOX[3]) if lat_ascending else slice(BBOX[3], BBOX[1])
        da = da.sel(lon=slice(BBOX[0], BBOX[2]), lat=lat_slice).transpose("lat", "lon")
        arr = da.values.astype("float64")
        lats = da["lat"].values
        lons = da["lon"].values
    if lats[0] < lats[-1]:                            # make north-up
        arr, lats = arr[::-1, :], lats[::-1]
    arr = np.where(np.isfinite(arr) & (arr >= 0), arr, 0.0) * 0.5   # mm/hr rate * 0.5 hr
    return ts, arr, lats, lons


def _fetch_rainfall_grids(now, warnings):
    import earthaccess
    _earthdata_login()
    start = now - timedelta(days=GRANULE_LOOKBACK_DAYS)

    results, last_err = None, None
    for attempt in range(3):                          # intermittent SSL/network blips are real here
        try:
            results = earthaccess.search_data(
                short_name="GPM_3IMERGHHE",
                temporal=(start.strftime("%Y-%m-%dT%H:%M:%S"), now.strftime("%Y-%m-%dT%H:%M:%S")),
                bounding_box=BBOX)
            break
        except Exception as e:
            last_err = e
            time.sleep(5 * (attempt + 1))
    if not results:
        raise RuntimeError(f"No IMERG Early Run granules available (search error: {last_err})")

    try:
        earthaccess.download(results, str(REALTIME_DIR))   # skips files already on disk
    except Exception as e:
        warnings.append(f"IMERG download reported an error ({type(e).__name__}: {e}); using granules already on disk")

    on_disk = {p.name: p for p in REALTIME_DIR.glob("3B-HHR-E*.HDF5")}
    # prune old files + cache entries
    for name, p in list(on_disk.items()):
        m = _GRANULE_RE.search(name)
        if not m:
            continue
        ts = datetime.strptime(m.group(1) + m.group(2), "%Y%m%d%H%M%S").replace(tzinfo=timezone.utc)
        if ts < start - timedelta(days=1):
            try:
                p.unlink()
            except OSError:
                pass
            on_disk.pop(name)
            _GRANULE_CACHE.pop(name, None)

    failed = 0
    for name, p in on_disk.items():
        if name in _GRANULE_CACHE or not _GRANULE_RE.search(name):
            continue
        try:
            ts, arr, lats, lons = _read_granule(p)
            _GRANULE_CACHE[name] = (ts, arr)
            _RAIN_AXES["lats"], _RAIN_AXES["lons"] = lats, lons
        except Exception:
            failed += 1
    if failed:
        warnings.append(f"{failed} IMERG granule(s) could not be read and were skipped")

    grans = sorted((v for k, v in _GRANULE_CACHE.items() if k in on_disk and v[0] >= start),
                   key=lambda x: x[0])
    if not grans:
        raise RuntimeError("IMERG granules were downloaded but none could be read")
    return grans


def _aggregate_rainfall(grans, now, warnings):
    newest = grans[-1][0]
    age_h = (now - newest).total_seconds() / 3600
    if age_h > MAX_GRANULE_AGE_HOURS:
        raise RuntimeError(f"Newest IMERG granule is {age_h:.1f}h old (limit {MAX_GRANULE_AGE_HOURS}h) - "
                           f"refusing to score on stale rainfall")

    shape = grans[-1][1].shape
    rain_24h = np.zeros(shape)
    n24 = 0
    daily, counts = {}, {}
    for ts, arr in grans:
        if ts > newest - timedelta(hours=24):
            rain_24h += arr
            n24 += 1
        d = ts.date()
        daily[d] = daily.get(d, np.zeros(shape)) + arr
        counts[d] = counts.get(d, 0) + 1
    if n24 < 40:
        warnings.append(f"Trailing-24h rainfall built from only {n24}/48 granules")
    return {
        "rain_24h": rain_24h, "rain_24h_granules": n24,
        "daily": daily, "daily_counts": counts,
        "newest_granule_utc": newest.isoformat(), "granule_age_hours": round(age_h, 1),
        "rain_lats": _RAIN_AXES["lats"], "rain_lons": _RAIN_AXES["lons"],
    }


# ---------------------------------------------------------------------------
# 2b. Soil moisture: ERA5-Land, best available, cached (it only changes daily)
# ---------------------------------------------------------------------------
_SM_CACHE = {"grid": None, "lats": None, "lons": None, "date": None, "fetched_at": None}


def _read_swvl1(path):
    import xarray as xr
    with xr.open_dataset(path) as ds:
        da = ds["swvl1"].squeeze()
        while da.ndim > 2:                            # e.g. leftover time/expver dim
            da = da.isel({da.dims[0]: 0})
        da = da.transpose("latitude", "longitude")
        grid = da.values.astype("float64")
        lats, lons = da["latitude"].values, da["longitude"].values
    if lats[0] < lats[-1]:
        grid, lats = grid[::-1, :], lats[::-1]
    if not np.isfinite(grid).any() or np.nanmin(grid) < 0 or np.nanmax(grid) > 1:
        raise ValueError("soil moisture grid failed sanity check (expected values in 0..1)")
    return grid, lats, lons


def _fetch_era5_soil_moisture(now):
    import cdsapi
    c = cdsapi.Client()
    deadline = time.monotonic() + SOIL_MOISTURE_BUDGET_SECONDS
    last_err = None
    for days_back in range(5, 12):                    # ERA5-Land normally lags ~5 days
        for attempt in range(2):
            if time.monotonic() > deadline:
                raise RuntimeError(f"ERA5-Land fetch exceeded {SOIL_MOISTURE_BUDGET_SECONDS}s budget ({last_err})")
            d = (now - timedelta(days=days_back)).date()
            target = REALTIME_DIR / f"era5_sm_{d:%Y%m%d}.download"
            try:
                c.retrieve("reanalysis-era5-land", {
                    "variable": ["volumetric_soil_water_layer_1"],
                    "year": str(d.year), "month": f"{d.month:02d}", "day": f"{d.day:02d}",
                    "time": ["12:00"],
                    "area": [BBOX[3] + 0.0, BBOX[0], BBOX[1], BBOX[2]],   # N, W, S, E
                    "format": "netcdf",
                }, str(target))
                if zipfile.is_zipfile(target):        # CDS wraps netcdf in a zip
                    with zipfile.ZipFile(target) as z, tempfile.TemporaryDirectory() as td:
                        nc = next(n for n in z.namelist() if n.endswith(".nc"))
                        z.extract(nc, td)
                        grid, lats, lons = _read_swvl1(Path(td) / nc)
                else:
                    grid, lats, lons = _read_swvl1(target)
                try:
                    target.unlink()
                except OSError:
                    pass
                return {"grid": grid, "lats": lats, "lons": lons, "date": d, "days_back": days_back}
            except Exception as e:
                last_err = e
                time.sleep(2)
    raise RuntimeError(f"ERA5-Land soil moisture unavailable for the last 11 days ({last_err})")


def _get_soil_moisture_grid(now, warnings):
    fetched_at = _SM_CACHE["fetched_at"]
    if fetched_at and (now - fetched_at) < timedelta(hours=SOIL_MOISTURE_TTL_HOURS):
        return dict(_SM_CACHE)
    try:
        got = _fetch_era5_soil_moisture(now)
        _SM_CACHE.update(grid=got["grid"], lats=got["lats"], lons=got["lons"],
                         date=got["date"], fetched_at=now)
        return dict(_SM_CACHE)
    except Exception as e:
        if _SM_CACHE["grid"] is not None:
            warnings.append(f"Soil moisture refresh failed ({e}); reusing last good grid from {_SM_CACHE['date']}")
            return dict(_SM_CACHE)
        warnings.append(f"Soil moisture unavailable ({e}); using climatological fallback for ALL units")
        return None


def fetch_shared_environmental_grid(artifacts, now, warnings):
    """The ONE network-bound step per cycle."""
    grans = _fetch_rainfall_grids(now, warnings)
    env = _aggregate_rainfall(grans, now, warnings)
    env["sm"] = _get_soil_moisture_grid(now, warnings)
    env["fetched_at"] = datetime.now(timezone.utc).isoformat()
    return env


# ---------------------------------------------------------------------------
# 3. Grid <-> unit indexing (computed once per grid geometry, then reused)
# ---------------------------------------------------------------------------
def _nearest_idx(axis, values):
    return np.abs(axis[None, :] - np.asarray(values)[:, None]).argmin(axis=1)


def _ensure_indices(art, env):
    from rasterio.features import rasterize
    from rasterio.transform import from_origin

    lats, lons = env["rain_lats"], env["rain_lons"]
    sig = (len(lats), len(lons), round(float(lats[0]), 4), round(float(lons[0]), 4))
    if art.get("_rain_sig") != sig:
        res_lat = abs(float(lats[0] - lats[1]))
        res_lon = abs(float(lons[1] - lons[0]))
        transform = from_origin(float(lons.min()) - res_lon / 2, float(lats.max()) + res_lat / 2, res_lon, res_lat)
        shape = (len(lats), len(lons))
        n_pix = shape[0] * shape[1]

        # Watersheds: mean of every pixel the polygon touches (all_touched=True),
        # exactly how the training rainfall was built. Weights matrix -> one matmul per cycle.
        ws = art["ws_table"]
        rows, cols, vals = [], [], []
        for i, geom in enumerate(art["ws_geoms"]):
            mask = rasterize([(geom, 1)], out_shape=shape, transform=transform,
                             all_touched=True, fill=0, dtype="uint8")
            pix = np.flatnonzero(mask)
            if pix.size == 0:                          # polygon outside grid -> nearest pixel to centroid
                r = _nearest_idx(lats, [ws["cent_lat"].iat[i]])[0]
                c = _nearest_idx(lons, [ws["cent_lon"].iat[i]])[0]
                pix = np.array([r * shape[1] + c])
            rows.extend([i] * pix.size)
            cols.extend(pix.tolist())
            vals.extend([1.0 / pix.size] * pix.size)
        art["_ws_W"] = sparse.csr_matrix((vals, (rows, cols)), shape=(len(ws), n_pix))

        # Slope units: nearest pixel to centroid (how landslide training was built)
        su = art["su_table"]
        art["_su_rain_rc"] = (_nearest_idx(lats, su["cent_lat"].values),
                              _nearest_idx(lons, su["cent_lon"].values))
        art["_rain_sig"] = sig

    sm = env.get("sm")
    if sm is not None:
        sm_sig = (len(sm["lats"]), len(sm["lons"]), round(float(sm["lats"][0]), 4), round(float(sm["lons"][0]), 4))
        if art.get("_sm_sig") != sm_sig:
            ws, su = art["ws_table"], art["su_table"]
            art["_ws_sm_rc"] = (_nearest_idx(sm["lats"], ws["cent_lat"].values),
                                _nearest_idx(sm["lons"], ws["cent_lon"].values))
            art["_su_sm_rc"] = (_nearest_idx(sm["lats"], su["cent_lat"].values),
                                _nearest_idx(sm["lons"], su["cent_lon"].values))
            art["_sm_sig"] = sm_sig


def _sample_soil_moisture(art, env, kind, n, fallback):
    sm = env.get("sm")
    if sm is None:
        return np.full(n, fallback), "climatological_fallback"
    r, c = art[f"_{kind}_sm_rc"]
    return sm["grid"][r, c], "era5-land"


# ---------------------------------------------------------------------------
# 4. Output helpers
# ---------------------------------------------------------------------------
def _tiers(scores, thr):
    return np.select([scores >= thr["Red"], scores >= thr["Orange"], scores >= thr["Yellow"]],
                     ["Red", "Orange", "Yellow"], default="Green")


def _tier_counts(tiers):
    s = pd.Series(tiers).value_counts().to_dict()
    out = {t: int(s.get(t, 0)) for t in TIER_ORDER}
    if "NotAssessed" in s:
        out["NotAssessed"] = int(s["NotAssessed"])
    return out


def _publish_mask(tiers):
    rank = pd.Series(tiers).map({t: i for i, t in enumerate(TIER_ORDER)}).values
    return rank >= TIER_ORDER.index(PUBLISH_MIN_TIER)


def _village_label(name, dist_m):
    if dist_m > FAR_VILLAGE_THRESHOLD_M:
        return (f"{name} (nearest known settlement, {dist_m / 1000:.1f}km away - "
                f"area may be sparsely populated)")
    return name


def _danger_shape(art, kind, geom):
    """Simplified GeoJSON Polygon (exterior ring first - what js/live-feed.js reads).
    A MultiPolygon is reduced to its largest part and flagged as partial."""
    key = (kind, id(geom))
    hit = art["_shape_cache"].get(key)
    if hit is not None:
        return hit
    g = geom.simplify(min(0.0005, (geom.area ** 0.5) * 0.05), preserve_topology=True)
    partial = False
    if isinstance(g, MultiPolygon):
        parts = list(g.geoms)
        g = max(parts, key=lambda p: p.area)
        partial = len(parts) > 1
    if not isinstance(g, Polygon) or g.is_empty:
        result = (None, False)
    else:
        rings = [[[round(x, 5), round(y, 5)] for x, y in g.exterior.coords]]
        rings += [[[round(x, 5), round(y, 5)] for x, y in r.coords] for r in g.interiors]
        result = ({"type": "Polygon", "coordinates": rings}, partial)
    art["_shape_cache"][key] = result
    return result


def _sm_freshness(env, now, source):
    sm = env.get("sm")
    if sm is None:
        return {"soil_moisture_date": None, "soil_moisture_lag_days": None, "soil_moisture_source": source}
    return {"soil_moisture_date": sm["date"].isoformat(),
            "soil_moisture_lag_days": (now.date() - sm["date"]).days,
            "soil_moisture_source": source}


# ---------------------------------------------------------------------------
# 5. Vectorised scoring
# ---------------------------------------------------------------------------
def _score_floods(art, env, now):
    ws = art["ws_table"]
    n = len(ws)
    rain = art["_ws_W"] @ env["rain_24h"].ravel()
    sm, sm_src = _sample_soil_moisture(art, env, "ws", n, art["flood_sm_fallback"])

    X = ws[art["flood_static_cols"]].copy()
    X["rainfall_mm"], X["soil_moisture"] = rain, sm
    scores = art["flood_model"].predict_proba(X[art["flood_feature_cols"]])[:, 1]
    tiers = _tiers(scores, art["tier_thresholds"]["flood"])

    fresh = _sm_freshness(env, now, sm_src)
    fresh["rainfall_granules_used"] = env["rain_24h_granules"]
    fresh["rainfall_newest_granule_utc"] = env["newest_granule_utc"]

    stamp = now.strftime("%Y%m%d-%H%M")
    alerts = []
    for i in np.flatnonzero(_publish_mask(tiers)):
        wid = int(ws["watershed_id"].iat[i])
        vidx = int(ws["village_idx"].iat[i])
        tier = str(tiers[i])
        tc = ws["Tc_hours"].iat[i]
        eta = round(float(tc), 2) if tier in ("Orange", "Red") and pd.notna(tc) else None
        shape, partial = _danger_shape(art, "ws", art["ws_geoms"][i])
        loc = {"watershed_id": wid,
               "village": _village_label(art["village_name"][vidx], float(ws["village_dist_m"].iat[i]))}
        if shape:
            loc["danger_area_shape"] = shape
            if partial:
                loc["danger_area_shape_is_partial"] = True
        alerts.append({
            "alert_id": f"UK-WS-{wid}-{stamp}",
            "generated_at": now.isoformat(),
            "hazard_type": "flood",
            "location": loc,
            "risk_score": round(float(scores[i]), 4),
            "risk_tier": tier,
            "expected_time_to_impact_hours": eta,
            "nearest_safe_zone": art["safe_zone_by_uid"].get(int(art["village_uid"][vidx])),
            "model_version": "vajra-flood-v1",
            "data_freshness": dict(fresh),
        })
    return alerts, _tier_counts(tiers)


def _landslide_windows(env, now, warnings):
    """rain_1d / rain_3d / rain_7d grids, defined exactly as in training:
    sums of COMPLETE UTC days before today (unless the flag says otherwise)."""
    shape = env["rain_24h"].shape
    start = 0 if INCLUDE_TODAY_IN_LANDSLIDE_WINDOWS else 1
    today = now.date()
    complete = True
    per_day = []
    for k in range(start, start + 7):
        day = today - timedelta(days=k)
        per_day.append(env["daily"].get(day, np.zeros(shape)))
        need = 1 if (k == 0 and INCLUDE_TODAY_IN_LANDSLIDE_WINDOWS) else MIN_GRANULES_PER_FULL_DAY
        if env["daily_counts"].get(day, 0) < need:
            complete = False
    if not complete:
        warnings.append("One or more days in the 7-day landslide rainfall window are incomplete "
                        "(missing IMERG granules) - rain_3d/rain_7d may be underestimated")
    return per_day[0], sum(per_day[:3]), sum(per_day[:7]), complete


def _score_landslides(art, env, now, warnings):
    su = art["su_table"]
    n = len(su)
    g1, g3, g7, complete = _landslide_windows(env, now, warnings)
    r, c = art["_su_rain_rc"]
    sm, sm_src = _sample_soil_moisture(art, env, "su", n, art["landslide_sm_fallback"])

    X = su[art["landslide_static_cols"]].copy()
    X["rain_1d"], X["rain_3d"], X["rain_7d"] = g1[r, c], g3[r, c], g7[r, c]
    X["soil_moisture"] = sm
    scores = art["landslide_model"].predict_proba(X[art["landslide_feature_cols"]])[:, 1]
    tiers = _tiers(scores, art["tier_thresholds"]["landslide"])
    n_assessed = n
    if LANDSLIDE_ASSESS_ONLY_VALIDATED_UNITS:
        if art["landslide_validated_units"]:
            assessed = su["slope_unit_id"].isin(art["landslide_validated_units"]).values
            tiers = np.where(assessed, tiers, "NotAssessed")
            n_assessed = int(assessed.sum())
        else:
            warnings.append("Landslide validated-unit list unavailable - scoring ALL slope units (unvalidated terrain included)")
    art["_landslide_units_assessed"] = n_assessed

    fresh = _sm_freshness(env, now, sm_src)
    fresh["rainfall_window_complete"] = complete
    fresh["rainfall_windows_exclude_today"] = not INCLUDE_TODAY_IN_LANDSLIDE_WINDOWS

    stamp = now.strftime("%Y%m%d-%H%M")
    alerts = []
    for i in np.flatnonzero(_publish_mask(tiers)):
        sid = int(su["slope_unit_id"].iat[i])
        vidx = int(su["village_idx"].iat[i])
        shape, partial = _danger_shape(art, "su", art["su_geoms"][i])
        loc = {"slope_unit_id": sid,
               "village": _village_label(art["village_name"][vidx], float(su["village_dist_m"].iat[i]))}
        if shape:
            loc["danger_area_shape"] = shape
            if partial:
                loc["danger_area_shape_is_partial"] = True
        alerts.append({
            "alert_id": f"UK-SU-{sid}-{stamp}",
            "generated_at": now.isoformat(),
            "hazard_type": "landslide",
            "location": loc,
            "risk_score": round(float(scores[i]), 4),
            "risk_tier": str(tiers[i]),
            "expected_time_to_impact_hours": None,      # not modelled for landslides (per handoff)
            "nearest_safe_zone": art["safe_zone_by_uid"].get(int(art["village_uid"][vidx])),
            "model_version": "vajra-landslide-v1",
            "data_freshness": dict(fresh),
        })
    return alerts, _tier_counts(tiers)


# ---------------------------------------------------------------------------
# 6. Full cycle (scheduler.py calls this every 30 min)
# ---------------------------------------------------------------------------
def run_batch_cycle(artifacts):
    t0 = time.monotonic()
    warnings = []
    now = datetime.now(timezone.utc)

    env = fetch_shared_environmental_grid(artifacts, now, warnings)   # the ONE slow step
    _ensure_indices(artifacts, env)

    flood_alerts, flood_counts = _score_floods(artifacts, env, now)
    slide_alerts, slide_counts = _score_landslides(artifacts, env, now, warnings)

    return {
        "cycle_generated_at": now.isoformat(),
        "cycle_duration_seconds": round(time.monotonic() - t0, 1),
        "environmental_grid_fetched_at": env["fetched_at"],
        "flood_alerts": flood_alerts,
        "landslide_alerts": slide_alerts,
        "summary": {
            "publish_min_tier": PUBLISH_MIN_TIER,
            "flood_tier_counts_all_units": flood_counts,
            "landslide_tier_counts_all_units": slide_counts,
            "watersheds_scored": len(artifacts["ws_table"]),
            "slope_units_scored": len(artifacts["su_table"]),
            "landslide_units_assessed": artifacts.get("_landslide_units_assessed"),
            "newest_rainfall_granule_utc": env["newest_granule_utc"],
            "newest_rainfall_granule_age_hours": env["granule_age_hours"],
        },
        "warnings": warnings,
    }


def write_cache_atomic(payload):
    """Write to a temp file then rename, so the API never reads a half-written file."""
    tmp_path = CACHE_FILE.with_suffix(".tmp")
    with open(tmp_path, "w") as f:
        json.dump(payload, f, indent=1, default=str)
    tmp_path.replace(CACHE_FILE)


if __name__ == "__main__":
    print("Loading static artifacts...")
    artifacts = load_static_artifacts()
    print("Running one batch cycle...")
    payload = run_batch_cycle(artifacts)
    write_cache_atomic(payload)
    s = payload["summary"]
    print(f"\nWrote {len(payload['flood_alerts'])} flood + {len(payload['landslide_alerts'])} "
          f"landslide alerts (>= {s['publish_min_tier']}) to {CACHE_FILE} "
          f"in {payload['cycle_duration_seconds']}s")
    print("Flood tiers (all units):    ", s["flood_tier_counts_all_units"])
    print("Landslide tiers (all units):", s["landslide_tier_counts_all_units"])
    for w in payload["warnings"]:
        print("WARNING:", w)

"""
VAJRA ML Service - API Layer
=============================
Serves the cache written by predict_batch.py / scheduler.py. It NEVER runs a
live prediction - requests return in milliseconds regardless of how slow
NASA/Copernicus are.

Run with:
    uvicorn api_server:app --host 0.0.0.0 --port 8001 --reload

Changes vs the scaffold:
  * FIX: '/api/alerts/errors' was declared AFTER '/api/alerts/{alert_id}', so
    FastAPI matched "errors" as an alert id and returned 404. Fixed-path
    routes must come before parameterised ones. The endpoint is now
    '/api/diagnostics' (per-unit errors no longer exist - scoring is
    vectorised, so a failure aborts the whole cycle and the last good cache
    keeps being served; what matters now is warnings + summary + cache age).
  * '/api/health' now reports cache age so the frontend can show honest
    staleness instead of implying old data is current.
"""

import json
from datetime import datetime, timezone
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

CACHE_FILE = Path(__file__).parent / "cache" / "latest_predictions.json"
STALE_AFTER_MINUTES = 90   # 3 missed 30-min cycles

app = FastAPI(title="VAJRA ML Prediction API", version="1.1")

# Dashboard (port 8080) and API (port 8001) are different origins.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],        # tighten to the real dashboard origin(s) before production
    allow_methods=["GET"],
    allow_headers=["*"],
)


def _load_cache():
    if not CACHE_FILE.exists():
        raise HTTPException(
            status_code=503,
            detail="No prediction cache yet - the batch scheduler hasn't completed its first cycle.")
    with open(CACHE_FILE) as f:
        return json.load(f)


def _age_minutes(cache):
    try:
        t = datetime.fromisoformat(cache["cycle_generated_at"])
        return round((datetime.now(timezone.utc) - t).total_seconds() / 60, 1)
    except Exception:
        return None


@app.get("/api/health")
def health():
    if not CACHE_FILE.exists():
        return {"status": "no_data_yet"}
    cache = _load_cache()
    age = _age_minutes(cache)
    return {
        "status": "stale" if (age is not None and age > STALE_AFTER_MINUTES) else "ok",
        "cache_age_minutes": age,
        "cycle_generated_at": cache.get("cycle_generated_at"),
        "cycle_duration_seconds": cache.get("cycle_duration_seconds"),
        "environmental_grid_fetched_at": cache.get("environmental_grid_fetched_at"),
        "flood_alert_count": len(cache.get("flood_alerts", [])),
        "landslide_alert_count": len(cache.get("landslide_alerts", [])),
        "warnings": cache.get("warnings", []),
    }


# NOTE: fixed-path routes MUST be declared before '/api/alerts/{alert_id}'.
@app.get("/api/diagnostics")
def diagnostics():
    """Not for the dashboard UI: tier counts for ALL units (including Green,
    which are not published as alerts), rainfall freshness, and warnings."""
    cache = _load_cache()
    return {
        "cache_age_minutes": _age_minutes(cache),
        "summary": cache.get("summary", {}),
        "warnings": cache.get("warnings", []),
    }


@app.get("/api/alerts")
def get_all_alerts(hazard_type: str = None, risk_tier: str = None):
    """hazard_type: 'flood' | 'landslide';  risk_tier: 'Red'|'Orange'|'Yellow'."""
    cache = _load_cache()
    alerts = []
    if hazard_type in (None, "flood"):
        alerts.extend(cache.get("flood_alerts", []))
    if hazard_type in (None, "landslide"):
        alerts.extend(cache.get("landslide_alerts", []))
    alerts = [a for a in alerts if "error" not in a]
    if risk_tier:
        alerts = [a for a in alerts if a.get("risk_tier") == risk_tier]
    return {
        "generated_at": cache.get("cycle_generated_at"),
        "cache_age_minutes": _age_minutes(cache),
        "count": len(alerts),
        "alerts": alerts,
    }


@app.get("/api/alerts/{alert_id}")
def get_alert(alert_id: str):
    cache = _load_cache()
    for a in cache.get("flood_alerts", []) + cache.get("landslide_alerts", []):
        if a.get("alert_id") == alert_id:
            return a
    raise HTTPException(status_code=404, detail=f"No alert found with id {alert_id}")

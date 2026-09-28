"""
VAJRA ML Service — API Layer
=============================
Implements Part A, Section 3, item 3 of VAJRA_DevTeam_Report_and_Handoff.md:

    "An API endpoint (e.g., FastAPI) that reads from that cache and serves
    it to the frontend — this is the actual integration point with your
    existing UI."

CRITICAL: this file must NEVER import or call predict_flood_risk_live() /
predict_landslide_risk_live() directly. It only ever reads the cache file
that predict_batch.py + scheduler.py write to. This is exactly the
architecture the report requires — the whole point is that a request to
this API returns in milliseconds, not the 4-60+ seconds a live NASA/
Copernicus call can take.

Run with:
    uvicorn api_server:app --host 0.0.0.0 --port 8001 --reload
"""

import json
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

CACHE_FILE = Path(__file__).parent / "cache" / "latest_predictions.json"

app = FastAPI(title="VAJRA ML Prediction API", version="1.0")

# The dashboard (server.py, port 8080) is a different origin from this API
# (port 8001) — CORS must be enabled or the browser will silently block
# every fetch() call from the frontend.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # tighten to your actual dashboard origin(s) before production
    allow_methods=["GET"],
    allow_headers=["*"],
)


def _load_cache():
    if not CACHE_FILE.exists():
        raise HTTPException(
            status_code=503,
            detail="No prediction cache yet — the batch scheduler hasn't completed its first cycle."
        )
    with open(CACHE_FILE) as f:
        return json.load(f)


@app.get("/api/health")
def health():
    """Lets the frontend show honest data-freshness info (in the spirit of
    the report's insistence on not implying data is more current than it
    is) rather than silently serving stale data with no indication."""
    if not CACHE_FILE.exists():
        return {"status": "no_data_yet"}
    cache = _load_cache()
    return {
        "status": "ok",
        "cycle_generated_at": cache.get("cycle_generated_at"),
        "cycle_duration_seconds": cache.get("cycle_duration_seconds"),
        "environmental_grid_fetched_at": cache.get("environmental_grid_fetched_at"),
        "flood_alert_count": len(cache.get("flood_alerts", [])),
        "landslide_alert_count": len(cache.get("landslide_alerts", [])),
    }


@app.get("/api/alerts")
def get_all_alerts(hazard_type: str = None, risk_tier: str = None):
    """Returns every cached alert, optionally filtered.
    hazard_type: 'flood' | 'landslide'
    risk_tier:   'Red' | 'Orange' | 'Yellow' | 'Green'
    """
    cache = _load_cache()
    alerts = []
    if hazard_type in (None, "flood"):
        alerts.extend(cache.get("flood_alerts", []))
    if hazard_type in (None, "landslide"):
        alerts.extend(cache.get("landslide_alerts", []))

    # Drop entries that errored during scoring rather than serving broken
    # records to the frontend silently.
    alerts = [a for a in alerts if "error" not in a]

    if risk_tier:
        alerts = [a for a in alerts if a.get("risk_tier") == risk_tier]

    return {
        "generated_at": cache.get("cycle_generated_at"),
        "count": len(alerts),
        "alerts": alerts,
    }


@app.get("/api/alerts/{alert_id}")
def get_alert(alert_id: str):
    cache = _load_cache()
    all_alerts = cache.get("flood_alerts", []) + cache.get("landslide_alerts", [])
    for a in all_alerts:
        if a.get("alert_id") == alert_id:
            return a
    raise HTTPException(status_code=404, detail=f"No alert found with id {alert_id}")


@app.get("/api/alerts/errors")
def get_scoring_errors():
    """Diagnostic endpoint — NOT for the dashboard UI. Lets you see which
    units failed to score in the last cycle without digging through logs."""
    cache = _load_cache()
    all_alerts = cache.get("flood_alerts", []) + cache.get("landslide_alerts", [])
    return [a for a in all_alerts if "error" in a]

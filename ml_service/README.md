# VAJRA ML Service — Integration Scaffold

This folder implements the architecture required in
`VAJRA_DevTeam_Report_and_Handoff.md`, Part A:

```
[scheduler.py, every 30 min]
    → predict_batch.run_batch_cycle()
      → fetch_shared_environmental_grid()   (ONE network call per cycle)
      → score_single_watershed() / score_single_slope_unit()  (fast, local, ×1029 / ×8957)
    → write_cache_atomic()  → cache/latest_predictions.json

[api_server.py, FastAPI, always running]
    → reads ONLY the cache file, never triggers a live prediction
    → serves GET /api/alerts to the dashboard

[dashboard frontend, js/live-feed.js]
    → polls GET /api/alerts every 5 min
    → merges results into VAJRA_DATA.REGIONS
```

## What's real vs. what's a stub

- **api_server.py** — fully working. Run it as-is against the sample
  `cache/latest_predictions.json` included here and the dashboard will show
  live-looking data end to end.
- **scheduler.py** — fully working as a loop/orchestrator. It will run
  today, but every cycle will produce `{"error": "scoring not wired up
  yet"}` for every unit until you fill in the `>>> WIRE UP` blocks below.
- **predict_batch.py** — the structure (batch-fetch-once, score-many-fast)
  is real and directly addresses the report's Item 1 caveat. The actual
  model-scoring logic is stubbed — every `>>> WIRE UP` comment marks a spot
  where your existing notebook functions plug in.

## How to wire it up (in order)

1. **`load_static_artifacts()`** — point `PROJECT_ROOT` at your real
   project path if it's not `~/Projects/Disaster_Management_SIH`, then add
   the geopandas reads for `watershed_geometry` / `slope_geometry` /
   `village_lookup` (marked inline).

2. **`fetch_shared_environmental_grid()`** — replace the two `None` stubs
   with your actual `get_todays_accumulated_rainfall()` and
   `get_best_available_soil_moisture()` calls from your handoff (Part B,
   item 6). This is the ONE slow network step per cycle — don't call
   anything network-bound anywhere else in this file.

3. **`score_single_watershed()` / `score_single_slope_unit()`** — this is
   where your actual `predict_flood_risk()` / `predict_landslide_risk()`
   logic goes (the versions that take already-fetched data, NOT the
   `_live` versions — those fetch internally, which is the exact per-unit
   network call this whole restructuring exists to avoid).

4. **`lookup_nearest_village()` / `lookup_nearest_safe_zone()`** — wire to
   your existing `find_nearest_village_uid()` and
   `village_safe_zone_routes.csv` lookup. Remember bug #9 from your own
   handoff: that function now returns 3 values, not 2.

5. **Item 2 (danger_area_shape)** — once `watershed_geometry` /
   `slope_geometry` are loaded in step 1, the alert-building code already
   attaches `location.danger_area_shape` automatically when present.

## Running it

```bash
pip install -r requirements.txt

# One-off test run (writes to cache/latest_predictions.json):
python predict_batch.py

# Or run the real scheduler (loops forever, every 30 min):
python scheduler.py

# In another terminal, serve the cache:
uvicorn api_server:app --host 0.0.0.0 --port 8001 --reload
```

Then open the dashboard (`python3 server.py` in the project root, port
8080) — `js/live-feed.js` polls `http://localhost:8001/api/alerts` by
default. Change `VajraLiveFeed.apiBaseUrl` in that file if you run the API
elsewhere.

## Testing the frontend without any of this running

`cache/latest_predictions.json` in this folder is a realistic, schema-exact
sample (built from the actual examples in the report). Point
`api_server.py` at it and start it — the dashboard will show live-looking
data immediately, letting you build/test the frontend independently of the
model-wiring work above.

## Known limitation surfaced by this integration (read this)

The real live schema currently has **no coordinates at all** unless
`danger_area_shape` is wired in (item 2). Until it is, `js/live-feed.js`
can only place a live alert on the map if its `watershed_id` /
`slope_unit_id` matches one of the units already hand-curated in
`js/data.js` (currently just the 4 Uttarkashi pilot slope units). Any live
alert for a unit outside that set is intentionally **not plotted** —
fabricating a location for a real hazard alert would be worse than
surfacing it as unmapped — and instead shows up in the Analyze tab and a
small warning banner on the dashboard. Wiring up `danger_area_shape` (item
2) is what actually closes this gap; until then, expect this banner to
appear for most units outside the current 4.

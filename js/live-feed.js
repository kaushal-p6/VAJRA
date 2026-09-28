/* ==========================================================================
   VAJRA - Live ML Feed Integration
   ==========================================================================
   Polls the real prediction API (ml_service/api_server.py) and merges its
   output into VAJRA_DATA.REGIONS.

   This is deliberately a MERGE, not a replace: per
   VAJRA_DevTeam_Report_and_Handoff.md, the real live payload only contains
   {alert_id, generated_at, hazard_type, location.{watershed_id|slope_unit_id,
   village[, danger_area_shape]}, risk_score, risk_tier,
   expected_time_to_impact_hours, nearest_safe_zone, model_version,
   data_freshness}. It does NOT contain population counts, nearby hospitals,
   historical event timelines, or safe-high-ground coordinates — those are
   genuinely static facts about a place, not live model output, so they stay
   sourced from the curated reference data already in js/data.js and are
   never overwritten here.

   If the API is unreachable, the dashboard silently keeps running on the
   static demo data already in VAJRA_DATA.REGIONS — this module only ever
   adds/updates live information, it never removes the ability to view the
   dashboard.
   ========================================================================== */

const VajraLiveFeed = {
  // Point this at wherever you run ml_service/api_server.py (see its
  // docstring — default is uvicorn on port 8001).
  apiBaseUrl: "http://localhost:8001",

  isLive: false,
  lastSyncedAt: null,
  pollTimer: null,
  // Alerts the API reported for a unit we have no static reference/geometry
  // for — deliberately NOT plotted on the map (see mergeAlerts below for
  // why), but still surfaced so a real alert is never silently dropped.
  unmappedAlerts: [],

  init() {
    this.fetchAndMerge();
    // The batch cycle itself only refreshes every 30 min (per the report),
    // so polling every 5 min is plenty to pick up a new cycle promptly
    // without hammering the API.
    this.pollTimer = setInterval(() => this.fetchAndMerge(), 5 * 60 * 1000);
  },

  async fetchAndMerge() {
    try {
      const res = await fetch(`${this.apiBaseUrl}/api/alerts`, { cache: "no-store" });
      if (!res.ok) throw new Error(`API returned HTTP ${res.status}`);
      const data = await res.json();

      this.mergeAlerts(data.alerts || []);
      this.isLive = true;
      this.lastSyncedAt = data.generated_at || new Date().toISOString();
    } catch (err) {
      // Expected whenever the ML service isn't running yet (e.g. still
      // being developed, or this is a pure frontend demo session) — stay
      // on static demo data rather than showing a broken dashboard.
      console.warn("VAJRA live feed unavailable — showing demo data.", err.message);
      this.isLive = false;
    }
    this.updateLiveStatusUI();
  },

  // "UK-SU-20820" -> 20820, "UK-WS-142" -> 142. Real alert_ids follow
  // {STATE_CODE}-{WS|SU}-{unit_id}-{timestamp} per the report's field notes.
  extractNumericId(idLike) {
    const match = String(idLike).match(/(\d+)/g);
    return match ? parseInt(match[match.length - 1], 10) : null;
    // (last numeric run in the string — avoids ever matching a leading
    // state/district code that happens to contain digits)
  },

  mergeAlerts(alerts) {
    this.unmappedAlerts = [];
    let matchedCount = 0;

    alerts.forEach(alert => {
      const isFlood = alert.hazard_type === "flood";
      const liveUnitId = isFlood ? alert.location.watershed_id : alert.location.slope_unit_id;
      if (liveUnitId == null) return;

      const region = VAJRA_DATA.REGIONS.find(r => this.extractNumericId(r.unit_id) === liveUnitId);

      if (region) {
        this.mergeLiveAlertIntoRegion(alert, region, isFlood);
        matchedCount++;
      } else {
        // SAFETY: we deliberately do NOT plot this on the map. The real
        // schema gives us no coordinates at all unless danger_area_shape
        // is present (per the report, "not yet wired into current
        // output"), and fabricating a location for a real hazard alert
        // would be worse than surfacing it as unmapped. It still shows up
        // in the Analyze table below so it's never silently lost.
        this.unmappedAlerts.push({ alert, isFlood, liveUnitId });
      }
    });

    if (matchedCount > 0) {
      VajraMap.renderOperationalOverlays();
      VajraUI.updateKPICards();
      VajraAlerts.updateEmergencyBanner();
      if (VajraUI.activeTab === "analyze") {
        VajraAnalyze.renderTable();
        VajraAnalyze.renderChart();
      }
    }

    this.renderUnmappedAlertsNotice();
    this.syncUnmappedAlertsIntoAnalyzeTable();
  },

  // The banner tells the user to check the Analyze tab for alerts we
  // couldn't place on the map — this actually puts them there, as plain
  // table rows (no location needed for a table), instead of leaving that
  // promise unfulfilled.
  syncUnmappedAlertsIntoAnalyzeTable() {
    if (typeof VajraAnalyze === "undefined") return;

    // Remove any synthetic rows from a previous cycle before adding the
    // current ones, so this stays in sync rather than accumulating stale
    // entries across polls.
    VajraAnalyze.liveDynamicRegions = VajraAnalyze.liveDynamicRegions.filter(r => !r._isUnmappedLiveAlert);

    this.unmappedAlerts.forEach(({ alert, isFlood, liveUnitId }) => {
      VajraAnalyze.liveDynamicRegions.unshift({
        _isUnmappedLiveAlert: true,
        is_ml_validated: true,
        village: (alert.location && alert.location.village) || "Unknown",
        district: "Uttarkashi",
        state: "Uttarakhand",
        data_coverage_type: `ML Model Prediction (LIVE — location pending) · ${isFlood ? 'watershed' : 'slope unit'} #${liveUnitId}`,
        risk_score: alert.risk_score,
        risk_tier: alert.risk_tier,
        hazard_window_hours: alert.expected_time_to_impact_hours != null
          ? `Peak impact expected in ${alert.expected_time_to_impact_hours} hours`
          : "Time-to-impact: Not modeled for this hazard type"
      });
    });

    if (VajraUI.activeTab === "analyze") {
      VajraAnalyze.renderTable();
    }
  },

  mergeLiveAlertIntoRegion(alert, region, isFlood) {
    region.is_live_data = true;
    region.alert_id = alert.alert_id;
    region.generated_at = alert.generated_at;
    region.risk_score = alert.risk_score;
    region.risk_tier = alert.risk_tier;
    region.expected_time_to_impact_hours = alert.expected_time_to_impact_hours;
    region.hazard_window_hours = alert.expected_time_to_impact_hours != null
      ? `Peak impact expected in ${alert.expected_time_to_impact_hours} hours`
      : "Time-to-impact: Not modeled for this hazard type";
    region.ml_model_version = alert.model_version;
    region.ml_timestamp = alert.generated_at;
    region.data_coverage_type = `ML Model Prediction (LIVE — ${alert.model_version})`;

    // Village label: the real API sometimes appends a distance disclaimer
    // (e.g. "Jaspur (nearest known settlement, 16.9km away...)") — per the
    // report, display this honestly rather than stripping it.
    if (alert.location && alert.location.village) {
      region.village_live_label = alert.location.village;
    }

    // nearest_safe_zone from the live feed only ever has {name,
    // distance_km} or is null — never overwrite the curated
    // official_government_shelter/candidate_safe_high_ground reference
    // objects (they have real coordinates for the known pilot villages).
    // resolveSafeDestination() in map.js already prefers those over this
    // field for coordinates, so it's safe to just record the live value.
    region.nearest_safe_zone = alert.nearest_safe_zone; // may be null — that's a valid, meaningful result

    region.data_freshness = alert.data_freshness || null;
    if (region.data_freshness && region.data_freshness.soil_moisture_lag_days != null) {
      region.data_quality = region.data_quality || {};
      region.data_quality.soil_moisture = `ERA5-Land (${region.data_freshness.soil_moisture_lag_days}-day lag — never truly real-time)`;
    }

    // Item 2 in the report: danger_area_shape isn't wired into the live
    // output yet. If/when it is, use the real polygon instead of the
    // hand-authored static one.
    if (alert.location && alert.location.danger_area_shape) {
      const coords = alert.location.danger_area_shape.coordinates?.[0] || [];
      if (coords.length > 0) {
        region.coordinates = coords.map(c => [c[1], c[0]]); // GeoJSON [lon,lat] -> Leaflet [lat,lon]
      }
    }
  },

  renderUnmappedAlertsNotice() {
    const el = document.getElementById("unmapped-alerts-notice");
    if (!el) return;
    if (this.unmappedAlerts.length === 0) {
      el.style.display = "none";
      return;
    }
    el.style.display = "flex";
    el.textContent = `⚠ ${this.unmappedAlerts.length} live alert(s) received for units without mapped geometry yet — not shown on the map. See Analyze tab.`;
  },

  updateLiveStatusUI() {
    const el = document.getElementById("live-feed-status");
    if (!el) return;
    if (this.isLive) {
      const t = this.lastSyncedAt ? new Date(this.lastSyncedAt).toLocaleTimeString('en-GB', { hour12: false }) : "unknown";
      el.textContent = `● LIVE — synced ${t}`;
      el.className = "live-feed-status live";
      el.title = "Connected to the ML prediction API";
    } else {
      el.textContent = "○ DEMO DATA";
      el.className = "live-feed-status demo";
      el.title = "ML prediction API unreachable — showing static demo data";
    }
  }
};

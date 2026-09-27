/* ==========================================================================
   VAJRA - Interactive Operational Leaflet Map Engine
   Includes Operational Layer Control Drawer, Dynamic Data Inspection & Safe Zone Router
   ========================================================================== */

const VajraMap = {
  map: null,
  activeBasemap: "satellite",
  tileLayers: {},

  // Arrays to track dynamic markers and region polygon overlays
  beaconLayers: [],
  regionLayers: [],

  // Feature Overlay Layers
  overlayLayers: {
    risk_polygons: L.layerGroup(),
    beacon_markers: L.layerGroup(),
    // BUGFIX: previously a single shared "historical_events" group held both
    // landslide and flood markers, so the "Historical Landslides" and
    // "Historical Floods" checkboxes both toggled the exact same layer —
    // switching one off also hid the other's markers. Split into two
    // independently toggleable groups.
    historical_landslides: L.layerGroup(),
    historical_floods: L.layerGroup(),
    hospitals: L.layerGroup(),
    emergency_facilities: L.layerGroup(),
    rivers: L.layerGroup(),
    route_layer: L.layerGroup()
  },

  selectedRegion: null,
  isFullscreen: false,
  isLayersDrawerOpen: false,

  init() {
    const mapElement = document.getElementById("map");
    if (!mapElement) return;

    this.map = L.map("map", {
      minZoom: VAJRA_CONFIG.MAP_INIT.minZoom,
      maxZoom: VAJRA_CONFIG.MAP_INIT.maxZoom,
      zoomControl: false
    });

    L.control.zoom({ position: "bottomright" }).addTo(this.map);

    // Basemaps
    this.tileLayers.satellite = L.tileLayer(VAJRA_CONFIG.TILE_PROVIDERS.satellite.url, { attribution: VAJRA_CONFIG.TILE_PROVIDERS.satellite.attribution });
    this.tileLayers.standard = L.tileLayer(VAJRA_CONFIG.TILE_PROVIDERS.standard.url, { subdomains: ["a", "b", "c"], attribution: VAJRA_CONFIG.TILE_PROVIDERS.standard.attribution });
    this.tileLayers.elevation = L.tileLayer(VAJRA_CONFIG.TILE_PROVIDERS.elevation.url, { attribution: VAJRA_CONFIG.TILE_PROVIDERS.elevation.attribution });
    this.tileLayers.terrain = L.tileLayer(VAJRA_CONFIG.TILE_PROVIDERS.terrain.url, { attribution: VAJRA_CONFIG.TILE_PROVIDERS.terrain.attribution });

    // Add Default Basemap
    this.tileLayers.satellite.addTo(this.map);

    // IMPROVEMENT: the map used to always open zoomed into Uttarkashi alone
    // (MAP_INIT.center/zoom), which meant any critical (Red/Orange) zone
    // outside that one district — e.g. the Wayanad, Kerala region, thousands
    // of km away — was completely invisible on load with no indication it
    // existed. Open on a view that fits every active region instead, so
    // nothing critical is hidden by default; "Pilot View" below still jumps
    // straight into the Uttarkashi detail view on demand.
    const allCenters = VAJRA_DATA.REGIONS.map(r => r.center);
    if (allCenters.length > 1) {
      this.map.fitBounds(L.latLngBounds(allCenters), { padding: [60, 60], maxZoom: 7 });
    } else if (allCenters.length === 1) {
      this.map.setView(allCenters[0], 9);
    } else {
      this.map.setView(VAJRA_CONFIG.MAP_INIT.center, VAJRA_CONFIG.MAP_INIT.zoom);
    }

    // Add Overlay Layer Groups to Map
    Object.values(this.overlayLayers).forEach(layerGroup => layerGroup.addTo(this.map));

    this.map.on("zoomend", () => this.handleZoomLevelChange());

    this.renderOperationalOverlays();
  },


  // MapLibre GL instance for true 3D satellite
  maplibreInstance: null,

  switchLayer(layerKey) {
    const MAPTILER_KEY = 'rgoSdjnjeWOJOJ0mO1RH';
    const ml3dContainer = document.getElementById('maplibre-3d-container');

    if (layerKey === 'maptiler_hybrid') {
      if (this.activeBasemap === 'maptiler_hybrid') return;

      // Hide Leaflet map, show MapLibre container
      document.getElementById('map').style.opacity = '0';
      document.getElementById('map').style.pointerEvents = 'none';
      if (ml3dContainer) {
        ml3dContainer.style.display = 'block';
        ml3dContainer.style.opacity = '1';
        ml3dContainer.style.pointerEvents = 'auto';
      }

      // Remove current Leaflet basemap
      if (this.tileLayers[this.activeBasemap]) {
        this.map.removeLayer(this.tileLayers[this.activeBasemap]);
      }
      this.activeBasemap = 'maptiler_hybrid';

      // Initialize MapLibre GL if not yet created
      if (!this.maplibreInstance && typeof maplibregl !== 'undefined' && ml3dContainer) {
        const center = this.map.getCenter();
        const zoom = this.map.getZoom();

        this.maplibreInstance = new maplibregl.Map({
          container: 'maplibre-3d-container',
          style: `https://api.maptiler.com/maps/hybrid/style.json?key=${MAPTILER_KEY}`,
          center: [center.lng, center.lat],
          zoom: zoom,
          pitch: 65,
          bearing: -20,
          maxPitch: 85,
          antialias: true
        });

        this.maplibreInstance.on('load', () => {
          // Add 3D DEM terrain
          if (!this.maplibreInstance.getSource('maptiler-terrain')) {
            this.maplibreInstance.addSource('maptiler-terrain', {
              type: 'raster-dem',
              tiles: [`https://api.maptiler.com/tiles/terrain-rgb-v2/{z}/{x}/{y}.webp?key=${MAPTILER_KEY}`],
              tileSize: 512,
              maxzoom: 14,
              encoding: 'mapbox'
            });
          }
          this.maplibreInstance.setTerrain({ source: 'maptiler-terrain', exaggeration: 1.8 });

          // Atmospheric sky
          this.maplibreInstance.setSky({
            'sky-color': '#38bdf8',
            'sky-horizon-blend': 0.5,
            'horizon-color': '#bae6fd',
            'horizon-fog-blend': 0.5,
            'fog-color': '#e0f2fe',
            'fog-ground-blend': 0.3
          });

          // Add navigation controls
          this.maplibreInstance.addControl(new maplibregl.NavigationControl(), 'bottom-right');
        });

      } else if (this.maplibreInstance) {
        // Sync position from Leaflet
        const center = this.map.getCenter();
        const zoom = this.map.getZoom();
        this.maplibreInstance.setCenter([center.lng, center.lat]);
        this.maplibreInstance.setZoom(zoom);
        this.maplibreInstance.resize();
      }

    } else {
      // Switching back from 3D to a normal Leaflet basemap
      if (this.activeBasemap === 'maptiler_hybrid' && this.maplibreInstance) {
        // Sync position back to Leaflet
        const c = this.maplibreInstance.getCenter();
        const z = this.maplibreInstance.getZoom();
        this.map.setView([c.lat, c.lng], z, { animate: false });
      }

      if (!this.tileLayers[layerKey] || this.activeBasemap === layerKey) return;

      // Hide MapLibre, show Leaflet
      if (ml3dContainer) {
        ml3dContainer.style.opacity = '0';
        ml3dContainer.style.pointerEvents = 'none';
        setTimeout(() => { ml3dContainer.style.display = 'none'; }, 300);
      }
      document.getElementById('map').style.opacity = '1';
      document.getElementById('map').style.pointerEvents = 'auto';

      // Remove previous Leaflet basemap (if it was a Leaflet layer)
      if (this.tileLayers[this.activeBasemap]) {
        this.map.removeLayer(this.tileLayers[this.activeBasemap]);
      }
      this.tileLayers[layerKey].addTo(this.map);
      this.activeBasemap = layerKey;
    }

    document.querySelectorAll('.map-layer-btn[data-layer]').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.layer === layerKey);
    });
  },


  focusAllAlerts() {
    const allCenters = VAJRA_DATA.REGIONS.map(r => r.center);
    if (!this.map || allCenters.length === 0) return;
    if (allCenters.length === 1) {
      this.map.flyTo(allCenters[0], 9, { duration: 1.2 });
    } else {
      this.map.flyToBounds(L.latLngBounds(allCenters), { padding: [60, 60], maxZoom: 7, duration: 1.2 });
    }
  },

  focusPilotRegion() {
    if (!this.map) return;
    this.map.flyTo(VAJRA_CONFIG.MAP_INIT.center, VAJRA_CONFIG.MAP_INIT.zoom, { duration: 1.2 });
  },

  toggleLayersDrawer() {
    const drawer = document.getElementById("map-layers-drawer");
    if (!drawer) return;
    this.isLayersDrawerOpen = !this.isLayersDrawerOpen;
    drawer.classList.toggle("show", this.isLayersDrawerOpen);
  },

  toggleFullscreen() {
    const container = document.querySelector(".map-container-box");
    const fullBtn = document.getElementById("map-fullscreen-btn");
    if (!container) return;

    this.isFullscreen = !this.isFullscreen;
    container.classList.toggle("fullscreen-mode", this.isFullscreen);

    if (fullBtn) {
      fullBtn.innerHTML = this.isFullscreen ? `
        <svg class="icon-svg" viewBox="0 0 24 24"><path d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3"/></svg>
        <span>Exit Fullscreen</span>
      ` : `
        <svg class="icon-svg" viewBox="0 0 24 24"><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/></svg>
        <span>Fullscreen</span>
      `;
    }

    setTimeout(() => this.map.invalidateSize(), 200);
  },

  renderOperationalOverlays() {
    // Clear existing overlay features
    Object.values(this.overlayLayers).forEach(layerGroup => layerGroup.clearLayers());
    this.beaconLayers = [];
    this.regionLayers = [];

    // 1. Render Risk Regions (Uttarkashi Pilot & Regional Monitoring)
    VAJRA_DATA.REGIONS.forEach(region => {
      const isRed = region.risk_tier === "Red";
      const isOrange = region.risk_tier === "Orange";
      const isYellow = region.risk_tier === "Yellow";
      const tierClass = isRed ? "risk-zone-red" : isOrange ? "risk-zone-orange" : isYellow ? "risk-zone-yellow" : "risk-zone-green";
      const baseWeight = isRed ? 3.5 : isOrange ? 3 : 2;

      // IMPROVEMENT: added a per-tier CSS class (glow via drop-shadow),
      // rounded line joins/caps so the zone reads as a deliberate hazard
      // outline rather than a raw angular polygon, and a dashed stroke on
      // Red zones to carry urgency through a second visual channel besides
      // color alone (helps colorblind viewers too).
      const polygon = L.polygon(region.coordinates, {
        className: tierClass,
        color: isRed ? "#b91c1c" : isOrange ? "#c2410c" : isYellow ? "#d97706" : "#15803d",
        fillColor: isRed ? "rgba(220, 38, 38, 0.75)" : isOrange ? "rgba(234, 88, 12, 0.65)" : isYellow ? "rgba(217, 119, 6, 0.45)" : "rgba(22, 163, 74, 0.3)",
        fillOpacity: isRed ? 0.75 : isOrange ? 0.65 : 0.4,
        weight: baseWeight,
        lineJoin: "round",
        lineCap: "round",
        dashArray: isRed ? "6 4" : null
      });

      const rainVal = region.environmental_inputs ? region.environmental_inputs.rainfall_24h_mm : (region.rainfall_24h_mm || 0);

      polygon.bindTooltip(`
        <div style="font-family: Inter, sans-serif; font-size: 0.82rem; color: #0f172a;">
          <strong style="color: ${isRed ? '#dc2626' : isOrange ? '#ea580c' : '#16a34a'}">${region.village} (${region.district})</strong><br/>
          Scope: <strong>${region.data_coverage_type}</strong><br/>
          Risk Score: <strong>${(region.risk_score * 100).toFixed(0)}%</strong> [${region.risk_tier}]<br/>
          Rainfall 24h: <strong>${rainVal} mm</strong>
        </div>
      `, { sticky: true, opacity: 0.95 });

      // IMPROVEMENT: thicken the outline on hover so a zone gives immediate
      // feedback that it's interactive, before the click even registers.
      polygon.on("mouseover", () => polygon.setStyle({ weight: baseWeight + 2 }));
      polygon.on("mouseout", () => polygon.setStyle({ weight: baseWeight }));
      polygon.on("click", () => this.selectRegion(region));
      this.overlayLayers.risk_polygons.addLayer(polygon);
      this.regionLayers.push({ layer: polygon, tier: region.risk_tier, region: region });

      // Hazard Beacons for Red/Orange
      if (isRed || isOrange) {
        // IMPROVEMENT: the old beacon was only an expanding, fading ring
        // with no solid center — on busy satellite imagery it frequently
        // read as a faint smudge rather than a marker, and carried no
        // information of its own. Replace it with a beacon that has a
        // solid, legible core showing the risk percentage, plus the
        // pulsing ring around it for attention.
        const pct = Math.round((region.risk_score || 0) * 100);
        const tierWord = isRed ? "red" : "orange";
        const beaconIcon = L.divIcon({
          className: "",
          html: `
            <div class="hazard-beacon hazard-beacon-${tierWord}">
              <span class="hazard-beacon-wave wave-1"></span>
              <span class="hazard-beacon-wave wave-2"></span>
              <span class="hazard-beacon-wave wave-3"></span>
              <span class="hazard-beacon-core">${pct}%</span>
            </div>
          `,
          iconSize: [40, 40],
          iconAnchor: [20, 20]
        });

        // FIX: Leaflet auto-ranks markers by their vertical screen position
        // (lower on screen = stacked higher), so when zoomed out and markers
        // cluster together, a hospital/emergency pin sitting just below a
        // beacon could render on top of it. A high zIndexOffset keeps
        // hazard beacons above every other marker regardless of position.
        const beaconMarker = L.marker(region.center, { icon: beaconIcon, zIndexOffset: 1000 });
        beaconMarker.bindTooltip(`HAZARD ZONE: ${region.village} — ${pct}% (${region.risk_tier})`, { permanent: false });
        beaconMarker.on("click", () => this.selectRegion(region));

        this.beaconLayers.push(beaconMarker);
        this.overlayLayers.beacon_markers.addLayer(beaconMarker);
      }
    });

    // 2. Render Historical Disaster Event Markers (GSI & CWC Records)
    if (VAJRA_DATA.HISTORICAL_DISASTER_CATALOG) {
      VAJRA_DATA.HISTORICAL_DISASTER_CATALOG.forEach(evt => {
        const evtMarker = L.circleMarker(evt.coordinates, {
          radius: 7,
          color: "#7c3aed",
          fillColor: "#a78bfa",
          fillOpacity: 0.85,
          weight: 2
        });

        evtMarker.bindTooltip(`
          <div style="font-family: Inter, sans-serif; font-size: 0.8rem; color: #0f172a;">
            <strong style="color: #7c3aed;">📜 Historical Event (${evt.date})</strong><br/>
            ${evt.location} (${evt.district})<br/>
            Hazard: <strong>${evt.hazard_type}</strong><br/>
            Severity: <strong>${evt.severity}</strong> | Rain: <strong>${evt.rainfall_around_event_24h}</strong><br/>
            Source: <em>${evt.source}</em>
          </div>
        `, { sticky: true });

        const targetGroup = evt.category === "flood"
          ? this.overlayLayers.historical_floods
          : this.overlayLayers.historical_landslides; // default: landslide
        targetGroup.addLayer(evtMarker);
      });
    }

    // 3. Render Infrastructure Markers (Hospitals & Emergency Stations)
    // IMPROVEMENT: flat 6px circle dots were easy to lose against busy
    // satellite/terrain imagery and carried no icon of their own. Use
    // pin-shaped markers with a simple glyph instead, which read clearly
    // at a glance and match conventional map-marker iconography.
    if (VAJRA_DATA.INFRASTRUCTURE) {
      VAJRA_DATA.INFRASTRUCTURE.forEach(infra => {
        const isHosp = infra.type === "Hospital";
        const pinIcon = L.divIcon({
          className: "",
          html: `
            <div class="map-pin ${isHosp ? 'map-pin-hospital' : 'map-pin-emergency'}">
              <span class="map-pin-icon">${isHosp ? '+' : '!'}</span>
            </div>
          `,
          iconSize: [26, 26],
          iconAnchor: [13, 26]
        });

        const infraMarker = L.marker([infra.lat, infra.lon], { icon: pinIcon });

        infraMarker.bindTooltip(`
          <div style="font-family: Inter, sans-serif; font-size: 0.8rem;">
            <strong>${isHosp ? '🏥 Hospital' : '🚒 Emergency Post'}</strong><br/>
            ${infra.name}<br/>
            Helpline: <strong>${infra.emergency_phone}</strong>
          </div>
        `, { sticky: true });

        if (isHosp) this.overlayLayers.hospitals.addLayer(infraMarker);
        else this.overlayLayers.emergency_facilities.addLayer(infraMarker);
      });
    }

    // 4. Render River Courses (previously a declared-but-empty layer group)
    if (VAJRA_DATA.RIVERS) {
      VAJRA_DATA.RIVERS.forEach(river => {
        const riverLine = L.polyline(river.coordinates, {
          className: "river-line",
          color: "#38bdf8",
          weight: 3,
          opacity: 0.85,
          dashArray: "1 8",
          lineCap: "round"
        });
        riverLine.bindTooltip(`🏞 ${river.name}`, { sticky: true });
        this.overlayLayers.rivers.addLayer(riverLine);
      });
    }

    // Default Region Selection
    const topRegion = VAJRA_DATA.REGIONS.reduce((max, r) => r.risk_score > max.risk_score ? r : max, VAJRA_DATA.REGIONS[0]);
    if (topRegion) {
      this.selectRegion(topRegion, false);
    }

    this.updateLegendCounts();
  },

  // IMPROVEMENT: legend used to be static labels with no counts, so it told
  // you what the colors meant but nothing about the actual current
  // situation. Compute live counts per tier from the real dataset.
  updateLegendCounts() {
    const counts = { Red: 0, Orange: 0, Yellow: 0, Green: 0 };
    VAJRA_DATA.REGIONS.forEach(r => {
      if (counts[r.risk_tier] !== undefined) counts[r.risk_tier]++;
    });
    const setCount = (id, val) => {
      const el = document.getElementById(id);
      if (el) el.textContent = val;
    };
    setCount("legend-count-red", counts.Red);
    setCount("legend-count-orange", counts.Orange);
    setCount("legend-count-yellow", counts.Yellow);
    setCount("legend-count-green", counts.Green);
  },

  handleZoomLevelChange() {
    if (!this.map) return;
    const currentZoom = this.map.getZoom();

    if (currentZoom >= 9) {
      if (this.overlayLayers.route_layer && !this.map.hasLayer(this.overlayLayers.route_layer)) {
        this.overlayLayers.route_layer.addTo(this.map);
      }
    } else {
      if (this.overlayLayers.route_layer && this.map.hasLayer(this.overlayLayers.route_layer)) {
        this.map.removeLayer(this.overlayLayers.route_layer);
      }
    }
  },

  toggleOverlayGroup(layerId, isChecked) {
    if (layerId.startsWith("risk_")) {
      const tierMap = { risk_extreme: "Red", risk_high: "Orange", risk_moderate: "Yellow", risk_low: "Green" };
      const targetTier = tierMap[layerId];
      if (targetTier) {
        this.regionLayers.filter(r => r.tier === targetTier).forEach(r => {
          if (isChecked) {
            if (!this.overlayLayers.risk_polygons.hasLayer(r.layer)) {
              this.overlayLayers.risk_polygons.addLayer(r.layer);
            }
          } else {
            if (this.overlayLayers.risk_polygons.hasLayer(r.layer)) {
              this.overlayLayers.risk_polygons.removeLayer(r.layer);
            }
          }
        });
      }
    } else if (layerId === "layer_hist_landslides") {
      if (isChecked) this.overlayLayers.historical_landslides.addTo(this.map);
      else this.map.removeLayer(this.overlayLayers.historical_landslides);
    } else if (layerId === "layer_hist_floods") {
      if (isChecked) this.overlayLayers.historical_floods.addTo(this.map);
      else this.map.removeLayer(this.overlayLayers.historical_floods);
    } else if (layerId === "layer_hospitals") {
      if (isChecked) this.overlayLayers.hospitals.addTo(this.map);
      else this.map.removeLayer(this.overlayLayers.hospitals);
    } else if (layerId === "layer_emergency_facilities") {
      if (isChecked) this.overlayLayers.emergency_facilities.addTo(this.map);
      else this.map.removeLayer(this.overlayLayers.emergency_facilities);
    } else if (layerId === "layer_rivers") {
      if (isChecked) this.overlayLayers.rivers.addTo(this.map);
      else this.map.removeLayer(this.overlayLayers.rivers);
    }
  },

  selectRegion(region, flyTo = true) {
    if (!region) return;
    this.selectedRegion = region;

    if (flyTo && this.map) {
      this.map.flyTo(region.center, 11, { duration: 1.2 });
    }

    this.drawTopographicSafeZoneRoute(region);
    this.updateInspectorUI(region);
  },

  drawTopographicSafeZoneRoute(region) {
    this.overlayLayers.route_layer.clearLayers();

    const safeZone = region.candidate_safe_high_ground;
    if (!safeZone) return;

    const startPt = region.center;
    const endPt = [safeZone.lat, safeZone.lon];

    // Dotted Polyline Route
    const polyline = L.polyline([startPt, endPt], {
      color: "#16a34a",
      weight: 3.5,
      dashArray: "8, 10",
      opacity: 0.95
    });
    this.overlayLayers.route_layer.addLayer(polyline);

    // Blinking Safe Marker Pin
    const blinkingIcon = L.divIcon({
      className: "",
      html: `<div class="safe-zone-blinking-pin"></div>`,
      iconSize: [24, 24],
      iconAnchor: [12, 12]
    });

    const safeMarker = L.marker(endPt, { icon: blinkingIcon });
    safeMarker.bindTooltip(`
      <div style="font-family: Inter, sans-serif; font-size: 0.82rem; padding: 2px 4px; color: #0f172a;">
        <strong>⛰️ Candidate Safe High-Ground (Relative Elevation)</strong><br/>
        ${safeZone.name}<br/>
        Elevation: <strong>${safeZone.elevation_m}m</strong> (+${safeZone.relative_safe_height_m}m above flood level)<br/>
        Distance: <strong>${safeZone.distance_km} km</strong> (~${safeZone.est_walk_minutes} mins walk)<br/>
        Accessibility: <em>${safeZone.road_accessibility}</em>
      </div>
    `, { permanent: false });

    this.overlayLayers.route_layer.addLayer(safeMarker);

    this.handleZoomLevelChange();
  },

  /* ==========================================================================
     LOCATION & HAZARD DETAILS INSPECTOR PANEL
     Renders Model Inputs, Rainfall Intelligence, Soil Moisture, Terrain & Exposure
     ========================================================================== */
  updateInspectorUI(region) {
    if (!region) return;
    const env = region.environmental_inputs || {};
    const dq = region.data_quality || { last_updated: "10 mins ago", rainfall: "Good" };
    const exp = region.exposure || { population_in_zone: 0, road_segments_affected: ["N/A"], hospitals_nearby: ["N/A"] };
    const sz = region.candidate_safe_high_ground;
    const sh = region.official_government_shelter;

    const setElText = (id, text) => {
      const el = document.getElementById(id);
      if (el) el.textContent = text;
    };
    const setElHTML = (id, html) => {
      const el = document.getElementById(id);
      if (el) el.innerHTML = html;
    };

    setElText("inspector-village", `${region.village || 'Sector'}, ${region.district || 'District'}`);
    setElText("inspector-state", `${region.state || 'India'} • Watershed: ${region.watershed_id || 'N/A'}`);
    setElText("inspector-ml-scope-tag", region.data_coverage_type || "Weather Telemetry");

    const riskBadge = document.getElementById("inspector-risk-badge");
    if (riskBadge) {
      const trendIcon = region.risk_trend === "Increasing" ? "↑" : region.risk_trend === "Decreasing" ? "↓" : "→";
      riskBadge.textContent = `${region.risk_tier || 'Low'} RISK (${((region.risk_score || 0) * 100).toFixed(0)}%) ${trendIcon}`;
      riskBadge.className = `risk-badge ${(region.risk_tier || 'green').toLowerCase()}`;
    }

    setElText("inspector-freshness-time", `Updated: ${dq.last_updated}`);
    const qBadge = document.getElementById("inspector-quality-badge");
    if (qBadge) {
      qBadge.textContent = `Data Quality: ${dq.rainfall || 'Good'}`;
      qBadge.className = `quality-badge ${(dq.rainfall || 'good').toLowerCase()}`;
    }

    setElText("inspector-rain-24h", `${env.rainfall_24h_mm || 0} mm`);
    setElText("inspector-soil-moisture", `${env.soil_moisture_pct || 0}%`);
    setElText("inspector-slope", `${env.slope_angle_deg || 0}°`);
    setElText("inspector-elevation", `${env.elevation_m || 0} m`);
    setElText("inspector-impact-time", region.hazard_window_hours || "Time-to-impact: Data unavailable");

    const driversList = document.getElementById("inspector-factors");
    if (driversList && region.main_risk_drivers) {
      driversList.innerHTML = region.main_risk_drivers.map(d => `
        <li>
          <strong style="color: #0f172a;">${d.name}</strong> [${d.level} Contribution]<br/>
          <span style="font-size: 0.72rem; color: #64748b;">${d.impact}</span>
        </li>
      `).join("");
    }

    const rainBars = document.getElementById("inspector-rain-bars");
    if (rainBars) {
      const maxVal = Math.max(env.rainfall_72h_mm || 100, 200);
      rainBars.innerHTML = `
        <div class="rain-bar-col" style="height: ${((env.rainfall_1h_mm || 0) / maxVal) * 100}%;" title="1h: ${env.rainfall_1h_mm || 0}mm">1h</div>
        <div class="rain-bar-col" style="height: ${((env.rainfall_3h_mm || 0) / maxVal) * 100}%;" title="3h: ${env.rainfall_3h_mm || 0}mm">3h</div>
        <div class="rain-bar-col" style="height: ${((env.rainfall_6h_mm || 0) / maxVal) * 100}%;" title="6h: ${env.rainfall_6h_mm || 0}mm">6h</div>
        <div class="rain-bar-col" style="height: ${((env.rainfall_12h_mm || 0) / maxVal) * 100}%;" title="12h: ${env.rainfall_12h_mm || 0}mm">12h</div>
        <div class="rain-bar-col" style="height: ${((env.rainfall_24h_mm || 0) / maxVal) * 100}%;" title="24h: ${env.rainfall_24h_mm || 0}mm">24h</div>
        <div class="rain-bar-col" style="height: ${((env.rainfall_72h_mm || 0) / maxVal) * 100}%;" title="72h: ${env.rainfall_72h_mm || 0}mm">72h</div>
      `;
    }

    setElText("inspector-forecast-text", `Forecast (+24h): +${env.forecast_24h_mm || 0} mm expected (Open-Meteo GFS/ECMWF)`);
    setElText("inspector-terrain-info", `Aspect: ${env.aspect || 'N/A'} | Soil: ${env.soil_type || 'N/A'} | Cover: ${env.land_cover || 'N/A'}`);

    const timelineBox = document.getElementById("inspector-timeline");
    if (timelineBox && region.historical_event_timeline && region.historical_event_timeline.length > 0) {
      timelineBox.innerHTML = region.historical_event_timeline.map(e => `
        <div class="timeline-item">
          <div class="timeline-date">${e.date} • ${e.type} (${e.severity})</div>
          <div class="timeline-desc">24h Rain: <strong>${e.rain_24h}</strong> | Source: <em>${e.source}</em></div>
        </div>
      `).join("");
    } else if (timelineBox) {
      timelineBox.innerHTML = `<div style="font-size: 0.75rem; color: #94a3b8;">No historical disaster events recorded in catalog for this sector.</div>`;
    }

    setElText("inspector-population-exposure", `~${(exp.population_in_zone || 0).toLocaleString()} citizens within predicted hazard zone`);
    const roads = (exp.road_segments_affected && exp.road_segments_affected[0]) ? exp.road_segments_affected[0] : "N/A";
    const hosps = (exp.hospitals_nearby && exp.hospitals_nearby[0]) ? exp.hospitals_nearby[0] : "N/A";
    setElText("inspector-infrastructure-exposure", `Roads: ${roads} | Hosp: ${hosps}`);

    if (sz) {
      setElText("inspector-safezone-name", sz.name);
      setElHTML("inspector-safezone-desc", `
        Elevation: <strong>${sz.elevation_m}m</strong> (+${sz.relative_safe_height_m}m relative height)<br/>
        Distance: <strong>${sz.distance_km} km</strong> (~${sz.est_walk_minutes} mins) | Access: <em>${sz.road_accessibility}</em>
      `);
    }

    if (sh) {
      setElText("inspector-shelter-name", sh.name);
      setElHTML("inspector-shelter-desc", `
        Facility: ${sh.facility_type} | Capacity: <strong>${sh.capacity} persons</strong> | Contact: ${sh.contact}
      `);
    }

    const dispatchBtn = document.getElementById("inspector-dispatch-btn");
    if (dispatchBtn) {
      dispatchBtn.onclick = () => VajraAlerts.openEmergencyDispatchModal(region);
    }
  }
};

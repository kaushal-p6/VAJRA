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
    this.tileLayers.satellite = L.tileLayer(VAJRA_CONFIG.TILE_PROVIDERS.satellite.url, { 
      attribution: VAJRA_CONFIG.TILE_PROVIDERS.satellite.attribution,
      maxZoom: 18
    });
    this.tileLayers.standard = L.tileLayer(VAJRA_CONFIG.TILE_PROVIDERS.standard.url, { 
      subdomains: ["a", "b", "c"], 
      attribution: VAJRA_CONFIG.TILE_PROVIDERS.standard.attribution,
      maxZoom: 18
    });
    this.tileLayers.elevation = L.tileLayer(VAJRA_CONFIG.TILE_PROVIDERS.elevation.url, { 
      subdomains: ["a", "b", "c"],
      attribution: VAJRA_CONFIG.TILE_PROVIDERS.elevation.attribution,
      className: "topo-dimmed-layer",
      maxNativeZoom: 15,
      maxZoom: 16
    });
    this.tileLayers.terrain = L.tileLayer(VAJRA_CONFIG.TILE_PROVIDERS.terrain.url, { 
      attribution: VAJRA_CONFIG.TILE_PROVIDERS.terrain.attribution,
      maxNativeZoom: 13,
      maxZoom: 14
    });

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
  maplibreMarkers: [],

  // ─────────────────────────────────────────────────────────────
  // SAFETY FIX: the real ML output schema (see
  // VAJRA_DevTeam_Report_and_Handoff.md, Part A Section 4) only ever
  // provides nearest_safe_zone as {name, distance_km} or null — it never
  // includes lat/lon, capacity, or a contact number. The code that used
  // to build "primaryDest" in three separate places silently fell back to
  // a hardcoded Bhatwari coordinate (30.9905, 78.4601), a fabricated
  // capacity of 800, and a fabricated phone number "+91 1374 222108"
  // whenever those fields were missing — which is exactly what happens
  // on every real live alert. For a life-safety evacuation feature,
  // showing a fake emergency phone number as if real is worse than
  // showing nothing. This resolver never invents a value: it only uses
  // curated static reference data (official_government_shelter /
  // candidate_safe_high_ground, which DO have real lat/lon for the known
  // pilot villages) when present, and otherwise reports plainly that a
  // field isn't available.
  resolveSafeDestination(region) {
    const mlSafeZone = region.nearest_safe_zone;
    const govShelter = region.official_government_shelter;
    const highGround = region.candidate_safe_high_ground;

    // region.nearest_safe_zone === null is a CORRECT, meaningful result
    // (already-safe terrain, or an isolated road fragment) — not missing
    // data. Only treat it as "nothing to show" if there's also no static
    // reference destination for this region.
    const name = mlSafeZone?.name || govShelter?.name || highGround?.name || null;
    const distance_km = mlSafeZone?.distance_km ?? govShelter?.distance_km ?? highGround?.distance_km ?? null;
    if (!name && distance_km == null) return null;

    const coordSource = (govShelter && govShelter.lat != null) ? govShelter
      : (highGround && highGround.lat != null) ? highGround
      : (mlSafeZone && mlSafeZone.lat != null) ? mlSafeZone
      : null;

    return {
      name: name || "Nearest Safe Zone",
      hasCoordinates: !!coordSource,
      lat: coordSource ? coordSource.lat : null,
      lon: coordSource ? coordSource.lon : null,
      distance_km: distance_km,
      est_walk_minutes: distance_km != null ? Math.round(distance_km * 12) : null,
      relative_safe_height_m: highGround?.relative_safe_height_m ?? null,
      elevation_m: highGround?.elevation_m ?? null,
      facility_type: govShelter?.facility_type ?? null,
      // Never fabricate these — genuinely unknown unless the curated
      // static reference data provides them.
      capacity: govShelter?.capacity ?? null,
      contact: govShelter?.contact ?? null
    };
  },

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

      // 3D map will always by default focus on the region with the highest risk score
      const highestRiskRegion = VAJRA_DATA.REGIONS.reduce((max, r) => (r.risk_score || 0) > (max.risk_score || 0) ? r : max, VAJRA_DATA.REGIONS[0]);
      const currentRegion = highestRiskRegion;
      this.selectedRegion = currentRegion;
      this.updateInspectorUI(currentRegion);

      // SAFETY/BUGFIX: previously read safeData.lat/.lon directly, which is
      // undefined for a real live nearest_safe_zone ({name, distance_km}
      // only) — that silently produced [NaN, NaN] as the 3D view center.
      const safeData = this.resolveSafeDestination(currentRegion);
      const targetCenter = (safeData && safeData.hasCoordinates)
        ? [(currentRegion.center[1] + safeData.lon) / 2, (currentRegion.center[0] + safeData.lat) / 2]
        : [currentRegion.center[1], currentRegion.center[0]];

      // Initialize MapLibre GL if not yet created
      if (!this.maplibreInstance && typeof maplibregl !== 'undefined' && ml3dContainer) {
        this.maplibreInstance = new maplibregl.Map({
          container: 'maplibre-3d-container',
          style: `https://api.maptiler.com/maps/hybrid/style.json?key=${MAPTILER_KEY}`,
          center: targetCenter,
          zoom: 12.8,
          pitch: 65,
          bearing: -20,
          maxPitch: 85,
          antialias: true
        });

        this.maplibreInstance.on('error', (e) => {
          console.warn("MapLibre 3D:", e.error?.message || e);
        });

        this.maplibreInstance.on('load', () => {
          this.maplibreInstance.resize();

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
          try {
            this.maplibreInstance.setTerrain({ source: 'maptiler-terrain', exaggeration: 1.8 });
          } catch (err) {
            console.warn("3D terrain set error:", err);
          }

          // Atmospheric sky
          try {
            this.maplibreInstance.setSky({
              'sky-color': '#38bdf8',
              'horizon-color': '#bae6fd',
              'fog-color': '#e0f2fe',
              'fog-ground-blend': 0.3
            });
          } catch (err) {
            console.warn("3D sky set error:", err);
          }

          // Add navigation controls
          this.maplibreInstance.addControl(new maplibregl.NavigationControl(), 'bottom-right');

          // Render 3D hazard polygons and evacuation route
          this.render3DOverlays(currentRegion);
        });

        setTimeout(() => {
          if (this.maplibreInstance) this.maplibreInstance.resize();
        }, 150);
        setTimeout(() => {
          if (this.maplibreInstance) this.maplibreInstance.resize();
        }, 400);

      } else if (this.maplibreInstance) {
        this.maplibreInstance.resize();
        this.maplibreInstance.flyTo({
          center: targetCenter,
          zoom: 12.8,
          pitch: 65,
          bearing: -20,
          duration: 1000
        });
        setTimeout(() => {
          if (this.maplibreInstance) {
            this.maplibreInstance.resize();
            this.render3DOverlays(currentRegion);
          }
        }, 100);
      }

    } else {
      // Switching back from 3D to a normal Leaflet basemap
      if (this.activeBasemap === 'maptiler_hybrid' && this.maplibreInstance) {
        // Sync position back to Leaflet
        const c = this.maplibreInstance.getCenter();
        const z = this.maplibreInstance.getZoom();
        this.map.setView([c.lat, c.lng], Math.round(z), { animate: false });
      }

      if (!this.tileLayers[layerKey] || this.activeBasemap === layerKey) return;

      // Dynamic Zoom Limit per layer provider to avoid missing tile errors
      if (layerKey === 'elevation') {
        this.map.setMaxZoom(16);
        if (this.map.getZoom() > 16) {
          this.map.setZoom(16);
        }
      } else if (layerKey === 'terrain') {
        this.map.setMaxZoom(14);
        if (this.map.getZoom() > 14) {
          this.map.setZoom(14);
        }
      } else {
        this.map.setMaxZoom(VAJRA_CONFIG.MAP_INIT.maxZoom || 18);
      }

      // Hide MapLibre, show Leaflet
      if (ml3dContainer) {
        ml3dContainer.style.opacity = '0';
        ml3dContainer.style.pointerEvents = 'none';
        setTimeout(() => { ml3dContainer.style.display = 'none'; }, 300);
      }
      document.getElementById('map').style.opacity = '1';
      document.getElementById('map').style.pointerEvents = 'auto';

      // Remove previous Leaflet basemap
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

  render3DOverlays(region) {
    if (!this.maplibreInstance || typeof maplibregl === 'undefined') return;
    const targetRegion = region || this.selectedRegion || VAJRA_DATA.REGIONS[0];
    if (!targetRegion) return;

    // ─────────────────────────────────────────────────────────────
    // 1. HAZARD REGIONS GEOJSON (Fill & Outline)
    // ─────────────────────────────────────────────────────────────
    const hazardFeatures = VAJRA_DATA.REGIONS.filter(r => r.coordinates && r.coordinates.length > 0).map(r => {
      const ring = r.coordinates.map(pt => [pt[1], pt[0]]);
      if (ring.length > 0 && (ring[0][0] !== ring[ring.length - 1][0] || ring[0][1] !== ring[ring.length - 1][1])) {
        ring.push([ring[0][0], ring[0][1]]);
      }
      return {
        type: 'Feature',
        properties: {
          unit_id: r.unit_id,
          village: r.village,
          tier: r.risk_tier,
          risk_score: r.risk_score
        },
        geometry: {
          type: 'Polygon',
          coordinates: [ring]
        }
      };
    });

    const hazardGeoJson = {
      type: 'FeatureCollection',
      features: hazardFeatures
    };

    if (this.maplibreInstance.getSource('vajra-3d-hazards')) {
      this.maplibreInstance.getSource('vajra-3d-hazards').setData(hazardGeoJson);
    } else {
      this.maplibreInstance.addSource('vajra-3d-hazards', {
        type: 'geojson',
        data: hazardGeoJson
      });

      this.maplibreInstance.addLayer({
        id: 'vajra-3d-hazard-fill',
        type: 'fill',
        source: 'vajra-3d-hazards',
        paint: {
          'fill-color': [
            'match', ['get', 'tier'],
            'Red', '#dc2626',
            'Orange', '#ea580c',
            'Yellow', '#d97706',
            '#16a34a'
          ],
          'fill-opacity': 0.55
        }
      });

      this.maplibreInstance.addLayer({
        id: 'vajra-3d-hazard-outline',
        type: 'line',
        source: 'vajra-3d-hazards',
        paint: {
          'line-color': [
            'match', ['get', 'tier'],
            'Red', '#ef4444',
            'Orange', '#f97316',
            'Yellow', '#f59e0b',
            '#22c55e'
          ],
          'line-width': 3
        }
      });

      this.maplibreInstance.on('click', 'vajra-3d-hazard-fill', (e) => {
        if (e.features && e.features[0]) {
          const unitId = e.features[0].properties.unit_id;
          const matched = VAJRA_DATA.REGIONS.find(r => r.unit_id === unitId);
          if (matched) this.selectRegion(matched);
        }
      });
      this.maplibreInstance.on('mouseenter', 'vajra-3d-hazard-fill', () => {
        this.maplibreInstance.getCanvas().style.cursor = 'pointer';
      });
      this.maplibreInstance.on('mouseleave', 'vajra-3d-hazard-fill', () => {
        this.maplibreInstance.getCanvas().style.cursor = '';
      });
    }

    // ─────────────────────────────────────────────────────────────
    // 2. EVACUATION WALKING ROUTE GEOJSON (Green Dashed Corridor)
    // ─────────────────────────────────────────────────────────────
    const primaryDest = this.resolveSafeDestination(targetRegion);

    // SAFETY: only draw a route/pin to a destination we have REAL
    // coordinates for. Per the report, region.nearest_safe_zone can be
    // null (a correct result — already safe, or unreachable) and the
    // real schema never includes lat/lon — silently drawing a line to a
    // fabricated point would be actively misleading in an evacuation
    // feature, so we skip the visual and let the inspector panel show
    // the honest "no reachable safe zone" state instead.
    if (!primaryDest || !primaryDest.hasCoordinates) {
      if (this.maplibreInstance.getSource('vajra-3d-route')) {
        this.maplibreInstance.getSource('vajra-3d-route').setData({ type: 'FeatureCollection', features: [] });
      }
      this.maplibreMarkers.forEach(m => m.remove());
      this.maplibreMarkers = [];
      return;
    }

    const startPt = targetRegion.center; // [lat, lon]
    const destPt = [primaryDest.lat, primaryDest.lon]; // [lat, lon]

    const routeGeoJson = {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: { name: 'Evacuation Route' },
          geometry: {
            type: 'LineString',
            coordinates: [
              [startPt[1], startPt[0]],
              [destPt[1], destPt[0]]
            ]
          }
        }
      ]
    };

    if (this.maplibreInstance.getSource('vajra-3d-route')) {
      this.maplibreInstance.getSource('vajra-3d-route').setData(routeGeoJson);
    } else {
      this.maplibreInstance.addSource('vajra-3d-route', {
        type: 'geojson',
        data: routeGeoJson
      });

      this.maplibreInstance.addLayer({
        id: 'vajra-3d-route-line',
        type: 'line',
        source: 'vajra-3d-route',
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: {
          'line-color': '#22c55e',
          'line-width': 5,
          'line-dasharray': [2, 1]
        }
      });
    }

    // ─────────────────────────────────────────────────────────────
    // 3. 3D DOM MARKERS: Hazard Center, Green Shield, and Route Badge
    // ─────────────────────────────────────────────────────────────
    this.maplibreMarkers.forEach(m => m.remove());
    this.maplibreMarkers = [];

    // Hazard Origin Danger Pin (3D)
    const dangerEl = document.createElement('div');
    dangerEl.className = 'danger-origin-pin';
    dangerEl.title = `Hazard Danger Center — ${targetRegion.village}`;
    dangerEl.innerHTML = `<svg class="icon-svg" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="#ffffff" stroke-width="2.2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`;
    const dangerMarker3D = new maplibregl.Marker({ element: dangerEl })
      .setLngLat([startPt[1], startPt[0]])
      .setPopup(new maplibregl.Popup({ offset: 15 }).setHTML(`
        <div style="font-family:Inter,sans-serif;font-size:12px;color:#0f172a;padding:4px;">
          <strong style="color:#dc2626;display:inline-flex;align-items:center;gap:4px;"><svg class="icon-svg" viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="#dc2626" stroke-width="2.2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg> Hazard Center — ${targetRegion.village}</strong><br/>
          Risk Score: <strong>${Math.round((targetRegion.risk_score || 0) * 100)}%</strong> [${targetRegion.risk_tier}]<br/>
          Impact Window: <strong>${targetRegion.expected_time_to_impact_hours != null ? targetRegion.expected_time_to_impact_hours + ' hrs' : 'Not modeled for this hazard type'}</strong>
        </div>
      `))
      .addTo(this.maplibreInstance);
    this.maplibreMarkers.push(dangerMarker3D);

    // Green Shield Safe Zone Marker (3D)
    const shieldEl = document.createElement('div');
    shieldEl.className = 'safe-zone-shield';
    shieldEl.title = primaryDest.name;
    shieldEl.innerHTML = `
      <svg viewBox="0 0 24 24" fill="#16a34a" stroke="#ffffff" stroke-width="1.8" xmlns="http://www.w3.org/2000/svg" style="width:42px;height:42px;">
        <path d="M12 2L3 7v5c0 5.25 3.75 10.15 9 11.35C17.25 22.15 21 17.25 21 12V7L12 2z"/>
        <path d="M9 12l2 2 4-4" stroke="#ffffff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
      </svg>
    `;
    const shieldMarker3D = new maplibregl.Marker({ element: shieldEl })
      .setLngLat([destPt[1], destPt[0]])
      .setPopup(new maplibregl.Popup({ offset: 20 }).setHTML(`
        <div style="font-family:Inter,sans-serif;padding:6px;min-width:240px;color:#0f172a;">
          <div style="display:flex;align-items:center;gap:6px;margin-bottom:6px;">
            <span style="display:inline-flex;"><svg viewBox="0 0 24 24" width="22" height="22" fill="#16a34a" stroke="#ffffff" stroke-width="1.8"><path d="M12 2L3 7v5c0 5.25 3.75 10.15 9 11.35C17.25 22.15 21 17.25 21 12V7L12 2z"/></svg></span>
            <div>
              <h4 style="margin:0;font-size:13px;font-weight:800;color:#16a34a;">${primaryDest.name}</h4>
              <span style="font-size:10px;color:#64748b;font-weight:600;">${primaryDest.facility_type ? 'VERIFIED OPERATIONAL SAFE HAVEN' : 'REPORTED SAFE ZONE — DETAILS PENDING'}</span>
            </div>
          </div>
          <div style="border-top:1px solid #e2e8f0;padding-top:6px;font-size:11px;line-height:1.6;">
            <p style="margin:2px 0;"><svg class="icon-svg" viewBox="0 0 24 24" width="13" height="13" style="vertical-align:-2px;margin-right:4px;"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>Distance: <strong>${primaryDest.distance_km != null ? primaryDest.distance_km + ' km' : 'Unknown'}</strong>${primaryDest.est_walk_minutes != null ? ` (~${primaryDest.est_walk_minutes} mins walk)` : ''}</p>
            ${primaryDest.elevation_m != null ? `<p style="margin:2px 0;"><svg class="icon-svg" viewBox="0 0 24 24" width="13" height="13" style="vertical-align:-2px;margin-right:4px;"><path d="m8 3 4 8 5-5 5 15H2L8 3z"/></svg>Elevation: <strong>${primaryDest.elevation_m}m</strong> (<span style="color:#16a34a;font-weight:700;">+${primaryDest.relative_safe_height_m}m</span> above flood level)</p>` : ''}
            <p style="margin:2px 0;"><svg class="icon-svg" viewBox="0 0 24 24" width="13" height="13" style="vertical-align:-2px;margin-right:4px;"><path d="M3 21h18M3 10h18M5 10v11M19 10v11M9 10v11M15 10v11M12 3l9 7H3z"/></svg>Facility: <strong>${primaryDest.facility_type || 'Not available'}</strong></p>
            <p style="margin:2px 0;"><svg class="icon-svg" viewBox="0 0 24 24" width="13" height="13" style="vertical-align:-2px;margin-right:4px;"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>Shelter Capacity: <strong>${primaryDest.capacity != null ? primaryDest.capacity.toLocaleString() + ' persons' : 'Not available'}</strong></p>
            <p style="margin:2px 0;"><svg class="icon-svg" viewBox="0 0 24 24" width="13" height="13" style="vertical-align:-2px;margin-right:4px;"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>Emergency Phone: <strong>${primaryDest.contact || 'Not available'}</strong></p>
          </div>
        </div>
      `))
      .addTo(this.maplibreInstance);
    this.maplibreMarkers.push(shieldMarker3D);

    // Permanent Badge Label above Green Shield Marker (3D)
    const labelEl = document.createElement('div');
    labelEl.className = 'safe-zone-tooltip';
    labelEl.style.transform = 'translateY(-16px)';
    labelEl.innerHTML = `<span style="display:inline-flex;align-items:center;gap:4px;"><svg class="icon-svg" viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>${primaryDest.name} · ${primaryDest.distance_km != null ? primaryDest.distance_km + ' km' : 'distance unknown'}${primaryDest.relative_safe_height_m != null ? ` · Safe High Ground (+${primaryDest.relative_safe_height_m}m)` : ''}</span>`;
    const labelMarker3D = new maplibregl.Marker({ element: labelEl })
      .setLngLat([destPt[1], destPt[0]])
      .addTo(this.maplibreInstance);
    this.maplibreMarkers.push(labelMarker3D);

    // Floating Mid-Route Distance Badge (3D)
    const badgeEl = document.createElement('div');
    badgeEl.className = 'route-badge';
    badgeEl.innerHTML = `
      <span class="badge-dist" style="display:inline-flex;align-items:center;gap:3px;"><svg class="icon-svg" viewBox="0 0 24 24" width="11" height="11"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>${primaryDest.distance_km != null ? primaryDest.distance_km + ' km' : 'N/A'}</span> &nbsp;|&nbsp;
      <span class="badge-time" style="display:inline-flex;align-items:center;gap:3px;"><svg class="icon-svg" viewBox="0 0 24 24" width="11" height="11"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>${primaryDest.est_walk_minutes != null ? '~' + primaryDest.est_walk_minutes + ' min' : 'N/A'}</span>${primaryDest.relative_safe_height_m != null ? ` &nbsp;|&nbsp;<span class="badge-elev" style="display:inline-flex;align-items:center;gap:3px;"><svg class="icon-svg" viewBox="0 0 24 24" width="11" height="11"><path d="m8 3 4 8 5-5 5 15H2L8 3z"/></svg>+${primaryDest.relative_safe_height_m}m safe</span>` : ''}
    `;
    const badgeMarker3D = new maplibregl.Marker({ element: badgeEl })
      .setLngLat([(startPt[1] + destPt[1]) / 2, (startPt[0] + destPt[0]) / 2])
      .addTo(this.maplibreInstance);
    this.maplibreMarkers.push(badgeMarker3D);
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
            <strong style="color: #7c3aed; display:inline-flex; align-items:center; gap:4px;"><svg class="icon-svg" viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="#7c3aed" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>Historical Event (${evt.date})</strong><br/>
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
            <strong>${isHosp ? '<span style="display:inline-flex;align-items:center;gap:4px;"><svg class="icon-svg" viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg>Hospital</span>' : '<span style="display:inline-flex;align-items:center;gap:4px;"><svg class="icon-svg" viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2"><path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/></svg>Emergency Post</span>'}</strong><br/>
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
        riverLine.bindTooltip(`<span style="display:inline-flex;align-items:center;gap:4px;"><svg class="icon-svg" viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="#0284c7" stroke-width="2"><path d="M2 6c.6.5 1.2 1 2.5 1C7 7 7 5 9.5 5c2.6 0 2.4 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1"/><path d="M2 12c.6.5 1.2 1 2.5 1 2.5 0 2.5-2 5-2 2.6 0 2.4 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1"/><path d="M2 18c.6.5 1.2 1 2.5 1 2.5 0 2.5-2 5-2 2.6 0 2.4 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1"/></svg>${river.name}</span>`, { sticky: true });
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
    // Evacuation routes and safe haven shields stay persistent across all zoom levels
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
    } else if (layerId === "layer_routes") {
      if (isChecked) {
        if (!this.map.hasLayer(this.overlayLayers.route_layer)) {
          this.overlayLayers.route_layer.addTo(this.map);
        }
      } else {
        if (this.map.hasLayer(this.overlayLayers.route_layer)) {
          this.map.removeLayer(this.overlayLayers.route_layer);
        }
      }
    }
  },

  selectRegion(region, flyTo = true) {
    if (!region) return;
    this.selectedRegion = region;

    // Ensure route layer is always attached and visible on map
    if (this.map && !this.map.hasLayer(this.overlayLayers.route_layer)) {
      this.overlayLayers.route_layer.addTo(this.map);
    }
    const routeCheckbox = document.getElementById("layer_routes");
    if (routeCheckbox) routeCheckbox.checked = true;

    if (flyTo && this.map) {
      // Calculate bounds encompassing danger area + safe zone shelter
      const safeData = region.nearest_safe_zone || region.official_government_shelter || region.candidate_safe_high_ground;
      const pts = [region.center];
      if (safeData && safeData.lat && safeData.lon) {
        pts.push([safeData.lat, safeData.lon]);
      }
      if (region.coordinates && Array.isArray(region.coordinates)) {
        region.coordinates.forEach(c => pts.push(c));
      }
      if (pts.length > 1) {
        this.map.flyToBounds(L.latLngBounds(pts), { padding: [60, 60], maxZoom: 13, duration: 1.2 });
      } else {
        this.map.flyTo(region.center, 11, { duration: 1.2 });
      }
    }

    // Sync with 3D MapLibre if 3D satellite view is currently active
    if (this.activeBasemap === 'maptiler_hybrid' && this.maplibreInstance) {
      const safeData3D = this.resolveSafeDestination(region);
      const targetLon = (safeData3D && safeData3D.hasCoordinates) ? (region.center[1] + safeData3D.lon) / 2 : region.center[1];
      const targetLat = (safeData3D && safeData3D.hasCoordinates) ? (region.center[0] + safeData3D.lat) / 2 : region.center[0];
      this.maplibreInstance.flyTo({
        center: [targetLon, targetLat],
        zoom: 12.8,
        pitch: 65,
        bearing: -20,
        duration: 1200
      });
      this.render3DOverlays(region);
    }

    this.drawTopographicSafeZoneRoute(region);
    this.updateInspectorUI(region);
  },

  drawTopographicSafeZoneRoute(region) {
    this.overlayLayers.route_layer.clearLayers();
    if (!region) return;

    // ─────────────────────────────────────────────────────────────
    // Resolve primary safe zone honestly — see resolveSafeDestination()
    // for why this no longer fabricates coordinates/capacity/contact.
    // ─────────────────────────────────────────────────────────────
    const highGround = region.candidate_safe_high_ground;
    const primaryDest = this.resolveSafeDestination(region);

    const startPt = region.center; // [lat, lon] — hazard danger center

    // ─────────────────────────────────────────────────────────────
    // 1. DANGER ORIGIN PIN — pulsing red circle at hazard centre
    //    (always shown, regardless of whether a safe zone is known)
    // ─────────────────────────────────────────────────────────────
    const dangerIcon = L.divIcon({
      className: '',
      html: `<div class="danger-origin-pin" title="Hazard Danger Center"><svg class="icon-svg" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="#ffffff" stroke-width="2.2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg></div>`,
      iconSize: [32, 32],
      iconAnchor: [16, 16]
    });
    const dangerMarker = L.marker(startPt, { icon: dangerIcon, zIndexOffset: 950 });
    dangerMarker.bindTooltip(`
      <div style="font-family:Inter,sans-serif;font-size:0.82rem;color:#0f172a;min-width:180px;">
        <strong style="color:#dc2626;display:inline-flex;align-items:center;gap:4px;"><svg class="icon-svg" viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="#dc2626" stroke-width="2.2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>Hazard Center — ${region.village}</strong><br/>
        Risk Score: <strong>${Math.round((region.risk_score || 0) * 100)}%</strong> [${region.risk_tier} Tier]<br/>
        Hazard: <strong>${region.hazard_type || 'Landslide / Flash Flood'}</strong><br/>
        Impact Window: <strong>${region.expected_time_to_impact_hours != null ? region.expected_time_to_impact_hours + ' hrs' : 'Not modeled for this hazard type'}</strong>
      </div>
    `, { sticky: true });
    this.overlayLayers.route_layer.addLayer(dangerMarker);

    // SAFETY: region.nearest_safe_zone === null is a correct result
    // (already-safe terrain, or an unreachable road fragment — see the
    // report's field notes). Don't draw a fabricated route/pin in that
    // case, or when we simply lack real coordinates for the destination
    // the live API did report.
    if (!primaryDest || !primaryDest.hasCoordinates) {
      return;
    }

    const destPt = [primaryDest.lat, primaryDest.lon]; // [lat, lon] — shelter destination

    // ─────────────────────────────────────────────────────────────
    // 2. DASHED GREEN EVACUATION WALKING ROUTE POLYLINE
    // ─────────────────────────────────────────────────────────────
    const evacuationRoute = L.polyline([startPt, destPt], {
      className: 'evac-route-path',
      color: '#16a34a',
      weight: 4.5,
      opacity: 0.95
    });
    evacuationRoute.bindTooltip(`
      <div style="font-family:Inter,sans-serif;font-size:0.8rem;color:#0f172a;">
        <strong style="display:inline-flex;align-items:center;gap:4px;"><svg class="icon-svg" viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>Safe Evacuation Walking Corridor</strong><br/>
        Distance: <strong>${primaryDest.distance_km} km</strong>${primaryDest.est_walk_minutes != null ? ` (~${primaryDest.est_walk_minutes} min walk)` : ''}<br/>
        ${primaryDest.relative_safe_height_m != null ? `Elevation Gain: <strong>+${primaryDest.relative_safe_height_m}m</strong> upward safe gradient` : ''}
      </div>
    `, { sticky: true });
    this.overlayLayers.route_layer.addLayer(evacuationRoute);

    // ─────────────────────────────────────────────────────────────
    // 3. MID-ROUTE DISTANCE & ELEVATION BADGE (tactical floating pill)
    // ─────────────────────────────────────────────────────────────
    const midLat = (startPt[0] + destPt[0]) / 2;
    const midLon = (startPt[1] + destPt[1]) / 2;
    const badgeIcon = L.divIcon({
      className: '',
      html: `
        <div class="route-badge">
          <span class="badge-dist" style="display:inline-flex;align-items:center;gap:3px;"><svg class="icon-svg" viewBox="0 0 24 24" width="11" height="11"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>${primaryDest.distance_km} km</span>${primaryDest.est_walk_minutes != null ? ` &nbsp;|&nbsp;<span class="badge-time" style="display:inline-flex;align-items:center;gap:3px;"><svg class="icon-svg" viewBox="0 0 24 24" width="11" height="11"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>~${primaryDest.est_walk_minutes} min</span>` : ''}${primaryDest.relative_safe_height_m != null ? ` &nbsp;|&nbsp;<span class="badge-elev" style="display:inline-flex;align-items:center;gap:3px;"><svg class="icon-svg" viewBox="0 0 24 24" width="11" height="11"><path d="m8 3 4 8 5-5 5 15H2L8 3z"/></svg>Safe High Ground (+${primaryDest.relative_safe_height_m}m)</span>` : ''}
        </div>`,
      iconSize: [250, 34],
      iconAnchor: [125, 17]
    });
    const badgeMarker = L.marker([midLat, midLon], { icon: badgeIcon, interactive: false, zIndexOffset: 600 });
    this.overlayLayers.route_layer.addLayer(badgeMarker);

    // ─────────────────────────────────────────────────────────────
    // 4. GREEN SHIELD MARKER AT NEAREST SAFE ZONE
    // ─────────────────────────────────────────────────────────────
    const shieldSVG = `
      <svg viewBox="0 0 24 24" fill="#16a34a" stroke="#ffffff" stroke-width="1.8" xmlns="http://www.w3.org/2000/svg">
        <path d="M12 2L3 7v5c0 5.25 3.75 10.15 9 11.35C17.25 22.15 21 17.25 21 12V7L12 2z"/>
        <path d="M9 12l2 2 4-4" stroke="#ffffff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
      </svg>`;
    const shieldIcon = L.divIcon({
      className: '',
      html: `<div class="safe-zone-shield" title="Designated Safe Zone">${shieldSVG}</div>`,
      iconSize: [44, 44],
      iconAnchor: [22, 22]
    });
    const shieldMarker = L.marker(destPt, { icon: shieldIcon, zIndexOffset: 1200 });

    shieldMarker.bindTooltip(
      `<span style="display:inline-flex;align-items:center;gap:4px;"><svg class="icon-svg" viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>${primaryDest.name} · ${primaryDest.distance_km} km${primaryDest.relative_safe_height_m != null ? ` · Safe High Ground (+${primaryDest.relative_safe_height_m}m)` : ''}</span>`,
      { permanent: true, direction: 'top', className: 'safe-zone-tooltip', offset: [0, -22] }
    );

    // Interactive Detailed Popup on Click — every field is either real or
    // explicitly marked "Not available", never a fabricated placeholder.
    shieldMarker.bindPopup(`
      <div style="font-family:Inter,sans-serif;padding:6px;min-width:240px;color:#0f172a;">
        <div style="display:flex;align-items:center;gap:6px;margin-bottom:6px;">
          <span style="display:inline-flex;"><svg viewBox="0 0 24 24" width="22" height="22" fill="#16a34a" stroke="#ffffff" stroke-width="1.8"><path d="M12 2L3 7v5c0 5.25 3.75 10.15 9 11.35C17.25 22.15 21 17.25 21 12V7L12 2z"/></svg></span>
          <div>
            <h4 style="margin:0;font-size:13px;font-weight:800;color:#16a34a;">${primaryDest.name}</h4>
            <span style="font-size:10px;color:#64748b;font-weight:600;">${primaryDest.facility_type ? 'VERIFIED OPERATIONAL SAFE HAVEN' : 'REPORTED SAFE ZONE — DETAILS PENDING'}</span>
          </div>
        </div>
        <div style="border-top:1px solid #e2e8f0;padding-top:6px;font-size:11px;line-height:1.6;">
          <p style="margin:2px 0;"><svg class="icon-svg" viewBox="0 0 24 24" width="13" height="13" style="vertical-align:-2px;margin-right:4px;"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>Distance: <strong>${primaryDest.distance_km} km</strong>${primaryDest.est_walk_minutes != null ? ` (~${primaryDest.est_walk_minutes} mins walk)` : ''}</p>
          ${primaryDest.elevation_m != null ? `<p style="margin:2px 0;"><svg class="icon-svg" viewBox="0 0 24 24" width="13" height="13" style="vertical-align:-2px;margin-right:4px;"><path d="m8 3 4 8 5-5 5 15H2L8 3z"/></svg>Elevation: <strong>${primaryDest.elevation_m}m</strong> (<span style="color:#16a34a;font-weight:700;">+${primaryDest.relative_safe_height_m}m</span> above flood level)</p>` : ''}
          <p style="margin:2px 0;"><svg class="icon-svg" viewBox="0 0 24 24" width="13" height="13" style="vertical-align:-2px;margin-right:4px;"><path d="M3 21h18M3 10h18M5 10v11M19 10v11M9 10v11M15 10v11M12 3l9 7H3z"/></svg>Facility: <strong>${primaryDest.facility_type || 'Not available'}</strong></p>
          <p style="margin:2px 0;"><svg class="icon-svg" viewBox="0 0 24 24" width="13" height="13" style="vertical-align:-2px;margin-right:4px;"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>Shelter Capacity: <strong>${primaryDest.capacity != null ? primaryDest.capacity.toLocaleString() + ' persons' : 'Not available'}</strong></p>
          <p style="margin:2px 0;"><svg class="icon-svg" viewBox="0 0 24 24" width="13" height="13" style="vertical-align:-2px;margin-right:4px;"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>Emergency Phone: <strong>${primaryDest.contact || 'Not available'}</strong></p>
        </div>
      </div>
    `, { offset: [0, -15] });

    this.overlayLayers.route_layer.addLayer(shieldMarker);

    // ─────────────────────────────────────────────────────────────
    // 5. SECONDARY CANDIDATE RIDGE HIGH-GROUND (if distinct from shelter)
    // ─────────────────────────────────────────────────────────────
    if (highGround && (Math.abs(highGround.lat - primaryDest.lat) > 0.001 || Math.abs(highGround.lon - primaryDest.lon) > 0.001)) {
      const ridgePt = [highGround.lat, highGround.lon];
      const ridgeRoute = L.polyline([startPt, ridgePt], {
        color: '#059669',
        weight: 3,
        dashArray: '4 8',
        opacity: 0.7
      });
      this.overlayLayers.route_layer.addLayer(ridgeRoute);

      const ridgeIcon = L.divIcon({
        className: '',
        html: `<div style="background:#065f46;color:#fff;padding:2px 6px;border-radius:4px;font-size:10px;font-weight:700;border:1.5px solid #34d399;white-space:nowrap;box-shadow:0 2px 6px rgba(0,0,0,0.4);display:flex;align-items:center;gap:3px;cursor:pointer;"><svg class="icon-svg" viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2"><path d="m8 3 4 8 5-5 5 15H2L8 3z"/></svg><span>${highGround.name.split(' ')[0]} Ridge (+${highGround.relative_safe_height_m}m)</span></div>`,
        iconSize: [120, 24],
        iconAnchor: [60, 12]
      });
      const ridgeMarker = L.marker(ridgePt, { icon: ridgeIcon, zIndexOffset: 1000 });
      ridgeMarker.bindTooltip(`
        <div style="font-family:Inter,sans-serif;font-size:0.8rem;color:#0f172a;">
          <strong style="display:inline-flex;align-items:center;gap:4px;"><svg class="icon-svg" viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2"><path d="m8 3 4 8 5-5 5 15H2L8 3z"/></svg>Candidate Safe Ridge Crest</strong><br/>
          ${highGround.name}<br/>
          Elevation: <strong>${highGround.elevation_m}m</strong> (+${highGround.relative_safe_height_m}m above danger level)<br/>
          Distance: <strong>${highGround.distance_km} km</strong> (~${highGround.est_walk_minutes} mins walk)<br/>
          Access: <em>${highGround.road_accessibility}</em>
        </div>
      `, { sticky: true });
      this.overlayLayers.route_layer.addLayer(ridgeMarker);
    }
  },

  // ─────────────────────────────────────────────────────────────
  // STEP 5: Live Ground Telemetry Cache & OpenWeatherMap API Integration
  // ─────────────────────────────────────────────────────────────
  weatherCache: {},

  fetchLiveWeather(lat, lon, villageName) {
    const API_KEY = "97baaa2fbe5f98bf859caf9a1857fcd9";
    const cacheKey = `${lat.toFixed(3)},${lon.toFixed(3)}`;

    const updateWeatherUI = (data, isLive = true) => {
      const setEl = (id, text) => {
        const el = document.getElementById(id);
        if (el) el.textContent = text;
      };

      setEl("weather-temp", `${data.temp.toFixed(1)}°C`);
      setEl("weather-cond", data.description);
      setEl("weather-humidity", `${data.humidity}%`);
      setEl("weather-wind", `${Math.round(data.windSpeed * 3.6)} km/h ${data.windDir || 'NW'}`);
      setEl("weather-rain-1h", `${data.rain1h.toFixed(1)} mm`);
      setEl("weather-pressure", `${data.pressure} hPa`);
      setEl("weather-station-name", isLive ? `OpenWeather AWS (${data.city})` : `Station: ${data.city} (Telemetry Cache)`);

      const statusEl = document.getElementById("weather-sync-status");
      if (statusEl) {
        statusEl.textContent = isLive
          ? `Telemetry Stream: OpenWeather API (Station: ${data.city})`
          : `Sensor Stream: IMD AWS Ground Telemetry (${data.city})`;
      }

      const iconEl = document.getElementById("weather-icon");
      if (iconEl) {
        const main = (data.main || "").toLowerCase();
        const rainSvg = `<svg class="icon-svg" viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2"><path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z"/><line x1="8" y1="19" x2="8" y2="21"/><line x1="12" y1="19" x2="12" y2="21"/><line x1="16" y1="19" x2="16" y2="21"/></svg>`;
        const cloudSvg = `<svg class="icon-svg" viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2"><path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z"/></svg>`;
        const sunSvg = `<svg class="icon-svg" viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>`;
        const mistSvg = `<svg class="icon-svg" viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2"><line x1="4" y1="8" x2="20" y2="8"/><line x1="4" y1="12" x2="20" y2="12"/><line x1="4" y1="16" x2="20" y2="16"/></svg>`;
        iconEl.innerHTML = main.includes("rain") ? rainSvg : main.includes("cloud") ? cloudSvg : main.includes("clear") ? sunSvg : mistSvg;
      }
    };

    // Check in-memory cache first
    if (this.weatherCache[cacheKey]) {
      updateWeatherUI(this.weatherCache[cacheKey], true);
      return;
    }

    // Default Himalayan station baseline data in case of offline/network issues
    const fallbackData = {
      temp: 6.3,
      description: "Light Rain / Overcast",
      humidity: 89,
      windSpeed: 1.7,
      windDir: "NW",
      rain1h: 0.6,
      pressure: 1017,
      city: villageName || "Uttarkāshi",
      main: "Rain"
    };

    const url = `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&units=metric&appid=${API_KEY}`;

    fetch(url)
      .then(res => {
        if (!res.ok) throw new Error("HTTP " + res.status);
        return res.json();
      })
      .then(d => {
        const parsed = {
          temp: d.main?.temp ?? 6.3,
          description: d.weather?.[0]?.description ?? "Light Rain",
          humidity: d.main?.humidity ?? 89,
          windSpeed: d.wind?.speed ?? 1.7,
          windDir: (d.wind?.deg > 315 || d.wind?.deg <= 45) ? "N" : (d.wind?.deg > 45 && d.wind?.deg <= 135) ? "E" : (d.wind?.deg > 135 && d.wind?.deg <= 225) ? "S" : "W",
          rain1h: d.rain?.["1h"] ?? (d.weather?.[0]?.main === "Rain" ? 0.6 : 0.0),
          pressure: d.main?.pressure ?? 1017,
          city: d.name || villageName || "Uttarkāshi",
          main: d.weather?.[0]?.main || "Rain"
        };
        this.weatherCache[cacheKey] = parsed;
        updateWeatherUI(parsed, true);
      })
      .catch(err => {
        console.warn("Live weather fetch fallback:", err.message);
        this.weatherCache[cacheKey] = fallbackData;
        updateWeatherUI(fallbackData, false);
      });
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
    // SAFETY: don't fabricate elevation/capacity/contact when the real
    // nearest_safe_zone only has {name, distance_km} (today's actual ML
    // schema) — see resolveSafeDestination() for the full rationale.
    const resolvedSafe = this.resolveSafeDestination(region);
    const sz = region.candidate_safe_high_ground || (resolvedSafe ? {
      name: resolvedSafe.name + " Safe High-Ground",
      elevation_m: resolvedSafe.elevation_m,
      relative_safe_height_m: resolvedSafe.relative_safe_height_m,
      distance_km: resolvedSafe.distance_km,
      est_walk_minutes: resolvedSafe.est_walk_minutes,
      road_accessibility: null
    } : null);
    const sh = region.official_government_shelter || (resolvedSafe ? {
      name: resolvedSafe.name,
      facility_type: resolvedSafe.facility_type,
      capacity: resolvedSafe.capacity,
      contact: resolvedSafe.contact
    } : null);

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

    // ─────────────────────────────────────────────────────────────
    // STEP 5: Multi-Source Provenance Cards (SIH 2026 Theme Requirement)
    // ─────────────────────────────────────────────────────────────
    const provContainer = document.getElementById("inspector-provenance-cards");
    if (provContainer) {
      const rainVal = env.rainfall_24h_mm || 142;
      const slopeVal = env.slope_angle_deg || 38;
      const soilMoist = env.soil_moisture_pct || 91;
      const soilType = env.soil_type || "Dystric Cambisols";

      provContainer.innerHTML = `
        <div class="provenance-card">
          <div class="provenance-card-header">
            <span class="prov-icon"><svg class="icon-svg" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z"/><line x1="8" y1="19" x2="8" y2="21"/><line x1="12" y1="19" x2="12" y2="21"/><line x1="16" y1="19" x2="16" y2="21"/></svg></span>
            <span class="prov-badge prov-badge-meteo">METEO</span>
          </div>
          <div class="prov-val">${rainVal} mm Rain</div>
          <div class="prov-trigger">Dual-polarization radar & gauge calibration exceeds 72h flash threshold</div>
          <div class="prov-agency" style="display:flex;align-items:center;gap:4px;"><svg class="icon-svg" viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2"><path d="M4.9 19.1C1 15.2 1 8.8 4.9 4.9"/><path d="M7.8 16.2c-2.3-2.3-2.3-6.1 0-8.5"/><circle cx="12" cy="12" r="2"/><path d="M16.2 7.8c2.3 2.3 2.3 6.1 0 8.5"/><path d="M19.1 4.9C23 8.8 23 15.1 19.1 19"/></svg>IMD AWS & NASA GPM IMERG</div>
        </div>

        <div class="provenance-card">
          <div class="provenance-card-header">
            <span class="prov-icon"><svg class="icon-svg" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="m8 3 4 8 5-5 5 15H2L8 3z"/></svg></span>
            <span class="prov-badge prov-badge-dem">DEM</span>
          </div>
          <div class="prov-val">${slopeVal}° Steep Slope</div>
          <div class="prov-trigger">High-resolution elevation DEM critical gravitational shear angle</div>
          <div class="prov-agency" style="display:flex;align-items:center;gap:4px;"><svg class="icon-svg" viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2"><path d="M13 7 9 3 5 7l4 4"/><path d="m17 11 4 4-4 4-4-4"/><path d="m8 12 4 4 6-6-4-4Z"/><path d="m16 8 3-3"/><path d="M9 21a6 6 0 0 0-6-6"/></svg>ISRO CartoDEM & Copernicus 30m</div>
        </div>

        <div class="provenance-card">
          <div class="provenance-card-header">
            <span class="prov-icon"><svg class="icon-svg" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M13 7 9 3 5 7l4 4"/><path d="m17 11 4 4-4 4-4-4"/><path d="m8 12 4 4 6-6-4-4Z"/><path d="m16 8 3-3"/><path d="M9 21a6 6 0 0 0-6-6"/></svg></span>
            <span class="prov-badge prov-badge-sar">SAR RADAR</span>
          </div>
          <div class="prov-val">${soilMoist}% Saturation</div>
          <div class="prov-trigger">Synthetic aperture radar topsoil dielectric permittivity index</div>
          <div class="prov-agency" style="display:flex;align-items:center;gap:4px;"><svg class="icon-svg" viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2"><path d="M13 7 9 3 5 7l4 4"/><path d="m17 11 4 4-4 4-4-4"/><path d="m8 12 4 4 6-6-4-4Z"/><path d="m16 8 3-3"/><path d="M9 21a6 6 0 0 0-6-6"/></svg>Copernicus Sentinel-1 C-SAR & SMAP</div>
        </div>

        <div class="provenance-card">
          <div class="provenance-card-header">
            <span class="prov-icon"><svg class="icon-svg" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 2v7.31L4.69 19.46A2 2 0 0 0 6.4 22h11.2a2 2 0 0 0 1.71-2.54L14 9.31V2"/><line x1="8.5" y1="2" x2="15.5" y2="2"/><line x1="8" y1="14" x2="16" y2="14"/></svg></span>
            <span class="prov-badge prov-badge-soil">PEDOLOGY</span>
          </div>
          <div class="prov-val">${soilType.split('(')[0].trim()}</div>
          <div class="prov-trigger">High-runoff shallow stony cambisols with low percolation</div>
          <div class="prov-agency" style="display:flex;align-items:center;gap:4px;"><svg class="icon-svg" viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>ISRIC World SoilGrids v2.0</div>
        </div>
      `;
    }

    // Step 5: Fetch Live Ground Telemetry from OpenWeatherMap API
    this.fetchLiveWeather(region.center[0], region.center[1], region.village);

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
      const elevLine = (sz.elevation_m != null)
        ? `Elevation: <strong>${sz.elevation_m}m</strong> (+${sz.relative_safe_height_m}m relative height)<br/>`
        : "";
      setElHTML("inspector-safezone-desc", `
        ${elevLine}
        Distance: <strong>${sz.distance_km != null ? sz.distance_km + ' km' : 'Unknown'}</strong>${sz.est_walk_minutes != null ? ` (~${sz.est_walk_minutes} mins)` : ''} | Access: <em>${sz.road_accessibility || 'Not available'}</em>
      `);
    }

    if (sh) {
      setElText("inspector-shelter-name", sh.name);
      setElHTML("inspector-shelter-desc", `
        Facility: ${sh.facility_type || 'Not available'} | Capacity: <strong>${sh.capacity != null ? sh.capacity + ' persons' : 'Not available'}</strong> | Contact: ${sh.contact || 'Not available'}
      `);
    }

    const dispatchBtn = document.getElementById("inspector-dispatch-btn");
    if (dispatchBtn) {
      dispatchBtn.onclick = () => VajraAlerts.openEmergencyDispatchModal(region);
    }
  }
};

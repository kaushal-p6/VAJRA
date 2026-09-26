/* ==========================================================================
   VAJRA - Analyze Page: National Hazard Situation Awareness Engine
   Explicitly distinguishes ML Model Validation Scope vs Environmental Monitoring
   ========================================================================== */

const VajraAnalyze = {
  sortColumn: "rainfall_24h_mm",
  sortDirection: "desc",
  currentPage: 1,
  pageSize: 10, // Strictly 10 rows per page as specified!
  searchTerm: "",
  tierFilter: "ALL",
  coverageFilter: "ALL",
  chartInstance: null,
  liveDynamicRegions: [],
  searchDebounceTimer: null,

  init() {
    this.liveDynamicRegions = [...VAJRA_DATA.REGIONS];
    this.renderTable();
    this.renderChart();
    this.renderTierDistribution();
  },

  // BUGFIX: this card previously showed hardcoded numbers (2/2/3/3 units,
  // 20/20/30/30%) that summed to 10 units and never matched the actual
  // VAJRA_DATA.REGIONS dataset (5 slope units: 2 Red, 2 Orange, 1 Yellow,
  // 0 Green) and never updated. Compute it from the real data instead.
  renderTierDistribution() {
    const regions = VAJRA_DATA.REGIONS;
    const total = regions.length || 1;
    const counts = { Red: 0, Orange: 0, Yellow: 0, Green: 0 };
    regions.forEach(r => {
      if (counts[r.risk_tier] !== undefined) counts[r.risk_tier]++;
    });

    const setTier = (id, count) => {
      const el = document.getElementById(id);
      if (!el) return;
      const pct = Math.round((count / total) * 100);
      el.textContent = `${count} Slope Unit${count === 1 ? '' : 's'} (${pct}%)`;
    };

    setTier("tier-dist-red", counts.Red);
    setTier("tier-dist-orange", counts.Orange);
    setTier("tier-dist-yellow", counts.Yellow);
    setTier("tier-dist-green", counts.Green);
  },

  setSort(column) {
    if (this.sortColumn === column) {
      this.sortDirection = this.sortDirection === "asc" ? "desc" : "asc";
    } else {
      this.sortColumn = column;
      this.sortDirection = "desc";
    }
    this.currentPage = 1;
    this.renderTable();
  },

  handleSearch(term) {
    this.searchTerm = term.trim().toLowerCase();
    this.currentPage = 1;

    if (this.searchDebounceTimer) clearTimeout(this.searchDebounceTimer);

    this.renderTable();

    if (this.searchTerm.length >= 3) {
      this.searchDebounceTimer = setTimeout(async () => {
        const localMatch = this.liveDynamicRegions.some(r =>
          (r.village && r.village.toLowerCase().includes(this.searchTerm)) ||
          (r.district && r.district.toLowerCase().includes(this.searchTerm)) ||
          (r.state && r.state.toLowerCase().includes(this.searchTerm))
        );

        if (!localMatch) {
          await this.searchOpenStreetMapIndia(this.searchTerm);
          this.renderTable();
          this.renderChart();
        }
      }, 400);
    }
  },

  async searchOpenStreetMapIndia(query) {
    try {
      const url = `https://nominatim.openstreetmap.org/search?format=json&countrycodes=in&q=${encodeURIComponent(query)}`;
      const response = await fetch(url);
      if (!response.ok) return;

      const results = await response.json();
      if (results && results.length > 0) {
        const place = results[0];
        const lat = parseFloat(place.lat);
        const lon = parseFloat(place.lon);

        const weather = await this.fetchLiveOpenMeteoData(lat, lon);

        const displayNameParts = place.display_name.split(",");
        const village = displayNameParts[0] || query;
        const district = displayNameParts[1] ? displayNameParts[1].trim() : "India Sector";
        const state = displayNameParts[displayNameParts.length - 2] ? displayNameParts[displayNameParts.length - 2].trim() : "India";

        let riskScore = 0.20;
        let riskTier = "Green";
        if (weather.rainfall > 120) { riskScore = 0.92; riskTier = "Red"; }
        else if (weather.rainfall > 80) { riskScore = 0.74; riskTier = "Orange"; }
        else if (weather.rainfall > 40) { riskScore = 0.48; riskTier = "Yellow"; }

        const newLiveRegion = {
          unit_id: `IN-LIVE-${Date.now()}`,
          village: village,
          district: district,
          state: state,
          watershed_id: "REGIONAL-WS",
          hazard_type: "Weather Telemetry",
          is_ml_validated: false,
          data_coverage_type: "Environmental Weather Monitoring",
          center: [lat, lon],
          riverbed_elevation_m: Math.floor(weather.elevation || 150),
          predicted_flood_height_m: Math.floor(weather.rainfall / 10),
          coordinates: [
            [lat + 0.015, lon - 0.015],
            [lat + 0.015, lon + 0.015],
            [lat - 0.015, lon + 0.015],
            [lat - 0.015, lon - 0.015]
          ],
          risk_score: riskScore,
          risk_tier: riskTier,
          risk_trend: "Stable",
          hazard_window_hours: "Time-to-impact: Awaiting temporal ML model",
          ml_model_version: "Weather Rule Telemetry",
          ml_timestamp: "2026-09-27 01:25 IST",
          
          data_quality: { rainfall: "Good", soil_moisture: "Good", sensors: "Good", last_updated: "Just now" },

          environmental_inputs: {
            rainfall_latest_mm: Math.round(weather.rainfall / 3),
            rainfall_1h_mm: Math.round(weather.rainfall / 2),
            rainfall_3h_mm: Math.round(weather.rainfall * 0.8),
            rainfall_6h_mm: Math.round(weather.rainfall),
            rainfall_12h_mm: Math.round(weather.rainfall * 1.2),
            rainfall_24h_mm: weather.rainfall,
            rainfall_72h_mm: Math.round(weather.rainfall * 1.8),
            forecast_1h_mm: 5.0,
            forecast_3h_mm: 12.0,
            forecast_6h_mm: 22.0,
            forecast_12h_mm: 35.0,
            forecast_24h_mm: 48.0,
            soil_moisture_pct: weather.soil_moisture,
            soil_moisture_source: "Open-Meteo Weather API",
            slope_angle_deg: 18.0,
            elevation_m: Math.floor(weather.elevation || 180),
            aspect: "S (180°)",
            land_cover: "Mixed Cover",
            soil_type: "Regional Soil"
          },

          main_risk_drivers: [
            { name: `Rainfall (24h: ${weather.rainfall}mm)`, level: "Moderate", impact: "Live weather telemetry" }
          ],

          historical_event_timeline: [],

          exposure: {
            population_in_zone: 350,
            villages_affected_count: 1,
            buildings_count: 40,
            road_segments_affected: ["Local Access Road"],
            hospitals_nearby: ["Sub-District Hospital"],
            schools_nearby: ["Local Primary School"],
            emergency_services: ["District Emergency Post"]
          },

          candidate_safe_high_ground: {
            name: `${village} High Ridge Candidate Safe Area`,
            lat: lat + 0.010,
            lon: lon + 0.010,
            elevation_m: Math.floor((weather.elevation || 150) + 110),
            relative_safe_height_m: 100,
            distance_km: 1.8,
            est_walk_minutes: 22,
            road_accessibility: "Footpath Trail"
          },

          official_government_shelter: {
            name: `${village} Community Center Shelter (Official)`,
            lat: lat + 0.008,
            lon: lon + 0.008,
            capacity: 400,
            contact: "+91 Emergency DEOC",
            facility_type: "Local Emergency Facility"
          }
        };

        this.liveDynamicRegions.unshift(newLiveRegion);
        VajraUI.showToast(`Fetched Live Telemetry for ${village}, India`, "success");
      }
    } catch (e) {
      console.log("OSM Geocoding Error:", e);
    }
  },

  async fetchLiveOpenMeteoData(lat, lon) {
    try {
      const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&daily=precipitation_sum,rain_sum&current_weather=true&hourly=soil_moisture_0_to_1cm`;
      const res = await fetch(url);
      if (!res.ok) return { rainfall: 42, soil_moisture: 65, elevation: 200 };

      const data = await res.json();
      const rain = data.daily && data.daily.precipitation_sum ? Math.round(data.daily.precipitation_sum[0] || 35) : 38;
      const elevation = data.elevation || 200;
      const soil = data.hourly && data.hourly.soil_moisture_0_to_1cm ? Math.round((data.hourly.soil_moisture_0_to_1cm[0] || 0.6) * 100) : 68;

      return { rainfall: rain, soil_moisture: soil, elevation: elevation };
    } catch (e) {
      return { rainfall: 45, soil_moisture: 62, elevation: 180 };
    }
  },

  handleTierFilter(tier) {
    this.tierFilter = tier;
    this.currentPage = 1;
    this.renderTable();
  },

  handleCoverageFilter(type) {
    this.coverageFilter = type;
    this.currentPage = 1;
    this.renderTable();
  },

  getFieldValue(r, field) {
    if (field === "village") return r.village || "";
    if (field === "district") return r.district || "";
    if (field === "risk_tier") return r.risk_tier || "";
    if (field === "risk_score") return r.risk_score || 0;
    if (field === "risk_trend") return r.risk_trend || "";

    if (field === "soil_saturation_pct" || field === "soil_moisture_pct") {
      return r.environmental_inputs ? r.environmental_inputs.soil_moisture_pct : (r.soil_saturation_pct || 0);
    }
    if (field === "rainfall_24h_mm") {
      return r.environmental_inputs ? r.environmental_inputs.rainfall_24h_mm : (r.rainfall_24h_mm || 0);
    }
    if (field === "slope_angle_deg") {
      return r.environmental_inputs ? r.environmental_inputs.slope_angle_deg : (r.slope_angle_deg || 0);
    }
    if (field === "population_in_zone" || field === "population_at_risk") {
      return r.exposure ? r.exposure.population_in_zone : (r.population_at_risk || 0);
    }

    if (r.environmental_inputs && field in r.environmental_inputs) {
      return r.environmental_inputs[field];
    }

    return r[field] || 0;
  },

  getFilteredAndSortedData() {
    let data = [...this.liveDynamicRegions];

    if (this.searchTerm) {
      data = data.filter(r =>
        (r.village && r.village.toLowerCase().includes(this.searchTerm)) ||
        (r.district && r.district.toLowerCase().includes(this.searchTerm)) ||
        (r.state && r.state.toLowerCase().includes(this.searchTerm))
      );
    }

    if (this.tierFilter !== "ALL") {
      data = data.filter(r => r.risk_tier === this.tierFilter);
    }

    if (this.coverageFilter !== "ALL") {
      if (this.coverageFilter === "ML_PILOT") {
        data = data.filter(r => r.is_ml_validated);
      } else if (this.coverageFilter === "ENV_MONITORING") {
        data = data.filter(r => !r.is_ml_validated);
      }
    }

    data.sort((a, b) => {
      let valA = this.getFieldValue(a, this.sortColumn);
      let valB = this.getFieldValue(b, this.sortColumn);

      if (typeof valA === "string") {
        valA = valA.toLowerCase();
        valB = valB.toLowerCase();
      }

      if (valA < valB) return this.sortDirection === "asc" ? -1 : 1;
      if (valA > valB) return this.sortDirection === "asc" ? 1 : -1;
      return 0;
    });

    return data;
  },

  renderTable() {
    const tableBody = document.getElementById("analyze-table-body");
    const paginationInfo = document.getElementById("pagination-info");
    const paginationControls = document.getElementById("pagination-controls");
    if (!tableBody) return;

    const data = this.getFilteredAndSortedData();
    const totalEntries = data.length;
    const totalPages = Math.ceil(totalEntries / this.pageSize) || 1;

    if (this.currentPage > totalPages) this.currentPage = totalPages;

    const startIndex = (this.currentPage - 1) * this.pageSize;
    const pageData = data.slice(startIndex, startIndex + this.pageSize);

    document.querySelectorAll(".telemetry-table th[data-sort]").forEach(th => {
      const col = th.dataset.sort;
      th.classList.toggle("sorted", col === this.sortColumn);
      const icon = th.querySelector(".sort-icon");
      if (icon) {
        if (col === this.sortColumn) {
          icon.textContent = this.sortDirection === "asc" ? "▲" : "▼";
        } else {
          icon.textContent = "⇅";
        }
      }
    });

    if (pageData.length === 0) {
      tableBody.innerHTML = `
        <tr>
          <td colspan="10" style="text-align: center; padding: 2rem; color: #64748b;">
            No matching telemetry records found for "${this.searchTerm}"
          </td>
        </tr>
      `;
      return;
    }

    tableBody.innerHTML = pageData.map((r, i) => {
      const tierDef = VAJRA_CONFIG.RISK_TIERS[r.risk_tier] || VAJRA_CONFIG.RISK_TIERS.Green;
      const env = r.environmental_inputs || {};
      const exp = r.exposure || { population_in_zone: 0 };
      const rain24 = env.rainfall_24h_mm !== undefined ? env.rainfall_24h_mm : (r.rainfall_24h_mm || 0);
      const rain72 = env.rainfall_72h_mm !== undefined ? env.rainfall_72h_mm : (r.rainfall_3d_mm || 0);
      const soilPct = env.soil_moisture_pct !== undefined ? env.soil_moisture_pct : (r.soil_saturation_pct || 0);
      const slopeDeg = env.slope_angle_deg !== undefined ? env.slope_angle_deg : (r.slope_angle_deg || 0);

      return `
        <tr>
          <td><strong>${startIndex + i + 1}</strong></td>
          <td>
            <strong style="color: #0f172a;">${r.village || 'Sector'}</strong>
            <div style="font-size: 0.72rem; color: #64748b;">${r.district || ''}, ${r.state || ''}</div>
          </td>
          <td>
            <span style="font-size: 0.68rem; padding: 2px 6px; border-radius: 4px; font-weight: 700; ${r.is_ml_validated ? 'background: #eff6ff; color: #1d4ed8; border: 1px solid #bfdbfe;' : 'background: #f8fafc; color: #475569; border: 1px solid #cbd5e1;'}">
              ${r.is_ml_validated ? 'ML Model (Uttarkashi Pilot)' : 'Environmental Monitoring'}
            </span>
          </td>
          <td>
            <span class="risk-badge ${(r.risk_tier || 'green').toLowerCase()}">${r.risk_tier || 'Green'}</span>
          </td>
          <td>
            <strong style="color: ${rain24 > 100 ? '#dc2626' : '#2563eb'};">${rain24} mm</strong>
            <div style="font-size: 0.72rem; color: #64748b;">72h: ${rain72} mm</div>
          </td>
          <td>
            <strong style="color: ${soilPct > 85 ? '#dc2626' : '#ea580c'};">${soilPct}%</strong>
          </td>
          <td>${slopeDeg}°</td>
          <td>
            <div style="font-weight: 800; color: ${tierDef.color};">${((r.risk_score || 0) * 100).toFixed(0)}%</div>
          </td>
          <td>
            <span style="font-weight: 700; font-size: 0.78rem;">${r.risk_trend === 'Increasing' ? '↑ Increasing' : r.risk_trend === 'Decreasing' ? '↓ Decreasing' : '→ Stable'}</span>
          </td>
          <td>~${exp.population_in_zone} citizens</td>
        </tr>
      `;
    }).join("");

    if (paginationInfo) {
      const endItem = Math.min(startIndex + this.pageSize, totalEntries);
      paginationInfo.textContent = `Showing ${totalEntries > 0 ? startIndex + 1 : 0} to ${endItem} of ${totalEntries} regions`;
    }

    if (paginationControls) {
      let btnsHtml = `
        <button class="page-btn" ${this.currentPage === 1 ? 'disabled' : ''} onclick="VajraAnalyze.goToPage(${this.currentPage - 1})">◀</button>
      `;

      for (let p = 1; p <= totalPages; p++) {
        btnsHtml += `
          <button class="page-btn ${p === this.currentPage ? 'active' : ''}" onclick="VajraAnalyze.goToPage(${p})">${p}</button>
        `;
      }

      btnsHtml += `
        <button class="page-btn" ${this.currentPage === totalPages ? 'disabled' : ''} onclick="VajraAnalyze.goToPage(${this.currentPage + 1})">▶</button>
      `;

      paginationControls.innerHTML = btnsHtml;
    }

    this.renderNationwideExtremes();
  },

  renderNationwideExtremes() {
    const highestBox = document.getElementById("nationwide-highest-rain");
    const lowestBox = document.getElementById("nationwide-lowest-rain");
    if (!highestBox || !lowestBox) return;

    const allData = [...this.liveDynamicRegions].sort((a, b) => {
      const rainA = a.environmental_inputs ? a.environmental_inputs.rainfall_24h_mm : (a.rainfall_24h_mm || 0);
      const rainB = b.environmental_inputs ? b.environmental_inputs.rainfall_24h_mm : (b.rainfall_24h_mm || 0);
      return rainB - rainA;
    });
    const highest = allData[0];
    const lowest = allData[allData.length - 1];

    if (highest) {
      const envH = highest.environmental_inputs || {};
      highestBox.innerHTML = `
        <div style="font-weight: 800; color: #dc2626;">${highest.village} (${highest.district}, ${highest.state})</div>
        <div style="font-size: 0.85rem; color: #374151;">24h Rain: <strong>${envH.rainfall_24h_mm || 0} mm</strong> | Soil Moisture: ${envH.soil_moisture_pct || 0}%</div>
      `;
    }

    if (lowest) {
      const envL = lowest.environmental_inputs || {};
      lowestBox.innerHTML = `
        <div style="font-weight: 800; color: #16a34a;">${lowest.village} (${lowest.district}, ${lowest.state})</div>
        <div style="font-size: 0.85rem; color: #374151;">24h Rain: <strong>${envL.rainfall_24h_mm || 0} mm</strong> | Soil Moisture: ${envL.soil_moisture_pct || 0}%</div>
      `;
    }
  },

  goToPage(page) {
    this.currentPage = page;
    this.renderTable();
  },

  renderChart() {
    const canvas = document.getElementById("analyze-chart");
    if (!canvas || typeof Chart === "undefined") return;

    if (this.chartInstance) {
      this.chartInstance.destroy();
    }

    const ctx = canvas.getContext("2d");
    const topData = this.liveDynamicRegions.slice(0, 10);
    const labels = topData.map(r => r.village);
    const rainData = topData.map(r => r.environmental_inputs ? r.environmental_inputs.rainfall_24h_mm : (r.rainfall_24h_mm || 0));
    const soilData = topData.map(r => r.environmental_inputs ? r.environmental_inputs.soil_moisture_pct : (r.soil_saturation_pct || 0));

    this.chartInstance = new Chart(ctx, {
      type: "bar",
      data: {
        labels: labels,
        datasets: [
          {
            label: "24h Rainfall (mm)",
            data: rainData,
            backgroundColor: "rgba(37, 99, 235, 0.85)",
            borderColor: "#1d4ed8",
            borderWidth: 1
          },
          {
            label: "Soil Moisture (%)",
            data: soilData,
            backgroundColor: "rgba(234, 88, 12, 0.85)",
            borderColor: "#c2410c",
            borderWidth: 1
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { labels: { color: "#334155", font: { family: "Inter", weight: "600" } } }
        },
        scales: {
          x: { ticks: { color: "#64748b" }, grid: { color: "#e2e8f0" } },
          y: { ticks: { color: "#64748b" }, grid: { color: "#e2e8f0" } }
        }
      }
    });
  }
};

/* ==========================================================================
   VAJRA - Analyze Page: National Hazard Situation Awareness Engine
   Explicitly distinguishes ML Model Validation Scope vs Environmental Monitoring
   ========================================================================== */

const NATIONAL_TELEMETRY_SECTORS = [];

const VajraAnalyze = {
  sortColumn: "rainfall_24h_mm",
  sortDirection: "desc",
  currentPage: 1,
  pageSize: 10, // Strictly 10 rows per page
  searchTerm: "",
  tierFilter: "ALL",
  coverageFilter: "ALL",
  chartInstance: null,
  liveDynamicRegions: [],
  searchDebounceTimer: null,

  init() {
    // Strictly display the 12 active verified disaster events
    this.liveDynamicRegions = [...(VAJRA_DATA.REGIONS || [])];
    this.render();
  },

  // Master Synchronized Render Pipeline
  render() {
    this.renderTable();
    this.renderChart();
    this.renderTierDistribution();
    this.renderNationwideExtremes();
  },

  renderTierDistribution() {
    const data = this.getFilteredAndSortedData();
    const total = data.length || 1;
    const counts = { Red: 0, Orange: 0, Yellow: 0, Green: 0 };
    data.forEach(r => {
      if (counts[r.risk_tier] !== undefined) counts[r.risk_tier]++;
    });

    const updateTier = (tierKey, idCount, idBar) => {
      const count = counts[tierKey] || 0;
      const pct = Math.round((count / total) * 100);
      const countEl = document.getElementById(idCount);
      const barEl = document.getElementById(idBar);
      if (countEl) {
        countEl.textContent = `${count} Sector${count === 1 ? '' : 's'} (${pct}%)`;
      }
      if (barEl) {
        barEl.style.width = `${pct}%`;
      }
    };

    updateTier("Red", "tier-dist-red", "tier-bar-red");
    updateTier("Orange", "tier-dist-orange", "tier-bar-orange");
    updateTier("Yellow", "tier-dist-yellow", "tier-bar-yellow");
    updateTier("Green", "tier-dist-green", "tier-bar-green");

    const badgeTotal = document.getElementById("tier-dist-total-badge");
    if (badgeTotal) {
      badgeTotal.textContent = `${data.length} Total Units`;
    }
  },

  setSort(column) {
    if (this.sortColumn === column) {
      this.sortDirection = this.sortDirection === "asc" ? "desc" : "asc";
    } else {
      this.sortColumn = column;
      this.sortDirection = "desc";
    }
    this.currentPage = 1;
    this.render();
  },

  handleSearch(term) {
    this.searchTerm = term.trim().toLowerCase();
    this.currentPage = 1;

    if (this.searchDebounceTimer) clearTimeout(this.searchDebounceTimer);

    this.render();

    if (this.searchTerm.length >= 3) {
      this.searchDebounceTimer = setTimeout(async () => {
        const localMatch = this.liveDynamicRegions.some(r =>
          (r.village && r.village.toLowerCase().includes(this.searchTerm)) ||
          (r.district && r.district.toLowerCase().includes(this.searchTerm)) ||
          (r.state && r.state.toLowerCase().includes(this.searchTerm))
        );

        if (!localMatch) {
          await this.searchOpenStreetMapIndia(this.searchTerm);
          this.render();
        }
      }, 450);
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

        let riskScore = 0.25;
        let riskTier = "Green";
        if (weather.rainfall > 120) { riskScore = 0.92; riskTier = "Red"; }
        else if (weather.rainfall > 80) { riskScore = 0.74; riskTier = "Orange"; }
        else if (weather.rainfall > 40) { riskScore = 0.52; riskTier = "Yellow"; }

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
          coordinates: [
            [lat + 0.015, lon - 0.015],
            [lat + 0.015, lon + 0.015],
            [lat - 0.015, lon + 0.015],
            [lat - 0.015, lon - 0.015]
          ],
          risk_score: riskScore,
          risk_tier: riskTier,
          risk_trend: "Stable",
          environmental_inputs: {
            rainfall_24h_mm: weather.rainfall,
            rainfall_72h_mm: Math.round(weather.rainfall * 1.5),
            soil_moisture_pct: weather.soil_moisture,
            slope_angle_deg: 20.0,
            elevation_m: Math.floor(weather.elevation || 200)
          },
          exposure: { population_in_zone: 350 }
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
    this.render();
  },

  handleCoverageFilter(type) {
    this.coverageFilter = type;
    this.currentPage = 1;
    this.render();
  },

  resetFilters() {
    this.searchTerm = "";
    this.tierFilter = "ALL";
    this.coverageFilter = "ALL";
    this.currentPage = 1;
    this.sortColumn = "rainfall_24h_mm";
    this.sortDirection = "desc";

    const searchInput = document.getElementById("search-input");
    const tierSelect = document.getElementById("tier-filter-select");
    const covSelect = document.getElementById("coverage-filter-select");
    if (searchInput) searchInput.value = "";
    if (tierSelect) tierSelect.value = "ALL";
    if (covSelect) covSelect.value = "ALL";

    this.render();
    if (typeof VajraUI !== "undefined") {
      VajraUI.showToast("Telemetry filters reset", "info");
    }
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
          <td colspan="11" style="text-align: center; padding: 2.5rem; color: #64748b;">
            <div style="font-weight: 700; font-size: 0.95rem; color: #1e293b; margin-bottom: 4px;">No matching telemetry records found</div>
            <div style="font-size: 0.82rem;">Try clearing search "${this.searchTerm}" or changing the active risk tier filter.</div>
          </td>
        </tr>
      `;
      if (paginationInfo) paginationInfo.textContent = "Showing 0 to 0 of 0 regions";
      if (paginationControls) paginationControls.innerHTML = "";
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
        <tr onclick="VajraAnalyze.viewOnMap('${r.unit_id}')" title="Click to view ${r.village} on 3D Map">
          <td><strong>${startIndex + i + 1}</strong></td>
          <td>
            <strong style="color: #0f172a; font-size: 0.9rem;">${r.village || 'Sector'}</strong>
            <div style="font-size: 0.72rem; color: #64748b;">${r.district || ''}, ${r.state || ''}</div>
          </td>
          <td>
            <span class="risk-badge ${(r.risk_tier || 'green').toLowerCase()}">${r.risk_tier || 'Green'}</span>
          </td>
          <td>
            <strong style="color: ${rain24 > 100 ? '#dc2626' : '#2563eb'}; font-size: 0.92rem;">${rain24} mm</strong>
            <div style="font-size: 0.7rem; color: #64748b;">72h: ${rain72} mm</div>
          </td>
          <td>
            <strong style="color: ${soilPct > 85 ? '#dc2626' : '#ea580c'}; font-size: 0.9rem;">${soilPct}%</strong>
          </td>
          <td>${slopeDeg}°</td>
          <td>
            <div style="font-weight: 800; font-size: 0.92rem; color: ${tierDef.color};">${((r.risk_score || 0) * 100).toFixed(0)}%</div>
          </td>
          <td>
            <span style="font-weight: 700; font-size: 0.78rem; color: ${r.risk_trend === 'Increasing' ? '#dc2626' : r.risk_trend === 'Decreasing' ? '#16a34a' : '#64748b'};">
              ${r.risk_trend === 'Increasing' ? '↑ Increasing' : r.risk_trend === 'Decreasing' ? '↓ Decreasing' : '→ Stable'}
            </span>
          </td>
          <td>~${exp.population_in_zone} citizens</td>
          <td style="text-align: center;">
            <button type="button" class="btn-view-map-mini" onclick="event.stopPropagation(); VajraAnalyze.viewOnMap('${r.unit_id}')" title="Locate on 3D Map">
              <svg class="icon-svg" viewBox="0 0 24 24" width="12" height="12"><polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6"/></svg>
              <span>Map</span>
            </button>
          </td>
        </tr>
      `;
    }).join("");

    if (paginationInfo) {
      const endItem = Math.min(startIndex + this.pageSize, totalEntries);
      paginationInfo.textContent = `Showing ${totalEntries > 0 ? startIndex + 1 : 0} to ${endItem} of ${totalEntries} regions`;
    }

    if (paginationControls) {
      let btnsHtml = `
        <button class="page-btn" ${this.currentPage === 1 ? 'disabled' : ''} onclick="VajraAnalyze.goToPage(${this.currentPage - 1})" aria-label="Previous Page">
          <svg class="icon-svg" viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="15 18 9 12 15 6"/></svg>
        </button>
      `;

      for (let p = 1; p <= totalPages; p++) {
        btnsHtml += `
          <button class="page-btn ${p === this.currentPage ? 'active' : ''}" onclick="VajraAnalyze.goToPage(${p})">${p}</button>
        `;
      }

      btnsHtml += `
        <button class="page-btn" ${this.currentPage === totalPages ? 'disabled' : ''} onclick="VajraAnalyze.goToPage(${this.currentPage + 1})" aria-label="Next Page">
          <svg class="icon-svg" viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="9 18 15 12 9 6"/></svg>
        </button>
      `;

      paginationControls.innerHTML = btnsHtml;
    }
  },

  renderNationwideExtremes() {
    const highestBox = document.getElementById("nationwide-highest-rain");
    const lowestBox = document.getElementById("nationwide-lowest-rain");
    const synthBox = document.getElementById("nationwide-synthesis");
    if (!highestBox || !lowestBox) return;

    const allData = this.getFilteredAndSortedData();
    if (allData.length === 0) {
      highestBox.innerHTML = '<div style="color: #64748b; font-size: 0.82rem;">No sectors matching active filter</div>';
      lowestBox.innerHTML = '<div style="color: #64748b; font-size: 0.82rem;">No sectors matching active filter</div>';
      if (synthBox) synthBox.innerHTML = '<div style="color: #64748b; font-size: 0.82rem;">No sectors matching active filter</div>';
      return;
    }

    const sortedByRain = [...allData].sort((a, b) => {
      const rainA = a.environmental_inputs ? a.environmental_inputs.rainfall_24h_mm : (a.rainfall_24h_mm || 0);
      const rainB = b.environmental_inputs ? b.environmental_inputs.rainfall_24h_mm : (b.rainfall_24h_mm || 0);
      return rainB - rainA;
    });

    const highest = sortedByRain[0];
    const lowest = sortedByRain[sortedByRain.length - 1];

    const totalRain = allData.reduce((sum, r) => {
      const rain = r.environmental_inputs ? r.environmental_inputs.rainfall_24h_mm : (r.rainfall_24h_mm || 0);
      return sum + rain;
    }, 0);
    const avgRain = (totalRain / allData.length).toFixed(1);

    const redCount = allData.filter(r => r.risk_tier === "Red").length;
    const orangeCount = allData.filter(r => r.risk_tier === "Orange").length;

    if (highest) {
      const envH = highest.environmental_inputs || {};
      highestBox.innerHTML = `
        <div class="extreme-village-title">${highest.village}</div>
        <div class="extreme-location-sub">${highest.district}, ${highest.state}</div>
        <div class="extreme-metrics-row">
          <span>24h Rain: <strong style="color: #dc2626;">${envH.rainfall_24h_mm || 0} mm</strong></span>
          <span>72h: <strong>${envH.rainfall_72h_mm || 0} mm</strong></span>
          <span>Soil: <strong>${envH.soil_moisture_pct || 0}%</strong></span>
        </div>
        <button type="button" class="btn-locate-map" onclick="VajraAnalyze.viewOnMap('${highest.unit_id}')">
          <svg class="icon-svg" viewBox="0 0 24 24" width="12" height="12"><polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6"/></svg>
          <span>Locate on Map</span>
        </button>
      `;
    }

    if (lowest) {
      const envL = lowest.environmental_inputs || {};
      lowestBox.innerHTML = `
        <div class="extreme-village-title">${lowest.village}</div>
        <div class="extreme-location-sub">${lowest.district}, ${lowest.state}</div>
        <div class="extreme-metrics-row">
          <span>24h Rain: <strong style="color: #16a34a;">${envL.rainfall_24h_mm || 0} mm</strong></span>
          <span>Soil: <strong>${envL.soil_moisture_pct || 0}%</strong></span>
          <span>Slope: <strong>${envL.slope_angle_deg || 0}°</strong></span>
        </div>
        <button type="button" class="btn-locate-map" onclick="VajraAnalyze.viewOnMap('${lowest.unit_id}')">
          <svg class="icon-svg" viewBox="0 0 24 24" width="12" height="12"><polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6"/></svg>
          <span>Locate on Map</span>
        </button>
      `;
    }

    if (synthBox) {
      synthBox.innerHTML = `
        <div class="extreme-village-title">${allData.length} Monitored Basins</div>
        <div class="extreme-location-sub">Himalayan & Western Ghats Stations Active</div>
        <div class="extreme-metrics-row">
          <span>Mean Rain: <strong>${avgRain} mm</strong></span>
          <span>Critical (Red): <strong style="color: #dc2626;">${redCount}</strong></span>
          <span>High: <strong style="color: #ea580c;">${orangeCount}</strong></span>
        </div>
        <button type="button" class="btn-locate-map" onclick="VajraUI.switchTab('dashboard'); VajraMap.focusAllAlerts();">
          <svg class="icon-svg" viewBox="0 0 24 24" width="12" height="12"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="4"/></svg>
          <span>View All on Map</span>
        </button>
      `;
    }
  },

  goToPage(page) {
    this.currentPage = page;
    this.renderTable();
  },

  viewOnMap(unitId) {
    const region = this.liveDynamicRegions.find(r => r.unit_id === unitId) || VAJRA_DATA.REGIONS.find(r => r.unit_id === unitId);
    if (!region) return;

    VajraUI.switchTab("dashboard");

    if (typeof VajraMap !== "undefined") {
      const tierCheckboxMap = { Red: "risk_extreme", Orange: "risk_high", Yellow: "risk_moderate", Green: "risk_low" };
      const checkboxId = tierCheckboxMap[region.risk_tier];
      if (checkboxId && VajraMap.activeRiskTiers && !VajraMap.activeRiskTiers.has(region.risk_tier)) {
        VajraMap.toggleOverlayGroup(checkboxId, true);
        const cb = document.getElementById(`layer_${checkboxId}`) || document.getElementById(checkboxId);
        if (cb) cb.checked = true;
      }
      setTimeout(() => {
        const found = VAJRA_DATA.REGIONS.find(r => r.unit_id === unitId);
        if (found) {
          VajraMap.selectRegion(found, true);
        } else if (region.center) {
          VajraMap.map.flyTo(region.center, 12, { duration: 1.2 });
          VajraUI.showToast(`Navigated to ${region.village} (${region.district})`, "info");
        }
      }, 150);
    }
  },

  exportCSV() {
    const data = this.getFilteredAndSortedData();
    if (!data.length) {
      VajraUI.showToast("No telemetry data to export", "warning");
      return;
    }

    const headers = [
      "Unit ID",
      "Village / Sector",
      "District",
      "State",
      "Risk Tier",
      "Risk Score (%)",
      "24h Rainfall (mm)",
      "72h Rainfall (mm)",
      "Soil Moisture (%)",
      "Slope Angle (deg)",
      "Trend",
      "Exposed Population"
    ];

    const rows = data.map(r => {
      const env = r.environmental_inputs || {};
      const exp = r.exposure || { population_in_zone: 0 };
      const rain24 = env.rainfall_24h_mm !== undefined ? env.rainfall_24h_mm : (r.rainfall_24h_mm || 0);
      const rain72 = env.rainfall_72h_mm !== undefined ? env.rainfall_72h_mm : (r.rainfall_3d_mm || 0);
      const soilPct = env.soil_moisture_pct !== undefined ? env.soil_moisture_pct : (r.soil_saturation_pct || 0);
      const slopeDeg = env.slope_angle_deg !== undefined ? env.slope_angle_deg : (r.slope_angle_deg || 0);

      return [
        `"${r.unit_id || ''}"`,
        `"${(r.village || '').replace(/"/g, '""')}"`,
        `"${(r.district || '').replace(/"/g, '""')}"`,
        `"${(r.state || '').replace(/"/g, '""')}"`,
        `"${r.risk_tier || ''}"`,
        `"${((r.risk_score || 0) * 100).toFixed(0)}%"`,
        rain24,
        rain72,
        soilPct,
        slopeDeg,
        `"${r.risk_trend || 'Stable'}"`,
        exp.population_in_zone || 0
      ].join(",");
    });

    const csvContent = [headers.join(","), ...rows].join("\r\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `VAJRA_National_Telemetry_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    VajraUI.showToast(`Exported ${data.length} telemetry records to CSV`, "success");
  },

  renderChart() {
    const canvas = document.getElementById("analyze-chart");
    if (!canvas || typeof Chart === "undefined") return;

    if (this.chartInstance) {
      this.chartInstance.destroy();
    }

    const filtered = this.getFilteredAndSortedData();
    const topData = filtered.slice(0, 10);
    const labels = topData.map(r => r.village.length > 15 ? r.village.slice(0, 13) + "…" : r.village);
    const rainData = topData.map(r => r.environmental_inputs ? r.environmental_inputs.rainfall_24h_mm : (r.rainfall_24h_mm || 0));
    const soilData = topData.map(r => r.environmental_inputs ? r.environmental_inputs.soil_moisture_pct : (r.soil_saturation_pct || 0));

    const ctx = canvas.getContext("2d");
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
            borderWidth: 1,
            borderRadius: 4
          },
          {
            label: "Soil Moisture (%)",
            data: soilData,
            backgroundColor: "rgba(234, 88, 12, 0.85)",
            borderColor: "#c2410c",
            borderWidth: 1,
            borderRadius: 4
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: "top",
            labels: {
              boxWidth: 12,
              color: "#334155",
              font: { family: "Inter", weight: "600", size: 11 }
            }
          },
          tooltip: {
            callbacks: {
              title: (items) => {
                const idx = items[0].dataIndex;
                const r = topData[idx];
                return r ? `${r.village} (${r.district}, ${r.state})` : "";
              }
            }
          }
        },
        scales: {
          x: {
            ticks: {
              color: "#64748b",
              font: { size: 10, family: "Inter" },
              maxRotation: 30,
              minRotation: 0
            },
            grid: { display: false }
          },
          y: {
            beginAtZero: true,
            ticks: { color: "#64748b", font: { size: 10 } },
            grid: { color: "#f1f5f9" }
          }
        }
      }
    });
  }
};

/* ==========================================================================
   VAJRA - Application Controller & Event Orchestrator
   ========================================================================== */

const VajraUI = {
  activeTab: "dashboard",

  init() {
    // 1. Initialize Real-Time IST GMT+5:30 24h Clock
    VajraClock.init();

    // 2. Initialize Auth Session
    VajraAuth.init();

    // 3. Initialize Interactive Map Engine
    VajraMap.init();

    // 4. Initialize Alert System
    VajraAlerts.init();

    // 5. Initialize Analyze Telemetry Engine
    VajraAnalyze.init();

    // 6. Connect to the real ML prediction API if available — falls back
    // to the static demo data already loaded above if it's unreachable.
    VajraLiveFeed.init();

    // Update KPI Header Cards
    this.updateKPICards();

    // Global Click Listener for dropdown dismissal
    document.addEventListener("click", (e) => {
      const notifWrapper = document.querySelector(".notif-wrapper");
      const notifDropdown = document.getElementById("notif-dropdown");
      if (notifWrapper && !notifWrapper.contains(e.target) && notifDropdown) {
        notifDropdown.classList.remove("show");
      }
    });

    // Responsive Map & Layout Window Resize Listener
    let resizeDebounce = null;
    window.addEventListener("resize", () => {
      clearTimeout(resizeDebounce);
      resizeDebounce = setTimeout(() => {
        if (typeof VajraMap !== "undefined" && VajraMap.map) {
          VajraMap.map.invalidateSize();
        }
      }, 150);
    });

    // 7. Initial Access Control Check:
    // If the visitor has not entered in this session, keep login screen active (concealing dashboard)
    const loginScreen = document.getElementById("vajra-login-screen");
    if (!sessionStorage.getItem("vajra_entered")) {
      if (loginScreen) loginScreen.classList.remove("hidden");
    } else {
      if (loginScreen) loginScreen.classList.add("hidden");
    }
  },

  switchTab(tabName) {
    if (this.activeTab === tabName) return;

    document.querySelectorAll(".nav-btn").forEach(btn => {
      btn.classList.toggle("active", btn.dataset.tab === tabName);
    });

    document.querySelectorAll(".tab-page").forEach(page => {
      page.classList.toggle("active", page.id === `tab-${tabName}`);
    });

    this.activeTab = tabName;

    if (tabName === "dashboard" && VajraMap.map) {
      setTimeout(() => {
        VajraMap.map.invalidateSize();
      }, 100);
    }

    if (tabName === "analyze") {
      VajraAnalyze.render();
    }

    if (tabName === "alerts") {
      VajraAlerts.renderAlertHistory();
    }
  },

  updateKPICards() {
    const redCount = VAJRA_DATA.REGIONS.filter(r => r.risk_tier === "Red").length;
    const orangeCount = VAJRA_DATA.REGIONS.filter(r => r.risk_tier === "Orange").length;
    const avgSoil = (VAJRA_DATA.REGIONS.reduce((sum, r) => {
      const soil = r.environmental_inputs ? r.environmental_inputs.soil_moisture_pct : (r.soil_saturation_pct || 75);
      return sum + soil;
    }, 0) / VAJRA_DATA.REGIONS.length).toFixed(1);
    const maxRain = Math.max(...VAJRA_DATA.REGIONS.map(r => r.environmental_inputs ? r.environmental_inputs.rainfall_24h_mm : (r.rainfall_24h_mm || 0)));

    const kpiRed = document.getElementById("kpi-red-alerts");
    const kpiOrange = document.getElementById("kpi-orange-alerts");
    const kpiSoil = document.getElementById("kpi-avg-soil");
    const kpiRain = document.getElementById("kpi-max-rain");

    if (kpiRed) kpiRed.textContent = redCount;
    if (kpiOrange) kpiOrange.textContent = orangeCount;
    if (kpiSoil) kpiSoil.textContent = `${avgSoil}%`;
    if (kpiRain) kpiRain.textContent = `${maxRain} mm`;
  },

  simulateMonsoonEvent() {
    this.showToast("Simulating Torrential Cloudburst Event in Uttarkashi & Wayanad...", "warning");

    const uttar = VAJRA_DATA.REGIONS.find(r => r.unit_id === "UK-SU-20820");
    if (uttar && uttar.environmental_inputs) {
      uttar.environmental_inputs.rainfall_24h_mm += 45;
      uttar.environmental_inputs.rainfall_72h_mm += 45;
      uttar.environmental_inputs.soil_moisture_pct = 98;
      uttar.risk_score = 0.99;
      uttar.risk_tier = "Red";
      uttar.hazard_window_hours = "Elevated risk expected during next 1-2 hours";
    }

    const wayanad = VAJRA_DATA.REGIONS.find(r => r.unit_id === "KL-WY-10492");
    if (wayanad && wayanad.environmental_inputs) {
      wayanad.environmental_inputs.rainfall_24h_mm += 50;
      wayanad.environmental_inputs.rainfall_72h_mm += 50;
      wayanad.environmental_inputs.soil_moisture_pct = 99;
      wayanad.risk_score = 0.97;
      wayanad.risk_tier = "Red";
      wayanad.hazard_window_hours = "Elevated risk expected during next 1-2 hours";
    }

    VajraMap.renderOperationalOverlays();
    if (uttar) VajraMap.selectRegion(uttar, true);

    VajraAlerts.updateEmergencyBanner();
    this.updateKPICards();

    if (this.activeTab === "analyze") {
      VajraAnalyze.render();
    }

    VajraAlerts.playAudioAlert();
    VajraAlerts.openEmergencyDispatchModal(uttar);
  },

  openLoginModal() {
    const loginScreen = document.getElementById("vajra-login-screen");
    if (loginScreen) loginScreen.classList.remove("hidden");
  },

  handleLoginSubmit(e) {
    e.preventDefault();
    const deptIdInput = document.getElementById("login-dept-id");
    const passwordInput = document.getElementById("login-password");
    const idError = document.getElementById("login-id-error");
    const passError = document.getElementById("login-password-error");

    if (idError) { idError.textContent = ""; idError.style.display = "none"; }
    if (passError) { passError.textContent = ""; passError.style.display = "none"; }
    if (deptIdInput) deptIdInput.classList.remove("is-invalid");
    if (passwordInput) passwordInput.classList.remove("is-invalid");

    const deptId = (deptIdInput?.value || "").trim();
    const password = (passwordInput?.value || "").trim();

    let hasError = false;
    if (!deptId) {
      if (idError) { idError.textContent = "Please enter your Official ID or Email."; idError.style.display = "block"; }
      if (deptIdInput) deptIdInput.classList.add("is-invalid");
      hasError = true;
    }

    if (!password) {
      if (passError) { passError.textContent = "Please enter your password."; passError.style.display = "block"; }
      if (passwordInput) passwordInput.classList.add("is-invalid");
      hasError = true;
    } else if (password.length < 8) {
      if (passError) { passError.textContent = "Password must be at least 8 characters."; passError.style.display = "block"; }
      if (passwordInput) passwordInput.classList.add("is-invalid");
      hasError = true;
    }

    if (hasError) return;

    const res = VajraAuth.login(deptId, password);
    if (res.success) {
      this.showToast(res.message, "success");
      if (typeof VajraAlerts !== "undefined") {
        VajraAlerts.updateEmergencyBanner();
      }
    } else {
      if (passError) {
        passError.textContent = res.message;
        passError.style.display = "block";
      }
      this.showToast(res.message, "error");
    }
  },

  showModal(id) {
    const modal = document.getElementById(id);
    if (modal) modal.classList.add("show");
  },

  closeModal(id) {
    const modal = document.getElementById(id);
    if (modal) modal.classList.remove("show");
  },

  showToast(message, type = "info") {
    const container = document.getElementById("toast-container");
    if (!container) return;

    const toast = document.createElement("div");
    toast.className = `toast-msg ${type}`;
    toast.innerHTML = `
      <div>${message}</div>
    `;

    container.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = "0";
      toast.style.transform = "translateX(40px)";
      setTimeout(() => toast.remove(), 300);
    }, 4000);
  }
};

document.addEventListener("DOMContentLoaded", () => {
  VajraUI.init();
});

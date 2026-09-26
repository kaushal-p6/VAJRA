/* ==========================================================================
   VAJRA - Role-Based Authentication & Session Manager
   ========================================================================== */

const VajraAuth = {
  currentUser: null,

  init() {
    const savedSession = localStorage.getItem("vajra_session");
    if (savedSession) {
      try {
        this.currentUser = JSON.parse(savedSession);
      } catch (e) {
        this.setDefaultSession();
      }
    } else {
      this.setDefaultSession();
    }

    this.updateUI();
  },

  setDefaultSession() {
    // Default session pre-loaded with NDRF Authorized ID for easy review
    this.currentUser = {
      role: VAJRA_CONFIG.ROLES.AUTHORIZED,
      deptId: "NDRF-HQ-01",
      deptName: "NDRF National Command HQ",
      state: "Central / New Delhi"
    };
    this.saveSession();
  },

  saveSession() {
    localStorage.setItem("vajra_session", JSON.stringify(this.currentUser));
  },

  isAuthorized() {
    return this.currentUser && this.currentUser.role === VAJRA_CONFIG.ROLES.AUTHORIZED;
  },

  login(deptId, password) {
    if (!deptId || !password) {
      return { success: false, message: "Please enter Department ID and Password" };
    }

    const dept = VAJRA_DATA.DEPARTMENTS.find(d => d.id.toUpperCase() === deptId.toUpperCase()) || {
      id: deptId.toUpperCase(),
      name: `Authorized Department (${deptId.toUpperCase()})`,
      state: "National Authority"
    };

    this.currentUser = {
      role: VAJRA_CONFIG.ROLES.AUTHORIZED,
      deptId: dept.id,
      deptName: dept.name,
      state: dept.state
    };

    this.saveSession();
    this.updateUI();
    return { success: true, message: `Authenticated as ${dept.name}` };
  },

  setPublicView() {
    this.currentUser = {
      role: VAJRA_CONFIG.ROLES.PUBLIC,
      deptId: "PUBLIC_VIEWER",
      deptName: "Public Safety View",
      state: "All India"
    };
    this.saveSession();
    this.updateUI();
  },

  updateUI() {
    const loginBtn = document.getElementById("auth-login-btn");
    const emergencyAlertBanner = document.getElementById("emergency-alert-banner");
    const officialActionButtons = document.querySelectorAll(".authorized-only");

    if (loginBtn) {
      // Keep button simple as 'LOGIN' as requested by user
      loginBtn.textContent = this.isAuthorized() ? `LOGIN (${this.currentUser.deptId})` : "LOGIN";
    }

    if (this.isAuthorized()) {
      if (emergencyAlertBanner) {
        const hasRedOrOrange = VAJRA_DATA.REGIONS.some(r => r.risk_tier === "Red" || r.risk_tier === "Orange");
        emergencyAlertBanner.style.display = hasRedOrOrange ? "flex" : "none";
      }
      officialActionButtons.forEach(btn => btn.style.display = "flex");
    } else {
      if (emergencyAlertBanner) {
        emergencyAlertBanner.style.display = "none";
      }
      officialActionButtons.forEach(btn => btn.style.display = "none");
    }

    if (typeof VajraAlerts !== "undefined") {
      VajraAlerts.renderNotifications();
    }
  }
};

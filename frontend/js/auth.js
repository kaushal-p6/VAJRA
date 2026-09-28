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
    if (!deptId) {
      return { success: false, message: "Please enter your Official ID or Email" };
    }
    if (!password) {
      return { success: false, message: "Please enter your password" };
    }
    if (password.length < 8) {
      return { success: false, message: "Password must be at least 8 characters" };
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
    sessionStorage.setItem("vajra_entered", "true");
    this.updateUI();

    const loginScreen = document.getElementById("vajra-login-screen");
    if (loginScreen) {
      loginScreen.classList.add("hidden");
    }

    if (typeof VajraMap !== "undefined" && VajraMap.map) {
      setTimeout(() => VajraMap.map.invalidateSize(), 200);
    }

    return { success: true, message: `Authenticated as ${dept.name}` };
  },

  exploreVajra() {
    this.currentUser = {
      role: VAJRA_CONFIG.ROLES.AUTHORIZED,
      deptId: "JUDGE-REVIEW",
      deptName: "Evaluator / Authorized Review",
      state: "Central / New Delhi"
    };
    this.saveSession();
    sessionStorage.setItem("vajra_entered", "true");
    this.updateUI();

    const loginScreen = document.getElementById("vajra-login-screen");
    if (loginScreen) {
      loginScreen.classList.add("hidden");
    }

    if (typeof VajraMap !== "undefined" && VajraMap.map) {
      setTimeout(() => VajraMap.map.invalidateSize(), 200);
    }

    if (typeof VajraUI !== "undefined") {
      VajraUI.showToast("Welcome to VAJRA Flash Flood Prediction System", "success");
    }
  },

  logout() {
    sessionStorage.removeItem("vajra_entered");
    const loginScreen = document.getElementById("vajra-login-screen");
    if (loginScreen) {
      loginScreen.classList.remove("hidden");
    }

    // Reset login form fields and errors
    const idInput = document.getElementById("login-dept-id");
    const passInput = document.getElementById("login-password");
    if (idInput) {
      idInput.value = "";
      idInput.classList.remove("is-invalid");
    }
    if (passInput) {
      passInput.value = "";
      passInput.classList.remove("is-invalid");
    }
    const idError = document.getElementById("login-id-error");
    const passError = document.getElementById("login-password-error");
    if (idError) { idError.textContent = ""; idError.style.display = "none"; }
    if (passError) { passError.textContent = ""; passError.style.display = "none"; }

    if (typeof VajraUI !== "undefined") {
      VajraUI.showToast("Signed out successfully", "info");
    }
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
    const userDeptBadge = document.getElementById("user-dept-badge");
    const userDeptTag = document.getElementById("user-dept-tag");
    const loginBtn = document.getElementById("auth-login-btn");
    const emergencyAlertBanner = document.getElementById("emergency-alert-banner");
    const officialActionButtons = document.querySelectorAll(".authorized-only");

    // Hide department badge if in Judge Review / Explore mode
    if (userDeptBadge) {
      if (this.currentUser && this.currentUser.deptId && this.currentUser.deptId !== "JUDGE-REVIEW") {
        userDeptBadge.style.display = "flex";
        if (userDeptTag) userDeptTag.textContent = this.currentUser.deptId;
      } else {
        userDeptBadge.style.display = "none";
      }
    }

    if (loginBtn) {
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

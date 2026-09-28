/* ==========================================================================
   VAJRA - Emergency Alert Box & Alert History Operations Engine
   ========================================================================== */

const VajraAlerts = {
  activeDispatchRegion: null,
  historyFilterStatus: "ALL",

  init() {
    this.renderNotifications();
    this.updateEmergencyBanner();
    this.renderAlertHistory();
  },

  toggleNotificationDrawer() {
    const dropdown = document.getElementById("notif-dropdown");
    if (dropdown) dropdown.classList.toggle("show");
  },

  renderNotifications() {
    const notifBody = document.getElementById("notif-body-list");
    const notifCountBadge = document.getElementById("notif-count-badge");
    if (!notifBody) return;

    const isAuthorized = VajraAuth.isAuthorized();
    const filteredNotifs = VAJRA_DATA.NOTIFICATIONS.filter(n => {
      if (isAuthorized) return true;
      return n.target === "ALL" || n.type === "highlight";
    });

    const unreadCount = filteredNotifs.filter(n => n.unread).length;
    if (notifCountBadge) {
      notifCountBadge.textContent = unreadCount;
      notifCountBadge.style.display = unreadCount > 0 ? "flex" : "none";
    }

    if (filteredNotifs.length === 0) {
      notifBody.innerHTML = `
        <div style="padding: 1.5rem; text-align: center; color: #64748b; font-size: 0.85rem;">
          No unread notifications
        </div>
      `;
      return;
    }

    notifBody.innerHTML = filteredNotifs.map(n => `
      <div class="notif-item ${n.unread ? 'unread' : ''}" onclick="VajraAlerts.markAsRead('${n.id}')">
        <div class="notif-icon ${n.type}">
          ${n.type === 'alert' ? '<svg class="icon-svg" viewBox="0 0 24 24"><path d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg>' :
            n.type === 'warning' ? '<svg class="icon-svg" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>' :
            '<svg class="icon-svg" viewBox="0 0 24 24"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>'}
        </div>
        <div class="notif-content">
          <div class="notif-title">${n.title}</div>
          <div class="notif-msg">${n.message}</div>
          <div class="notif-time">${n.timestamp}</div>
        </div>
      </div>
    `).join("");
  },

  markAsRead(id) {
    const notif = VAJRA_DATA.NOTIFICATIONS.find(n => n.id === id);
    if (notif) {
      notif.unread = false;
      this.renderNotifications();
    }
  },

  updateEmergencyBanner() {
    const banner = document.getElementById("emergency-alert-banner");
    const bannerText = document.getElementById("alert-banner-text");
    const bannerSubtext = document.getElementById("alert-banner-subtext");

    if (!banner) return;

    if (!VajraAuth.isAuthorized()) {
      banner.style.display = "none";
      return;
    }

    const redRegions = VAJRA_DATA.REGIONS.filter(r => r.risk_tier === "Red");
    if (redRegions.length > 0) {
      const topRed = redRegions[0];
      const env = topRed.environmental_inputs || {};
      const exp = topRed.exposure || {};
      banner.style.display = "flex";
      if (bannerText) {
        bannerText.textContent = `CRITICAL OPERATIONAL ALERT: IMPENDING ${(topRed.hazard_type || 'HAZARD').toUpperCase()} IN ${topRed.village.toUpperCase()} (${topRed.district.toUpperCase()})`;
      }
      if (bannerSubtext) {
        bannerSubtext.textContent = `Risk Score: ${((topRed.risk_score || 0) * 100).toFixed(0)}% | 24h Rain: ${env.rainfall_24h_mm || 0}mm | Exposed Population: ~${exp.population_in_zone || 0} citizens in hazard zone.`;
      }
      this.activeDispatchRegion = topRed;
    } else {
      banner.style.display = "none";
    }
  },

  openEmergencyDispatchModal(region) {
    if (!VajraAuth.isAuthorized()) {
      VajraUI.showToast("Official Login Required to execute emergency workflows", "error");
      VajraUI.openLoginModal();
      return;
    }

    const targetRegion = region || this.activeDispatchRegion || VAJRA_DATA.REGIONS[0];
    this.activeDispatchRegion = targetRegion;
    const env = targetRegion.environmental_inputs || {};
    const exp = targetRegion.exposure || {};

    const setElText = (id, text) => {
      const el = document.getElementById(id);
      if (el) el.textContent = text;
    };

    setElText("dispatch-modal-title", `Confirm Emergency Broadcast: ${targetRegion.village}`);
    setElText("dispatch-modal-region", `${targetRegion.village}, ${targetRegion.district}, ${targetRegion.state}`);
    setElText("dispatch-modal-risk", `${((targetRegion.risk_score || 0) * 100).toFixed(0)}% [${targetRegion.risk_tier || 'Red'}]`);
    setElText("dispatch-modal-rain", `24h: ${env.rainfall_24h_mm || 0}mm | 72h: ${env.rainfall_72h_mm || 0}mm`);
    setElText("dispatch-modal-soil", `${env.soil_moisture_pct || 0}%`);
    setElText("dispatch-modal-slope", `${env.slope_angle_deg || 0}°`);
    setElText("dispatch-modal-pop", `~${exp.population_in_zone || 0} citizens in hazard zone`);
    setElText("dispatch-modal-trend", targetRegion.risk_trend || "Increasing");
    setElText("dispatch-modal-timestamp", env.soil_moisture_source || "Real-time Telemetry");

    VajraUI.showModal("dispatch-modal");
  },

  openCapProtocolDetailsModal() {
    VajraUI.showModal("cap-protocol-modal");
  },

  confirmEmergencyBroadcast() {
    if (!this.activeDispatchRegion) return;

    const r = this.activeDispatchRegion;
    const exp = r.exposure || {};
    this.playAudioAlert();

    const timestamp = `${new Date().toLocaleTimeString('en-GB', { hour12: false })} IST - Today`;

    // 1. Add notification
    const newNotif = {
      id: `notif-${Date.now()}`,
      title: `CAP BROADCAST TRANSMITTED: ${r.village}`,
      message: `ITU X.1303 CAP XML dispatched to C-DOT CBE. Cell broadcast active across ${r.district}. Population exposed: ~${exp.population_in_zone || 0}.`,
      timestamp: timestamp,
      type: "alert",
      target: "ALL",
      unread: true
    };
    VAJRA_DATA.NOTIFICATIONS.unshift(newNotif);
    this.renderNotifications();

    // 2. Log in Alert History Database
    const historyEntry = {
      id: `ALT-${Date.now().toString().slice(-6)}`,
      timestamp: timestamp,
      location: `${r.village}, ${r.district}`,
      district: r.district,
      hazard_type: r.hazard_type,
      risk_score: Math.round((r.risk_score || 0) * 100),
      risk_tier: r.risk_tier,
      status: "Active",
      action_taken: "CAP Broadcast Issued to C-DOT CBE (Cell Broadcast Active)",
      logged_by: VajraAuth.currentUser ? VajraAuth.currentUser.deptId : "NDRF-HQ-01"
    };

    VAJRA_DATA.ALERT_HISTORY.unshift(historyEntry);
    this.renderAlertHistory();

    VajraUI.closeModal("dispatch-modal");
    VajraUI.showToast(`CAP Alert Issued for ${r.village} (~${exp.population_in_zone || 0} citizens exposed)`, "success");
  },

  /* ==========================================================================
     ALERT HISTORY LOGS RENDERER
     ========================================================================== */
  renderAlertHistory() {
    const historyTableBody = document.getElementById("alert-history-table-body");
    if (!historyTableBody) return;

    let entries = [...VAJRA_DATA.ALERT_HISTORY];
    if (this.historyFilterStatus !== "ALL") {
      entries = entries.filter(e => e.status === this.historyFilterStatus);
    }

    if (entries.length === 0) {
      historyTableBody.innerHTML = `
        <tr>
          <td colspan="7" style="text-align: center; padding: 1.5rem; color: #64748b;">
            No alert logs matching filter
          </td>
        </tr>
      `;
      return;
    }

    historyTableBody.innerHTML = entries.map(e => `
      <tr>
        <td><strong>${e.timestamp}</strong></td>
        <td><strong>${e.location}</strong></td>
        <td>${e.hazard_type}</td>
        <td>
          <span class="risk-badge ${(e.risk_tier || 'green').toLowerCase()}">${e.risk_tier} (${e.risk_score}%)</span>
        </td>
        <td>
          <span style="padding: 2px 8px; border-radius: 4px; font-weight: 700; font-size: 0.72rem; ${e.status === 'Active' ? 'background: #fef2f2; color: #dc2626; border: 1px solid #fca5a5;' : 'background: #f0fdf4; color: #166534; border: 1px solid #86efac;'}">
            ${e.status}
          </span>
        </td>
        <td style="font-size: 0.78rem; color: #475569;">${e.action_taken}</td>
        <td><strong style="color: #1e3a8a;">${e.logged_by}</strong></td>
      </tr>
    `).join("");
  },

  setHistoryFilter(status) {
    this.historyFilterStatus = status;
    this.renderAlertHistory();
  },

  playAudioAlert() {
    try {
      const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();

      osc.type = "sawtooth";
      osc.frequency.setValueAtTime(880, audioCtx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(440, audioCtx.currentTime + 0.5);

      gain.gain.setValueAtTime(0.3, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.5);

      osc.connect(gain);
      gain.connect(audioCtx.destination);

      osc.start();
      osc.stop(audioCtx.currentTime + 0.5);
    } catch (e) {
      console.log("Audio alert error:", e);
    }
  }
};

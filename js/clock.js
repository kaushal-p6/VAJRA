/* ==========================================================================
   VAJRA - Independent Real-Time IST GMT+5:30 24-Hour Monotonic Clock Engine
   Ticks forward using performance.now() so it can't be nudged by someone
   changing the OS clock mid-session, and re-syncs against a true external
   time source whenever one is reachable.
   ========================================================================== */

const IST_OFFSET_MS = (5 * 60 + 30) * 60 * 1000; // +05:30, fixed (India has no DST)
const NTP_RESYNC_INTERVAL_MS = 15 * 60 * 1000;    // re-sync every 15 min to correct drift

const VajraClock = {
  baseServerTimeMs: null,
  basePerfNowMs: null,
  timer: null,
  resyncTimer: null,
  isSynced: false, // true once a real external time source has confirmed the clock

  init() {
    // BUGFIX: this used to anchor on a hardcoded past timestamp
    // ("2026-09-27T20:48:59+05:30") and only became accurate if an NTP
    // fetch succeeded. If both external time APIs were unreachable —
    // very plausible, since worldtimeapi.org has a history of extended
    // outages, and browsers block both fetches entirely when the page is
    // opened via file:// as the README's "Method 2" describes — the
    // clock would silently freeze at that one fixed moment and just tick
    // forward from there forever, drifting further from reality every
    // time the page was reloaded.
    //
    // Fix: default to the viewer's own system clock (Date.now()) as the
    // baseline. It's virtually always correct and, unlike a fixed past
    // anchor, is automatically right regardless of what day the page is
    // opened on. The NTP fetch below then tries to confirm/override it
    // with a verified external source, purely as a safeguard against a
    // deliberately-wrong local clock — it's an enhancement, not the only
    // path to a correct time.
    this.baseServerTimeMs = Date.now();
    this.basePerfNowMs = performance.now();

    this.syncRealTimeNTP();

    this.updateClock();
    this.timer = setInterval(() => this.updateClock(), 1000);

    // Periodically re-sync so long-running sessions (this is meant to run
    // 24x7) don't slowly drift from real time due to setInterval jitter.
    this.resyncTimer = setInterval(() => this.syncRealTimeNTP(), NTP_RESYNC_INTERVAL_MS);
  },

  async syncRealTimeNTP() {
    // Provider 1 (worldtimeapi.org): returns `unixtime` as a plain UTC
    // epoch-seconds integer. Use that directly — no string parsing at
    // all, so there's nothing for a browser's date parser to get wrong.
    try {
      const res = await fetch("https://worldtimeapi.org/api/timezone/Asia/Kolkata", { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        if (data && typeof data.unixtime === "number") {
          this.baseServerTimeMs = data.unixtime * 1000;
          this.basePerfNowMs = performance.now();
          this.isSynced = true;
          this.updateSyncIndicator();
          return;
        }
      }
    } catch (e) {
      // fall through to the secondary provider below
    }

    // Provider 2 (timeapi.io): returns explicit numeric year/month/day/
    // hour/minute/second fields for the requested zone. Build the
    // timestamp from those numeric fields directly rather than parsing
    // its `dateTime` string — avoids relying on any particular browser's
    // handling of a provider-specific ISO variant (e.g. non-standard
    // fractional-second lengths, which some engines mis-parse).
    try {
      const res2 = await fetch("https://timeapi.io/api/time/current/zone?timeZone=Asia/Kolkata", { cache: "no-store" });
      if (res2.ok) {
        const d = await res2.json();
        if (d && typeof d.year === "number") {
          // These fields are already the IST wall-clock reading, so build
          // it as if it were UTC, then subtract the IST offset to recover
          // the true UTC epoch.
          const istWallClockAsUtcMs = Date.UTC(d.year, d.month - 1, d.day, d.hour, d.minute, d.seconds || 0);
          this.baseServerTimeMs = istWallClockAsUtcMs - IST_OFFSET_MS;
          this.basePerfNowMs = performance.now();
          this.isSynced = true;
          this.updateSyncIndicator();
          return;
        }
      }
    } catch (err) {
      // Both providers unreachable (offline, blocked CORS, file:// preview,
      // firewalled network, etc.) — keep ticking forward from the
      // viewer's own system clock set in init() instead of failing silently.
      this.isSynced = false;
      this.updateSyncIndicator();
    }
  },

  updateSyncIndicator() {
    const box = document.getElementById("ist-clock-box");
    if (!box) return;
    box.title = this.isSynced
      ? "Real-Time Indian Standard Time (verified against external time server)"
      : "Real-Time Indian Standard Time (using local device clock — external time server unreachable)";
  },

  updateClock() {
    const clockElement = document.getElementById("ist-clock-time");
    if (!clockElement) return;

    // Calculate elapsed time using monotonic performance.now() (unaffected by local system clock changes)
    const elapsedMs = performance.now() - this.basePerfNowMs;
    const currentCalculatedTimeMs = this.baseServerTimeMs + elapsedMs;

    // Compute IST wall-clock time directly from the UTC epoch using the
    // fixed +05:30 offset and UTC getters — this is what actually makes
    // the displayed time IST regardless of the viewer's own local
    // timezone setting (getHours()/getMinutes()/getSeconds() would read
    // back the browser's LOCAL timezone instead, which was the original
    // bug here).
    const istDate = new Date(currentCalculatedTimeMs + IST_OFFSET_MS);

    // Format 24-hour IST time HH:MM:SS
    const hours = String(istDate.getUTCHours()).padStart(2, '0');
    const minutes = String(istDate.getUTCMinutes()).padStart(2, '0');
    const seconds = String(istDate.getUTCSeconds()).padStart(2, '0');

    clockElement.textContent = `${hours}:${minutes}:${seconds} IST`;
  }
};

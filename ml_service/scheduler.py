"""
VAJRA ML Service — Scheduler
=============================
Implements Part A, Section 3, item 1 of VAJRA_DevTeam_Report_and_Handoff.md:

    "A scheduler (cron job, Celery beat, or similar) that calls the ML
    batch-prediction function every 30 minutes."

This is deliberately a plain loop, not Celery — for a single-node
deployment (which this looks like, given server.py is a simple
http.server on localhost) a full task queue is more infrastructure than
the problem needs. Swap this for Celery beat / APScheduler / a real cron
job calling `python predict_batch.py` once you're running on more than
one machine or need retries/monitoring beyond what's here.

Run with:
    python scheduler.py
(leave it running in a terminal, tmux/screen session, or as a systemd
service — it loops forever until killed)
"""

import time
import traceback
from datetime import datetime, timezone

from predict_batch import load_static_artifacts, run_batch_cycle, write_cache_atomic

CYCLE_INTERVAL_SECONDS = 30 * 60  # 30 minutes, per the report's requirement


def main():
    print(f"[{datetime.now(timezone.utc).isoformat()}] Loading static artifacts (once, at startup)...")
    artifacts = load_static_artifacts()
    print("Artifacts loaded. Starting scheduler loop (Ctrl+C to stop).")

    while True:
        cycle_start = time.monotonic()
        now_str = datetime.now(timezone.utc).isoformat()
        try:
            print(f"[{now_str}] Starting batch cycle...")
            payload = run_batch_cycle(artifacts)
            write_cache_atomic(payload)

            n_flood_errors = sum(1 for a in payload["flood_alerts"] if "error" in a)
            n_slide_errors = sum(1 for a in payload["landslide_alerts"] if "error" in a)
            print(
                f"[{now_str}] Cycle complete in {payload['cycle_duration_seconds']}s — "
                f"{len(payload['flood_alerts'])} flood alerts ({n_flood_errors} errors), "
                f"{len(payload['landslide_alerts'])} landslide alerts ({n_slide_errors} errors)"
            )
        except Exception:
            # A single bad cycle should never kill the scheduler — the API
            # will just keep serving the last good cache until the next
            # successful cycle. Log loudly so it's not silently missed.
            print(f"[{now_str}] BATCH CYCLE FAILED:")
            print(traceback.format_exc())

        elapsed = time.monotonic() - cycle_start
        sleep_for = max(0, CYCLE_INTERVAL_SECONDS - elapsed)
        time.sleep(sleep_for)


if __name__ == "__main__":
    main()

"""
scheduler.py — EditorWatch

Background staleness monitor.

Since T&F blocks automated scraping, the scheduler's job is NOT to
auto-refresh data — it CAN'T. Its actual jobs are:

  1. Daily: check for journals older than 180 days (T&F's own update cadence)
     and log a clear warning so the operator knows to manually re-seed them.
  2. Weekly: log a full cache health report.

When stale journals are detected, the app surfaces them via:
  - GET /journals/cache-status  (human-readable in the API)
  - Server logs (operator alert)
  - Frontend can show a "data may be outdated" badge on affected journals

Re-seeding process:
  1. Operator sees stale warning in logs or /journals/cache-status
  2. Visits T&F page for that journal in a browser
  3. Copies the 3 timing metrics + acceptance rate
  4. POSTs to /journals/{slug}/update  OR edits journals_cache.json directly
  5. App picks up the new values immediately (no restart needed)
"""

import logging
from datetime import datetime

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger

from services.scraper import get_stale_journals, list_cached_journals

logger    = logging.getLogger(__name__)
scheduler = AsyncIOScheduler()

STALE_DAYS = 180   # T&F updates metrics every 6 months


# ---------------------------------------------------------------------------
# Jobs
# ---------------------------------------------------------------------------

async def daily_staleness_check() -> None:
    """
    Check for journals older than 180 days and log clear warnings.
    This is an operator alert, not an auto-fix.
    """
    stale = get_stale_journals(stale_days=STALE_DAYS)

    if not stale:
        logger.info("[scheduler] Daily check: all journal data is within the 6-month freshness window.")
        return

    logger.warning(
        f"[scheduler] Daily check: {len(stale)} journal(s) need manual re-seeding "
        f"(data older than {STALE_DAYS} days / T&F's 6-month update cycle):"
    )
    for entry in stale:
        slug = entry.get("slug", "?")
        name = entry.get("name", slug)
        reason = entry.get("reason", "stale")
        logger.warning(
            f"  - {name} ({slug}): {reason}  |  "
            f"Seed URL: https://www.tandfonline.com/journals/{slug}/about-this-journal"
        )
    logger.warning(
        "[scheduler] To update: visit each URL above → Journal metrics tab → "
        "POST numbers to /journals/{slug}/update"
    )


async def weekly_cache_report() -> None:
    """Log a full cache health summary every week."""
    all_journals = list_cached_journals()
    stale        = get_stale_journals(stale_days=STALE_DAYS)
    needs_seed   = [j for j in all_journals if j.get("needs_manual_seed")]

    logger.info(
        f"[scheduler] Weekly cache report: "
        f"{len(all_journals)} total journals | "
        f"{len(all_journals) - len(stale) - len(needs_seed)} fresh | "
        f"{len(stale)} stale (>{STALE_DAYS} days) | "
        f"{len(needs_seed)} never seeded"
    )


# ---------------------------------------------------------------------------
# Lifecycle
# ---------------------------------------------------------------------------

def start_scheduler() -> None:
    # Daily staleness check at 09:00 — during working hours so operator sees it
    scheduler.add_job(
        daily_staleness_check,
        trigger          = CronTrigger(hour=9, minute=0),
        id               = "daily_staleness_check",
        name             = "Daily journal data staleness check",
        replace_existing = True,
        misfire_grace_time = 3600,
    )

    # Weekly full report — Monday 09:00
    scheduler.add_job(
        weekly_cache_report,
        trigger          = CronTrigger(day_of_week="mon", hour=9, minute=0),
        id               = "weekly_cache_report",
        name             = "Weekly cache health report",
        replace_existing = True,
        misfire_grace_time = 3600,
    )

    scheduler.start()
    logger.info("[scheduler] started — daily staleness check 09:00, weekly report Monday 09:00")


def stop_scheduler() -> None:
    if scheduler.running:
        scheduler.shutdown(wait=False)
        logger.info("[scheduler] stopped")


def get_scheduler_status() -> dict:
    if not scheduler.running:
        return {"running": False, "jobs": []}
    jobs = []
    for job in scheduler.get_jobs():
        jobs.append({
            "id":       job.id,
            "name":     job.name,
            "next_run": job.next_run_time.isoformat() if job.next_run_time else None,
        })
    return {"running": True, "jobs": jobs}
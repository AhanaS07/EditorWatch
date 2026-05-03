"""
scraper.py — EditorWatch

Data sourcing strategy (honest version):

T&F metrics pages are protected by Cloudflare and return 403 to all
non-browser HTTP clients. Headless browser scraping (Playwright/Puppeteer)
would work but is out of scope for this hackathon.

ACTUAL data flow:
  1. journals_cache.json  — manually seeded from T&F public pages
                             (open in browser, copy numbers, paste here)
  2. Crossref API         — free, no auth, gives journal metadata + some stats
  3. Manual admin update  — POST /journals/{slug}/update with real numbers
                             (editor visits T&F page, pastes into app)

The scheduler exists to flag stale entries and prompt a human refresh,
NOT to scrape T&F automatically. This is honest and actually works.

How to seed a new journal:
  1. Visit: https://www.tandfonline.com/journals/{slug}/about-this-journal
  2. Click the "Journal metrics" tab (or scroll to it)
  3. Note down:
       - "From submission to first decision: X days"
       - "From submission to first post-review decision: X days"
       - "Acceptance rate: X%"
  4. POST /journals/{slug}/update  OR  edit journals_cache.json directly
"""

import re
import json
import logging
from pathlib import Path
from datetime import datetime, date, timedelta
from typing import Optional

import httpx

logger = logging.getLogger(__name__)

CACHE_PATH = Path(__file__).parent.parent / "data" / "journals_cache.json"

# ---------------------------------------------------------------------------
# Cache I/O
# ---------------------------------------------------------------------------

def _load_file_cache() -> dict:
    if CACHE_PATH.exists():
        try:
            return json.loads(CACHE_PATH.read_text())
        except Exception:
            return {}
    return {}


def _save_file_cache(data: dict) -> None:
    try:
        CACHE_PATH.write_text(json.dumps(data, indent=2))
    except Exception as e:
        logger.warning(f"[scraper] Could not write cache: {e}")


# In-memory TTL cache — avoids repeated file reads during a single session
_memory_cache: dict[str, tuple[dict, datetime]] = {}
TTL_HOURS = 6


def _from_memory(slug: str) -> Optional[dict]:
    entry = _memory_cache.get(slug)
    if entry:
        data, expires = entry
        if datetime.utcnow() < expires:
            return data
        del _memory_cache[slug]
    return None


def _to_memory(slug: str, data: dict) -> None:
    _memory_cache[slug] = (data, datetime.utcnow() + timedelta(hours=TTL_HOURS))


# ---------------------------------------------------------------------------
# Crossref — free public API, no auth, no blocking
# Returns journal metadata but NOT T&F speed metrics.
# Used for journal search and to confirm a slug maps to a real journal.
# ---------------------------------------------------------------------------

async def fetch_crossref_metadata(slug: str, journal_name: str = "") -> Optional[dict]:
    """
    Query Crossref for basic journal info.
    Crossref doesn't have T&F's speed metrics, but confirms journal existence
    and can provide ISSN, subject area, and publisher confirmation.
    """
    query = journal_name or slug
    try:
        async with httpx.AsyncClient(timeout=8) as client:
            resp = await client.get(
                "https://api.crossref.org/journals",
                params={
                    "query":  query,
                    "filter": "publisher-name:Taylor",
                    "rows":   5,
                },
                headers={"User-Agent": "EditorWatch/1.0 (mailto:editorwatch@example.com)"},
            )
            resp.raise_for_status()
            items = resp.json().get("message", {}).get("items", [])

        for item in items:
            pub = item.get("publisher", "").lower()
            if "taylor" in pub or "francis" in pub:
                return {
                    "crossref_title": item.get("title", ""),
                    "issn":           item.get("ISSN", []),
                    "publisher":      item.get("publisher", ""),
                    "subjects":       [s.get("name") for s in item.get("subjects", [])],
                    "crossref_url":   item.get("URL", ""),
                }
    except Exception as e:
        logger.warning(f"[crossref] lookup failed for {slug}: {e}")
    return None


# ---------------------------------------------------------------------------
# Public API — cache-first, no live T&F scraping
# ---------------------------------------------------------------------------

async def get_journal_metrics(slug: str) -> Optional[dict]:
    """
    Returns metrics for a journal slug.
    Source is always the manually-seeded file cache (or memory cache of it).
    Falls back to Crossref for basic metadata if slug not in cache.
    """
    slug = slug.strip().lower()

    # Memory cache
    cached = _from_memory(slug)
    if cached:
        return cached

    # File cache
    fc = _load_file_cache()
    if slug in fc:
        data = fc[slug]
        _to_memory(slug, data)
        return data

    # Not in cache — try Crossref for basic confirmation at least
    logger.info(f"[scraper] {slug} not in cache — checking Crossref")
    crossref = await fetch_crossref_metadata(slug)
    if crossref:
        # Return a skeleton entry flagged as needing manual seeding
        return {
            "slug":                          slug,
            "name":                          crossref.get("crossref_title", slug),
            "avg_first_decision_days":       None,
            "avg_post_review_decision_days": None,
            "avg_review_days":               None,
            "avg_acceptance_to_pub_days":    None,
            "acceptance_rate":               None,
            "rejection_rate":                None,
            "source":                        "crossref_only",
            "needs_manual_seed":             True,
            "seed_url":                      f"https://www.tandfonline.com/journals/{slug}/about-this-journal",
            "last_updated":                  None,
        }

    return None


# Alias used by existing routers — same behaviour
async def scrape_journal_metrics(slug: str) -> Optional[dict]:
    return await get_journal_metrics(slug)


# ---------------------------------------------------------------------------
# Manual seed / update — the primary write path
# ---------------------------------------------------------------------------

def upsert_journal_metrics(slug: str, data: dict) -> dict:
    """
    Write or update journal metrics in the file cache.
    Called by:
      - POST /journals/{slug}/update  (admin manually enters T&F numbers)
      - The seeding script (seed_journals.py)
    Always stamps last_updated = today and source = "manual".
    """
    slug = slug.strip().lower()
    fc   = _load_file_cache()

    existing = fc.get(slug, {})
    updated  = {
        **existing,
        **data,
        "slug":         slug,
        "source":       "manual",
        "last_updated": date.today().isoformat(),
    }

    fc[slug] = updated
    _save_file_cache(fc)
    _to_memory(slug, updated)
    logger.info(f"[scraper] upserted manual metrics for {slug}")
    return updated


# ---------------------------------------------------------------------------
# Staleness helpers (used by scheduler + journals router)
# ---------------------------------------------------------------------------

def list_cached_journals() -> list[dict]:
    return list(_load_file_cache().values())


def cache_entry_age_days(slug: str) -> Optional[int]:
    fc    = _load_file_cache()
    entry = fc.get(slug)
    if not entry or not entry.get("last_updated"):
        return None
    try:
        return (date.today() - date.fromisoformat(entry["last_updated"])).days
    except ValueError:
        return None


def get_stale_journals(stale_days: int = 180) -> list[dict]:
    """
    Return journals whose data is older than stale_days.
    Default 180 days = 6 months, matching T&F's own update cadence.
    These should be flagged for manual re-seeding.
    """
    fc     = _load_file_cache()
    today  = date.today()
    cutoff = today - timedelta(days=stale_days)
    stale  = []

    for slug, entry in fc.items():
        last_updated = entry.get("last_updated")
        needs_seed   = entry.get("needs_manual_seed", False)

        if needs_seed or not last_updated:
            stale.append({**entry, "reason": "never seeded"})
            continue
        try:
            if date.fromisoformat(last_updated) < cutoff:
                age = (today - date.fromisoformat(last_updated)).days
                stale.append({**entry, "reason": f"{age} days old (>{stale_days} day threshold)"})
        except ValueError:
            stale.append({**entry, "reason": "invalid date"})

    return stale


def get_scrape_status() -> dict:
    """Summary of data source health — exposed via /health."""
    fc            = _load_file_cache()
    total         = len(fc)
    seeded        = sum(1 for e in fc.values() if not e.get("needs_manual_seed"))
    needs_seed    = total - seeded
    stale_6mo     = len(get_stale_journals(stale_days=180))

    return {
        "live_scraping_available": False,
        "live_scraping_note":      "T&F blocks automated scraping. Data is manually seeded from public T&F pages.",
        "total_journals_cached":   total,
        "fully_seeded":            seeded,
        "needs_manual_seed":       needs_seed,
        "stale_over_6_months":     stale_6mo,
        "seed_instructions":       "Visit /journals/cache-status to see which journals need updating.",
    }
"""
journals.py — EditorWatch

Journal data endpoints:
  GET  /journals                   — list all cached journals
  GET  /journals/cache-status      — freshness report + seeding instructions
  GET  /journals/search            — Crossref search by journal name
  POST /journals/{slug}/update     — manually seed/update metrics for one journal
  GET  /journals/{slug}            — get single journal metrics
"""

import httpx
from fastapi import APIRouter, Query, HTTPException
from pydantic import BaseModel
from typing import Optional
from datetime import date

from models.schemas import JournalMetrics
from services.scraper import (
    list_cached_journals,
    get_journal_metrics,
    upsert_journal_metrics,
    get_stale_journals,
    get_scrape_status,
    _load_file_cache,
)
from services.scheduler import get_scheduler_status

router = APIRouter(prefix="/journals", tags=["journals"])


# ---------------------------------------------------------------------------
# Input model for manual metric seeding
# ---------------------------------------------------------------------------

class JournalUpdateRequest(BaseModel):
    name:                            str
    avg_first_decision_days:         int
    avg_post_review_decision_days:   int
    avg_acceptance_to_pub_days:      Optional[int] = None
    acceptance_rate:                 Optional[float] = None   # 0.0–1.0
    notes:                           Optional[str]  = None    # e.g. "seeded from T&F page 2025-05-02"


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.get("", response_model=list[JournalMetrics])
async def list_journals():
    """Return all journals in the cache."""
    return [JournalMetrics(**j) for j in list_cached_journals()
            if not j.get("needs_manual_seed")]


@router.get("/cache-status")
async def cache_status():
    """
    Full freshness report.
    Shows which journals are fresh, stale, or never seeded.
    Includes instructions for re-seeding stale entries.
    """
    fc    = _load_file_cache()
    today = date.today()

    entries = []
    for slug, entry in fc.items():
        last_updated  = entry.get("last_updated")
        age_days      = None
        freshness     = "unknown"

        if entry.get("needs_manual_seed"):
            freshness = "never_seeded"
        elif last_updated:
            try:
                entry_date = date.fromisoformat(last_updated)
                age_days   = (today - entry_date).days
                if age_days <= 30:
                    freshness = "fresh"
                elif age_days <= 180:
                    freshness = "ok"
                else:
                    freshness = "stale"
            except ValueError:
                freshness = "invalid_date"

        entries.append({
            "slug":         slug,
            "name":         entry.get("name", slug),
            "last_updated": last_updated,
            "age_days":     age_days,
            "freshness":    freshness,
            "source":       entry.get("source", "unknown"),
            "seed_url":     f"https://www.tandfonline.com/journals/{slug}/about-this-journal",
            "update_endpoint": f"POST /journals/{slug}/update",
        })

    stale = [e for e in entries if e["freshness"] in ("stale", "never_seeded")]

    return {
        "summary": {
            "total":        len(entries),
            "fresh":        sum(1 for e in entries if e["freshness"] == "fresh"),
            "ok":           sum(1 for e in entries if e["freshness"] == "ok"),
            "stale":        sum(1 for e in entries if e["freshness"] == "stale"),
            "never_seeded": sum(1 for e in entries if e["freshness"] == "never_seeded"),
        },
        "data_source":  get_scrape_status(),
        "scheduler":    get_scheduler_status(),
        "action_needed": [
            {
                "slug":     e["slug"],
                "name":     e["name"],
                "reason":   e["freshness"],
                "seed_url": e["seed_url"],
                "how_to_update": (
                    f"1. Open {e['seed_url']} in your browser\n"
                    f"2. Click 'Journal metrics' tab\n"
                    f"3. Copy the 3 timing metrics + acceptance rate\n"
                    f"4. POST to {e['update_endpoint']}"
                ),
            }
            for e in stale
        ],
        "all_entries": sorted(entries, key=lambda x: x["age_days"] or 9999, reverse=True),
    }


@router.get("/search")
async def search_journals(q: str = Query(..., min_length=2)):
    """Search Crossref for T&F journals by name to find the slug."""
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(
                "https://api.crossref.org/journals",
                params={
                    "query": q,
                    "rows":  20,   # fetch more since we post-filter for T&F
                },
                headers={"User-Agent": "EditorWatch/1.0 (mailto:editorwatch@example.com)"},
            )
            resp.raise_for_status()
            items = resp.json().get("message", {}).get("items", [])

        results = []
        for item in items:
            pub = item.get("publisher", "")
            # T&F is registered as "Taylor & Francis", "Taylor & Francis Ltd",
            # or "Informa UK Limited" (parent company) in Crossref
            is_tf = (
                "taylor" in pub.lower()
                or "francis" in pub.lower()
                or "informa" in pub.lower()
                or "tandfonline" in pub.lower()
            )
            if not is_tf:
                continue
            results.append({
                "title":        item.get("title", ""),
                "issn":         item.get("ISSN", []),
                "publisher":    pub,
                "crossref_url": item.get("URL", ""),
                "next_step": (
                    "Find this journal on https://www.tandfonline.com — "
                    "the slug is the code at the end of the URL, e.g. 'ipmt20'"
                ),
            })

        return {"query": q, "results": results, "count": len(results)}

    except Exception as e:
        return {"query": q, "results": [], "count": 0,
                "error": f"Crossref search failed: {e}"}


@router.get("/{slug}", response_model=JournalMetrics)
async def get_journal(slug: str):
    """Get metrics for a single journal. Returns 404 if not in cache."""
    data = await get_journal_metrics(slug)
    if not data:
        raise HTTPException(
            404,
            f"Journal '{slug}' not found. "
            f"Seed it via POST /journals/{slug}/update with data from "
            f"https://www.tandfonline.com/journals/{slug}/about-this-journal"
        )
    if data.get("needs_manual_seed"):
        raise HTTPException(
            422,
            {
                "error":    "Journal found in Crossref but not yet seeded with T&F metrics.",
                "slug":     slug,
                "name":     data.get("name"),
                "seed_url": data.get("seed_url"),
                "action":   f"POST /journals/{slug}/update with the metrics from the seed URL above.",
            }
        )
    return JournalMetrics(**data)


@router.post("/{slug}/update", response_model=JournalMetrics)
async def update_journal_metrics(slug: str, req: JournalUpdateRequest):
    """
    Manually seed or update metrics for a journal.

    How to get the numbers:
      1. Open https://www.tandfonline.com/journals/{slug}/about-this-journal
      2. Click the 'Journal metrics' tab
      3. Read off:
           - 'From submission to first decision: X days'
           - 'From submission to first post-review decision: X days'
           - 'Acceptance rate: X%'  (enter as decimal, e.g. 0.23 for 23%)

    This is the primary way to keep the cache accurate and up-to-date.
    """
    slug = slug.strip().lower()

    payload = {
        "slug":                          slug,
        "name":                          req.name,
        "avg_first_decision_days":       req.avg_first_decision_days,
        "avg_post_review_decision_days": req.avg_post_review_decision_days,
        "avg_review_days":               req.avg_post_review_decision_days,
        "avg_acceptance_to_pub_days":    req.avg_acceptance_to_pub_days,
        "acceptance_rate":               req.acceptance_rate,
        "rejection_rate":                round(1 - req.acceptance_rate, 3) if req.acceptance_rate else None,
        "notes":                         req.notes,
        "needs_manual_seed":             False,
    }

    updated = upsert_journal_metrics(slug, payload)
    return JournalMetrics(**updated)
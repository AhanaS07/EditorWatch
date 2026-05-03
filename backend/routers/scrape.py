"""
scrape.py
This endpoint now returns cached journal data, not a live scrape (T&F blocks automated scraping).
Kept at /scrape/{slug} for API backwards compatibility.
"""

from fastapi import APIRouter, HTTPException
from models.schemas import JournalMetrics
from services.scraper import get_journal_metrics

router = APIRouter(prefix="/scrape", tags=["scrape"])


@router.get("/{journal_slug}", response_model=JournalMetrics)
async def get_journal_data(journal_slug: str):
    """
    Returns cached metrics for a journal slug.
    Source is the manually-seeded journals_cache.json.
    For unseeded journals, returns a 422 with seeding instructions.
    For unknown slugs, returns 404.
    """
    data = await get_journal_metrics(journal_slug.strip().lower())
    if not data:
        raise HTTPException(
            404,
            f"Journal '{journal_slug}' not found. "
            f"Visit https://www.tandfonline.com/journals/{journal_slug}/about-this-journal "
            f"and seed it via POST /journals/{journal_slug}/update"
        )
    if data.get("needs_manual_seed"):
        raise HTTPException(
            422,
            {
                "error":    f"Journal '{journal_slug}' is registered but not yet seeded with metrics.",
                "seed_url": data.get("seed_url"),
                "action":   f"POST /journals/{journal_slug}/update with metrics from the seed URL.",
            }
        )
    return JournalMetrics(**data)
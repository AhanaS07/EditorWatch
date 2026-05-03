"""
predict.py
One-shot endpoint — author can get a prediction without creating a stored record.
Useful for quick checks / the landing page demo flow.
"""

from fastapi import APIRouter, HTTPException
from datetime import date

from models.schemas import PredictRequest, PredictResponse
from services.scraper import scrape_journal_metrics
from services.predictor import build_prediction

router = APIRouter(prefix="/predict", tags=["predict"])


@router.post("", response_model=PredictResponse)
async def predict(req: PredictRequest):
    """
    Given journal + submission date + current status → return prediction.
    No record is stored; purely stateless.
    """
    metrics = await scrape_journal_metrics(req.journal_slug)
    if not metrics:
        raise HTTPException(
            404,
            f"No journal data found for slug '{req.journal_slug}'. "
            "Try one of the slugs from GET /journals, or check the journal URL on tandfonline.com."
        )

    # For one-shot predict, status_date == submission_date (we don't know when they entered this status)
    # This is a known limitation; the /submissions flow handles this properly.
    pred = build_prediction(
        submission_date = req.submission_date,
        current_status  = req.current_status,
        status_date     = req.submission_date,
        metrics         = metrics,
        timeline        = [],
    )

    return PredictResponse(**pred)
"""
submissions.py — primary CRUD + status update for tracked submissions.
"""

from fastapi import APIRouter, HTTPException

from models.schemas import (
    CreateSubmissionRequest, UpdateSubmissionRequest,
    SubmissionRecord, SubmissionPredictResponse,
)
from services.submission_store import (
    create_submission, get_submission, list_submissions,
    update_submission_status, delete_submission,
    current_status as get_current_status,
    submission_date as get_submission_date,
)
from services.scraper import get_journal_metrics
from services.predictor import build_prediction

router = APIRouter(prefix="/submissions", tags=["submissions"])


async def _enrich(record: SubmissionRecord) -> SubmissionPredictResponse:
    metrics = await get_journal_metrics(record.journal_slug)
    if not metrics:
        raise HTTPException(404, f"No metrics for journal '{record.journal_slug}'. Seed it via POST /journals/{record.journal_slug}/update")
    if metrics.get("needs_manual_seed"):
        raise HTTPException(422, f"Journal '{record.journal_slug}' not yet seeded with metrics. Visit {metrics.get('seed_url')} and POST to /journals/{record.journal_slug}/update")

    latest = get_current_status(record)
    sub_dt = get_submission_date(record)
    pred   = build_prediction(
        submission_date = sub_dt,
        current_status  = latest.status,
        status_date     = latest.date,
        metrics         = metrics,
        timeline        = record.timeline,
    )
    return SubmissionPredictResponse(**pred, submission=record)


@router.post("", response_model=SubmissionPredictResponse, status_code=201)
async def create(req: CreateSubmissionRequest):
    record = create_submission(req)
    return await _enrich(record)


@router.get("", response_model=list[SubmissionRecord])
async def list_all():
    return list_submissions()


@router.get("/{submission_id}", response_model=SubmissionPredictResponse)
async def get_one(submission_id: str):
    record = get_submission(submission_id)
    if not record:
        raise HTTPException(404, f"Submission '{submission_id}' not found.")
    return await _enrich(record)


@router.patch("/{submission_id}/status", response_model=SubmissionPredictResponse)
async def update_status(submission_id: str, req: UpdateSubmissionRequest):
    record = update_submission_status(submission_id, req)
    if not record:
        raise HTTPException(404, f"Submission '{submission_id}' not found.")
    return await _enrich(record)


@router.delete("/{submission_id}", status_code=204)
async def delete(submission_id: str):
    if not delete_submission(submission_id):
        raise HTTPException(404, f"Submission '{submission_id}' not found.")
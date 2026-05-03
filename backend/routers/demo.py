"""
demo.py — preloaded mock cases with full predictions.
"""

import json
from pathlib import Path
from fastapi import APIRouter, HTTPException

from models.schemas import EMStatus
from services.scraper import get_journal_metrics
from services.predictor import build_prediction

router = APIRouter(prefix="/demo", tags=["demo"])
DATA   = Path(__file__).parent.parent / "data" / "demo_cases.json"


@router.get("", response_model=list[dict])
async def get_demo_cases():
    cases   = json.loads(DATA.read_text())
    results = []

    for case in cases:
        metrics = await get_journal_metrics(case["journal_slug"])
        if not metrics or metrics.get("needs_manual_seed"):
            results.append({**case, "prediction": None,
                             "prediction_note": "Metrics not yet seeded for this journal."})
            continue

        pred = build_prediction(
            submission_date = case["submission_date"],
            current_status  = EMStatus(case["current_status"]),
            status_date     = case["submission_date"],
            metrics         = metrics,
            timeline        = [],
        )
        results.append({
            "id":              case["id"],
            "label":           case["label"],
            "journal_name":    case["journal_name"],
            "submission_date": case["submission_date"],
            "current_status":  case["current_status"],
            "notes":           case.get("notes"),
            "expected_risk":   case["expected_risk"],
            "prediction":      pred,
        })

    return results


@router.get("/{case_id}")
async def get_demo_case(case_id: str):
    cases = json.loads(DATA.read_text())
    case  = next((c for c in cases if c["id"] == case_id), None)
    if not case:
        raise HTTPException(404, f"Demo case '{case_id}' not found.")

    metrics = await get_journal_metrics(case["journal_slug"])
    if not metrics or metrics.get("needs_manual_seed"):
        raise HTTPException(
            422,
            f"Metrics for '{case['journal_slug']}' not yet seeded. "
            f"Seed via POST /journals/{case['journal_slug']}/update"
        )

    pred = build_prediction(
        submission_date = case["submission_date"],
        current_status  = EMStatus(case["current_status"]),
        status_date     = case["submission_date"],
        metrics         = metrics,
        timeline        = [],
    )
    return {**case, "prediction": pred}
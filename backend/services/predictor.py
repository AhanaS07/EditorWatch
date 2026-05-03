"""
predictor.py — EditorWatch

Delay, risk, progress and timeline calculation engine.

Data model alignment with real T&F metrics (confirmed from tandfonline.com):
  - T&F publishes TWO timing metrics per journal:
      avg_first_decision_days      = median days to ANY first decision (incl. desk rejects)
      avg_post_review_decision_days = median days to first decision AFTER peer review
  - "With Editor" stage: covers BOTH desk review AND reviewer invitation
      - Desk reject: typically 5–21 days
      - Reviewer hunt: can extend "With Editor" to 30–90+ days (confirmed from ResearchGate/Reddit)
  - Real T&F ranges observed (ResearchGate 2020/2024): 47–233 days, mean 114, median 99
  - "Under Review" encompasses: reviewer reading + report writing + editorial collation
      T&F gives reviewers 30 days; sends reminders; this stage routinely runs 6–12 weeks
  - Reddit r/academia 2025: authors reporting 5–8 month total waits; "With Editor" 2–3 months
"""

from datetime import date, datetime, timedelta
from typing import Optional

from models.schemas import (
    EMStatus, RiskLevel, StageProgress,
    StatusUpdate,
)


# ---------------------------------------------------------------------------
# Stage configuration — calibrated against real T&F data
# ---------------------------------------------------------------------------

STAGE_CONFIG: dict[str, dict] = {
    # Each entry: typical_days, overdue_at, description
    # "typical" = what a well-functioning journal does
    # "overdue_at" = threshold for medium risk (based on community reports + T&F own data)

    EMStatus.submitted: {
        "typical":      2,
        "overdue_at":   5,
        "description": (
            "Your manuscript has been received by the journal system and is awaiting "
            "assignment to a Handling Editor (HE). This stage is usually 1–3 days."
        ),
    },
    EMStatus.with_editor: {
        "typical":      18,
        "overdue_at":   30,
        # NOTE: T&F's published "first decision" metric INCLUDES desk rejects,
        # so the published number (e.g. 22 days) is artificially low.
        # Papers that pass desk review and go for full peer review average 60–120+ days.
        # "With Editor" beyond 30 days almost always means reviewer hunting difficulty.
        "description": (
            "The Handling Editor (HE) is performing an initial desk review and/or actively "
            "inviting peer reviewers. T&F publishes an average first decision time for each "
            "journal, but this includes fast desk rejections — papers that go to full peer "
            "review typically wait much longer. Beyond 30 days in this status almost always "
            "means the editor is struggling to find willing reviewers."
        ),
    },
    EMStatus.under_review: {
        "typical":      42,
        "overdue_at":   70,
        # T&F gives reviewers 30 days officially; with reminders and late reviewers,
        # 6–10 weeks is the real norm. 70 days = 10 weeks = safe overdue threshold.
        "description": (
            "Reviewers have accepted invitations and are reading your manuscript. "
            "T&F officially gives reviewers 30 days, but in practice editors allow "
            "extensions. A single late reviewer delays the entire process. "
            "6–10 weeks (42–70 days) in this status is normal; beyond 10 weeks warrants inquiry."
        ),
    },
    EMStatus.reviews_complete: {
        "typical":      7,
        "overdue_at":   21,
        "description": (
            "All required reviewer reports are in. The Associate Editor (AE) is now "
            "synthesising the reviews and preparing a recommendation for the Editor-in-Chief (EIC). "
            "This stage typically takes 1–2 weeks."
        ),
    },
    EMStatus.decision_in_process: {
        "typical":      5,
        "overdue_at":   14,
        "description": (
            "The EIC has received the AE's recommendation and is making the final editorial "
            "decision. This is usually the shortest active stage — 3–7 days is typical. "
            "Beyond 14 days may indicate the EIC is seeking additional input."
        ),
    },
    EMStatus.minor_revision: {
        "typical":      30,
        "overdue_at":   60,
        "description": (
            "Minor revisions have been requested. Authors typically have 30–60 days to resubmit. "
            "Minor revisions usually go back to the Handling Editor only (not full re-review), "
            "so the second decision is usually faster — 2–4 weeks."
        ),
    },
    EMStatus.major_revision: {
        "typical":      60,
        "overdue_at":   90,
        "description": (
            "Major revisions have been requested. Authors typically have 60–90 days to resubmit. "
            "Revised manuscripts usually go back to the original reviewers, so the "
            "second review cycle can take another 4–8 weeks after resubmission."
        ),
    },
    EMStatus.revision_submitted: {
        "typical":      21,
        "overdue_at":   42,
        "description": (
            "Your revision has been submitted and is back with the editor/reviewers. "
            "For minor revisions: typically 2–3 weeks for a decision (editor-only review). "
            "For major revisions: 4–8 weeks as it likely goes back to reviewers."
        ),
    },
    EMStatus.accepted: {
        "typical":      0, "overdue_at": 999,
        "description": "Your paper has been accepted. Production will contact you within 1–2 weeks.",
    },
    EMStatus.rejected: {
        "typical":      0, "overdue_at": 999,
        "description": (
            "The paper has been rejected. T&F offers a cascade/transfer service to some authors. "
            "Check the rejection letter — the editor may suggest an alternative T&F journal."
        ),
    },
    EMStatus.withdrawn: {
        "typical":      0, "overdue_at": 999,
        "description": "The submission was withdrawn by the author.",
    },
}

# Ordered first-decision flow (used for overall progress %)
ACTIVE_FLOW = [
    EMStatus.submitted,
    EMStatus.with_editor,
    EMStatus.under_review,
    EMStatus.reviews_complete,
    EMStatus.decision_in_process,
]

TERMINAL_STATUSES = {EMStatus.accepted, EMStatus.rejected, EMStatus.withdrawn}
REVISION_STATUSES = {EMStatus.minor_revision, EMStatus.major_revision, EMStatus.revision_submitted}

# Weight of each stage toward total first-decision journey
# Based on real T&F timing data: most time is in "Under Review"
STAGE_WEIGHTS = {
    EMStatus.submitted:           0.02,
    EMStatus.with_editor:         0.20,   # higher than naive estimate — reviewer hunting is slow
    EMStatus.under_review:        0.50,
    EMStatus.reviews_complete:    0.15,
    EMStatus.decision_in_process: 0.13,
}


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _parse_date(date_str: str) -> date:
    for fmt in ("%Y-%m-%d", "%d/%m/%Y", "%m/%d/%Y"):
        try:
            return datetime.strptime(date_str, fmt).date()
        except ValueError:
            continue
    raise ValueError(f"Cannot parse date: {date_str!r}")


def _days_between(start: str, end: Optional[str] = None) -> int:
    s = _parse_date(start)
    e = _parse_date(end) if end else date.today()
    return max(0, (e - s).days)


def _risk_level(score: float) -> RiskLevel:
    if score < 0.35:
        return RiskLevel.low
    if score < 0.60:
        return RiskLevel.medium
    if score < 0.85:
        return RiskLevel.high
    return RiskLevel.severe


def _status_explanation(status: EMStatus) -> str:
    return STAGE_CONFIG.get(status, {}).get("description", "Status not recognised in EM.")


def _dynamic_overdue(status: EMStatus, metrics: dict) -> int:
    """
    Scale the overdue threshold using the journal's own published metrics.
    This is the key fix — different journals have vastly different speeds
    (T&F range confirmed: 47–233 days for first decision across journals).
    """
    base = STAGE_CONFIG.get(status, {}).get("overdue_at", 30)

    if status == EMStatus.with_editor:
        # Journal's avg_first_decision includes desk rejects.
        # Papers going to full review wait avg_first * 1.8 in "With Editor"
        # (desk rejects pull the published avg way down)
        avg_first = metrics.get("avg_first_decision_days", 22)
        return max(25, int(avg_first * 1.8))

    if status == EMStatus.under_review:
        # Use the post-review metric if available; else estimate
        avg_review = metrics.get("avg_post_review_decision_days") or metrics.get("avg_review_days", 70)
        return max(50, int(avg_review * 0.9))

    return base


# ---------------------------------------------------------------------------
# Core calculation functions
# ---------------------------------------------------------------------------

def compute_stage_progress(status: EMStatus, days_in_status: int, metrics: dict) -> StageProgress:
    cfg        = STAGE_CONFIG.get(status, {"typical": 30, "overdue_at": 60})
    typical    = cfg["typical"]
    overdue_at = _dynamic_overdue(status, metrics)
    pct        = min(days_in_status / overdue_at, 1.5) if overdue_at else 0.0

    return StageProgress(
        stage         = status,
        days_in_stage = days_in_status,
        expected_days = typical,
        pct_consumed  = round(pct, 3),
        is_overdue    = days_in_status > overdue_at,
    )


def compute_overall_progress(
    timeline: list[StatusUpdate],
    current_status: EMStatus,
    metrics: dict,
) -> float:
    """0–100: estimated % through the first-decision journey."""
    if current_status in TERMINAL_STATUSES:
        return 100.0
    if current_status in REVISION_STATUSES:
        return 92.0   # post-decision, pre-final

    completed = 0.0
    for stage in ACTIVE_FLOW:
        if stage == current_status:
            break
        completed += STAGE_WEIGHTS.get(stage, 0.0)

    # Days in current status (from timeline)
    days_in_current = 0
    for event in reversed(timeline):
        if event.status == current_status:
            days_in_current = _days_between(event.date)
            break

    overdue_at      = _dynamic_overdue(current_status, metrics)
    partial         = min(days_in_current / overdue_at, 1.0) if overdue_at else 0.0
    current_weight  = STAGE_WEIGHTS.get(current_status, 0.0)
    total           = completed + current_weight * partial

    return round(min(total * 100, 99.0), 1)


def compute_risk_score(days_in_status: int, status: EMStatus, metrics: dict) -> float:
    """
    Risk score 0–1.
    Uses a logistic-style curve so risk ramps up steeply once past the
    journal-specific overdue threshold.
    """
    if status in TERMINAL_STATUSES:
        return 0.0
    if status in {EMStatus.minor_revision, EMStatus.major_revision}:
        return 0.05   # ball is in author's court

    overdue = _dynamic_overdue(status, metrics)
    if overdue == 0:
        return 0.0

    ratio = days_in_status / overdue

    # Piecewise logistic: low before 0.5×, steep after 1×
    if ratio <= 0.50:
        score = ratio * 0.30
    elif ratio <= 1.00:
        score = 0.15 + (ratio - 0.50) * 0.90
    else:
        score = min(0.60 + (ratio - 1.00) * 0.45, 1.0)

    return round(score, 3)


def compute_recommendation(
    risk_level: RiskLevel,
    status: EMStatus,
    days_in_status: int,
    journal_name: str,
    avg_first: int,
    avg_post_review: Optional[int] = None,
) -> str:
    if status in TERMINAL_STATUSES:
        return "No action needed — your submission has reached a final status."

    if status == EMStatus.minor_revision:
        return (
            "Focus on addressing each reviewer point carefully. Write a detailed response letter — "
            "editors read it as closely as the revision itself. Minor revisions usually only "
            "go back to the editor (not reviewers), so a quick turnaround signals professionalism."
        )
    if status == EMStatus.major_revision:
        return (
            "Treat this as a significant rewrite opportunity. Address every reviewer point explicitly "
            "in your response letter, even points you disagree with — explain your reasoning. "
            "Major revisions go back to the original reviewers, so be thorough."
        )
    if status == EMStatus.revision_submitted:
        real_avg = avg_post_review or avg_first + 40
        return (
            f"Your revision is under consideration. Allow at least {real_avg // 3} days before "
            "sending a status inquiry. For minor revisions, the editor may decide alone — "
            "expect a faster turnaround than the first round."
        )

    recs = {
        RiskLevel.low: (
            f"Your submission to {journal_name} is tracking normally at {days_in_status} days. "
            f"The journal's stated average first decision is {avg_first} days (including desk rejects — "
            "papers going to full peer review typically wait longer). No action needed."
        ),
        RiskLevel.medium: (
            f"At {days_in_status} days, your submission to {journal_name} is approaching the delay "
            f"threshold. The journal's published average is {avg_first} days, but this includes fast "
            "desk rejections — full peer review takes longer. Wait another 10–14 days before "
            "sending an inquiry unless you have a specific deadline."
        ),
        RiskLevel.high: (
            f"Your submission ({days_in_status} days) is significantly beyond the expected timeline "
            f"for {journal_name} (published avg: {avg_first} days). A polite status inquiry is now "
            "appropriate. Email the editorial office with your submission date and EM reference number, "
            "and ask for an estimated decision date. Research Square's reviewer service may help "
            "speed up future submissions to T&F journals."
        ),
        RiskLevel.severe: (
            f"At {days_in_status} days, your submission to {journal_name} is severely delayed beyond "
            "any normal range. Send a firm but professional inquiry to the editorial office immediately. "
            f"Reference their published average ({avg_first} days) and cite the actual elapsed time. "
            "If no response within 14 days, consider requesting withdrawal and resubmitting elsewhere. "
            "You are fully within your rights to withdraw at any time."
        ),
    }
    return recs.get(risk_level, "Check the journal's contact page for editorial office details.")


def estimated_decision_date(submission_date: str, status: EMStatus, metrics: dict) -> Optional[str]:
    """Best-guess date for first editorial decision, using post-review metric where available."""
    if status in TERMINAL_STATUSES:
        return None

    # Use post-review average for the real expected wait
    avg = (
        metrics.get("avg_post_review_decision_days")
        or metrics.get("avg_review_days")
        or metrics.get("avg_first_decision_days", 60)
    )

    sub  = _parse_date(submission_date)
    est  = sub + timedelta(days=avg)

    # If already past estimated date, push forward by 1/3 of review cycle
    if est < date.today():
        est = date.today() + timedelta(days=max(14, avg // 3))

    return est.isoformat()


# ---------------------------------------------------------------------------
# Main public function
# ---------------------------------------------------------------------------

def build_prediction(
    submission_date: str,
    current_status: EMStatus,
    status_date: str,
    metrics: dict,
    timeline: list[StatusUpdate] = None,
) -> dict:
    """
    Full prediction payload.
    Returns a dict matching all PredictResponse fields.
    """
    timeline = timeline or []

    days_since_submission  = _days_between(submission_date)
    days_in_current_status = _days_between(status_date)

    avg_first      = metrics.get("avg_first_decision_days", 22)
    avg_post_review = metrics.get("avg_post_review_decision_days") or metrics.get("avg_review_days", 70)
    avg_total      = avg_post_review + metrics.get("avg_acceptance_to_pub_days", 60)

    # pct_of_average: compare against post-review metric (the meaningful one)
    pct_of_avg = round(days_since_submission / avg_post_review, 2) if avg_post_review else 0.0

    risk_score = compute_risk_score(days_in_current_status, current_status, metrics)
    risk_lvl   = _risk_level(risk_score)

    stage_prog = compute_stage_progress(current_status, days_in_current_status, metrics)
    overall    = compute_overall_progress(timeline, current_status, metrics)

    recommendation = compute_recommendation(
        risk_lvl, current_status, days_in_current_status,
        metrics.get("name", "this journal"), avg_first, avg_post_review,
    )

    return {
        "days_since_submission":   days_since_submission,
        "days_in_current_status":  days_in_current_status,
        "avg_first_decision_days": avg_first,
        "avg_total_days":          avg_total,
        "risk_score":              risk_score,
        "risk_level":              risk_lvl,
        "pct_of_average":          pct_of_avg,
        "overall_progress_pct":    overall,
        "stage_progress":          stage_prog,
        "estimated_decision_date": estimated_decision_date(submission_date, current_status, metrics),
        "recommendation":          recommendation,
        "status_explanation":      _status_explanation(current_status),
        "metrics":                 metrics,
    }
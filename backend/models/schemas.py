from pydantic import BaseModel, Field
from typing import Optional, List
from enum import Enum
from datetime import datetime


class EMStatus(str, Enum):
    submitted           = "Submitted to Journal"
    with_editor         = "With Editor"
    under_review        = "Under Review"
    reviews_complete    = "Required Reviews Complete"
    decision_in_process = "Decision in Process"
    minor_revision      = "Minor Revision"
    major_revision      = "Major Revision"
    revision_submitted  = "Revision Submitted"
    accepted            = "Accepted"
    rejected            = "Rejected"
    withdrawn           = "Withdrawn"


class RiskLevel(str, Enum):
    low    = "low"
    medium = "medium"
    high   = "high"
    severe = "severe"


class DataMode(str, Enum):
    predictive = "predictive"
    live       = "live"


class JournalMetrics(BaseModel):
    slug:                            str
    name:                            str
    avg_first_decision_days:         int    # T&F metric 1: incl. desk rejects
    avg_post_review_decision_days:   Optional[int] = None  # T&F metric 2: excl. desk rejects
    avg_review_days:                 int    # alias for avg_post_review (used by predictor)
    avg_acceptance_to_pub_days:      Optional[int] = None
    acceptance_rate:                 Optional[float] = None
    rejection_rate:                  Optional[float] = None
    source:                          str = "cache"
    last_updated:                    Optional[str] = None


class StatusUpdate(BaseModel):
    status:     EMStatus
    date:       str
    note:       Optional[str] = None
    source:     str = "author"
    created_at: str = Field(default_factory=lambda: datetime.utcnow().isoformat())


class CreateSubmissionRequest(BaseModel):
    journal_slug:     str   = Field(..., examples=["ipmt20"])
    journal_name:     str   = Field(..., examples=["Pain Management"])
    submission_date:  str   = Field(..., examples=["2025-03-15"])
    initial_status:   EMStatus = EMStatus.submitted
    manuscript_title: Optional[str] = None
    notes:            Optional[str] = None


class UpdateSubmissionRequest(BaseModel):
    new_status:  EMStatus
    update_date: str
    note:        Optional[str] = None


class SubmissionRecord(BaseModel):
    id:               str
    journal_slug:     str
    journal_name:     str
    manuscript_title: Optional[str] = None
    timeline:         List[StatusUpdate]
    created_at:       str
    updated_at:       str


class StageProgress(BaseModel):
    stage:          EMStatus
    days_in_stage:  int
    expected_days:  int
    pct_consumed:   float
    is_overdue:     bool


class PredictRequest(BaseModel):
    journal_slug:    str
    journal_name:    str
    submission_date: str
    current_status:  EMStatus
    notes:           Optional[str] = None


class PredictResponse(BaseModel):
    days_since_submission:    int
    days_in_current_status:   int
    avg_first_decision_days:  int
    avg_total_days:           int
    risk_score:               float
    risk_level:               RiskLevel
    pct_of_average:           float
    overall_progress_pct:     float
    stage_progress:           StageProgress
    estimated_decision_date:  Optional[str]
    recommendation:           str
    status_explanation:       str
    metrics:                  JournalMetrics


class SubmissionPredictResponse(PredictResponse):
    submission: SubmissionRecord


class ChatRequest(BaseModel):
    message: str
    context: Optional[dict] = None


class ChatResponse(BaseModel):
    response: str


class DemoCase(BaseModel):
    id:              str
    label:           str
    journal_slug:    str
    journal_name:    str
    submission_date: str
    current_status:  EMStatus
    notes:           Optional[str] = None
    expected_risk:   RiskLevel
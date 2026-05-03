export type EMStatus =
  | "Submitted to Journal"
  | "With Editor"
  | "Under Review"
  | "Required Reviews Complete"
  | "Decision in Process"
  | "Minor Revision"
  | "Major Revision"
  | "Revision Submitted"
  | "Accepted"
  | "Rejected"
  | "Withdrawn"

export type RiskLevel = "low" | "medium" | "high" | "severe"

export type View =
  | "dashboard"
  | "submissions"
  | "submission-detail"
  | "decoder"
  | "templates"
  | "journals"
  | "demo"

export interface JournalMetrics {
  slug: string
  name: string
  avg_first_decision_days: number | null
  avg_post_review_decision_days: number | null
  avg_review_days: number | null
  avg_acceptance_to_pub_days: number | null
  acceptance_rate: number | null
  rejection_rate: number | null
  source: string
  last_updated: string | null
  needs_manual_seed?: boolean
  seed_url?: string
  subject_area?: string
}

export interface StageProgress {
  stage: EMStatus
  days_in_stage: number
  expected_days: number
  pct_consumed: number
  is_overdue: boolean
}

export interface StatusUpdate {
  status: EMStatus
  date: string
  note: string | null
  source: string
  created_at: string
}

export interface SubmissionRecord {
  id: string
  journal_slug: string
  journal_name: string
  manuscript_title: string | null
  timeline: StatusUpdate[]
  created_at: string
  updated_at: string
}

export interface PredictResponse {
  days_since_submission: number
  days_in_current_status: number
  avg_first_decision_days: number
  avg_total_days: number
  risk_score: number
  risk_level: RiskLevel
  pct_of_average: number
  overall_progress_pct: number
  stage_progress: StageProgress
  estimated_decision_date: string | null
  recommendation: string
  status_explanation: string
  metrics: JournalMetrics
}

export interface SubmissionPredictResponse extends PredictResponse {
  submission: SubmissionRecord
}

export interface CreateSubmissionPayload {
  journal_slug: string
  journal_name: string
  submission_date: string
  initial_status: EMStatus
  manuscript_title?: string
  notes?: string
}

export interface UpdateStatusPayload {
  new_status: EMStatus
  update_date: string
  note?: string
}

export const EM_STATUSES: EMStatus[] = [
  "Submitted to Journal",
  "With Editor",
  "Under Review",
  "Required Reviews Complete",
  "Decision in Process",
  "Minor Revision",
  "Major Revision",
  "Revision Submitted",
  "Accepted",
  "Rejected",
  "Withdrawn",
]

export const RISK_LABELS: Record<RiskLevel, string> = {
  low:    "Low risk",
  medium: "Medium risk",
  high:   "High risk",
  severe: "Severe delay",
}
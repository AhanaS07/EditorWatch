import {
  CreateSubmissionPayload,
  UpdateStatusPayload,
  SubmissionPredictResponse,
  SubmissionRecord,
  PredictResponse,
  JournalMetrics,
} from "./types"

const BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"

async function req<T>(path: string, options?: RequestInit): Promise<T> {
  let res: Response
  try {
    res = await fetch(`${BASE}${path}`, {
      headers: { "Content-Type": "application/json" },
      ...options,
    })
  } catch {
    throw new Error("Could not reach the server. Make sure the backend is running.")
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }))
    throw new Error(typeof err.detail === "string" ? err.detail : JSON.stringify(err.detail))
  }
  if (res.status === 204) return undefined as T
  return res.json()
}

// POST /submissions
export const createSubmission = (p: CreateSubmissionPayload) =>
  req<SubmissionPredictResponse>("/submissions", { method: "POST", body: JSON.stringify(p) })

// GET /submissions
export const listSubmissions = () =>
  req<SubmissionRecord[]>("/submissions")

// GET /submissions/{id}
export const getSubmission = (id: string) =>
  req<SubmissionPredictResponse>(`/submissions/${id}`)

// PATCH /submissions/{id}/status
export const updateSubmissionStatus = (id: string, p: UpdateStatusPayload) =>
  req<SubmissionPredictResponse>(`/submissions/${id}/status`, { method: "PATCH", body: JSON.stringify(p) })

// DELETE /submissions/{id}
export const deleteSubmission = (id: string) =>
  req<void>(`/submissions/${id}`, { method: "DELETE" })

// GET /journals
export const listJournals = () =>
  req<JournalMetrics[]>("/journals")

// GET /journals/cache-status
export const getCacheStatus = () =>
  req<any>("/journals/cache-status")

// GET /journals/search?q=
export const searchJournals = (q: string) =>
  req<any>(`/journals/search?q=${encodeURIComponent(q)}`)

// GET /journals/{slug}
export const getJournal = (slug: string) =>
  req<JournalMetrics>(`/journals/${slug}`)

// POST /journals/{slug}/update
export const updateJournalMetrics = (slug: string, p: {
  name: string
  avg_first_decision_days: number
  avg_post_review_decision_days: number
  avg_acceptance_to_pub_days?: number
  acceptance_rate?: number
  notes?: string
}) => req<JournalMetrics>(`/journals/${slug}/update`, { method: "POST", body: JSON.stringify(p) })

// POST /chat
export const chat = (message: string, context?: object) =>
  req<{ response: string }>("/chat", { method: "POST", body: JSON.stringify({ message, context }) })

// POST /chat/nudge
export const generateNudge = (tone: string, context: object) =>
  req<{ response: string }>("/chat/nudge", { method: "POST", body: JSON.stringify({ tone, context }) })

// GET /demo
export const getDemoCases = () =>
  req<any[]>("/demo")

// GET /health
export const getHealth = () =>
  req<any>("/health")
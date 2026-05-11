"use client"
import { useState, useEffect } from "react"
import { View, SubmissionPredictResponse, EMStatus, EM_STATUSES } from "@/lib/types"
import { today, formatDate, statusColor, RISK_ORDER } from "@/lib/utils"
import { useDelayPredict } from "@/hooks/useDelayPredict"

import SubmissionForm from "@/components/SubmissionForm"
import DelayDashboard from "@/components/DelayDashboard"
import StatusDecoder from "@/components/StatusDecoder"
import NudgeTemplate from "@/components/NudgeTemplate"
import JournalComparator from "@/components/JournalComparator"
import DemoMode from "@/components/DemoMode"
import RiskBadge from "@/components/RiskBadge"
import ProgressBar from "@/components/ProgressBar"
import { getCacheStatus } from "@/lib/api"

const NAV: { id: View; label: string }[] = [
  { id: "dashboard",   label: "Dashboard" },
  { id: "submissions", label: "My submissions" },
  { id: "decoder",     label: "Status decoder" },
  { id: "templates",   label: "Nudge templates" },
  { id: "journals",    label: "Journal browser" },
  { id: "demo",        label: "Demo cases" },
]

// ── Update status modal ─────────────────────────────────────────────────────
function UpdateModal({ sub, onSave, onClose }: {
  sub: SubmissionPredictResponse
  onSave: (id: string, p: { new_status: EMStatus; update_date: string; note?: string }) => Promise<void>
  onClose: () => void
}) {
  const latest = sub.submission.timeline[sub.submission.timeline.length - 1]
  const [newStatus, setNewStatus] = useState<EMStatus>(latest.status)
  const [date, setDate] = useState(today())
  const [note, setNote] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  async function save() {
    setLoading(true); setError("")
    try {
      await onSave(sub.submission.id, { new_status: newStatus, update_date: date, note: note || undefined })
      onClose()
    } catch (e: any) { setError(e.message) }
    finally { setLoading(false) }
  }

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(26,39,68,0.5)",
      display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50 }}>
      <div className="card" style={{ width: 420, maxWidth: "90vw" }}>
        <h2 style={{ fontFamily: "var(--font-serif)", fontSize: 18, color: "var(--navy)", marginBottom: 6 }}>
          Update submission status
        </h2>
        <p style={{ fontSize: 12, color: "var(--ink-muted)", marginBottom: 18, lineHeight: 1.5 }}>
          Log what the editorial team told you. This appends to the timeline and recalculates risk.
        </p>
        <div style={{ marginBottom: 12 }}>
          <label className="section-label">New EM status</label>
          <select value={newStatus} onChange={e => setNewStatus(e.target.value as EMStatus)}>
            {EM_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div style={{ marginBottom: 12 }}>
          <label className="section-label">Date you received this update</label>
          <input type="date" value={date} onChange={e => setDate(e.target.value)} />
        </div>
        <div style={{ marginBottom: 18 }}>
          <label className="section-label">Note (optional)</label>
          <textarea rows={3} placeholder="e.g. Editor emailed — 2 reviewers assigned"
            value={note} onChange={e => setNote(e.target.value)} style={{ resize: "vertical" }} />
        </div>
        {error && <p style={{ fontSize: 12, color: "var(--crimson)", marginBottom: 10 }}>{error}</p>}
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button className="btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn-primary" onClick={save} disabled={loading}>
            {loading ? "Saving..." : "Save update"}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Submission detail view ───────────────────────────────────────────────────
function SubmissionDetail({ sub, onUpdateStatus, onBack }: {
  sub: SubmissionPredictResponse
  onUpdateStatus: (sub: SubmissionPredictResponse) => void
  onBack: () => void
}) {
  const latest = sub.submission.timeline[sub.submission.timeline.length - 1]
  return (
    <div>
      <button onClick={onBack} style={{
        display: "inline-flex", alignItems: "center", gap: 6,
        marginBottom: 22, padding: "6px 12px 6px 8px",
        background: "var(--surface-alt)", border: "1px solid var(--linen-border)",
        borderRadius: 6, cursor: "pointer", fontSize: 12.5,
        color: "var(--navy)", fontFamily: "var(--font-sans)",
        fontWeight: 500, transition: "background 0.1s",
      }}
        onMouseEnter={e => (e.currentTarget.style.background = "var(--linen)")}
        onMouseLeave={e => (e.currentTarget.style.background = "var(--surface-alt)")}
      >
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={{ flexShrink: 0 }}>
          <path d="M9 2L4 7L9 12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
        Back
      </button>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 }}>
        <div>
          <h2 style={{ fontFamily: "var(--font-serif)", fontSize: 22, color: "var(--navy)", margin: 0 }}>
            {sub.submission.journal_name}
          </h2>
          {sub.submission.manuscript_title && (
            <p style={{ fontSize: 13, color: "var(--ink-muted)", margin: "4px 0 0" }}>
              {sub.submission.manuscript_title}
            </p>
          )}
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <RiskBadge level={sub.risk_level} />
          <button className="btn-primary" onClick={() => onUpdateStatus(sub)}>Update status</button>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 300px", gap: 20 }}>
        <div>
          {/* Metrics */}
          <span className="section-label">Timing</span>
          <div className="card" style={{ marginBottom: 16 }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 14, marginBottom: 14 }}>
              {[
                { num: sub.days_since_submission, label: "Total days since submission" },
                { num: sub.days_in_current_status, label: `Days "${latest.status}"` },
                { num: `${Math.round(sub.pct_of_average * 100)}%`, label: "Of journal avg consumed" },
              ].map(({ num, label }) => (
                <div key={label} style={{ textAlign: "center" }}>
                  <div style={{ fontFamily: "var(--font-serif)", fontSize: 22, color: "var(--navy)" }}>{num}</div>
                  <div style={{ fontSize: 10, color: "var(--ink-muted)", textTransform: "uppercase",
                    letterSpacing: "0.05em", marginTop: 3 }}>{label}</div>
                </div>
              ))}
            </div>
            <ProgressBar pct={sub.overall_progress_pct} riskLevel={sub.risk_level}
              label="Estimated overall journey progress" />
            {sub.stage_progress.is_overdue && (
              <p style={{ fontSize: 12, color: "var(--crimson)", marginTop: 10 }}>
                This stage is overdue — {sub.days_in_current_status}d vs {sub.stage_progress.expected_days}d typical.
              </p>
            )}
          </div>

          <span className="section-label">Assessment</span>
          <div className="reco-box" style={{ marginBottom: 16 }}>{sub.recommendation}</div>

          <span className="section-label">What "{latest.status}" means</span>
          <div className="card" style={{ marginBottom: 16, fontSize: 13, color: "var(--ink-mid)", lineHeight: 1.7 }}>
            {sub.status_explanation}
          </div>

          <span className="section-label">Journal benchmarks — {sub.metrics.name}</span>
          <div className="card">
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              {[
                { label: "Avg first decision (incl. desk rejects)", val: sub.metrics.avg_first_decision_days ? `${sub.metrics.avg_first_decision_days} days` : "Not seeded" },
                { label: "Avg post-review decision", val: sub.metrics.avg_post_review_decision_days ? `${sub.metrics.avg_post_review_decision_days} days` : "Not seeded" },
                { label: "Acceptance rate", val: sub.metrics.acceptance_rate ? `${Math.round(sub.metrics.acceptance_rate * 100)}%` : "Unknown" },
                { label: "Estimated decision by", val: sub.estimated_decision_date ? formatDate(sub.estimated_decision_date) : "Unknown" },
              ].map(({ label, val }) => (
                <div key={label} style={{ padding: "10px 12px", background: "var(--linen)", borderRadius: 4 }}>
                  <div style={{ fontSize: 10, color: "var(--ink-muted)", textTransform: "uppercase",
                    letterSpacing: "0.06em", marginBottom: 4 }}>{label}</div>
                  <div style={{ fontFamily: "var(--font-serif)", fontSize: 15, color: "var(--navy)" }}>{val}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Timeline */}
        <div>
          <span className="section-label">Status timeline</span>
          <div className="card">
            {[...sub.submission.timeline].reverse().map((event, i, arr) => (
              <div key={i} style={{ display: "flex", gap: 12,
                paddingBottom: i < arr.length - 1 ? 14 : 0,
                borderBottom: i < arr.length - 1 ? "1px solid var(--linen-border)" : "none",
                marginBottom: i < arr.length - 1 ? 14 : 0 }}>
                <div style={{ paddingTop: 3, flexShrink: 0 }}>
                  <div className={`timeline-dot${i === 0 ? " active" : ""}`} />
                </div>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 500, color: statusColor(event.status) }}>
                    {event.status}
                  </div>
                  <div style={{ fontSize: 11, color: "var(--ink-muted)", marginTop: 1 }}>
                    {formatDate(event.date)}
                  </div>
                  {event.note && (
                    <div style={{ fontSize: 11, color: "var(--ink-mid)", marginTop: 4,
                      fontStyle: "italic", lineHeight: 1.5 }}>
                      "{event.note}"
                    </div>
                  )}
                </div>
              </div>
            ))}
            <button className="btn-ghost" style={{ width: "100%", marginTop: 14, fontSize: 11 }}
              onClick={() => onUpdateStatus(sub)}>
              + Log a status update
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Disclaimer modal ──────────────────────────────────────────────────────────
function DisclaimerModal({ onAccept }: { onAccept: () => void }) {
  const [checked, setChecked] = useState(false)

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 100,
      background: "rgba(26,39,68,0.72)",
      display: "flex", alignItems: "center", justifyContent: "center",
      padding: "20px",
    }}>
      <div style={{
        background: "var(--surface-alt)",
        border: "1px solid var(--linen-border)",
        borderRadius: 10,
        width: "100%", maxWidth: 520,
        padding: "32px 36px",
        boxShadow: "0 8px 32px rgba(26,39,68,0.18)",
      }}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "flex-start", gap: 14, marginBottom: 20 }}>
          <div style={{
            width: 36, height: 36, borderRadius: "50%", flexShrink: 0, marginTop: 2,
            background: "var(--crimson-light)",
            border: "1px solid #E8A29A",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <span style={{ color: "var(--crimson)", fontSize: 16, fontWeight: 700 }}>!</span>
          </div>
          <div>
            <h2 style={{
              fontFamily: "var(--font-serif)", fontSize: 20, color: "var(--navy)",
              margin: 0, fontWeight: 500,
            }}>
              Before you begin
            </h2>
            <p style={{ fontSize: 12, color: "var(--ink-muted)", margin: "3px 0 0" }}>
              EditorWatch — Important notice
            </p>
          </div>
        </div>

        {/* Body */}
        <div style={{
          background: "var(--linen)", borderRadius: 6, padding: "16px 18px",
          marginBottom: 20, fontSize: 13, color: "var(--ink-mid)", lineHeight: 1.75,
        }}>
          <p style={{ marginBottom: 10 }}>
            EditorWatch provides <strong style={{ color: "var(--navy)" }}>predictive estimates only</strong>.
            All timelines, risk scores, and delay predictions are based on publicly available
            journal metrics and community-reported data — not live access to Editorial Manager
            or any Taylor &amp; Francis system.
          </p>
          <p style={{ marginBottom: 10 }}>
            Predictions may be inaccurate. Every journal and submission is different.
            Use this tool as a <strong style={{ color: "var(--navy)" }}>general guide</strong>,
            not as a basis for formal complaints or withdrawal decisions.
          </p>
          <p style={{ marginBottom: 0 }}>
            EditorWatch is <strong style={{ color: "var(--navy)" }}>not affiliated with,
            endorsed by, or connected to Taylor &amp; Francis</strong> in any way.
            Journal metrics are sourced from publicly accessible T&amp;F pages and may
            be out of date.
          </p>
        </div>

        {/* Checkbox acknowledgement */}
        <label style={{
          display: "flex", alignItems: "flex-start", gap: 10,
          cursor: "pointer", marginBottom: 22,
        }}>
          <input
            type="checkbox"
            checked={checked}
            onChange={e => setChecked(e.target.checked)}
            style={{
              width: 16, height: 16, marginTop: 1, flexShrink: 0,
              accentColor: "var(--navy)", cursor: "pointer",
            }}
          />
          <span style={{ fontSize: 12, color: "var(--ink-mid)", lineHeight: 1.6 }}>
            I understand that EditorWatch provides estimates only and is not affiliated
            with Taylor &amp; Francis. I will not use predictions as a substitute for
            direct communication with journals.
          </span>
        </label>

        {/* Actions */}
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <button
            className="btn-primary"
            disabled={!checked}
            onClick={onAccept}
            style={{ opacity: checked ? 1 : 0.45, minWidth: 140 }}
          >
            I understand — continue →
          </button>
        </div>

        <p style={{
          fontSize: 10, color: "var(--ink-muted)", marginTop: 16,
          textAlign: "center", letterSpacing: "0.03em",
        }}>
          This notice appears each time you open EditorWatch.
        </p>
      </div>
    </div>
  )
}

// ── Root app ─────────────────────────────────────────────────────────────────
export default function App() {
  const [view, setView] = useState<View>("dashboard")
  const [detailId, setDetailId] = useState<string | null>(null)
  const [backDestination, setBackDestination] = useState<View>("dashboard")
  const [updateTarget, setUpdateTarget] = useState<SubmissionPredictResponse | null>(null)
  const [cacheStatus, setCacheStatus] = useState<any>(null)
  const [disclaimerAccepted, setDisclaimerAccepted] = useState(false)
  const { enriched, loading, loadAll, create, updateStatus, remove } = useDelayPredict()

  useEffect(() => {
    // Use sessionStorage so disclaimer shows every time the browser tab is opened
    // Change to localStorage if you want once-per-device instead
    const accepted = sessionStorage.getItem("ew_disclaimer_accepted")
    if (accepted === "true") setDisclaimerAccepted(true)
    loadAll()
    getCacheStatus().then(setCacheStatus).catch(() => {})
  }, [])

  function handleAcceptDisclaimer() {
    sessionStorage.setItem("ew_disclaimer_accepted", "true")
    setDisclaimerAccepted(true)
  }

  function goToDetail(id: string, from: View = "submissions") {
    setDetailId(id); setBackDestination(from); setView("submission-detail")
  }

  async function handleCreate(payload: Parameters<typeof create>[0]) {
    const result = await create(payload)
    goToDetail(result.submission.id, "dashboard")
  }

  const detailSub = detailId ? enriched.find(e => e.submission.id === detailId) ?? null : null

  // ── Sidebar ────────────────────────────────────────────────────────────────
  const sidebar = (
    <aside style={{ width: 210, flexShrink: 0, background: "var(--navy)",
      display: "flex", flexDirection: "column", minHeight: "100vh",
      position: "sticky", top: 0, height: "100vh" }}>
      <div style={{ padding: "24px 20px 18px", borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
        <div style={{ fontFamily: "var(--font-serif)", fontSize: 17, color: "#EEE8DA", letterSpacing: "0.03em" }}>
          EditorWatch
        </div>
        <div style={{ fontSize: 10, color: "rgba(238,232,218,0.4)", letterSpacing: "0.13em",
          textTransform: "uppercase", marginTop: 4 }}>
          T&F Review Tracker
        </div>
      </div>
      <nav style={{ padding: "14px 0", flex: 1 }}>
        {NAV.map(({ id, label }) => {
          const active = view === id || (id === "submissions" && view === "submission-detail")
          return (
            <button key={id} onClick={() => { setView(id); if (id !== "submission-detail") setDetailId(null) }}
              style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 20px",
                width: "100%", textAlign: "left", fontSize: 12.5, fontFamily: "var(--font-sans)",
                letterSpacing: "0.02em", cursor: "pointer",
                color: active ? "#EEE8DA" : "rgba(238,232,218,0.5)",
                background: active ? "rgba(192,57,43,0.12)" : "transparent",
                borderTop: "none", borderRight: "none", borderBottom: "none",
                borderLeft: active ? "2px solid var(--crimson)" : "2px solid transparent",
                transition: "all 0.12s" }}>
              <span style={{ width: 5, height: 5, borderRadius: "50%", flexShrink: 0,
                background: active ? "var(--crimson)" : "rgba(238,232,218,0.25)" }} />
              {label}
            </button>
          )
        })}
      </nav>
      <div style={{ padding: "12px 20px", borderTop: "1px solid rgba(255,255,255,0.08)",
        fontSize: 10, color: "rgba(238,232,218,0.28)", letterSpacing: "0.05em", lineHeight: 1.6 }}>
        Estimates only.<br />Not affiliated with T&F.
      </div>
    </aside>
  )

  // ── Page header ────────────────────────────────────────────────────────────
  const PAGE_TITLES: Record<string, string> = {
    dashboard: "Dashboard", submissions: "My submissions",
    "submission-detail": detailSub?.submission.journal_name || "Submission detail",
    decoder: "Status decoder", templates: "Nudge templates",
    journals: "Journal browser", demo: "Demo cases",
  }

  const header = (
    <div style={{ background: "var(--surface-alt)", borderBottom: "1px solid var(--linen-border)",
      padding: "15px 28px", display: "flex", alignItems: "center",
      justifyContent: "space-between", flexShrink: 0 }}>
      <h1 style={{ fontFamily: "var(--font-serif)", fontSize: 20, color: "var(--navy)", margin: 0, fontWeight: 500 }}>
        {PAGE_TITLES[view] || "EditorWatch"}
      </h1>
      {cacheStatus?.summary?.never_seeded > 0 && (
        <span className="seed-badge"
          onClick={() => setView("journals")}
          style={{ cursor: "pointer" }}>
          {cacheStatus.summary.never_seeded} journals need seeding
        </span>
      )}
    </div>
  )

  // ── Main content ───────────────────────────────────────────────────────────
  const content = (
    <div style={{ padding: "24px 28px", flex: 1, overflowY: "auto" }}>
      {view === "dashboard" && (
        <div>
          <span className="section-label">Track a new submission</span>
          <div style={{ marginBottom: 28 }}>
            <SubmissionForm onSubmit={handleCreate} />
          </div>
          <span className="section-label">Active submissions</span>
          <DelayDashboard
            enriched={enriched} loading={loading} cacheStatus={cacheStatus}
            onSelectSubmission={goToDetail}
            onUpdateStatus={sub => setUpdateTarget(sub)}
            onDelete={id => remove(id)}
          />
        </div>
      )}

      {view === "submissions" && (
        <div>
          <DelayDashboard
            enriched={enriched} loading={loading} cacheStatus={cacheStatus}
            onSelectSubmission={goToDetail}
            onUpdateStatus={sub => setUpdateTarget(sub)}
            onDelete={id => remove(id)}
          />
        </div>
      )}

      {view === "submission-detail" && detailSub && (
        <SubmissionDetail
          sub={detailSub}
          onUpdateStatus={sub => setUpdateTarget(sub)}
          onBack={() => { setView(backDestination); setDetailId(null) }}
        />
      )}

      {view === "submission-detail" && !detailSub && (
        <div>
          <p style={{ color: "var(--ink-muted)", fontSize: 13, marginBottom: 16 }}>
            {loading ? "Loading submission..." : "Submission not found or journal not yet seeded."}
          </p>
          <button className="btn-ghost" onClick={() => setView("submissions")}>← Back</button>
        </div>
      )}

      {view === "decoder" && <StatusDecoder key="decoder" />}

      {view === "templates" && <NudgeTemplate onNavigateToJournals={() => setView("journals")} />}

      {view === "journals" && <JournalComparator />}

      {view === "demo" && <DemoMode />}
    </div>
  )

  return (
    <div style={{ display: "flex", minHeight: "100vh" }}>
      {sidebar}
      <main style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column",
        background: "var(--linen)", overflow: "hidden" }}>
        {header}
        {content}
      </main>

      {updateTarget && (
        <UpdateModal
          sub={updateTarget}
          onSave={async (id, p) => { await updateStatus(id, p); setUpdateTarget(null) }}
          onClose={() => setUpdateTarget(null)}
        />
      )}

      {!disclaimerAccepted && (
        <DisclaimerModal onAccept={handleAcceptDisclaimer} />
      )}
    </div>
  )
}
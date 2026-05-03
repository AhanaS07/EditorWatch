"use client"
import { SubmissionPredictResponse } from "@/lib/types"
import RiskBadge from "./RiskBadge"
import ProgressBar from "./ProgressBar"
import { formatDate, statusColor, RISK_ORDER } from "@/lib/utils"

interface Props {
  enriched: SubmissionPredictResponse[]
  loading: boolean
  onSelectSubmission: (id: string) => void
  onUpdateStatus: (sub: SubmissionPredictResponse) => void
  onDelete: (id: string) => void
  cacheStatus: any
}

export default function DelayDashboard({
  enriched, loading, onSelectSubmission, onUpdateStatus, onDelete, cacheStatus,
}: Props) {
  const highRisk   = enriched.filter(e => e.risk_level === "high" || e.risk_level === "severe").length
  const avgDays    = enriched.length
    ? Math.round(enriched.reduce((a, b) => a + b.days_since_submission, 0) / enriched.length) : 0
  const seeded     = (cacheStatus?.summary?.fresh || 0) + (cacheStatus?.summary?.ok || 0)
  const total      = cacheStatus?.summary?.total || 50
  const needsSeed  = cacheStatus?.summary?.never_seeded || 0

  const sorted = [...enriched].sort((a, b) => RISK_ORDER[a.risk_level] - RISK_ORDER[b.risk_level])

  return (
    <div>
      {/* Alert banner */}
      {needsSeed > 0 && (
        <div style={{ background: "var(--crimson-light)", border: "1px solid #E8A29A",
          borderRadius: 6, padding: "10px 16px", marginBottom: 20,
          fontSize: 12, color: "var(--crimson-dark)", lineHeight: 1.5 }}>
          <strong>{needsSeed} journals</strong> need seeding with T&F metrics before predictions work.
          Go to <strong>Journal browser</strong> to add them.
        </div>
      )}

      {/* Stats row */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 12, marginBottom: 24 }}>
        {[
          { label: "Tracked submissions", value: enriched.length, color: "var(--navy)" },
          { label: "High / severe risk",  value: highRisk, color: highRisk > 0 ? "var(--crimson)" : "var(--navy)" },
          { label: "Avg days waiting",    value: avgDays || "—", color: "var(--navy)" },
          { label: "Journals seeded",     value: `${seeded} / ${total}`, color: seeded < total ? "#854F0B" : "#3B6D11" },
        ].map(({ label, value, color }) => (
          <div key={label} style={{ background: "var(--surface-alt)", border: "1px solid var(--linen-border)",
            borderRadius: 6, padding: "14px 16px" }}>
            <span className="section-label">{label}</span>
            <div style={{ fontFamily: "var(--font-serif)", fontSize: 24, color }}>{value}</div>
          </div>
        ))}
      </div>

      {/* Submissions */}
      {loading && <p style={{ color: "var(--ink-muted)", fontSize: 13 }}>Loading submissions...</p>}

      {!loading && sorted.length === 0 && (
        <div style={{ textAlign: "center", padding: "48px 0", color: "var(--ink-muted)" }}>
          <p style={{ fontFamily: "var(--font-serif)", fontSize: 16, marginBottom: 4 }}>No submissions tracked yet.</p>
          <p style={{ fontSize: 12 }}>Use the form above to track your first submission.</p>
        </div>
      )}

      {sorted.map(sub => {
        const latest = sub.submission.timeline[sub.submission.timeline.length - 1]
        return (
          <div key={sub.submission.id} className="card" style={{ marginBottom: 14 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
              <div style={{ flex: 1, minWidth: 0, marginRight: 12 }}>
                <button
                  onClick={() => onSelectSubmission(sub.submission.id)}
                  style={{ fontFamily: "var(--font-serif)", fontSize: 16, color: "var(--navy)",
                    background: "none", border: "none", cursor: "pointer", padding: 0,
                    textAlign: "left", textDecoration: "underline", textDecorationColor: "transparent",
                    transition: "text-decoration-color 0.15s",
                  }}
                  onMouseEnter={e => (e.currentTarget.style.textDecorationColor = "var(--navy)")}
                  onMouseLeave={e => (e.currentTarget.style.textDecorationColor = "transparent")}
                >
                  {sub.submission.journal_name}
                </button>
                {sub.submission.manuscript_title && (
                  <p style={{ fontSize: 12, color: "var(--ink-muted)", margin: "2px 0 0",
                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 420 }}>
                    {sub.submission.manuscript_title}
                  </p>
                )}
                <div style={{ display: "flex", gap: 14, marginTop: 6, flexWrap: "wrap" }}>
                  <span style={{ fontSize: 11, fontWeight: 500, color: statusColor(latest.status) }}>
                    {latest.status.toUpperCase()}
                  </span>
                  <span style={{ fontSize: 11, color: "var(--ink-muted)" }}>
                    {sub.days_since_submission}d total · {sub.days_in_current_status}d in status
                  </span>
                  <span style={{ fontSize: 11, color: "var(--ink-muted)" }}>
                    Submitted {formatDate(sub.submission.timeline[0].date)}
                  </span>
                </div>
              </div>
              <RiskBadge level={sub.risk_level} />
            </div>

            <div style={{ marginBottom: 12 }}>
              <ProgressBar pct={sub.overall_progress_pct} riskLevel={sub.risk_level}
                label="Overall journey progress" />
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 10,
              paddingTop: 12, borderTop: "1px solid var(--linen-border)", marginBottom: 12 }}>
              {[
                { num: sub.days_in_current_status, label: "Days in status" },
                { num: sub.metrics.avg_first_decision_days ?? "—", label: "Avg first decision" },
                { num: sub.metrics.avg_post_review_decision_days ?? "—", label: "Avg post-review" },
              ].map(({ num, label }) => (
                <div key={label} style={{ textAlign: "center" }}>
                  <div style={{ fontFamily: "var(--font-serif)", fontSize: 18, color: "var(--navy)" }}>{num}</div>
                  <div style={{ fontSize: 10, color: "var(--ink-muted)", textTransform: "uppercase",
                    letterSpacing: "0.05em", marginTop: 2 }}>{label}</div>
                </div>
              ))}
            </div>

            <div className="reco-box" style={{ marginBottom: 12 }}>{sub.recommendation}</div>

            <div style={{ display: "flex", gap: 8 }}>
              <button className="btn-ghost" style={{ fontSize: 11 }}
                onClick={() => onSelectSubmission(sub.submission.id)}>
                View details →
              </button>
              <button className="btn-ghost" style={{ fontSize: 11 }}
                onClick={() => onUpdateStatus(sub)}>
                Update status
              </button>
              <button className="btn-danger" style={{ fontSize: 11, marginLeft: "auto" }}
                onClick={() => { if (confirm("Remove this submission?")) onDelete(sub.submission.id) }}>
                Remove
              </button>
            </div>
          </div>
        )
      })}
    </div>
  )
}
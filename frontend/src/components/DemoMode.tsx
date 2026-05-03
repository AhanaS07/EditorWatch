"use client"
import { useState, useEffect } from "react"
import { getDemoCases } from "@/lib/api"
import { RiskLevel } from "@/lib/types"
import { formatDate } from "@/lib/utils"
import RiskBadge from "./RiskBadge"
import ProgressBar from "./ProgressBar"

export default function DemoMode() {
  const [cases, setCases] = useState<any[]>([])
  const [selected, setSelected] = useState<any | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    getDemoCases().then(data => {
      setCases(data)
      if (data.length > 0) setSelected(data[0])
    }).finally(() => setLoading(false))
  }, [])

  return (
    <div>
      <div className="reco-box" style={{ marginBottom: 20, fontSize: 12 }}>
        These are preloaded scenarios based on real community reports of T&F delays.
        They show how EditorWatch would assess each situation.
      </div>

      {loading && <p style={{ color: "var(--ink-muted)", fontSize: 13 }}>Loading demo cases...</p>}

      <div style={{ display: "grid", gridTemplateColumns: "260px 1fr", gap: 20 }}>
        {/* Case list */}
        <div>
          <span className="section-label">Scenarios</span>
          <div className="card" style={{ padding: "6px 0" }}>
            {cases.map(c => (
              <button key={c.id} onClick={() => setSelected(c)} style={{
                display: "block", width: "100%", textAlign: "left", padding: "10px 16px",
                cursor: "pointer", fontFamily: "var(--font-sans)",
                background: selected?.id === c.id ? "var(--linen)" : "transparent",
                borderLeft: selected?.id === c.id ? "3px solid var(--crimson)" : "3px solid transparent",
                border: "none", transition: "all 0.1s",
              }}>
                <div style={{ fontSize: 12, color: "var(--navy)", fontWeight: 500, marginBottom: 2 }}>
                  {c.journal_name}
                </div>
                <div style={{ fontSize: 11, color: "var(--ink-muted)", marginBottom: 5 }}>
                  {c.current_status}
                </div>
                <RiskBadge level={(c.prediction?.risk_level || c.expected_risk || "medium") as RiskLevel} />
              </button>
            ))}
          </div>
        </div>

        {/* Detail */}
        {selected && (
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 18 }}>
              <div>
                <h2 style={{ fontFamily: "var(--font-serif)", fontSize: 20, color: "var(--navy)", margin: 0 }}>
                  {selected.label}
                </h2>
                <p style={{ fontSize: 12, color: "var(--ink-muted)", margin: "3px 0 0" }}>
                  {selected.journal_name} · Submitted {formatDate(selected.submission_date)}
                </p>
              </div>
              {selected.prediction && <RiskBadge level={selected.prediction.risk_level} />}
            </div>

            {selected.prediction ? (
              <>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 12, marginBottom: 18 }}>
                  {[
                    { num: selected.prediction.days_since_submission, label: "Days since submission" },
                    { num: selected.prediction.avg_first_decision_days, label: "Avg first decision" },
                    { num: selected.prediction.avg_total_days, label: "Estimated total cycle" },
                  ].map(({ num, label }) => (
                    <div key={label} style={{ background: "var(--surface-alt)", border: "1px solid var(--linen-border)",
                      borderRadius: 6, padding: "12px 16px", textAlign: "center" }}>
                      <div style={{ fontFamily: "var(--font-serif)", fontSize: 22, color: "var(--navy)" }}>{num}</div>
                      <div style={{ fontSize: 10, color: "var(--ink-muted)", textTransform: "uppercase",
                        letterSpacing: "0.05em", marginTop: 3 }}>{label}</div>
                    </div>
                  ))}
                </div>
                <div style={{ marginBottom: 16 }}>
                  <ProgressBar pct={selected.prediction.overall_progress_pct}
                    riskLevel={selected.prediction.risk_level} label="Estimated journey progress" />
                </div>
                <div className="reco-box" style={{ marginBottom: 14 }}>{selected.prediction.recommendation}</div>
                <div className="card" style={{ fontSize: 13, color: "var(--ink-mid)", lineHeight: 1.7 }}>
                  <span className="section-label">What "{selected.current_status}" means</span>
                  {selected.prediction.status_explanation}
                </div>
              </>
            ) : (
              <div className="card" style={{ fontSize: 13, color: "var(--ink-muted)" }}>
                Prediction unavailable — seed this journal in the Journal browser first.
              </div>
            )}

            {selected.notes && (
              <p style={{ fontSize: 12, color: "var(--ink-muted)", marginTop: 14,
                fontStyle: "italic", lineHeight: 1.6 }}>
                Community context: {selected.notes}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
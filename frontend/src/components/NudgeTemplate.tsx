"use client"
import { useState } from "react"
import { EM_STATUSES, EMStatus } from "@/lib/types"
import { useChat } from "@/hooks/useChat"
import { copyToClipboard } from "@/lib/utils"

const TONES = [
  { id: "polite", label: "Polite",  desc: "Patient, acknowledges editor workload" },
  { id: "firm",   label: "Firm",    desc: "Professional, cites the journal's own timeline" },
  { id: "urgent", label: "Urgent",  desc: "Clear urgency, requests a specific ETA" },
]

interface Props {
  prefillJournal?: string
  prefillStatus?: EMStatus
  prefillDays?: number
  prefillAvg?: number
}

export default function NudgeTemplate({ prefillJournal, prefillStatus, prefillDays, prefillAvg }: Props) {
  const [form, setForm] = useState({
    journal_name:            prefillJournal || "",
    current_status:          prefillStatus || "With Editor" as EMStatus,
    days_since_submission:   prefillDays || 0,
    avg_first_decision_days: prefillAvg || 0,
    manuscript_title:        "",
    notes:                   "",
  })
  const [tone, setTone] = useState("polite")
  const [copied, setCopied] = useState(false)
  const { response, loading, error, nudge, setResponse } = useChat()

  function handleCopy() {
    copyToClipboard(response)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
      {/* Left — inputs */}
      <div>
        <span className="section-label">Submission context</span>
        <div className="card" style={{ marginBottom: 16 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div>
              <label className="section-label">Journal name</label>
              <input placeholder="e.g. Pain Management" value={form.journal_name}
                onChange={e => setForm({ ...form, journal_name: e.target.value })} />
            </div>
            <div>
              <label className="section-label">Current EM status</label>
              <select value={form.current_status}
                onChange={e => setForm({ ...form, current_status: e.target.value as EMStatus })}>
                {EM_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <div>
                <label className="section-label">Days since submission</label>
                <input type="number" min={0} value={form.days_since_submission || ""}
                  onChange={e => setForm({ ...form, days_since_submission: parseInt(e.target.value) || 0 })} />
              </div>
              <div>
                <label className="section-label">Journal avg (days)</label>
                <input type="number" min={0} value={form.avg_first_decision_days || ""}
                  onChange={e => setForm({ ...form, avg_first_decision_days: parseInt(e.target.value) || 0 })} />
              </div>
            </div>
            <div>
              <label className="section-label">Manuscript title (optional)</label>
              <input placeholder="Title as submitted" value={form.manuscript_title}
                onChange={e => setForm({ ...form, manuscript_title: e.target.value })} />
            </div>
            <div>
              <label className="section-label">Extra context (optional)</label>
              <textarea rows={2} placeholder="e.g. 2 reviewers assigned day 14"
                value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })}
                style={{ resize: "vertical" }} />
            </div>
          </div>
        </div>

        <span className="section-label">Tone</span>
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 16 }}>
          {TONES.map(t => (
            <button key={t.id} onClick={() => setTone(t.id)} style={{
              display: "flex", alignItems: "center", gap: 12, padding: "10px 14px",
              cursor: "pointer", textAlign: "left", fontFamily: "var(--font-sans)",
              background: tone === t.id ? "var(--linen)" : "var(--surface-alt)",
              border: tone === t.id ? "1px solid var(--navy-light)" : "1px solid var(--linen-border)",
              borderLeft: tone === t.id ? "3px solid var(--navy)" : "3px solid transparent",
              borderRadius: 4, transition: "all 0.1s",
            }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 500, color: "var(--navy)" }}>{t.label}</div>
                <div style={{ fontSize: 11, color: "var(--ink-muted)", marginTop: 1 }}>{t.desc}</div>
              </div>
            </button>
          ))}
        </div>

        {error && <p style={{ fontSize: 12, color: "var(--crimson)", marginBottom: 10 }}>{error}</p>}
        <button className="btn-primary" style={{ width: "100%" }} disabled={loading}
          onClick={() => nudge(tone, { ...form, generate_nudge: true, tone })}>
          {loading ? "Generating..." : "Generate email →"}
        </button>
      </div>

      {/* Right — output */}
      <div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
          <span className="section-label" style={{ marginBottom: 0 }}>Generated email</span>
          {response && (
            <button className="btn-ghost" style={{ fontSize: 11 }} onClick={handleCopy}>
              {copied ? "Copied ✓" : "Copy"}
            </button>
          )}
        </div>
        {response ? (
          <textarea
            value={response}
            onChange={e => setResponse(e.target.value)}
            style={{ width: "100%", minHeight: 380, resize: "vertical",
              fontFamily: "var(--font-serif)", fontSize: 13, lineHeight: 1.7,
              color: "var(--ink)", background: "var(--surface-alt)",
              border: "1px solid var(--linen-border)", borderRadius: 6, padding: "14px 16px" }}
          />
        ) : (
          <div className="card" style={{ minHeight: 380, display: "flex", alignItems: "center",
            justifyContent: "center", color: "var(--ink-muted)", fontSize: 13 }}>
            Fill in context and generate
          </div>
        )}
        {response && (
          <p style={{ fontSize: 11, color: "var(--ink-muted)", marginTop: 8, lineHeight: 1.5 }}>
            Edit above — add your name, EM reference number, and any personal detail before sending.
          </p>
        )}
      </div>
    </div>
  )
}
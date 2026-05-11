"use client"
import { useState } from "react"
import { EM_STATUSES, EMStatus, CreateSubmissionPayload } from "@/lib/types"
import { today } from "@/lib/utils"

interface Props { onSubmit: (p: CreateSubmissionPayload) => Promise<void> }

export default function SubmissionForm({ onSubmit }: Props) {
  const [form, setForm] = useState({
    journal_name: "", journal_slug: "", submission_date: "",
    initial_status: "" as EMStatus | "",
    manuscript_title: "", notes: "",
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [success, setSuccess] = useState(false)

  async function handle(e: React.FormEvent) {
    e.preventDefault()
    if (!form.journal_name || !form.journal_slug || !form.submission_date || !form.initial_status) {
      setError("Journal name, slug, submission date, and EM status are all required."); return
    }
    setLoading(true); setError("")
    try {
      await onSubmit({
        journal_name:     form.journal_name,
        journal_slug:     form.journal_slug.toLowerCase().trim(),
        submission_date:  form.submission_date,
        initial_status:   form.initial_status,
        manuscript_title: form.manuscript_title || undefined,
        notes:            form.notes || undefined,
      })
      setForm({ journal_name: "", journal_slug: "", submission_date: "",
        initial_status: "", manuscript_title: "", notes: "" })
      setSuccess(true)
      setTimeout(() => setSuccess(false), 3000)
    } catch (e: any) { setError(e.message) }
    finally { setLoading(false) }
  }

  return (
    <form className="card" onSubmit={handle}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 14 }}>
        <div>
          <label className="section-label">Journal name</label>
          <input placeholder="e.g. Pain Management" value={form.journal_name}
            onChange={e => setForm({ ...form, journal_name: e.target.value })} />
        </div>
        <div>
          <label className="section-label">Journal slug</label>
          <input placeholder="e.g. ipmt20" value={form.journal_slug}
            onChange={e => setForm({ ...form, journal_slug: e.target.value })} />
          <p style={{ fontSize: 10, color: "var(--ink-muted)", marginTop: 3 }}>
            From tandfonline.com/journals/<strong>slug</strong>/about-this-journal
          </p>
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 14 }}>
        <div>
          <label className="section-label">Submission date</label>
          <input type="date" value={form.submission_date}
            onChange={e => setForm({ ...form, submission_date: e.target.value })} />
        </div>
        <div>
          <label className="section-label">Current EM status</label>
          <select value={form.initial_status}
            onChange={e => setForm({ ...form, initial_status: e.target.value as EMStatus })}>
            <option value="" disabled>Select a status…</option>
            {EM_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
      </div>
      <div style={{ marginBottom: 14 }}>
        <label className="section-label">Manuscript title (optional)</label>
        <input placeholder="Full title as submitted" value={form.manuscript_title}
          onChange={e => setForm({ ...form, manuscript_title: e.target.value })} />
      </div>
      <div style={{ marginBottom: 18 }}>
        <label className="section-label">Notes (optional)</label>
        <textarea rows={2} placeholder="e.g. 2 reviewers assigned, special issue"
          value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })}
          style={{ resize: "vertical" }} />
      </div>
      {error && (
        <div style={{
          fontSize: 13, color: "#7B1D1D", background: "#FEF2F2",
          border: "1px solid #FECACA", borderRadius: 6,
          padding: "10px 14px", marginBottom: 12,
          display: "flex", alignItems: "flex-start", gap: 8,
        }}>
          <span style={{ flexShrink: 0, fontWeight: 700 }}>✕</span>
          <span>{error}</span>
        </div>
      )}
      {success && (
        <div style={{
          fontSize: 13, color: "#14532D", background: "#F0FDF4",
          border: "1px solid #BBF7D0", borderRadius: 6,
          padding: "10px 14px", marginBottom: 12,
          display: "flex", alignItems: "center", gap: 8,
        }}>
          <span style={{ flexShrink: 0, fontWeight: 700 }}>✓</span>
          <span>Submission tracked successfully.</span>
        </div>
      )}
      <button type="submit" className="btn-primary" disabled={loading}>
        {loading ? "Checking..." : "Track this submission →"}
      </button>
    </form>
  )
}
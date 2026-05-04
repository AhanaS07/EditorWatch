"use client"
import { useState, useEffect } from "react"
import { EM_STATUSES, EMStatus } from "@/lib/types"
import { STATUS_GLOSSARY } from "@/lib/statusGlossary"
import { useChat } from "@/hooks/useChat"

export default function StatusDecoder() {
  const [selected, setSelected] = useState<EMStatus>("With Editor")
  const [question, setQuestion] = useState("")
  const { response, loading, error, ask, setResponse } = useChat()
  const gloss = STATUS_GLOSSARY[selected]

  // Reset chat state whenever the selected status changes
  useEffect(() => {
    setQuestion("")
    setResponse("")
  }, [selected])

  function handleAsk() {
    if (!question.trim()) return
    ask(question, {
      current_status: selected,
      status_glossary: {
        meaning: gloss?.meaning,
        typical: gloss?.typical,
      }
    })
  }

  return (
    <div style={{ display: "grid", gridTemplateColumns: "220px 1fr", gap: 20 }}>
      {/* Status list */}
      <div>
        <span className="section-label">EM statuses</span>
        <div className="card" style={{ padding: "6px 0" }}>
          {EM_STATUSES.map(s => (
            <button key={s} onClick={() => setSelected(s)} style={{
              display: "block", width: "100%", textAlign: "left",
              padding: "9px 16px", fontSize: 12, cursor: "pointer",
              background: selected === s ? "var(--linen)" : "transparent",
              borderTop: "none", borderRight: "none", borderBottom: "none",
              borderLeft: selected === s ? "3px solid var(--crimson)" : "3px solid transparent",
              color: selected === s ? "var(--navy)" : "var(--ink-mid)",
              fontFamily: "var(--font-sans)", transition: "all 0.1s",
            }}>
              {s}
            </button>
          ))}
        </div>
      </div>

      {/* Detail */}
      <div>
        <h2 style={{ fontFamily: "var(--font-serif)", fontSize: 22, color: "var(--navy)", marginBottom: 16 }}>
          {selected}
        </h2>
        {gloss && (
          <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 24 }}>
            {[
              { label: "What it means",    text: gloss.meaning },
              { label: "Typical duration", text: gloss.typical },
              { label: "Community insight",text: gloss.forum },
            ].map(({ label, text }) => (
              <div key={label} className="card">
                <span className="section-label">{label}</span>
                <p style={{ fontSize: 13, color: "var(--ink-mid)", lineHeight: 1.65, margin: 0 }}>{text}</p>
              </div>
            ))}
          </div>
        )}

        <span className="section-label">Ask the AI advisor</span>
        <div className="card">
          <p style={{ fontSize: 12, color: "var(--ink-muted)", marginBottom: 12, lineHeight: 1.5 }}>
            Ask specifically about <strong style={{ color: "var(--navy)" }}>{selected}</strong> — what happens in this stage, whether your wait is normal, what to do next.
          </p>
          <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
            <input
              placeholder={placeholderFor(selected)}
              value={question}
              onChange={e => setQuestion(e.target.value)}
              onKeyDown={e => e.key === "Enter" && handleAsk()}
              style={{ flex: 1 }}
            />
            <button className="btn-primary" disabled={loading} onClick={handleAsk}>
              {loading ? "..." : "Ask"}
            </button>
          </div>
          {error && <p style={{ fontSize: 12, color: "var(--crimson)" }}>{error}</p>}
          {response && (
            <div style={{ fontSize: 13, color: "var(--ink-mid)", lineHeight: 1.7,
              borderTop: "1px solid var(--linen-border)", paddingTop: 14, whiteSpace: "pre-wrap" }}>
              {response}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function placeholderFor(status: EMStatus): string {
  const map: Partial<Record<EMStatus, string>> = {
    "With Editor":               "e.g. It's been 45 days With Editor — is this normal?",
    "Under Review":              "e.g. One reviewer submitted but the other hasn't — what happens now?",
    "Required Reviews Complete": "e.g. Reviews complete 2 weeks ago, still no decision — normal?",
    "Decision in Process":       "e.g. Been in Decision in Process for 10 days — what is the editor doing?",
    "Minor Revision":            "e.g. Got minor revisions — will it go back to reviewers?",
    "Major Revision":            "e.g. Major revision — how different is the second review round?",
    "Revision Submitted":        "e.g. Submitted revision 3 weeks ago, no status change — normal?",
    "Submitted to Journal":      "e.g. Still Submitted to Journal after 10 days — should I worry?",
  }
  return map[status] ?? `e.g. Ask anything about the "${status}" stage`
}
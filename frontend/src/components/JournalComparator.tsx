"use client"
import { useState, useEffect } from "react"
import { JournalMetrics } from "@/lib/types"
import { listJournals, getCacheStatus, searchJournals, updateJournalMetrics, getJournal } from "@/lib/api"

export default function JournalComparator() {
  const [journals, setJournals] = useState<JournalMetrics[]>([])
  const [cacheStatus, setCacheStatus] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")
  const [searchResults, setSearchResults] = useState<any[]>([])
  const [searching, setSearching] = useState(false)

  const [seedSlug, setSeedSlug] = useState("")
  const [slugStatus, setSlugStatus] = useState<"unknown" | "exists" | "new">("unknown")
  const [seedForm, setSeedForm] = useState({
    name: "", avg_first_decision_days: "",
    avg_post_review_decision_days: "", acceptance_rate: "", notes: "",
  })
  const [seeding, setSeeding] = useState(false)
  const [seedMsg, setSeedMsg] = useState("")
  const [seedMsgType, setSeedMsgType] = useState<"success" | "error">("success")

  async function load() {
    try {
      const [j, cs] = await Promise.all([listJournals(), getCacheStatus()])
      setJournals(j); setCacheStatus(cs)
    } finally { setLoading(false) }
  }

  useEffect(() => { load() }, [])

  // Check if slug already exists in cache when user finishes typing
  useEffect(() => {
    if (!seedSlug || seedSlug.length < 3) { setSlugStatus("unknown"); return }
    const timer = setTimeout(async () => {
      try {
        const existing = await getJournal(seedSlug)
        // Journal exists — pre-fill form with current values
        setSeedForm({
          name: existing.name || "",
          avg_first_decision_days:       String(existing.avg_first_decision_days ?? ""),
          avg_post_review_decision_days: String(existing.avg_post_review_decision_days ?? ""),
          acceptance_rate:               existing.acceptance_rate ? String(existing.acceptance_rate) : "",
          notes: "",
        })
        setSlugStatus("exists")
      } catch {
        // 404 or 422 (needs seed) — it's a new entry
        setSlugStatus("new")
      }
    }, 600)
    return () => clearTimeout(timer)
  }, [seedSlug])

  async function handleSearch() {
    if (search.length < 2) return
    setSearching(true); setSearchResults([])
    try { setSearchResults((await searchJournals(search)).results || []) }
    finally { setSearching(false) }
  }

  function prefillFromSearch(result: any) {
    // Pre-fill the seed form name from a Crossref search result
    setSeedForm(f => ({ ...f, name: result.title || "" }))
    setSeedMsg("Journal name pre-filled. Enter the slug and metrics from the T&F page.")
    setSeedMsgType("success")
  }

  function validateSeedForm(): string | null {
    if (!seedSlug.trim()) return "Journal slug is required."
    if (!seedForm.name.trim()) return "Journal name is required."
    const fd = parseInt(seedForm.avg_first_decision_days)
    const pr = parseInt(seedForm.avg_post_review_decision_days)
    if (isNaN(fd) || fd <= 0) return "First decision days must be a positive number."
    if (isNaN(pr) || pr <= 0) return "Post-review days must be a positive number."
    if (fd >= pr) return `First decision (${fd}d) should be less than post-review (${pr}d) — first-decision includes fast desk rejects.`
    if (seedForm.acceptance_rate) {
      const ar = parseFloat(seedForm.acceptance_rate)
      if (isNaN(ar) || ar <= 0) return "Acceptance rate must be greater than 0 (e.g. 0.23 for 23%)."
      if (ar >= 1) return "Acceptance rate must be less than 1.0 — no real journal accepts 100% of submissions."
    }
    return null
  }

  async function handleSeed(e: React.FormEvent) {
    e.preventDefault()
    const validationError = validateSeedForm()
    if (validationError) { setSeedMsg(validationError); setSeedMsgType("error"); return }

    setSeeding(true); setSeedMsg("")
    try {
      await updateJournalMetrics(seedSlug.trim().toLowerCase(), {
        name: seedForm.name.trim(),
        avg_first_decision_days:       parseInt(seedForm.avg_first_decision_days),
        avg_post_review_decision_days: parseInt(seedForm.avg_post_review_decision_days),
        acceptance_rate: seedForm.acceptance_rate ? parseFloat(seedForm.acceptance_rate) : undefined,
        notes: seedForm.notes || undefined,
      })
      const action = slugStatus === "exists" ? "updated" : "saved"
      setSeedMsg(`✓ ${seedForm.name} ${action} successfully.`)
      setSeedMsgType("success")
      setSeedSlug("")
      setSlugStatus("unknown")
      setSeedForm({ name: "", avg_first_decision_days: "", avg_post_review_decision_days: "", acceptance_rate: "", notes: "" })
      load()
    } catch (e: any) {
      setSeedMsg(`Error: ${e.message}`)
      setSeedMsgType("error")
    } finally { setSeeding(false) }
  }

  const summary = cacheStatus?.summary || {}

  return (
    <div>
      {/* Summary */}
      {summary.total && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 12, marginBottom: 24 }}>
          {[
            { label: "Total journals", val: summary.total, color: "var(--navy)" },
            { label: "Seeded (fresh)",  val: summary.fresh || 0, color: "#3B6D11" },
            { label: "Seeded (ok)",     val: summary.ok || 0, color: "#854F0B" },
            { label: "Need seeding",    val: summary.never_seeded || 0, color: "var(--crimson)" },
          ].map(({ label, val, color }) => (
            <div key={label} style={{ background: "var(--surface-alt)", border: "1px solid var(--linen-border)",
              borderRadius: 6, padding: "12px 16px" }}>
              <span className="section-label">{label}</span>
              <div style={{ fontFamily: "var(--font-serif)", fontSize: 20, color }}>{val}</div>
            </div>
          ))}
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
        {/* Seeded journals list */}
        <div>
          <span className="section-label">Seeded journals ({journals.length})</span>
          {loading ? (
            <p style={{ color: "var(--ink-muted)", fontSize: 13 }}>Loading...</p>
          ) : journals.length === 0 ? (
            <div className="card" style={{ fontSize: 13, color: "var(--ink-muted)" }}>
              No journals seeded yet. Use the form on the right.
            </div>
          ) : (
            <div className="card" style={{ padding: 0, overflow: "hidden", maxHeight: 480, overflowY: "auto" }}>
              {journals.map((j, i) => (
                <div key={j.slug}
                  onClick={() => { setSeedSlug(j.slug) }}
                  style={{ padding: "11px 16px", cursor: "pointer",
                    borderBottom: i < journals.length - 1 ? "1px solid var(--linen-border)" : "none",
                    transition: "background 0.1s" }}
                  onMouseEnter={e => (e.currentTarget.style.background = "var(--linen)")}
                  onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                    <div style={{ fontSize: 13, fontFamily: "var(--font-serif)", color: "var(--navy)" }}>{j.name}</div>
                    {j.acceptance_rate && (
                      <span style={{ fontSize: 11, color: "var(--ink-muted)", flexShrink: 0, marginLeft: 8 }}>
                        {Math.round(j.acceptance_rate * 100)}% accept
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: 11, color: "var(--ink-muted)", marginTop: 2 }}>
                    {j.slug} · first: {j.avg_first_decision_days ?? "—"}d · post-review: {j.avg_post_review_decision_days ?? "—"}d
                  </div>
                </div>
              ))}
            </div>
          )}
          <p style={{ fontSize: 11, color: "var(--ink-muted)", marginTop: 8 }}>
            Click any journal to load it into the edit form →
          </p>
        </div>

        {/* Right column */}
        <div>
          {/* Seed / edit form */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <span className="section-label" style={{ margin: 0 }}>
              {slugStatus === "exists" ? "Edit existing journal" : "Seed a new journal"}
            </span>
            {slugStatus === "exists" && (
              <span style={{ fontSize: 11, background: "#FEF3E2", color: "#854F0B",
                border: "1px solid #EF9F27", borderRadius: 4, padding: "2px 8px" }}>
                Updating existing entry
              </span>
            )}
            {slugStatus === "new" && (
              <span style={{ fontSize: 11, background: "#EAF3DE", color: "#3B6D11",
                border: "1px solid #97C459", borderRadius: 4, padding: "2px 8px" }}>
                New journal
              </span>
            )}
          </div>

          <form className="card" style={{ marginBottom: 16 }} onSubmit={handleSeed}>
            <p style={{ fontSize: 12, color: "var(--ink-muted)", marginBottom: 14, lineHeight: 1.6 }}>
              Open the T&F metrics page, read the numbers, enter them here.
              Submitting an existing slug will update it in place.
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 11 }}>
              <div>
                <label className="section-label">Journal slug *</label>
                <input placeholder="e.g. ipmt20" value={seedSlug}
                  onChange={e => { setSeedSlug(e.target.value.toLowerCase().trim()); setSeedMsg("") }} />
                {seedSlug && (
                  <p style={{ fontSize: 10, marginTop: 3 }}>
                    <a href={`https://www.tandfonline.com/journals/${seedSlug}/about-this-journal`}
                      target="_blank" rel="noopener noreferrer" style={{ color: "var(--navy-light)" }}>
                      Open T&F metrics page →
                    </a>
                  </p>
                )}
              </div>
              <div>
                <label className="section-label">Journal name *</label>
                <input placeholder="Full journal name" value={seedForm.name}
                  onChange={e => setSeedForm({ ...seedForm, name: e.target.value })} />
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <div>
                  <label className="section-label">First decision (days) *</label>
                  <input type="number" min={1} placeholder="incl. desk rejects"
                    value={seedForm.avg_first_decision_days}
                    onChange={e => setSeedForm({ ...seedForm, avg_first_decision_days: e.target.value })} />
                  <p style={{ fontSize: 10, color: "var(--ink-muted)", marginTop: 2 }}>
                    "From submission to first decision"
                  </p>
                </div>
                <div>
                  <label className="section-label">Post-review (days) *</label>
                  <input type="number" min={1} placeholder="excl. desk rejects"
                    value={seedForm.avg_post_review_decision_days}
                    onChange={e => setSeedForm({ ...seedForm, avg_post_review_decision_days: e.target.value })} />
                  <p style={{ fontSize: 10, color: "var(--ink-muted)", marginTop: 2 }}>
                    "From submission to first post-review decision"
                  </p>
                </div>
              </div>
              <div>
                <label className="section-label">Acceptance rate (optional — e.g. 0.23 for 23%)</label>
                <input type="number" step="0.01" min="0.01" max="1"
                  placeholder="e.g. 0.18"
                  value={seedForm.acceptance_rate}
                  onChange={e => setSeedForm({ ...seedForm, acceptance_rate: e.target.value })} />
              </div>
            </div>
            {seedMsg && (
              <div style={{
                fontSize: 13, marginTop: 12, lineHeight: 1.5,
                padding: "10px 14px", borderRadius: 6,
                display: "flex", alignItems: "flex-start", gap: 8,
                ...(seedMsgType === "success"
                  ? { color: "#14532D", background: "#F0FDF4", border: "1px solid #BBF7D0" }
                  : { color: "#7B1D1D", background: "#FEF2F2", border: "1px solid #FECACA" }),
              }}>
                <span style={{ flexShrink: 0, fontWeight: 700 }}>
                  {seedMsgType === "success" ? "✓" : "✕"}
                </span>
                <span>{seedMsg}</span>
              </div>
            )}
            <button type="submit" className="btn-primary" disabled={seeding} style={{ width: "100%", marginTop: 14 }}>
              {seeding ? "Saving..." : slugStatus === "exists" ? "Update journal metrics" : "Save journal metrics"}
            </button>
          </form>

          {/* Crossref search */}
          <span className="section-label">Find a journal via Crossref</span>
          <div className="card">
            <p style={{ fontSize: 12, color: "var(--ink-muted)", marginBottom: 12, lineHeight: 1.6 }}>
              Search by journal name to confirm it's a T&F journal. Crossref gives you the ISSN —
              use the link below each result to open the journal on tandfonline.com,
              where the <strong style={{ color: "var(--navy)" }}>slug appears in the URL</strong>{" "}
              (e.g. <code style={{ fontSize: 11 }}>tandfonline.com/journals/<strong>ipmt20</strong></code>).
            </p>
            <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
              <input placeholder="e.g. Annals of Medicine, Eating Disorders..."
                value={search} onChange={e => setSearch(e.target.value)}
                onKeyDown={e => e.key === "Enter" && handleSearch()} style={{ flex: 1 }} />
              <button className="btn-primary" onClick={handleSearch} disabled={searching}>
                {searching ? "..." : "Search"}
              </button>
            </div>
            {searchResults.map((r, i) => {
              // Build a direct T&F search link using the ISSN — takes user
              // straight to the journal page where slug is visible in the URL
              const issn = r.issn?.[0] || ""
              const tfBrowseUrl = issn
                ? `https://www.tandfonline.com/action/doSearch?AllField=${encodeURIComponent(issn)}`
                : `https://www.tandfonline.com/action/doSearch?AllField=${encodeURIComponent(r.title)}`

              return (
                <div key={i} style={{ fontSize: 12, padding: "12px 0",
                  borderTop: i > 0 ? "1px solid var(--linen-border)" : "none" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 500, color: "var(--navy)", marginBottom: 3, fontSize: 13 }}>{r.title}</div>
                      <div style={{ color: "var(--ink-muted)", marginBottom: 4 }}>
                        ISSN: <strong>{r.issn?.join(", ") || "—"}</strong> · {r.publisher}
                      </div>
                      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                        <a href={tfBrowseUrl} target="_blank" rel="noopener noreferrer"
                          style={{ fontSize: 11, color: "var(--navy-light)", textDecoration: "underline" }}>
                          Find on tandfonline.com → (slug is in the URL)
                        </a>
                      </div>
                      <div style={{ marginTop: 6, padding: "6px 10px",
                        background: "var(--linen)", borderRadius: 4, fontSize: 11, color: "var(--ink-mid)" }}>
                        <strong>How to get the slug:</strong> Click the link above → find your journal in the T&F search results →
                        click through to the journal page → look at the URL and copy the short code after /journals/, 
                        e.g. <code>tandfonline.com/journals/<strong style={{ color: "var(--crimson)" }}>ipmt20</strong></code> → paste that code into the slug field in the seed form above
                      </div>
                    </div>
                    <button
                      className="btn-ghost"
                      style={{ fontSize: 11, flexShrink: 0 }}
                      onClick={() => prefillFromSearch(r)}
                    >
                      Use name →
                    </button>
                  </div>
                </div>
              )
            })}
            {!searching && search.length > 1 && searchResults.length === 0 && (
              <p style={{ fontSize: 12, color: "var(--ink-muted)" }}>
                No T&F results found. Try searching directly on{" "}
                <a href={`https://www.tandfonline.com/action/doSearch?AllField=${encodeURIComponent(search)}`}
                  target="_blank" rel="noopener noreferrer" style={{ color: "var(--navy-light)" }}>
                  tandfonline.com
                </a>.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
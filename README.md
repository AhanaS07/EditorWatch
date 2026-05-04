# EditorWatch

**Predictive peer review delay tracker for Taylor & Francis authors.**

EditorWatch helps academic authors track submission progress, decode Editorial Manager (EM) statuses, assess delay risk, and generate professional inquiry emails — without any live access to Editorial Manager.

> ⚠️ Estimates only. Not affiliated with Taylor & Francis.

---

## What it does

Authors submit to Taylor & Francis journals and often wait months with no clear sense of whether their paper is progressing normally or is genuinely stalled. T&F's Editorial Manager shows status labels ("With Editor", "Under Review") but gives no timing context.

EditorWatch provides:

- **Delay prediction** — compares days waited against the journal's own published averages, split correctly between "first decision" (includes fast desk rejects) and "post-review decision" (the real peer review wait)
- **Risk scoring** — low / medium / high / severe, calibrated per-journal and per-stage
- **Status decoder** — explains what each EM stage actually means, who is involved (HE, AE, EIC), and what typical durations look like
- **Timeline tracking** — authors log status updates as they receive them; risk recalculates automatically
- **AI advisor** — Groq Llama 3.1 answers stage-specific questions with precise, non-generic answers
- **Nudge email generator** — three structurally distinct tones (polite / firm / urgent) with AI-generated, stage-appropriate language
- **Journal browser** — 49 pre-seeded T&F journals; seed new ones directly from the UI
- **Demo mode** — 5 realistic scenarios from community reports of real T&F delays

---

## Architecture

```
EditorWatch/
├── backend/          FastAPI (Python 3.11)
│   ├── routers/      submissions, predict, chat, journals, scrape, demo
│   ├── services/     predictor, scraper, groq_client, submission_store, scheduler
│   ├── models/       Pydantic schemas
│   ├── data/         journals_cache.json, demo_cases.json
│   └── seed_journals.py
└── frontend/         Next.js 14 (single-page, App Router)
    └── src/
        ├── app/      page.tsx (full SPA), layout.tsx, globals.css
        ├── components/
        ├── hooks/
        └── lib/      api.ts, types.ts, utils.ts, statusGlossary.ts
```

**Backend:** FastAPI + Pydantic, JSON file store for submissions, APScheduler for staleness monitoring, Groq SDK for LLM calls.

**Frontend:** Next.js 14 single-page app — all navigation via `view` state, no separate route folders. Deployed on Vercel.

**Data:** T&F blocks automated scraping (Cloudflare). Journal metrics are manually seeded from public T&F pages every 6 months, matching T&F's own update cadence. Crossref API provides journal discovery and validation.

---

## Setup

### Prerequisites

- Python 3.11+
- Node.js 18+
- A [Groq API key](https://console.groq.com) (free tier is sufficient)

### Backend

```bash
cd backend

# Create and activate virtual environment
python -m venv venv
source venv/bin/activate        # Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Configure environment
cp .env.example .env
# Edit .env and add your GROQ_API_KEY

# Start the server
uvicorn main:app --reload --port 8000
```

API docs available at `http://localhost:8000/docs`

### Frontend

```bash
cd frontend

# Install dependencies
npm install

# Configure environment
cp .env.local.example .env.local
# NEXT_PUBLIC_API_URL=http://localhost:8000 is set by default

# Start the dev server
npm run dev
```

App available at `http://localhost:3000`

---

## Seeding journal data

T&F publishes timing metrics at:
```
https://www.tandfonline.com/journals/{slug}/about-this-journal
```

The three values you need from the "Journal metrics" tab:

| T&F label | Field | Notes |
|---|---|---|
| From submission to first decision | `avg_first_decision_days` | Includes desk rejects — fast but misleading |
| From submission to first post-review decision | `avg_post_review_decision_days` | Excludes desk rejects — the real peer review wait |
| Acceptance rate | `acceptance_rate` | Enter as decimal e.g. `0.23` for 23% |

**Option A — Bulk seed via script** (recommended for initial setup):

```bash
cd backend
# Open seed_journals.py, fill in the numbers for each journal, then:
python seed_journals.py
```

**Option B — Seed via the app** (for adding individual journals):

Go to **Journal browser → Seed a journal** in the UI. Enter the slug, open the T&F link that appears, copy the three numbers, save. Takes effect immediately with no restart.

The 49 journals in `data/journals_cache.json` are pre-seeded with estimated values. Replace with real T&F numbers for production accuracy.

---

## API reference

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/submissions` | Create a tracked submission |
| `GET` | `/submissions` | List all tracked submissions |
| `GET` | `/submissions/{id}` | Get submission with fresh prediction |
| `PATCH` | `/submissions/{id}/status` | Log a status update (timeline append) |
| `DELETE` | `/submissions/{id}` | Remove a submission |
| `POST` | `/predict` | One-shot prediction (no record stored) |
| `GET` | `/journals` | List seeded journals |
| `GET` | `/journals/cache-status` | Cache freshness report |
| `GET` | `/journals/search?q=` | Search Crossref for T&F journals |
| `POST` | `/journals/{slug}/update` | Seed or update journal metrics |
| `POST` | `/chat` | AI status decoder Q&A |
| `POST` | `/chat/nudge` | Generate tone-differentiated inquiry email |
| `GET` | `/demo` | Preloaded delay scenarios |
| `GET` | `/health` | Server health + scheduler status |

---

## Prediction logic

Risk scoring compares `days_in_current_status` against a per-journal, per-stage overdue threshold:

| Status | Overdue threshold |
|---|---|
| Submitted to Journal | 14 days |
| With Editor | `avg_first_decision_days × 2.5` (min 35d) |
| Under Review | `avg_post_review_decision_days × 0.9` (min 50d) |
| Required Reviews Complete | 21 days |
| Decision in Process | 14 days |
| Revision Submitted | 42 days |

Risk levels: `low` (ratio < 0.6) → `medium` (0.6–1.0) → `high` (1.0–2.0) → `severe` (2.0+)

The "With Editor" threshold uses `2.5×` the journal's stated first-decision average because that average includes fast desk rejections, making it artificially low. Papers surviving desk review realistically wait 2–3× the published figure in reviewer invitation.

---

## Deployment

**Backend — Render:**

```yaml
# render.yaml
services:
  - type: web
    name: editorwatch-api
    env: python
    buildCommand: pip install -r requirements.txt
    startCommand: uvicorn main:app --host 0.0.0.0 --port 8000
    envVars:
      - key: GROQ_API_KEY
        sync: false
```

**Frontend — Vercel:**

Push to GitHub and connect to Vercel. Set `NEXT_PUBLIC_API_URL` to your Render URL in Vercel's environment variables.

---

## Data & privacy

- Submission records are stored in `backend/data/submissions.json` (local JSON, never committed to git)
- No user accounts or authentication — submissions are device-local
- Journal metrics come from publicly accessible T&F pages
- Groq processes chat messages; no submission data is sent to Groq unless explicitly included in a chat context

---

## Built for

Taylor & Francis Open Innovation Challenge — PS3: Author Experience  
4-day hackathon build · May 2026

---

## Disclaimer

EditorWatch provides estimates based on publicly available journal metrics and community-reported data. It has no live access to Editorial Manager or any Taylor & Francis system. Predictions may be inaccurate. Not affiliated with, endorsed by, or connected to Taylor & Francis Group in any way.
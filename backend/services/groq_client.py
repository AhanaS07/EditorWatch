"""
groq_client.py
Wraps the Groq API (Llama 3.1-8B-Instant) for two uses:
  1. Status decoder / Q&A chat
  2. Tone-differentiated nudge email generation
"""

import os
import logging
from typing import Optional

logger = logging.getLogger(__name__)

GROQ_API_KEY = os.getenv("GROQ_API_KEY", "")
MODEL        = "llama-3.1-8b-instant"


# ---------------------------------------------------------------------------
# System prompt — stage-specific peer review knowledge
# ---------------------------------------------------------------------------

SYSTEM_PROMPT = """You are EditorWatch — a precise academic peer review advisor specialising in 
Taylor & Francis (T&F) Editorial Manager (EM) workflows.

Your answers must be SPECIFIC to the exact EM status being asked about. Do not give generic 
overviews. Address the specific stage the author is in.

WHAT EACH STATUS ACTUALLY MEANS:

Submitted to Journal:
  - System-level receipt only. No human has seen the paper yet.
  - A Handling Editor (HE) is being assigned. Takes 1–14 days.
  - If >14 days: check the submission did not get stuck in a technical check.

With Editor:
  - The HE has the paper. Two sub-phases that look identical in EM:
    1. Desk review (days 1–21): HE decides if paper is in scope / quality threshold
    2. Reviewer invitation (day 7 onward): HE sends invites, waits for acceptances
  - T&F's published average INCLUDES fast desk rejects — misleadingly low.
  - Papers that pass desk review realistically wait 30–90 days With Editor.
  - Beyond 30 days = reviewer hunting. Beyond 60 days = inquiry is reasonable.
  - Beyond 90 days = serious delay, firm inquiry warranted.

Under Review:
  - At least one reviewer has ACCEPTED. They are reading and writing their report.
  - T&F officially gives reviewers 30 days. With extensions: 6–10 weeks is normal.
  - One late reviewer holds the entire process.
  - Status shows Under Review until ALL reviewers submit — not just the first.
  - At 70+ days: a polite inquiry is fine.

Required Reviews Complete:
  - ALL reviewer reports are in. The Associate Editor (AE) is synthesising them.
  - AE writes a recommendation to the Editor-in-Chief (EIC). Takes 7–21 days.
  - Not the EIC's decision yet — the AE recommendation stage.
  - If >21 days: a brief inquiry to the editorial office is fine.

Decision in Process:
  - The EIC has the AE recommendation and is writing the decision letter.
  - Usually 3–14 days — the SHORTEST stage. Decision effectively exists at AE level.
  - EIC may follow recommendation, override it (rare), or seek a third review (very rare).
  - Decision in Process for >14 days is unusual but not alarming — some EICs batch weekly.

Minor Revision:
  - Effectively a conditional accept. Paper will almost certainly be published.
  - Usually goes ONLY to the HE — not back to original reviewers.
  - Author typically has 30–60 days. Second decision: 2–4 weeks.

Major Revision:
  - Not a rejection. Will go back to original reviewers.
  - Author typically has 60–90 days. Second review: 4–8 weeks.
  - Response letter is as important as the revision itself.

Revision Submitted:
  - Back with HE (minor) or HE + reviewers (major).
  - Minor: 2–4 weeks. Major: 4–8 weeks.
  - System may briefly flip to With Editor between statuses — normal.

Rules:
- BE SPECIFIC to the exact status. Name the actual people involved (HE, AE, EIC).
- When asked about timing: give concrete numbers with ranges.
- When asked if a wait is normal: answer YES or NO clearly, then explain.
- When asked what to do: give a clear action.
- Be empathetic but direct. Authors need clear answers, not hedging.
- Answers: 3–6 sentences unless a detailed explanation is genuinely needed."""


# ---------------------------------------------------------------------------
# Tone briefs for nudge email generation
# ---------------------------------------------------------------------------

NUDGE_TONE_BRIEFS = {
    "polite": {
        "label": "Polite",
        "structure": """
STRUCTURE — follow exactly:
1. One sentence stating you are writing about your submission.
2. One sentence with submission date and current status. One sentence noting the journal's published average as context (not as a complaint).
3. One sentence asking for a brief update at their convenience.
4. One sentence of thanks. Sign off "Kind regards".

VOCABULARY TO USE: "kindly enquire", "at your earliest convenience", "any update you are able to provide"
VOCABULARY TO AVOID: "concerned", "worried", "urgently", "disappointed", "unacceptable", "seems long"
LENGTH: 60–80 words in the body. Understated and collegial.
SUBJECT LINE: Neutral — e.g. "Status enquiry — [Journal name]"
""",
    },
    "firm": {
        "label": "Firm",
        "structure": """
STRUCTURE — follow exactly:
1. State the purpose directly. "I am writing to request a formal update on..."
2. State submission date, days elapsed, and the journal's published average explicitly. Include: "This exceeds the journal's published average of X days by Y days."
3. Ask for a specific response by a specific timeframe: "I would appreciate a response within 10 working days."
4. Neutral close — no thanks for their workload. "I look forward to your response."

VOCABULARY TO USE: "formal update", "exceeds", "published timeline", "I would appreciate a response within", "I look forward to"
VOCABULARY TO AVOID: "kindly", "at your convenience", "understand you are busy", "I hope"
LENGTH: 80–100 words. Confident. A professional asserting a reasonable expectation.
SUBJECT LINE: Specific and formal — e.g. "Formal status request — [title] submitted [X] days ago"
""",
    },
    "urgent": {
        "label": "Urgent",
        "structure": """
STRUCTURE — follow exactly:
1. State the situation bluntly: "I am writing regarding the significant delay in the review of my manuscript..."
2. State submission date, days elapsed vs average. State how many times the average has been exceeded: "This is now X times the journal's stated average of Y days." If notes mention a deadline or impact, include it; otherwise write "The extended timeline is materially affecting my research planning."
3. Give a clear professional ultimatum: "I require a response within 5 working days. If I do not receive an update, I will consider withdrawing the manuscript for submission elsewhere."
4. Close without warmth: "I hope this can be resolved promptly."

VOCABULARY TO USE: "significant delay", "I require", "I will consider withdrawing", "materially affecting", "resolved promptly"
VOCABULARY TO AVOID: "kindly", "understand you are busy", "at your convenience", "appreciate your hard work"
LENGTH: 90–110 words. Assertive. A professional who has exhausted patience and is stating consequences.
SUBJECT LINE: Urgent and direct — e.g. "Urgent: [X] days without decision — [Journal name]"
""",
    },
}


# ---------------------------------------------------------------------------
# Client loader
# ---------------------------------------------------------------------------

def _get_client():
    try:
        from groq import Groq
        if not GROQ_API_KEY:
            raise ValueError("GROQ_API_KEY not set in environment")
        return Groq(api_key=GROQ_API_KEY)
    except ImportError:
        raise RuntimeError("groq package not installed. Run: pip install groq")


# ---------------------------------------------------------------------------
# Context builder
# ---------------------------------------------------------------------------

def _build_context_string(context: Optional[dict]) -> str:
    if not context:
        return ""
    parts = []
    if context.get("current_status"):
        parts.append(f"Status being asked about: {context['current_status']}")
    if context.get("journal_name"):
        parts.append(f"Journal: {context['journal_name']}")
    if context.get("days_in_current_status") is not None:
        parts.append(f"Days in this status: {context['days_in_current_status']}")
    if context.get("days_since_submission") is not None:
        parts.append(f"Total days since submission: {context['days_since_submission']}")
    if context.get("avg_first_decision_days") is not None:
        parts.append(f"Journal's avg first decision: {context['avg_first_decision_days']} days (includes desk rejects)")
    if context.get("avg_post_review_decision_days") is not None:
        parts.append(f"Journal's avg post-review decision: {context['avg_post_review_decision_days']} days")
    if context.get("risk_level"):
        parts.append(f"EditorWatch risk assessment: {context['risk_level']}")
    if context.get("manuscript_title"):
        parts.append(f"Manuscript: {context['manuscript_title']}")
    if context.get("notes"):
        parts.append(f"Author notes: {context['notes']}")
    if context.get("status_glossary"):
        g = context["status_glossary"]
        if g.get("typical"):
            parts.append(f"Typical duration shown to user: {g['typical']}")
    return "\n".join(parts) if parts else ""


# ---------------------------------------------------------------------------
# Chat
# ---------------------------------------------------------------------------

def chat(message: str, context: Optional[dict] = None) -> str:
    """General Q&A about EM statuses and peer review."""
    try:
        client      = _get_client()
        context_str = _build_context_string(context)
        status      = context.get("current_status", "") if context else ""
        status_focus = (
            f"\n\nThe user is asking about the '{status}' status specifically. "
            "Focus your answer entirely on this stage."
        ) if status else ""

        full_system = SYSTEM_PROMPT + status_focus + (
            f"\n\nSubmission context:\n{context_str}" if context_str else ""
        )

        response = client.chat.completions.create(
            model    = MODEL,
            messages = [
                {"role": "system", "content": full_system},
                {"role": "user",   "content": message},
            ],
            max_tokens  = 500,
            temperature = 0.55,
        )
        return response.choices[0].message.content.strip()

    except Exception as e:
        logger.error(f"[groq] chat error: {e}")
        return _fallback_response(message, context)


# ---------------------------------------------------------------------------
# Nudge email generation
# ---------------------------------------------------------------------------

def generate_nudge_email(context: dict, tone: str = "polite") -> str:
    """Generate a tone-differentiated inquiry email using detailed structural briefs."""
    brief   = NUDGE_TONE_BRIEFS.get(tone, NUDGE_TONE_BRIEFS["polite"])
    journal = context.get("journal_name", "the journal")
    status  = context.get("current_status", "unknown")
    days    = context.get("days_since_submission", "?")
    avg     = context.get("avg_first_decision_days", "?")
    title   = context.get("manuscript_title", "")
    notes   = context.get("notes", "")

    try:
        excess = int(days) - int(avg)
        times  = round(int(days) / int(avg), 1)
        timing_line = (
            f"Elapsed: {days} days. Journal avg: {avg} days. "
            f"Excess: {excess} days ({times}x the average)."
        )
    except (TypeError, ValueError):
        timing_line = f"Elapsed: {days} days. Journal avg: {avg} days."

    prompt = f"""Write an email inquiry to the editorial office of "{journal}".

SITUATION:
- EM status: {status}
- {timing_line}
- Manuscript title: {title if title else "[author will insert title]"}
- Additional context: {notes if notes else "none"}

TONE: {brief["label"]}
{brief["structure"]}

Write only the email. Do not add commentary, explanations, or alternatives.
Do not use placeholder text like [Your Name] or [reference number] — the author will add those.
Use "Dear Editorial Team," for polite, "Dear Editor," for firm and urgent."""

    try:
        client = _get_client()
        response = client.chat.completions.create(
            model    = MODEL,
            messages = [
                {
                    "role": "system",
                    "content": (
                        "You are a professional academic writing assistant. "
                        "You write emails exactly to the structural brief provided. "
                        "You do not deviate from the specified vocabulary, length, or structure. "
                        "Each tone MUST be clearly distinguishable: "
                        "polite is gentle and patient, firm is assertive with a deadline, "
                        "urgent is direct with stated consequences of withdrawal. "
                        "Never blend tones. Follow the brief literally."
                    ),
                },
                {"role": "user", "content": prompt},
            ],
            max_tokens  = 450,
            temperature = 0.4,
        )
        return response.choices[0].message.content.strip()

    except Exception as e:
        logger.error(f"[groq] nudge email error: {e}")
        return _fallback_email(context, tone)


# ---------------------------------------------------------------------------
# Fallbacks — used when Groq key missing or request fails
# ---------------------------------------------------------------------------

def _fallback_response(message: str, context: Optional[dict]) -> str:
    status = (context or {}).get("current_status", "").lower()
    msg    = message.lower()

    if "decision in process" in status or "decision in process" in msg:
        return (
            "'Decision in Process' means the Editor-in-Chief (EIC) has the Associate Editor's "
            "recommendation and is writing the formal decision letter. This is usually 3–14 days — "
            "the shortest stage. EICs typically follow the AE recommendation; overrides are rare. "
            "If you have been here more than 14 days, a polite inquiry is reasonable. "
            "Do not assume the decision is negative — some EICs batch decisions weekly."
        )
    if "required reviews complete" in status or "reviews complete" in msg:
        return (
            "'Required Reviews Complete' means all reviewer reports are in and the Associate Editor "
            "(AE) is synthesising them into a recommendation for the EIC. "
            "This typically takes 7–21 days. If you have been here more than 3 weeks, "
            "a brief inquiry to the editorial office is appropriate."
        )
    if "with editor" in status or "with editor" in msg:
        return (
            "'With Editor' covers desk review (days 1–21) and reviewer invitation (onward). "
            "T&F's published average includes fast desk rejects — misleadingly low. "
            "Papers going to full peer review realistically spend 30–90 days here. "
            "Beyond 30 days usually means reviewer hunting. Inquiry is appropriate after 60 days."
        )
    if "under review" in status or "under review" in msg:
        return (
            "'Under Review' means reviewers have accepted and are reading your paper. "
            "6–10 weeks total is normal. The status holds until ALL reviewers submit — not just the first. "
            "One late reviewer holds everything. A polite inquiry is reasonable at 70+ days."
        )
    if "minor revision" in status or "minor revision" in msg:
        return (
            "Minor revision is effectively a conditional accept. "
            "It typically goes only to the Handling Editor — not back to original reviewers. "
            "Address every reviewer point in your response letter. "
            "Second decision usually comes within 2–4 weeks of resubmission."
        )
    if "major revision" in status or "major revision" in msg:
        return (
            "Major revision is not a rejection. Your revised manuscript will go back to the original reviewers. "
            "Write a detailed point-by-point response letter — reviewers compare it line by line. "
            "You typically have 60–90 days to resubmit. Second review cycle: 4–8 weeks."
        )
    if "revision submitted" in status or "revision submitted" in msg:
        return (
            "'Revision Submitted' means your revision is back with the editor or reviewers. "
            "Minor revision re-review: 2–4 weeks (editor only). "
            "Major revision re-review: 4–8 weeks (reviewers involved). "
            "The system may briefly show 'With Editor' between statuses — this is normal."
        )
    return (
        "Select a specific EM status on the left and ask your question. "
        "I can address any stage precisely — With Editor, Under Review, Decision in Process, "
        "Required Reviews Complete, and all revision stages. "
        "(Note: AI advisor is temporarily limited — Groq API key may not be configured.)"
    )


def _fallback_email(context: dict, tone: str) -> str:
    """Three genuinely different fallback emails for when Groq is unavailable."""
    journal   = context.get("journal_name", "the journal")
    days      = context.get("days_since_submission", "several")
    avg       = context.get("avg_first_decision_days", "the stated average")
    title     = context.get("manuscript_title", "")
    title_str = f'"{title}"' if title else "my manuscript"

    try:
        excess = int(days) - int(avg)
        times  = round(int(days) / int(avg), 1)
        timing = (
            f"{days} days — {excess} days beyond the journal's published "
            f"average of {avg} days ({times}x the stated timeline)"
        )
    except (TypeError, ValueError):
        timing = f"{days} days"

    if tone == "polite":
        return f"""Subject: Status enquiry — {journal}

Dear Editorial Team,

I am writing to kindly enquire about the status of {title_str}, submitted to {journal} {days} days ago. As the journal's published average first decision time is {avg} days, I wanted to check whether the review process is progressing as expected.

I would be grateful for any update you are able to provide at your earliest convenience.

Kind regards,
[Your Name]"""

    if tone == "firm":
        return f"""Subject: Formal status request — {title_str} submitted {days} days ago

Dear Editor,

I am writing to request a formal update on {title_str}, submitted to {journal} on [submission date]. The submission has now been under consideration for {timing}. I would appreciate a specific status update and an estimated decision date within 10 working days.

I look forward to your response.

[Your Name]"""

    # urgent
    return f"""Subject: Urgent: {days} days without decision — {journal}

Dear Editor,

I am writing regarding the significant delay in the review of {title_str}, submitted to {journal} {timing}. The extended timeline is materially affecting my research planning and professional commitments.

I require a response within 5 working days. If I do not receive an update by that time, I will consider withdrawing the manuscript for submission to another journal.

I hope this can be resolved promptly.

[Your Name]"""
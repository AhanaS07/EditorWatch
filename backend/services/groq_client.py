"""
groq_client.py
Wraps the Groq API (Llama 3.1-8B-Instant) for two uses:
  1. Status decoder / Q&A chat
  2. Personalised nudge email generation
"""

import os
import logging
from typing import Optional

logger = logging.getLogger(__name__)

GROQ_API_KEY = os.getenv("GROQ_API_KEY", "")
MODEL        = "llama-3.1-8b-instant"

SYSTEM_PROMPT = """You are EditorWatch — an expert academic peer review advisor specialising in 
Taylor & Francis (T&F) Editorial Manager (EM) workflows. Your role is to help authors understand:
- What each EM status means in practice
- Whether their wait time is normal or cause for concern
- When and how to send a professional status inquiry
- How to write a revision response letter

Rules:
- Be concise and empathetic. Authors are stressed.
- When given timing data, reference actual numbers (days waited, journal average).
- Never fabricate journal-specific facts. Acknowledge when you're estimating.
- For nudge emails: professional, brief (<150 words), reference the journal's own published timeline.
- Never suggest anything aggressive or entitled toward editors."""


def _get_client():
    """Lazy-load Groq client to avoid import errors if key is missing."""
    try:
        from groq import Groq
        if not GROQ_API_KEY:
            raise ValueError("GROQ_API_KEY not set in environment")
        return Groq(api_key=GROQ_API_KEY)
    except ImportError:
        raise RuntimeError("groq package not installed. Run: pip install groq")


def _build_context_string(context: Optional[dict]) -> str:
    if not context:
        return ""
    parts = []
    if context.get("journal_name"):
        parts.append(f"Journal: {context['journal_name']}")
    if context.get("current_status"):
        parts.append(f"Current EM status: {context['current_status']}")
    if context.get("days_in_current_status") is not None:
        parts.append(f"Days in current status: {context['days_in_current_status']}")
    if context.get("days_since_submission") is not None:
        parts.append(f"Total days since submission: {context['days_since_submission']}")
    if context.get("avg_first_decision_days") is not None:
        parts.append(f"Journal's stated avg first decision: {context['avg_first_decision_days']} days")
    if context.get("risk_level"):
        parts.append(f"Delay risk level: {context['risk_level']}")
    if context.get("manuscript_title"):
        parts.append(f"Manuscript title: {context['manuscript_title']}")
    if context.get("notes"):
        parts.append(f"Author notes: {context['notes']}")
    return "\n" + "\n".join(parts) if parts else ""


def chat(message: str, context: Optional[dict] = None) -> str:
    """General Q&A about EM statuses and peer review."""
    try:
        client = _get_client()
        context_str = _build_context_string(context)
        full_system = SYSTEM_PROMPT + (f"\n\nSubmission context:{context_str}" if context_str else "")

        response = client.chat.completions.create(
            model    = MODEL,
            messages = [
                {"role": "system", "content": full_system},
                {"role": "user",   "content": message},
            ],
            max_tokens  = 600,
            temperature = 0.65,
        )
        return response.choices[0].message.content.strip()

    except Exception as e:
        logger.error(f"[groq] chat error: {e}")
        return _fallback_response(message, context)


def generate_nudge_email(context: dict, tone: str = "polite") -> str:
    """Generate a personalised inquiry email in the requested tone."""
    tone_guidance = {
        "polite": "Polite and patient. Acknowledge the editor's workload. Short (3 sentences max body).",
        "firm":   "Professional and firm. Cite the journal's own timeline. Request a specific update.",
        "urgent": "Firm and time-sensitive. Note the extended delay clearly. Ask for an ETA or decision.",
    }.get(tone, "Polite and professional.")

    prompt = f"""Generate a {tone} email inquiry to the editorial office of '{context.get('journal_name', 'the journal')}'.

Situation:
- Current EM status: {context.get('current_status', 'unknown')}
- Days since submission: {context.get('days_since_submission', '?')}
- Journal's stated average first decision: {context.get('avg_first_decision_days', '?')} days
- Manuscript title: {context.get('manuscript_title', '[manuscript title]')}
- Any context: {context.get('notes', 'none')}

Tone: {tone_guidance}

Format your response as:
Subject: [subject line]

[email body]

Keep the body under 120 words. Do not include placeholders like [Your Name] — the author will fill those in."""

    try:
        client = _get_client()
        response = client.chat.completions.create(
            model    = MODEL,
            messages = [
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user",   "content": prompt},
            ],
            max_tokens  = 400,
            temperature = 0.7,
        )
        return response.choices[0].message.content.strip()

    except Exception as e:
        logger.error(f"[groq] nudge email error: {e}")
        return _fallback_email(context, tone)


# ---------------------------------------------------------------------------
# Fallbacks when Groq is unavailable (no key, network issue, etc.)
# ---------------------------------------------------------------------------

def _fallback_response(message: str, context: Optional[dict]) -> str:
    msg_lower = message.lower()
    if "with editor" in msg_lower:
        return (
            "\"With Editor\" means your manuscript is currently with the Handling Editor (HE). "
            "They are either doing a desk review (deciding if it goes for peer review) or "
            "actively inviting reviewers. Delays beyond 30 days typically indicate reviewer hunting. "
            "No action is needed until ~30 days in this status."
        )
    if "under review" in msg_lower:
        return (
            "\"Under Review\" means at least one reviewer has accepted and is reading your paper. "
            "Most T&F journals give reviewers 4–6 weeks. Delays are normal — "
            "a single late reviewer holds everything up."
        )
    if "nudge" in msg_lower or "email" in msg_lower:
        return (
            "A good inquiry email is: brief (3–4 sentences), cites your submission date, "
            "references the journal's own stated timeline, and asks for an estimated decision date. "
            "Send it to the editorial office email on the journal's contact page."
        )
    return (
        "I can help decode EM statuses, assess your delay risk, and draft inquiry emails. "
        "Please provide your journal name and current status for personalised advice. "
        "(Note: AI chat is temporarily limited — Groq API key may not be configured.)"
    )


def _fallback_email(context: dict, tone: str) -> str:
    journal  = context.get("journal_name", "the journal")
    days     = context.get("days_since_submission", "several")
    avg      = context.get("avg_first_decision_days", "the stated average")
    title    = context.get("manuscript_title", "my manuscript")

    return f"""Subject: Status inquiry — manuscript submitted {days} days ago

Dear Editorial Team,

I am writing to kindly enquire about the status of my manuscript "{title}", submitted to {journal} {days} days ago. As the journal's stated average first decision time is {avg} days, I wanted to check whether the review process is progressing as expected.

I would be grateful for any update you are able to provide.

Thank you for your time and the important work you do.

Kind regards,
[Your Name]"""
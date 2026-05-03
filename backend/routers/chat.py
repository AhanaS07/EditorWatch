"""
chat.py
Two endpoints:
  POST /chat          — general status decoder / Q&A
  POST /chat/nudge    — generate personalised inquiry email
"""

from fastapi import APIRouter
from pydantic import BaseModel
from typing import Optional

from models.schemas import ChatRequest, ChatResponse
from services.groq_client import chat as groq_chat, generate_nudge_email

router = APIRouter(prefix="/chat", tags=["chat"])


class NudgeRequest(BaseModel):
    tone:    str = "polite"   # "polite" | "firm" | "urgent"
    context: dict             # prediction data + journal + manuscript info


@router.post("", response_model=ChatResponse)
async def chat_endpoint(req: ChatRequest):
    """
    Ask anything about EM statuses, peer review timelines, or what to do next.
    Optionally pass prediction context for personalised answers.
    """
    response = groq_chat(req.message, req.context)
    return ChatResponse(response=response)


@router.post("/nudge", response_model=ChatResponse)
async def nudge_email(req: NudgeRequest):
    """
    Generate a personalised inquiry email in the requested tone.
    Pass the prediction context (journal name, days waited, status, etc.)
    """
    email = generate_nudge_email(req.context, req.tone)
    return ChatResponse(response=email)
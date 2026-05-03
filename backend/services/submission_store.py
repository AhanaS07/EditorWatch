"""
submission_store.py
Simple JSON-backed persistence for submission records.
Each submission has a unique ID, a full timeline of status updates,
and can be patched with new status events as the author receives news.

In production you'd swap this for a real DB; the interface stays the same.
"""

import json
import uuid
import logging
from pathlib import Path
from datetime import datetime
from typing import Optional

from models.schemas import (
    SubmissionRecord, StatusUpdate, EMStatus,
    CreateSubmissionRequest, UpdateSubmissionRequest,
)

logger = logging.getLogger(__name__)

STORE_PATH = Path(__file__).parent.parent / "data" / "submissions.json"


# ---------------------------------------------------------------------------
# Low-level I/O
# ---------------------------------------------------------------------------

def _load() -> dict[str, dict]:
    if STORE_PATH.exists():
        try:
            return json.loads(STORE_PATH.read_text())
        except Exception as e:
            logger.error(f"[store] failed to load: {e}")
    return {}


def _save(store: dict) -> None:
    try:
        STORE_PATH.write_text(json.dumps(store, indent=2, default=str))
    except Exception as e:
        logger.error(f"[store] failed to save: {e}")


# ---------------------------------------------------------------------------
# CRUD
# ---------------------------------------------------------------------------

def create_submission(req: CreateSubmissionRequest) -> SubmissionRecord:
    store = _load()
    now   = datetime.utcnow().isoformat()
    sid   = str(uuid.uuid4())[:8]   # short ID is fine for a hackathon

    initial_event = StatusUpdate(
        status     = req.initial_status,
        date       = req.submission_date,
        note       = req.notes,
        source     = "author",
        created_at = now,
    )

    record = SubmissionRecord(
        id               = sid,
        journal_slug     = req.journal_slug.strip().lower(),
        journal_name     = req.journal_name,
        manuscript_title = req.manuscript_title,
        timeline         = [initial_event],
        created_at       = now,
        updated_at       = now,
    )

    store[sid] = record.model_dump()
    _save(store)
    logger.info(f"[store] created submission {sid}")
    return record


def get_submission(sid: str) -> Optional[SubmissionRecord]:
    store = _load()
    data  = store.get(sid)
    if not data:
        return None
    return SubmissionRecord(**data)


def list_submissions() -> list[SubmissionRecord]:
    store = _load()
    return [SubmissionRecord(**v) for v in store.values()]


def update_submission_status(
    sid: str,
    req: UpdateSubmissionRequest,
) -> Optional[SubmissionRecord]:
    """
    Append a new status event to the submission's timeline.
    This is the core 'author got news' update path.
    """
    store = _load()
    data  = store.get(sid)
    if not data:
        return None

    record = SubmissionRecord(**data)
    now    = datetime.utcnow().isoformat()

    new_event = StatusUpdate(
        status     = req.new_status,
        date       = req.update_date,
        note       = req.note,
        source     = "author",
        created_at = now,
    )

    record.timeline.append(new_event)
    record.updated_at = now

    store[sid] = record.model_dump()
    _save(store)
    logger.info(f"[store] updated submission {sid} → {req.new_status}")
    return record


def delete_submission(sid: str) -> bool:
    store = _load()
    if sid not in store:
        return False
    del store[sid]
    _save(store)
    logger.info(f"[store] deleted submission {sid}")
    return True


# ---------------------------------------------------------------------------
# Helpers for predictor
# ---------------------------------------------------------------------------

def current_status(record: SubmissionRecord) -> StatusUpdate:
    """Return the most recent status event."""
    return record.timeline[-1]


def submission_date(record: SubmissionRecord) -> str:
    """Return the original submission date (first timeline event date)."""
    return record.timeline[0].date
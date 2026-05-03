"""
tracker_data.py
Abstraction layer between routers and data sources.
Mode 'predictive': reads from local JSON cache (manually seeded from T&F pages).
Mode 'live': future EM API hook (not yet available).
"""

from models.schemas import DataMode
from services.scraper import get_journal_metrics
from services.submission_store import get_submission, current_status


class TrackerData:
    def __init__(self, mode: DataMode = DataMode.predictive):
        self.mode = mode

    async def get_metrics(self, journal_slug: str) -> dict | None:
        """Return journal metrics from the manually-seeded cache."""
        return await get_journal_metrics(journal_slug)

    async def get_status(self, submission_id: str) -> dict | None:
        if self.mode == DataMode.predictive:
            record = get_submission(submission_id)
            if not record:
                return None
            latest = current_status(record)
            return {
                "status":   latest.status,
                "date":     latest.date,
                "note":     latest.note,
                "timeline": record.timeline,
                "record":   record,
            }
        elif self.mode == DataMode.live:
            raise NotImplementedError("Live EM API not yet available.")
        return None
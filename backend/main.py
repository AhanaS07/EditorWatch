"""
main.py — EditorWatch API
"""

import logging
from contextlib import asynccontextmanager
from pathlib import Path

from dotenv import load_dotenv
load_dotenv()

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from routers import scrape, predict, chat, journals, demo, submissions
from services.scheduler import start_scheduler, stop_scheduler
from services.scraper import get_stale_journals, get_scrape_status

logging.basicConfig(
    level  = logging.INFO,
    format = "%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("editorwatch")

DATA_DIR = Path(__file__).parent / "data"
DATA_DIR.mkdir(exist_ok=True)

SUBMISSIONS_FILE = DATA_DIR / "submissions.json"
if not SUBMISSIONS_FILE.exists():
    SUBMISSIONS_FILE.write_text("{}")


@asynccontextmanager
async def lifespan(app: FastAPI):
    # ---- STARTUP ----
    logger.info("EditorWatch starting up...")
    start_scheduler()

    # Log data health at startup — no network calls, pure file read
    stale = get_stale_journals(stale_days=180)
    if stale:
        logger.warning(
            f"{len(stale)} journal(s) have stale data (>180 days). "
            f"Visit /journals/cache-status for re-seeding instructions."
        )
    else:
        logger.info("All journal data is within the 6-month freshness window.")

    logger.info("EditorWatch ready.")
    yield

    # ---- SHUTDOWN ----
    stop_scheduler()
    logger.info("EditorWatch shut down.")


app = FastAPI(
    title       = "EditorWatch API",
    description = "Predictive peer review delay tracker for Taylor & Francis authors.",
    version     = "1.0.0",
    lifespan    = lifespan,
)

ALLOWED_ORIGINS = [
    "http://localhost:3000",
    "http://localhost:3001",
    "https://*.vercel.app",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins     = ALLOWED_ORIGINS,
    allow_credentials = True,
    allow_methods     = ["*"],
    allow_headers     = ["*"],
)

@app.middleware("http")
async def log_requests(request: Request, call_next):
    logger.info(f"-> {request.method} {request.url.path}")
    response = await call_next(request)
    logger.info(f"<- {response.status_code} {request.url.path}")
    return response

@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    logger.error(f"Unhandled error on {request.url.path}: {exc}", exc_info=True)
    return JSONResponse(status_code=500, content={"detail": "Internal server error."})

app.include_router(submissions.router)
app.include_router(predict.router)
app.include_router(scrape.router)
app.include_router(chat.router)
app.include_router(journals.router)
app.include_router(demo.router)

@app.get("/", tags=["health"])
async def root():
    return {"service": "EditorWatch API", "version": "1.0.0", "status": "running", "docs": "/docs"}

@app.get("/health", tags=["health"])
async def health():
    from services.scheduler import get_scheduler_status
    return {
        "status":    "healthy",
        "scheduler": get_scheduler_status(),
        "data":      get_scrape_status(),
    }
"""Synthure FastAPI application factory."""
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from backend.core.config import settings
from backend.core.database import init_db
from backend.api import auth as auth_module
from backend.api.features import jargon as jargon_module
from backend.api.features import insurance as insurance_module
from backend.api.hospital.rcm import claims as claims_module
from backend.api.physician import navigator as navigator_module


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    yield


app = FastAPI(
    title="Synthure API",
    description="Clinical AI platform — four portals, one engine.",
    version="0.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_module.router, prefix="/api/auth", tags=["auth"])
app.include_router(jargon_module.router, prefix="/api/features", tags=["features"])
app.include_router(insurance_module.router, prefix="/api/features", tags=["features"])
app.include_router(claims_module.router, prefix="/api/hospital/rcm", tags=["rcm"])
app.include_router(navigator_module.router, prefix="/api/physician", tags=["physician"])


@app.get("/api/health")
async def health():
    try:
        from backend.rag.knowledge_base import CORPUS
        corpus_size = len(CORPUS)
    except Exception:
        corpus_size = 0
    return {
        "status": "ok",
        "ai_enabled": bool(settings.anthropic_api_key),
        "rag_corpus_size": corpus_size,
        "version": "0.1.0",
    }

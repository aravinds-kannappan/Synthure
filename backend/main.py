"""Synthure FastAPI application factory."""
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from backend.core.config import settings
from backend.core.database import init_db

# Auth
from backend.api import auth as auth_module

# Features
from backend.api.features import jargon as jargon_module
from backend.api.features import insurance as insurance_module

# Hospital — CRM
from backend.api.hospital.crm import patients as crm_patients
from backend.api.hospital.crm import providers as crm_providers
from backend.api.hospital.crm import payers as crm_payers
from backend.api.hospital.crm import documents as crm_documents
from backend.api.hospital.crm import communications as crm_communications

# Hospital — RCM
from backend.api.hospital.rcm import claims as claims_module

# Physician
from backend.api.physician import navigator as navigator_module


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    yield


app = FastAPI(
    title="Synthure API",
    description="Clinical AI platform — four portals, one engine.",
    version="0.3.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Auth
app.include_router(auth_module.router, prefix="/api/auth", tags=["auth"])

# ── AI Features
app.include_router(jargon_module.router, prefix="/api/features", tags=["features"])
app.include_router(insurance_module.router, prefix="/api/features", tags=["features"])

# ── Hospital CRM
app.include_router(crm_patients.router, prefix="/api/hospital/crm", tags=["hospital-crm"])
app.include_router(crm_providers.router, prefix="/api/hospital/crm", tags=["hospital-crm"])
app.include_router(crm_payers.router, prefix="/api/hospital/crm", tags=["hospital-crm"])
app.include_router(crm_documents.router, prefix="/api/hospital/crm", tags=["hospital-crm"])
app.include_router(crm_communications.router, prefix="/api/hospital/crm", tags=["hospital-crm"])

# ── Hospital RCM
app.include_router(claims_module.router, prefix="/api/hospital/rcm", tags=["rcm"])

# ── Physician
app.include_router(navigator_module.router, prefix="/api/physician", tags=["physician"])


@app.get("/api/health")
async def health():
    corpus_size = 0
    corpus_source = "none"
    try:
        from backend.core.database import get_db
        db = get_db()
        if db:
            result = db.rpc("rag_corpus_size", {}).execute()
            corpus_size = int(result.data or 0)
            corpus_source = "pgvector"
    except Exception:
        pass

    if corpus_size == 0:
        try:
            from backend.rag.knowledge_base import CORPUS
            corpus_size = len(CORPUS)
            corpus_source = "seed"
        except Exception:
            pass

    return {
        "status": "ok",
        "ai_enabled": bool(settings.anthropic_api_key),
        "rag_corpus_size": corpus_size,
        "rag_corpus_source": corpus_source,
        "version": "0.3.0",
    }

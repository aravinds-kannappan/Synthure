"""Synthure FastAPI application factory — Phase 2 (RCM Core)."""
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from backend.core.config import settings
from backend.core.database import init_db

from backend.api import auth as auth_module
from backend.api.features import jargon as jargon_module
from backend.api.features import insurance as insurance_module

from backend.api.hospital.crm import patients as crm_patients
from backend.api.hospital.crm import providers as crm_providers
from backend.api.hospital.crm import payers as crm_payers
from backend.api.hospital.crm import documents as crm_documents
from backend.api.hospital.crm import communications as crm_communications

from backend.api.hospital.rcm import claims as rcm_claims
from backend.api.hospital.rcm import eligibility as rcm_eligibility
from backend.api.hospital.rcm import coding as rcm_coding
from backend.api.hospital.rcm import ar as rcm_ar
from backend.api.hospital.rcm import denials as rcm_denials
from backend.api.hospital.rcm import appeals as rcm_appeals
from backend.api.hospital.rcm import payments as rcm_payments
from backend.api.hospital.rcm import collections as rcm_collections

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

CRM = "/api/hospital/crm"
RCM = "/api/hospital/rcm"

app.include_router(auth_module.router, prefix="/api/auth", tags=["auth"])
app.include_router(jargon_module.router, prefix="/api/features", tags=["features"])
app.include_router(insurance_module.router, prefix="/api/features", tags=["features"])

app.include_router(crm_patients.router, prefix=CRM, tags=["crm"])
app.include_router(crm_providers.router, prefix=CRM, tags=["crm"])
app.include_router(crm_payers.router, prefix=CRM, tags=["crm"])
app.include_router(crm_documents.router, prefix=CRM, tags=["crm"])
app.include_router(crm_communications.router, prefix=CRM, tags=["crm"])

app.include_router(rcm_claims.router, prefix=RCM, tags=["rcm"])
app.include_router(rcm_eligibility.router, prefix=RCM, tags=["rcm"])
app.include_router(rcm_coding.router, prefix=RCM, tags=["rcm"])
app.include_router(rcm_ar.router, prefix=RCM, tags=["rcm"])
app.include_router(rcm_denials.router, prefix=RCM, tags=["rcm"])
app.include_router(rcm_appeals.router, prefix=RCM, tags=["rcm"])
app.include_router(rcm_payments.router, prefix=RCM, tags=["rcm"])
app.include_router(rcm_collections.router, prefix=RCM, tags=["rcm"])

app.include_router(navigator_module.router, prefix="/api/physician", tags=["physician"])


@app.get("/api/health")
async def health():
    try:
        from backend.rag.knowledge_base import CORPUS
        corpus_size = len(CORPUS)
    except Exception:
        corpus_size = 0
    return {"status": "ok", "ai_enabled": bool(settings.anthropic_api_key), "rag_corpus_size": corpus_size, "version": "0.3.0"}

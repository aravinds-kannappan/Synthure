"""Synthure FastAPI application factory."""
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from backend.core.config import settings
from backend.core.database import init_db

# Auth
from backend.api import auth as auth_module

# Features (standalone)
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

# Hospital — Analytics
from backend.api.hospital import analytics as hospital_analytics

# Physician
from backend.api.physician import navigator as navigator_module
from backend.api.physician import patients as physician_patients_module

# Patient Portal
from backend.api.patient import portal as patient_portal

# Employer Analytics
from backend.api.employer import analytics as employer_analytics


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    # Seed insurance plan knowledge base
    try:
        from backend.ml.insurance_rag import seed_insurance_corpus
        count = seed_insurance_corpus()
        if count > 0:
            print(f"[startup] Seeded {count} insurance plan docs into RAG corpus")
    except Exception as exc:
        print(f"[startup] Insurance corpus seed skipped: {exc}")
    yield


app = FastAPI(
    title="Synthure API",
    description="Clinical AI platform — four portals, one engine.",
    version="0.4.0",
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

# ── AI Features (standalone)
app.include_router(jargon_module.router, prefix="/api/features", tags=["features"])
app.include_router(insurance_module.router, prefix="/api/features", tags=["features"])

# ── Hospital CRM
app.include_router(crm_patients.router,       prefix="/api/hospital/crm", tags=["hospital-crm"])
app.include_router(crm_providers.router,      prefix="/api/hospital/crm", tags=["hospital-crm"])
app.include_router(crm_payers.router,         prefix="/api/hospital/crm", tags=["hospital-crm"])
app.include_router(crm_documents.router,      prefix="/api/hospital/crm", tags=["hospital-crm"])
app.include_router(crm_communications.router, prefix="/api/hospital/crm", tags=["hospital-crm"])

# ── Hospital RCM
app.include_router(claims_module.router, prefix="/api/hospital/rcm", tags=["rcm"])

# ── Hospital Analytics
app.include_router(hospital_analytics.router, prefix="/api/hospital/analytics", tags=["hospital-analytics"])

# ── Physician
app.include_router(navigator_module.router,         prefix="/api/physician", tags=["physician"])
app.include_router(physician_patients_module.router, prefix="/api/physician", tags=["physician"])

# ── Patient Portal
app.include_router(patient_portal.router, prefix="/api/patient", tags=["patient"])

# ── Employer Analytics
app.include_router(employer_analytics.router, prefix="/api/employer", tags=["employer"])


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
        "version": "0.4.0",
    }

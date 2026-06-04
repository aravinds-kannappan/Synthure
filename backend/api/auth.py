"""Auth endpoints — Supabase Auth sign-in + demo access.

Two login paths:
  POST /api/auth/login  — real users, requires Supabase Auth credentials
  POST /api/auth/demo   — demo mode, no credentials needed
                           self-seeds demo orgs/users on first call
"""
from typing import Optional

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

from backend.core.auth import create_access_token
from backend.core.database import get_db
from backend.core.config import settings

router = APIRouter()

# ── Fixed UUIDs for demo tenants (idempotent across calls) ─────────────────────
_DEMO_HOSPITAL_ORG = "10000000-0000-0000-0000-000000000001"
_DEMO_EMPLOYER_ORG = "10000000-0000-0000-0000-000000000002"

_DEMO_USERS: dict[str, dict] = {
    "physician":      {"email": "demo-physician@synthure.demo",  "name": "Dr. Sarah Chen",  "org_id": _DEMO_HOSPITAL_ORG},
    "hospital_admin": {"email": "demo-admin@synthure.demo",      "name": "Hospital Admin",   "org_id": _DEMO_HOSPITAL_ORG},
    "patient":        {"email": "demo-patient@synthure.demo",    "name": "Jane Smith",        "org_id": _DEMO_HOSPITAL_ORG},
    "employer_admin": {"email": "demo-hr@synthure.demo",         "name": "HR Manager",        "org_id": _DEMO_EMPLOYER_ORG},
}


def _ensure_demo_seed(db) -> None:
    """Create demo orgs, users, and patient record if they don’t already exist."""
    # Demo hospital org
    if not db.table("orgs").select("id").eq("id", _DEMO_HOSPITAL_ORG).maybeSingle().execute().data:
        db.table("orgs").insert({"id": _DEMO_HOSPITAL_ORG, "name": "Synthure Demo Hospital", "type": "hospital", "plan": "trial"}).execute()

    # Demo employer org
    if not db.table("orgs").select("id").eq("id", _DEMO_EMPLOYER_ORG).maybeSingle().execute().data:
        db.table("orgs").insert({"id": _DEMO_EMPLOYER_ORG, "name": "Synthure Demo Corp", "type": "employer", "plan": "trial"}).execute()

    # Link employer → hospital
    if not (db.table("employer_hospitals")
            .select("employer_id")
            .eq("employer_id", _DEMO_EMPLOYER_ORG)
            .eq("hospital_id", _DEMO_HOSPITAL_ORG)
            .maybeSingle().execute().data):
        db.table("employer_hospitals").insert({"employer_id": _DEMO_EMPLOYER_ORG, "hospital_id": _DEMO_HOSPITAL_ORG}).execute()

    # Create demo users
    for role, info in _DEMO_USERS.items():
        if not db.table("users").select("id").eq("email", info["email"]).maybeSingle().execute().data:
            db.table("users").insert({"org_id": info["org_id"], "email": info["email"], "name": info["name"], "role": role}).execute()

    # Create demo patient record linked to the demo patient user
    patient_user = db.table("users").select("id").eq("email", _DEMO_USERS["patient"]["email"]).maybeSingle().execute().data
    if patient_user and not db.table("patients").select("id").eq("user_id", patient_user["id"]).maybeSingle().execute().data:
        db.table("patients").insert({
            "user_id": patient_user["id"],
            "org_id": _DEMO_HOSPITAL_ORG,
            "first_name": "Jane",
            "last_name": "Smith",
            "email": _DEMO_USERS["patient"]["email"],
            "mrn": "DEMO-001",
        }).execute()


# ── Shared response model ─────────────────────────────────────────────────────────────────────

class LoginRequest(BaseModel):
    email: str
    password: str


class LoginResponse(BaseModel):
    token: str
    name: str
    role: str
    org_id: Optional[str] = None
    user_id: Optional[str] = None
    patient_id: Optional[str] = None


# ── Real login ──────────────────────────────────────────────────────────────────────────

@router.post("/login", response_model=LoginResponse)
async def login(body: LoginRequest):
    if not settings.supabase_url or not settings.supabase_anon_key:
        raise HTTPException(status_code=503, detail="Authentication service not configured")

    db = get_db()
    if db is None:
        raise HTTPException(status_code=503, detail="Database not available")

    try:
        from supabase import create_client
        anon_client = create_client(settings.supabase_url, settings.supabase_anon_key)
        auth_resp = anon_client.auth.sign_in_with_password({
            "email": body.email.strip().lower(),
            "password": body.password,
        })
        auth_user = auth_resp.user
        if not auth_user:
            raise HTTPException(status_code=401, detail="Invalid credentials")
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid email or password")

    user_row = db.table("users").select("*").eq("auth_id", str(auth_user.id)).maybeSingle().execute().data
    if not user_row:
        user_row = db.table("users").select("*").eq("email", body.email.strip().lower()).maybeSingle().execute().data
        if user_row and not user_row.get("auth_id"):
            db.table("users").update({"auth_id": str(auth_user.id)}).eq("id", user_row["id"]).execute()

    if not user_row:
        raise HTTPException(status_code=401, detail="No account found. Contact your administrator.")

    patient_id: Optional[str] = None
    if user_row["role"] == "patient":
        pat = db.table("patients").select("id").eq("user_id", user_row["id"]).maybeSingle().execute().data
        if pat:
            patient_id = str(pat["id"])

    token = create_access_token(
        sub=user_row["email"], name=user_row["name"], role=user_row["role"],
        org_id=str(user_row["org_id"]) if user_row.get("org_id") else None,
        user_id=str(user_row["id"]), patient_id=patient_id,
    )
    return LoginResponse(
        token=token, name=user_row["name"], role=user_row["role"],
        org_id=str(user_row["org_id"]) if user_row.get("org_id") else None,
        user_id=str(user_row["id"]), patient_id=patient_id,
    )


# ── Demo login ──────────────────────────────────────────────────────────────────────────

@router.post("/demo", response_model=LoginResponse)
async def demo_login(
    role: str = Query(default="physician", description="physician | patient | hospital_admin | employer_admin"),
):
    """
    Issue a demo JWT for the given role without any credentials.
    Creates demo orgs, users, and patient record on first call (idempotent).
    All demo users share the same demo hospital and employer orgs so the
    full drill-down (Hospital → Physician → Patient → Note) works immediately.
    """
    if role not in _DEMO_USERS:
        role = "physician"

    db = get_db()
    if db is None:
        raise HTTPException(status_code=503, detail="Database not available")

    try:
        _ensure_demo_seed(db)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Demo setup failed: {exc}")

    info = _DEMO_USERS[role]
    user_row = db.table("users").select("*").eq("email", info["email"]).maybeSingle().execute().data
    if not user_row:
        raise HTTPException(status_code=500, detail="Demo user not found after seeding")

    patient_id: Optional[str] = None
    if role == "patient":
        pat = db.table("patients").select("id").eq("user_id", user_row["id"]).maybeSingle().execute().data
        if pat:
            patient_id = str(pat["id"])

    token = create_access_token(
        sub=user_row["email"], name=user_row["name"], role=role,
        org_id=info["org_id"], user_id=str(user_row["id"]), patient_id=patient_id,
    )
    return LoginResponse(
        token=token, name=user_row["name"], role=role,
        org_id=info["org_id"], user_id=str(user_row["id"]), patient_id=patient_id,
    )

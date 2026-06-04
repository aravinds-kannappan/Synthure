"""Auth endpoints — Supabase Auth sign-in + enriched JWT issuance.

Login flow:
  1. POST {email, password}
  2. Verify via supabase.auth.sign_in_with_password
  3. Look up matching row in `users` table by auth_id (email fallback for seeded accounts)
  4. For patients, resolve patient_id from patients.user_id
  5. Mint HS256 JWT with full profile payload and return it

No demo shortcuts, no hardcoded accounts.
If the user does not exist in the `users` table they get a clear error.
"""
from typing import Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from backend.core.auth import create_access_token
from backend.core.database import get_db
from backend.core.config import settings

router = APIRouter()


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


@router.post("/login", response_model=LoginResponse)
async def login(body: LoginRequest):
    if not settings.supabase_url or not settings.supabase_anon_key:
        raise HTTPException(status_code=503, detail="Authentication service not configured")

    db = get_db()
    if db is None:
        raise HTTPException(status_code=503, detail="Database not available")

    # ── Step 1: Verify credentials via Supabase Auth ──────────────────────────────
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

    # ── Step 2: Look up users table ──────────────────────────────────────────
    user_result = (
        db.table("users")
        .select("*")
        .eq("auth_id", str(auth_user.id))
        .maybeSingle()
        .execute()
    )
    user_row = user_result.data

    # Fallback: match by email for manually-seeded accounts without auth_id yet
    if not user_row:
        user_result = (
            db.table("users")
            .select("*")
            .eq("email", body.email.strip().lower())
            .maybeSingle()
            .execute()
        )
        user_row = user_result.data

        # Backfill auth_id so future logins match directly
        if user_row and not user_row.get("auth_id"):
            db.table("users").update({"auth_id": str(auth_user.id)}).eq("id", user_row["id"]).execute()

    if not user_row:
        raise HTTPException(
            status_code=401,
            detail="No account found for this email. Contact your administrator to be added to the system.",
        )

    # ── Step 3: Resolve patient_id for patient-role users ───────────────────────
    patient_id: Optional[str] = None
    if user_row["role"] == "patient":
        pat_result = (
            db.table("patients")
            .select("id")
            .eq("user_id", user_row["id"])
            .maybeSingle()
            .execute()
        )
        if pat_result.data:
            patient_id = str(pat_result.data["id"])

    # ── Step 4: Mint JWT ──────────────────────────────────────────────────────
    token = create_access_token(
        sub=user_row["email"],
        name=user_row["name"],
        role=user_row["role"],
        org_id=str(user_row["org_id"]) if user_row.get("org_id") else None,
        user_id=str(user_row["id"]),
        patient_id=patient_id,
    )

    return LoginResponse(
        token=token,
        name=user_row["name"],
        role=user_row["role"],
        org_id=str(user_row["org_id"]) if user_row.get("org_id") else None,
        user_id=str(user_row["id"]),
        patient_id=patient_id,
    )

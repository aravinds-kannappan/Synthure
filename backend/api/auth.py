"""Auth endpoints — login with demo users, Supabase Auth in production."""
from typing import Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from backend.core.auth import create_access_token

router = APIRouter()

_DEMO_USERS = {
    "patient@synthure.ai": {
        "password": "demo1234",
        "role": "patient",
        "name": "Jane Smith",
        "org_id": "demo-org",
    },
    "doctor@synthure.ai": {
        "password": "demo1234",
        "role": "physician",
        "name": "Dr. Sarah Chen",
        "org_id": "demo-org",
    },
    "admin@synthure.ai": {
        "password": "demo1234",
        "role": "hospital_admin",
        "name": "Hospital Admin",
        "org_id": "demo-org",
    },
    "hr@synthure.ai": {
        "password": "demo1234",
        "role": "employer_admin",
        "name": "HR Manager",
        "org_id": "demo-employer",
    },
    # Legacy demo user kept for backwards compatibility
    "demo@synthure.ai": {
        "password": "demo1234",
        "role": "physician",
        "name": "Dr. Sarah Chen",
        "org_id": "demo-org",
    },
}


class LoginRequest(BaseModel):
    email: str
    password: str


class LoginResponse(BaseModel):
    token: str
    name: str
    role: str
    org_id: Optional[str] = None


@router.post("/login", response_model=LoginResponse)
async def login(body: LoginRequest):
    user = _DEMO_USERS.get(body.email.strip().lower())
    if not user or user["password"] != body.password:
        raise HTTPException(status_code=401, detail="Invalid credentials")
    token = create_access_token(
        sub=body.email,
        name=user["name"],
        role=user["role"],
        org_id=user.get("org_id"),
    )
    return LoginResponse(
        token=token,
        name=user["name"],
        role=user["role"],
        org_id=user.get("org_id"),
    )

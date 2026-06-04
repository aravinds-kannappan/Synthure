"""JWT verification + role detection for Synthure tokens.

JWT payload fields:
  sub        -- email address
  name       -- display name
  role       -- patient | physician | hospital_admin | employer_admin | provider
  org_id     -- hospital or employer org UUID
  user_id    -- users.id UUID (used for physician_id in notes, etc.)
  patient_id -- patients.id UUID (only present for role == 'patient')
"""
from __future__ import annotations
import time
from typing import Optional

import jwt
from fastapi import HTTPException, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials

from backend.core.config import settings

security = HTTPBearer()

PORTAL_ROLES = frozenset({"patient", "physician", "hospital_admin", "employer_admin", "provider"})


def decode_token(token: str) -> dict:
    try:
        return jwt.decode(token, settings.jwt_secret, algorithms=["HS256"])
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
) -> dict:
    return decode_token(credentials.credentials)


def require_role(*roles: str):
    """FastAPI dependency that enforces role membership."""
    async def _dep(user: dict = Depends(get_current_user)) -> dict:
        if user.get("role") not in roles:
            raise HTTPException(status_code=403, detail="Insufficient role")
        return user
    return _dep


def create_access_token(
    sub: str,
    name: str,
    role: str,
    org_id: Optional[str] = None,
    user_id: Optional[str] = None,
    patient_id: Optional[str] = None,
    ttl_hours: int = 24,
) -> str:
    payload: dict = {
        "sub": sub,
        "name": name,
        "role": role,
        "exp": int(time.time()) + ttl_hours * 3600,
    }
    if org_id:
        payload["org_id"] = org_id
    if user_id:
        payload["user_id"] = user_id
    if patient_id:
        payload["patient_id"] = patient_id
    return jwt.encode(payload, settings.jwt_secret, algorithm="HS256")

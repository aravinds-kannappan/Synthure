"""Supabase client singleton — service-role for server-side writes."""
from __future__ import annotations
from typing import Optional

from backend.core.config import settings

_service_client: Optional[object] = None


async def init_db() -> None:
    global _service_client
    if not settings.supabase_url or not settings.supabase_service_role_key:
        return
    try:
        from supabase import create_client
        _service_client = create_client(
            settings.supabase_url,
            settings.supabase_service_role_key,
        )
    except ImportError:
        pass


def get_db():
    """Return the service-role Supabase client (bypasses RLS for server writes)."""
    return _service_client


def get_anon_client():
    """Return an anon client — respects RLS, for client-facing reads."""
    if not settings.supabase_url or not settings.supabase_anon_key:
        return None
    try:
        from supabase import create_client
        return create_client(settings.supabase_url, settings.supabase_anon_key)
    except ImportError:
        return None

"""Org-scoped query helpers — all writes are automatically namespaced."""
from __future__ import annotations
from typing import Any

from backend.core.database import get_db


def _db():
    db = get_db()
    if db is None:
        raise RuntimeError("Database not initialised — check SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY")
    return db


def org_list(table: str, org_id: str, filters: dict[str, Any] | None = None) -> list[dict]:
    q = _db().table(table).select("*").eq("org_id", org_id)
    for k, v in (filters or {}).items():
        q = q.eq(k, v)
    return (q.execute()).data or []


def org_get(table: str, org_id: str, record_id: str) -> dict | None:
    result = (
        _db().table(table)
        .select("*")
        .eq("id", record_id)
        .eq("org_id", org_id)
        .single()
        .execute()
    )
    return result.data


def org_insert(table: str, org_id: str, data: dict) -> dict:
    result = _db().table(table).insert({**data, "org_id": org_id}).execute()
    return result.data[0] if result.data else {}


def org_update(table: str, org_id: str, record_id: str, data: dict) -> dict:
    result = (
        _db().table(table)
        .update(data)
        .eq("id", record_id)
        .eq("org_id", org_id)
        .execute()
    )
    return result.data[0] if result.data else {}


def org_delete(table: str, org_id: str, record_id: str) -> None:
    _db().table(table).delete().eq("id", record_id).eq("org_id", org_id).execute()

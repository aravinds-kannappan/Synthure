"""DB-backed prompt version registry — loads active prompts at startup."""
from __future__ import annotations
from typing import Optional
from backend.core.database import get_db

_CACHE: dict[str, dict] = {}


def load_prompt(name: str) -> Optional[dict]:
    """Load the active prompt version for a given name."""
    if name in _CACHE:
        return _CACHE[name]
    db = get_db()
    if db is None:
        return None
    try:
        result = (
            db.table("prompt_versions")
            .select("system_prompt, user_template, tool_schema")
            .eq("prompt_name", name)
            .eq("is_active", True)
            .single()
            .execute()
        )
        if result.data:
            _CACHE[name] = result.data
            return result.data
    except Exception:
        pass
    return None


def bust_cache(name: str) -> None:
    _CACHE.pop(name, None)

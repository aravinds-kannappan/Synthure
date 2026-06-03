"""
Vercel serverless entry point — mounts the FastAPI ASGI app.
For local development: uvicorn api.index:app --reload
"""
from backend.main import app  # noqa: F401  — Vercel needs 'app' exported at module level

__all__ = ["app"]

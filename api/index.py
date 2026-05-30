import os
import time
from functools import wraps

import jwt
import anthropic
from flask import Flask, request, jsonify
from flask_cors import CORS

from .agents import orchestrator

app = Flask(__name__)
CORS(app)

SECRET_KEY        = os.environ.get("JWT_SECRET", "synthure-demo-secret-2024")
ANTHROPIC_API_KEY = os.environ.get("ANTHROPIC_API_KEY", "")

DEMO_USERS = {
    "demo@synthure.ai": {"password": "demo1234", "role": "provider", "name": "Dr. Sarah Chen"}
}

ERROR_CODES = {
    "AUTH_MISSING":         ("Authorization token required", 401),
    "AUTH_INVALID":         ("Invalid or expired token", 401),
    "VALIDATION_FAILED":    ("Request validation failed", 400),
    "COMPLIANCE_VIOLATION": ("Request failed compliance check", 422),
    "ROUTING_FAILED":       ("Pipeline routing failed", 500),
    "INFERENCE_TIMEOUT":    ("AI inference timed out", 503),
}


def structured_error(code: str, detail: str | None = None):
    msg, status = ERROR_CODES.get(code, ("Unknown error", 500))
    body = {"error": {"code": code, "message": msg}}
    if detail:
        body["error"]["detail"] = detail
    return jsonify(body), status


def require_auth(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        auth = request.headers.get("Authorization", "")
        if not auth.startswith("Bearer "):
            return structured_error("AUTH_MISSING")
        tok = auth.split(" ", 1)[1]
        try:
            payload = jwt.decode(tok, SECRET_KEY, algorithms=["HS256"])
            request.user = payload
        except jwt.ExpiredSignatureError:
            return structured_error("AUTH_INVALID", "Token expired")
        except jwt.InvalidTokenError:
            return structured_error("AUTH_INVALID")
        return f(*args, **kwargs)
    return decorated


def get_claude_client() -> anthropic.Anthropic | None:
    """Return an authenticated Claude client, or None if no API key configured."""
    if not ANTHROPIC_API_KEY:
        return None
    return anthropic.Anthropic(api_key=ANTHROPIC_API_KEY)


# ── Auth ──────────────────────────────────────────────────────────────────────

@app.post("/api/auth/login")
def login():
    body     = request.get_json(silent=True) or {}
    email    = body.get("email", "").strip()
    password = body.get("password", "")
    user     = DEMO_USERS.get(email)
    if not user or user["password"] != password:
        return structured_error("AUTH_INVALID", "Invalid credentials")
    token = jwt.encode(
        {"sub": email, "name": user["name"], "role": user["role"], "exp": time.time() + 3600},
        SECRET_KEY,
        algorithm="HS256",
    )
    return jsonify({"token": token, "name": user["name"], "role": user["role"]})


# ── Feature 1: Jargon Decoder ─────────────────────────────────────────────────

@app.post("/api/explain-jargon")
@require_auth
def explain_jargon():
    body  = request.get_json(silent=True) or {}
    notes = (body.get("notes") or "").strip()
    if not notes:
        return structured_error("VALIDATION_FAILED", "Field 'notes' is required")
    if len(notes) > 5000:
        return structured_error("COMPLIANCE_VIOLATION", "Notes exceed maximum allowed length (5000 chars)")
    try:
        output = orchestrator.run_jargon_pipeline(notes, get_claude_client())
        return jsonify(output.to_dict())
    except Exception as e:
        return structured_error("ROUTING_FAILED", str(e))


# ── Feature 2: Insurance Matcher ──────────────────────────────────────────────

@app.post("/api/match-insurance")
@require_auth
def match_insurance():
    body = request.get_json(silent=True) or {}
    for field in ["age", "annual_income", "employed"]:
        if field not in body:
            return structured_error("VALIDATION_FAILED", f"Missing required field: {field}")
    try:
        int(body["age"]); int(body["annual_income"])
    except (ValueError, TypeError):
        return structured_error("VALIDATION_FAILED", "age and annual_income must be integers")
    try:
        output = orchestrator.run_insurance_pipeline(body, get_claude_client())
        return jsonify(output.to_dict())
    except Exception as e:
        return structured_error("ROUTING_FAILED", str(e))


# ── Feature 3: Claim Routing ──────────────────────────────────────────────────

@app.post("/api/claim/submit")
@require_auth
def submit_claim():
    body = request.get_json(silent=True) or {}
    for field in ["patient_id", "diagnosis_codes", "procedure_code", "amount", "provider_npi"]:
        if not body.get(field):
            return structured_error("VALIDATION_FAILED", f"Missing required field: {field}")
    try:
        amount = float(body["amount"])
        if amount <= 0:
            raise ValueError()
    except (ValueError, TypeError):
        return structured_error("VALIDATION_FAILED", "amount must be a positive number")
    if not isinstance(body["diagnosis_codes"], list) or not body["diagnosis_codes"]:
        return structured_error("VALIDATION_FAILED", "diagnosis_codes must be a non-empty array")
    try:
        output = orchestrator.run_claim_pipeline(body, get_claude_client())
        return jsonify(output.to_dict())
    except Exception as e:
        return structured_error("ROUTING_FAILED", str(e))


# ── Health ────────────────────────────────────────────────────────────────────

@app.get("/api/health")
def health():
    try:
        from .rag.knowledge_base import CORPUS
        corpus_size = len(CORPUS)
    except Exception:
        corpus_size = 0
    return jsonify({
        "status": "ok",
        "ai_enabled": bool(ANTHROPIC_API_KEY),
        "rag_corpus_size": corpus_size,
    })


if __name__ == "__main__":
    app.run(debug=True, port=5050)

import os
import time
import jwt
import json
from functools import wraps
from flask import Flask, request, jsonify
from flask_cors import CORS
import anthropic

app = Flask(__name__)
CORS(app)

SECRET_KEY        = os.environ.get("JWT_SECRET", "synthure-demo-secret-2024")
ANTHROPIC_API_KEY = os.environ.get("ANTHROPIC_API_KEY", "")

_cache = {}

DEMO_USERS = {
    "demo@synthure.ai": {"password": "demo1234", "role": "provider", "name": "Dr. Sarah Chen"}
}

ERROR_CODES = {
    "AUTH_MISSING":        ("Authorization token required", 401),
    "AUTH_INVALID":        ("Invalid or expired token", 401),
    "VALIDATION_FAILED":   ("Request validation failed", 400),
    "INFERENCE_TIMEOUT":   ("AI inference timed out", 503),
    "ROUTING_FAILED":      ("Claim routing failed", 500),
    "COMPLIANCE_VIOLATION":("Request failed compliance check", 422),
}

def structured_error(code, detail=None):
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

def call_claude(system_prompt, user_message, model="claude-haiku-4-5-20251001"):
    if not ANTHROPIC_API_KEY:
        return None
    cache_key = f"{model}:{system_prompt[:50]}:{user_message[:100]}"
    if cache_key in _cache and time.time() - _cache[cache_key]["ts"] < 300:
        return _cache[cache_key]["val"]
    client = anthropic.Anthropic(api_key=ANTHROPIC_API_KEY)
    msg = client.messages.create(
        model=model,
        max_tokens=1024,
        system=system_prompt,
        messages=[{"role": "user", "content": user_message}],
    )
    result = msg.content[0].text
    _cache[cache_key] = {"val": result, "ts": time.time()}
    return result

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
        SECRET_KEY, algorithm="HS256",
    )
    return jsonify({"token": token, "name": user["name"], "role": user["role"]})

# ── Feature 1: Jargon Decoder ─────────────────────────────────────────────────

JARGON_SYSTEM = """You are a medical interpreter for patients.
Convert clinical visit notes into plain, compassionate English a patient can understand.
Return JSON with this exact structure:
{
  "summary": "2-3 sentence plain English summary",
  "conditions": [{"term": "medical term", "plain": "plain English explanation"}],
  "medications": [{"name": "medication", "purpose": "why prescribed", "instructions": "how to take"}],
  "followup": "what the patient needs to do next",
  "urgency": "routine|soon|urgent"
}"""

JARGON_FALLBACK = {
    "summary": "Your visit showed signs of hypertension with mild cardiac symptoms. The doctor prescribed medication to lower your blood pressure and recommended lifestyle changes.",
    "conditions": [
        {"term": "Essential Hypertension", "plain": "High blood pressure — your heart is working too hard to pump blood"},
        {"term": "Left Ventricular Hypertrophy", "plain": "The main pumping chamber of your heart has thickened from sustained high blood pressure"},
        {"term": "Dyslipidemia", "plain": "Your cholesterol and blood fats are out of healthy balance"},
    ],
    "medications": [
        {"name": "Lisinopril 10mg", "purpose": "Lowers blood pressure by relaxing blood vessels", "instructions": "Take once daily in the morning with or without food"},
        {"name": "Atorvastatin 20mg", "purpose": "Lowers bad cholesterol (LDL)", "instructions": "Take once daily at bedtime"},
    ],
    "followup": "Schedule a follow-up in 4 weeks to check blood pressure response. Get fasting labs before that visit.",
    "urgency": "soon",
}

@app.post("/api/explain-jargon")
@require_auth
def explain_jargon():
    body  = request.get_json(silent=True) or {}
    notes = (body.get("notes") or "").strip()
    if not notes:
        return structured_error("VALIDATION_FAILED", "Field 'notes' is required")
    if len(notes) > 5000:
        return structured_error("COMPLIANCE_VIOLATION", "Notes exceed maximum allowed length")
    result = call_claude(JARGON_SYSTEM, f"Visit notes:\n{notes}")
    if result:
        try:
            return jsonify({"success": True, "data": json.loads(result), "source": "ai"})
        except json.JSONDecodeError:
            pass
    return jsonify({"success": True, "data": JARGON_FALLBACK, "source": "demo"})

# ── Feature 2: Insurance Matcher ──────────────────────────────────────────────

def rule_based_match(patient):
    age          = int(patient.get("age", 0))
    income       = int(patient.get("annual_income", 0))
    employed     = patient.get("employed", False)
    has_deps     = patient.get("has_dependents", False)
    condition    = patient.get("chronic_condition", False)
    score_map    = {}
    fpl          = 20120 + (4720 * (2 if has_deps else 0))

    if age >= 65:          score_map["Medicare"] = 95
    elif age >= 60:        score_map["Medicare"] = 40
    if income <= fpl:      score_map["Medicaid"] = 90
    elif income <= fpl*1.5:score_map["Medicaid"] = 50
    if employed:           score_map["Employer-Sponsored (ESI)"] = 85
    if fpl < income <= fpl*4:   score_map["ACA Marketplace (Subsidized)"] = 80
    elif income > fpl*4:        score_map["ACA Marketplace (Full Price)"] = 65
    if has_deps and income <= fpl*2: score_map["CHIP (for dependents)"] = 70
    if income > 60000 and not condition and age < 50: score_map["HDHP + HSA"] = 60

    reasons = {
        "Medicare":                   f"Age {age} qualifies for federal Medicare coverage",
        "Medicaid":                   f"Income ${income:,}/yr falls within Medicaid eligibility",
        "Employer-Sponsored (ESI)":   "Employer-sponsored insurance typically offers best value when available",
        "ACA Marketplace (Subsidized)":"Income qualifies for premium tax credits — significant monthly savings",
        "ACA Marketplace (Full Price)":"Marketplace plan with comprehensive coverage, no subsidy at this income",
        "CHIP (for dependents)":      "Dependents qualify for Children's Health Insurance Program",
        "HDHP + HSA":                 "High-deductible plan with HSA maximizes tax savings for healthy individuals",
    }
    return [
        {"plan": name, "match_score": score, "reason": reasons.get(name, "")}
        for name, score in sorted(score_map.items(), key=lambda x: -x[1])
    ][:4]

INSURANCE_SYSTEM = """You are a healthcare insurance specialist.
Given a patient profile, add nuanced commentary on the top insurance recommendations.
Return JSON:
{
  "ai_insight": "2-3 sentence personalized guidance",
  "key_consideration": "the single most important factor for this patient",
  "warning": null or "any important caveat"
}"""

@app.post("/api/match-insurance")
@require_auth
def match_insurance():
    body = request.get_json(silent=True) or {}
    for f in ["age", "annual_income", "employed"]:
        if f not in body:
            return structured_error("VALIDATION_FAILED", f"Missing field: {f}")
    try:
        age = int(body["age"]); income = int(body["annual_income"])
        if not (0 < age < 130) or income < 0: raise ValueError()
    except (ValueError, TypeError):
        return structured_error("VALIDATION_FAILED", "Age must be 1-129; income must be non-negative")

    recommendations = rule_based_match(body)
    ai_overlay = None
    result = call_claude(INSURANCE_SYSTEM, f"Patient: {json.dumps(body)}\nTop recs: {json.dumps(recommendations[:2])}")
    if result:
        try: ai_overlay = json.loads(result)
        except json.JSONDecodeError: pass

    if not ai_overlay:
        ai_overlay = {
            "ai_insight": f"Based on your profile (age {age}, income ${income:,}), {'employer coverage should be your first option.' if body.get('employed') else 'explore marketplace options for comprehensive coverage with potential subsidies.'}",
            "key_consideration": "Medicare" if age >= 65 else ("Employer plan cost-sharing" if body.get("employed") else "Monthly premium vs. deductible tradeoff"),
            "warning": "Verify enrollment windows — missing Open Enrollment can mean waiting until next year." if not body.get("employed") else None,
        }
    return jsonify({"success": True, "recommendations": recommendations, "ai_insight": ai_overlay,
                    "source": "rule-engine + ai" if ANTHROPIC_API_KEY else "rule-engine + demo"})

# ── Feature 3: Claim Routing ──────────────────────────────────────────────────

def compute_complexity(claim):
    score = 0
    codes = claim.get("diagnosis_codes", [])
    score += min(len(codes) * 10, 30)
    if len(codes) > 3:              score += 20
    if claim.get("prior_denial"):   score += 25
    amount = float(claim.get("amount", 0))
    if amount > 10000:              score += 20
    elif amount > 5000:             score += 10
    if claim.get("experimental_treatment"): score += 25
    if claim.get("out_of_network"): score += 20
    return min(score, 100)

CLAIM_SYSTEM = """You are a healthcare claims specialist AI.
Analyze this insurance claim and return JSON:
{
  "decision": "approved|pending_review|denied",
  "confidence": 0-100,
  "reasoning": "2-3 sentence explanation",
  "denial_reason": null or "specific denial reason if denied",
  "appeal_path": null or "recommended appeal steps if denied",
  "estimated_reimbursement": null or number
}"""

@app.post("/api/claim/submit")
@require_auth
def submit_claim():
    body = request.get_json(silent=True) or {}
    for f in ["patient_id", "diagnosis_codes", "procedure_code", "amount", "provider_npi"]:
        if not body.get(f):
            return structured_error("VALIDATION_FAILED", f"Missing field: {f}")
    try:
        amount = float(body["amount"])
        if amount <= 0: raise ValueError()
    except (ValueError, TypeError):
        return structured_error("VALIDATION_FAILED", "Amount must be a positive number")
    if not isinstance(body["diagnosis_codes"], list) or not body["diagnosis_codes"]:
        return structured_error("VALIDATION_FAILED", "diagnosis_codes must be a non-empty array")

    complexity = compute_complexity(body)
    route      = "frontier" if complexity > 60 else "standard"
    model      = "claude-sonnet-4-6" if route == "frontier" else "claude-haiku-4-5-20251001"

    ai_result = call_claude(CLAIM_SYSTEM, f"Claim: {json.dumps(body)}\nComplexity: {complexity}/100\nRoute: {route}", model=model)

    if ai_result:
        try: decision = json.loads(ai_result)
        except json.JSONDecodeError: decision = _fallback_decision(complexity)
    else:
        decision = _fallback_decision(complexity)

    return jsonify({
        "success": True,
        "claim_id": f"CLM-{int(time.time())}-{body['patient_id'][:4].upper()}",
        "complexity_score": complexity,
        "route": route,
        "result": decision,
        "source": "ai" if ai_result else "demo",
    })

def _fallback_decision(complexity):
    if complexity < 30:
        return {"decision": "approved", "confidence": 87, "reasoning": "Claim meets all standard criteria. Diagnosis codes align with treatment. Amount is within usual and customary range.", "denial_reason": None, "appeal_path": None, "estimated_reimbursement": None}
    if complexity < 65:
        return {"decision": "pending_review", "confidence": 62, "reasoning": "Claim complexity requires specialist review. Multiple diagnosis codes with high claim value flagged for manual authorization.", "denial_reason": None, "appeal_path": "Submit pre-authorization documentation and clinical notes within 30 days.", "estimated_reimbursement": None}
    return {"decision": "denied", "confidence": 78, "reasoning": "Service not covered under current policy terms. The procedure requires prior authorization that was not obtained before treatment.", "denial_reason": "Missing prior authorization — procedure code requires pre-approval per policy section 4.2", "appeal_path": "File Level 1 appeal within 180 days with: (1) physician letter of medical necessity, (2) clinical notes, (3) completed appeal form CMS-20031.", "estimated_reimbursement": 0}

# ── Health ────────────────────────────────────────────────────────────────────

@app.get("/api/health")
def health():
    return jsonify({"status": "ok", "ai_enabled": bool(ANTHROPIC_API_KEY)})

if __name__ == "__main__":
    app.run(debug=True, port=5050)

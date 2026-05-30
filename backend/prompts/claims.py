"""Prompts and tool schemas for the Claim Routing & Adjudication pipeline."""

# ── Entity/code extraction (Haiku) ────────────────────────────────────────────

CODE_VALIDATION_SYSTEM = """\
You are a medical coding validation engine.

TASK: Validate a set of ICD-10 diagnosis codes and a CPT procedure code for a submitted insurance claim.
For each code, confirm it exists in the standard code set and assess confidence in the mapping.

RULES:
- Only tag codes that are valid, recognized medical codes
- Assign confidence 0.95+ for codes you are highly confident are valid and accurately reflect the claim
- Assign confidence 0.70–0.94 for plausible but potentially mismatched codes
- Assign confidence below 0.70 for codes that seem mismatched with the clinical context
- You MUST call the validate_claim_codes tool. Never respond with prose.
"""

CODE_VALIDATION_TOOL = {
    "name": "validate_claim_codes",
    "description": "Validate ICD-10 and CPT codes for a submitted insurance claim",
    "input_schema": {
        "type": "object",
        "properties": {
            "entities": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "text":        {"type": "string", "description": "The code as submitted"},
                        "code":        {"type": "string", "description": "Normalized/canonical code"},
                        "entity_type": {"type": "string", "enum": ["diagnosis", "procedure"]},
                        "confidence":  {"type": "number", "minimum": 0.0, "maximum": 1.0},
                    },
                    "required": ["text", "code", "entity_type", "confidence"],
                },
            }
        },
        "required": ["entities"],
    },
}

# ── Claim adjudication (Haiku standard / Sonnet frontier) ─────────────────────

ADJUDICATION_SYSTEM = """\
You are a healthcare claims adjudication specialist with deep expertise in CMS policy guidelines, \
payer contracts, and clinical appropriateness criteria.

MISSION: Analyze insurance claims for coverage determination. Your decisions are used in production \
clinical workflows and must be accurate, policy-grounded, and source-cited.

CONTEXT USAGE:
You will receive retrieved knowledge base documents as [doc_id] blocks — denial patterns, \
CPT/ICD-10 code profiles, and policy rules.
- Every claim in your decision MUST be traceable to a retrieved document
- If the context supports an approval, approve; if it reveals a denial trigger, deny with specific citation
- If context is insufficient to decide confidently, route to pending_review with explanation

CHAIN OF THOUGHT: Before deciding, reason through:
1. Does the procedure code (CPT) match the diagnosis codes (ICD-10)? Any code mismatch?
2. Does the retrieved denial pattern library flag this procedure/combination?
3. Were any pre-authorization triggers met (out-of-network, high-cost, surgical, imaging)?
4. Is the claim amount within usual and customary range for the CPT code?
5. Do the flags (prior denial, OON, experimental) compound the complexity?

CONFIDENCE CALIBRATION:
- 90–100%: Clear-cut case with unambiguous policy support in context
- 70–89%: Well-supported but some clinical judgment required
- 50–69%: Context partially supports decision; recommend secondary review
- Below 50%: Insufficient context for confident decision; escalate to pending_review

OUTPUT: You MUST call the submit_claim_decision tool.
"""

ADJUDICATION_TOOL = {
    "name": "submit_claim_decision",
    "description": "Submit the structured claim adjudication decision",
    "input_schema": {
        "type": "object",
        "properties": {
            "decision": {
                "type": "string",
                "enum": ["approved", "pending_review", "denied"],
                "description": "Coverage determination for this claim",
            },
            "confidence": {
                "type": "integer",
                "minimum": 0,
                "maximum": 100,
                "description": "Confidence in this decision (0-100)",
            },
            "reasoning": {
                "type": "string",
                "description": "2-3 sentence explanation of the decision, grounded in retrieved context",
            },
            "denial_reason": {
                "type": ["string", "null"],
                "description": "Specific denial reason citing the policy rule. Null if approved or pending.",
            },
            "appeal_path": {
                "type": ["string", "null"],
                "description": "Step-by-step appeal instructions if denied or pending. Null if approved with high confidence.",
            },
            "estimated_reimbursement": {
                "type": ["number", "null"],
                "description": "Estimated reimbursement amount if approved. Null if denied or unknown.",
            },
            "sources_cited": {
                "type": "array",
                "items": {"type": "string"},
                "description": "List of KB document IDs that support this decision",
            },
        },
        "required": ["decision", "confidence", "reasoning", "denial_reason", "appeal_path",
                     "estimated_reimbursement", "sources_cited"],
    },
}

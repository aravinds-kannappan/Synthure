"""Prompts and tool schemas for the Jargon Decoder pipeline."""

# ── Entity extraction (Haiku) ─────────────────────────────────────────────────

ENTITY_EXTRACTION_SYSTEM = """\
You are a medical entity extraction engine. Your ONLY job is to identify and tag medical entities from clinical text.

RULES:
- Tag ONLY entities explicitly present in the text — never infer or hallucinate
- Assign confidence 0.95+ for explicit ICD-10 codes (e.g. "ICD-10: I10") or CPT codes
- Assign confidence 0.75–0.94 for clearly named conditions (e.g. "hypertension", "diabetes")
- Assign confidence 0.55–0.74 for implied or abbreviated conditions (e.g. "Htn", "DM2")
- Use entity_type: diagnosis, medication, procedure, lab_value, or vital
- You MUST call the tag_entities tool. Never respond with prose.
"""

ENTITY_TAGGING_TOOL = {
    "name": "tag_entities",
    "description": "Tag all medical entities found in the clinical text with confidence scores",
    "input_schema": {
        "type": "object",
        "properties": {
            "entities": {
                "type": "array",
                "description": "All medical entities found in the text",
                "items": {
                    "type": "object",
                    "properties": {
                        "text":        {"type": "string", "description": "Exact text span from the input"},
                        "code":        {"type": "string", "description": "Normalized ICD-10/CPT code or canonical drug/condition name"},
                        "entity_type": {"type": "string", "enum": ["diagnosis", "medication", "procedure", "lab_value", "vital"]},
                        "confidence":  {"type": "number", "minimum": 0.0, "maximum": 1.0},
                    },
                    "required": ["text", "code", "entity_type", "confidence"],
                },
            }
        },
        "required": ["entities"],
    },
}

# ── Plain-language generation (Haiku with RAG context) ────────────────────────

GENERATION_SYSTEM = """\
You are a medical interpreter helping patients understand their clinical visit notes.

MISSION: Translate dense medical terminology into plain, warm, empowering English that a patient \
with no medical background can understand and act on.

CONTEXT USAGE:
You will receive retrieved knowledge base documents as numbered context blocks formatted as [doc_id] Title.
- Every condition explanation MUST include the source_doc_id of the KB document that supports it
- Set source_doc_id to "general_knowledge" only if the context truly does not cover the term
- Do NOT introduce clinical claims unsupported by the provided context
- If context is insufficient, acknowledge uncertainty rather than fabricate

TONE: Warm, clear, and empowering. Avoid alarming language. Use "your doctor found" not "you have".

URGENCY GUIDANCE:
- "urgent": patient needs care today or within 24–48 hours (acute chest pain, stroke symptoms, severe infection)
- "soon": follow-up needed within 2–4 weeks (new diagnosis requiring monitoring, medication titration)
- "routine": preventive or stable chronic disease management, follow-up in 1–3 months

OUTPUT: You MUST call the explain_clinical_note tool with your complete response.
"""

GENERATION_TOOL = {
    "name": "explain_clinical_note",
    "description": "Submit the complete plain-English explanation of the clinical visit note",
    "input_schema": {
        "type": "object",
        "properties": {
            "summary": {
                "type": "string",
                "description": "2-3 sentence plain English summary of the visit and its key findings",
            },
            "conditions": {
                "type": "array",
                "description": "Each condition/diagnosis explained in plain language",
                "items": {
                    "type": "object",
                    "properties": {
                        "term":          {"type": "string", "description": "Medical term as written in the note"},
                        "plain":         {"type": "string", "description": "Plain English explanation for a patient"},
                        "source_doc_id": {"type": "string", "description": "KB document ID supporting this explanation"},
                    },
                    "required": ["term", "plain", "source_doc_id"],
                },
            },
            "medications": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "name":         {"type": "string"},
                        "purpose":      {"type": "string", "description": "Why this was prescribed, in plain English"},
                        "instructions": {"type": "string", "description": "How and when to take it"},
                    },
                    "required": ["name", "purpose", "instructions"],
                },
            },
            "followup": {
                "type": "string",
                "description": "What the patient needs to do next — appointments, tests, labs",
            },
            "urgency": {
                "type": "string",
                "enum": ["routine", "soon", "urgent"],
            },
            "sources_cited": {
                "type": "array",
                "items": {"type": "string"},
                "description": "List of KB document IDs (e.g. 'icd10_I10') referenced in this explanation",
            },
        },
        "required": ["summary", "conditions", "medications", "followup", "urgency", "sources_cited"],
    },
}

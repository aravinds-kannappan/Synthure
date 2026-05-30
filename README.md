# Synthure

**Healthcare Intelligence Platform** — AI-powered clinical tools for medical jargon decoding, insurance coverage matching, and insurance claim adjudication.

Built with a RAG retrieval pipeline, typed intermediate representations, multi-agent orchestration, and gated controlled generation via the Claude API.

---

## Features

### 🩺 Jargon Decoder
Patients receive clinical notes written in dense medical shorthand — ICD-10 codes, Latin dosing abbreviations, diagnostic acronyms. Synthure's multi-stage pipeline extracts named entities, retrieves authoritative code descriptions from the knowledge base, and generates plain, compassionate English grounded entirely in that retrieved context.

### 🛡️ Insurance Matcher
A rule-based scoring engine evaluates Medicare, Medicaid, ACA Marketplace, CHIP, ESI, and HDHP+HSA eligibility against a patient profile. An AI overlay agent retrieves the matching insurance policy documents and generates personalized, source-cited guidance layered on top of the deterministic rule engine output.

### 📋 Claim Routing & Adjudication
Claims are scored for complexity across six weighted signals (diagnosis count, prior denial, claim amount, experimental treatment, out-of-network status) and routed to a standard or frontier AI model accordingly. The adjudication agent retrieves denial pattern documents and CPT/ICD-10 profiles from the knowledge base, then produces a structured decision — approved, pending review, or denied — with source citations, plain-English reasoning, and a step-by-step appeal path.

---

## Technical Architecture

```
Request
  │
  ▼
api/index.py                       ← Vercel entry point: thin Flask routes, input validation only
  │
  ▼
backend/agents/orchestrator.py     ← pipeline coordinator
  │
  ├─ 1. backend/ir/quality_gate.py          ICD-10/CPT format check · SHA-256 dedup · confidence scoring
  │
  ├─ 2. backend/agents/entity_extractor.py  claude-haiku-4-5 · tool_use NER
  │                                          extracts typed entities with confidence scores
  │
  ├─ 3. backend/rag/retriever.py            BM25 over medical knowledge base
  │      backend/rag/knowledge_base.py      80+ ICD-10/CPT docs · 9 denial patterns · 8 policy docs
  │
  └─ 4. backend/agents/generator.py         claude-haiku-4-5 or claude-sonnet-4-6 · tool_use
                                             gated output: sources_cited enforced + post-validation
```

### RAG Knowledge Base (`api/rag/knowledge_base.py`)

A structured corpus of 80+ documents across three types, indexed by a pure-Python BM25 retriever (no ML dependencies):

| Type | Count | Contents |
|---|---|---|
| `medical_code` | 55+ | ICD-10 diagnoses + CPT procedures with clinical context, typical charges, and denial risk profiles |
| `denial_pattern` | 9 | Common denial scenarios with policy citations and appeal templates |
| `insurance_policy` | 8 | Eligibility rules and key considerations for Medicaid, Medicare, ACA, CHIP, ESI, HDHP+HSA |

At query time, BM25 retrieves the top-k most relevant documents. The retrieved content is injected as numbered context blocks into the generation prompt — so the model reads the actual policy text, not a summary.

### BM25 Retriever (`api/rag/retriever.py`)

Implements the Okapi BM25 formula in pure Python (stdlib only — `re`, `math`, `collections`). The index is built once on module import. Supports doc-type filtering so denial patterns, medical codes, and policy documents are retrieved in separate targeted passes per pipeline stage.

### Typed Intermediate Representations (`api/ir/schemas.py`)

Every request is converted to a typed IR dataclass before any processing begins. The IR accumulates fields as it flows through each pipeline stage:

```python
ClinicalNoteIR   →  entities: list[EntityTag]        # populated by entity_extractor
                 →  retrieved_docs: list[RetrievedDoc] # populated after BM25
                 →  entity_confidence: float           # mean confidence score
                 →  quality_passed: bool               # set by quality gate

ClaimIR          →  validated_codes: list[EntityTag]   # Haiku-validated codes
                 →  complexity_score: int              # 0–100 deterministic score
                 →  route: "standard" | "frontier"     # model routing decision
                 →  retrieved_docs: list[RetrievedDoc]

InsuranceProfileIR → rule_engine_recs: list[dict]     # deterministic plan scores
                   → retrieved_docs: list[RetrievedDoc]
```

Each `EntityTag` carries `text`, `code` (normalized ICD-10/CPT), `entity_type`, and a `confidence` float from 0–1. This confidence feeds the quality gate and is surfaced in the pipeline trace.

### Data Quality Gate (`api/ir/quality_gate.py`)

Runs before any LLM call:

1. **Schema check** — required fields present and correctly typed
2. **Code format validation** — ICD-10 regex `[A-Z][0-9]{2}(\.[0-9A-Z]+)?`, CPT 5-digit format
3. **Deduplication** — SHA-256 hash of input fields checked against a 5-minute in-memory TTL cache
4. **Confidence assessment** — mean entity confidence scored; flagged in `quality_issues` if below threshold

Hard failures (invalid code formats, missing required fields) stop the pipeline and return a structured error. Soft warnings (short notes, dedup hits) are noted in `quality_issues` and the pipeline continues.

### Multi-Agent Orchestration (`api/agents/orchestrator.py`)

Task-split model routing — Haiku handles all entity tagging and standard generation; Sonnet handles complex claim adjudication only:

| Stage | Agent | Model | Task |
|---|---|---|---|
| Entity extraction | `entity_extractor` | `claude-haiku-4-5` | NER over clinical text → typed `EntityTag` list |
| Code validation | `entity_extractor` | `claude-haiku-4-5` | Validate + confidence-score claim codes |
| Insurance overlay | `generator` | `claude-haiku-4-5` | Policy-grounded guidance text |
| Jargon generation | `generator` | `claude-haiku-4-5` | Patient-facing explanation |
| Standard claim | `generator` | `claude-haiku-4-5` | Adjudication (complexity score < 60) |
| Frontier claim | `generator` | `claude-sonnet-4-6` | Adjudication (complexity score ≥ 60) |

Each agent stage records its model, latency, entity count, retrieved document count, and confidence — all returned in the `pipeline_trace` response field and rendered in the UI.

### Gated Controlled Generation (`api/agents/generator.py`)

All generation calls use Claude's **tool use** with `tool_choice={"type":"tool","name":"..."}` — the model is forced to call a named tool with a strict input schema. This eliminates free-form JSON parsing, guarantees schema conformance on every response, and makes hallucination easier to detect and strip.

Every output schema includes:
- `sources_cited: list[str]` — KB document IDs referenced in the response
- `source_doc_id: str` — per-condition citation on every explanation

After generation, a post-validation pass strips any cited document IDs that were **not** in the retrieved set. The count of stripped IDs is surfaced as `hallucinations_stripped` in the pipeline trace.

### Prompt Engineering (`api/prompts/`)

Each feature has a dedicated prompt module containing:
- **System prompt** — role definition, context-usage rules, chain-of-thought instructions (`reason through X before deciding`), and confidence calibration guidance
- **Entity tool schema** — the typed extraction contract for the Haiku NER stage
- **Generation tool schema** — the output contract for the generation stage, including `sources_cited`

Example chain-of-thought instruction from `claims.py`:
```
CHAIN OF THOUGHT: Before deciding, reason through:
1. Does the procedure code (CPT) match the diagnosis codes (ICD-10)?
2. Does the retrieved denial pattern library flag this procedure?
3. Were any pre-authorization triggers met?
4. Is the claim amount within usual and customary range?
```

---

### Demo Credentials

```
Email:    demo@synthure.ai
Password: demo1234
```

---

## Local Development

### Backend

```bash
pip install -r requirements.txt

# Demo mode — no API key needed, returns realistic fallback data
python -m api.index

# Live AI mode
ANTHROPIC_API_KEY=your_key_here python -m api.index
```

The API server starts on `http://localhost:5050`.

### Frontend

```bash
cd public
python3 -m http.server 3000
# or: npx serve .
```

Visit `http://localhost:3000`. By default `app.js` uses a relative `API_BASE = ''`, so API calls go to the same origin. For local dev against the Flask server on 5050, change the top of `app.js`:

```js
const API_BASE = 'http://localhost:5050';
```

---

## Project Structure

```
synthure/
├── index.html                 Single-page app shell (served from root by Vercel)
├── style.css                  Dark theme UI (Inter, animated login, pipeline trace)
├── app.js                     API client, tab logic, result renderers
│
├── backend/                   ← All Python business logic
│   ├── rag/
│   │   ├── knowledge_base.py  Medical corpus: ICD-10, CPT, denial patterns, policy docs
│   │   └── retriever.py       BM25 retrieval engine (pure Python stdlib)
│   │
│   ├── ir/
│   │   ├── schemas.py         Typed IR dataclasses flowing through each pipeline stage
│   │   └── quality_gate.py    ICD-10/CPT validation · SHA-256 dedup · confidence scoring
│   │
│   ├── agents/
│   │   ├── orchestrator.py    Pipeline coordinator — 3 pipeline functions
│   │   ├── entity_extractor.py Haiku NER agent (tool_use, never generates prose)
│   │   └── generator.py       Gated generation (tool_use, post-validated citations)
│   │
│   └── prompts/
│       ├── jargon.py          System prompts + tool schemas for Jargon Decoder
│       ├── insurance.py       System prompts + tool schemas for Insurance Matcher
│       └── claims.py          System prompts + tool schemas for Claim Routing
│
├── api/
│   └── index.py               Vercel serverless entry point (thin Flask routes only)
│
├── vercel.json                Vercel routing config
├── requirements.txt           Python dependencies
└── README.md
```

---

## API Reference

All endpoints except `/api/health` and `/api/auth/login` require `Authorization: Bearer <token>`.

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/auth/login` | Returns a JWT (1 hr expiry) |
| `POST` | `/api/explain-jargon` | Decode a clinical visit note |
| `POST` | `/api/match-insurance` | Score insurance plans for a patient |
| `POST` | `/api/claim/submit` | Route and adjudicate an insurance claim |
| `GET`  | `/api/health` | Health check — AI status + RAG corpus size |

### Response envelope

All successful responses include:

```jsonc
{
  "success": true,
  "source": "ai",                    // "ai" | "demo" | "rule-engine + ai"
  "pipeline_trace": [
    { "stage": "quality_gate",       "confidence": 0.95, "duration_ms": 2 },
    { "stage": "entity_extraction",  "model": "claude-haiku-4-5", "entities_found": 4, "confidence": 0.88 },
    { "stage": "rag_retrieval",      "docs_retrieved": 4, "confidence": 0.82, "duration_ms": 1 },
    { "stage": "generation",         "model": "claude-haiku-4-5", "sources_cited": ["icd10_I10", "icd10_E78_5"] }
  ],
  "entity_confidence": 0.88,
  "sources_cited": ["icd10_I10", "icd10_E78_5"],
  "quality_issues": []
}
```

### Error codes

| Code | HTTP | Meaning |
|---|---|---|
| `AUTH_MISSING` | 401 | No Authorization header |
| `AUTH_INVALID` | 401 | Bad or expired JWT |
| `VALIDATION_FAILED` | 400 | Missing or malformed input |
| `COMPLIANCE_VIOLATION` | 422 | Input failed compliance check (e.g. 5000-char note limit) |
| `ROUTING_FAILED` | 500 | Internal pipeline error |

---

## Tech Stack

| Layer | Technology |
|---|---|
| Backend | Python 3.11 / Flask 3 |
| AI | Anthropic Claude API (`claude-haiku-4-5`, `claude-sonnet-4-6`) |
| Retrieval | Okapi BM25 — pure Python, no external ML dependencies |
| Auth | PyJWT — HS256, 1 hr expiry |
| Frontend | Vanilla JS / HTML5 / CSS3 — no framework |
| Fonts | Inter (Google Fonts) |
| Deployment | Vercel — Python serverless function + static file serving |

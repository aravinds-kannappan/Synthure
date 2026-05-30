"""
Typed intermediate representations for Synthure's multi-stage processing pipeline.
Each IR flows through: Input → Quality Gate → Entity Extraction → RAG Retrieval → Generation.
"""

import hashlib
import json
import time
from dataclasses import dataclass, field
from typing import Optional, TYPE_CHECKING

if TYPE_CHECKING:
    from ..rag.retriever import RetrievedDoc


@dataclass
class EntityTag:
    """A typed, confidence-scored entity extracted from clinical text."""
    text: str          # raw text span as it appears in source
    code: str          # normalized code or canonical name (ICD-10, CPT, drug name)
    entity_type: str   # "diagnosis" | "medication" | "procedure" | "lab_value" | "vital"
    confidence: float  # 0.0–1.0

    def to_dict(self) -> dict:
        return {
            "text": self.text,
            "code": self.code,
            "entity_type": self.entity_type,
            "confidence": round(self.confidence, 3),
        }


@dataclass
class QualityGateResult:
    """Result of running input through the data quality gate."""
    passed: bool
    confidence: float  # 0.0–1.0 — overall quality confidence
    issues: list[str]  # non-blocking warnings or blocking errors
    dedup_hit: bool = False

    def to_dict(self) -> dict:
        return {
            "passed": self.passed,
            "confidence": round(self.confidence, 3),
            "issues": self.issues,
            "dedup_hit": self.dedup_hit,
        }


@dataclass
class TraceStep:
    """One stage in the multi-agent pipeline trace."""
    stage: str
    model: Optional[str] = None
    duration_ms: int = 0
    entities_found: int = 0
    docs_retrieved: int = 0
    confidence: float = 0.0
    issues: list[str] = field(default_factory=list)
    sources_cited: list[str] = field(default_factory=list)
    hallucinations_stripped: int = 0

    def to_dict(self) -> dict:
        d: dict = {"stage": self.stage, "duration_ms": self.duration_ms}
        if self.model:
            d["model"] = self.model
        if self.entities_found:
            d["entities_found"] = self.entities_found
        if self.docs_retrieved:
            d["docs_retrieved"] = self.docs_retrieved
        if self.confidence:
            d["confidence"] = round(self.confidence, 3)
        if self.issues:
            d["issues"] = self.issues
        if self.sources_cited:
            d["sources_cited"] = self.sources_cited
        if self.hallucinations_stripped:
            d["hallucinations_stripped"] = self.hallucinations_stripped
        return d


# ── Input IRs ─────────────────────────────────────────────────────────────────

@dataclass
class ClinicalNoteIR:
    raw_text: str
    char_count: int
    dedup_hash: str
    entities: list[EntityTag] = field(default_factory=list)
    retrieved_docs: list = field(default_factory=list)  # list[RetrievedDoc]
    entity_confidence: float = 0.0
    quality_passed: bool = True
    quality_issues: list[str] = field(default_factory=list)

    @staticmethod
    def build(text: str) -> "ClinicalNoteIR":
        h = hashlib.sha256(text.strip().encode()).hexdigest()[:16]
        return ClinicalNoteIR(raw_text=text, char_count=len(text), dedup_hash=h)


@dataclass
class ClaimIR:
    patient_id: str
    provider_npi: str
    procedure_code: str
    diagnosis_codes: list[str]
    amount: float
    flags: dict  # {"prior_denial": bool, "out_of_network": bool, "experimental_treatment": bool}
    validated_codes: list[EntityTag] = field(default_factory=list)
    complexity_score: int = 0
    route: str = "standard"
    retrieved_docs: list = field(default_factory=list)  # list[RetrievedDoc]
    quality_passed: bool = True
    quality_issues: list[str] = field(default_factory=list)

    @property
    def dedup_hash(self) -> str:
        key = json.dumps(
            {
                "patient_id": self.patient_id,
                "procedure_code": self.procedure_code,
                "diagnosis_codes": sorted(self.diagnosis_codes),
                "amount": self.amount,
            },
            sort_keys=True,
        )
        return hashlib.sha256(key.encode()).hexdigest()[:16]


@dataclass
class InsuranceProfileIR:
    age: int
    annual_income: int
    state: str
    employed: bool
    has_dependents: bool
    chronic_condition: bool
    rule_engine_recs: list[dict] = field(default_factory=list)
    retrieved_docs: list = field(default_factory=list)  # list[RetrievedDoc]
    quality_passed: bool = True
    quality_issues: list[str] = field(default_factory=list)

    @property
    def dedup_hash(self) -> str:
        key = json.dumps(
            {
                "age": self.age,
                "income": self.annual_income,
                "state": self.state,
                "employed": self.employed,
                "deps": self.has_dependents,
                "chronic": self.chronic_condition,
            },
            sort_keys=True,
        )
        return hashlib.sha256(key.encode()).hexdigest()[:16]


# ── Output types ──────────────────────────────────────────────────────────────

@dataclass
class PipelineOutput:
    """Base output for all three pipelines. Serializable to API response."""
    source: str  # "ai" | "demo"
    pipeline_trace: list[TraceStep] = field(default_factory=list)
    entity_confidence: float = 0.0
    sources_cited: list[str] = field(default_factory=list)
    quality_issues: list[str] = field(default_factory=list)

    def _base_dict(self) -> dict:
        return {
            "source": self.source,
            "pipeline_trace": [s.to_dict() for s in self.pipeline_trace],
            "entity_confidence": round(self.entity_confidence, 3),
            "sources_cited": self.sources_cited,
            "quality_issues": self.quality_issues,
        }


@dataclass
class JargonOutput(PipelineOutput):
    data: dict = field(default_factory=dict)

    def to_dict(self) -> dict:
        return {"success": True, "data": self.data, **self._base_dict()}


@dataclass
class InsuranceOutput(PipelineOutput):
    recommendations: list[dict] = field(default_factory=list)
    ai_insight: dict = field(default_factory=dict)

    def to_dict(self) -> dict:
        return {
            "success": True,
            "recommendations": self.recommendations,
            "ai_insight": self.ai_insight,
            **self._base_dict(),
        }


@dataclass
class ClaimOutput(PipelineOutput):
    claim_id: str = ""
    complexity_score: int = 0
    route: str = "standard"
    result: dict = field(default_factory=dict)

    def to_dict(self) -> dict:
        return {
            "success": True,
            "claim_id": self.claim_id,
            "complexity_score": self.complexity_score,
            "route": self.route,
            "result": self.result,
            **self._base_dict(),
        }

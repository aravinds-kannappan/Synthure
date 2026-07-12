"""Corpus schema for the trained data engine.

This replaces the old template path (ml/common.py + ml/generate.py), where notes
were string-concatenated from 30 hand-typed conditions and every label was written
by the same function that wrote the note (label leakage). Here a note is either:

  * a REAL note from an open-license corpus (PMC Open Access case reports,
    MTSamples, MedSecId), carrying labels from an INDEPENDENT source, or
  * a GENERATED note sampled from a small language model trained on those real
    notes (data_engine/generator.py), conditioned on a note type so its type
    label is gold by construction while its text distribution is learned.

Either way, no note's text and its label come from the same hand-written rule.

NoteRecord is deliberately a superset: real notes fill what their corpus provides
(note_type from MTSamples metadata, section spans from MedSecId), generated notes
fill note_type from the conditioning token and the rest from the independent
labelers in data_engine/labels.py.
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field, asdict
from pathlib import Path
from typing import Any

# Mirrors ml/features.py NOTE_TYPES exactly so a model trained on this corpus and
# the browser runtime agree on the class order. Kept local so data_engine stays a
# self-contained package.
NOTE_TYPES = [
    "soap",
    "discharge_summary",
    "referral",
    "er_note",
    "radiology",
    "intake_form",
    "progress_note",
]

# Source provenance for a record. "real" text is never redistributed for the
# gated corpora; only labels and offsets are kept when a corpus license requires.
SOURCES = ("pmc_oa", "mtsamples", "medsecid", "generator")

ROOT = Path(__file__).resolve().parents[2]
DATA_ENGINE_OUT = ROOT / "ml" / "artifacts" / "corpus"


@dataclass
class NoteRecord:
    note: str
    note_type: str
    source: str  # one of SOURCES
    split: str = "train"  # train | val | test
    # Independent labels (filled where the corpus or an independent labeler
    # provides them; None means "not labeled for this task").
    sections: list[dict[str, Any]] | None = None  # {name,label,start,end}
    entities: list[dict[str, Any]] | None = None  # {start,end,text,type}
    icd: list[str] | None = None
    cpt: list[str] | None = None
    missing: list[str] | None = None
    ready: int | None = None
    meta: dict[str, Any] = field(default_factory=dict)  # specialty, sample id, gen seed, etc.

    def validate(self) -> None:
        if self.note_type not in NOTE_TYPES:
            raise ValueError(f"unknown note_type {self.note_type!r}")
        if self.source not in SOURCES:
            raise ValueError(f"unknown source {self.source!r}")
        if self.split not in ("train", "val", "test"):
            raise ValueError(f"unknown split {self.split!r}")


def write_jsonl(records: list[NoteRecord], path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        for r in records:
            r.validate()
            f.write(json.dumps(asdict(r), ensure_ascii=False) + "\n")


def read_jsonl(path: Path) -> list[NoteRecord]:
    out: list[NoteRecord] = []
    with open(path, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line:
                out.append(NoteRecord(**json.loads(line)))
    return out

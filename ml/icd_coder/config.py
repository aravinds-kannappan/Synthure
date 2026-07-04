"""Configuration for the Synthure ICD coder (fully open data, A100).

Two trainable stages, no credentialed data:

  1. retriever  bi-encoder trained contrastively on (phrase -> ICD-10-CM code)
                pairs mined from the FY2026 ICD-10-CM alphabetic index + tabular
                that already ship in frontend/data/. ~270k open pairs, no DUA.

  2. reranker   cross-encoder fine-tuned on CodiEsp (CLEF eHealth 2020), real
                physician-written clinical cases with gold ICD-10 codes and
                evidence spans, CC-BY 4.0 on Zenodo. This is the supervised
                "trained on real clinical text" stage.

Everything here runs on a single A100. Nothing needs PhysioNet or MIMIC.
"""

from __future__ import annotations

import json
from dataclasses import dataclass, asdict
from pathlib import Path


@dataclass
class Config:
    # ── label space (already in the repo) ──────────────────────────────────────
    # code -> [billable, description]  and  index term -> [codes]
    # These define every ICD-10-CM code the coder can output and give each one an
    # official description and billable flag, so a predicted code is never opaque.
    icd_tabular_gz: str = "frontend/data/icd10cm.json.gz"
    icd_index_gz: str = "frontend/data/icd10index.json.gz"
    billable_only: bool = False   # keep header codes too; they carry index terms

    # ── stage 1: retriever (bi-encoder) ────────────────────────────────────────
    retriever_backbone: str = "microsoft/BiomedNLP-BiomedBERT-base-uncased-abstract"
    # A clinical/biomed backbone works too, e.g. emilyalsentzer/Bio_ClinicalBERT.
    embed_dim: int = 768
    max_phrase_len: int = 32       # index terms and descriptions are short
    temperature: float = 0.05      # InfoNCE / MultiSimilarity temperature
    retriever_epochs: int = 3
    retriever_batch: int = 256     # large in-batch negatives; A100 can hold it
    retriever_lr: float = 2e-5
    hard_negatives: int = 4        # lexical hard negatives mined per anchor
    max_pairs: int = 0             # 0 = all mined pairs; set small for a dry run

    # ── stage 2: reranker (cross-encoder) ──────────────────────────────────────
    reranker_backbone: str = "microsoft/BiomedNLP-BiomedBERT-base-uncased-abstract"
    max_pair_len: int = 192        # [evidence span] [SEP] [candidate description]
    reranker_epochs: int = 4
    reranker_batch: int = 32
    reranker_lr: float = 2e-5
    candidates_per_query: int = 50 # retriever top-k fed to the reranker
    negatives_per_pos: int = 8     # sampled negative candidates per gold code

    # ── CodiEsp (downloaded on Colab, not committed) ───────────────────────────
    codiesp_root: str = "/content/codiesp"   # unzipped Zenodo release
    use_english: bool = True                 # CodiEsp ships English machine translations
    subtrack: str = "D"                      # D = diagnoses (ICD-10-CM), P = procedures

    # ── shared ─────────────────────────────────────────────────────────────────
    fp16: bool = True
    warmup_ratio: float = 0.06
    weight_decay: float = 0.01
    seed: int = 20260703
    out_dir: str = "/content/icd_coder_out"

    def resolved(self) -> "Config":
        Path(self.out_dir).mkdir(parents=True, exist_ok=True)
        return self

    def save(self, path: str | Path) -> None:
        Path(path).write_text(json.dumps(asdict(self), indent=2))

    @classmethod
    def load(cls, path: str | Path) -> "Config":
        return cls(**json.loads(Path(path).read_text()))


# Repo root, so paths resolve whether you run from ml/ or from Colab's checkout.
REPO_ROOT = Path(__file__).resolve().parents[2]


def repo_path(rel: str) -> Path:
    p = Path(rel)
    return p if p.is_absolute() else REPO_ROOT / rel

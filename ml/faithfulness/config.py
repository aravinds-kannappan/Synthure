"""Configuration for the Synthure faithfulness checker.

The four portal writers (patient / physician / hospital / employer) are Claude,
so their prose is free generation and can hallucinate: a dose that was not in the
note, an unstated diagnosis, a flipped negation. This model scores each sentence
a writer produces against the note + extraction and flags the unsupported ones.

It is a cross-encoder entailment model. Training data is fully open:

  1. programmatic corruptions (FactCC-style) over Synthure's own synthetic notes
     and extractions: a claim grounded in the extraction is SUPPORTED; the same
     claim with an entity swapped, a dose changed, or a negation flipped is
     UNSUPPORTED. Task-matched, no download, no PHI.

  2. optional warm start on open fact-verification corpora (FEVER, VitaminC,
     MNLI) downloaded on Colab, for general entailment robustness.

Runs on a single A100. Nothing here needs credentialed data.
"""

from __future__ import annotations

import json
from dataclasses import dataclass, asdict
from pathlib import Path


@dataclass
class Config:
    # ── backbone ────────────────────────────────────────────────────────────────
    # A DeBERTa-v3 NLI checkpoint is a strong warm start: it already knows
    # entailment, so the clinical corruptions mostly teach the domain. Any
    # AutoModelForSequenceClassification backbone works.
    backbone: str = "microsoft/deberta-v3-base"
    warm_start_nli: str = ""   # e.g. "MoritzLaurer/DeBERTa-v3-base-mnli-fever-anli"; "" = plain backbone
    max_len: int = 320         # [evidence] [SEP] [claim]

    # ── synthetic corruption data ────────────────────────────────────────────────
    n_notes: int = 4000        # notes to build claims from
    claims_per_note: int = 6   # supported + corrupted claims drawn per note
    corrupt_frac: float = 0.5  # target share of UNSUPPORTED (label 0) examples

    # ── optional open fact-verification warm-up (Colab) ──────────────────────────
    use_open_nli: bool = False
    open_nli_datasets: tuple = ("fever", "vitaminc")  # loaded via HF `datasets`
    open_nli_max: int = 40000  # cap rows pulled from open corpora

    # ── optimization ─────────────────────────────────────────────────────────────
    epochs: int = 3
    batch_size: int = 32
    lr: float = 2e-5
    weight_decay: float = 0.01
    warmup_ratio: float = 0.06
    fp16: bool = True
    seed: int = 20260703

    # ── scoring / serving ────────────────────────────────────────────────────────
    # A sentence with P(supported) below this is flagged for human review. Tuned on
    # validation to hit a target flag precision; conservative default here.
    flag_threshold: float = 0.5

    # ── splits + io ──────────────────────────────────────────────────────────────
    val_frac: float = 0.1
    test_frac: float = 0.1
    out_dir: str = "/content/faithfulness_out"

    def resolved(self) -> "Config":
        Path(self.out_dir).mkdir(parents=True, exist_ok=True)
        return self

    def save(self, path: str | Path) -> None:
        Path(path).write_text(json.dumps(asdict(self), indent=2))

    @classmethod
    def load(cls, path: str | Path) -> "Config":
        d = json.loads(Path(path).read_text())
        d["open_nli_datasets"] = tuple(d.get("open_nli_datasets", ()))
        return cls(**d)


REPO_ROOT = Path(__file__).resolve().parents[2]

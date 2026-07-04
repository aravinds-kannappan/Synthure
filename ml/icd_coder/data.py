"""Data for the two ICD-coder stages.

Stage 1 pairs come from the ICD-10-CM ontology that already ships in the repo, so
this half runs anywhere with no download and no credentials. Stage 2 reads
CodiEsp, which you unzip from Zenodo onto Colab.

Nothing here imports torch, so the whole data layer is testable on CPU.
"""

from __future__ import annotations

import gzip
import glob
import json
import os
import random
import re
from collections import defaultdict
from pathlib import Path

from config import Config, repo_path

_WS = re.compile(r"\s+")


def _norm_phrase(s: str) -> str:
    return _WS.sub(" ", s).strip().lower()


def _norm_code(c: str) -> str:
    # Synthure's tabular keys are undotted uppercase (e.g. C3490); CodiEsp writes
    # dotted lowercase (c34.90). Normalize everything to the tabular form.
    return c.replace(".", "").strip().upper()


# ── ICD-10-CM ontology ────────────────────────────────────────────────────────
def load_icd(config: Config) -> tuple[dict[str, list], dict[str, list[str]]]:
    with gzip.open(repo_path(config.icd_tabular_gz), "rt") as f:
        tab = json.load(f)                          # code -> [billable, description]
    with gzip.open(repo_path(config.icd_index_gz), "rt") as f:
        index = json.load(f)                        # term -> [dotted codes]
    return tab, index


def mine_pairs(config: Config) -> dict:
    """Mine (phrase -> code) positives from the tabular + alphabetic index.

    Returns:
      pairs     list of (phrase, code)
      code2desc code -> official description
      codes     sorted label space (codes that have at least one phrase)
    """
    tab, index = load_icd(config)
    code2desc = {c: v[1] for c, v in tab.items()}
    billable = {c for c, v in tab.items() if v[0] == 1}

    code2phrases: dict[str, set[str]] = defaultdict(set)
    # 1) official tabular descriptions
    for code, v in tab.items():
        if config.billable_only and code not in billable:
            continue
        code2phrases[code].add(_norm_phrase(v[1]))
    # 2) alphabetic index terms (the lay / clinical synonyms coders actually search)
    for term, codes in index.items():
        pt = _norm_phrase(term)
        if not pt:
            continue
        for dotted in codes:
            code = _norm_code(dotted)
            if code not in tab:
                continue
            if config.billable_only and code not in billable:
                continue
            code2phrases[code].add(pt)

    pairs: list[tuple[str, str]] = []
    for code, phrases in code2phrases.items():
        for p in phrases:
            if p:
                pairs.append((p, code))

    codes = sorted(code2phrases.keys())
    if config.max_pairs and len(pairs) > config.max_pairs:
        rng = random.Random(config.seed)
        pairs = rng.sample(pairs, config.max_pairs)
    return {"pairs": pairs, "code2desc": code2desc, "codes": codes}


# ── CodiEsp (Zenodo, unzipped on Colab) ─────────────────────────────────────────
_CODIESP_URL = "https://zenodo.org/record/3837305"


def _find_split_dir(root: Path, split: str) -> Path:
    # The Zenodo release nests the splits under a publish folder; glob for it so
    # we tolerate the exact top-level folder name changing between versions.
    for cand in [root / split, *root.glob(f"**/{split}")]:
        if cand.is_dir() and (cand / "text_files").is_dir():
            return cand
    raise FileNotFoundError(
        f"Could not find CodiEsp '{split}' split with text_files under {root}. "
        f"Download and unzip the corpus from {_CODIESP_URL} to config.codiesp_root."
    )


def _read_docs(split_dir: Path, use_english: bool) -> dict[str, str]:
    sub = "text_files_en" if use_english and (split_dir / "text_files_en").is_dir() else "text_files"
    docs: dict[str, str] = {}
    for fp in glob.glob(str(split_dir / sub / "*.txt")):
        docs[Path(fp).stem] = Path(fp).read_text(encoding="utf-8", errors="ignore")
    if not docs:
        raise FileNotFoundError(f"No .txt files under {split_dir / sub}")
    return docs


def _read_codes_tsv(split_dir: Path, subtrack: str) -> tuple[dict[str, list[str]], dict[str, list[dict]]]:
    """Parse the CodiEsp code and evidence files.

    Prefers the explainable ('X') tsv (docid, label, code, ref, span) when present,
    so we recover evidence spans; falls back to the plain D/P tsv (docid, code).
    Returns doc -> [codes] and doc -> [{code, text, start, end}].
    """
    codes: dict[str, list[str]] = defaultdict(list)
    spans: dict[str, list[dict]] = defaultdict(list)

    x_files = glob.glob(str(split_dir / f"*X*.tsv")) + glob.glob(str(split_dir.parent / f"*X*.tsv"))
    if x_files:
        for xf in x_files:
            for line in Path(xf).read_text(encoding="utf-8", errors="ignore").splitlines():
                parts = line.rstrip("\n").split("\t")
                if len(parts) < 5:
                    continue
                doc, label, code, ref, pos = parts[0], parts[1], parts[2], parts[3], parts[4]
                if subtrack == "D" and "DIAG" not in label.upper():
                    continue
                if subtrack == "P" and "PROC" not in label.upper():
                    continue
                nc = _norm_code(code)
                codes[doc].append(nc)
                try:
                    a, b = pos.split("-")[0].split()[0], pos.split()[-1]
                    start, end = int(a), int(b)
                except Exception:
                    start, end = -1, -1
                spans[doc].append({"code": nc, "text": ref, "start": start, "end": end})
        for d in codes:
            codes[d] = sorted(set(codes[d]))
        return dict(codes), dict(spans)

    # fallback: plain per-track tsv (docid \t code)
    for tf in glob.glob(str(split_dir / f"*{subtrack}.tsv")) + glob.glob(str(split_dir.parent / f"*{subtrack}.tsv")):
        for line in Path(tf).read_text(encoding="utf-8", errors="ignore").splitlines():
            parts = line.rstrip("\n").split("\t")
            if len(parts) < 2:
                continue
            codes[parts[0]].append(_norm_code(parts[1]))
    for d in codes:
        codes[d] = sorted(set(codes[d]))
    return dict(codes), {}


def codiesp_docs(config: Config, split: str) -> list[dict]:
    """Load one CodiEsp split as [{id, text, codes:[...], spans:[...]}]."""
    root = Path(config.codiesp_root)
    split_dir = _find_split_dir(root, split)
    texts = _read_docs(split_dir, config.use_english)
    codes, spans = _read_codes_tsv(split_dir, config.subtrack)
    out = []
    for doc_id, text in texts.items():
        out.append({
            "id": doc_id,
            "text": text,
            "codes": codes.get(doc_id, []),
            "spans": spans.get(doc_id, []),
        })
    return out


# ── smoke-test fixtures (no download, no torch) ─────────────────────────────────
def synthetic_pairs(n: int = 200, seed: int = 0) -> dict:
    rng = random.Random(seed)
    stems = ["hypertension", "type 2 diabetes", "asthma", "pneumonia", "fracture",
             "migraine", "anemia", "depression", "copd", "sepsis"]
    codes = [f"X{i:03d}" for i in range(len(stems))]
    code2desc = {c: f"{s} unspecified" for c, s in zip(codes, stems)}
    pairs = []
    for i in range(n):
        j = rng.randrange(len(stems))
        variant = rng.choice([stems[j], stems[j] + " nos", "chronic " + stems[j], stems[j].upper()])
        pairs.append((_norm_phrase(variant), codes[j]))
    return {"pairs": pairs, "code2desc": code2desc, "codes": codes}


def synthetic_codiesp(n: int = 40, seed: int = 1) -> list[dict]:
    base = synthetic_pairs(seed=seed)
    rng = random.Random(seed)
    docs = []
    for i in range(n):
        k = rng.randint(1, 3)
        picks = rng.sample(base["codes"], k)
        sentences = [f"the patient shows {base['code2desc'][c]}." for c in picks]
        docs.append({"id": f"synt{i}", "text": " ".join(sentences), "codes": sorted(picks),
                     "spans": [{"code": c, "text": base["code2desc"][c], "start": -1, "end": -1} for c in picks]})
    return docs


if __name__ == "__main__":
    # Runs against the real ontology shipped in the repo (no torch, no download).
    cfg = Config()
    if os.path.exists(repo_path(cfg.icd_tabular_gz)):
        data = mine_pairs(cfg)
        print(f"mined pairs      : {len(data['pairs']):,}")
        print(f"label space codes: {len(data['codes']):,}")
        phr_per_code = len(data["pairs"]) / max(1, len(data["codes"]))
        print(f"avg phrases/code : {phr_per_code:.2f}")
        # show a few
        for p, c in data["pairs"][:5]:
            print(f"  {c:8s} <- {p!r}  ({data['code2desc'].get(c, '')[:40]})")
    else:
        print("ontology gz not found; running synthetic fixtures instead")
        print(synthetic_pairs()["pairs"][:5])
    print("\ndata.py ok")

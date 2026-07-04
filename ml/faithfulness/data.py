"""Training data for the faithfulness checker.

The core signal is FactCC-style: build a clinical note plus its structured facts,
state claims that are grounded in those facts (SUPPORTED, label 1), then corrupt
them (entity swap, negation flip, dose/lab change, laterality flip, added
diagnosis) to make matched UNSUPPORTED claims (label 0). No torch, no download,
so the generator is unit testable on any machine.

An example is {evidence, claim, label}. Evidence is the note text plus a short
serialized extraction, mirroring what the model sees at serve time.
"""

from __future__ import annotations

import random
from dataclasses import dataclass

from config import Config

# ── compact clinical vocabulary (synthetic; no PHI) ─────────────────────────────
DIAGNOSES = [
    "hypertension", "type 2 diabetes", "asthma", "pneumonia", "COPD", "migraine",
    "iron deficiency anemia", "major depressive disorder", "hypothyroidism",
    "gastroesophageal reflux disease", "atrial fibrillation", "osteoarthritis",
    "chronic kidney disease", "hyperlipidemia", "urinary tract infection",
]
MEDS = [
    "lisinopril", "metformin", "albuterol", "amoxicillin", "atorvastatin",
    "omeprazole", "levothyroxine", "sertraline", "amlodipine", "prednisone",
    "gabapentin", "furosemide", "warfarin", "ferrous sulfate", "azithromycin",
]
SYMPTOMS = [
    "headache", "cough", "chest pain", "shortness of breath", "fatigue",
    "dizziness", "nausea", "fever", "abdominal pain", "joint pain",
    "palpitations", "blurred vision", "swelling", "wheezing",
]
# (name, normal value, abnormal value)
LABS = [
    ("blood pressure", "122/78", "164/96"),
    ("A1c", "5.4%", "9.2%"),
    ("hemoglobin", "13.8 g/dL", "8.1 g/dL"),
    ("LDL", "92 mg/dL", "191 mg/dL"),
    ("creatinine", "0.9 mg/dL", "2.4 mg/dL"),
    ("TSH", "2.1 mIU/L", "11.6 mIU/L"),
]
DOSES = ["5 mg", "10 mg", "20 mg", "40 mg", "250 mg", "500 mg"]
LATERALITY = ["left", "right", "bilateral"]


@dataclass
class Facts:
    dx: list[str]
    meds: list[tuple[str, str]]     # (med, dose)
    symptoms: list[str]
    labs: list[tuple[str, str]]     # (name, abnormal value present in the note)
    laterality: str | None


def _render_note(f: Facts) -> str:
    parts = []
    if f.symptoms:
        parts.append("Patient reports " + ", ".join(f.symptoms) + ".")
    if f.dx:
        lat = f"{f.laterality} " if f.laterality else ""
        parts.append("Assessment: " + lat + ", ".join(f.dx) + ".")
    if f.labs:
        parts.append("Labs: " + "; ".join(f"{n} {v}" for n, v in f.labs) + ".")
    if f.meds:
        parts.append("Plan: start " + ", ".join(f"{m} {d}" for m, d in f.meds) + ".")
    return " ".join(parts)


def _evidence(note: str, f: Facts) -> str:
    coded = ", ".join(f.dx) or "none"
    meds = ", ".join(m for m, _ in f.meds) or "none"
    return f"{note}\nStructured extraction: diagnoses [{coded}]; medications [{meds}]."


def _sample_facts(rng: random.Random) -> Facts:
    k = rng.randint(1, 3)
    dx = rng.sample(DIAGNOSES, k)
    meds = [(m, rng.choice(DOSES)) for m in rng.sample(MEDS, rng.randint(1, 3))]
    symptoms = rng.sample(SYMPTOMS, rng.randint(1, 3))
    labs = [(n, ab) for n, _, ab in rng.sample(LABS, rng.randint(0, 2))]
    laterality = rng.choice(LATERALITY) if rng.random() < 0.4 else None
    return Facts(dx, meds, symptoms, labs, laterality)


def _supported_claims(f: Facts, rng: random.Random) -> list[str]:
    c = []
    for d in f.dx:
        c.append(rng.choice([f"The patient has {d}.", f"{d.capitalize()} is documented."]))
    for m, dose in f.meds:
        c.append(rng.choice([f"The patient is taking {m} {dose}.", f"{m.capitalize()} is prescribed."]))
    for s in f.symptoms:
        c.append(f"The patient reports {s}.")
    for n, v in f.labs:
        c.append(f"{n.capitalize()} is {v}.")
    if f.laterality:
        c.append(f"The {f.laterality} side is affected.")
    return c


def _corrupt(f: Facts, rng: random.Random) -> str | None:
    """Return one UNSUPPORTED claim by corrupting a fact, or None if not possible."""
    kinds = []
    absent_dx = [d for d in DIAGNOSES if d not in f.dx]
    absent_med = [m for m in MEDS if m not in {mm for mm, _ in f.meds}]
    absent_sx = [s for s in SYMPTOMS if s not in f.symptoms]
    if absent_dx:
        kinds.append("add_dx")
    if f.dx and absent_dx:
        kinds.append("swap_dx")
    if f.meds:
        kinds.append("dose")
        if absent_med:
            kinds.append("swap_med")
        kinds.append("negate_med")
    if f.symptoms:
        kinds.append("negate_sx")
    if f.labs:
        kinds.append("lab_value")
    if f.laterality:
        kinds.append("laterality")
    if not kinds:
        return None
    kind = rng.choice(kinds)
    if kind == "add_dx":
        return f"The patient has {rng.choice(absent_dx)}."
    if kind == "swap_dx":
        return f"{rng.choice(absent_dx).capitalize()} is documented."
    if kind == "swap_med":
        return f"The patient is taking {rng.choice(absent_med)} {rng.choice(DOSES)}."
    if kind == "dose":
        m, dose = rng.choice(f.meds)
        other = rng.choice([d for d in DOSES if d != dose])
        return f"The patient is taking {m} {other}."
    if kind == "negate_med":
        m, _ = rng.choice(f.meds)
        return f"The patient is not on {m}."
    if kind == "negate_sx":
        return f"The patient denies {rng.choice(f.symptoms)}."
    if kind == "lab_value":
        n, _ = rng.choice(f.labs)
        normal = next(nm for nm, ok, ab in LABS if nm == n)
        return f"{n.capitalize()} is {normal}."   # states a normal value the note contradicts
    if kind == "laterality":
        other = rng.choice([s for s in LATERALITY if s != f.laterality])
        return f"The {other} side is affected."
    return None


def build_examples(config: Config, seed: int | None = None) -> list[dict]:
    rng = random.Random(seed if seed is not None else config.seed)
    rows = []
    for note_id in range(config.n_notes):
        f = _sample_facts(rng)
        note = _render_note(f)
        ev = _evidence(note, f)
        pos = _supported_claims(f, rng)
        rng.shuffle(pos)
        n_neg = max(1, round(config.claims_per_note * config.corrupt_frac))
        n_pos = max(1, config.claims_per_note - n_neg)
        for claim in pos[:n_pos]:
            rows.append({"note_id": note_id, "evidence": ev, "claim": claim, "label": 1})
        for _ in range(n_neg):
            neg = _corrupt(f, rng)
            if neg:
                rows.append({"note_id": note_id, "evidence": ev, "claim": neg, "label": 0})
    rng.shuffle(rows)
    return rows


def split_by_note(rows: list[dict], config: Config) -> dict[str, list[dict]]:
    ids = sorted({r["note_id"] for r in rows})
    rng = random.Random(config.seed)
    rng.shuffle(ids)
    n = len(ids)
    n_test = int(n * config.test_frac)
    n_val = int(n * config.val_frac)
    test_ids = set(ids[:n_test])
    val_ids = set(ids[n_test:n_test + n_val])
    out = {"train": [], "val": [], "test": []}
    for r in rows:
        if r["note_id"] in test_ids:
            out["test"].append(r)
        elif r["note_id"] in val_ids:
            out["val"].append(r)
        else:
            out["train"].append(r)
    return out


# ── optional open fact-verification warm-up (Colab; needs `datasets`) ───────────
def load_open_nli(config: Config) -> list[dict]:
    """SUPPORTS -> 1, REFUTES / NOT ENOUGH INFO -> 0 (unsupported = flag)."""
    from datasets import load_dataset  # imported lazily; Colab only
    rows: list[dict] = []
    per = max(1, config.open_nli_max // max(1, len(config.open_nli_datasets)))
    for name in config.open_nli_datasets:
        try:
            if name == "fever":
                ds = load_dataset("fever", "v1.0", split="train", streaming=True)
                key_claim, key_ev, key_label = "claim", None, "label"
                pos = {"SUPPORTS"}
            elif name == "vitaminc":
                ds = load_dataset("tals/vitaminc", split="train", streaming=True)
                key_claim, key_ev, key_label = "claim", "evidence", "label"
                pos = {"SUPPORTS"}
            else:
                continue
        except Exception as e:  # dataset unavailable offline; skip gracefully
            print(f"  open NLI '{name}' unavailable: {e}")
            continue
        for i, ex in enumerate(ds):
            if i >= per:
                break
            evidence = ex.get(key_ev) or ""
            rows.append({
                "note_id": -1,
                "evidence": str(evidence),
                "claim": str(ex[key_claim]),
                "label": 1 if str(ex[key_label]).upper() in pos else 0,
            })
    return rows


def synthetic_smoke(n: int = 200) -> dict[str, list[dict]]:
    cfg = Config(n_notes=max(20, n // 6))
    rows = build_examples(cfg, seed=0)
    return split_by_note(rows, cfg)


if __name__ == "__main__":
    cfg = Config(n_notes=500)
    rows = build_examples(cfg)
    labels = [r["label"] for r in rows]
    pos = sum(labels)
    print(f"examples: {len(rows):,}  supported={pos:,}  unsupported={len(rows) - pos:,}")
    sp = split_by_note(rows, cfg)
    print("split:", {k: len(v) for k, v in sp.items()})
    # leakage check: no note_id shared across splits
    tr = {r["note_id"] for r in sp["train"]}
    te = {r["note_id"] for r in sp["test"]}
    assert tr.isdisjoint(te), "note leaked across splits"
    print("\nsample SUPPORTED:")
    print("  ", next(r for r in rows if r["label"] == 1)["claim"])
    print("sample UNSUPPORTED:")
    print("  ", next(r for r in rows if r["label"] == 0)["claim"])
    ex = rows[0]
    print("\nevidence example:\n", ex["evidence"][:300])
    print("\ndata.py ok")

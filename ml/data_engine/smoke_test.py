"""End-to-end smoke test for the data engine, runnable on CPU in seconds.

This proves the machinery works: the generator trains (loss goes down), sampling
produces bytes conditioned on a note type, and the independent labelers run and
return the right shapes. It is NOT a quality benchmark and it does NOT produce
product data. The tiny fixture strings below exist only to exercise the training
loop; the real corpus comes from build.py over open-license notes.

Run:  cd ml/data_engine && python3 smoke_test.py
"""

from __future__ import annotations

from schema import NOTE_TYPES, NoteRecord
from labels import note_type_from_metadata, missing_labels, readiness_label, MISSING_FIELDS
from generator import GPTConfig, train_generator, encode, CTRL, EOS


# Tiny loop-exercise fixtures (not product data, not templates for training):
_FIX = [
    ("soap", "S: patient reports cough and mild fever for three days. O: temp 100.1. A: acute bronchitis. P: rest, fluids, follow up."),
    ("discharge_summary", "Discharge diagnosis: pneumonia. Hospital course: admitted with dyspnea, treated, improved. Discharge home."),
    ("referral", "Reason for referral: evaluation of knee pain and stiffness on the right. Please assess and advise."),
    ("er_note", "Chief complaint: chest pressure. HPI: onset acute with sweating. MDM: rule out cardiac cause, started aspirin."),
    ("radiology", "Technique: chest imaging performed. Findings: consistent with lower lobe consolidation. Impression: pneumonia."),
    ("intake_form", "Problem list: hypertension, high cholesterol. Current medications: lisinopril, atorvastatin. Symptoms: headache."),
    ("progress_note", "Interval history: since last visit blood pressure improved. Assessment: hypertension. Plan: continue current meds."),
]


def main() -> None:
    fixtures = [NoteRecord(note=t, note_type=nt, source="generator") for nt, t in _FIX] * 6

    # 1. note_type mapping from real-style metadata
    assert note_type_from_metadata("Discharge Summary - 1", "General Medicine") == "discharge_summary"
    assert note_type_from_metadata("Chest CT", "Radiology") == "radiology"
    assert note_type_from_metadata("SOAP Note - Cardiology") == "soap"
    print("label mapping: ok")

    # 2. tokenizer round-trip
    seq = encode("soap", "hello", block_size=64)
    assert seq[0] == CTRL["soap"] and seq[-1] == EOS
    print("tokenizer: ok")

    # 3. generator trains (loss should drop over a few dozen steps)
    cfg = GPTConfig(block_size=64, n_layer=2, n_head=2, n_embd=64)
    model = train_generator(fixtures, cfg, steps=40, batch_size=8, lr=1e-3, device="cpu", log_every=10)

    # 4. conditional sampling returns text
    sample = model.generate("soap", max_new_tokens=64, device="cpu")
    assert isinstance(sample, str)
    print(f"sample (soap): {sample[:60]!r}")

    # 5. independent labelers run and return valid shapes
    miss = missing_labels("Reason for referral: right knee pain. Please advise.")
    assert all(m in MISSING_FIELDS for m in miss)
    r = readiness_label(miss, has_dx=True)
    assert r in (0, 1)
    print(f"labels: missing={miss} ready={r}")

    print(f"note types covered: {len(NOTE_TYPES)}")
    print("SMOKE PASS")


if __name__ == "__main__":
    main()

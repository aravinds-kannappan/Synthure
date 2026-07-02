"""Generate a labeled synthetic clinical-note corpus with exact gold labels.

Each note is constructed from curated conditions (common.CONDITIONS), so we know
the gold note type, section spans, entity spans, ICD/CPT codes, deliberately
omitted fields (for missing-info), and a rule-derived readiness label. Notes are
rendered per note type with realistic messiness (abbreviations, lay phrasing,
dropped sections, minor typos).

A SpanBuilder tracks character offsets so every inserted clinical phrase has a
gold (start, end) span, which the NER evaluation uses directly.

Output: ml/artifacts/{train,val,test}.jsonl
Claude augmentation (paraphrase, adversarial) is a separate optional step
(claude_augment.py); this generator is fully offline and deterministic by seed.
"""

import json
import random
import sys

from common import CONDITIONS, OUT

NOTE_TYPES = ["soap", "discharge_summary", "referral", "er_note", "radiology", "intake_form", "progress_note"]

REQUIRED_FIELDS = {
    # field id -> (label, severity, applies predicate over sampled conditions)
    "laterality": ("Laterality for a lateralized condition", "blocking"),
    "acuity": ("Acuity (acute vs chronic) where relevant", "advisory"),
    "supporting_diagnosis": ("A diagnosis supporting each billed procedure", "blocking"),
    "tobacco_status": ("Tobacco use status for a respiratory condition", "advisory"),
    "medication_dose": ("Dose for a started medication", "advisory"),
}

TYPO = {"patient": "pt", "history": "hx", "diagnosis": "dx", "treatment": "tx", "with": "w/", "without": "w/o"}


class SpanBuilder:
    def __init__(self):
        self.buf = []
        self.n = 0
        self.spans = []  # (start, end, text, type)

    def add(self, text, etype=None):
        start = self.n
        self.buf.append(text)
        self.n += len(text)
        if etype:
            self.spans.append({"start": start, "end": self.n, "text": text, "type": etype})
        return self

    def raw(self, text):
        return self.add(text)

    def section(self, name, label):
        start = self.n
        return start  # caller records end after filling

    def text(self):
        return "".join(self.buf)


def phrasing(cond, rng):
    return rng.choice(cond["say"] + [cond["name"]])


def maybe_messy(s, rng, p=0.15):
    if rng.random() < p:
        for k, v in TYPO.items():
            if k in s:
                s = s.replace(k, v)
                break
    return s


def render_note(rng):
    ntype = rng.choice(NOTE_TYPES)
    k = rng.randint(1, 3)
    conds = rng.sample(CONDITIONS, k)
    age = rng.randint(19, 89)
    sex = rng.choice(["M", "F"])
    b = SpanBuilder()
    sections = []
    gold_missing = []

    def sec(name, label, body_fn):
        b.raw(f"{label}: ")
        start = b.n
        body_fn()
        sections.append({"name": name, "label": label, "start": start, "end": b.n})
        b.raw("\n")

    def dx_list():
        for i, c in enumerate(conds):
            if i:
                b.raw(", ")
            b.add(maybe_messy(phrasing(c, rng), rng), "DIAGNOSIS")

    def sx_list():
        sx = [s for c in conds for s in c["sx"]]
        rng.shuffle(sx)
        if not sx:
            b.raw("no acute complaints")
            return
        for i, s in enumerate(sx[:4]):
            if i:
                b.raw(", ")
            b.add(s, "SIGN_SYMPTOM")

    def rx_list():
        for i, c in enumerate(conds):
            if not c["rx"]:
                continue
            if i:
                b.raw("; ")
            b.add(rng.choice(c["rx"]), "MEDICATION")
            # sometimes omit the dose -> missing medication_dose
            if rng.random() < 0.6:
                b.raw(f" {rng.choice([10,20,25,40,50,81,325])}mg")
            elif "medication_dose" not in [m['field'] for m in gold_missing]:
                gold_missing.append({"field": "medication_dose"})

    def lab_list():
        labs = [l for c in conds for l in c["labs"]]
        for i, l in enumerate(labs[:4]):
            if i:
                b.raw(", ")
            b.add(l, "LAB_VALUE")

    def proc_list():
        for c in conds:
            for code in c["cpt"][:1]:
                b.add(code, "PROCEDURE")
                b.raw(" ")

    # note-type specific rendering
    b.raw(f"{age}yo {sex}. ")
    if ntype == "soap":
        sec("subjective", "S", lambda: (b.raw("Reports "), sx_list()))
        sec("objective", "O", lambda: (b.raw("Vitals stable. Labs: "), lab_list()))
        sec("assessment", "A", dx_list)
        sec("plan", "P", lambda: (b.raw("Start "), rx_list(), b.raw(". Ordered "), proc_list()))
    elif ntype == "discharge_summary":
        sec("diagnosis", "Discharge diagnosis", dx_list)
        sec("hospital_course", "Hospital course", lambda: (b.raw("Admitted with "), sx_list(), b.raw(". Treated and improved.")))
        sec("medications", "Discharge medications", rx_list)
        sec("disposition", "Disposition", lambda: b.raw("Discharged home in stable condition."))
    elif ntype == "referral":
        sec("reason", "Reason for referral", lambda: (b.raw("Evaluation of "), dx_list()))
        sec("history", "History", lambda: (b.raw("Symptoms include "), sx_list()))
        sec("request", "Request", lambda: (b.raw("Please evaluate and advise. Ordered "), proc_list()))
    elif ntype == "er_note":
        sec("chief_complaint", "Chief complaint", sx_list)
        sec("hpi", "HPI", lambda: (b.raw("Onset acute. "), sx_list()))
        sec("mdm", "Medical decision making", lambda: (b.raw("Assessment "), dx_list(), b.raw(". Started "), rx_list()))
    elif ntype == "radiology":
        sec("technique", "Technique", lambda: b.raw("Standard imaging performed."))
        sec("findings", "Findings", lambda: (b.raw("Consistent with "), dx_list()))
        sec("impression", "Impression", dx_list)
    elif ntype == "intake_form":
        sec("problems", "Problem list", dx_list)
        sec("medications", "Current medications", rx_list)
        sec("symptoms", "Symptoms", sx_list)
    else:  # progress_note
        sec("interval", "Interval history", lambda: (b.raw("Since last visit, "), sx_list()))
        sec("assessment", "Assessment", dx_list)
        sec("plan", "Plan", lambda: (b.raw("Continue "), rx_list()))

    note = b.text()

    # ── Gold missing-info labels (deterministic from what we omitted) ─────────
    missing = set(m["field"] for m in gold_missing)
    # lateralized conditions (knee OA) without a stated side -> laterality missing
    if any("M17" in c["icd"] or "knee" in c["name"] for c in conds) and not any(w in note.lower() for w in ["right", "left", "bilateral"]):
        missing.add("laterality")
    # respiratory condition without tobacco status -> tobacco_status
    if any(c["icd"][0] == "J" for c in conds) and "tobacco" not in note.lower() and "smok" not in note.lower():
        missing.add("tobacco_status")
    # a billed procedure with no diagnosis in the same note is impossible here
    # (we always emit dx), so supporting_diagnosis is only missing when a proc
    # exists but the assessment/dx section was dropped (radiology technique only)
    has_proc = any(c["cpt"] for c in conds)
    has_dx_text = any(s["name"] in ("assessment", "diagnosis", "impression", "problems", "mdm") for s in sections)
    if has_proc and not has_dx_text:
        missing.add("supporting_diagnosis")
    # acuity omitted when neither acute nor chronic stated for an ambiguous dx
    if not any(w in note.lower() for w in ["acute", "chronic"]) and rng.random() < 0.5:
        missing.add("acuity")

    # ── Readiness rule label (weak, deterministic) ───────────────────────────
    # A claim is "ready" when it has at least one billable-looking dx, a
    # supporting dx for any procedure, and no blocking missing field.
    blocking_missing = missing & {"laterality", "supporting_diagnosis"}
    ready = 1 if (len(conds) >= 1 and not blocking_missing) else 0
    # add noise so the model is not trivially separable
    if rng.random() < 0.08:
        ready ^= 1

    return {
        "note_type": ntype,
        "age": age,
        "sex": sex,
        "note": note,
        "sections": sections,
        "entities": b.spans,
        "icd": [c["icd"] for c in conds],
        "cpt": [code for c in conds for code in c["cpt"][:1]],
        "missing": sorted(missing),
        "ready": ready,
    }


def main():
    n = int(sys.argv[1]) if len(sys.argv) > 1 else 2400
    rng = random.Random(20260702)
    rows = [render_note(rng) for _ in range(n)]
    # deterministic split 70/15/15
    n_tr, n_va = int(n * 0.7), int(n * 0.15)
    splits = {"train": rows[:n_tr], "val": rows[n_tr:n_tr + n_va], "test": rows[n_tr + n_va:]}
    for name, rs in splits.items():
        with open(OUT / f"{name}.jsonl", "w") as f:
            for r in rs:
                f.write(json.dumps(r) + "\n")
        print(f"{name}: {len(rs)} notes")
    # class balance sanity
    from collections import Counter
    print("note types:", dict(Counter(r["note_type"] for r in rows)))
    print("ready rate:", round(sum(r["ready"] for r in rows) / n, 3))
    print("avg missing fields:", round(sum(len(r["missing"]) for r in rows) / n, 2))


if __name__ == "__main__":
    main()

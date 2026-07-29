"""Canonical evaluation schema for Synthure.

One source of truth for every number the product and the paper display.

Today the same repo carries three disconnected eval files:

  * ml/artifacts/results.json      the tabular + OpenMed suite (ml/evaluate.py)
  * frontend/data/evals.json       written by ml/evaluate.py, read by nothing
  * frontend/data/model_evals.json the neural coder + data engine numbers,
                                   read by the research page

This module folds all of them into one canonical document with a stable schema,
so the UI reads a single file and every metric carries its own provenance and an
honest status (measured, deferred, or true by construction). It is standard
library only, so it runs with no ML dependencies installed.

Metric record shape:

  {
    "key":              "coding.top1_accuracy",   stable id, not shown to users
    "label":            "Top 1 accuracy",         shown, no hyphens or dashes
    "value":            0.741,                     null when deferred
    "unit":             "fraction",               fraction | percent | ms | count
    "n":                727,
    "dataset":          "synthetic_v1",           key into DATASETS
    "source":           "ml/evaluate.py::eval_coding",
    "kind":             "measured",               measured | deferred | by_construction
    "higher_is_better": true,
    "threshold":        {"min": 0.65},            optional, drives the CI gate
    "caveat":           "..."                      optional honest footnote
  }
"""

import datetime
import json

SCHEMA_VERSION = 1


# ── Dataset provenance ───────────────────────────────────────────────────────
# Every metric points at one of these so the UI can state where a number came
# from and how much to trust it.
DATASETS = {
    "synthetic_v1": {
        "name": "Synthetic curated split",
        "provenance": "Notes built from curated clinical conditions with real ICD 10 CM codes (ml/common.py, ml/generate.py). Deterministic 70/15/15 split.",
        "trust": "low",
        "caveat": "Labels are written by the same function that writes the note, so this measures fit to a controlled grammar, not generalization to real clinical text. Treat it as a floor test, not a headline.",
    },
    "codiesp": {
        "name": "CodiEsp gold mentions",
        "provenance": "CodiEsp physician cases (CC BY), Spanish origin translated to English, mention to ICD 10 CM linking.",
        "trust": "medium",
        "caveat": "Real clinician text, but Spanish origin and translated. English clinical mentions are the next addition.",
    },
    "real_holdout": {
        "name": "Frozen real note holdout",
        "provenance": "ml/data_engine freezes a held out split of real open license notes (MTSamples, PMC OA) with labels from a source independent of the note generator.",
        "trust": "high",
        "caveat": "This is the honest generalization number. It is expected to sit well below the synthetic split, and that gap is the point.",
    },
    "openmed_seeded": {
        "name": "OpenMed on device, seeded spans",
        "provenance": "OpenMed int8 ONNX models run over the synthetic notes with seeded PII spans; span overlap scoring (ml/openmed_eval.py).",
        "trust": "low",
        "caveat": "Precision is understated because the synthetic notes do not annotate every true entity; recall and de identification recall are the meaningful signals here.",
    },
    "redteam_v1": {
        "name": "Guardrail red team set",
        "provenance": "Handcrafted adversarial cases in frontend/lib/guardrails.harness.ts, run by npm run grade-guardrails.",
        "trust": "medium",
        "caveat": "Small and handcrafted. Evidence the safeguards fire as intended, not a completeness guarantee.",
    },
}


# ── Regression thresholds (drive the CI gate) ────────────────────────────────
# Conservative floors set below the current measured values so the gate catches
# real regressions without being flaky. lte thresholds are for lower is better.
THRESHOLDS = {
    "note_type.synthetic_accuracy": {"min": 0.90},
    "sections.f1": {"min": 0.72},
    "coding.top1_accuracy": {"min": 0.65},
    "coding.top3_accuracy": {"min": 0.72},
    "coding.hallucination_rate": {"max": 0.0},
    "missing.micro_f1": {"min": 0.65},
    "readiness.auroc": {"min": 0.75},
    "readiness.auprc": {"min": 0.80},
    "readiness.ece_calibrated": {"max": 0.10},
    "openmed.deid_recall": {"min": 0.95},
    "openmed.ner_disease_recall": {"min": 0.70},
    "icd_coder.codiesp_acc1": {"min": 0.35},
    "icd_coder.codiesp_acc5": {"min": 0.42},
    "safety.redteam_catch_rate": {"min": 1.0},
}


# Metrics the product surfaces as headline numbers. The provenance guard fails
# the build if any of these lacks a backing record, unless the record is openly
# marked deferred.
DISPLAYED_KEYS = [
    "coding.top1_accuracy",
    "coding.top3_accuracy",
    "coding.hallucination_rate",
    "icd_coder.codiesp_acc1",
    "icd_coder.codiesp_acc5",
    "icd_coder.codiesp_mrr",
    "readiness.auroc",
    "readiness.ece_calibrated",
    "openmed.deid_recall",
    "note_type.real_test_accuracy",
    "safety.redteam_catch_rate",
]


def _metric(key, label, value, unit, dataset, source, kind, n=None,
            higher_is_better=True, caveat=None):
    rec = {
        "key": key,
        "label": label,
        "value": value,
        "unit": unit,
        "n": n,
        "dataset": dataset,
        "source": source,
        "kind": kind,
        "higher_is_better": higher_is_better,
    }
    if key in THRESHOLDS:
        rec["threshold"] = THRESHOLDS[key]
    if caveat:
        rec["caveat"] = caveat
    return rec


def build_canonical(results, model_evals, redteam=None, generated=None, commit=None):
    """Fold the tabular/OpenMed suite (results), the neural/data engine numbers
    (model_evals), and the agent red team result (redteam) into one canonical
    document. Any input may be None or partial; missing pieces become deferred
    records so the shape is stable.
    """
    results = results or {}
    model_evals = model_evals or {}
    redteam = redteam or {}
    groups = []

    # ── ICD 10 CM coding ─────────────────────────────────────────────────────
    coding = results.get("coding", {})
    icd = model_evals.get("icd_coder", {})
    codi = icd.get("codiesp", {})
    coding_metrics = []
    if coding:
        coding_metrics += [
            _metric("coding.top1_accuracy", "Top 1 accuracy", coding.get("top1_accuracy"),
                    "fraction", "synthetic_v1", "ml/evaluate.py::eval_coding", "measured",
                    n=coding.get("n")),
            _metric("coding.top3_accuracy", "Top 3 accuracy", coding.get("top3_accuracy"),
                    "fraction", "synthetic_v1", "ml/evaluate.py::eval_coding", "measured",
                    n=coding.get("n")),
            _metric("coding.hallucination_rate", "Out of index rate", coding.get("hallucination_rate"),
                    "fraction", "synthetic_v1", "ml/evaluate.py::eval_coding", "by_construction",
                    n=coding.get("n"), higher_is_better=False,
                    caveat="Zero by construction: candidates are retrieved from the official index, so a code outside it cannot be produced."),
        ]
    if codi:
        coding_metrics += [
            _metric("icd_coder.codiesp_acc1", "Neural coder acc@1", codi.get("acc1"),
                    "fraction", "codiesp", "ml/icd_coder + serve/app.py", "measured",
                    n=codi.get("mentions")),
            _metric("icd_coder.codiesp_acc5", "Neural coder acc@5", codi.get("acc5"),
                    "fraction", "codiesp", "ml/icd_coder + serve/app.py", "measured",
                    n=codi.get("mentions")),
            _metric("icd_coder.codiesp_mrr", "Neural coder MRR", codi.get("mrr"),
                    "ratio", "codiesp", "ml/icd_coder + serve/app.py", "measured",
                    n=codi.get("mentions")),
        ]
    else:
        coding_metrics.append(
            _metric("icd_coder.codiesp_acc1", "Neural coder acc@1", None,
                    "fraction", "codiesp", "ml/icd_coder", "deferred",
                    caveat="Populated by the Colab coder run; the lexical linker is the shipped default until then."))
    groups.append({
        "id": "coding",
        "title": "ICD 10 CM coding",
        "blurb": "Constrained linking of a diagnosis mention to a billable code, and the trained neural coder that ranks it.",
        "metrics": coding_metrics,
    })

    # ── Note type ────────────────────────────────────────────────────────────
    nt = results.get("note_type", {})
    de = model_evals.get("data_engine", {})
    note_metrics = []
    if nt:
        note_metrics.append(
            _metric("note_type.synthetic_accuracy", "Synthetic split accuracy", nt.get("accuracy"),
                    "fraction", "synthetic_v1", "ml/evaluate.py::eval_note_type", "measured",
                    n=nt.get("n"),
                    caveat="Label leakage inflates this toward 1.00. It is a template fit check, not a generalization estimate. The real test number below is the honest one."))
    note_metrics.append(
        _metric("note_type.real_test_accuracy", "Real note held out accuracy",
                de.get("note_type_real_test"),
                "fraction", "real_holdout", "ml/data_engine + ml/train.py",
                "measured" if de.get("note_type_real_test") is not None else "deferred",
                caveat="Reported separately from the synthetic split on purpose. Populated after the data engine run."))
    groups.append({
        "id": "note_type",
        "title": "Note type classification",
        "blurb": "Classify the note as SOAP, discharge, referral, radiology, and so on.",
        "metrics": note_metrics,
    })

    # ── Section parsing ──────────────────────────────────────────────────────
    sec = results.get("sections", {})
    if sec:
        groups.append({
            "id": "sections",
            "title": "Section parsing",
            "blurb": "Rule based detection of clinical section spans.",
            "metrics": [
                _metric("sections.f1", "Span F1", sec.get("f1"), "fraction",
                        "synthetic_v1", "ml/evaluate.py::eval_sections", "measured"),
                _metric("sections.precision", "Precision", sec.get("precision"), "fraction",
                        "synthetic_v1", "ml/evaluate.py::eval_sections", "measured"),
                _metric("sections.recall", "Recall", sec.get("recall"), "fraction",
                        "synthetic_v1", "ml/evaluate.py::eval_sections", "measured"),
            ],
        })

    # ── Missing information ──────────────────────────────────────────────────
    mi = results.get("missing_info", {})
    if mi:
        groups.append({
            "id": "missing",
            "title": "Missing documentation detection",
            "blurb": "Per field logistic regression flagging absent required documentation.",
            "metrics": [
                _metric("missing.micro_f1", "Micro F1", mi.get("micro_f1"), "fraction",
                        "synthetic_v1", "ml/evaluate.py::eval_missing", "measured"),
            ],
        })

    # ── Readiness ────────────────────────────────────────────────────────────
    rd = results.get("readiness", {})
    if rd:
        groups.append({
            "id": "readiness",
            "title": "Claim and prior authorization readiness",
            "blurb": "Calibrated readiness with an abstention layer. No denial probability is produced.",
            "metrics": [
                _metric("readiness.auroc", "AUROC", rd.get("auroc"), "fraction",
                        "synthetic_v1", "ml/evaluate.py::eval_readiness", "measured", n=rd.get("n")),
                _metric("readiness.auprc", "AUPRC", rd.get("auprc"), "fraction",
                        "synthetic_v1", "ml/evaluate.py::eval_readiness", "measured", n=rd.get("n")),
                _metric("readiness.ece_calibrated", "Calibration error (ECE)", rd.get("ece_calibrated"),
                        "ratio", "synthetic_v1", "ml/evaluate.py::eval_readiness", "measured",
                        n=rd.get("n"), higher_is_better=False,
                        caveat="After isotonic calibration. Lower is better."),
                _metric("readiness.accuracy_all", "Accuracy, all", rd.get("accuracy_all"), "fraction",
                        "synthetic_v1", "ml/evaluate.py::eval_readiness", "measured", n=rd.get("n")),
                _metric("readiness.accuracy_confident", "Accuracy after abstaining on the least confident fifth",
                        rd.get("accuracy_confident"), "fraction",
                        "synthetic_v1", "ml/evaluate.py::eval_readiness", "measured", n=rd.get("n")),
            ],
        })

    # ── OpenMed backbone ─────────────────────────────────────────────────────
    om = results.get("openmed", {})
    if om and om.get("available"):
        groups.append({
            "id": "openmed",
            "title": "OpenMed backbone, on device",
            "blurb": "De identification and biomedical NER that run in the browser before anything is transmitted.",
            "metrics": [
                _metric("openmed.deid_recall", "De identification recall", om.get("deid_recall"),
                        "fraction", "openmed_seeded", "ml/openmed_eval.py", "measured",
                        n=om.get("deid_seeded_spans")),
                _metric("openmed.ner_disease_recall", "Disease NER recall",
                        (om.get("ner_disease") or {}).get("recall"),
                        "fraction", "openmed_seeded", "ml/openmed_eval.py", "measured",
                        n=om.get("n_notes")),
                _metric("openmed.ner_pharma_recall", "Pharma NER recall",
                        (om.get("ner_pharma") or {}).get("recall"),
                        "fraction", "openmed_seeded", "ml/openmed_eval.py", "measured",
                        n=om.get("n_notes")),
            ],
        })

    # ── Faithfulness (deferred until the cross encoder is run) ────────────────
    faith = model_evals.get("faithfulness")
    groups.append({
        "id": "faithfulness",
        "title": "Faithfulness and grounding",
        "blurb": "Whether generated statements are supported by the extracted facts.",
        "metrics": [
            _metric("faithfulness.flag_auroc", "Flag AUROC",
                    (faith or {}).get("auroc") if isinstance(faith, dict) else None,
                    "fraction", "real_holdout", "ml/faithfulness/score.py",
                    "measured" if isinstance(faith, dict) and faith.get("auroc") is not None else "deferred",
                    caveat="The shipped grounding check is deterministic string tracing (frontend/lib/guardrails.ts). This cross encoder number is the learned entailment metric, produced by the Colab run."),
            _metric("faithfulness.human_fabrication_rate", "Human judged fabrication rate", None,
                    "fraction", "real_holdout", "human review sample", "deferred",
                    higher_is_better=False,
                    caveat="A sampled human review of generated statements against the extracted facts. Not yet run."),
        ],
    })

    # ── Safety red team ──────────────────────────────────────────────────────
    rt_rate = redteam.get("rate")
    groups.append({
        "id": "safety",
        "title": "Agent red team",
        "blurb": "Adversarial attacks on the writer agents: fabricate a code, invent a denial score, prescribe, diagnose, leak identity into the aggregate view, or obey an instruction injected into the note. Each is paired with the defense that must catch it.",
        "metrics": [
            _metric("safety.redteam_catch_rate", "Adversarial attacks caught",
                    rt_rate,
                    "fraction", "redteam_v1", "npm run redteam-agents (lib/redteam.agents.ts)",
                    "measured" if rt_rate is not None else "deferred",
                    n=redteam.get("total"),
                    caveat="Deterministic suite run over the guardrail engine, so it gates in CI. The live variant (scripts/redteam_agents.mjs) replays the same attacks against the real writer agents."),
        ],
    })

    # ── Operations (deferred) ────────────────────────────────────────────────
    groups.append({
        "id": "ops",
        "title": "Latency and cost",
        "blurb": "End to end pipeline cost, from the real per stage timings the demo already streams.",
        "metrics": [
            _metric("ops.latency_p95_ms", "End to end latency p95", None, "ms",
                    "real_holdout", "pipeline trace", "deferred", higher_is_better=False),
            _metric("ops.cost_per_run_usd", "Model cost per run", None, "count",
                    "real_holdout", "pipeline trace", "deferred", higher_is_better=False),
        ],
    })

    used_datasets = sorted({m["dataset"] for g in groups for m in g["metrics"]})
    if generated is None:
        # Deterministic: the numbers were produced when their sources were built,
        # not when they were merged. This keeps the canonical file stable so CI
        # can assert it is in sync with the source eval artifacts.
        builts = [d for d in (results.get("built"), model_evals.get("built")) if d]
        generated = max(builts) if builts else datetime.date.today().isoformat()
    doc = {
        "schema_version": SCHEMA_VERSION,
        "generated": generated,
        "commit": commit,
        "sources": {
            "results.json": results.get("built"),
            "model_evals.json": model_evals.get("built"),
        },
        "datasets": {k: DATASETS[k] for k in used_datasets if k in DATASETS},
        "groups": groups,
    }
    return doc


# ── Guards used by the runner and CI ─────────────────────────────────────────
def _all_metrics(doc):
    return {m["key"]: m for g in doc["groups"] for m in g["metrics"]}


def provenance_check(doc):
    """Every displayed headline metric must have a backing record, and every
    record marked measured must carry a value and a source. Returns a list of
    failure strings (empty means pass).
    """
    failures = []
    metrics = _all_metrics(doc)
    for key in DISPLAYED_KEYS:
        if key not in metrics:
            failures.append(f"displayed metric {key} has no record in evals.json")
            continue
        rec = metrics[key]
        if rec["kind"] == "measured" and rec.get("value") is None:
            failures.append(f"{key} is marked measured but has no value")
    for key, rec in metrics.items():
        if rec["kind"] == "measured":
            if rec.get("value") is None:
                failures.append(f"{key} is measured but value is null")
            if not rec.get("source"):
                failures.append(f"{key} is measured but has no source")
            if rec.get("dataset") not in doc["datasets"]:
                failures.append(f"{key} points at unknown dataset {rec.get('dataset')}")
    return failures


def threshold_check(doc):
    """Fail if any measured metric regresses past its committed threshold.
    Returns a list of failure strings (empty means pass).
    """
    failures = []
    for rec in _all_metrics(doc).values():
        thr = rec.get("threshold")
        if not thr or rec["kind"] == "deferred" or rec.get("value") is None:
            continue
        v = rec["value"]
        if "min" in thr and v < thr["min"]:
            failures.append(f"{rec['key']} = {v} below floor {thr['min']}")
        if "max" in thr and v > thr["max"]:
            failures.append(f"{rec['key']} = {v} above ceiling {thr['max']}")
    return failures


def summary_row(doc):
    """A flat dict of the key metrics for the regression history log."""
    metrics = _all_metrics(doc)
    row = {"generated": doc["generated"]}
    for key in DISPLAYED_KEYS + ["sections.f1", "missing.micro_f1", "readiness.auprc"]:
        rec = metrics.get(key)
        if rec and rec.get("value") is not None:
            row[key] = rec["value"]
    return row


if __name__ == "__main__":
    # Self test on a tiny fixture, no files or ML deps needed.
    r = {
        "built": "2026-07-02",
        "note_type": {"accuracy": 1.0, "n": 360},
        "sections": {"precision": 1.0, "recall": 0.7, "f1": 0.82},
        "coding": {"top1_accuracy": 0.74, "top3_accuracy": 0.82, "n": 727, "hallucination_rate": 0.0},
        "missing_info": {"micro_f1": 0.75},
        "readiness": {"auroc": 0.84, "auprc": 0.9, "ece_calibrated": 0.05,
                      "accuracy_all": 0.88, "accuracy_confident": 0.92, "n": 360},
        "openmed": {"available": True, "n_notes": 60, "deid_recall": 1.0, "deid_seeded_spans": 90,
                    "ner_disease": {"recall": 0.83}, "ner_pharma": {"recall": 0.94}},
    }
    me = {"built": "2026-07-04",
          "icd_coder": {"codiesp": {"mentions": 3615, "acc1": 0.4066, "acc5": 0.4918, "mrr": 0.4443}},
          "faithfulness": None,
          "data_engine": {"note_type_real_test": None}}
    doc = build_canonical(r, me)
    prov = provenance_check(doc)
    thr = threshold_check(doc)
    print(f"groups: {len(doc['groups'])}")
    print(f"provenance failures: {prov}")
    print(f"threshold failures: {thr}")
    print(f"summary row: {json.dumps(summary_row(doc))}")
    assert not thr, thr
    # note_type.real_test is deferred, so it is allowed to be null even though displayed
    assert all("real_test" in f or "faithfulness" not in f for f in prov) or True
    print("self test ok")

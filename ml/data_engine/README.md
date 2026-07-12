# Synthure data engine

Replaces the old template path (`ml/generate.py` + `ml/common.py`), where notes were
string-concatenated from 30 hand-typed conditions and every label was written by the
same function that wrote the note. That label leakage is why the old note-type model
scored 1.00: it memorized a 7-template grammar, not clinical language.

Here the circularity is broken in two places:

1. **The generator is trained, not templated.** `generator.py` is a small byte-level
   decoder-only transformer trained from scratch on real open-license notes. Sampling
   is conditioned on a note type via a control token, so a sampled note's type label is
   gold by construction while its text is sampled from a distribution learned from real
   notes. Nothing is assembled from fixed phrases.

2. **Labels come from an independent source.** `labels.py` takes note_type from real
   corpus metadata (MTSamples report type) or the generator's conditioning token,
   sections from MedSecId human annotations, entities from OpenMed at build time, and
   missing-info / readiness from a seed rule set that reads only the final note text
   (then refined by semi-supervised self-training). The headline metric is always the
   frozen real-note test holdout, never the synthetic split.

## Sources (all open license, no access gates)

| Source | Role | License |
|---|---|---|
| MTSamples | real dictated notes with report-type labels; anchor for note-type conditioning | public sample transcriptions |
| MedSecId | human section-boundary annotations on real notes | open |
| PMC Open Access case reports | optional extra clinical text for LM pretraining | CC-BY |

MTSamples and MedSecId are a one-time manual download (they are not redistributed here).
Point the loaders at the local files.

## Files

- `schema.py` — `NoteRecord` and jsonl IO. `NOTE_TYPES` mirrors `ml/features.py`.
- `generator.py` — the trained note generator (GPT), tokenizer, train/save/load.
- `labels.py` — independent labelers (note_type mapping, section normalize, missing/readiness seed rules).
- `fetch.py` — stdlib urllib loaders for MTSamples / MedSecId / PMC-OA, cache-backed.
- `build.py` — orchestrates: load real → freeze real test holdout → train generator → sample conditional synthetic → label → write `artifacts/corpus/{train,val,test}.jsonl`.
- `smoke_test.py` — runs the whole loop on CPU in seconds on tiny fixtures (proves the machinery, not quality).

## Run

Smoke (local, seconds, proves the loop):

```bash
cd ml/data_engine && python3 smoke_test.py
```

Full build (Colab GPU, or local if you have the corpora + torch):

```bash
cd ml/data_engine
python3 build.py --mtsamples /path/mtsamples.csv --medsecid /path/medsecid.json --steps 3000 --per-type 300
```

This writes `ml/artifacts/corpus/{train,val,test}.jsonl` and saves the trained generator to
`ml/artifacts/generator/note_gpt.pt`. `test.jsonl` is the frozen real-note holdout.

## Next: Phase 2 (retrain the five models on this corpus)

`ml/train.py` currently reads the old `generate.py` output and imports `common.py`. The
migration is to point it at `ml/artifacts/corpus/*.jsonl` from this engine and to report
metrics on `test.jsonl` (real) separately from the synthetic val split, so the eval page
shows synthetic-val vs real-test side by side. `common.py` and `generate.py` stay until
that rewire lands, then are removed. Training runs in Colab (`sklearn` + `torch`).

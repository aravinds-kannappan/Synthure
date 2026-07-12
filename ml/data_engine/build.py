"""Build the trained-data-engine corpus.

Pipeline:
  1. Load real open-license notes (MTSamples + MedSecId), each with an independent
     note_type label. Optionally add PMC-OA case-report text for LM pretraining.
  2. Freeze a real-note TEST holdout that no training ever sees. This is the honest
     headline metric for every downstream model.
  3. Train the note generator (generator.py) on the real TRAIN notes.
  4. Sample a conditional synthetic corpus: for each note type, sample notes from
     the generator (type label gold by construction), then attach independent
     labels (labels.missing_labels / readiness_label; entities via OpenMed at build
     time when available).
  5. Write artifacts/corpus/{train,val,test}.jsonl:
       test  = real holdout only
       val   = real val + a slice of synthetic
       train = real train + synthetic

Full run happens in Colab (GPU). See data_engine/README.md. Nothing here needs a
credential; all sources are open license.
"""

from __future__ import annotations

import argparse
import random

from schema import NOTE_TYPES, NoteRecord, DATA_ENGINE_OUT, write_jsonl
from labels import missing_labels, readiness_label
from generator import GPTConfig, train_generator, save as save_gen
import fetch


def _split_real(records: list[NoteRecord], rng: random.Random) -> tuple[list, list, list]:
    rng.shuffle(records)
    n = len(records)
    n_test = max(1, int(n * 0.15))
    n_val = max(1, int(n * 0.15))
    test = [_with(r, "test") for r in records[:n_test]]
    val = [_with(r, "val") for r in records[n_test : n_test + n_val]]
    train = [_with(r, "train") for r in records[n_test + n_val :]]
    return train, val, test


def _with(r: NoteRecord, split: str) -> NoteRecord:
    r.split = split
    return r


def sample_synthetic(model, cfg: GPTConfig, per_type: int, rng: random.Random) -> list[NoteRecord]:
    out: list[NoteRecord] = []
    for nt in NOTE_TYPES:
        for _ in range(per_type):
            text = model.generate(nt, max_new_tokens=cfg.block_size, temperature=0.9, top_k=40)
            text = text.strip()
            if len(text) < 40:
                continue
            miss = missing_labels(text)
            has_dx = bool(text)  # refined by NER/coding at model-training time
            out.append(
                NoteRecord(
                    note=text,
                    note_type=nt,  # gold: the conditioning token
                    source="generator",
                    split="train" if rng.random() > 0.15 else "val",
                    missing=miss,
                    ready=readiness_label(miss, has_dx),
                    meta={"gen": True},
                )
            )
    return out


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--mtsamples", help="path to mtsamples.csv (one-time download)")
    ap.add_argument("--medsecid", help="path to medsecid.json export")
    ap.add_argument("--per-type", type=int, default=300, help="synthetic notes to sample per note type")
    ap.add_argument("--steps", type=int, default=3000, help="generator training steps")
    ap.add_argument("--device", default="cpu")
    args = ap.parse_args()

    rng = random.Random(20260712)
    real: list[NoteRecord] = []
    if args.mtsamples:
        real += fetch.load_mtsamples(args.mtsamples)
    if args.medsecid:
        real += fetch.load_medsecid(args.medsecid)
    if not real:
        raise SystemExit("No real corpus provided. Pass --mtsamples and/or --medsecid (open-license downloads).")

    real_train, real_val, real_test = _split_real(real, rng)
    print(f"real: {len(real)}  (train {len(real_train)} / val {len(real_val)} / test {len(real_test)} frozen holdout)")

    cfg = GPTConfig()
    print(f"training generator on {len(real_train)} real notes for {args.steps} steps...")
    model = train_generator(real_train, cfg, steps=args.steps, device=args.device)
    save_gen(model, DATA_ENGINE_OUT.parent / "generator" / "note_gpt.pt")

    synth = sample_synthetic(model, cfg, args.per_type, rng)
    print(f"sampled {len(synth)} synthetic notes from the trained generator")

    train = real_train + [s for s in synth if s.split == "train"]
    val = real_val + [s for s in synth if s.split == "val"]
    test = real_test  # real holdout only
    rng.shuffle(train)
    write_jsonl(train, DATA_ENGINE_OUT / "train.jsonl")
    write_jsonl(val, DATA_ENGINE_OUT / "val.jsonl")
    write_jsonl(test, DATA_ENGINE_OUT / "test.jsonl")
    print(f"wrote corpus -> {DATA_ENGINE_OUT}  (train {len(train)} / val {len(val)} / test {len(test)})")
    print("test.jsonl is the frozen real-note holdout: report every headline metric on it.")


if __name__ == "__main__":
    main()

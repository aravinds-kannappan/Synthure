"""Export OpenMed token-classification models to int8 ONNX for transformers.js.

Output layout per model (what transformers.js expects for local models):
  <out>/<short-name>/config.json, tokenizer.json, tokenizer_config.json, ...
  <out>/<short-name>/onnx/model_quantized.onnx
"""
import shutil, subprocess, sys
from pathlib import Path

from onnxruntime.quantization import QuantType, quantize_dynamic

MODELS = {
    "OpenMed/OpenMed-NER-DiseaseDetect-TinyMed-65M": "disease-tinymed-65m",
    "OpenMed/OpenMed-NER-PharmaDetect-TinyMed-65M": "pharma-tinymed-65m",
    "OpenMed/OpenMed-PII-ClinicalE5-Small-33M-v1": "pii-clinicale5-33m",
}

OUT = Path(sys.argv[1]).resolve()
WORK = Path("./onnx-work").resolve()

for hf_id, short in MODELS.items():
    print(f"\n=== {hf_id} -> {short}")
    raw = WORK / short
    if not (raw / "model.onnx").exists():
        subprocess.run(
            [
                sys.executable, "-m", "optimum.exporters.onnx",
                "--model", hf_id,
                "--task", "token-classification",
                str(raw),
            ],
            check=True,
        )
    dest = OUT / short
    (dest / "onnx").mkdir(parents=True, exist_ok=True)
    quantize_dynamic(
        raw / "model.onnx",
        dest / "onnx" / "model_quantized.onnx",
        weight_type=QuantType.QInt8,
        extra_options={"EnableSubgraph": True},
    )
    for f in raw.iterdir():
        if f.suffix == ".json" or f.name in ("vocab.txt", "spm.model", "merges.txt"):
            shutil.copy2(f, dest / f.name)
    size = (dest / "onnx" / "model_quantized.onnx").stat().st_size / 1e6
    print(f"    quantized: {size:.1f} MB")
print("\nDone.")

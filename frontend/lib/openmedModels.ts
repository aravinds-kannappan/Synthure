// ── OpenMed model registry ────────────────────────────────────────────────────
// Shared by the browser runtime (lib/openmed.ts) and the server route, which
// only needs the labels. Keep this file free of any transformers.js import so
// the server bundle never pulls in the ONNX runtime.

export const OPENMED_MODELS = {
  deid: {
    local: 'pii-clinicale5-33m',
    hf: 'OpenMed/OpenMed-PII-ClinicalE5-Small-33M-v1',
    label: 'OpenMed PII ClinicalE5 Small 33M (int8 ONNX)',
    mb: 34,
  },
  disease: {
    local: 'disease-tinymed-65m',
    hf: 'OpenMed/OpenMed-NER-DiseaseDetect-TinyMed-65M',
    label: 'OpenMed DiseaseDetect TinyMed 65M (int8 ONNX)',
    mb: 66,
  },
  pharma: {
    local: 'pharma-tinymed-65m',
    hf: 'OpenMed/OpenMed-NER-PharmaDetect-TinyMed-65M',
    label: 'OpenMed PharmaDetect TinyMed 65M (int8 ONNX)',
    mb: 66,
  },
} as const

export type OpenMedStage = keyof typeof OPENMED_MODELS

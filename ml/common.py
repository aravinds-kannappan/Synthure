"""Shared vocabulary and clinical scaffolding for the Synthure ML harness.

The synthetic corpus is built from a curated set of common clinical conditions,
each mapped to a REAL ICD 10 CM code (verified against the shipped tabular
artifact), with associated lay phrasings, symptoms, medications, labs, and
procedures. Because every note is constructed from known conditions and codes,
the training and evaluation labels are exact gold, not weak labels.
"""

import gzip
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "frontend" / "data"
OUT = ROOT / "ml" / "artifacts"
OUT.mkdir(parents=True, exist_ok=True)


def load_gz(name):
    with gzip.open(DATA / name, "rt", encoding="utf-8") as f:
        return json.load(f)


# ── Curated clinical conditions (real ICD 10 CM codes) ───────────────────────
# name, icd, lay/abbrev phrasings, symptoms, meds, labs, procedures (CPT/HCPCS)
CONDITIONS = [
    {"name": "essential hypertension", "icd": "I10", "say": ["hypertension", "high blood pressure", "HTN", "elevated BP"],
     "sx": ["headache", "dizziness"], "rx": ["lisinopril", "amlodipine", "hydrochlorothiazide"], "labs": ["BP", "BMP"], "cpt": ["99214"]},
    {"name": "type 2 diabetes mellitus", "icd": "E11.9", "say": ["type 2 diabetes", "T2DM", "diabetes", "DM2"],
     "sx": ["polyuria", "fatigue"], "rx": ["metformin", "insulin", "empagliflozin"], "labs": ["A1C", "glucose"], "cpt": ["83036", "99214"]},
    {"name": "mixed hyperlipidemia", "icd": "E78.2", "say": ["hyperlipidemia", "high cholesterol", "dyslipidemia"],
     "sx": [], "rx": ["atorvastatin", "rosuvastatin", "simvastatin"], "labs": ["LDL", "lipid panel"], "cpt": ["80061"]},
    {"name": "non ST elevation myocardial infarction", "icd": "I21.4", "say": ["NSTEMI", "heart attack", "non ST elevation MI"],
     "sx": ["chest pain", "chest pressure", "diaphoresis"], "rx": ["aspirin", "heparin", "atorvastatin", "clopidogrel"], "labs": ["troponin", "EKG"], "cpt": ["93458"]},
    {"name": "chronic obstructive pulmonary disease", "icd": "J44.9", "say": ["COPD", "chronic obstructive pulmonary disease", "emphysema"],
     "sx": ["dyspnea", "productive cough", "wheezing"], "rx": ["albuterol", "tiotropium", "prednisone"], "labs": ["O2 sat", "chest xray"], "cpt": ["94060"]},
    {"name": "community acquired pneumonia", "icd": "J18.9", "say": ["pneumonia", "CAP", "lung infection"],
     "sx": ["fever", "cough", "dyspnea"], "rx": ["azithromycin", "ceftriaxone", "amoxicillin"], "labs": ["chest xray", "CBC"], "cpt": ["71046"]},
    {"name": "major depressive disorder", "icd": "F32.9", "say": ["major depressive disorder", "MDD", "depression"],
     "sx": ["low mood", "anhedonia", "insomnia"], "rx": ["sertraline", "fluoxetine", "escitalopram"], "labs": ["PHQ9"], "cpt": ["90834"]},
    {"name": "generalized anxiety disorder", "icd": "F41.1", "say": ["generalized anxiety disorder", "GAD", "anxiety"],
     "sx": ["worry", "restlessness"], "rx": ["escitalopram", "buspirone"], "labs": ["GAD7"], "cpt": ["90834"]},
    {"name": "chronic kidney disease", "icd": "N18.9", "say": ["chronic kidney disease", "CKD", "kidney disease"],
     "sx": ["edema", "fatigue"], "rx": ["furosemide", "lisinopril"], "labs": ["creatinine", "eGFR"], "cpt": ["99214"]},
    {"name": "urinary tract infection", "icd": "N39.0", "say": ["urinary tract infection", "UTI", "bladder infection"],
     "sx": ["dysuria", "urinary frequency"], "rx": ["nitrofurantoin", "ciprofloxacin"], "labs": ["urinalysis", "urine culture"], "cpt": ["81003"]},
    {"name": "primary osteoarthritis of knee", "icd": "M17.11", "say": ["knee osteoarthritis", "OA of the knee", "degenerative knee"],
     "sx": ["knee pain", "stiffness"], "rx": ["ibuprofen", "acetaminophen"], "labs": ["knee xray"], "cpt": ["27447", "20610"]},
    {"name": "asthma", "icd": "J45.909", "say": ["asthma", "reactive airway disease"],
     "sx": ["wheezing", "shortness of breath"], "rx": ["albuterol", "fluticasone", "montelukast"], "labs": ["spirometry"], "cpt": ["94060"]},
    {"name": "atrial fibrillation", "icd": "I48.91", "say": ["atrial fibrillation", "AFib", "irregular heartbeat"],
     "sx": ["palpitations", "dyspnea"], "rx": ["apixaban", "metoprolol", "warfarin"], "labs": ["EKG", "INR"], "cpt": ["93000"]},
    {"name": "gastro esophageal reflux disease", "icd": "K21.9", "say": ["GERD", "acid reflux", "reflux"],
     "sx": ["heartburn", "regurgitation"], "rx": ["omeprazole", "pantoprazole"], "labs": [], "cpt": ["43239"]},
    {"name": "hypothyroidism", "icd": "E03.9", "say": ["hypothyroidism", "underactive thyroid"],
     "sx": ["fatigue", "weight gain", "cold intolerance"], "rx": ["levothyroxine"], "labs": ["TSH"], "cpt": ["84443"]},
    {"name": "iron deficiency anemia", "icd": "D50.9", "say": ["iron deficiency anemia", "anemia"],
     "sx": ["fatigue", "pallor"], "rx": ["ferrous sulfate"], "labs": ["CBC", "ferritin"], "cpt": ["85025"]},
    {"name": "cerebral infarction", "icd": "I63.9", "say": ["stroke", "CVA", "cerebral infarction", "ischemic stroke"],
     "sx": ["weakness", "slurred speech", "facial droop"], "rx": ["aspirin", "atorvastatin"], "labs": ["head CT", "MRI"], "cpt": ["70450"]},
    {"name": "pulmonary embolism", "icd": "I26.99", "say": ["pulmonary embolism", "PE", "blood clot in lung"],
     "sx": ["dyspnea", "pleuritic chest pain"], "rx": ["heparin", "apixaban"], "labs": ["D dimer", "CT angiogram"], "cpt": ["71275"]},
    {"name": "cellulitis", "icd": "L03.90", "say": ["cellulitis", "skin infection"],
     "sx": ["erythema", "swelling", "warmth"], "rx": ["cephalexin", "clindamycin"], "labs": ["CBC"], "cpt": ["99214"]},
    {"name": "migraine", "icd": "G43.909", "say": ["migraine", "migraine headache"],
     "sx": ["headache", "photophobia", "nausea"], "rx": ["sumatriptan", "topiramate"], "labs": [], "cpt": ["99213"]},
    {"name": "seizure disorder", "icd": "G40.909", "say": ["epilepsy", "seizure disorder", "seizures"],
     "sx": ["convulsions", "loss of consciousness"], "rx": ["levetiracetam", "lamotrigine"], "labs": ["EEG"], "cpt": ["95816"]},
    {"name": "hypokalemia", "icd": "E87.6", "say": ["hypokalemia", "low potassium"],
     "sx": ["weakness", "cramps"], "rx": ["potassium chloride"], "labs": ["BMP", "potassium"], "cpt": ["80048"]},
    {"name": "acute kidney injury", "icd": "N17.9", "say": ["acute kidney injury", "AKI", "acute renal failure"],
     "sx": ["oliguria", "edema"], "rx": ["furosemide"], "labs": ["creatinine", "BMP"], "cpt": ["99223"]},
    {"name": "deep vein thrombosis", "icd": "I82.409", "say": ["deep vein thrombosis", "DVT", "leg clot"],
     "sx": ["leg swelling", "calf pain"], "rx": ["apixaban", "heparin"], "labs": ["D dimer", "venous ultrasound"], "cpt": ["93970"]},
    {"name": "benign prostatic hyperplasia", "icd": "N40.0", "say": ["BPH", "enlarged prostate", "benign prostatic hyperplasia"],
     "sx": ["urinary hesitancy", "nocturia"], "rx": ["tamsulosin", "finasteride"], "labs": ["PSA"], "cpt": ["99214"]},
    {"name": "osteoporosis", "icd": "M81.0", "say": ["osteoporosis", "low bone density"],
     "sx": [], "rx": ["alendronate", "calcium"], "labs": ["DEXA"], "cpt": ["77080"]},
    {"name": "heart failure", "icd": "I50.9", "say": ["heart failure", "CHF", "congestive heart failure"],
     "sx": ["dyspnea", "edema", "orthopnea"], "rx": ["furosemide", "carvedilol", "lisinopril"], "labs": ["BNP", "echocardiogram"], "cpt": ["93306"]},
    {"name": "acute bronchitis", "icd": "J20.9", "say": ["acute bronchitis", "bronchitis", "chest cold"],
     "sx": ["cough", "congestion"], "rx": ["guaifenesin", "albuterol"], "labs": [], "cpt": ["99213"]},
    {"name": "hyperkalemia", "icd": "E87.5", "say": ["hyperkalemia", "high potassium"],
     "sx": [], "rx": ["patiromer"], "labs": ["potassium", "EKG"], "cpt": ["80048"]},
    {"name": "obesity", "icd": "E66.9", "say": ["obesity", "overweight"],
     "sx": [], "rx": ["semaglutide"], "labs": ["BMI"], "cpt": ["99214"]},
]

ICD_OF = {c["icd"]: c for c in CONDITIONS}


def load_tabular():
    return load_gz("icd10cm.json.gz")


def verify_codes():
    """Every curated ICD code must exist in the shipped tabular artifact."""
    tab = load_tabular()
    missing = [c["icd"] for c in CONDITIONS if c["icd"].replace(".", "") not in tab]
    return missing


def norm_tokens(s):
    return [t for t in re.sub(r"[^a-z0-9]+", " ", s.lower()).split() if len(t) > 1]


if __name__ == "__main__":
    miss = verify_codes()
    print(f"conditions: {len(CONDITIONS)}  codes missing from tabular: {miss}")

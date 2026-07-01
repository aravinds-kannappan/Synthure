#!/usr/bin/env python3
"""Build Synthure's clinical knowledge artifacts from primary public sources.

Python stdlib only. Downloads are cached in scripts/build_knowledge/.cache.
Outputs gzipped JSON artifacts to frontend/data/ plus sources.json metadata.

Sources (all free, public):
  - ICD-10-CM FY2026 code descriptions + alphabetic index (CDC/NCHS)
  - AHRQ HCUP CCSR v2025-1 (diagnosis -> clinical category)
  - CMS Physician Fee Schedule RVU file (rvu26a) -> national payment amounts
  - CMS Unplanned Hospital Visits national readmission rates (data.cms.gov)
  - RxNorm Current Prescribable Content (NLM, no license required)
"""

import csv
import datetime
import gzip
import io
import json
import re
import ssl
import sys
import urllib.request
import xml.etree.ElementTree as ET
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
CACHE = Path(__file__).resolve().parent / ".cache"
OUT = ROOT / "frontend" / "data"
CACHE.mkdir(exist_ok=True)
OUT.mkdir(parents=True, exist_ok=True)

UA = {"User-Agent": "Mozilla/5.0 (synthure knowledge builder)"}
try:
    CTX = ssl.create_default_context()
    CTX.load_verify_locations("/etc/ssl/cert.pem")
except (FileNotFoundError, ssl.SSLError):
    CTX = ssl.create_default_context()

SOURCES = {}


def fetch(name: str, url: str) -> bytes:
    dest = CACHE / name
    if dest.exists():
        data = dest.read_bytes()
    else:
        print(f"  downloading {url}")
        try:
            req = urllib.request.Request(url, headers=UA)
            with urllib.request.urlopen(req, context=CTX, timeout=300) as r:
                data = r.read()
        except urllib.error.URLError:
            # Some Python installs lack a usable CA bundle; curl uses the OS store.
            import subprocess
            data = subprocess.run(
                ["curl", "-sfL", "--max-time", "300", "-A", UA["User-Agent"], url],
                capture_output=True, check=True,
            ).stdout
        dest.write_bytes(data)
    SOURCES[name] = {"url": url, "bytes": len(data)}
    return data


def write_gz(name: str, obj) -> None:
    path = OUT / name
    raw = json.dumps(obj, separators=(",", ":")).encode()
    with gzip.open(path, "wb", compresslevel=9) as f:
        f.write(raw)
    print(f"  wrote {name}: {len(raw)/1e6:.1f} MB raw, {path.stat().st_size/1e6:.2f} MB gz")


# ── 1. ICD-10-CM order file: code -> [billable, description] ────────────────
def build_icd10cm():
    print("== ICD-10-CM code descriptions (FY2026, CDC/NCHS)")
    z = zipfile.ZipFile(io.BytesIO(fetch(
        "icd10cm-desc-2026.zip",
        "https://ftp.cdc.gov/pub/Health_Statistics/NCHS/Publications/ICD10CM/2026/icd10cm-Code%20Descriptions-2026.zip",
    )))
    order = next(n for n in z.namelist() if "order" in n.lower() and n.endswith(".txt"))
    codes = {}
    for line in z.read(order).decode("utf-8", "replace").splitlines():
        if len(line) < 16:
            continue
        code = line[6:13].strip()
        billable = line[14] == "1"
        long_desc = line[77:].strip() or line[16:76].strip()
        if code:
            codes[code] = [1 if billable else 0, long_desc]
    write_gz("icd10cm.json.gz", codes)
    return codes


# ── 2. ICD-10-CM alphabetic index: term -> candidate codes ──────────────────
def _index_text(el) -> str:
    parts = [el.text or ""]
    for child in el:
        if child.tag != "term":
            parts.append(child.text or "")
            parts.append(child.tail or "")
    return re.sub(r"\s+", " ", "".join(parts)).strip()


def build_icd10_index(valid_codes):
    print("== ICD-10-CM alphabetic index (FY2026, CDC/NCHS)")
    z = zipfile.ZipFile(io.BytesIO(fetch(
        "icd10cm-index-2026.zip",
        "https://ftp.cdc.gov/pub/Health_Statistics/NCHS/Publications/ICD10CM/2026/icd10cm-table%20and%20index-2026.zip",
    )))
    name = next(n for n in z.namelist() if "index" in n.lower() and n.endswith(".xml") and "eindex" not in n.lower())
    root = ET.fromstring(z.read(name))
    index: dict[str, list[str]] = {}

    def put(term: str, code: str):
        entry = index.setdefault(term, [])
        if code not in entry and len(entry) < 8:
            entry.append(code)

    def add(term: str, code: str, main: bool = False):
        term = re.sub(r"\s+", " ", term).strip(" ,").lower()
        code = code.strip().rstrip("-").rstrip(".")
        if not term or not code:
            return
        # Alias without the parenthetical "nonessential modifiers" so plain
        # queries like "hypertension" hit "hypertension(accelerated)(benign)".
        bare = re.sub(r"\s*\([^)]*\)", "", term)
        bare = re.sub(r"\s+", " ", bare).strip(" ,")
        if bare and len(bare) <= 80:
            put(bare, code)
        if term != bare and len(term) <= 80:
            put(term, code)
        # Main terms like "Hypertension, hypertensive" match on each head word.
        if main and bare:
            heads = [h.strip() for h in bare.split(",") if len(h.strip()) > 2]
            for head in heads:
                put(head, code)
            # Nonessential modifiers combine with the head: "Hypertension
            # (accelerated) (essential)" also answers "essential hypertension".
            if heads:
                for group in re.findall(r"\(([^)]*)\)", term):
                    for word in group.split():
                        w = word.strip(" ,").lower()
                        if len(w) > 2 and w.isalpha():
                            put(f"{w} {heads[0]}", code)

    def walk(term_el, path):
        title_el = term_el.find("title")
        title = _index_text(title_el) if title_el is not None else ""
        here = f"{path}, {title}" if path else title
        code_el = term_el.find("code")
        if code_el is not None and code_el.text:
            add(here, code_el.text, main=not path)
            if path:  # bare subterm title alone is often searchable too
                add(f"{title} {path}", code_el.text)
        for sub in term_el.findall("term"):
            walk(sub, here)

    for letter in root.findall(".//letter"):
        for main in letter.findall("mainTerm"):
            walk(main, "")
    # Drop terms pointing only at codes that do not exist in the tabular list
    # (index uses category stems; keep stems that prefix a real code).
    stems = set()
    for c in valid_codes:
        for i in range(3, len(c) + 1):
            stems.add(c[:i])
    index = {t: [c for c in cs if c.replace(".", "") in stems or c in valid_codes]
             for t, cs in index.items()}
    index = {t: cs for t, cs in index.items() if cs}
    write_gz("icd10index.json.gz", index)


# ── 3. AHRQ CCSR: code -> [category id, category description] ────────────────
def build_ccsr():
    print("== AHRQ HCUP CCSR v2025-1")
    z = zipfile.ZipFile(io.BytesIO(fetch(
        "ccsr-2025.zip", "https://hcup-us.ahrq.gov/toolssoftware/ccsr/DXCCSR_v2025-1.zip",
    )))
    name = next(n for n in z.namelist() if n.lower().endswith(".csv"))
    text = z.read(name).decode("utf-8", "replace")
    rows = csv.reader(io.StringIO(text))
    header = [h.strip().lower() for h in next(rows)]

    def col(*needles):
        for i, h in enumerate(header):
            if all(n in h for n in needles):
                return i
        raise KeyError(needles)

    c_code = col("icd-10-cm code")
    c_cat = col("default ccsr category", "ip")
    c_catd = col("default ccsr category description", "ip")
    mapping, cats = {}, {}
    for r in rows:
        code = r[c_code].strip("' ")
        cat = r[c_cat].strip("' ")
        catd = r[c_catd].strip("' ")
        if code and cat and cat != "XXX000":
            mapping[code] = cat
            cats.setdefault(cat, catd)
    write_gz("ccsr.json.gz", {"map": mapping, "categories": cats})


# ── 4. CMS PFS RVU file: code -> national nonfacility payment ────────────────
def build_pfs():
    print("== CMS Physician Fee Schedule (rvu26a)")
    z = zipfile.ZipFile(io.BytesIO(fetch("rvu26a.zip", "https://www.cms.gov/files/zip/rvu26a.zip")))
    name = next(n for n in z.namelist() if re.match(r"PPRRVU", Path(n).name, re.I) and n.lower().endswith(".csv"))
    text = z.read(name).decode("utf-8", "replace")
    rows = list(csv.reader(io.StringIO(text)))
    hi = next(i for i, r in enumerate(rows) if r and r[0].strip().upper() == "HCPCS")
    # Positional layout of PPRRVU (two-tier header): 0=HCPCS 1=MOD 2=DESCRIPTION
    # 3=STATUS CODE 11=NON-FACILITY TOTAL RVU 25=CONV FACTOR
    C_MOD, C_DESC, C_STATUS, C_NFTOTAL, C_CF = 1, 2, 3, 11, 25
    pay, cf_seen = {}, None
    for r in rows[hi + 1:]:
        if len(r) < 26 or not r[0].strip():
            continue
        code, mod, status = r[0].strip(), r[C_MOD].strip(), r[C_STATUS].strip()
        if mod:  # base entries only
            continue
        try:
            total = float(r[C_NFTOTAL] or 0)
            cf = float(r[C_CF]) if r[C_CF].strip() else None
        except ValueError:
            continue
        if cf:
            cf_seen = cf
        if status in ("A", "R", "T") and total > 0 and cf_seen:
            entry = [round(total * cf_seen, 2), status]
            # HCPCS Level II (letter-initial) descriptions are public domain;
            # CPT (numeric) descriptors are AMA-licensed and are NOT shipped.
            if code[0].isalpha():
                entry.append(r[C_DESC].strip())
            pay[code] = entry
    # Clinical Lab Fee Schedule adds the lab codes PFS does not price.
    print("== CMS Clinical Lab Fee Schedule (26clabq1)")
    zl = zipfile.ZipFile(io.BytesIO(fetch("26clabq1.zip", "https://www.cms.gov/files/zip/26clabq1.zip")))
    lab_name = next(n for n in zl.namelist() if n.lower().endswith(".txt"))
    lab_added = 0
    # Tilde delimited: YEAR~HCPCS~MOD~EFF_DATE~INDICATOR~RATE~SHORTDESC
    for line in zl.read(lab_name).decode("utf-8", "replace").splitlines():
        p = line.split("~")
        if len(p) < 6 or p[0] == "YEAR" or p[0].startswith("HDR"):
            continue
        code, mod = p[1].strip(), p[2].strip()
        if mod or code in pay or not re.match(r"^[0-9A-Z]\d{3}[0-9A-Z]$", code):
            continue
        try:
            rate = float(p[5])
        except ValueError:
            continue
        if rate > 0:
            pay[code] = [round(rate, 2), "L"]
            lab_added += 1
    write_gz("pfs.json.gz", {"cf": cf_seen, "pay": pay})
    print(f"  conversion factor: {cf_seen}, priced codes: {len(pay)} (lab: {lab_added})")


# ── 5. Readmission measures: cohort definitions + national rates ─────────────
# Cohort ICD-10 prefixes transcribed from the CMS/Yale measure specifications
# (condition-specific readmission measure cohorts). Rates fetched live from
# data.cms.gov "Unplanned Hospital Visits - National".
READMISSION_COHORTS = {
    "READM_30_AMI": {"label": "Acute myocardial infarction", "prefixes": ["I21", "I22"]},
    "READM_30_HF": {"label": "Heart failure", "prefixes": ["I50", "I110", "I130", "I132"]},
    "READM_30_COPD": {"label": "Chronic obstructive pulmonary disease", "prefixes": ["J41", "J42", "J43", "J44"]},
    "READM_30_PN": {"label": "Pneumonia", "prefixes": ["J12", "J13", "J14", "J15", "J16", "J17", "J18", "A481"]},
    "READM_30_CABG": {"label": "Coronary artery bypass graft", "prefixes": ["Z951", "I2570"]},
    "READM_30_HIP_KNEE": {"label": "Elective hip or knee arthroplasty", "prefixes": ["M16", "M17", "Z9664", "Z9665"]},
}


def build_readmissions():
    print("== CMS national readmission rates (data.cms.gov)")
    data = json.loads(fetch(
        "uhv-national.json",
        "https://data.cms.gov/provider-data/api/1/datastore/query/cvcs-xecj/0?limit=500",
    ))
    rates = {}
    for row in data.get("results", []):
        mid = (row.get("measure_id") or "").replace("-", "_")
        rate = row.get("national_rate")
        if mid.startswith("READM") and rate not in (None, "", "Not Applicable"):
            rates[mid] = {"rate": float(rate), "name": row.get("measure_name")}
    out = {"rates": rates, "cohorts": READMISSION_COHORTS}
    (OUT / "readmissions.json").write_text(json.dumps(out, indent=1))
    print(f"  measures with national rates: {sorted(rates)}")

    # Refresh the lookup risk.ts reads, keyed by cohort ICD prefix.
    hwr = None
    for row in json.loads((CACHE / "uhv-national.json").read_text()).get("results", []):
        if row.get("measure_id") == "Hybrid_HWR" and row.get("national_rate") not in (None, "", "Not Applicable"):
            hwr = float(row["national_rate"]) / 100
    lookup, condition = {}, {}
    for mid, spec in READMISSION_COHORTS.items():
        if mid in rates:
            for p in spec["prefixes"]:
                lookup[p] = round(rates[mid]["rate"] / 100, 3)
                condition[p] = spec["label"]
    model = {
        "_meta": {
            "source": "CMS Unplanned Hospital Visits, National (data.cms.gov dataset cvcs-xecj)",
            "built": datetime.date.today().isoformat(),
            "note": "Published 30 day readmission rates by measure cohort; baseline is the national hybrid hospital wide readmission rate.",
        },
        "baseline": hwr if hwr is not None else 0.15,
        "lookup": lookup,
        "condition": condition,
    }
    (ROOT / "frontend" / "lib" / "models" / "readmission_model.json").write_text(json.dumps(model, indent=1))
    print(f"  refreshed lib/models/readmission_model.json (baseline {model['baseline']})")


# ── 6. RxNorm prescribable content: medication vocabulary ────────────────────
def build_meds():
    print("== RxNorm current prescribable content (NLM)")
    z = zipfile.ZipFile(io.BytesIO(fetch(
        "rxnorm-prescribe.zip",
        "https://download.nlm.nih.gov/rxnorm/RxNorm_full_prescribe_current.zip",
    )))
    name = next(n for n in z.namelist() if n.endswith("RXNCONSO.RRF"))
    meds = {}
    with z.open(name) as f:
        for raw in io.TextIOWrapper(f, encoding="utf-8", errors="replace"):
            p = raw.split("|")
            if len(p) > 14 and p[1] == "ENG" and p[11] == "RXNORM" and p[12] in ("IN", "BN"):
                s = p[14].strip().lower()
                if 2 < len(s) <= 60 and re.match(r"^[a-z][a-z0-9 ,.()/-]+$", s):
                    meds.setdefault(s, p[12])
    write_gz("meds.json.gz", meds)
    print(f"  medication names (ingredients + brands): {len(meds)}")


def main():
    only = sys.argv[1:] or ["icd10cm", "index", "ccsr", "pfs", "readm", "meds"]
    codes = None
    if "icd10cm" in only or "index" in only:
        codes = build_icd10cm()
    if "index" in only:
        build_icd10_index(codes)
    if "ccsr" in only:
        build_ccsr()
    if "pfs" in only:
        build_pfs()
    if "readm" in only:
        build_readmissions()
    if "meds" in only:
        build_meds()
    meta = {
        "built": datetime.date.today().isoformat(),
        "sources": SOURCES,
        "notes": {
            "cpt": "CPT descriptors are AMA licensed and are not distributed; numeric code payment amounts derive from the public CMS RVU file.",
            "cohorts": "Readmission cohort ICD-10 prefixes transcribed from CMS/Yale condition-specific measure specifications.",
        },
    }
    (OUT / "sources.json").write_text(json.dumps(meta, indent=1))
    print("done.")


if __name__ == "__main__":
    main()

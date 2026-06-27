#!/usr/bin/env python3
"""PHI de-identification component (scaling item 5: compliance).

A real, deterministic detector and redactor for common protected health
information (PHI) in clinical text: dates, ages, phone and fax, SSN, MRN and
record numbers, email, URL, ZIP, and names following a title. This is the
data touching, compliance relevant piece of "compliance" that can be built as
software. Compliance itself (HIPAA, SOC 2) is an organizational and audit
process, not a model; free text names without a title need a NER model and a
gold labelled corpus (for example i2b2 2014 de-id) for a precision and recall
evaluation, which is listed as future work in eval/README.md.

Run:  python3 eval/deid.py          (redacts a built in demo note)
      cat note.txt | python3 eval/deid.py
"""
import re, sys

PATTERNS = [
    ('DATE',  re.compile(r'\b(\d{1,2}[/-]\d{1,2}[/-]\d{2,4})\b')),
    ('DATE',  re.compile(r'\b(\d{4}-\d{2}-\d{2})\b')),
    ('DATE',  re.compile(r'\b((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{1,2},?\s+\d{4})\b', re.I)),
    ('AGE',   re.compile(r'\b(\d{2,3})\s*(?:yo|y/o|year[s]?\s*old|yr[s]?\s*old)\b', re.I)),
    ('PHONE', re.compile(r'\b(\(?\d{3}\)?[\s.\-]\d{3}[\s.\-]\d{4})\b')),
    ('SSN',   re.compile(r'\b(\d{3}-\d{2}-\d{4})\b')),
    ('MRN',   re.compile(r'\b(?:MRN|medical record|record(?:\s*(?:number|no))?|acct)[:#\s]*([A-Za-z0-9\-]{4,})\b', re.I)),
    ('EMAIL', re.compile(r'\b([\w.+\-]+@[\w\-]+\.[\w.\-]+)\b')),
    ('URL',   re.compile(r'\b(https?://[^\s]+)\b')),
    ('ZIP',   re.compile(r'\b(\d{5}(?:-\d{4})?)\b')),
    ('NAME',  re.compile(r'\b((?:Mr|Mrs|Ms|Dr|Doctor|Patient)\.?\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\b')),
]


def deidentify(text):
    """Return (redacted_text, [(category, original_span), ...])."""
    spans = []
    redacted = text
    for label, pat in PATTERNS:
        def repl(m, label=label):
            spans.append((label, m.group(0)))
            return f'[{label}]'
        redacted = pat.sub(repl, redacted)
    return redacted, spans


DEMO = ("Mr. John Smith, 91yo, MRN: 4456789, seen 03/14/2026 for chest pain. "
        "Contact 415-555-2671 or john.smith@example.com, ZIP 94110. "
        "Dr. Patel started lisinopril and ordered a lipid panel.")

if __name__ == '__main__':
    text = '' if sys.stdin.isatty() else sys.stdin.read()
    if not text.strip():
        text = DEMO
    red, spans = deidentify(text)
    print('--- input ---'); print(text)
    print('\n--- redacted ---'); print(red)
    print('\n--- detected PHI spans ---')
    for label, val in spans:
        print(f'  {label}: {val}')
    print(f'\n{len(spans)} PHI spans redacted')

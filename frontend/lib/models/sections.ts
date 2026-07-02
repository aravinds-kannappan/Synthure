// ── Rule-based clinical section parser (mirror of ml/section_parser.py) ───────
// Detects section headers and assigns spans. Rule based, honestly labeled; not a
// trained model. Evaluated in the harness at F1 ~0.82 on the synthetic corpus.

import type { ParsedSection } from '../schema'

const HEADER_MAP: Record<string, string> = {
  s: 'subjective', subjective: 'subjective',
  o: 'objective', objective: 'objective',
  a: 'assessment', assessment: 'assessment', impression: 'impression',
  p: 'plan', plan: 'plan',
  hpi: 'hpi', 'chief complaint': 'chief_complaint',
  'discharge diagnosis': 'diagnosis', diagnosis: 'diagnosis',
  'hospital course': 'hospital_course', disposition: 'disposition',
  'discharge medications': 'medications', 'current medications': 'medications', medications: 'medications',
  'reason for referral': 'reason', request: 'request', history: 'history',
  'medical decision making': 'mdm', technique: 'technique', findings: 'findings',
  'problem list': 'problems', symptoms: 'symptoms', 'interval history': 'interval',
}

const HEADER_RE = /(^|\n)\s*([A-Za-z][A-Za-z /]{0,34}?):\s/gm

export function parseSections(note: string): ParsedSection[] {
  const heads: { pos: number; label: string; name: string }[] = []
  let m: RegExpExecArray | null
  HEADER_RE.lastIndex = 0
  while ((m = HEADER_RE.exec(note))) {
    const raw = m[2].trim().toLowerCase()
    const name = HEADER_MAP[raw]
    if (name) heads.push({ pos: m.index + m[0].length, label: m[2].trim(), name })
  }
  const out: ParsedSection[] = []
  for (let i = 0; i < heads.length; i++) {
    const start = heads[i].pos
    let end = note.length
    if (i + 1 < heads.length) {
      const nxt = heads[i + 1]
      const hpos = note.lastIndexOf(nxt.label + ':', nxt.pos)
      end = hpos > start ? hpos : nxt.pos
    }
    out.push({ name: heads[i].name, label: heads[i].label, start, end: Math.max(start, end), confidence: 1 })
  }
  return out
}

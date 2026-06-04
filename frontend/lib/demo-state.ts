'use client'
/**
 * Cross-portal demo state.
 * Navigator writes here after running; all other portals read from here.
 * Uses localStorage + a custom event so same-tab portals update instantly.
 */

import { useEffect, useState } from 'react'

const KEY = 'synthure_demo_encounter'
const EVENT = 'synthure_demo_updated'

export interface DemoCondition {
  term: string
  plain: string
  icd10: string
}

export interface DemoMedication {
  name: string
  purpose: string
  instructions: string
}

export interface DemoEncounter {
  timestamp: string
  patientName: string
  patientAge: number
  patientDOB: string
  conditions: DemoCondition[]
  medications: DemoMedication[]
  claimId: string
  claimStatus: 'staged' | 'submitted' | 'adjudicated'
  claimAmount: number
  cptCode: string
  icd10Codes: string[]
  denialProbability: number
  urgency: 'urgent' | 'soon' | 'routine'
  summary: string
  followup: string
  priorAuthFiled: boolean
  educationSent: boolean
  specialty: string
}

export function writeDemoEncounter(enc: DemoEncounter) {
  if (typeof window === 'undefined') return
  localStorage.setItem(KEY, JSON.stringify(enc))
  window.dispatchEvent(new Event(EVENT))
}

export function readDemoEncounter(): DemoEncounter | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? JSON.parse(raw) : null
  } catch { return null }
}

/** React hook — re-renders whenever Navigator writes a new encounter. */
export function useDemoEncounter() {
  const [enc, setEnc] = useState<DemoEncounter | null>(null)

  useEffect(() => {
    setEnc(readDemoEncounter())
    const refresh = () => setEnc(readDemoEncounter())
    window.addEventListener(EVENT, refresh)
    window.addEventListener('storage', refresh)
    return () => {
      window.removeEventListener(EVENT, refresh)
      window.removeEventListener('storage', refresh)
    }
  }, [])

  return enc
}

// ── Sample clinical note shown by the "Load example" button ──────────────────
export const SAMPLE_NOTE = `Patient: Maria Santos, 58F, DOB: 1966-03-12
MRN: 00847291 | Insurance: BlueCross PPO | PCP: Dr. Sarah Chen

Chief Complaint: Productive cough × 5 days, fever to 38.8°C, progressively worsening dyspnea on exertion.

Past Medical History:
• Type 2 diabetes mellitus (E11.9) — A1C 7.8% at last visit (3 months ago)
• Essential hypertension (I10) — controlled on lisinopril 10mg QD
• No prior hospitalizations. No known drug allergies.

Physical Examination:
Hemodynamically stable. HR 96 bpm (mildly tachycardic), BP 138/84 mmHg, RR 20/min, Temp 38.6°C, SpO2 95% on room air.
Pulmonary auscultation revealed focal inspiratory crackles and diminished breath sounds within the right lower posterior lung field, suggestive of localized alveolar involvement.

Laboratory:
• WBC 13.2 × 10³/µL with neutrophilic predominance (leukocytosis)
• CRP elevated at 84 mg/L (normal < 5)
• ESR 68 mm/hr (elevated)
• Blood glucose 186 mg/dL (above goal)
• BMP otherwise within normal limits

Imaging:
Chest radiography revealed patchy right basilar airspace opacification consistent with lobar consolidation.

Assessment & Plan:
1. Community-acquired pneumonia (J18.9) — right lower lobe. Risk-stratified as moderate severity given diabetic status. Outpatient treatment appropriate; PSI Class II.
   → Amoxicillin-clavulanate 875mg PO BID × 7 days
   → Return precautions: worsening dyspnea, SpO2 < 93%, fever persisting > 72h

2. Type 2 diabetes mellitus (E11.9) — suboptimally controlled. Infection likely driving transient hyperglycemia.
   → Continue metformin 1000mg BID. Monitor glucose q6h during illness.
   → Endocrinology referral placed for A1C optimization.

3. Essential hypertension (I10) — continue lisinopril 10mg QD.

Follow-up: 7–10 days with repeat chest radiograph to confirm clearing. Call if fever does not resolve within 48–72 hours or breathing worsens.

CPT: 99214 (Office visit, moderate complexity)
ICD-10: J18.9, E11.9, I10`

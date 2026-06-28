// ── Synthure shared model ──────────────────────────────────────────────────
// Types + static config shared by the landing animation, the demo console,
// and the /api/synthesize route handler.

export type Stakeholder = 'patient' | 'physician' | 'hospital' | 'employer'

export interface Entity {
  text: string
  type: string // SIGN_SYMPTOM | DIAGNOSIS | MEDICATION | LAB_VALUE | PROCEDURE | CODE
}

export interface ExtractionResult {
  entities: Entity[]
  icd10: { code: string; label: string }[]
  cpt: { code: string; label: string }[]
  reviewRisk: number // 0-100 deterministic claim readiness (sourced, not a model)
  readmissionRisk: number // 0-100 calibrated to CMS HRRP published rates
  priorAuth: { code: string; procedure: string; source: string }[]
  reviewFactors: { label: string; detail: string }[]
  confidence: number // 0-1
}

export interface ReportMetric {
  label: string
  value: string
  tone?: 'good' | 'warn' | 'bad' | 'neutral'
}

export interface ReportSection {
  heading: string
  body: string
  bullets?: string[]
}

export interface StakeholderReport {
  stakeholder: Stakeholder
  headline: string
  summary: string
  metrics: ReportMetric[]
  sections: ReportSection[]
  actions: string[]
}

export interface VerificationCheck {
  label: string
  status: 'pass' | 'flag'
  note: string
}

export interface Verification {
  confidence: number // 0-1
  sourcesChecked: number
  checks: VerificationCheck[]
}

export interface Synthesis {
  summary: string
  connections: string[]
}

export interface SynthesisResult {
  extraction: ExtractionResult
  reports: StakeholderReport[]
  verification: Verification
  synthesis: Synthesis
  model: string
}

// ── Stakeholder presentation config ─────────────────────────────────────────

export const STAKEHOLDERS: Record<
  Stakeholder,
  { label: string; agent: string; blurb: string; accent: string; glyph: string; rgb: string }
> = {
  patient: {
    label: 'Patient',
    agent: 'Patient Advocate',
    blurb: 'Plain language explanation, costs, and next steps',
    accent: '#2dd4bf',
    glyph: '◎',
    rgb: '45,212,191',
  },
  physician: {
    label: 'Physician',
    agent: 'Care Navigator',
    blurb: 'Coding, prior authorization, and clinical workflow support',
    accent: '#818cf8',
    glyph: '◈',
    rgb: '129,140,248',
  },
  hospital: {
    label: 'Hospital',
    agent: 'Revenue Cycle',
    blurb: 'Claim routing, prior authorization, and reimbursement',
    accent: '#22d3ee',
    glyph: '⬡',
    rgb: '34,211,238',
  },
  employer: {
    label: 'Employer',
    agent: 'Benefits Analyst',
    blurb: 'Population health, cost exposure, and compliance',
    accent: '#a78bfa',
    glyph: '◇',
    rgb: '167,139,250',
  },
}

export const STAKEHOLDER_ORDER: Stakeholder[] = ['patient', 'physician', 'hospital', 'employer']

// ── Agent pipeline definition (drives both landing + demo animations) ────────

export interface AgentDef {
  id: string
  name: string
  role: string
  phase: 'intake' | 'write' | 'verify'
  accent: string
  stakeholder?: Stakeholder
}

export const PIPELINE: AgentDef[] = [
  { id: 'intake', name: 'Intake & Quality Gate', role: 'Validates the note, dedups, checks code formats', phase: 'intake', accent: '#2dd4bf' },
  { id: 'ner', name: 'Biomedical NER', role: 'Extracts symptoms, diagnoses, meds & labs', phase: 'intake', accent: '#2dd4bf' },
  { id: 'rag', name: 'Knowledge Retrieval', role: 'Maps entities to ICD 10 / CPT and guidelines', phase: 'intake', accent: '#2dd4bf' },
  { id: 'risk', name: 'Risk & Readiness', role: 'CMS calibrated readmission risk and sourced claim readiness', phase: 'intake', accent: '#f59e0b' },
  { id: 'patient', name: 'Patient Advocate', role: 'Writes a plain language patient report', phase: 'write', accent: '#2dd4bf', stakeholder: 'patient' },
  { id: 'physician', name: 'Care Navigator', role: 'Writes the physician workflow report', phase: 'write', accent: '#818cf8', stakeholder: 'physician' },
  { id: 'hospital', name: 'Revenue Cycle', role: 'Writes the hospital revenue report', phase: 'write', accent: '#22d3ee', stakeholder: 'hospital' },
  { id: 'employer', name: 'Benefits Analyst', role: 'Writes the employer benefits report', phase: 'write', accent: '#a78bfa', stakeholder: 'employer' },
  { id: 'verify', name: 'Verifier', role: 'Cross checks every claim against the knowledge base', phase: 'verify', accent: '#34d399' },
  { id: 'synth', name: 'Orchestrator', role: 'Tailors & connects all four reports', phase: 'verify', accent: '#fbbf24' },
]

// ── Sample notes for the demo ────────────────────────────────────────────────

export const SAMPLE_NOTES: { label: string; note: string }[] = [
  {
    label: 'Hypertension + dyslipidemia',
    note: `55yo M presents for follow-up. BP 152/96, repeated 148/94. Reports occasional headaches, no chest pain. A1C 7.2%, LDL 165. Dx: essential hypertension (I10), mixed hyperlipidemia (E78.2), type 2 diabetes (E11.9). Started lisinopril 10mg QD and atorvastatin 20mg QHS. Counseled on diet/exercise. Follow-up labs in 6 weeks. Ordered lipid panel (CPT 80061) and basic metabolic panel.`,
  },
  {
    label: 'Chest pain / possible MI',
    note: `62yo F to ED with substernal chest pressure x2h radiating to left arm, diaphoresis. Troponin elevated 0.9. EKG shows ST depression in V4-V6. Dx: NSTEMI (I21.4). Admitted to cardiology. Started on heparin drip, aspirin 325mg, atorvastatin 80mg. Cardiac cath scheduled (CPT 93458). Prior CABG 2019, out-of-network cardiologist consult requested.`,
  },
  {
    label: 'Knee osteoarthritis / surgery',
    note: `68yo M with chronic right knee pain, failed 6mo conservative therapy and PT. Imaging shows severe tricompartmental osteoarthritis (M17.11). Recommend total knee arthroplasty (CPT 27447). Requires prior authorization. BMI 34. Pre-op clearance pending. Patient employed full-time, concerned about recovery time and coverage.`,
  },
]

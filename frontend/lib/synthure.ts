// ── Synthure shared model ──────────────────────────────────────────────────
// Types + static config shared by the landing animation, the demo console,
// and the /api/synthesize route handler.

export type Stakeholder = 'patient' | 'physician' | 'hospital' | 'employer'

export interface Entity {
  text: string
  type: string // SIGN_SYMPTOM | DIAGNOSIS | MEDICATION | LAB_VALUE | PROCEDURE | CODE
  start?: number // character span in the de-identified note
  end?: number
  confidence?: number // real softmax score when source is an OpenMed model
  source?: 'openmed' | 'claude' | 'literal' // which stage produced this entity
}

export interface ReadinessCheck {
  id: string
  label: string
  status: 'pass' | 'flag'
  severity: 'blocking' | 'advisory'
  detail: string
  source: string // the published rule or artifact this check reads
}

export interface ExtractionResult {
  entities: Entity[]
  icd10: {
    code: string
    label: string // official ICD 10 CM FY2026 description
    billable?: boolean // from the CMS order file
    source?: 'linked' | 'literal' // linked from an entity vs written in the note
    entity?: string // the note phrase this code was linked from
    plain?: string // MedlinePlus Connect consumer language, when available
    plainSource?: string
  }[]
  cpt: {
    code: string
    label: string
    price?: number // CMS PFS/CLFS national amount, when published
    schedule?: string // which fee schedule priced it
  }[]
  readiness: { checks: ReadinessCheck[]; lane: 'standard' | 'frontier' }
  reviewRisk: number // share of readiness checks flagged (count based, not a model)
  readmissionRisk: number // the CMS published 30 day rate for the matched cohort
  readmissionDriver: string | null
  readmissionCalibrated: boolean
  priorAuth: { code: string; procedure: string; source: string }[]
  reviewFactors: { label: string; detail: string }[]
  confidence: number // minimum real model confidence across OpenMed entities
  cohorts: { id: string; label: string }[] // AHRQ CCSR categories of the coded dx
  deid: { redactions: number; types: string[] } | null // on-device de-identification
  models: Record<string, string> // stage -> model id, for the trust surface
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

// ── Alignment & safety layer ─────────────────────────────────────────────────
// Inference time safety mechanisms drawn from the alignment literature. We do not
// train a reward model here; we apply the inference time techniques these papers
// introduced (a constitution with critique and revise, an autonomy gate, and
// selective prediction) and rely on Claude's own RLHF training for the writers.

export interface Principle {
  id: string
  principle: string
  basis: string // the safety research this principle draws on
}

// The clinical constitution every report is checked against (Constitutional AI,
// Bai et al. 2022). Each principle names the research it is grounded in.
export const CONSTITUTION: Principle[] = [
  { id: 'grounding', principle: 'Every code and clinical claim must trace to the note. No fabrication.', basis: 'Constitutional AI, Bai et al. 2022; Chain of Verification, Dhuliawala et al. 2023' },
  { id: 'no_clinical_decisions', principle: 'Agents never prescribe, diagnose, or change treatment. Decision support only.', basis: 'Corrigibility and scalable oversight; tiered autonomy' },
  { id: 'cost_estimates', principle: 'Cost and coverage figures are labeled as estimates, never stated as certainties.', basis: 'Calibrated, honest uncertainty; Sparrow, Glaese et al. 2022' },
  { id: 'privacy', principle: 'Aggregated and employer views carry no individual identifying information.', basis: 'Privacy preserving aggregation; de identification' },
  { id: 'abstain', principle: 'When extraction confidence is low, the system abstains and escalates to a human.', basis: 'Selective prediction, Geifman and El-Yaniv 2017' },
  { id: 'sourced_risk', principle: 'Risk numbers come from published data or are not shown. No invented probabilities.', basis: 'Truthful, non deceptive outputs; InstructGPT RLHF, Ouyang et al. 2022' },
]

export interface ConstitutionCheck {
  id: string
  principle: string
  basis: string
  status: 'pass' | 'flag'
  detail: string
}

export interface SafetyCritique {
  target: Stakeholder | 'all'
  issue: string
  severity: 'low' | 'medium' | 'high'
  action: 'revised' | 'flagged' | 'blocked'
}

export interface AutonomyAction {
  action: string
  tier: 1 | 2 | 3
  decision: 'auto' | 'human approval' | 'prohibited'
}

export interface SafetyResult {
  constitution: ConstitutionCheck[]
  critiques: SafetyCritique[]
  revision: { target: Stakeholder | 'all'; before: string; after: string; note: string } | null
  autonomy: AutonomyAction[]
  abstained: boolean
  abstainReason: string | null
  passed: number
  total: number
  caughtViolations: number
  mode: 'deterministic' | 'claude assisted'
}

export interface SynthesisResult {
  extraction: ExtractionResult
  reports: StakeholderReport[]
  verification: Verification
  synthesis: Synthesis
  safety: SafetyResult
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
  phase: 'intake' | 'write' | 'verify' | 'safeguard'
  accent: string
  stakeholder?: Stakeholder
}

export const PIPELINE: AgentDef[] = [
  { id: 'deid', name: 'De identification', role: 'OpenMed PII model scrubs identifiers on your device before anything leaves it', phase: 'intake', accent: '#2dd4bf' },
  { id: 'ner', name: 'Biomedical NER', role: 'OpenMed disease and pharma models extract entities with real confidences', phase: 'intake', accent: '#2dd4bf' },
  { id: 'rag', name: 'Code Linking', role: 'ICD 10 CM alphabetic index retrieval; Claude picks only among retrieved codes', phase: 'intake', accent: '#2dd4bf' },
  { id: 'risk', name: 'Risk & Readiness', role: 'CMS published readmission rates and a sourced claim readiness checklist', phase: 'intake', accent: '#f59e0b' },
  { id: 'patient', name: 'Patient Advocate', role: 'Writes a plain language patient report', phase: 'write', accent: '#2dd4bf', stakeholder: 'patient' },
  { id: 'physician', name: 'Care Navigator', role: 'Writes the physician workflow report', phase: 'write', accent: '#818cf8', stakeholder: 'physician' },
  { id: 'hospital', name: 'Revenue Cycle', role: 'Writes the hospital revenue report', phase: 'write', accent: '#22d3ee', stakeholder: 'hospital' },
  { id: 'employer', name: 'Benefits Analyst', role: 'Writes the employer benefits report', phase: 'write', accent: '#a78bfa', stakeholder: 'employer' },
  { id: 'verify', name: 'Verifier', role: 'Cross checks every claim against the knowledge base', phase: 'verify', accent: '#34d399' },
  { id: 'synth', name: 'Orchestrator', role: 'Tailors & connects all four reports', phase: 'verify', accent: '#fbbf24' },
  { id: 'critic', name: 'Constitution Critic', role: 'Checks every report against the clinical constitution and revises violations', phase: 'safeguard', accent: '#f43f5e' },
  { id: 'gate', name: 'Autonomy Gate', role: 'Routes each action across the three autonomy tiers and abstains when unsure', phase: 'safeguard', accent: '#fb7185' },
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

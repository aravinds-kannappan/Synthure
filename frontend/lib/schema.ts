// ── Canonical clinical record ────────────────────────────────────────────────
// One normalized record is produced from a raw clinical note and drives every
// downstream view. Each stage of the pipeline fills in part of it, and every
// field that a Synthure owned model produced carries the model id and a
// confidence so the record is auditable end to end.
//
// The four stakeholder portals are deterministic projections of THIS record.
// They are downstream views of one normalized workflow, not separate dashboards.

export type NoteType =
  | 'soap'
  | 'discharge_summary'
  | 'referral'
  | 'er_note'
  | 'radiology'
  | 'intake_form'
  | 'progress_note'
  | 'unstructured'

export const NOTE_TYPE_LABELS: Record<NoteType, string> = {
  soap: 'SOAP note',
  discharge_summary: 'Discharge summary',
  referral: 'Referral',
  er_note: 'Emergency note',
  radiology: 'Radiology report',
  intake_form: 'Intake form',
  progress_note: 'Progress note',
  unstructured: 'Unstructured note',
}

// A span located in the (de identified) note. Every structured fact should
// point back to the text that produced it.
export interface EvidenceSpan {
  start: number
  end: number
  text: string
}

export interface Entity {
  text: string
  type: string // DIAGNOSIS | MEDICATION | SIGN_SYMPTOM | LAB_VALUE | PROCEDURE | ANATOMY
  start?: number
  end?: number
  confidence?: number // real softmax when produced by an OpenMed model
  source?: 'openmed' | 'synthure' | 'literal'
}

export interface ParsedSection {
  name: string // subjective | objective | assessment | plan | hpi | impression | ...
  label: string // human readable
  start: number
  end: number
  confidence: number
}

export interface CandidateCode {
  code: string
  system: 'ICD10CM' | 'CPT' | 'HCPCS'
  description: string
  billable?: boolean
  score: number // reranker score, 0-1
  rank: number
  chosen: boolean // selected into the record
  evidence?: EvidenceSpan
  source: 'ranked' | 'literal'
}

export interface MissingItem {
  id: string
  field: string // e.g. laterality, acuity, supporting_diagnosis, tobacco_status
  label: string
  severity: 'blocking' | 'advisory'
  detail: string
  probability: number // missing-info model probability the field is absent/required
}

export interface ReadinessResult {
  score: number // 0-1 calibrated probability the claim is submission ready
  rawScore: number // pre calibration model output
  band: 'ready' | 'needs_work' | 'not_ready'
  drivers: { feature: string; contribution: number }[] // top signed contributions
  checks: {
    id: string
    label: string
    status: 'pass' | 'flag'
    severity: 'blocking' | 'advisory'
    detail: string
    source: string
  }[]
}

export interface ModelCard {
  stage: string
  model: string // model id / family
  owner: 'openmed' | 'synthure' | 'claude'
  detail?: string
  ms?: number
}

export interface Confidence {
  extraction: number // min OpenMed entity confidence
  noteType: number
  coding: number // mean chosen candidate score
  overall: number // aggregate, calibrated
  abstained: boolean
  abstainReason: string | null
}

export type ReviewStatus = 'pending_review' | 'approved' | 'rejected' | 'auto_low_risk'

export interface PatientContext {
  age?: number
  sex?: string
  encounterType?: string // outpatient | inpatient | emergency
  deid: { redactions: number; types: string[] } | null
}

// The canonical record. Every pipeline stage writes into this object.
export interface ClinicalRecord {
  id: string
  createdAt: number
  rawLength: number
  note: string // de identified note (raw never leaves the device)

  patient: PatientContext
  noteType: { type: NoteType; label: string; confidence: number }
  sections: ParsedSection[]

  entities: Entity[]
  diagnoses: CandidateCode[] // chosen ICD 10 codes with candidates
  procedures: CandidateCode[] // chosen CPT/HCPCS codes
  symptoms: Entity[]
  medications: Entity[]
  labs: Entity[]

  candidates: CandidateCode[] // full candidate pool (ranked, incl. not chosen)
  missing: MissingItem[]
  readiness: ReadinessResult
  cohorts: { id: string; label: string }[]

  confidence: Confidence
  review: { status: ReviewStatus; note: string | null }
  models: ModelCard[]
}

// Stakeholder projections are computed from the record, never independently.
export type Stakeholder = 'patient' | 'physician' | 'hospital' | 'employer'
export const STAKEHOLDER_ORDER: Stakeholder[] = ['patient', 'physician', 'hospital', 'employer']

// ── Portal role types
export type PortalRole = 'patient' | 'physician' | 'hospital_admin' | 'employer_admin' | 'provider'

export interface AuthUser {
  token: string
  name: string
  role: PortalRole
  org_id?: string
}

// ── Patient
export interface Patient {
  id: string
  org_id: string
  mrn?: string
  first_name: string
  last_name: string
  date_of_birth?: string
  sex?: string
  email?: string
  phone?: string
  primary_language: string
  conditions?: Condition[]
  medications?: Medication[]
  insurance?: Insurance[]
  documents?: PatientDocument[]
  created_at: string
}

export interface Condition {
  id: string
  icd10_code: string
  description?: string
  status: 'active' | 'resolved' | 'chronic'
  onset_date?: string
}

export interface Medication {
  id: string
  name: string
  dose?: string
  frequency?: string
  route?: string
  status: 'active' | 'discontinued' | 'hold'
}

export interface Insurance {
  id: string
  plan_name: string
  member_id?: string
  coverage_type: 'primary' | 'secondary' | 'tertiary'
  deductible?: number
  deductible_met?: number
  oop_max?: number
  oop_met?: number
  effective_date?: string
  termination_date?: string
}

// ── Claims
export type ClaimStatus =
  | 'draft' | 'validated' | 'submitted' | 'acknowledged'
  | 'adjudicated' | 'paid' | 'denied' | 'appealed' | 'voided'

export interface Claim {
  id: string
  patient_id: string
  org_id: string
  status: ClaimStatus
  procedure_code: string
  diagnosis_codes: string[]
  amount: number
  complexity_score?: number
  route?: 'standard' | 'frontier'
  denial_risk?: number
  payer_id?: string
  submitted_at?: string
  paid_at?: string
  paid_amount?: number
  created_at: string
}

// ── Care events (journey timeline)
export interface CareEvent {
  id: string
  patient_id: string
  event_type: string
  title: string
  detail?: string
  actor?: string
  ai_generated: boolean
  tier?: string
  created_at: string
}

// ── Notifications
export interface Notification {
  id: string
  type: string
  title: string
  body?: string
  portal: string
  tier?: '1' | '2' | '3'
  action_type?: string
  action_payload?: Record<string, unknown>
  read_at?: string
  created_at: string
}

// ── Jargon pipeline output
export interface JargonOutput {
  data: {
    summary: string
    conditions: Array<{ term: string; plain: string; source_doc_id: string }>
    medications: Array<{ name: string; purpose: string; instructions: string }>
    followup: string
    urgency: 'now' | 'soon' | 'routine'
  }
  source: string
  entity_confidence?: number
  pipeline_trace?: unknown[]
}

// ── Provider
export interface Provider {
  id: string
  npi: string
  first_name?: string
  last_name: string
  specialty?: string
  network_status: 'in-network' | 'out-of-network'
  credentialing_status: string
  license_expiration?: string
  credentialing_alert?: boolean
}

// ── Payer
export interface Payer {
  id: string
  name: string
  edi_payer_id?: string
  timely_filing_days: number
  contract_renewal_date?: string
  denial_rate: number
  avg_days_to_pay: number
  appeal_win_rate: number
  pa_approval_rate: number
  renewal_alert?: boolean
}

// ── Document
export interface PatientDocument {
  id: string
  document_type: string
  file_name?: string
  ai_classification?: string
  visible_to_patient: boolean
  created_at: string
}

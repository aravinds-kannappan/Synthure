'use client'

const BASE = process.env.NEXT_PUBLIC_API_URL || ''

async function request<T = unknown>(
  method: string,
  path: string,
  body?: unknown,
  token?: string,
): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (token) headers['Authorization'] = `Bearer ${token}`

  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }))
    throw new Error(err.detail || `HTTP ${res.status}`)
  }
  return res.json()
}

export const api = {
  // ── Auth
  login: (email: string, password: string) =>
    request<{ token: string; name: string; role: string; org_id?: string; user_id?: string; patient_id?: string }>(
      'POST', '/api/auth/login', { email, password }
    ),

  // ── Features (standalone pipelines)
  explainJargon: (notes: string, token: string) =>
    request('POST', '/api/features/explain-jargon', { notes }, token),

  matchInsurance: (profile: Record<string, unknown>, token: string) =>
    request('POST', '/api/features/match-insurance', profile, token),

  // ── Physician — Navigator
  navigator: (body: Record<string, unknown>, token: string) =>
    request('POST', '/api/physician/navigator', body, token),

  // ── Physician — Patient management
  getMyPatients: (token: string) =>
    request<{ patients: Record<string, unknown>[]; total: number }>(
      'GET', '/api/physician/patients', undefined, token
    ),
  getPhysicianPatientNotes: (patientId: string, token: string) =>
    request('GET', `/api/physician/patients/${patientId}/notes`, undefined, token),

  // ── Hospital — CRM
  listPatients: (token: string) =>
    request<{ patients: Record<string, unknown>[]; total: number }>(
      'GET', '/api/hospital/crm/patients', undefined, token
    ),
  getPatient: (id: string, token: string) =>
    request('GET', `/api/hospital/crm/patients/${id}`, undefined, token),
  createPatient: (data: Record<string, unknown>, token: string) =>
    request('POST', '/api/hospital/crm/patients', data, token),
  listProviders: (token: string) =>
    request('GET', '/api/hospital/crm/providers', undefined, token),
  listPayers: (token: string) =>
    request('GET', '/api/hospital/crm/payers', undefined, token),

  // ── Hospital — RCM
  submitClaim: (claim: Record<string, unknown>, token: string) =>
    request('POST', '/api/hospital/rcm/claims/submit', claim, token),

  // ── Hospital — Analytics
  hospitalOverview: (token: string) =>
    request<Record<string, unknown>>('GET', '/api/hospital/analytics/overview', undefined, token),
  hospitalPhysicians: (token: string) =>
    request<{ physicians: Record<string, unknown>[]; total: number }>(
      'GET', '/api/hospital/analytics/physicians', undefined, token
    ),
  physicianPatients: (physicianId: string, token: string) =>
    request('GET', `/api/hospital/analytics/physicians/${physicianId}/patients`, undefined, token),
  patientNotesHospital: (patientId: string, token: string) =>
    request('GET', `/api/hospital/analytics/patients/${patientId}/notes`, undefined, token),

  // ── Patient Portal
  getMyProfile: (token: string) =>
    request<Record<string, unknown>>('GET', '/api/patient/me', undefined, token),
  getMyNotes: (token: string) =>
    request<{ notes: Record<string, unknown>[]; total: number }>(
      'GET', '/api/patient/notes', undefined, token
    ),
  getNoteResults: (noteId: string, token: string) =>
    request('GET', `/api/patient/notes/${noteId}/results`, undefined, token),
  getMyTimeline: (token: string) =>
    request<{ events: Record<string, unknown>[]; total: number }>(
      'GET', '/api/patient/timeline', undefined, token
    ),

  // ── Employer Analytics
  employerOverview: (token: string) =>
    request<Record<string, unknown>>('GET', '/api/employer/overview', undefined, token),
  employerHospitals: (token: string) =>
    request<{ hospitals: Record<string, unknown>[]; total: number }>(
      'GET', '/api/employer/hospitals', undefined, token
    ),
  populationConditions: (token: string) =>
    request('GET', '/api/employer/population/conditions', undefined, token),
  populationRisk: (token: string) =>
    request('GET', '/api/employer/population/risk', undefined, token),

  // ── Health check
  health: () => request('GET', '/api/health'),
}

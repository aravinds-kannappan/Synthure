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
  // Auth
  login: (email: string, password: string) =>
    request<{ token: string; name: string; role: string; org_id?: string }>(
      'POST', '/api/auth/login', { email, password }
    ),

  // Features
  explainJargon: (notes: string, token: string) =>
    request('POST', '/api/features/explain-jargon', { notes }, token),

  matchInsurance: (profile: Record<string, unknown>, token: string) =>
    request('POST', '/api/features/match-insurance', profile, token),

  // Navigator
  navigator: (body: Record<string, unknown>, token: string) =>
    request('POST', '/api/physician/navigator', body, token),

  // Hospital CRM
  listPatients: (token: string) =>
    request<{ patients: unknown[]; total: number }>('GET', '/api/hospital/crm/patients', undefined, token),

  getPatient: (id: string, token: string) =>
    request('GET', `/api/hospital/crm/patients/${id}`, undefined, token),

  listProviders: (token: string) =>
    request('GET', '/api/hospital/crm/providers', undefined, token),

  listPayers: (token: string) =>
    request('GET', '/api/hospital/crm/payers', undefined, token),

  // RCM claims
  submitClaim: (claim: Record<string, unknown>, token: string) =>
    request('POST', '/api/hospital/rcm/claims/submit', claim, token),

  // Health
  health: () => request('GET', '/api/health'),
}

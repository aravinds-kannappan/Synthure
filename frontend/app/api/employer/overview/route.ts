import { NextResponse } from 'next/server'
import { verifyToken, adminDb } from '@/lib/api-auth'

export async function GET(request: Request) {
  const user = await verifyToken(request.headers.get('Authorization'))
  if (!user || user.role !== 'employer_admin') return NextResponse.json({ detail: 'Forbidden' }, { status: 403 })

  const db = adminDb()
  const { data: links } = await db.from('employer_hospitals').select('hospital_id').eq('employer_id', user.org_id ?? '')
  const hospitalIds = (links ?? []).map(l => l.hospital_id as string)

  if (!hospitalIds.length) return NextResponse.json({ hospitals: 0, patients: 0, clinical_notes: 0, top_conditions: [], avg_readmission_risk: 0, high_readmission_count: 0 })

  let totalPatients = 0, totalNotes = 0, highRisk = 0
  const allConditions: string[] = []
  const scores: number[] = []

  for (const hid of hospitalIds) {
    const [pats, notes, conds, pipelineRes] = await Promise.all([
      db.from('patients').select('id').eq('org_id', hid),
      db.from('clinical_notes').select('id').eq('org_id', hid),
      db.from('patient_conditions').select('icd10_code').eq('org_id', hid).eq('status', 'active'),
      db.from('ai_pipeline_results').select('result_json').eq('org_id', hid).eq('pipeline_type', 'jargon'),
    ])
    totalPatients += pats.data?.length ?? 0
    totalNotes    += notes.data?.length ?? 0
    for (const c of conds.data ?? []) allConditions.push(c.icd10_code)
    for (const r of pipelineRes.data ?? []) {
      const rr = (r.result_json?.data as Record<string, unknown>)?.readmission_risk as { score?: number; level?: string } | undefined
      if (rr) { scores.push(rr.score ?? 0); if (rr.level === 'high') highRisk++ }
    }
  }

  const condMap: Record<string, number> = {}
  for (const c of allConditions) condMap[c] = (condMap[c] ?? 0) + 1
  const top_conditions = Object.entries(condMap).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([code, cnt]) => ({ code, count: cnt }))
  const avg = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length * 1000) / 1000 : 0

  return NextResponse.json({ hospitals: hospitalIds.length, patients: totalPatients, clinical_notes: totalNotes, top_conditions, avg_readmission_risk: avg, high_readmission_count: highRisk })
}

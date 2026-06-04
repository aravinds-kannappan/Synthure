import { NextResponse } from 'next/server'
import { verifyToken, adminDb } from '@/lib/api-auth'

export async function GET(request: Request) {
  const user = await verifyToken(request.headers.get('Authorization'))
  if (!user || user.role !== 'hospital_admin') return NextResponse.json({ detail: 'Forbidden' }, { status: 403 })

  const org_id = user.org_id ?? ''
  const db = adminDb()

  const [patients, notes, physicians, pipelineResults, conditions] = await Promise.all([
    db.from('patients').select('id').eq('org_id', org_id),
    db.from('clinical_notes').select('id').eq('org_id', org_id),
    db.from('users').select('id').eq('org_id', org_id).eq('role', 'physician'),
    db.from('ai_pipeline_results').select('result_json').eq('org_id', org_id).eq('pipeline_type', 'jargon'),
    db.from('patient_conditions').select('icd10_code').eq('org_id', org_id).eq('status', 'active'),
  ])

  let totalScore = 0, highRisk = 0
  for (const r of pipelineResults.data ?? []) {
    const rr = (r.result_json?.data as Record<string, unknown>)?.readmission_risk as { score?: number; level?: string } | undefined
    if (rr) { totalScore += rr.score ?? 0; if (rr.level === 'high') highRisk++ }
  }
  const count = pipelineResults.data?.length ?? 0

  const condMap: Record<string, number> = {}
  for (const c of conditions.data ?? []) condMap[c.icd10_code] = (condMap[c.icd10_code] ?? 0) + 1
  const top_conditions = Object.entries(condMap).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([code, cnt]) => ({ code, count: cnt }))

  return NextResponse.json({
    org_id,
    patients: patients.data?.length ?? 0,
    clinical_notes: notes.data?.length ?? 0,
    physicians: physicians.data?.length ?? 0,
    avg_readmission_risk: count > 0 ? Math.round(totalScore / count * 1000) / 1000 : 0,
    high_readmission_count: highRisk,
    top_conditions,
  })
}

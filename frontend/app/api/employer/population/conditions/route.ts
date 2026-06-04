import { NextResponse } from 'next/server'
import { verifyToken, adminDb } from '@/lib/api-auth'

export async function GET(request: Request) {
  const user = await verifyToken(request.headers.get('Authorization'))
  if (!user || user.role !== 'employer_admin') return NextResponse.json({ detail: 'Forbidden' }, { status: 403 })

  const db = adminDb()
  const { data: links } = await db.from('employer_hospitals').select('hospital_id').eq('employer_id', user.org_id ?? '')
  const hospitalIds = (links ?? []).map(l => l.hospital_id as string)

  let totalPatients = 0
  const condMap: Record<string, number> = {}

  for (const hid of hospitalIds) {
    const [pats, conds] = await Promise.all([
      db.from('patients').select('id').eq('org_id', hid),
      db.from('patient_conditions').select('icd10_code').eq('org_id', hid).eq('status', 'active'),
    ])
    totalPatients += pats.data?.length ?? 0
    for (const c of conds.data ?? []) condMap[c.icd10_code] = (condMap[c.icd10_code] ?? 0) + 1
  }

  const conditions = Object.entries(condMap)
    .sort((a, b) => b[1] - a[1]).slice(0, 10)
    .map(([code, count]) => ({ code, count, prevalence_pct: Math.round(count / Math.max(totalPatients, 1) * 1000) / 10 }))

  return NextResponse.json({ total_covered_patients: totalPatients, conditions })
}

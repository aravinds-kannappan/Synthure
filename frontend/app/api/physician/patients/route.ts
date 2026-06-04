import { NextResponse } from 'next/server'
import { verifyToken, adminDb } from '@/lib/api-auth'

export async function GET(request: Request) {
  const user = await verifyToken(request.headers.get('Authorization'))
  if (!user || user.role !== 'physician') return NextResponse.json({ detail: 'Forbidden' }, { status: 403 })

  const physician_id = user.user_id ?? user.sub
  const db = adminDb()

  const { data: assignments } = await db.from('physician_patients')
    .select('patient_id').eq('physician_id', physician_id)

  const patients = await Promise.all((assignments ?? []).map(async a => {
    const { data: pat } = await db.from('patients').select('*').eq('id', a.patient_id).maybeSingle()
    if (!pat) return null

    const { data: latestNote } = await db.from('clinical_notes')
      .select('id, created_at').eq('patient_id', a.patient_id).eq('physician_id', physician_id)
      .order('created_at', { ascending: false }).limit(1)

    let summary = null, urgency = null, readmission_risk = null
    if (latestNote?.[0]) {
      const { data: res } = await db.from('ai_pipeline_results')
        .select('result_json').eq('clinical_note_id', latestNote[0].id).eq('pipeline_type', 'jargon').limit(1)
      if (res?.[0]) {
        const d = res[0].result_json?.data as Record<string, unknown> | undefined
        summary = (d?.summary as string) ?? null
        urgency = (d?.urgency as string) ?? null
        readmission_risk = d?.readmission_risk ?? null
      }
    }

    const { data: allNotes } = await db.from('clinical_notes')
      .select('id', { count: 'exact' }).eq('patient_id', a.patient_id).eq('physician_id', physician_id)

    return { ...pat, latest_visit: latestNote?.[0]?.created_at ?? null, latest_summary: summary, urgency, readmission_risk, note_count: allNotes?.length ?? 0 }
  }))

  const filtered = patients.filter(Boolean)
  return NextResponse.json({ patients: filtered, total: filtered.length })
}

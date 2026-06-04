import { NextResponse } from 'next/server'
import { verifyToken, adminDb } from '@/lib/api-auth'

export async function GET(request: Request) {
  const user = await verifyToken(request.headers.get('Authorization'))
  if (!user || user.role !== 'patient') return NextResponse.json({ detail: 'Forbidden' }, { status: 403 })
  if (!user.patient_id) return NextResponse.json({ detail: 'No patient record linked' }, { status: 404 })

  const db = adminDb()
  const { data: notes } = await db.from('clinical_notes')
    .select('id, physician_id, created_at')
    .eq('patient_id', user.patient_id)
    .order('created_at', { ascending: false })

  const enriched = await Promise.all((notes ?? []).map(async note => {
    // Physician name
    const { data: phys } = await db.from('users').select('name').eq('id', note.physician_id).maybeSingle()

    // Jargon summary
    const { data: results } = await db.from('ai_pipeline_results')
      .select('result_json')
      .eq('clinical_note_id', note.id)
      .eq('pipeline_type', 'jargon')
      .order('created_at', { ascending: false })
      .limit(1)

    const data = results?.[0]?.result_json?.data as Record<string, unknown> | undefined
    return {
      ...note,
      physician_name: (phys?.name as string | undefined) ?? 'Unknown',
      ai_summary: (data?.summary as string | undefined) ?? null,
      urgency: (data?.urgency as string | undefined) ?? null,
    }
  }))

  return NextResponse.json({ notes: enriched, total: enriched.length })
}

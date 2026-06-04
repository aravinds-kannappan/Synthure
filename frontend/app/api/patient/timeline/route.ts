import { NextResponse } from 'next/server'
import { verifyToken, adminDb } from '@/lib/api-auth'

export async function GET(request: Request) {
  const user = await verifyToken(request.headers.get('Authorization'))
  if (!user || user.role !== 'patient') return NextResponse.json({ detail: 'Forbidden' }, { status: 403 })
  if (!user.patient_id) return NextResponse.json({ detail: 'No patient record linked' }, { status: 404 })

  const db = adminDb()
  const { data: events } = await db.from('care_events')
    .select('*')
    .eq('patient_id', user.patient_id)
    .contains('portal_visibility', ['patient'])
    .order('created_at', { ascending: false })
    .limit(50)

  return NextResponse.json({ events: events ?? [], total: events?.length ?? 0 })
}

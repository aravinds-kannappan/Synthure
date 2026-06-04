import { NextResponse } from 'next/server'
import { verifyToken, adminDb } from '@/lib/api-auth'

export async function GET(request: Request) {
  const user = await verifyToken(request.headers.get('Authorization'))
  if (!user || user.role !== 'employer_admin') return NextResponse.json({ detail: 'Forbidden' }, { status: 403 })

  const db = adminDb()
  const { data: links } = await db.from('employer_hospitals').select('hospital_id').eq('employer_id', user.org_id ?? '')

  const hospitals = await Promise.all((links ?? []).map(async link => {
    const hid = link.hospital_id as string
    const [org, pats, notes, phys] = await Promise.all([
      db.from('orgs').select('id, name').eq('id', hid).maybeSingle(),
      db.from('patients').select('id').eq('org_id', hid),
      db.from('clinical_notes').select('id').eq('org_id', hid),
      db.from('users').select('id').eq('org_id', hid).eq('role', 'physician'),
    ])
    return { hospital_id: hid, name: org.data?.name ?? hid, patient_count: pats.data?.length ?? 0, note_count: notes.data?.length ?? 0, physician_count: phys.data?.length ?? 0 }
  }))

  return NextResponse.json({ hospitals, total: hospitals.length })
}

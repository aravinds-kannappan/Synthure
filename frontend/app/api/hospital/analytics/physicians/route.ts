import { NextResponse } from 'next/server'
import { verifyToken, adminDb } from '@/lib/api-auth'

export async function GET(request: Request) {
  const user = await verifyToken(request.headers.get('Authorization'))
  if (!user || user.role !== 'hospital_admin') return NextResponse.json({ detail: 'Forbidden' }, { status: 403 })

  const db = adminDb()
  const { data: physList } = await db.from('users').select('id, name, email').eq('org_id', user.org_id ?? '').eq('role', 'physician')

  const physicians = await Promise.all((physList ?? []).map(async phys => {
    const [patAssign, noteCount] = await Promise.all([
      db.from('physician_patients').select('patient_id').eq('physician_id', phys.id),
      db.from('clinical_notes').select('id').eq('physician_id', phys.id),
    ])
    return { physician_id: phys.id, name: phys.name, email: phys.email, patient_count: patAssign.data?.length ?? 0, note_count: noteCount.data?.length ?? 0 }
  }))

  return NextResponse.json({ physicians, total: physicians.length })
}

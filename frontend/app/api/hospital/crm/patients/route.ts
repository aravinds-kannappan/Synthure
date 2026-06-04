import { NextResponse } from 'next/server'
import { verifyToken, adminDb } from '@/lib/api-auth'

export async function GET(request: Request) {
  const user = await verifyToken(request.headers.get('Authorization'))
  if (!user || (user.role !== 'hospital_admin' && user.role !== 'physician' && user.role !== 'provider')) {
    return NextResponse.json({ detail: 'Forbidden' }, { status: 403 })
  }
  const db = adminDb()
  const { data: patients } = await db.from('patients').select('*').eq('org_id', user.org_id ?? '')
  return NextResponse.json({ patients: patients ?? [], total: patients?.length ?? 0 })
}

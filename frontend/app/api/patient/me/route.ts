import { NextResponse } from 'next/server'
import { verifyToken, adminDb } from '@/lib/api-auth'

export async function GET(request: Request) {
  const user = await verifyToken(request.headers.get('Authorization'))
  if (!user || user.role !== 'patient') return NextResponse.json({ detail: 'Forbidden' }, { status: 403 })
  if (!user.patient_id) return NextResponse.json({ detail: 'No patient record linked' }, { status: 404 })

  const db = adminDb()
  const { data: patient } = await db.from('patients').select('*').eq('id', user.patient_id).maybeSingle()
  if (!patient) return NextResponse.json({ detail: 'Patient not found' }, { status: 404 })

  const [conditions, medications, insurance] = await Promise.all([
    db.from('patient_conditions').select('*').eq('patient_id', user.patient_id).eq('status', 'active'),
    db.from('patient_medications').select('*').eq('patient_id', user.patient_id).eq('status', 'active'),
    db.from('patient_insurance').select('*').eq('patient_id', user.patient_id),
  ])

  return NextResponse.json({ ...patient, conditions: conditions.data ?? [], medications: medications.data ?? [], insurance: insurance.data ?? [] })
}

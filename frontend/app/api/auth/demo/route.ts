import { NextResponse } from 'next/server'
import { createToken, adminDb } from '@/lib/api-auth'

const DEMO_HOSPITAL_ORG = '10000000-0000-0000-0000-000000000001'
const DEMO_EMPLOYER_ORG = '10000000-0000-0000-0000-000000000002'

const DEMO_USERS: Record<string, { email: string; name: string; org_id: string }> = {
  physician:      { email: 'demo-physician@synthure.demo', name: 'Dr. Sarah Chen', org_id: DEMO_HOSPITAL_ORG },
  hospital_admin: { email: 'demo-admin@synthure.demo',     name: 'Hospital Admin',  org_id: DEMO_HOSPITAL_ORG },
  patient:        { email: 'demo-patient@synthure.demo',   name: 'Jane Smith',       org_id: DEMO_HOSPITAL_ORG },
  employer_admin: { email: 'demo-hr@synthure.demo',        name: 'HR Manager',       org_id: DEMO_EMPLOYER_ORG },
}

export async function POST(request: Request) {
  const { searchParams } = new URL(request.url)
  const role = searchParams.get('role') ?? 'physician'
  const info = DEMO_USERS[role]
  if (!info) return NextResponse.json({ detail: 'Invalid role' }, { status: 400 })

  try {
    const db = adminDb()

    // Ensure demo orgs exist
    await db.from('orgs').upsert([
      { id: DEMO_HOSPITAL_ORG, name: 'Synthure Demo Hospital', type: 'hospital', plan: 'trial' },
      { id: DEMO_EMPLOYER_ORG, name: 'Synthure Demo Corp',     type: 'employer', plan: 'trial' },
    ], { onConflict: 'id', ignoreDuplicates: true })

    // Link employer -> hospital
    await db.from('employer_hospitals').upsert(
      { employer_id: DEMO_EMPLOYER_ORG, hospital_id: DEMO_HOSPITAL_ORG },
      { onConflict: 'employer_id,hospital_id', ignoreDuplicates: true }
    )

    // Ensure demo user exists
    let { data: user } = await db.from('users').select('*').eq('email', info.email).maybeSingle()
    if (!user) {
      const { data: created } = await db.from('users')
        .insert({ org_id: info.org_id, email: info.email, name: info.name, role })
        .select().single()
      user = created
    }
    if (!user) return NextResponse.json({ detail: 'Failed to create demo user' }, { status: 500 })

    // For patient role: ensure patient record linked to user
    let patient_id: string | null = null
    if (role === 'patient') {
      let { data: pat } = await db.from('patients').select('id').eq('user_id', user.id).maybeSingle()
      if (!pat) {
        const { data: created } = await db.from('patients')
          .insert({ user_id: user.id, org_id: DEMO_HOSPITAL_ORG, first_name: 'Jane', last_name: 'Smith', email: info.email, mrn: 'DEMO-001' })
          .select().single()
        pat = created
      }
      if (pat) patient_id = pat.id as string
    }

    // Ensure a demo patient exists for the physician to submit notes against
    if (role === 'physician') {
      const { data: demoPat } = await db.from('users').select('id').eq('email', DEMO_USERS.patient.email).maybeSingle()
      if (demoPat) {
        const { data: existingPat } = await db.from('patients').select('id').eq('user_id', demoPat.id).maybeSingle()
        if (!existingPat) {
          await db.from('patients').insert({ user_id: demoPat.id, org_id: DEMO_HOSPITAL_ORG, first_name: 'Jane', last_name: 'Smith', email: DEMO_USERS.patient.email, mrn: 'DEMO-001' })
        }
      }
    }

    const token = await createToken({
      sub: user.email, name: user.name, role,
      org_id: info.org_id, user_id: user.id,
      ...(patient_id ? { patient_id } : {}),
    })

    return NextResponse.json({ token, name: user.name, role, org_id: info.org_id, user_id: user.id, patient_id })
  } catch (err) {
    return NextResponse.json({ detail: String(err) }, { status: 500 })
  }
}

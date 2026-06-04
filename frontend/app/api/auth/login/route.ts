import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createToken, adminDb } from '@/lib/api-auth'

export async function POST(request: Request) {
  const { email, password } = await request.json()
  if (!email || !password) return NextResponse.json({ detail: 'email and password required' }, { status: 400 })

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const anonKey    = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

  if (!supabaseUrl || !anonKey) {
    return NextResponse.json({ detail: 'Authentication service not configured' }, { status: 503 })
  }

  // Verify credentials with Supabase Auth
  const anonClient = createClient(supabaseUrl, anonKey)
  const { data: authData, error: authError } = await anonClient.auth.signInWithPassword({
    email: email.trim().toLowerCase(),
    password,
  })
  if (authError || !authData.user) {
    return NextResponse.json({ detail: 'Invalid email or password' }, { status: 401 })
  }

  const db = adminDb()

  // Look up user by auth_id
  let { data: user } = await db.from('users').select('*').eq('auth_id', authData.user.id).maybeSingle()
  if (!user) {
    const res = await db.from('users').select('*').eq('email', email.trim().toLowerCase()).maybeSingle()
    user = res.data
    if (user && !user.auth_id) {
      await db.from('users').update({ auth_id: authData.user.id }).eq('id', user.id)
    }
  }
  if (!user) return NextResponse.json({ detail: 'No account found. Contact your administrator.' }, { status: 401 })

  let patient_id: string | null = null
  if (user.role === 'patient') {
    const { data: pat } = await db.from('patients').select('id').eq('user_id', user.id).maybeSingle()
    if (pat) patient_id = pat.id as string
  }

  const token = await createToken({
    sub: user.email, name: user.name, role: user.role,
    org_id: user.org_id ?? undefined, user_id: user.id,
    ...(patient_id ? { patient_id } : {}),
  })

  return NextResponse.json({ token, name: user.name, role: user.role, org_id: user.org_id ?? null, user_id: user.id, patient_id })
}

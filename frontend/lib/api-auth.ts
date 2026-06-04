/**
 * Server-side JWT utilities for Next.js API route handlers.
 * Uses jose (works in both Node.js and Edge runtimes).
 * The secret must match the JWT_SECRET env var used by the Python backend
 * so tokens are interoperable.
 */
import { SignJWT, jwtVerify } from 'jose'
import { createClient } from '@supabase/supabase-js'

const _secret = () =>
  new TextEncoder().encode(process.env.JWT_SECRET ?? 'synthure-demo-secret-2024')

export interface JwtPayload {
  sub: string
  name: string
  role: string
  org_id?: string
  user_id?: string
  patient_id?: string
  exp?: number
}

export async function createToken(payload: Omit<JwtPayload, 'exp'>): Promise<string> {
  return new SignJWT(payload as Record<string, unknown>)
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime('24h')
    .sign(_secret())
}

export async function verifyToken(authHeader: string | null): Promise<JwtPayload | null> {
  if (!authHeader?.startsWith('Bearer ')) return null
  try {
    const { payload } = await jwtVerify(authHeader.slice(7), _secret())
    return payload as unknown as JwtPayload
  } catch {
    return null
  }
}

/** Service-role Supabase client — bypasses RLS for server-side writes. */
export function adminDb() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!
  if (!url || !key) throw new Error('Supabase env vars not configured')
  return createClient(url, key)
}

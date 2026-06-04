'use client'
import { useEffect, useState } from 'react'

const STORAGE_KEY = 'synthure_user'

export interface AuthUser {
  token: string
  name: string
  role: string
  org_id?: string
  user_id?: string
  patient_id?: string
}

export function getStoredUser(): AuthUser | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as AuthUser) : null
  } catch {
    return null
  }
}

export function storeUser(user: AuthUser): void {
  if (typeof window === 'undefined') return
  localStorage.setItem(STORAGE_KEY, JSON.stringify(user))
}

export function clearUser(): void {
  if (typeof window === 'undefined') return
  localStorage.removeItem(STORAGE_KEY)
}

/** React hook — hydrates auth state from localStorage after mount. */
export function useAuth() {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    setUser(getStoredUser())
    setReady(true)
  }, [])

  return { user, ready }
}

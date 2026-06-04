'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { api } from '@/lib/api'
import { storeUser } from '@/lib/auth'

const ROLE_ROUTES: Record<string, string> = {
  patient:        '/patient/dashboard',
  physician:      '/physician/dashboard',
  hospital_admin: '/hospital/dashboard',
  employer_admin: '/employer/dashboard',
  provider:       '/physician/dashboard',
}

export default function LoginPage() {
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState('')
  const router = useRouter()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      const result = await api.login(email.trim().toLowerCase(), password)
      storeUser({
        token:      result.token,
        name:       result.name,
        role:       result.role,
        org_id:     result.org_id,
        user_id:    result.user_id,
        patient_id: result.patient_id,
      })
      router.push(ROLE_ROUTES[result.role] ?? '/physician/dashboard')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Login failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-[#070f1e] flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-10">
          <h1 className="text-3xl font-light text-white tracking-tight mb-1">Synthure</h1>
          <p className="text-sm text-slate-500">Clinical AI Platform</p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="bg-[#0d1525] border border-slate-800 rounded-2xl p-7 space-y-5"
        >
          <div>
            <label className="text-xs text-slate-500 block mb-1.5">Email address</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              autoComplete="email"
              className="w-full bg-[#0a1020] border border-slate-700 rounded-lg px-3.5 py-2.5 text-sm text-slate-100 placeholder-slate-600 focus:outline-none focus:border-indigo-500 transition-colors"
              placeholder="you@hospital.org"
            />
          </div>

          <div>
            <label className="text-xs text-slate-500 block mb-1.5">Password</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              autoComplete="current-password"
              className="w-full bg-[#0a1020] border border-slate-700 rounded-lg px-3.5 py-2.5 text-sm text-slate-100 focus:outline-none focus:border-indigo-500 transition-colors"
            />
          </div>

          {error && (
            <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3.5 py-2.5">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-indigo-500 hover:bg-indigo-400 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium py-2.5 rounded-lg text-sm transition-colors"
          >
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

        <p className="text-center text-xs text-slate-600 mt-6">
          Access is provisioned by your hospital administrator.
        </p>
      </div>
    </div>
  )
}

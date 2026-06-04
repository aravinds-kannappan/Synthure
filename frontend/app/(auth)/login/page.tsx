'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { api } from '@/lib/api'
import { getPortalHome } from '@/lib/portal'
import type { PortalRole } from '@/lib/types'

const DEMO_LOGINS = [
  { label: 'Patient', email: 'patient@synthure.ai', color: 'bg-teal-500/20 text-teal-300 border-teal-500/30' },
  { label: 'Physician', email: 'doctor@synthure.ai', color: 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30' },
  { label: 'Hospital', email: 'admin@synthure.ai', color: 'bg-teal-500/20 text-teal-300 border-teal-500/30' },
  { label: 'Employer', email: 'hr@synthure.ai', color: 'bg-violet-500/20 text-violet-300 border-violet-500/30' },
]

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      const user = await api.login(email, password)
      localStorage.setItem('synthure_user', JSON.stringify(user))
      router.push(getPortalHome(user.role as PortalRole))
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Login failed')
    } finally {
      setLoading(false)
    }
  }

  function quickLogin(demoEmail: string) {
    setEmail(demoEmail)
    setPassword('demo1234')
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#04091a] px-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-10">
          <span className="text-teal-400 text-4xl font-light tracking-widest">◈ SYNTHURE</span>
          <p className="mt-2 text-slate-400 text-sm">Clinical AI platform</p>
        </div>

        {/* Demo quick-login chips */}
        <div className="mb-6">
          <p className="text-xs text-slate-500 mb-3 text-center">Quick demo access</p>
          <div className="grid grid-cols-4 gap-2">
            {DEMO_LOGINS.map((d) => (
              <button
                key={d.email}
                onClick={() => quickLogin(d.email)}
                className={`text-xs py-2 px-2 rounded-lg border font-medium transition-opacity hover:opacity-80 ${d.color}`}
              >
                {d.label}
              </button>
            ))}
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleLogin} className="space-y-4 bg-[#0d1525] rounded-2xl p-8 border border-slate-800">
          <div>
            <label className="text-xs text-slate-400 mb-1 block">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full bg-[#162035] border border-slate-700 rounded-lg px-4 py-2.5 text-sm text-slate-100 focus:outline-none focus:border-teal-500"
              placeholder="you@synthure.ai"
              required
            />
          </div>
          <div>
            <label className="text-xs text-slate-400 mb-1 block">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-[#162035] border border-slate-700 rounded-lg px-4 py-2.5 text-sm text-slate-100 focus:outline-none focus:border-teal-500"
              placeholder="••••••••"
              required
            />
          </div>
          {error && <p className="text-red-400 text-xs">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-teal-500 hover:bg-teal-400 disabled:opacity-50 text-[#04091a] font-semibold py-2.5 rounded-lg text-sm transition-colors"
          >
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

        <p className="text-center text-xs text-slate-600 mt-6">
          All demo accounts use password <code className="text-slate-400">demo1234</code>
        </p>
      </div>
    </div>
  )
}

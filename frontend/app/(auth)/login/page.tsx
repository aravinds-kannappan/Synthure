'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { api } from '@/lib/api'
import { getPortalHome } from '@/lib/portal'
import type { PortalRole } from '@/lib/types'

const DEMO_USERS = [
  {
    label: 'Patient',
    email: 'patient@synthure.ai',
    role: 'patient' as PortalRole,
    name: 'Jane Smith',
    color: 'border-teal-500/40 bg-teal-500/10 text-teal-300 hover:bg-teal-500/20',
    icon: '◎',
  },
  {
    label: 'Physician',
    email: 'doctor@synthure.ai',
    role: 'physician' as PortalRole,
    name: 'Dr. Sarah Chen',
    color: 'border-indigo-500/40 bg-indigo-500/10 text-indigo-300 hover:bg-indigo-500/20',
    icon: '◈',
  },
  {
    label: 'Hospital',
    email: 'admin@synthure.ai',
    role: 'hospital_admin' as PortalRole,
    name: 'Hospital Admin',
    color: 'border-cyan-500/40 bg-cyan-500/10 text-cyan-300 hover:bg-cyan-500/20',
    icon: '⬡',
  },
  {
    label: 'Employer',
    email: 'hr@synthure.ai',
    role: 'employer_admin' as PortalRole,
    name: 'HR Manager',
    color: 'border-violet-500/40 bg-violet-500/10 text-violet-300 hover:bg-violet-500/20',
    icon: '◇',
  },
]

export default function LoginPage() {
  const router = useRouter()
  const [tab, setTab] = useState<'demo' | 'signin'>('demo')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  // Demo login — fully client-side, no API call needed
  function handleDemoLogin(user: typeof DEMO_USERS[0]) {
    const session = {
      token: `demo-${user.role}-${Date.now()}`,
      name: user.name,
      role: user.role,
      org_id: 'demo-org',
      demo: true,
    }
    localStorage.setItem('synthure_user', JSON.stringify(session))
    router.push(getPortalHome(user.role))
  }

  // Real user login — calls backend API (requires NEXT_PUBLIC_API_URL + backend deployed)
  async function handleSignIn(e: React.FormEvent) {
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

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#04091a] px-4">
      <div className="w-full max-w-md">

        {/* Back to landing */}
        <div className="mb-8 text-center">
          <Link href="/" className="text-xs text-slate-500 hover:text-slate-400 transition-colors">
            ← Back to home
          </Link>
        </div>

        {/* Logo */}
        <div className="text-center mb-8">
          <span className="text-teal-400 text-3xl font-light tracking-widest">◈ SYNTHURE</span>
          <p className="mt-1.5 text-slate-400 text-sm">Clinical AI platform</p>
        </div>

        {/* Tabs */}
        <div className="flex rounded-xl bg-[#0d1525] border border-slate-800 p-1 mb-6">
          <button
            onClick={() => { setTab('demo'); setError('') }}
            className={`flex-1 text-sm py-2 rounded-lg font-medium transition-all ${
              tab === 'demo'
                ? 'bg-teal-500/20 text-teal-300 border border-teal-500/30'
                : 'text-slate-500 hover:text-slate-300'
            }`}
          >
            Demo access
          </button>
          <button
            onClick={() => { setTab('signin'); setError('') }}
            className={`flex-1 text-sm py-2 rounded-lg font-medium transition-all ${
              tab === 'signin'
                ? 'bg-slate-700/50 text-slate-200 border border-slate-600/50'
                : 'text-slate-500 hover:text-slate-300'
            }`}
          >
            Sign in
          </button>
        </div>

        {/* Demo tab */}
        {tab === 'demo' && (
          <div className="bg-[#0d1525] rounded-2xl p-6 border border-slate-800">
            <p className="text-xs text-slate-500 mb-5 text-center">
              Choose a portal to explore — no account needed
            </p>
            <div className="grid grid-cols-2 gap-3">
              {DEMO_USERS.map((u) => (
                <button
                  key={u.role}
                  onClick={() => handleDemoLogin(u)}
                  className={`flex flex-col items-center gap-2 py-5 px-3 rounded-xl border font-medium transition-all ${u.color}`}
                >
                  <span className="text-2xl">{u.icon}</span>
                  <span className="text-sm">{u.label}</span>
                  <span className="text-xs opacity-60">{u.name}</span>
                </button>
              ))}
            </div>
            <p className="text-center text-xs text-slate-600 mt-5">
              Demo sessions are local — nothing is stored server-side
            </p>
          </div>
        )}

        {/* Sign in tab */}
        {tab === 'signin' && (
          <form
            onSubmit={handleSignIn}
            className="bg-[#0d1525] rounded-2xl p-6 border border-slate-800 space-y-4"
          >
            <div>
              <label className="text-xs text-slate-400 mb-1.5 block">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-[#162035] border border-slate-700 rounded-lg px-4 py-2.5 text-sm text-slate-100 focus:outline-none focus:border-teal-500 transition-colors"
                placeholder="you@example.com"
                required
              />
            </div>
            <div>
              <label className="text-xs text-slate-400 mb-1.5 block">Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-[#162035] border border-slate-700 rounded-lg px-4 py-2.5 text-sm text-slate-100 focus:outline-none focus:border-teal-500 transition-colors"
                placeholder="••••••••"
                required
              />
            </div>
            {error && (
              <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2 text-xs text-red-400">
                {error}
              </div>
            )}
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-teal-500 hover:bg-teal-400 disabled:opacity-50 text-[#04091a] font-semibold py-2.5 rounded-lg text-sm transition-colors"
            >
              {loading ? 'Signing in…' : 'Sign in'}
            </button>
            <p className="text-center text-xs text-slate-600">
              Real user accounts require the backend API to be running.{' '}
              <button
                type="button"
                onClick={() => setTab('demo')}
                className="text-teal-500 hover:text-teal-400 transition-colors"
              >
                Use demo instead
              </button>
            </p>
          </form>
        )}
      </div>
    </div>
  )
}

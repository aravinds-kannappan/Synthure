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

const DEMO_PORTALS: { role: string; label: string; description: string; icon: string }[] = [
  {
    role: 'physician',
    label: 'Physician',
    description: 'Submit clinical notes, run the AI pipeline, see patient insights',
    icon: '👨‍⚕️',
  },
  {
    role: 'patient',
    label: 'Patient',
    description: 'View your conditions, medications, visit history and AI summaries',
    icon: '🧑',
  },
  {
    role: 'hospital_admin',
    label: 'Hospital Admin',
    description: 'Drill down from hospital → physician → patient → clinical note',
    icon: '🏥',
  },
  {
    role: 'employer_admin',
    label: 'Employer',
    description: 'Population health analytics aggregated across covered hospitals',
    icon: '💼',
  },
]

export default function LoginPage() {
  const [email,    setEmail]    = useState('')
  const [password, setPassword] = useState('')
  const [loading,  setLoading]  = useState(false)
  const [demoRole, setDemoRole] = useState<string | null>(null)
  const [error,    setError]    = useState('')
  const router = useRouter()

  async function handleSignIn(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true); setError('')
    try {
      const result = await api.login(email.trim().toLowerCase(), password)
      storeUser({ token: result.token, name: result.name, role: result.role, org_id: result.org_id, user_id: result.user_id, patient_id: result.patient_id })
      router.push(ROLE_ROUTES[result.role] ?? '/physician/dashboard')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Login failed')
    } finally {
      setLoading(false)
    }
  }

  async function handleDemo(role: string) {
    setDemoRole(role); setError('')
    try {
      const result = await api.demoLogin(role)
      storeUser({ token: result.token, name: result.name, role: result.role, org_id: result.org_id, user_id: result.user_id, patient_id: result.patient_id })
      router.push(ROLE_ROUTES[result.role] ?? '/physician/dashboard')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Demo setup failed')
    } finally {
      setDemoRole(null)
    }
  }

  return (
    <div className="min-h-screen bg-[#070f1e] flex items-center justify-center p-4">
      <div className="w-full max-w-lg">

        {/* Logo */}
        <div className="text-center mb-10">
          <h1 className="text-3xl font-light text-white tracking-tight mb-1">Synthure</h1>
          <p className="text-sm text-slate-500">Clinical AI Platform</p>
        </div>

        {/* Demo portals */}
        <div className="mb-8">
          <p className="text-xs text-slate-500 uppercase tracking-widest text-center mb-4">Explore the demo</p>
          <div className="grid grid-cols-2 gap-3">
            {DEMO_PORTALS.map(p => (
              <button
                key={p.role}
                onClick={() => handleDemo(p.role)}
                disabled={!!demoRole}
                className="group text-left bg-[#0d1525] hover:bg-[#111e33] border border-slate-800 hover:border-indigo-500/40 rounded-xl p-4 transition-all disabled:opacity-60 disabled:cursor-wait"
              >
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xl">{p.icon}</span>
                  <span className="text-sm font-medium text-slate-200 group-hover:text-white transition-colors">
                    {p.label}
                  </span>
                  {demoRole === p.role && (
                    <div className="ml-auto w-3.5 h-3.5 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin" />
                  )}
                </div>
                <p className="text-xs text-slate-500 leading-relaxed">{p.description}</p>
              </button>
            ))}
          </div>
        </div>

        {/* Divider */}
        <div className="flex items-center gap-3 mb-6">
          <div className="flex-1 h-px bg-slate-800" />
          <span className="text-xs text-slate-600">or sign in with your account</span>
          <div className="flex-1 h-px bg-slate-800" />
        </div>

        {/* Sign-in form */}
        <form onSubmit={handleSignIn} className="bg-[#0d1525] border border-slate-800 rounded-2xl p-6 space-y-4">
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

          {!!error && (
            <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3.5 py-2.5">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-indigo-500 hover:bg-indigo-400 disabled:opacity-50 text-white font-medium py-2.5 rounded-lg text-sm transition-colors"
          >
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

        <p className="text-center text-xs text-slate-700 mt-6">
          Real accounts are provisioned by your hospital administrator.
        </p>
      </div>
    </div>
  )
}

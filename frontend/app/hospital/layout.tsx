'use client'
import { usePathname, useRouter } from 'next/navigation'
import Link from 'next/link'
import { LayoutDashboard, Users, Briefcase, Building2, FileText, BarChart2, Settings, LogOut } from 'lucide-react'

const NAV = [
  { href: '/hospital/dashboard',          label: 'Dashboard',    icon: LayoutDashboard },
  { href: '/hospital/crm/patients',       label: 'Patients',     icon: Users },
  { href: '/hospital/crm/providers',      label: 'Providers',    icon: Briefcase },
  { href: '/hospital/crm/payers',         label: 'Payers',       icon: Building2 },
  { href: '/hospital/rcm/claims',         label: 'Claims',       icon: FileText },
  { href: '/hospital/rcm/ar-aging',       label: 'AR Aging',     icon: BarChart2 },
  { href: '/hospital/rcm/denials',        label: 'Denials',      icon: FileText },
  { href: '/hospital/analytics',          label: 'Analytics',    icon: BarChart2 },
  { href: '/hospital/settings/org',       label: 'Settings',     icon: Settings },
]

export default function HospitalLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()

  return (
    <div className="flex h-screen bg-[#04091a] overflow-hidden">
      <aside className="w-60 flex-shrink-0 bg-[#0d1525] border-r border-slate-800 flex flex-col">
        <div className="px-6 py-5 border-b border-slate-800">
          <span className="text-teal-400 font-light tracking-widest text-lg">◈ SYNTHURE</span>
          <div className="mt-1 text-[11px] text-teal-400/60 font-medium uppercase tracking-wider">Hospital Portal</div>
        </div>
        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          {NAV.map(({ href, label, icon: Icon }) => (
            <Link key={href} href={href}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${
                pathname.startsWith(href)
                  ? 'bg-teal-500/10 text-teal-400'
                  : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
              }`}
            >
              <Icon className="w-4 h-4" />{label}
            </Link>
          ))}
        </nav>
        <div className="px-3 py-4 border-t border-slate-800">
          <button onClick={() => { localStorage.removeItem('synthure_user'); router.push('/login') }}
            className="flex items-center gap-3 px-3 py-2.5 w-full rounded-lg text-sm text-slate-400 hover:bg-slate-800">
            <LogOut className="w-4 h-4" />Sign out
          </button>
        </div>
      </aside>
      <main className="flex-1 overflow-y-auto">{children}</main>
    </div>
  )
}

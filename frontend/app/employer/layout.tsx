'use client'
import { usePathname, useRouter } from 'next/navigation'
import Link from 'next/link'
import { LayoutDashboard, Shield, UserPlus, FileText, BarChart2, Users, TrendingUp, LogOut } from 'lucide-react'

const NAV = [
  { href: '/employer/dashboard',   label: 'Dashboard',   icon: LayoutDashboard },
  { href: '/employer/benefits',    label: 'Benefits',    icon: Shield },
  { href: '/employer/enrollment',  label: 'Enrollment',  icon: UserPlus },
  { href: '/employer/cobra',       label: 'COBRA',       icon: FileText },
  { href: '/employer/compliance',  label: 'Compliance',  icon: FileText },
  { href: '/employer/population',  label: 'Population',  icon: Users },
  { href: '/employer/analytics',   label: 'Analytics',   icon: BarChart2 },
  { href: '/employer/reports',     label: 'Reports',     icon: TrendingUp },
]

export default function EmployerLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()

  return (
    <div className="flex h-screen bg-[#04091a] overflow-hidden">
      <aside className="w-60 flex-shrink-0 bg-[#0d1525] border-r border-slate-800 flex flex-col">
        <div className="px-6 py-5 border-b border-slate-800">
          <span className="text-violet-400 font-light tracking-widest text-lg">◈ SYNTHURE</span>
          <div className="mt-1 text-[11px] text-violet-400/60 font-medium uppercase tracking-wider">Employer Portal</div>
        </div>
        <nav className="flex-1 px-3 py-4 space-y-1">
          {NAV.map(({ href, label, icon: Icon }) => (
            <Link key={href} href={href}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${
                pathname.startsWith(href)
                  ? 'bg-violet-500/10 text-violet-400'
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

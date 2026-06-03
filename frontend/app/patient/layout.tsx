'use client'
import { useRouter, usePathname } from 'next/navigation'
import Link from 'next/link'
import { Heart, Shield, FileText, BookOpen, FolderOpen, MessageSquare, LogOut } from 'lucide-react'

const NAV = [
  { href: '/patient/dashboard',  label: 'My Health',   icon: Heart },
  { href: '/patient/coverage',   label: 'My Coverage', icon: Shield },
  { href: '/patient/claims',     label: 'My Claims',   icon: FileText },
  { href: '/patient/education',  label: 'Education',   icon: BookOpen },
  { href: '/patient/documents',  label: 'Documents',   icon: FolderOpen },
  { href: '/patient/messages',   label: 'Messages',    icon: MessageSquare },
]

export default function PatientLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()

  function logout() {
    localStorage.removeItem('synthure_user')
    router.push('/login')
  }

  return (
    <div className="flex h-screen bg-[#04091a] overflow-hidden">
      {/* Sidebar */}
      <aside className="w-60 flex-shrink-0 bg-[#0d1525] border-r border-slate-800 flex flex-col">
        <div className="px-6 py-5 border-b border-slate-800">
          <span className="text-teal-400 font-light tracking-widest text-lg">◈ SYNTHURE</span>
          <div className="mt-1 text-[11px] text-teal-400/60 font-medium uppercase tracking-wider">Patient Portal</div>
        </div>
        <nav className="flex-1 px-3 py-4 space-y-1">
          {NAV.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${
                pathname === href
                  ? 'bg-teal-500/10 text-teal-400'
                  : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
              }`}
            >
              <Icon className="w-4 h-4" />
              {label}
            </Link>
          ))}
        </nav>
        <div className="px-3 py-4 border-t border-slate-800">
          <button
            onClick={logout}
            className="flex items-center gap-3 px-3 py-2.5 w-full rounded-lg text-sm text-slate-400 hover:bg-slate-800 hover:text-slate-200 transition-colors"
          >
            <LogOut className="w-4 h-4" />
            Sign out
          </button>
        </div>
      </aside>
      <main className="flex-1 overflow-y-auto">{children}</main>
    </div>
  )
}

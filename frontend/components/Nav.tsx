'use client'

import Link from 'next/link'

export function Logo({ className = '' }: { className?: string }) {
  return (
    <Link href="/" className={`flex items-center gap-2.5 group ${className}`}>
      <span className="relative inline-flex h-7 w-7 items-center justify-center">
        <span className="absolute inset-0 rounded-lg bg-gradient-to-br from-teal-400/30 to-indigo-500/30 blur-[6px] group-hover:blur-[8px] transition-all" />
        <span className="relative text-lg gradient-text font-bold leading-none">◈</span>
      </span>
      <span className="font-semibold tracking-[0.18em] text-sm text-white">SYNTHURE</span>
    </Link>
  )
}

export default function Nav() {
  return (
    <nav className="fixed top-0 inset-x-0 z-50 border-b border-white/[0.06] bg-[#05070f]/70 backdrop-blur-xl">
      <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
        <Logo />
        <div className="hidden md:flex items-center gap-8 text-sm text-slate-400">
          <a href="/#how" className="hover:text-white transition-colors">How it works</a>
          <Link href="/research" className="hover:text-white transition-colors">Research</Link>
        </div>
        <Link
          href="/demo"
          className="text-sm font-semibold bg-white text-[#05070f] px-4 py-2 rounded-lg hover:bg-teal-300 transition-colors"
        >
          Try the demo →
        </Link>
      </div>
    </nav>
  )
}

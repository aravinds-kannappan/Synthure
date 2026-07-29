'use client'

import Link from 'next/link'

const BRAND = '#4d7cff' // blue logo mark
const LIME = '#b6f400'  // ops accent

export function Logo({ className = '' }: { className?: string }) {
  return (
    <Link href="/" className={`flex items-center gap-2 ${className}`}>
      <span className="text-lg leading-none" style={{ color: BRAND }}>◈</span>
      <span className="font-display text-sm font-bold tracking-[0.16em] text-white">SYNTHURE</span>
      <span className="font-mono text-[10px] tracking-[0.3em] text-zinc-600">// OPS</span>
    </Link>
  )
}

export default function Nav() {
  return (
    <nav className="fixed top-0 inset-x-0 z-50 border-b border-white/10 bg-[#0a0a0e]/80 backdrop-blur-xl">
      <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-5">
        <Logo />
        <div className="hidden items-center gap-6 font-mono text-[12px] text-zinc-400 md:flex">
          <a href="/#how" className="transition-colors hover:text-white">how it works</a>
          <Link href="/evals" className="transition-colors hover:text-white">evals</Link>
          <Link href="/observability" className="transition-colors hover:text-white">observability</Link>
          <Link href="/research" className="transition-colors hover:text-white">research</Link>
        </div>
        <Link
          href="/demo"
          className="font-display flex items-center gap-1.5 rounded-lg px-4 py-2 text-[13px] font-bold text-black transition-all hover:brightness-110"
          style={{ background: LIME }}
        >
          Launch ops →
        </Link>
      </div>
    </nav>
  )
}

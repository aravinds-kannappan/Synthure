'use client'

import Link from 'next/link'
import { ArrowUpRight, Menu, X } from 'lucide-react'
import { useState } from 'react'

export function BrandMark() {
  return <svg width="30" height="30" viewBox="0 0 32 32" fill="none" aria-hidden="true"><path d="M16 3v26M3 16h26M6.8 6.8l18.4 18.4M6.8 25.2 25.2 6.8" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round"/><circle cx="16" cy="16" r="6.2" fill="currentColor"/></svg>
}

export function Logo({ className = '' }: { className?: string }) {
  return <Link href="/" className={`site-logo ${className}`} aria-label="Synthure home"><BrandMark /><span>synthure<span className="logo-period">.</span></span></Link>
}

export default function Nav() {
  const [open, setOpen] = useState(false)
  return <header className="site-nav"><div className="site-nav-inner"><Logo />
    <nav className={`site-nav-links ${open ? 'is-open' : ''}`} aria-label="Main navigation">
      <Link href="/dashboard" onClick={() => setOpen(false)}>Dashboard</Link>
      <Link href="/journey" onClick={() => setOpen(false)}>Follow the note</Link>
      <Link href="/insurance" onClick={() => setOpen(false)}>Insurance mapping</Link>
      <Link href="/research" onClick={() => setOpen(false)}>Our approach</Link>
    </nav>
    <div className="site-nav-actions"><Link className="site-button site-button-small" href="/dashboard">Open dashboard <ArrowUpRight size={16}/></Link><button className="site-menu-button" onClick={() => setOpen(!open)} aria-label={open ? 'Close menu' : 'Open menu'} aria-expanded={open}>{open ? <X size={22}/> : <Menu size={22}/>}</button></div>
  </div></header>
}

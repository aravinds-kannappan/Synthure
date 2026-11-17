import Link from 'next/link'
import { ArrowUpRight } from 'lucide-react'

export function BrandMark() {
  return <svg width="30" height="30" viewBox="0 0 32 32" fill="none" aria-hidden="true"><path d="M16 3v26M3 16h26M6.8 6.8l18.4 18.4M6.8 25.2 25.2 6.8" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round"/><circle cx="16" cy="16" r="6.2" fill="currentColor"/></svg>
}

export function Logo({ className = '' }: { className?: string }) {
  return <Link href="/" className={`site-logo ${className}`} aria-label="Synthure home"><BrandMark /><span>synthure<span className="logo-period">.</span></span></Link>
}

export default function Nav() {
  return <header className="site-nav"><div className="site-nav-inner"><Logo /><nav aria-label="Main navigation"><Link className="site-button site-button-small" href="/dashboard">Open dashboard <ArrowUpRight size={18}/></Link></nav></div></header>
}

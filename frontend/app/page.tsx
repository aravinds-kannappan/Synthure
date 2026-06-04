'use client'
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { getPortalHome } from '@/lib/portal'
import type { PortalRole } from '@/lib/types'

export default function Home() {
  const router = useRouter()

  useEffect(() => {
    const raw = localStorage.getItem('synthure_user')
    if (!raw) {
      router.replace('/login')
      return
    }
    try {
      const user = JSON.parse(raw)
      router.replace(getPortalHome(user.role as PortalRole))
    } catch {
      router.replace('/login')
    }
  }, [router])

  return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="text-teal-400 text-xl animate-pulse">◈ Synthure</div>
    </div>
  )
}

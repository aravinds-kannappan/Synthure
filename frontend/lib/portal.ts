'use client'
import type { PortalRole } from './types'

export const PORTAL_HOME: Record<PortalRole, string> = {
  patient:        '/patient/dashboard',
  physician:      '/physician/dashboard',
  hospital_admin: '/hospital/dashboard',
  employer_admin: '/employer/dashboard',
  provider:       '/physician/dashboard',
}

export function getPortalHome(role: PortalRole): string {
  return PORTAL_HOME[role] ?? '/'
}

export const PORTAL_ACCENT: Record<PortalRole, string> = {
  patient:        'teal',
  physician:      'indigo',
  hospital_admin: 'teal',
  employer_admin: 'violet',
  provider:       'indigo',
}

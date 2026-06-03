'use client'
import { useState } from 'react'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { AIChip } from '@/components/shared/AIChip'
import type { Claim, ClaimStatus } from '@/lib/types'

const COLUMNS: { status: ClaimStatus; label: string }[] = [
  { status: 'draft',        label: 'Draft' },
  { status: 'submitted',    label: 'Submitted' },
  { status: 'adjudicated',  label: 'Adjudicated' },
  { status: 'paid',         label: 'Paid' },
  { status: 'denied',       label: 'Denied' },
]

const DEMO_CLAIMS: Claim[] = [
  { id: 'clm-001', patient_id: 'p-1', org_id: 'demo', status: 'draft',
    procedure_code: '99215', diagnosis_codes: ['I10', 'E11.9'], amount: 350,
    complexity_score: 45, route: 'standard', created_at: new Date().toISOString() },
  { id: 'clm-002', patient_id: 'p-2', org_id: 'demo', status: 'submitted',
    procedure_code: '93000', diagnosis_codes: ['I50.9'], amount: 1200,
    complexity_score: 72, route: 'frontier', denial_risk: 34, created_at: new Date().toISOString() },
  { id: 'clm-003', patient_id: 'p-3', org_id: 'demo', status: 'paid',
    procedure_code: '99213', diagnosis_codes: ['J06.9'], amount: 180,
    complexity_score: 12, route: 'standard', paid_amount: 145, created_at: new Date().toISOString() },
  { id: 'clm-004', patient_id: 'p-4', org_id: 'demo', status: 'denied',
    procedure_code: '27447', diagnosis_codes: ['M17.11'], amount: 28000,
    complexity_score: 88, route: 'frontier', denial_risk: 82, created_at: new Date().toISOString() },
]

export default function ClaimsPage() {
  const [claims] = useState<Claim[]>(DEMO_CLAIMS)

  const byStatus = (status: ClaimStatus) => claims.filter((c) => c.status === status)

  return (
    <div className="p-8">
      <div className="flex items-center gap-3 mb-6">
        <h1 className="text-2xl font-light text-slate-100">Claims</h1>
        <AIChip label="AI-adjudicated" size="md" />
      </div>

      {/* Kanban */}
      <div className="flex gap-4 overflow-x-auto pb-4">
        {COLUMNS.map(({ status, label }) => (
          <div key={status} className="flex-shrink-0 w-64">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-medium text-slate-400 uppercase tracking-wider">{label}</span>
              <span className="text-xs text-slate-600">{byStatus(status).length}</span>
            </div>
            <div className="space-y-2">
              {byStatus(status).map((claim) => (
                <div key={claim.id}
                  className="bg-[#0d1525] border border-slate-800 hover:border-slate-700 rounded-xl p-4 cursor-pointer transition-colors"
                >
                  <div className="flex items-start justify-between mb-2">
                    <code className="text-xs text-slate-500">{claim.procedure_code}</code>
                    <StatusBadge status={claim.status} />
                  </div>
                  <p className="text-sm font-medium text-slate-200">${claim.amount.toLocaleString()}</p>
                  <p className="text-xs text-slate-500 mt-1">{claim.diagnosis_codes.join(', ')}</p>
                  {claim.denial_risk !== undefined && (
                    <div className="mt-2 flex items-center gap-1">
                      <span className="text-[10px] text-slate-500">Denial risk:</span>
                      <span className={`text-[10px] font-medium ${
                        claim.denial_risk > 60 ? 'text-red-400' :
                        claim.denial_risk > 30 ? 'text-amber-400' : 'text-green-400'
                      }`}>{claim.denial_risk}%</span>
                      <AIChip />
                    </div>
                  )}
                  {claim.route === 'frontier' && (
                    <span className="mt-2 inline-block text-[10px] bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 px-1.5 py-0.5 rounded-full">
                      Frontier routing
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

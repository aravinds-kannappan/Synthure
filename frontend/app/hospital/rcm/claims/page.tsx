'use client'
import { useDemoEncounter } from '@/lib/demo-state'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { AIChip } from '@/components/shared/AIChip'
import { FileText, ChevronRight } from 'lucide-react'

const STAGES = ['draft', 'validated', 'submitted', 'acknowledged', 'adjudicated', 'paid']

function StateMachine({ current }: { current: string }) {
  const idx = STAGES.indexOf(current)
  return (
    <div className="flex items-center gap-1 flex-wrap">
      {STAGES.map((stage, i) => (
        <div key={stage} className="flex items-center gap-1">
          <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${
            i < idx  ? 'bg-teal-500/10 text-teal-400 border-teal-500/20' :
            i === idx ? 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30' :
            'bg-transparent text-slate-600 border-slate-800'
          }`}>{stage}</span>
          {i < STAGES.length - 1 && <ChevronRight className="w-3 h-3 text-slate-700" />}
        </div>
      ))}
    </div>
  )
}

export default function HospitalClaims() {
  const enc = useDemoEncounter()

  return (
    <div className="p-8 max-w-5xl">
      <div className="flex items-center gap-3 mb-8">
        <h1 className="text-2xl font-light text-slate-100">Claims</h1>
        {enc && <span className="ml-auto text-xs text-slate-500">1 claim</span>}
      </div>

      {!enc ? (
        <div className="bg-[#0d1525] border border-slate-800 rounded-xl p-12 text-center text-slate-600 text-sm">
          <FileText className="w-8 h-8 mx-auto mb-3 opacity-30" />
          <p>No claims yet. Run the Navigator in the Physician portal to stage a claim.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {/* State machine */}
          <div className="bg-[#0d1525] border border-slate-800 rounded-xl p-5">
            <p className="text-xs text-slate-500 uppercase tracking-wider mb-3">Claim state machine</p>
            <StateMachine current={enc.claimStatus} />
          </div>

          {/* Claim card */}
          <div className="bg-[#0d1525] border border-slate-800 rounded-xl overflow-hidden">
            <div className="grid grid-cols-7 px-5 py-3 border-b border-slate-800 text-xs text-slate-500 uppercase tracking-wider">
              <span className="col-span-2">Claim ID / Patient</span>
              <span>CPT</span>
              <span>ICD-10</span>
              <span>Amount</span>
              <span>Denial Risk</span>
              <span>Status</span>
            </div>
            <div className="grid grid-cols-7 px-5 py-4 items-center text-sm">
              <div className="col-span-2">
                <p className="text-xs text-slate-500 font-mono mb-0.5">{enc.claimId}</p>
                <p className="text-slate-200 font-medium">{enc.patientName}</p>
                <p className="text-xs text-slate-500">{enc.specialty}</p>
              </div>
              <span className="font-mono text-slate-300">{enc.cptCode}</span>
              <div className="flex flex-col gap-1">
                {enc.conditions.slice(0, 2).map((c, i) => (
                  <span key={i} className="text-xs font-mono text-slate-400 bg-slate-800 px-1.5 py-0.5 rounded w-fit">{c.icd10}</span>
                ))}
              </div>
              <span className="text-slate-200">${enc.claimAmount.toFixed(2)}</span>
              <div>
                <div className="flex items-center gap-2">
                  <div className="w-16 h-1.5 bg-slate-800 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full ${enc.denialProbability < 0.4 ? 'bg-teal-500' : enc.denialProbability < 0.65 ? 'bg-amber-500' : 'bg-red-500'}`}
                      style={{ width: `${Math.round(enc.denialProbability * 100)}%` }}
                    />
                  </div>
                  <span className={`text-xs ${enc.denialProbability < 0.4 ? 'text-teal-400' : 'text-amber-400'}`}>
                    {Math.round(enc.denialProbability * 100)}%
                  </span>
                </div>
                <span className="text-xs text-slate-600 mt-0.5 block">
                  {enc.denialProbability < 0.4 ? 'Low' : enc.denialProbability < 0.65 ? 'Moderate' : 'High'}
                </span>
              </div>
              <StatusBadge status={enc.claimStatus} />
            </div>
          </div>

          {/* AI adjudication */}
          <div className="bg-[#0d1525] border border-slate-800 rounded-xl p-6">
            <div className="flex items-center gap-2 mb-4">
              <h2 className="text-sm font-medium text-slate-300">AI Adjudication Analysis</h2>
              <AIChip />
            </div>
            <div className="grid grid-cols-2 gap-4 text-sm text-slate-300">
              <div>
                <p className="text-xs text-slate-500 mb-1">Routed to</p>
                <p className="font-medium">{enc.denialProbability < 0.5 ? 'Standard (Claude Haiku)' : 'Frontier (Claude Sonnet)'}</p>
                <p className="text-xs text-slate-600 mt-0.5">complexity score {Math.round(enc.denialProbability * 100)}/100</p>
              </div>
              <div>
                <p className="text-xs text-slate-500 mb-1">Prior auth</p>
                <p className="font-medium text-teal-400">{enc.priorAuthFiled ? 'Auto-filed by agent' : 'Not required'}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500 mb-1">Patient</p>
                <p className="font-medium">{enc.patientName}, {enc.patientAge}F</p>
              </div>
              <div>
                <p className="text-xs text-slate-500 mb-1">Submitted</p>
                <p className="font-medium">{new Date(enc.timestamp).toLocaleDateString()}</p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

'use client'
import { useDemoEncounter } from '@/lib/demo-state'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { AIChip } from '@/components/shared/AIChip'
import { FileText, ShieldCheck, TrendingUp } from 'lucide-react'

function Empty() {
  return (
    <div className="bg-[#0d1525] border border-slate-800 rounded-xl p-10 text-center text-slate-600 text-sm">
      <FileText className="w-8 h-8 mx-auto mb-3 opacity-30" />
      <p>No claims yet.</p>
      <p className="text-xs mt-1">Claims appear here after your physician runs the Navigator.</p>
    </div>
  )
}

export default function PatientClaims() {
  const enc = useDemoEncounter()

  return (
    <div className="p-8 max-w-3xl">
      <div className="flex items-center gap-3 mb-8">
        <h1 className="text-2xl font-light text-slate-100">My Claims</h1>
        <AIChip label="Plain-language" size="md" />
      </div>

      {!enc ? <Empty /> : (
        <div className="space-y-4">
          {/* Active claim */}
          <div className="bg-[#0d1525] border border-slate-800 rounded-xl p-6">
            <div className="flex items-start justify-between mb-4">
              <div>
                <p className="text-xs text-slate-500 font-mono mb-1">{enc.claimId}</p>
                <p className="text-base font-medium text-slate-100">{enc.specialty}</p>
                <p className="text-xs text-slate-500 mt-1">{new Date(enc.timestamp).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</p>
              </div>
              <StatusBadge status="submitted" />
            </div>

            <div className="grid grid-cols-3 gap-3 mb-4">
              {[
                { label: 'Procedure code', value: enc.cptCode },
                { label: 'Amount billed', value: `$${enc.claimAmount.toFixed(2)}` },
                { label: 'Denial risk', value: `${Math.round(enc.denialProbability * 100)}%` },
              ].map((f) => (
                <div key={f.label} className="bg-[#0a1020] rounded-lg p-3 border border-slate-800">
                  <p className="text-xs text-slate-500 mb-1">{f.label}</p>
                  <p className="text-sm font-medium text-slate-200">{f.value}</p>
                </div>
              ))}
            </div>

            <div className="border-t border-slate-800 pt-4">
              <p className="text-xs text-slate-500 mb-2">Diagnoses</p>
              <div className="flex flex-wrap gap-2">
                {enc.conditions.map((c, i) => (
                  <span key={i} className="text-xs bg-teal-500/10 text-teal-300 border border-teal-500/20 px-2 py-1 rounded-lg font-mono">{c.icd10}</span>
                ))}
              </div>
            </div>
          </div>

          {/* What this means in plain English */}
          <div className="bg-[#0d1525] border border-slate-800 rounded-xl p-6">
            <div className="flex items-center gap-2 mb-4">
              <ShieldCheck className="w-4 h-4 text-teal-400" />
              <h2 className="text-sm font-medium text-slate-300">What this means for you</h2>
              <AIChip />
            </div>
            <div className="space-y-3 text-sm text-slate-300 leading-relaxed">
              <p>Your insurance company received a claim for your recent visit. Here's what to expect:</p>
              <ul className="space-y-2 text-sm">
                {[
                  'You\'ll receive an Explanation of Benefits (EOB) in the mail within 2–4 weeks.',
                  `Your estimated out-of-pocket share is based on your deductible and copay.`,
                  enc.denialProbability < 0.5 ? 'This claim has a low denial risk and is likely to be approved without issues.' : 'This claim has a moderate denial risk — Synthure has filed supporting documentation proactively.',
                ].map((point, i) => (
                  <li key={i} className="flex gap-2">
                    <span className="text-teal-400 mt-1 flex-shrink-0">•</span>
                    <span>{point}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* Denial risk meter */}
          <div className="bg-[#0d1525] border border-slate-800 rounded-xl p-5">
            <div className="flex items-center gap-2 mb-3">
              <TrendingUp className="w-4 h-4 text-slate-400" />
              <h2 className="text-xs font-medium text-slate-500 uppercase tracking-wider">Denial risk prediction</h2>
              <AIChip />
            </div>
            <div className="flex items-center gap-4">
              <div className="flex-1 h-2 bg-slate-800 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full ${enc.denialProbability < 0.4 ? 'bg-teal-500' : enc.denialProbability < 0.65 ? 'bg-amber-500' : 'bg-red-500'}`}
                  style={{ width: `${Math.round(enc.denialProbability * 100)}%` }}
                />
              </div>
              <span className={`text-sm font-bold ${enc.denialProbability < 0.4 ? 'text-teal-400' : enc.denialProbability < 0.65 ? 'text-amber-400' : 'text-red-400'}`}>
                {Math.round(enc.denialProbability * 100)}%
              </span>
              <span className="text-xs text-slate-500">
                {enc.denialProbability < 0.4 ? 'Low risk' : enc.denialProbability < 0.65 ? 'Moderate risk' : 'High risk'}
              </span>
            </div>
            <p className="text-xs text-slate-600 mt-2">Predicted by GradientBoosting model trained on 38,924 clinical transcriptions</p>
          </div>
        </div>
      )}
    </div>
  )
}

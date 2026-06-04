'use client'
import { AIChip } from '@/components/shared/AIChip'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { useDemoEncounter } from '@/lib/demo-state'
import { Heart, Pill, FileText, Clock, CheckCircle, AlertCircle } from 'lucide-react'

function Empty() {
  return (
    <div className="text-center py-16 text-slate-600 text-sm">
      <p className="mb-2">No data yet.</p>
      <p className="text-xs">Ask your physician to run the Navigator with your clinical note — your dashboard will update automatically.</p>
    </div>
  )
}

export default function PatientDashboard() {
  const enc = useDemoEncounter()

  return (
    <div className="p-8 max-w-4xl">
      {/* Header */}
      <div className="flex items-center gap-3 mb-8">
        <h1 className="text-2xl font-light text-slate-100">My Health Summary</h1>
        <AIChip label="AI-powered" size="md" />
        {enc && (
          <span className="text-xs text-slate-500 ml-auto">
            Updated {new Date(enc.timestamp).toLocaleString()}
          </span>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4 mb-8">
        {[
          { label: 'Active Conditions', value: enc ? enc.conditions.length : '—', icon: Heart, color: 'teal' },
          { label: 'Active Medications', value: enc ? enc.medications.length : '—', icon: Pill, color: 'indigo' },
          { label: 'Open Claims', value: enc ? '1' : '—', icon: FileText, color: 'amber' },
        ].map((card) => (
          <div key={card.label} className="bg-[#0d1525] border border-slate-800 rounded-xl p-5">
            <div className="flex items-center gap-2 mb-3">
              <card.icon className={`w-4 h-4 text-${card.color}-400`} />
              <p className="text-xs text-slate-500">{card.label}</p>
            </div>
            <p className="text-3xl font-light text-slate-100">{card.value}</p>
          </div>
        ))}
      </div>

      {/* Patient info */}
      {enc && (
        <div className="bg-[#0d1525] border border-slate-800 rounded-xl p-5 mb-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-base font-medium text-slate-100">{enc.patientName}</p>
              <p className="text-xs text-slate-500 mt-0.5">Age {enc.patientAge} · DOB {enc.patientDOB} · {enc.specialty}</p>
            </div>
            <StatusBadge status="active" />
          </div>
        </div>
      )}

      {/* Conditions */}
      <div className="bg-[#0d1525] border border-slate-800 rounded-xl p-6 mb-6">
        <div className="flex items-center gap-2 mb-5">
          <Heart className="w-4 h-4 text-teal-400" />
          <h2 className="text-sm font-medium text-slate-300">My Conditions</h2>
          <AIChip />
        </div>
        {enc?.conditions.length ? (
          <div className="space-y-4">
            {enc.conditions.map((c, i) => (
              <div key={i} className="border-l-2 border-teal-500/40 pl-4">
                <div className="flex items-center gap-2 mb-1">
                  <p className="text-xs text-teal-400 font-mono">{c.term}</p>
                  {c.icd10 && <span className="text-xs bg-teal-500/10 text-teal-400 border border-teal-500/20 px-1.5 py-0.5 rounded font-mono">{c.icd10}</span>}
                </div>
                <p className="text-sm text-slate-300 leading-relaxed">{c.plain}</p>
              </div>
            ))}
          </div>
        ) : <Empty />}
      </div>

      {/* Medications */}
      <div className="bg-[#0d1525] border border-slate-800 rounded-xl p-6 mb-6">
        <div className="flex items-center gap-2 mb-5">
          <Pill className="w-4 h-4 text-indigo-400" />
          <h2 className="text-sm font-medium text-slate-300">My Medications</h2>
          <AIChip />
        </div>
        {enc?.medications.length ? (
          <div className="space-y-3">
            {enc.medications.map((m, i) => (
              <div key={i} className="bg-[#0a1020] rounded-lg p-4 border border-slate-800">
                <p className="text-sm font-medium text-indigo-300 mb-1">{m.name}</p>
                <p className="text-xs text-slate-400 mb-1">{m.purpose}</p>
                <p className="text-xs text-slate-500 italic">{m.instructions}</p>
              </div>
            ))}
          </div>
        ) : <Empty />}
      </div>

      {/* Journey timeline */}
      <div className="bg-[#0d1525] border border-slate-800 rounded-xl p-6">
        <div className="flex items-center gap-2 mb-5">
          <Clock className="w-4 h-4 text-slate-400" />
          <h2 className="text-sm font-medium text-slate-300">My Health Journey</h2>
        </div>
        {enc ? (
          <div className="space-y-4">
            {[
              { icon: CheckCircle, color: 'teal', title: 'Physician visit completed', sub: enc.specialty, time: enc.timestamp, ai: true },
              { icon: CheckCircle, color: 'teal', title: 'Patient education sent via SMS', sub: 'Condition guides from MedlinePlus + DailyMed', time: enc.timestamp, ai: true },
              { icon: CheckCircle, color: 'indigo', title: 'Claim staged for submission', sub: `CPT ${enc.cptCode} · $${enc.claimAmount.toFixed(2)}`, time: enc.timestamp, ai: true },
              { icon: enc.priorAuthFiled ? CheckCircle : AlertCircle, color: enc.priorAuthFiled ? 'teal' : 'amber', title: enc.priorAuthFiled ? 'Prior auth filed' : 'Prior auth pending', sub: 'Auto-filed by Synthure agent', time: enc.timestamp, ai: true },
              { icon: CheckCircle, color: 'violet', title: 'Follow-up reminder scheduled', sub: enc.followup.slice(0, 60) + '…', time: enc.timestamp, ai: false },
            ].map((evt, i) => (
              <div key={i} className="flex gap-3">
                <div className={`mt-0.5 w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 bg-${evt.color}-500/10`}>
                  <evt.icon className={`w-3 h-3 text-${evt.color}-400`} />
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <p className="text-sm text-slate-200">{evt.title}</p>
                    {evt.ai && <AIChip />}
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">{evt.sub}</p>
                  <p className="text-xs text-slate-700 mt-0.5">{new Date(evt.time).toLocaleTimeString()}</p>
                </div>
              </div>
            ))}
          </div>
        ) : <Empty />}
      </div>
    </div>
  )
}

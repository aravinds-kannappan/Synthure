export default function EmployerDashboard() {
  return (
    <div className="p-8 max-w-5xl">
      <h1 className="text-2xl font-light text-slate-100 mb-2">Benefits Overview</h1>
      <p className="text-slate-400 text-sm mb-8">Workforce health data analyzed. Optimizations surfaced automatically.</p>

      <div className="grid grid-cols-4 gap-4 mb-8">
        {[
          { label: 'Enrolled Employees', value: '—' },
          { label: 'Monthly Cost / Employee', value: '—' },
          { label: 'Utilization Rate', value: '—' },
          { label: 'Open Enrollment', value: 'Closed' },
        ].map((m) => (
          <div key={m.label} className="bg-[#0d1525] border border-slate-800 rounded-xl p-5">
            <p className="text-xs text-slate-500 mb-1">{m.label}</p>
            <p className="text-3xl font-light text-slate-100">{m.value}</p>
          </div>
        ))}
      </div>

      <div className="bg-[#0d1525] border border-violet-500/20 rounded-xl p-6">
        <h2 className="text-sm font-medium text-violet-400 mb-3">✨ Benefits Optimizer</h2>
        <p className="text-slate-400 text-sm">AI-driven plan comparison with projected savings — Phase 9 (Employer Portal).</p>
      </div>
    </div>
  )
}

import { AlertTriangle, Clock } from 'lucide-react'
import { formatDistanceToNow, isPast, isWithinInterval, addDays } from 'date-fns'

export interface Deadline {
  id: string
  title: string
  due_date: string
  owner: string
  amount_at_stake?: number
  action_type?: string
  urgency: 'critical' | 'warning' | 'info'
}

export function DeadlineMonitor({ deadlines }: { deadlines: Deadline[] }) {
  if (deadlines.length === 0) return null

  return (
    <div className="space-y-2">
      {deadlines.map((d) => (
        <div
          key={d.id}
          className={`flex items-start gap-3 p-3 rounded-xl border ${
            d.urgency === 'critical'
              ? 'bg-error/5 border-error/20'
              : d.urgency === 'warning'
              ? 'bg-amber/5 border-amber/20'
              : 'bg-teal-500/5 border-teal-500/20'
          }`}
        >
          {d.urgency === 'critical' ? (
            <AlertTriangle className="w-4 h-4 text-red-400 mt-0.5 shrink-0" />
          ) : (
            <Clock className="w-4 h-4 text-amber-400 mt-0.5 shrink-0" />
          )}
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-slate-200">{d.title}</p>
            <p className="text-[11px] text-slate-500 mt-0.5">
              Due {formatDistanceToNow(new Date(d.due_date), { addSuffix: true })}
              {d.amount_at_stake && (
                <> &middot; <span className="text-amber-400">${d.amount_at_stake.toLocaleString()} at stake</span></>
              )}
            </p>
          </div>
        </div>
      ))}
    </div>
  )
}

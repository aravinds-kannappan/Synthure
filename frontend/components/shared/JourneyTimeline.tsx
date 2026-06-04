import { AIChip } from './AIChip'
import { StatusBadge } from './StatusBadge'
import type { CareEvent } from '@/lib/types'
import { formatDistanceToNow } from 'date-fns'

interface Props {
  events: CareEvent[]
}

export function JourneyTimeline({ events }: Props) {
  if (events.length === 0) {
    return <p className="text-sm text-slate-500 py-4">No events yet.</p>
  }

  return (
    <ol className="relative border-l border-slate-800 space-y-6 pl-6">
      {events.map((ev) => (
        <li key={ev.id} className="relative">
          <span className="absolute -left-[25px] top-1 w-3 h-3 rounded-full border-2 border-[#0d1525] bg-teal-400" />
          <div className="flex items-start gap-2 flex-wrap">
            <span className="text-sm font-medium text-slate-200">{ev.title}</span>
            {ev.ai_generated && <AIChip />}
            {ev.tier === '1' && (
              <span className="text-[10px] bg-teal-500/10 text-teal-400 border border-teal-500/20 px-1.5 py-0.5 rounded-full">
                Auto
              </span>
            )}
          </div>
          {ev.detail && <p className="text-xs text-slate-400 mt-0.5">{ev.detail}</p>}
          <p className="text-[11px] text-slate-600 mt-1">
            {formatDistanceToNow(new Date(ev.created_at), { addSuffix: true })}
            {ev.actor && <> &middot; {ev.actor}</>}
          </p>
        </li>
      ))}
    </ol>
  )
}

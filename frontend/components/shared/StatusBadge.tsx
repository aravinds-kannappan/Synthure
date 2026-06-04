import { clsx } from 'clsx'

type Status =
  | 'approved' | 'paid' | 'active'
  | 'pending' | 'submitted' | 'draft'
  | 'denied' | 'error'
  | 'appealed' | 'info'

const STYLE: Record<Status, string> = {
  approved:  'bg-success/10 text-success border-success/30',
  paid:      'bg-success/10 text-success border-success/30',
  active:    'bg-success/10 text-success border-success/30',
  pending:   'bg-amber/10 text-amber border-amber/30',
  submitted: 'bg-amber/10 text-amber border-amber/30',
  draft:     'bg-slate-500/10 text-slate-400 border-slate-500/30',
  denied:    'bg-error/10 text-error border-error/30',
  error:     'bg-error/10 text-error border-error/30',
  appealed:  'bg-indigo/10 text-indigo border-indigo/30',
  info:      'bg-teal/10 text-teal border-teal/30',
}

export function StatusBadge({ status }: { status: string }) {
  const style = STYLE[status as Status] ?? STYLE.info
  return (
    <span className={clsx('inline-flex items-center px-2 py-0.5 text-[11px] font-medium rounded-full border', style)}>
      {status.replace('_', ' ')}
    </span>
  )
}

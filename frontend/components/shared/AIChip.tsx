import { Sparkles } from 'lucide-react'

interface Props {
  label?: string
  size?: 'sm' | 'md'
}

export function AIChip({ label = 'AI', size = 'sm' }: Props) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border border-indigo-500/30
        bg-indigo-500/10 text-indigo-300 font-medium
        ${size === 'sm' ? 'px-2 py-0.5 text-[10px]' : 'px-3 py-1 text-xs'}`}
    >
      <Sparkles className={size === 'sm' ? 'w-2.5 h-2.5' : 'w-3.5 h-3.5'} />
      {label}
    </span>
  )
}

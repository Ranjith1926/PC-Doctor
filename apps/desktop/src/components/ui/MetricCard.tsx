import type { ReactNode } from 'react'
import type { Tone } from './StatusBadge'
import { cn } from '@/utils/format'
import { GlassCard } from './GlassCard'

const bar: Record<Tone, string> = {
  success: 'bg-success',
  warning: 'bg-warning',
  danger: 'bg-danger',
  info: 'bg-primary',
  neutral: 'bg-primary'
}

interface MetricCardProps {
  icon: ReactNode
  label: string
  value: string
  sub?: string
  /** 0-100. When set, a progress bar is drawn and announced to assistive technology. */
  percent?: number
  tone?: Tone
  children?: ReactNode
}

export function MetricCard({ icon, label, value, sub, percent, tone = 'info', children }: MetricCardProps) {
  return (
    <GlassCard className="flex flex-col gap-3 p-4">
      <div className="flex items-center gap-2 text-[13px] font-medium text-muted">
        <span className="grid size-7 place-items-center rounded-lg bg-primary/12 text-primary" aria-hidden>
          {icon}
        </span>
        {label}
      </div>
      <div className="num text-[28px] font-semibold leading-none text-fg">{value}</div>
      {percent !== undefined && (
        <div
          role="progressbar"
          aria-label={label}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(percent)}
          className="h-1.5 overflow-hidden rounded-full bg-line"
        >
          <div className={cn('h-full rounded-full transition-[width] duration-500 ease-out', bar[tone])} style={{ width: `${Math.max(2, Math.min(100, percent))}%` }} />
        </div>
      )}
      {sub && <div className="text-xs text-subtle">{sub}</div>}
      {children}
    </GlassCard>
  )
}

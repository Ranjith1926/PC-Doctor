import { AlertOctagon, AlertTriangle, CheckCircle2, Info, Minus } from 'lucide-react'
import type { ReactNode } from 'react'
import type { Severity } from '@shared/contracts'
import { cn } from '@/utils/format'

export type Tone = 'success' | 'warning' | 'danger' | 'info' | 'neutral'

const tones: Record<Tone, { cls: string; icon: ReactNode }> = {
  success: { cls: 'bg-success/15 text-success', icon: <CheckCircle2 className="size-3.5" aria-hidden /> },
  warning: { cls: 'bg-warning/15 text-warning', icon: <AlertTriangle className="size-3.5" aria-hidden /> },
  danger: { cls: 'bg-danger/15 text-danger', icon: <AlertOctagon className="size-3.5" aria-hidden /> },
  info: { cls: 'bg-primary/15 text-primary', icon: <Info className="size-3.5" aria-hidden /> },
  neutral: { cls: 'bg-line text-muted', icon: <Minus className="size-3.5" aria-hidden /> }
}

/** Always an icon plus a text label, so status is never conveyed by colour alone. */
export function StatusBadge({ tone = 'neutral', children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium', tones[tone].cls, className)}>
      {tones[tone].icon}
      {children}
    </span>
  )
}

export const severityTone: Record<Severity, Tone> = { ok: 'success', info: 'info', warning: 'warning', critical: 'danger' }
export const severityLabel: Record<Severity, string> = { ok: 'Good', info: 'Fine', warning: 'Needs a look', critical: 'Needs attention' }

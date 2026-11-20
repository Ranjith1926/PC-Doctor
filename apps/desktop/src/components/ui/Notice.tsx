import { AlertTriangle, Info, ShieldAlert } from 'lucide-react'
import type { ReactNode } from 'react'
import { cn } from '@/utils/format'

const styles = {
  info: { cls: 'border-primary/30 bg-primary/10', icon: <Info className="size-4 text-primary" aria-hidden /> },
  warning: { cls: 'border-warning/35 bg-warning/10', icon: <AlertTriangle className="size-4 text-warning" aria-hidden /> },
  danger: { cls: 'border-danger/35 bg-danger/10', icon: <ShieldAlert className="size-4 text-danger" aria-hidden /> }
}

export function Notice({ tone = 'info', title, children, className }: { tone?: keyof typeof styles; title?: string; children: ReactNode; className?: string }) {
  return (
    <div role={tone === 'info' ? 'note' : 'alert'} className={cn('flex gap-3 rounded-control border px-4 py-3 text-sm', styles[tone].cls, className)}>
      <span className="mt-0.5 shrink-0">{styles[tone].icon}</span>
      <div className="min-w-0 text-muted">
        {title && <div className="font-semibold text-fg">{title}</div>}
        {children}
      </div>
    </div>
  )
}

import type { HTMLAttributes } from 'react'
import { cn } from '@/utils/format'

interface GlassCardProps extends HTMLAttributes<HTMLDivElement> {
  /** Stronger blur and border for floating layers such as dialogs and menus. */
  strong?: boolean
  /** Adds the hover elevation. Only use it for cards that are actually clickable. */
  interactive?: boolean
}

export function GlassCard({ strong, interactive, className, children, ...props }: GlassCardProps) {
  return (
    <div
      className={cn('rounded-card p-5', strong ? 'glass-strong' : 'glass', interactive && 'glass-interactive cursor-pointer', className)}
      {...props}
    >
      {children}
    </div>
  )
}

export function CardTitle({ title, hint, action }: { title: string; hint?: string; action?: React.ReactNode }) {
  return (
    <div className="mb-4 flex items-start justify-between gap-3">
      <div className="min-w-0">
        <h2 className="text-[15px] font-semibold text-fg">{title}</h2>
        {hint && <p className="mt-0.5 text-[13px] text-muted">{hint}</p>}
      </div>
      {action}
    </div>
  )
}

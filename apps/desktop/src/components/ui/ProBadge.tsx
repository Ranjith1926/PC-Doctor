import { Crown } from 'lucide-react'
import { useLicense } from '@/hooks/useEngine'
import { cn } from '@/utils/format'

interface ProBadgeProps {
  /** "full" suits page titles and card headers; "compact" suits the sidebar and feature lists. */
  size?: 'full' | 'compact'
  /**
   * By default the badge marks a feature as "Pro" and disappears once Pro is active, because it
   * would only tell a Pro user something they already know. Set this for the badge that reports
   * the active edition itself.
   */
  alwaysShow?: boolean
  className?: string
}

/** Marks a feature that belongs to the Pro edition. Text plus icon, never colour alone. */
export function ProBadge({ size = 'full', alwaysShow = false, className }: ProBadgeProps) {
  const isPro = useLicense().data?.edition === 'pro'
  if (isPro && !alwaysShow) return null
  const compact = size === 'compact'
  return (
    <span
      title="Pro feature"
      className={cn(
        'inline-flex shrink-0 items-center gap-1 rounded-full bg-warning/15 font-semibold uppercase tracking-wide text-warning',
        compact ? 'px-1.5 py-px text-[9px]' : 'px-2.5 py-0.5 text-xs',
        className
      )}
    >
      <Crown className={compact ? 'size-2.5' : 'size-3'} aria-hidden />
      Pro
      <span className="sr-only"> feature</span>
    </span>
  )
}

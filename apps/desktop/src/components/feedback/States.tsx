import { AlertCircle, Inbox, PlugZap } from 'lucide-react'
import { Component, type ErrorInfo, type ReactNode } from 'react'
import { EngineError, isUnavailable } from '@/services/engineClient'
import { cn } from '@/utils/format'
import { Button } from '../ui/Button'
import { GlassCard } from '../ui/GlassCard'

export function EmptyState({ icon, title, description, action, className }: { icon?: ReactNode; title: string; description?: string; action?: ReactNode; className?: string }) {
  return (
    <div className={cn('grid place-items-center px-6 py-10 text-center', className)}>
      <span className="mb-3 grid size-12 place-items-center rounded-2xl bg-primary/12 text-primary" aria-hidden>
        {icon ?? <Inbox className="size-6" />}
      </span>
      <h3 className="text-base font-semibold text-fg">{title}</h3>
      {description && <p className="mt-1 max-w-md text-sm text-muted">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}

/** Honest failure state. "Not available yet" reads differently from "something broke". */
export function ErrorState({ error, onRetry, className }: { error: unknown; onRetry?: () => void; className?: string }) {
  const unavailable = isUnavailable(error)
  const message = error instanceof EngineError || error instanceof Error ? error.message : 'Something went wrong.'
  return (
    <div className={cn('grid place-items-center px-6 py-10 text-center', className)} role="alert">
      <span className={cn('mb-3 grid size-12 place-items-center rounded-2xl', unavailable ? 'bg-warning/15 text-warning' : 'bg-danger/15 text-danger')} aria-hidden>
        {unavailable ? <PlugZap className="size-6" /> : <AlertCircle className="size-6" />}
      </span>
      <h3 className="text-base font-semibold text-fg">{unavailable ? 'Not available yet' : 'This did not work'}</h3>
      <p className="mt-1 max-w-md text-sm text-muted">{message}</p>
      {onRetry && !unavailable && (
        <Button className="mt-4" onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  )
}

export function LoadingSkeleton({ rows = 4, className }: { rows?: number; className?: string }) {
  return (
    <div className={cn('space-y-3', className)} role="status" aria-label="Loading">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="skeleton h-10" style={{ width: `${100 - (i % 3) * 12}%` }} />
      ))}
    </div>
  )
}

export function CardSkeleton({ className }: { className?: string }) {
  return (
    <GlassCard className={cn('space-y-3', className)} role="status" aria-label="Loading">
      <div className="skeleton h-4 w-1/3" />
      <div className="skeleton h-8 w-1/2" />
      <div className="skeleton h-2 w-full" />
    </GlassCard>
  )
}

export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null }
  static getDerivedStateFromError(error: Error) {
    return { error }
  }
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Render error', error, info.componentStack)
  }
  render() {
    if (!this.state.error) return this.props.children
    return (
      <GlassCard className="m-6">
        <ErrorState error={this.state.error} />
        <div className="flex justify-center">
          <Button variant="primary" onClick={() => this.setState({ error: null })}>
            Reload this page
          </Button>
        </div>
      </GlassCard>
    )
  }
}

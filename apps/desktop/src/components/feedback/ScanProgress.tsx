import { Check, Loader2 } from 'lucide-react'
import { SCAN_STEPS } from '@shared/constants'
import type { ScanProgress as Progress } from '@shared/contracts'
import { cn } from '@/utils/format'
import { Button } from '../ui/Button'

interface ScanProgressProps {
  progress: Progress | null
  onCancel: () => void
  cancelling?: boolean
}

export function ScanProgress({ progress, onCancel, cancelling }: ScanProgressProps) {
  const step = progress?.step ?? 1
  const total = progress?.totalSteps ?? SCAN_STEPS.length
  const percent = Math.round(((step - 1) / total) * 100)

  return (
    <div className="mx-auto w-full max-w-xl py-4">
      <div className="mb-1 flex items-baseline justify-between text-sm">
        <span className="font-medium text-fg" aria-live="polite">
          {progress?.label ?? 'Starting scan'}…
        </span>
        <span className="num text-muted">
          Step {step} of {total}
        </span>
      </div>
      <div role="progressbar" aria-label="Scan progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent} className="h-2 overflow-hidden rounded-full bg-line">
        <div className="h-full rounded-full bg-gradient-to-r from-primary to-accent transition-[width] duration-500 ease-out" style={{ width: `${Math.max(6, percent)}%` }} />
      </div>
      <ol className="mt-5 space-y-2.5">
        {SCAN_STEPS.map((label, i) => {
          const n = i + 1
          const done = n < step
          const active = n === step
          return (
            <li key={label} className={cn('flex items-center gap-3 text-sm', done ? 'text-muted' : active ? 'text-fg' : 'text-subtle')}>
              <span className={cn('grid size-6 place-items-center rounded-full border', done ? 'border-success bg-success/15 text-success' : active ? 'border-primary text-primary' : 'border-line')}>
                {done ? <Check className="size-3.5" aria-hidden /> : active ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : <span className="num text-[11px]">{n}</span>}
              </span>
              {label}
              <span className="sr-only">{done ? ' done' : active ? ' in progress' : ' waiting'}</span>
            </li>
          )
        })}
      </ol>
      <div className="mt-6 flex justify-center">
        <Button variant="ghost" onClick={onCancel} loading={cancelling}>
          Cancel scan
        </Button>
      </div>
    </div>
  )
}

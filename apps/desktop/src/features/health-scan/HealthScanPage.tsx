import { Activity, CheckCircle2, ChevronDown, RotateCcw, XCircle } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { HealthScoreRing } from '@/components/charts/HealthScoreRing'
import { EmptyState, ErrorState } from '@/components/feedback/States'
import { RecommendationCard } from '@/components/feedback/RecommendationCard'
import { ScanProgress } from '@/components/feedback/ScanProgress'
import { Button } from '@/components/ui/Button'
import { CardTitle, GlassCard } from '@/components/ui/GlassCard'
import { PageHeader } from '@/components/ui/PageHeader'
import { StatusBadge, severityLabel, severityTone } from '@/components/ui/StatusBadge'
import { useScan } from '@/stores/scanStore'
import { useSettings } from '@/stores/settingsStore'
import { cn, formatBytes, formatDateTime } from '@/utils/format'

export default function HealthScanPage() {
  const location = useLocation()
  const navigate = useNavigate()
  const { status, progress, error, cancelling, start, cancel } = useScan()
  const lastScan = useSettings((s) => s.lastScan)
  const [open, setOpen] = useState<string | null>(null)
  const autoStarted = useRef(false)

  // "Quick Scan" buttons elsewhere navigate here with autoStart.
  useEffect(() => {
    const wantsAuto = (location.state as { autoStart?: boolean } | null)?.autoStart
    if (wantsAuto && !autoStarted.current) {
      autoStarted.current = true
      void start()
      navigate(location.pathname, { replace: true, state: null })
    }
  }, [location, navigate, start])

  const startButton = (label: string) => (
    <Button variant="primary" icon={<Activity className="size-4" aria-hidden />} onClick={() => void start()}>
      {label}
    </Button>
  )

  return (
    <div>
      <PageHeader
        title="Health Scan"
        subtitle="Measures memory, storage, CPU, startup load and junk files, then explains every result. A scan never changes anything on your PC."
        actions={status !== 'scanning' && lastScan ? startButton('Scan again') : undefined}
      />

      {status === 'scanning' && (
        <GlassCard strong className="p-8">
          <ScanProgress progress={progress} onCancel={() => void cancel()} cancelling={cancelling} />
        </GlassCard>
      )}

      {status === 'failed' && (
        <GlassCard>
          <ErrorState error={error} onRetry={() => void start()} />
        </GlassCard>
      )}

      {status === 'cancelled' && (
        <GlassCard>
          <EmptyState icon={<XCircle className="size-6" />} title="Scan cancelled" description="Nothing was changed on your PC." action={startButton('Start again')} />
        </GlassCard>
      )}

      {status !== 'scanning' && status !== 'failed' && status !== 'cancelled' && !lastScan && (
        <GlassCard strong>
          <EmptyState icon={<Activity className="size-6" />} title="Ready when you are" description="The scan takes about 15 seconds. Close heavy apps first for the most accurate reading." action={startButton('Start health scan')} className="py-14" />
        </GlassCard>
      )}

      {status !== 'scanning' && lastScan && (
        <div className="grid gap-4">
          <GlassCard strong className="grid items-center gap-6 p-6 md:grid-cols-[auto_1fr]">
            <HealthScoreRing score={lastScan.score} caption="/ 100" size={200} />
            <div>
              <div className="flex items-center gap-2 text-success">
                <CheckCircle2 className="size-5" aria-hidden />
                <h2 className="text-lg font-semibold text-fg">Scan summary</h2>
              </div>
              <p className="mt-1 text-sm text-muted">
                Completed {formatDateTime(lastScan.finishedAt)} in {Math.round((lastScan.finishedAt - lastScan.startedAt) / 1000)} seconds. {lastScan.recommendations.length === 0 ? 'Nothing needs attention.' : `${lastScan.recommendations.length} thing${lastScan.recommendations.length === 1 ? '' : 's'} worth a look.`}
              </p>
              <dl className="mt-4 grid gap-4 sm:grid-cols-3">
                <div>
                  <dt className="text-xs text-subtle">Estimated recoverable</dt>
                  <dd className="num mt-0.5 text-sm font-medium text-fg">{formatBytes(lastScan.recoverableBytes)}</dd>
                </div>
                <div>
                  <dt className="text-xs text-subtle">Categories checked</dt>
                  <dd className="num mt-0.5 text-sm font-medium text-fg">{lastScan.categories.length}</dd>
                </div>
                <div>
                  <dt className="text-xs text-subtle">Needing attention</dt>
                  <dd className="num mt-0.5 text-sm font-medium text-fg">{lastScan.categories.filter((c) => c.severity === 'warning' || c.severity === 'critical').length}</dd>
                </div>
              </dl>
            </div>
          </GlassCard>

          <GlassCard>
            <CardTitle title="Detailed results" hint="Select a row to see exactly how it was scored" />
            <ul className="divide-y divide-line">
              {lastScan.categories.map((c) => {
                const expanded = open === c.id
                return (
                  <li key={c.id}>
                    <button
                      type="button"
                      aria-expanded={expanded}
                      onClick={() => setOpen(expanded ? null : c.id)}
                      className="flex w-full cursor-pointer flex-wrap items-center gap-x-4 gap-y-1 rounded-lg px-2 py-3 text-left hover:bg-line/40"
                    >
                      <span className="w-40 shrink-0 text-sm font-medium text-fg">{c.label}</span>
                      <span className="num min-w-0 flex-1 text-sm text-muted">{c.valueText}</span>
                      <StatusBadge tone={severityTone[c.severity]}>{severityLabel[c.severity]}</StatusBadge>
                      <span className="num w-16 text-right text-sm text-fg">{c.points}/{c.maxPoints}</span>
                      <ChevronDown className={cn('size-4 text-subtle transition-transform', expanded && 'rotate-180')} aria-hidden />
                    </button>
                    {expanded && (
                      <div className="mb-2 ml-2 rounded-control bg-line/40 px-4 py-3 text-[13px] text-muted">
                        <p>{c.evidence}</p>
                        {c.recommendation && <p className="mt-2 text-fg">{c.recommendation}</p>}
                      </div>
                    )}
                  </li>
                )
              })}
            </ul>
          </GlassCard>

          <div className="grid gap-3">
            <h2 className="px-1 text-[15px] font-semibold text-fg">Identified issues and recommendations</h2>
            {lastScan.recommendations.length === 0 ? (
              <GlassCard>
                <EmptyState title="No issues found" description="Run this check again every couple of weeks." className="py-8" />
              </GlassCard>
            ) : (
              <div className="grid gap-3 lg:grid-cols-2">
                {lastScan.recommendations.map((r) => (
                  <RecommendationCard key={r.id} rec={r} />
                ))}
              </div>
            )}
          </div>

          <div className="flex justify-end">
            <Button variant="ghost" icon={<RotateCcw className="size-4" aria-hidden />} onClick={() => void start()}>
              Scan again
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

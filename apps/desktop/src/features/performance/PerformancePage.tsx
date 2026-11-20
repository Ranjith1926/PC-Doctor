import { ArrowDown, ArrowUp, Gauge, Minus, Zap } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { CardSkeleton, EmptyState, ErrorState } from '@/components/feedback/States'
import { RecommendationCard } from '@/components/feedback/RecommendationCard'
import { Button } from '@/components/ui/Button'
import { ProBadge } from '@/components/ui/ProBadge'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { CardTitle, GlassCard } from '@/components/ui/GlassCard'
import { Notice } from '@/components/ui/Notice'
import { PageHeader } from '@/components/ui/PageHeader'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { useHealthHistory, useTopProcesses } from '@/hooks/useEngine'
import { useSettings } from '@/stores/settingsStore'
import { useUi } from '@/stores/uiStore'
import type { HealthSnapshot, ProcessUsage } from '@shared/contracts'
import { cn, formatBytes, formatDateTime } from '@/utils/format'

const PROFILES = [
  { name: 'Balanced', blurb: 'Windows defaults. Good battery life and good speed.' },
  { name: 'Performance', blurb: 'Best performance power mode, fewer startup apps, background Store apps off.' },
  { name: 'Battery saver', blurb: 'Lower power use for travel. Slower under load.' }
]

export default function PerformancePage() {
  const navigate = useNavigate()
  const procs = useTopProcesses()
  const history = useHealthHistory()
  const lastScan = useSettings((s) => s.lastScan)
  const m = useUi((s) => s.metricsHistory.at(-1))

  const recs = (lastScan?.recommendations ?? []).filter((r) => r.action === 'performance' || r.action === 'startup' || r.action === 'restart')
  const [prev, latest] = (history.data ?? []).slice(-2)

  const columns: Column<ProcessUsage>[] = [
    { key: 'name', header: 'Process', sortValue: (p) => p.name.toLowerCase(), cell: (p) => <span className="text-sm font-medium text-fg">{p.name}</span> },
    { key: 'instances', header: 'Instances', align: 'right', sortValue: (p) => p.instances, cell: (p) => <span className="num text-sm text-muted">{p.instances}</span> },
    { key: 'mem', header: 'Memory', align: 'right', sortValue: (p) => p.memoryBytes, cell: (p) => <span className="num text-sm text-fg">{formatBytes(p.memoryBytes)}</span> }
  ]

  return (
    <div>
      <PageHeader title="Performance" subtitle="See what is using your resources and what is worth changing. Improvements are only claimed when two real scans show them." />

      <div className="grid gap-4">
        <div className="grid gap-4 md:grid-cols-3">
          {m ? (
            <>
              <GlassCard><div className="text-xs text-subtle">CPU load now</div><div className="num mt-1 text-3xl font-semibold text-fg">{m.cpuPct}%</div></GlassCard>
              <GlassCard><div className="text-xs text-subtle">Memory in use</div><div className="num mt-1 text-3xl font-semibold text-fg">{m.ramUsedPct}%</div><div className="mt-1 text-xs text-subtle">{formatBytes(m.ramUsedBytes)} of {formatBytes(m.ramTotalBytes, 0)}</div></GlassCard>
              <GlassCard><div className="text-xs text-subtle">Latest score</div><div className="num mt-1 text-3xl font-semibold text-fg">{lastScan ? `${lastScan.score}/100` : '—'}</div><div className="mt-1 text-xs text-subtle">{lastScan ? lastScan.grade : 'Run a health scan'}</div></GlassCard>
            </>
          ) : (
            Array.from({ length: 3 }, (_, i) => <CardSkeleton key={i} />)
          )}
        </div>

        <div className="grid gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
          <GlassCard className="p-0">
            <div className="p-5 pb-3"><CardTitle title="Resource-intensive processes" hint="Grouped by name, largest memory first. Refreshes every few seconds." /></div>
            {procs.isError ? (
              <ErrorState error={procs.error} onRetry={() => void procs.refetch()} />
            ) : procs.data ? (
              <DataTable columns={columns} rows={procs.data} rowKey={(p) => p.name} caption="Processes by memory use" defaultSort={{ key: 'mem', dir: 'desc' }} maxHeight="420px" />
            ) : (
              <div className="p-5"><div className="skeleton h-40" /></div>
            )}
          </GlassCard>

          <div className="grid content-start gap-3">
            <h2 className="px-1 text-[15px] font-semibold text-fg">Recommendations</h2>
            {recs.length > 0 ? (
              recs.map((r) => <RecommendationCard key={r.id} rec={r} />)
            ) : (
              <GlassCard>
                <EmptyState icon={<Gauge className="size-6" />} title={lastScan ? 'Nothing to improve right now' : 'No scan yet'} description={lastScan ? 'Your last scan found no performance issues.' : 'Run a health scan to get evidence-based recommendations.'} action={!lastScan && <Button variant="primary" onClick={() => navigate('/health-scan', { state: { autoStart: true } })}>Run a scan</Button>} className="py-8" />
              </GlassCard>
            )}
            <Notice title="Power plan">Reading and changing the active power plan arrives with the engine. Until then PC Doctor does not guess.</Notice>
          </div>
        </div>

        <GlassCard>
          <CardTitle title="Before and after" hint="Comparison of your two most recent real scans" />
          {prev && latest ? <Comparison prev={prev} latest={latest} /> : <EmptyState title="Two scans are needed" description="Run a scan, make a change such as cleanup or turning off a startup app, then scan again to see the measured difference." className="py-8" />}
        </GlassCard>

        <GlassCard>
          <CardTitle title="Optimization profiles" hint="One-click, reversible presets" action={<ProBadge />} />
          <div className="grid gap-3 md:grid-cols-3">
            {PROFILES.map((p) => (
              <div key={p.name} className="rounded-control border border-line p-4">
                <div className="flex items-center gap-2 text-sm font-semibold text-fg"><Zap className="size-4 text-primary" aria-hidden />{p.name}</div>
                <p className="mt-1 text-[13px] text-muted">{p.blurb}</p>
                <div className="mt-3"><StatusBadge tone="warning">Arrives with the engine</StatusBadge></div>
              </div>
            ))}
          </div>
          <p className="mt-3 text-[13px] text-subtle">Applying a profile changes system settings, so it needs the engine's restore-point and rollback support. Nothing is applied in this build.</p>
        </GlassCard>
      </div>
    </div>
  )
}

function Delta({ before, after, unit = '', higherIsBetter }: { before: number; after: number; unit?: string; higherIsBetter: boolean }) {
  const diff = Math.round((after - before) * 10) / 10
  if (diff === 0) return <span className="inline-flex items-center gap-1 text-muted"><Minus className="size-3.5" aria-hidden />No change</span>
  const good = higherIsBetter ? diff > 0 : diff < 0
  return (
    <span className={cn('num inline-flex items-center gap-1 font-medium', good ? 'text-success' : 'text-warning')}>
      {diff > 0 ? <ArrowUp className="size-3.5" aria-hidden /> : <ArrowDown className="size-3.5" aria-hidden />}
      {diff > 0 ? '+' : ''}{diff}{unit}
      <span className="sr-only">{good ? ' better' : ' worse'}</span>
    </span>
  )
}

function Comparison({ prev, latest }: { prev: HealthSnapshot; latest: HealthSnapshot }) {
  const gb = (b: number) => Math.round((b / 1024 ** 3) * 10) / 10
  const rows = [
    { label: 'Health score', a: prev.score, b: latest.score, unit: '', better: true },
    { label: 'Memory in use', a: prev.ramUsedPct, b: latest.ramUsedPct, unit: '%', better: false },
    { label: 'CPU load', a: prev.cpuPct, b: latest.cpuPct, unit: '%', better: false },
    { label: 'Free space', a: gb(prev.diskFreeBytes), b: gb(latest.diskFreeBytes), unit: ' GB', better: true },
    { label: 'Junk files', a: gb(prev.junkBytes), b: gb(latest.junkBytes), unit: ' GB', better: false },
    { label: 'Startup apps enabled', a: prev.startupEnabled, b: latest.startupEnabled, unit: '', better: false }
  ]
  return (
    <div>
      <p className="mb-3 text-[13px] text-subtle">{formatDateTime(prev.timestamp)} → {formatDateTime(latest.timestamp)}. Short-term readings vary, so small differences are normal.</p>
      <table className="w-full text-sm">
        <caption className="sr-only">Comparison of the last two scans</caption>
        <thead><tr className="text-left text-xs uppercase tracking-wide text-subtle"><th className="py-2 font-medium">Measure</th><th className="py-2 text-right font-medium">Before</th><th className="py-2 text-right font-medium">After</th><th className="py-2 text-right font-medium">Change</th></tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.label} className="border-t border-line">
              <td className="py-2.5 text-fg">{r.label}</td>
              <td className="num py-2.5 text-right text-muted">{r.a}{r.unit}</td>
              <td className="num py-2.5 text-right text-fg">{r.b}{r.unit}</td>
              <td className="py-2.5 text-right"><Delta before={r.a} after={r.b} unit={r.unit} higherIsBetter={r.better} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

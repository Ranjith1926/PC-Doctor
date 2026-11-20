import { Battery, BatteryCharging, Clock, Cpu, HardDrive, MemoryStick, ScanLine, Sparkles, Thermometer } from 'lucide-react'
import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { HealthScoreRing } from '@/components/charts/HealthScoreRing'
import { ChartLegend, PerformanceChart } from '@/components/charts/PerformanceChart'
import { useChartColors } from '@/app/theme'
import { CardSkeleton, EmptyState, ErrorState } from '@/components/feedback/States'
import { RecommendationCard } from '@/components/feedback/RecommendationCard'
import { Button } from '@/components/ui/Button'
import { CardTitle, GlassCard } from '@/components/ui/GlassCard'
import { MetricCard } from '@/components/ui/MetricCard'
import { PageHeader } from '@/components/ui/PageHeader'
import type { Tone } from '@/components/ui/StatusBadge'
import { useBattery, useCleanupHistory, useHealthHistory, useSystemInfo } from '@/hooks/useEngine'
import { useSettings } from '@/stores/settingsStore'
import { useUi } from '@/stores/uiStore'
import { formatBytes, formatDateTime, formatDuration, greeting, timeAgo } from '@/utils/format'

const toneFor = (pct: number, warn = 70, bad = 88): Tone => (pct >= bad ? 'danger' : pct >= warn ? 'warning' : 'success')

export default function DashboardPage() {
  const navigate = useNavigate()
  const colors = useChartColors()
  const system = useSystemInfo()
  const history = useHealthHistory()
  const cleanups = useCleanupHistory()
  const battery = useBattery()
  const metricsHistory = useUi((s) => s.metricsHistory)
  const lastScan = useSettings((s) => s.lastScan)
  const m = metricsHistory.at(-1)

  const latestSnapshot = history.data?.at(-1) ?? null
  const score = lastScan?.score ?? latestSnapshot?.score ?? null
  const scanTime = lastScan?.finishedAt ?? latestSnapshot?.timestamp ?? null
  const recoverable = lastScan?.recoverableBytes ?? latestSnapshot?.junkBytes ?? null

  const chartData = useMemo(() => metricsHistory.map((p) => ({ x: p.timestamp, cpu: p.cpuPct, ram: p.ramUsedPct })), [metricsHistory])
  const series = [
    { key: 'cpu', label: 'CPU', color: colors.primary },
    { key: 'ram', label: 'Memory', color: colors.accent }
  ]

  const activity = useMemo(() => {
    const items = [
      ...(history.data ?? []).map((s) => ({ id: s.id, at: s.timestamp, text: `Health scan scored ${s.score}/100`, icon: <ScanLine className="size-4" aria-hidden /> })),
      ...(cleanups.data ?? []).map((c) => ({ id: c.id, at: c.timestamp, text: `Cleanup recovered ${formatBytes(c.freedBytes)}`, icon: <Sparkles className="size-4" aria-hidden /> }))
    ]
    return items.sort((a, b) => b.at - a.at).slice(0, 6)
  }, [history.data, cleanups.data])

  const firstError = system.error ?? history.error
  const recs = lastScan?.recommendations ?? []

  return (
    <div>
      <PageHeader
        title={system.data ? `${greeting()}, ${system.data.userName}` : greeting()}
        subtitle={system.data ? `${system.data.cpuModel} · ${system.data.cpuCores} threads · ${formatBytes(system.data.totalMemBytes, 0)} memory` : 'Your PC at a glance.'}
        actions={
          <>
            <Button variant="primary" icon={<ScanLine className="size-4" aria-hidden />} onClick={() => navigate('/health-scan', { state: { autoStart: true } })}>
              Quick Scan
            </Button>
            <Button icon={<Sparkles className="size-4" aria-hidden />} onClick={() => navigate('/cleanup')}>
              Smart Cleanup
            </Button>
            <Button variant="ghost" onClick={() => navigate('/reports')}>
              View Reports
            </Button>
          </>
        }
      />

      {firstError && !m ? (
        <GlassCard>
          <ErrorState error={firstError} onRetry={() => { void system.refetch(); void history.refetch() }} />
        </GlassCard>
      ) : (
        <div className="grid gap-4">
          {/* Health score is the focal point. */}
          <GlassCard strong className="grid items-center gap-6 p-6 md:grid-cols-[auto_1fr]">
            <HealthScoreRing score={score} caption={score !== null ? '/ 100' : undefined} />
            <div className="min-w-0">
              <h2 className="text-lg font-semibold text-fg">{score === null ? 'Run your first health scan' : 'PC health'}</h2>
              <p className="mt-1 max-w-xl text-sm text-muted">
                {score === null
                  ? 'A scan measures memory, storage, CPU, startup load and junk files, then explains each result. It makes no changes.'
                  : `Based on a real scan ${scanTime ? timeAgo(scanTime) : ''}. The score is a guide built from the checks in Health Scan, not a benchmark.`}
              </p>
              <dl className="mt-5 grid gap-4 sm:grid-cols-3">
                <div>
                  <dt className="text-xs text-subtle">Latest scan</dt>
                  <dd className="mt-0.5 text-sm font-medium text-fg">{scanTime ? formatDateTime(scanTime) : 'Never'}</dd>
                </div>
                <div>
                  <dt className="text-xs text-subtle">Estimated recoverable</dt>
                  <dd className="num mt-0.5 text-sm font-medium text-fg">{recoverable === null ? 'Run a scan' : formatBytes(recoverable)}</dd>
                </div>
                <div>
                  <dt className="text-xs text-subtle">Open recommendations</dt>
                  <dd className="num mt-0.5 text-sm font-medium text-fg">{lastScan ? recs.length : '—'}</dd>
                </div>
              </dl>
            </div>
          </GlassCard>

          {/* Live readings. Everything here comes from the engine, never placeholders. */}
          <div className="grid grid-cols-[repeat(auto-fit,minmax(210px,1fr))] gap-4">
            {m ? (
              <>
                <MetricCard icon={<Cpu className="size-4" />} label="CPU" value={`${m.cpuPct}%`} percent={m.cpuPct} tone={toneFor(m.cpuPct, 60, 85)} sub="Current load" />
                <MetricCard icon={<MemoryStick className="size-4" />} label="Memory" value={`${m.ramUsedPct}%`} percent={m.ramUsedPct} tone={toneFor(m.ramUsedPct, 75, 88)} sub={`${formatBytes(m.ramUsedBytes)} of ${formatBytes(m.ramTotalBytes, 0)}`} />
                <MetricCard icon={<HardDrive className="size-4" />} label="Storage" value={`${100 - m.diskFreePct}%`} percent={100 - m.diskFreePct} tone={toneFor(100 - m.diskFreePct, 75, 90)} sub={`${formatBytes(m.diskFreeBytes)} free of ${formatBytes(m.diskTotalBytes, 0)}`} />
                <MetricCard icon={<Clock className="size-4" />} label="Uptime" value={formatDuration(m.uptimeSec)} tone={m.uptimeSec > 7 * 86400 ? 'warning' : 'success'} sub={m.uptimeSec > 7 * 86400 ? 'A restart is overdue' : 'Since last restart'} />
                {battery && (
                  <MetricCard icon={battery.charging ? <BatteryCharging className="size-4" /> : <Battery className="size-4" />} label="Battery" value={`${battery.level}%`} percent={battery.level} tone={battery.level <= 20 && !battery.charging ? 'danger' : 'success'} sub={battery.charging ? 'Charging' : 'On battery'} />
                )}
                {m.tempC !== null && <MetricCard icon={<Thermometer className="size-4" />} label="Temperature" value={`${Math.round(m.tempC)}°C`} tone={toneFor(m.tempC, 75, 90)} sub="Hardware sensor" />}
              </>
            ) : (
              Array.from({ length: 4 }, (_, i) => <CardSkeleton key={i} />)
            )}
          </div>

          <div className="grid gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
            <GlassCard>
              <CardTitle title="Live performance" hint="Real readings from this PC since the app opened" action={<ChartLegend series={series} />} />
              {chartData.length < 2 ? (
                <EmptyState title="Collecting readings…" description="The chart fills in over the next few seconds." className="py-14" />
              ) : (
                <PerformanceChart data={chartData} series={series} summary={`Live CPU and memory use. Latest: CPU ${m?.cpuPct}%, memory ${m?.ramUsedPct}%.`} />
              )}
            </GlassCard>

            <div className="grid content-start gap-3">
              <h2 className="px-1 text-[15px] font-semibold text-fg">Recommended actions</h2>
              {recs.length > 0 ? (
                recs.slice(0, 3).map((r) => <RecommendationCard key={r.id} rec={r} />)
              ) : (
                <GlassCard>
                  <EmptyState
                    title={lastScan ? 'Nothing needs attention' : 'No recommendations yet'}
                    description={lastScan ? 'Your last scan found nothing to fix.' : 'Run a scan and PC Doctor will explain what is worth doing.'}
                    action={!lastScan && <Button variant="primary" onClick={() => navigate('/health-scan', { state: { autoStart: true } })}>Run a scan</Button>}
                  />
                </GlassCard>
              )}
            </div>
          </div>

          <GlassCard>
            <CardTitle title="Recent activity" />
            {activity.length === 0 ? (
              <EmptyState title="No activity yet" description="Scans and cleanups you run will be listed here." className="py-8" />
            ) : (
              <ul className="divide-y divide-line">
                {activity.map((a) => (
                  <li key={a.id} className="flex items-center gap-3 py-2.5 text-sm">
                    <span className="grid size-8 place-items-center rounded-lg bg-primary/12 text-primary">{a.icon}</span>
                    <span className="flex-1 text-fg">{a.text}</span>
                    <time className="text-xs text-subtle" dateTime={new Date(a.at).toISOString()}>{formatDateTime(a.at)}</time>
                  </li>
                ))}
              </ul>
            )}
          </GlassCard>
        </div>
      )}
    </div>
  )
}

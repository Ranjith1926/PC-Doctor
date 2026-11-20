import { useMutation } from '@tanstack/react-query'
import { FileDown, FileText } from 'lucide-react'
import { useMemo } from 'react'
import { useChartColors } from '@/app/theme'
import { ChartLegend, PerformanceChart } from '@/components/charts/PerformanceChart'
import { EmptyState, ErrorState, LoadingSkeleton } from '@/components/feedback/States'
import { Button } from '@/components/ui/Button'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { CardTitle, GlassCard } from '@/components/ui/GlassCard'
import { PageHeader } from '@/components/ui/PageHeader'
import { StatusBadge, severityLabel, severityTone } from '@/components/ui/StatusBadge'
import { useCleanupHistory, useHealthHistory } from '@/hooks/useEngine'
import { EngineError, engine } from '@/services/engineClient'
import { useSettings } from '@/stores/settingsStore'
import { toast } from '@/stores/toastStore'
import type { CleanupHistoryEntry, ScanCategoryResult } from '@shared/contracts'
import { formatBytes, formatDateTime } from '@/utils/format'

const dayFmt = (x: number) => new Date(x).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })

export default function ReportsPage() {
  const colors = useChartColors()
  const history = useHealthHistory()
  const cleanups = useCleanupHistory()
  const lastScan = useSettings((s) => s.lastScan)

  const exporter = useMutation({
    mutationFn: (format: 'html' | 'pdf') => engine.exportReport(format),
    onSuccess: (r) => toast.success('Report saved', r.filePath),
    onError: (e) => {
      if (e instanceof EngineError && e.code === 'cancelled') return
      toast.danger('Could not export the report', e instanceof Error ? e.message : undefined)
    }
  })

  const snaps = useMemo(() => history.data ?? [], [history.data])
  const scoreData = useMemo(() => snaps.map((s) => ({ x: s.timestamp, score: s.score })), [snaps])
  const trendData = useMemo(() => snaps.map((s) => ({ x: s.timestamp, cpu: s.cpuPct, ram: s.ramUsedPct })), [snaps])
  const storageData = useMemo(() => snaps.map((s) => ({ x: s.timestamp, free: Math.round((s.diskFreeBytes / 1024 ** 3) * 10) / 10 })), [snaps])
  const maxFree = Math.ceil(Math.max(10, ...storageData.map((d) => d.free)) / 10) * 10
  const recovered = (cleanups.data ?? []).reduce((s, c) => s + c.freedBytes, 0)

  const cleanupColumns: Column<CleanupHistoryEntry>[] = [
    { key: 'when', header: 'Date', sortValue: (c) => c.timestamp, cell: (c) => <span className="text-sm text-fg">{formatDateTime(c.timestamp)}</span> },
    { key: 'freed', header: 'Recovered', align: 'right', sortValue: (c) => c.freedBytes, cell: (c) => <span className="num text-sm text-fg">{formatBytes(c.freedBytes)}</span> },
    { key: 'items', header: 'Items', cell: (c) => <span className="text-sm text-muted">{c.itemNames.join(', ')}</span> }
  ]
  const diagColumns: Column<ScanCategoryResult>[] = [
    { key: 'label', header: 'Check', cell: (c) => <span className="text-sm font-medium text-fg">{c.label}</span> },
    { key: 'value', header: 'Result', cell: (c) => <span className="num text-sm text-muted">{c.valueText}</span> },
    { key: 'sev', header: 'Status', cell: (c) => <StatusBadge tone={severityTone[c.severity]}>{severityLabel[c.severity]}</StatusBadge> },
    { key: 'pts', header: 'Points', align: 'right', cell: (c) => <span className="num text-sm text-fg">{c.points}/{c.maxPoints}</span> },
    { key: 'why', header: 'How it was scored', cell: (c) => <span className="text-[13px] text-muted">{c.evidence}</span> }
  ]

  const needTwo = <EmptyState title="Not enough history yet" description="Charts appear after two or more health scans." className="py-10" />

  return (
    <div>
      <PageHeader
        title="Reports"
        subtitle="History built from your real scans and cleanups, stored on this PC only."
        actions={
          <>
            <Button icon={<FileText className="size-4" aria-hidden />} loading={exporter.isPending && exporter.variables === 'html'} onClick={() => exporter.mutate('html')}>Export HTML</Button>
            <Button variant="primary" icon={<FileDown className="size-4" aria-hidden />} loading={exporter.isPending && exporter.variables === 'pdf'} onClick={() => exporter.mutate('pdf')}>Export PDF</Button>
          </>
        }
      />

      {history.isPending && <LoadingSkeleton rows={5} />}
      {history.isError && <GlassCard><ErrorState error={history.error} onRetry={() => void history.refetch()} /></GlassCard>}

      {history.data && (
        <div className="grid gap-4">
          <GlassCard>
            <CardTitle title="Health score over time" hint={`${snaps.length} scan${snaps.length === 1 ? '' : 's'} recorded`} />
            {snaps.length < 2 ? needTwo : <PerformanceChart data={scoreData} series={[{ key: 'score', label: 'Score', color: colors.primary }]} unit="" xFormatter={dayFmt} summary={`Health score history. Latest score ${snaps.at(-1)?.score} out of 100.`} />}
          </GlassCard>

          <div className="grid gap-4 lg:grid-cols-2">
            <GlassCard>
              <CardTitle title="CPU and memory at scan time" action={<ChartLegend series={[{ key: 'cpu', label: 'CPU', color: colors.primary }, { key: 'ram', label: 'Memory', color: colors.accent }]} />} />
              {snaps.length < 2 ? needTwo : <PerformanceChart data={trendData} series={[{ key: 'cpu', label: 'CPU', color: colors.primary }, { key: 'ram', label: 'Memory', color: colors.accent }]} xFormatter={dayFmt} height={200} summary="CPU and memory use recorded at each scan." />}
            </GlassCard>
            <GlassCard>
              <CardTitle title="Free storage (GB)" />
              {snaps.length < 2 ? needTwo : <PerformanceChart data={storageData} series={[{ key: 'free', label: 'Free space', color: colors.success }]} yDomain={[0, maxFree]} unit=" GB" xFormatter={dayFmt} height={200} summary="Free space on the system drive at each scan." />}
            </GlassCard>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <GlassCard className="p-0">
              <div className="p-5 pb-2"><CardTitle title="Cleanup history" hint={`${formatBytes(recovered)} recovered in total`} /></div>
              <DataTable columns={cleanupColumns} rows={cleanups.data ?? []} rowKey={(c) => c.id} caption="Cleanup history" defaultSort={{ key: 'when', dir: 'desc' }} maxHeight="300px" empty={<EmptyState title="No cleanups yet" description="Space you recover in Smart Cleanup is recorded here." className="py-8" />} />
            </GlassCard>
            <GlassCard>
              <CardTitle title="Optimization history" />
              <EmptyState title="No optimization changes recorded" description="Performance profiles and power changes are logged here once the engine applies them." className="py-8" />
            </GlassCard>
          </div>

          <GlassCard className="p-0">
            <div className="p-5 pb-2"><CardTitle title="Detailed diagnostic report" hint={lastScan ? `From the scan on ${formatDateTime(lastScan.finishedAt)}` : 'Run a health scan to populate this table'} /></div>
            <DataTable columns={diagColumns} rows={lastScan?.categories ?? []} rowKey={(c) => c.id} caption="Detailed diagnostics" empty={<EmptyState title="No diagnostic data yet" description="Run a health scan and every check is listed here with how it was scored." className="py-8" />} />
          </GlassCard>
        </div>
      )}
    </div>
  )
}

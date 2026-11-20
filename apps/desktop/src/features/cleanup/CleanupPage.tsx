import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Loader2, ScanSearch, ShieldCheck, Sparkles } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { StorageBars } from '@/components/charts/StorageChart'
import { EmptyState, ErrorState } from '@/components/feedback/States'
import { Button } from '@/components/ui/Button'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { CardTitle, GlassCard } from '@/components/ui/GlassCard'
import { Notice } from '@/components/ui/Notice'
import { PageHeader } from '@/components/ui/PageHeader'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { queryKeys } from '@/hooks/useEngine'
import { engine, isUnavailable } from '@/services/engineClient'
import { useSettings } from '@/stores/settingsStore'
import { toast } from '@/stores/toastStore'
import { CLEANUP_GROUP_LABELS } from '@shared/constants'
import type { CleanupCandidate, CleanupGroup, CleanupRunResult } from '@shared/contracts'
import { formatBytes } from '@/utils/format'

const GROUPS: CleanupGroup[] = ['system', 'browser', 'developer', 'heavy']

export default function CleanupPage() {
  const queryClient = useQueryClient()
  const defaults = useSettings((s) => s.defaultCleanupGroups)
  const notifyDone = useSettings((s) => s.notifyCleanupComplete)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [result, setResult] = useState<CleanupRunResult | null>(null)

  // Read-only scan. Held in the query cache so Storage can reuse the same numbers.
  const scan = useQuery({ queryKey: queryKeys.cleanupScan, queryFn: engine.scanCleanup, enabled: false, staleTime: Infinity, retry: false })

  const clean = useMutation({
    mutationFn: (ids: string[]) => engine.runCleanup(ids),
    onSuccess: async (r) => {
      setResult(r)
      setConfirmOpen(false)
      await Promise.all([queryClient.invalidateQueries({ queryKey: queryKeys.cleanupHistory }), scan.refetch()])
      if (notifyDone) toast.success(`Recovered ${formatBytes(r.freedBytes)}`, 'Cleanup finished')
    },
    onError: (e) => {
      setConfirmOpen(false)
      toast[isUnavailable(e) ? 'warning' : 'danger']('Cleanup did not run', e instanceof Error ? e.message : undefined)
    }
  })

  const candidates = useMemo(() => scan.data?.candidates ?? [], [scan.data])

  // Pre-select what the user's preferences say, skipping empty items and apps that are open.
  useEffect(() => {
    if (!scan.data) return
    setSelected(new Set(scan.data.candidates.filter((c) => defaults.includes(c.group) && c.sizeBytes > 0 && c.runningApps.length === 0).map((c) => c.id)))
  }, [scan.data, defaults])

  const byGroup = useMemo(() => {
    const map = new Map<CleanupGroup, CleanupCandidate[]>()
    for (const c of candidates) map.set(c.group, [...(map.get(c.group) ?? []), c])
    return map
  }, [candidates])

  const selectedItems = candidates.filter((c) => selected.has(c.id))
  const selectedBytes = selectedItems.reduce((s, c) => s + c.sizeBytes, 0)
  const toggle = (id: string, on: boolean) =>
    setSelected((prev) => {
      const next = new Set(prev)
      if (on) next.add(id)
      else next.delete(id)
      return next
    })

  const runScan = () => {
    setResult(null)
    void scan.refetch()
  }

  return (
    <div>
      <PageHeader
        title="Smart Cleanup"
        subtitle="Finds temporary files and caches you can safely remove. You see exactly what will be deleted, and nothing is touched until you approve it."
        actions={
          <Button variant="primary" icon={<ScanSearch className="size-4" aria-hidden />} loading={scan.isFetching} onClick={runScan}>
            {scan.data ? 'Scan again' : 'Scan for junk'}
          </Button>
        }
      />

      {scan.isFetching && !scan.data && (
        <GlassCard strong>
          <div className="grid place-items-center gap-3 py-14 text-center" role="status">
            <Loader2 className="size-8 animate-spin text-primary" aria-hidden />
            <p className="text-sm font-medium text-fg">Measuring junk files…</p>
            <p className="max-w-sm text-[13px] text-muted">This is read-only. It can take a minute on a busy PC.</p>
          </div>
        </GlassCard>
      )}

      {scan.isError && (
        <GlassCard>
          <ErrorState error={scan.error} onRetry={runScan} />
        </GlassCard>
      )}

      {!scan.data && !scan.isFetching && !scan.isError && (
        <GlassCard strong>
          <EmptyState icon={<Sparkles className="size-6" />} title="Find out what you can free up" description="Scanning only measures sizes. You choose what to clean on the next step." action={<Button variant="primary" onClick={runScan}>Scan for junk</Button>} className="py-14" />
        </GlassCard>
      )}

      {clean.isPending && (
        <GlassCard strong className="mb-4">
          <div className="grid place-items-center gap-3 py-10 text-center" role="status">
            <Loader2 className="size-8 animate-spin text-primary" aria-hidden />
            <p className="text-sm font-medium text-fg">Cleaning {selectedItems.length} item{selectedItems.length === 1 ? '' : 's'}…</p>
            <p className="max-w-sm text-[13px] text-muted">Please keep PC Doctor open. Files that are in use are left alone.</p>
          </div>
        </GlassCard>
      )}

      {result && !clean.isPending && <CleanupSummary result={result} onDismiss={() => setResult(null)} />}

      {scan.data && !clean.isPending && (
        <div className="grid gap-4">
          <GlassCard strong className="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-4 p-4">
            <div>
              <div className="text-xs text-subtle">Found in total</div>
              <div className="num text-2xl font-semibold text-fg">{formatBytes(scan.data.totalBytes)}</div>
            </div>
            <div>
              <div className="text-xs text-subtle">Selected to clean</div>
              <div className="num text-2xl font-semibold text-primary">{formatBytes(selectedBytes)}</div>
            </div>
            <Button variant="primary" disabled={selectedItems.length === 0} icon={<Sparkles className="size-4" aria-hidden />} onClick={() => setConfirmOpen(true)}>
              Review and clean ({selectedItems.length})
            </Button>
          </GlassCard>

          <GlassCard>
            <CardTitle title="Where the space is" hint="Largest first. Select what to clean below." />
            <StorageBars items={[...candidates].filter((c) => c.sizeBytes > 0).sort((a, b) => b.sizeBytes - a.sizeBytes).map((c) => ({ name: c.name, sizeBytes: c.sizeBytes }))} emptyText="No junk files were found. Your PC is already tidy." />
          </GlassCard>

          {GROUPS.filter((g) => byGroup.has(g)).map((g) => {
            const items = byGroup.get(g) ?? []
            const selectable = items.filter((c) => c.sizeBytes > 0 && c.runningApps.length === 0)
            const allOn = selectable.length > 0 && selectable.every((c) => selected.has(c.id))
            return (
              <GlassCard key={g}>
                <div className="mb-3 flex items-start justify-between gap-3">
                  <div>
                    <h2 className="text-[15px] font-semibold text-fg">{CLEANUP_GROUP_LABELS[g].title}</h2>
                    <p className="text-[13px] text-muted">{CLEANUP_GROUP_LABELS[g].blurb}</p>
                  </div>
                  <label className="flex cursor-pointer items-center gap-2 text-[13px] text-muted">
                    <input type="checkbox" className="check" checked={allOn} disabled={selectable.length === 0} onChange={(e) => selectable.forEach((c) => toggle(c.id, e.target.checked))} aria-label={`Select all in ${CLEANUP_GROUP_LABELS[g].title}`} />
                    Select all
                  </label>
                </div>
                <ul className="divide-y divide-line">
                  {items.map((c) => {
                    const blocked = c.runningApps.length > 0
                    const disabled = blocked || c.sizeBytes === 0
                    return (
                      <li key={c.id}>
                        <label className={`flex items-center gap-3 px-1 py-3 ${disabled ? 'cursor-not-allowed' : 'cursor-pointer'}`}>
                          <input type="checkbox" className="check" checked={selected.has(c.id)} disabled={disabled} onChange={(e) => toggle(c.id, e.target.checked)} aria-label={`${c.name}, ${formatBytes(c.sizeBytes)}`} />
                          <span className="min-w-0 flex-1">
                            <span className="block text-sm font-medium text-fg">{c.name}</span>
                            <span className="block text-[13px] text-muted">{c.description}</span>
                          </span>
                          {blocked && <StatusBadge tone="warning">Close {c.runningApps.join(' / ')} first</StatusBadge>}
                          {!blocked && c.sizeBytes === 0 && <StatusBadge tone="neutral">Empty</StatusBadge>}
                          <span className="num w-24 shrink-0 text-right text-sm text-fg">{formatBytes(c.sizeBytes)}</span>
                        </label>
                      </li>
                    )
                  })}
                </ul>
              </GlassCard>
            )
          })}

          <GlassCard>
            <CardTitle title="Protected locations" hint="PC Doctor never cleans these, whatever you select" />
            <ul className="grid gap-2 sm:grid-cols-2">
              {scan.data.protectedLocations.map((p) => (
                <li key={p} className="flex items-start gap-2 text-[13px] text-muted">
                  <ShieldCheck className="mt-0.5 size-4 shrink-0 text-success" aria-hidden />
                  {p}
                </li>
              ))}
            </ul>
          </GlassCard>
        </div>
      )}

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={(o) => !clean.isPending && setConfirmOpen(o)}
        tone="danger"
        title={`Permanently delete ${formatBytes(selectedBytes)}?`}
        description="These files are deleted, not moved to the Recycle Bin, so this cannot be undone. Files that are in use are skipped. Your documents, downloads and projects are never touched."
        confirmLabel={`Clean ${selectedItems.length} item${selectedItems.length === 1 ? '' : 's'}`}
        loading={clean.isPending}
        onConfirm={() => clean.mutate(selectedItems.map((c) => c.id))}
      >
        <ul className="divide-y divide-line rounded-control border border-line">
          {selectedItems.map((c) => (
            <li key={c.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
              <span className="min-w-0 truncate text-fg">{c.name}</span>
              <span className="num shrink-0 text-muted">{formatBytes(c.sizeBytes)}</span>
            </li>
          ))}
        </ul>
        {selectedItems.some((c) => c.group === 'heavy') && (
          <Notice tone="warning" className="mt-3" title="Includes a large cache">
            Removing it means a long re-download the next time you build a project.
          </Notice>
        )}
      </ConfirmDialog>
    </div>
  )
}

function CleanupSummary({ result, onDismiss }: { result: CleanupRunResult; onDismiss: () => void }) {
  const failed = result.outcomes.filter((o) => o.status === 'error')
  const skipped = result.outcomes.filter((o) => o.status === 'skipped-app-running')
  return (
    <GlassCard strong className="mb-4">
      <CardTitle
        title={failed.length === 0 ? 'Cleanup finished' : 'Cleanup finished with problems'}
        hint="This is what actually happened, item by item."
        action={<Button size="sm" variant="ghost" onClick={onDismiss}>Dismiss</Button>}
      />
      <div className="num mb-4 text-3xl font-semibold text-success">{formatBytes(result.freedBytes)} <span className="text-sm font-normal text-muted">recovered</span></div>
      <ul className="divide-y divide-line">
        {result.outcomes.map((o) => (
          <li key={o.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5 text-sm">
            <span className="min-w-0 flex-1 text-fg">{o.name}</span>
            {o.message && <span className="text-[13px] text-muted">{o.message}</span>}
            <StatusBadge tone={o.status === 'done' ? 'success' : o.status === 'error' ? 'danger' : 'warning'}>
              {o.status === 'done' ? 'Cleaned' : o.status === 'error' ? 'Failed' : o.status === 'skipped-empty' ? 'Nothing to clean' : 'Skipped'}
            </StatusBadge>
            <span className="num w-20 text-right text-muted">{formatBytes(o.freedBytes)}</span>
          </li>
        ))}
      </ul>
      {skipped.length > 0 && <p className="mt-3 text-[13px] text-muted">Close the apps mentioned above and scan again to include the skipped items.</p>}
    </GlassCard>
  )
}

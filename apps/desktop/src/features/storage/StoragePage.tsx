import { useMutation, useQuery } from '@tanstack/react-query'
import { FileSearch, FolderOpen, Home, Sparkles } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { StorageBars, StorageDonut } from '@/components/charts/StorageChart'
import { EmptyState, ErrorState } from '@/components/feedback/States'
import { Button } from '@/components/ui/Button'
import { ProBadge } from '@/components/ui/ProBadge'
import { CardTitle, GlassCard } from '@/components/ui/GlassCard'
import { Notice } from '@/components/ui/Notice'
import { PageHeader } from '@/components/ui/PageHeader'
import { queryKeys } from '@/hooks/useEngine'
import { engine, EngineError } from '@/services/engineClient'
import { toast } from '@/stores/toastStore'
import { useUi } from '@/stores/uiStore'
import { formatBytes, formatDate } from '@/utils/format'

export default function StoragePage() {
  const navigate = useNavigate()
  const m = useUi((s) => s.metricsHistory.at(-1))
  // Shares the cache with Smart Cleanup, so a scan done there shows up here too.
  const scan = useQuery({ queryKey: queryKeys.cleanupScan, queryFn: engine.scanCleanup, enabled: false, staleTime: Infinity, retry: false })

  const folder = useMutation({
    mutationFn: (target: 'home' | 'choose') => engine.analyzeFolder(target),
    onError: (e) => {
      if (e instanceof EngineError && e.code === 'cancelled') return
      toast.danger('Could not analyze that folder', e instanceof Error ? e.message : undefined)
    }
  })

  const developer = (scan.data?.candidates ?? []).filter((c) => c.group === 'developer' && c.sizeBytes > 0)
  const recoverable = (scan.data?.candidates ?? []).filter((c) => c.group !== 'heavy').reduce((s, c) => s + c.sizeBytes, 0)
  const a = folder.data

  return (
    <div>
      <PageHeader title="Storage" badge={<ProBadge />} subtitle="See where your space goes. This page only reads: PC Doctor never deletes your personal files." />

      <div className="grid gap-4">
        <div className="grid gap-4 lg:grid-cols-[auto_1fr]">
          <GlassCard className="grid place-items-center p-6">
            {m ? <StorageDonut usedBytes={m.diskTotalBytes - m.diskFreeBytes} totalBytes={m.diskTotalBytes} /> : <div className="skeleton size-48 rounded-full" />}
            {m && (
              <dl className="mt-4 grid w-full grid-cols-2 gap-3 text-center">
                <div><dt className="text-xs text-subtle">Free</dt><dd className="num text-sm font-medium text-fg">{formatBytes(m.diskFreeBytes)}</dd></div>
                <div><dt className="text-xs text-subtle">Total</dt><dd className="num text-sm font-medium text-fg">{formatBytes(m.diskTotalBytes, 0)}</dd></div>
              </dl>
            )}
          </GlassCard>

          <GlassCard>
            <CardTitle
              title="Safe cleanup recommendation"
              hint="From a read-only scan of temporary files, caches and crash reports"
              action={<Button size="sm" loading={scan.isFetching} onClick={() => void scan.refetch()}>{scan.data ? 'Re-scan' : 'Measure'}</Button>}
            />
            {scan.isError ? (
              <ErrorState error={scan.error} onRetry={() => void scan.refetch()} />
            ) : scan.data ? (
              <>
                <div className="num text-3xl font-semibold text-fg">{formatBytes(recoverable)}</div>
                <p className="mt-1 text-sm text-muted">could be recovered without touching personal files.</p>
                <h3 className="mb-3 mt-5 text-sm font-semibold text-fg">Developer caches</h3>
                <StorageBars items={developer.map((c) => ({ name: c.name, sizeBytes: c.sizeBytes }))} emptyText="No developer caches found." />
                <Button className="mt-5" variant="primary" icon={<Sparkles className="size-4" aria-hidden />} onClick={() => navigate('/cleanup')}>Review in Smart Cleanup</Button>
              </>
            ) : (
              <EmptyState title="Not measured yet" description="Measure to see recoverable space and developer cache sizes." className="py-8" />
            )}
          </GlassCard>
        </div>

        <GlassCard>
          <CardTitle
            title="Folder analysis and large files"
            hint="Pick a folder and see what is biggest inside it. Read-only."
            action={
              <div className="flex gap-2">
                <Button size="sm" icon={<Home className="size-4" aria-hidden />} loading={folder.isPending && folder.variables === 'home'} onClick={() => folder.mutate('home')}>Home folder</Button>
                <Button size="sm" variant="primary" icon={<FolderOpen className="size-4" aria-hidden />} loading={folder.isPending && folder.variables === 'choose'} onClick={() => folder.mutate('choose')}>Choose folder…</Button>
              </div>
            }
          />
          {folder.isPending && <p className="py-8 text-center text-sm text-muted" role="status">Analyzing… large folders can take up to 25 seconds.</p>}
          {!folder.isPending && !a && <EmptyState icon={<FileSearch className="size-6" />} title="No folder analyzed yet" description="Start with your home folder, or choose any folder or drive." className="py-8" />}
          {!folder.isPending && a && (
            <div className="grid gap-6 lg:grid-cols-2">
              <div>
                <p className="mb-3 text-[13px] text-subtle"><span className="selectable">{a.root}</span> · {formatBytes(a.totalBytes)} scanned {formatDate(a.scannedAt)}</p>
                {a.truncated && <Notice tone="warning" className="mb-3">The scan hit its time limit, so very large folders are only partly measured.</Notice>}
                <h3 className="mb-3 text-sm font-semibold text-fg">Biggest items</h3>
                <StorageBars items={a.children.slice(0, 12).map((c) => ({ name: c.name, sizeBytes: c.sizeBytes, note: c.isDirectory ? 'folder' : 'file' }))} emptyText="This folder is empty." />
              </div>
              <div>
                <h3 className="mb-3 text-sm font-semibold text-fg">Largest files (10 MB and up)</h3>
                {a.largeFiles.length === 0 ? (
                  <p className="text-sm text-muted">No files over 10 MB were found here.</p>
                ) : (
                  <ul className="divide-y divide-line">
                    {a.largeFiles.map((f) => (
                      <li key={f.path} className="flex items-center justify-between gap-3 py-2 text-sm">
                        <span className="selectable min-w-0 truncate text-fg" title={f.path}>{f.path}</span>
                        <span className="num shrink-0 text-muted">{formatBytes(f.sizeBytes)}</span>
                      </li>
                    ))}
                  </ul>
                )}
                <p className="mt-3 text-[13px] text-subtle">Review these yourself in File Explorer or Finder. PC Doctor will not delete them.</p>
              </div>
            </div>
          )}
        </GlassCard>
      </div>
    </div>
  )
}

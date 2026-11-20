import { useQuery } from '@tanstack/react-query'
import { AppWindow } from 'lucide-react'
import { useMemo, useState } from 'react'
import { EmptyState, ErrorState, LoadingSkeleton } from '@/components/feedback/States'
import { AppIcon } from '@/components/ui/AppIcon'
import { Button } from '@/components/ui/Button'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { FilterDropdown } from '@/components/ui/FilterDropdown'
import { GlassCard } from '@/components/ui/GlassCard'
import { Notice } from '@/components/ui/Notice'
import { PageHeader } from '@/components/ui/PageHeader'
import { SearchInput } from '@/components/ui/SearchInput'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { queryKeys } from '@/hooks/useEngine'
import { engine } from '@/services/engineClient'
import type { InstalledApp } from '@shared/contracts'
import { formatBytes } from '@/utils/format'

type Filter = 'all' | 'large' | 'protected'

export default function ApplicationsPage() {
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<Filter>('all')
  const apps = useQuery({ queryKey: queryKeys.apps, queryFn: engine.listApps, retry: false, staleTime: 60_000 })

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase()
    return (apps.data ?? []).filter((a) => {
      if (q && !`${a.name} ${a.publisher}`.toLowerCase().includes(q)) return false
      if (filter === 'large') return (a.sizeBytes ?? 0) >= 500 * 1024 ** 2
      if (filter === 'protected') return a.protected
      return true
    })
  }, [apps.data, search, filter])

  const columns: Column<InstalledApp>[] = [
    {
      key: 'name',
      header: 'Application',
      sortValue: (a) => a.name.toLowerCase(),
      cell: (a) => (
        <div className="flex min-w-0 items-center gap-3">
          <AppIcon src={a.iconDataUrl} name={a.name} />
          <span className="truncate text-sm font-medium text-fg">{a.name}</span>
          {a.protected && <StatusBadge tone="info">Driver / security</StatusBadge>}
        </div>
      )
    },
    { key: 'publisher', header: 'Publisher', sortValue: (a) => a.publisher.toLowerCase(), cell: (a) => <span className="text-sm text-muted">{a.publisher}</span> },
    { key: 'version', header: 'Version', cell: (a) => <span className="num text-xs text-muted">{a.version}</span> },
    { key: 'installed', header: 'Installed', sortValue: (a) => a.installedOn ?? '', cell: (a) => <span className="num text-xs text-muted">{a.installedOn ?? '—'}</span> },
    { key: 'size', header: 'Size', align: 'right', sortValue: (a) => a.sizeBytes ?? -1, cell: (a) => <span className="num text-sm text-fg">{a.sizeBytes ? formatBytes(a.sizeBytes) : '—'}</span> },
    {
      key: 'action',
      header: '',
      align: 'right',
      cell: (a) => (
        <Button size="sm" variant="ghost" disabled title="Uninstall arrives with the .NET engine, so it can run with a restore point." aria-label={`Uninstall ${a.name} (not available yet)`}>
          Uninstall
        </Button>
      )
    }
  ]

  return (
    <div>
      <PageHeader title="Applications" subtitle="Everything installed on this PC, with real sizes and versions where Windows reports them." />
      <div className="grid gap-4">
        <Notice title="Uninstall is not connected yet">
          Removing software needs a restore point and verified uninstallers, which the .NET engine provides. Until then this list is for review, and nothing is removed. Use Windows Settings to uninstall in the meantime.
        </Notice>

        {apps.isPending && <LoadingSkeleton rows={7} />}
        {apps.isError && (
          <GlassCard>
            <ErrorState error={apps.error} onRetry={() => void apps.refetch()} />
          </GlassCard>
        )}

        {apps.data && (
          <>
            <div className="flex flex-wrap items-center gap-3">
              <SearchInput value={search} onChange={setSearch} label="Search applications" placeholder="Search by name or publisher" className="w-full max-w-sm" />
              <FilterDropdown label="Show" value={filter} onChange={setFilter} options={[{ value: 'all', label: 'All' }, { value: 'large', label: 'Over 500 MB' }, { value: 'protected', label: 'Drivers and security' }]} />
              <span className="num ml-auto text-sm text-muted">{rows.length} of {apps.data.length}</span>
            </div>
            <GlassCard className="p-0">
              <DataTable
                columns={columns}
                rows={rows}
                rowKey={(a) => a.id}
                caption="Installed applications"
                defaultSort={{ key: 'size', dir: 'desc' }}
                empty={<EmptyState icon={<AppWindow className="size-6" />} title="No applications found" description="Try a different search or filter." />}
              />
            </GlassCard>
          </>
        )}
      </div>
    </div>
  )
}

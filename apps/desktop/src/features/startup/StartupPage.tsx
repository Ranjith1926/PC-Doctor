import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { History, Rocket } from 'lucide-react'
import { useMemo, useState } from 'react'
import { EmptyState, ErrorState, LoadingSkeleton } from '@/components/feedback/States'
import { AppIcon } from '@/components/ui/AppIcon'
import { Button } from '@/components/ui/Button'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { FilterDropdown } from '@/components/ui/FilterDropdown'
import { GlassCard } from '@/components/ui/GlassCard'
import { Notice } from '@/components/ui/Notice'
import { PageHeader } from '@/components/ui/PageHeader'
import { SearchInput } from '@/components/ui/SearchInput'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { Switch } from '@/components/ui/Switch'
import { queryKeys } from '@/hooks/useEngine'
import { engine, isUnavailable } from '@/services/engineClient'
import { toast } from '@/stores/toastStore'
import type { StartupEntry } from '@shared/contracts'
import { formatDateTime } from '@/utils/format'

type Filter = 'all' | 'enabled' | 'disabled' | 'protected'

export default function StartupPage() {
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<Filter>('all')
  const [pending, setPending] = useState<{ entry: StartupEntry; enabled: boolean } | null>(null)
  const [restoreOpen, setRestoreOpen] = useState(false)

  const list = useQuery({ queryKey: queryKeys.startup, queryFn: engine.listStartup, retry: false })
  const snapshot = useQuery({ queryKey: queryKeys.startupSnapshot, queryFn: engine.startupSnapshotInfo, retry: false })

  const onResult = (entries: StartupEntry[]) => {
    queryClient.setQueryData(queryKeys.startup, entries)
    void queryClient.invalidateQueries({ queryKey: queryKeys.startupSnapshot })
  }
  const fail = (title: string) => (e: unknown) => toast[isUnavailable(e) ? 'warning' : 'danger'](title, e instanceof Error ? e.message : undefined)

  const toggle = useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) => engine.setStartupEnabled(id, enabled),
    onSuccess: (entries, v) => {
      onResult(entries)
      toast.success(v.enabled ? 'Startup app enabled' : 'Startup app disabled', 'Takes effect the next time you sign in.')
    },
    onError: fail('Could not change that startup item'),
    onSettled: () => setPending(null)
  })
  const restore = useMutation({
    mutationFn: engine.restoreStartupSnapshot,
    onSuccess: (entries) => {
      onResult(entries)
      toast.success('Previous configuration restored')
    },
    onError: fail('Could not restore the previous configuration'),
    onSettled: () => setRestoreOpen(false)
  })

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase()
    return (list.data ?? []).filter((e) => {
      if (q && !`${e.name} ${e.publisher}`.toLowerCase().includes(q)) return false
      if (filter === 'enabled') return e.enabled
      if (filter === 'disabled') return !e.enabled
      if (filter === 'protected') return e.protected
      return true
    })
  }, [list.data, search, filter])

  const columns: Column<StartupEntry>[] = [
    {
      key: 'name',
      header: 'Application',
      sortValue: (e) => e.name.toLowerCase(),
      cell: (e) => (
        <div className="flex min-w-0 items-center gap-3">
          <AppIcon src={e.iconDataUrl} name={e.name} />
          <div className="min-w-0">
            <div className="truncate text-sm font-medium text-fg">{e.name}</div>
            <div className="selectable max-w-[34ch] truncate text-xs text-subtle" title={e.command}>{e.command}</div>
          </div>
        </div>
      )
    },
    { key: 'publisher', header: 'Publisher', sortValue: (e) => e.publisher.toLowerCase(), cell: (e) => <span className="text-sm text-muted">{e.publisher}</span> },
    {
      key: 'scope',
      header: 'For',
      sortValue: (e) => e.scope,
      cell: (e) => <StatusBadge tone="neutral">{e.scope === 'user' ? 'Just you' : e.scope === 'machine' ? 'All users' : 'Startup folder'}</StatusBadge>
    },
    {
      key: 'impact',
      header: 'Impact',
      cell: (e) => <span title="Windows does not report startup impact per app, so PC Doctor does not guess." className="text-xs text-subtle">{e.impact ?? 'Not measured'}</span>
    },
    {
      key: 'status',
      header: 'Status',
      align: 'right',
      sortValue: (e) => (e.enabled ? 0 : 1),
      cell: (e) => (
        <div className="flex items-center justify-end gap-3">
          {e.protected && <StatusBadge tone="info">Driver / security</StatusBadge>}
          <span className="w-8 text-right text-xs text-muted">{e.enabled ? 'On' : 'Off'}</span>
          <Switch checked={e.enabled} label={`${e.name} starts with Windows`} onCheckedChange={(on) => setPending({ entry: e, enabled: on })} />
        </div>
      )
    }
  ]

  const enabledCount = (list.data ?? []).filter((e) => e.enabled).length

  return (
    <div>
      <PageHeader
        title="Startup Apps"
        subtitle="Choose what starts with your computer. Turning an app off only stops it launching at sign-in. It stays installed."
        actions={
          <Button icon={<History className="size-4" aria-hidden />} disabled={!snapshot.data?.hasBackup} loading={restore.isPending} onClick={() => setRestoreOpen(true)}>
            Restore previous configuration
          </Button>
        }
      />

      {list.isPending && <LoadingSkeleton rows={6} />}
      {list.isError && (
        <GlassCard>
          <ErrorState error={list.error} onRetry={() => void list.refetch()} />
        </GlassCard>
      )}

      {list.data && (
        <div className="grid gap-4">
          <div className="flex flex-wrap items-center gap-3">
            <SearchInput value={search} onChange={setSearch} label="Search startup apps" placeholder="Search by name or publisher" className="w-full max-w-sm" />
            <FilterDropdown
              label="Show"
              value={filter}
              onChange={setFilter}
              options={[
                { value: 'all', label: 'All' },
                { value: 'enabled', label: 'Enabled' },
                { value: 'disabled', label: 'Disabled' },
                { value: 'protected', label: 'Drivers and security' }
              ]}
            />
            <span className="num ml-auto text-sm text-muted">{enabledCount} of {list.data.length} enabled</span>
          </div>
          {snapshot.data?.hasBackup && snapshot.data.takenAt && (
            <Notice>Your original configuration was saved on {formatDateTime(snapshot.data.takenAt)} before your first change, so you can always go back.</Notice>
          )}
          <GlassCard className="p-0">
            <DataTable
              columns={columns}
              rows={rows}
              rowKey={(e) => e.id}
              caption="Startup applications"
              defaultSort={{ key: 'status', dir: 'asc' }}
              empty={<EmptyState icon={<Rocket className="size-6" />} title={list.data.length === 0 ? 'No startup apps found' : 'No matches'} description={list.data.length === 0 ? 'Nothing is set to start with Windows.' : 'Try a different search or filter.'} />}
            />
          </GlassCard>
        </div>
      )}

      <ConfirmDialog
        open={!!pending}
        onOpenChange={(o) => !o && !toggle.isPending && setPending(null)}
        tone={pending?.entry.protected && !pending.enabled ? 'danger' : 'default'}
        title={pending ? `${pending.enabled ? 'Enable' : 'Disable'} ${pending.entry.name} at startup?` : ''}
        description={
          pending?.entry.protected && !pending.enabled
            ? 'This looks like a driver, security or VPN app. Disabling it can leave your PC less protected or break hardware features. Only continue if you are sure.'
            : pending?.enabled
              ? 'It will start automatically the next time you sign in.'
              : 'It will no longer start automatically. It stays installed and you can turn it back on here or in Task Manager.'
        }
        confirmLabel={pending?.enabled ? 'Enable' : 'Disable'}
        loading={toggle.isPending}
        onConfirm={() => pending && toggle.mutate({ id: pending.entry.id, enabled: pending.enabled })}
      />
      <ConfirmDialog
        open={restoreOpen}
        onOpenChange={(o) => !restore.isPending && setRestoreOpen(o)}
        title="Restore your original startup configuration?"
        description="Every startup item returns to the on/off state it had before your first change in PC Doctor."
        confirmLabel="Restore"
        loading={restore.isPending}
        onConfirm={() => restore.mutate()}
      />
    </div>
  )
}

import { zodResolver } from '@hookform/resolvers/zod'
import { ScanLine } from 'lucide-react'
import { useState } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { z } from 'zod'
import { EmptyState } from '@/components/feedback/States'
import { Button } from '@/components/ui/Button'
import { ProBadge } from '@/components/ui/ProBadge'
import { CardTitle, GlassCard } from '@/components/ui/GlassCard'
import { Notice } from '@/components/ui/Notice'
import { PageHeader } from '@/components/ui/PageHeader'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { Switch } from '@/components/ui/Switch'
import { engine } from '@/services/engineClient'
import { useScan } from '@/stores/scanStore'
import { useSettings } from '@/stores/settingsStore'
import { toast } from '@/stores/toastStore'
import { CLEANUP_GROUP_LABELS } from '@shared/constants'
import { formatDateTime } from '@/utils/format'

const schema = z
  .object({
    frequency: z.enum(['off', 'weekly', 'monthly']),
    weekday: z.number().int().min(0).max(6),
    monthDay: z.number().int().min(1, 'Choose a day from 1 to 28').max(28, 'Choose a day from 1 to 28'),
    time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use a time like 13:30'),
    groups: z.array(z.enum(['system', 'browser', 'developer'])),
    batteryAware: z.boolean()
  })
  .refine((v) => v.frequency === 'off' || v.groups.length > 0, { path: ['groups'], message: 'Choose at least one category to approve' })

type FormValues = z.infer<typeof schema>

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const APPROVABLE: FormValues['groups'] = ['system', 'browser', 'developer']
const field = 'glass selectable h-10 rounded-control px-3 text-sm text-fg outline-none focus:ring-2 focus:ring-[var(--ring)]'

export default function MaintenancePage() {
  const prefs = useSettings((s) => s.maintenance)
  const runs = useSettings((s) => s.maintenanceRuns)
  const setSettings = useSettings((s) => s.set)
  const scanStatus = useScan((s) => s.status)
  const startScan = useScan((s) => s.start)
  const [schedulerNote, setSchedulerNote] = useState<string | null>(null)

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { frequency: prefs.frequency, weekday: prefs.weekday, monthDay: prefs.monthDay, time: prefs.time, groups: prefs.groups.filter((g): g is FormValues['groups'][number] => g !== 'heavy'), batteryAware: prefs.batteryAware }
  })
  const { register, control, handleSubmit, watch, formState } = form
  const frequency = watch('frequency')

  const onSubmit = handleSubmit(async (values) => {
    setSettings({ maintenance: { ...values } })
    try {
      await engine.registerSchedule(values.frequency)
      toast.success('Schedule registered')
    } catch (e) {
      // Honest outcome: preferences are stored, but nothing will run automatically yet.
      setSchedulerNote(e instanceof Error ? e.message : 'The scheduler is not available.')
      toast.warning('Preferences saved', 'The scheduler is not connected yet, so nothing will run automatically.')
    }
  })

  return (
    <div>
      <PageHeader title="Auto Maintenance" badge={<ProBadge />} subtitle="Choose how often PC Doctor checks your PC and which cleanup categories you pre-approve. Anything outside your approved list always asks first." />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <GlassCard>
          <CardTitle title="Schedule and approvals" action={<StatusBadge tone="warning">Not scheduled</StatusBadge>} />
          <form onSubmit={onSubmit} className="grid gap-5" noValidate>
            <fieldset className="grid gap-2">
              <legend className="mb-1 text-sm font-medium text-fg">How often</legend>
              <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Maintenance frequency">
                {(['off', 'weekly', 'monthly'] as const).map((f) => (
                  <label key={f} className="glass has-[:checked]:border-primary has-[:checked]:bg-primary/14 flex cursor-pointer items-center gap-2 rounded-control px-4 py-2 text-sm capitalize text-fg has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-[var(--ring)]">
                    <input type="radio" value={f} className="sr-only" {...register('frequency')} />
                    {f}
                  </label>
                ))}
              </div>
            </fieldset>

            {frequency !== 'off' && (
              <div className="grid gap-4 sm:grid-cols-2">
                {frequency === 'weekly' ? (
                  <label className="grid gap-1.5 text-sm text-fg">Day of the week
                    <select className={field} {...register('weekday', { valueAsNumber: true })}>
                      {WEEKDAYS.map((d, i) => <option key={d} value={i}>{d}</option>)}
                    </select>
                  </label>
                ) : (
                  <label className="grid gap-1.5 text-sm text-fg">Day of the month
                    <input type="number" min={1} max={28} className={field} aria-invalid={!!formState.errors.monthDay} {...register('monthDay', { valueAsNumber: true })} />
                    {formState.errors.monthDay && <span role="alert" className="text-[13px] text-danger">{formState.errors.monthDay.message}</span>}
                  </label>
                )}
                <label className="grid gap-1.5 text-sm text-fg">Time
                  <input type="time" className={field} aria-invalid={!!formState.errors.time} {...register('time')} />
                  {formState.errors.time && <span role="alert" className="text-[13px] text-danger">{formState.errors.time.message}</span>}
                </label>
              </div>
            )}

            <fieldset className="grid gap-2" disabled={frequency === 'off'}>
              <legend className="mb-1 text-sm font-medium text-fg">Categories approved for automatic cleanup</legend>
              <Controller
                control={control}
                name="groups"
                render={({ field: f }) => (
                  <div className="grid gap-2">
                    {APPROVABLE.map((g) => (
                      <label key={g} className="flex cursor-pointer items-start gap-3 text-sm">
                        <input type="checkbox" className="check mt-0.5" checked={f.value.includes(g)} onChange={(e) => f.onChange(e.target.checked ? [...f.value, g] : f.value.filter((x) => x !== g))} />
                        <span><span className="font-medium text-fg">{CLEANUP_GROUP_LABELS[g].title}</span><span className="block text-[13px] text-muted">{CLEANUP_GROUP_LABELS[g].blurb}</span></span>
                      </label>
                    ))}
                  </div>
                )}
              />
              {formState.errors.groups && <span role="alert" className="text-[13px] text-danger">{formState.errors.groups.message}</span>}
              <p className="text-[13px] text-subtle">The Recycle Bin, large caches, startup apps and uninstalls are never part of automatic maintenance.</p>
            </fieldset>

            <div className="flex items-center justify-between gap-4 rounded-control border border-line px-4 py-3">
              <div>
                <div className="text-sm font-medium text-fg">Battery-aware</div>
                <div className="text-[13px] text-muted">Skip maintenance while on battery power.</div>
              </div>
              <Controller control={control} name="batteryAware" render={({ field: f }) => <Switch checked={f.value} onCheckedChange={f.onChange} label="Skip maintenance on battery power" />} />
            </div>

            <div className="flex justify-end"><Button type="submit" variant="primary" loading={formState.isSubmitting}>Save preferences</Button></div>
          </form>
          {schedulerNote && <Notice tone="warning" className="mt-4" title="Saved, but not scheduled">{schedulerNote}</Notice>}
        </GlassCard>

        <div className="grid content-start gap-4">
          <GlassCard>
            <CardTitle title="Status" />
            <dl className="grid gap-3 text-sm">
              <div className="flex justify-between"><dt className="text-muted">Automatic maintenance</dt><dd className="font-medium text-fg">Off (scheduler not connected)</dd></div>
              <div className="flex justify-between"><dt className="text-muted">Next scheduled run</dt><dd className="font-medium text-fg">—</dd></div>
              <div className="flex justify-between"><dt className="text-muted">Saved preference</dt><dd className="font-medium capitalize text-fg">{prefs.frequency}</dd></div>
            </dl>
            <Button className="mt-4 w-full" icon={<ScanLine className="size-4" aria-hidden />} loading={scanStatus === 'scanning'} onClick={() => void startScan('maintenance')}>Run a maintenance check now</Button>
            <p className="mt-2 text-[13px] text-subtle">A check measures your PC and records the result. It does not delete anything.</p>
          </GlassCard>

          <GlassCard>
            <CardTitle title="Maintenance history" />
            {runs.length === 0 ? (
              <EmptyState title="No maintenance runs yet" description="Checks you run from this page are listed here." className="py-6" />
            ) : (
              <ul className="divide-y divide-line">
                {runs.slice(0, 8).map((r) => (
                  <li key={r.id} className="flex items-center justify-between py-2.5 text-sm">
                    <span className="text-fg">Health check</span>
                    <span className="flex items-center gap-3"><span className="num text-muted">{r.score}/100</span><time className="text-xs text-subtle">{formatDateTime(r.timestamp)}</time></span>
                  </li>
                ))}
              </ul>
            )}
          </GlassCard>
        </div>
      </div>
    </div>
  )
}

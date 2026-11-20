import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CalendarClock, Crown, Monitor, Moon, Sun } from 'lucide-react'
import type { ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/Button'
import { CardTitle, GlassCard } from '@/components/ui/GlassCard'
import { Notice } from '@/components/ui/Notice'
import { PageHeader } from '@/components/ui/PageHeader'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { Switch } from '@/components/ui/Switch'
import { queryKeys, useAppInfo, useLicense, useSystemInfo } from '@/hooks/useEngine'
import { engine } from '@/services/engineClient'
import { useSettings, type ThemeChoice } from '@/stores/settingsStore'
import { toast } from '@/stores/toastStore'
import { APP_AUTHOR, CLEANUP_GROUP_LABELS } from '@shared/constants'
import type { CleanupGroup } from '@shared/contracts'
import { cn } from '@/utils/format'

const SECTIONS = ['General', 'Appearance', 'System monitoring', 'Cleanup preferences', 'Notifications', 'Automatic maintenance', 'Privacy and security', 'Licensing', 'Updates', 'About PC Doctor'] as const
const slug = (s: string) => `settings-${s.toLowerCase().replace(/[^a-z]+/g, '-')}`

function Row({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-6 border-t border-line py-3.5 first:border-0 first:pt-0 last:pb-0">
      <div className="min-w-0">
        <div className="text-sm font-medium text-fg">{title}</div>
        {description && <div className="text-[13px] text-muted">{description}</div>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  )
}

function Section({ name, children }: { name: (typeof SECTIONS)[number]; children: ReactNode }) {
  return (
    <GlassCard id={slug(name)} className="scroll-mt-4">
      <CardTitle title={name} />
      {children}
    </GlassCard>
  )
}

export default function SettingsPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const s = useSettings()
  const appInfo = useAppInfo()
  const system = useSystemInfo()
  const license = useLicense()

  const launch = useMutation({
    mutationFn: (enabled: boolean) => engine.setLaunchAtLogin(enabled),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.appInfo }),
    onError: (e) => toast.danger('Could not change that setting', e instanceof Error ? e.message : undefined)
  })
  const liveLaunch = useQuery({ queryKey: ['launch-at-login'], queryFn: async () => (await engine.appInfo()).launchAtLogin, retry: false })

  const themes: { value: ThemeChoice; label: string; icon: ReactNode }[] = [
    { value: 'dark', label: 'Dark', icon: <Moon className="size-5" aria-hidden /> },
    { value: 'light', label: 'Light', icon: <Sun className="size-5" aria-hidden /> },
    { value: 'system', label: 'Match system', icon: <Monitor className="size-5" aria-hidden /> }
  ]
  const toggleGroup = (g: CleanupGroup, on: boolean) =>
    s.set({ defaultCleanupGroups: on ? [...new Set([...s.defaultCleanupGroups, g])] : s.defaultCleanupGroups.filter((x) => x !== g) })

  return (
    <div>
      <PageHeader title="Settings" subtitle="Preferences are stored on this PC. PC Doctor has no account and sends nothing anywhere." />
      <div className="grid items-start gap-6 lg:grid-cols-[200px_minmax(0,1fr)]">
        <nav aria-label="Settings sections" className="sticky top-0 hidden lg:block">
          <ul className="space-y-0.5">
            {SECTIONS.map((name) => (
              <li key={name}>
                <button type="button" onClick={() => document.getElementById(slug(name))?.scrollIntoView({ behavior: 'smooth', block: 'start' })} className="w-full cursor-pointer rounded-control px-3 py-2 text-left text-sm text-muted hover:bg-line/60 hover:text-fg">
                  {name}
                </button>
              </li>
            ))}
          </ul>
        </nav>

        <div className="grid gap-4">
          <Section name="General">
            <Row title="Start PC Doctor when I sign in" description="Opens the app in the background-friendly way your OS provides.">
              <Switch checked={liveLaunch.data ?? false} disabled={liveLaunch.isError || launch.isPending} label="Start PC Doctor at sign-in" onCheckedChange={(v) => launch.mutate(v, { onSuccess: () => void liveLaunch.refetch() })} />
            </Row>
          </Section>

          <Section name="Appearance">
            <div role="radiogroup" aria-label="Theme" className="grid gap-3 sm:grid-cols-3">
              {themes.map((t) => (
                <label key={t.value} className={cn('glass flex cursor-pointer items-center gap-3 rounded-control px-4 py-3 text-sm text-fg has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-[var(--ring)]', s.theme === t.value && 'border-primary bg-primary/14')}>
                  <input type="radio" name="theme" className="sr-only" checked={s.theme === t.value} onChange={() => s.set({ theme: t.value })} />
                  <span className="text-primary">{t.icon}</span>
                  {t.label}
                </label>
              ))}
            </div>
          </Section>

          <Section name="System monitoring">
            <Row title="Live reading interval" description="How often CPU and memory are sampled. Slower uses less power.">
              <select aria-label="Live reading interval" value={s.metricsIntervalSec} onChange={(e) => s.set({ metricsIntervalSec: Number(e.target.value) as 2 | 5 | 10 })} className="glass h-10 cursor-pointer rounded-control px-3 text-sm text-fg outline-none focus:ring-2 focus:ring-[var(--ring)]">
                <option value={2}>Every 2 seconds</option>
                <option value={5}>Every 5 seconds</option>
                <option value={10}>Every 10 seconds</option>
              </select>
            </Row>
          </Section>

          <Section name="Cleanup preferences">
            <p className="mb-3 text-[13px] text-muted">Categories that start ticked after a scan. You still review and confirm every cleanup.</p>
            {(['system', 'browser', 'developer'] as CleanupGroup[]).map((g) => (
              <Row key={g} title={CLEANUP_GROUP_LABELS[g].title} description={CLEANUP_GROUP_LABELS[g].blurb}>
                <Switch checked={s.defaultCleanupGroups.includes(g)} onCheckedChange={(v) => toggleGroup(g, v)} label={`Pre-select ${CLEANUP_GROUP_LABELS[g].title}`} />
              </Row>
            ))}
            <Row title="Always preview and confirm" description="Required. PC Doctor never deletes without showing you first.">
              <StatusBadge tone="success">Always on</StatusBadge>
            </Row>
          </Section>

          <Section name="Notifications">
            <Row title="When a health scan finishes"><Switch checked={s.notifyScanComplete} onCheckedChange={(v) => s.set({ notifyScanComplete: v })} label="Notify when a scan finishes" /></Row>
            <Row title="When a cleanup finishes"><Switch checked={s.notifyCleanupComplete} onCheckedChange={(v) => s.set({ notifyCleanupComplete: v })} label="Notify when a cleanup finishes" /></Row>
          </Section>

          <Section name="Automatic maintenance">
            <Row title="Schedule and approved categories" description={`Currently: ${s.maintenance.frequency}`}>
              <Button icon={<CalendarClock className="size-4" aria-hidden />} onClick={() => navigate('/maintenance')}>Open Auto Maintenance</Button>
            </Row>
          </Section>

          <Section name="Privacy and security">
            <ul className="grid gap-2 text-sm text-muted">
              <li>• Everything stays on this PC. The app is blocked from contacting the internet by its content security policy.</li>
              <li>• No telemetry, analytics or crash uploads.</li>
              <li>• The interface cannot run commands or choose files to delete. It can only ask the engine for named actions.</li>
              <li>• Cleanup never touches Documents, Desktop, Downloads, Pictures, Videos, Music, OneDrive or project folders.</li>
            </ul>
          </Section>

          <Section name="Licensing">
            <Row title="Edition" description={license.data?.edition === 'pro' ? 'Pro edition is active on this PC.' : 'Free edition. Pro adds advanced cleanup, storage analyzer and automation.'}><Button icon={<Crown className="size-4" aria-hidden />} onClick={() => navigate('/licensing')}>Manage license</Button></Row>
          </Section>

          <Section name="Updates">
            <Notice title="Automatic updates are not enabled in this build">Signed installers and verified updates arrive with the release pipeline. Until then, install new versions manually.</Notice>
            <Row title="Installed version"><span className="num text-sm text-fg">{appInfo.data?.version ?? '—'}</span></Row>
          </Section>

          <Section name="About PC Doctor">
            <dl className="grid gap-2 text-sm">
              {[
                ['Created by', APP_AUTHOR],
                ['Version', appInfo.data?.version],
                ['Computer', system.data ? `${system.data.hostname} · ${system.data.platform} ${system.data.osRelease} · ${system.data.arch}` : undefined],
                ['Engine', appInfo.data?.engine.note],
                ['Electron / Chromium / Node', appInfo.data ? `${appInfo.data.electron} / ${appInfo.data.chrome} / ${appInfo.data.node}` : undefined]
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between gap-6"><dt className="text-muted">{k}</dt><dd className="selectable text-right text-fg">{v ?? '—'}</dd></div>
              ))}
            </dl>
          </Section>
        </div>
      </div>
    </div>
  )
}

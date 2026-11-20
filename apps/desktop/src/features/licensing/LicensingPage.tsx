import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Check, Crown, KeyRound, Laptop } from 'lucide-react'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { ErrorState } from '@/components/feedback/States'
import { Button } from '@/components/ui/Button'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { CardTitle, GlassCard } from '@/components/ui/GlassCard'
import { Notice } from '@/components/ui/Notice'
import { PageHeader } from '@/components/ui/PageHeader'
import { ProBadge } from '@/components/ui/ProBadge'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { queryKeys, useLicense, useSystemInfo } from '@/hooks/useEngine'
import { engine } from '@/services/engineClient'
import { toast } from '@/stores/toastStore'
import { cn, formatDate } from '@/utils/format'

const schema = z.object({
  key: z
    .string()
    .trim()
    .min(1, 'Paste your license key')
    .refine((v) => v.replace(/\s+/g, '').toUpperCase().startsWith('PCD-'), 'License keys start with PCD-')
})
type Values = z.infer<typeof schema>

const FREE = ['Basic system health', 'Basic cleanup with preview', 'Startup manager', 'Basic reports']
const PRO = ['Everything in Free', 'Advanced cleanup', 'Storage analyzer', 'Automated maintenance', 'Advanced reports', 'Optimization profiles', 'Premium support']

function Plan({ name, current, features, blurb }: { name: string; current: boolean; features: string[]; blurb: string }) {
  const isPro = name === 'Pro'
  return (
    <GlassCard strong={!current} className={cn('flex flex-col', !current && 'ring-1 ring-primary/40')}>
      <div className="flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-lg font-semibold text-fg">{isPro && <Crown className="size-5 text-warning" aria-hidden />}{name}</h2>
        {current ? <StatusBadge tone="success">Your edition</StatusBadge> : <StatusBadge tone="neutral">Not active</StatusBadge>}
      </div>
      <p className="mt-1 text-sm text-muted">{blurb}</p>
      <ul className="mt-4 grid gap-2">
        {features.map((f) => (
          <li key={f} className="flex items-start gap-2 text-sm text-fg">
            <Check className="mt-0.5 size-4 shrink-0 text-success" aria-hidden />
            <span className="flex-1">{f}</span>
            {isPro && f !== 'Everything in Free' && <ProBadge size="compact" />}
          </li>
        ))}
      </ul>
    </GlassCard>
  )
}

export default function LicensingPage() {
  const queryClient = useQueryClient()
  const system = useSystemInfo()
  const license = useLicense()
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [activateError, setActivateError] = useState<string | null>(null)
  const { register, handleSubmit, reset, formState } = useForm<Values>({ resolver: zodResolver(schema), defaultValues: { key: '' } })

  const refresh = (status: unknown) => queryClient.setQueryData(queryKeys.license, status)

  const activate = useMutation({
    mutationFn: (key: string) => engine.activateLicense(key),
    onSuccess: (status) => {
      refresh(status)
      reset()
      setActivateError(null)
      toast.success('PC Doctor Pro activated', 'Thank you for supporting PC Doctor.')
    },
    // Never pretend it worked: show exactly why the key was refused.
    onError: (e) => setActivateError(e instanceof Error ? e.message : 'The key could not be checked.')
  })
  const deactivate = useMutation({
    mutationFn: engine.deactivateLicense,
    onSuccess: (status) => {
      refresh(status)
      toast.info('License removed from this PC', 'You are back on the Free edition.')
    },
    onSettled: () => setConfirmOpen(false)
  })

  const isPro = license.data?.edition === 'pro'
  const onSubmit = handleSubmit(({ key }) => {
    setActivateError(null)
    activate.mutate(key)
  })

  return (
    <div>
      <PageHeader title="Licensing" subtitle="PC Doctor Free works fully offline. A Pro license key unlocks the advanced tools, and is checked on this PC without an internet connection." />
      {license.isError && (
        <GlassCard className="mb-4">
          <ErrorState error={license.error} onRetry={() => void license.refetch()} />
        </GlassCard>
      )}
      <div className="grid gap-4">
        <div className="grid gap-4 md:grid-cols-2">
          <Plan name="Free" current={!isPro} blurb="Everything you need to check and tidy your PC safely." features={FREE} />
          <Plan name="Pro" current={isPro} blurb="Deeper tools and automation for people who maintain PCs often." features={PRO} />
        </div>

        {license.data?.note && <Notice tone="warning" title="License problem">{license.data.note}</Notice>}

        <div className="grid gap-4 lg:grid-cols-2">
          <GlassCard>
            {isPro ? (
              <>
                <CardTitle title="Pro is active" hint="This license is stored on this PC" action={<ProBadge alwaysShow />} />
                <p className="text-sm text-muted">Key id <span className="num selectable text-fg">{license.data?.keyId}</span>. Quote it if you ever contact support. Never share the full key.</p>
                <Button className="mt-4" variant="secondary" onClick={() => setConfirmOpen(true)}>Remove license from this PC</Button>
              </>
            ) : (
              <>
                <CardTitle title="Activate a license" hint="Paste the key you were given. It starts with PCD-" />
                <form onSubmit={onSubmit} className="grid gap-3" noValidate>
                  <label className="grid gap-1.5 text-sm text-fg">License key
                    <span className="glass flex items-start rounded-control px-3 py-2 focus-within:ring-2 focus-within:ring-[var(--ring)]">
                      <KeyRound className="mr-2 mt-0.5 size-4 shrink-0 text-subtle" aria-hidden />
                      <textarea rows={3} autoComplete="off" spellCheck={false} placeholder="PCD-XXXXXX-XXXXXX-…" aria-invalid={!!formState.errors.key} className="selectable num w-full resize-none bg-transparent text-[13px] uppercase text-fg outline-none placeholder:text-subtle" {...register('key')} />
                    </span>
                    {formState.errors.key && <span role="alert" className="text-[13px] text-danger">{formState.errors.key.message}</span>}
                  </label>
                  <Button type="submit" variant="primary" loading={activate.isPending}>Activate</Button>
                </form>
                {activateError && <Notice tone="danger" className="mt-4" title="Not activated">{activateError}</Notice>}
              </>
            )}
          </GlassCard>

          <GlassCard>
            <CardTitle title="Status" />
            <dl className="grid gap-3 text-sm">
              <div className="flex justify-between"><dt className="text-muted">Edition</dt><dd className="font-medium text-fg">{isPro ? 'Pro' : 'Free'}</dd></div>
              <div className="flex justify-between"><dt className="text-muted">Expires</dt><dd className="font-medium text-fg">{!isPro ? '—' : license.data?.expiresAt ? formatDate(license.data.expiresAt) : 'Never'}</dd></div>
              <div className="flex justify-between"><dt className="text-muted">Activated</dt><dd className="font-medium text-fg">{license.data?.activatedAt ? formatDate(license.data.activatedAt) : '—'}</dd></div>
              <div className="flex justify-between"><dt className="text-muted">Subscription</dt><dd className="font-medium text-fg">{isPro ? 'Offline key' : 'None'}</dd></div>
              <div className="flex items-center justify-between"><dt className="flex items-center gap-2 text-muted"><Laptop className="size-4" aria-hidden />This device</dt><dd className="selectable font-medium text-fg">{system.data ? `${system.data.hostname} (${system.data.platform})` : '—'}</dd></div>
            </dl>
            {!isPro && (
              <>
                <Button className="mt-5 w-full" variant="primary" icon={<Crown className="size-4" aria-hidden />} disabled title="Purchasing is not connected yet.">Upgrade to Pro</Button>
                <p className="mt-2 text-[13px] text-subtle">Online purchase and trials need the licensing service, which is not part of this build. No payment is taken here.</p>
              </>
            )}
            {isPro && <p className="mt-4 text-[13px] text-subtle">Offline keys are not tied to one device. Per-device activation arrives with the licensing service.</p>}
          </GlassCard>
        </div>
      </div>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={(o) => !deactivate.isPending && setConfirmOpen(o)}
        title="Remove the license from this PC?"
        description="PC Doctor returns to the Free edition. You can activate the same key again later."
        confirmLabel="Remove license"
        loading={deactivate.isPending}
        onConfirm={() => deactivate.mutate()}
      />
    </div>
  )
}

import { ArrowRight, Sparkles } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import type { Recommendation } from '@shared/contracts'
import { GlassCard } from '../ui/GlassCard'
import { StatusBadge, severityLabel, severityTone } from '../ui/StatusBadge'

const routes: Record<NonNullable<Recommendation['action']>, { to: string | null; label: string }> = {
  cleanup: { to: '/cleanup', label: 'Open Smart Cleanup' },
  startup: { to: '/startup', label: 'Review startup apps' },
  performance: { to: '/performance', label: 'See what is using resources' },
  storage: { to: '/storage', label: 'Open Storage' },
  applications: { to: '/applications', label: 'Review applications' },
  restart: { to: null, label: 'Restart when convenient' }
}

export function RecommendationCard({ rec }: { rec: Recommendation }) {
  const navigate = useNavigate()
  const route = rec.action ? routes[rec.action] : null
  return (
    <GlassCard className="flex items-start gap-3 p-4">
      <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg bg-primary/12 text-primary" aria-hidden>
        <Sparkles className="size-4" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-sm font-semibold text-fg">{rec.title}</h3>
          <StatusBadge tone={severityTone[rec.severity]}>{severityLabel[rec.severity]}</StatusBadge>
        </div>
        <p className="mt-1 text-[13px] text-muted">{rec.detail}</p>
        {route &&
          (route.to ? (
            <button type="button" onClick={() => navigate(route.to as string)} className="mt-2 inline-flex cursor-pointer items-center gap-1 text-[13px] font-medium text-primary hover:underline">
              {route.label}
              <ArrowRight className="size-3.5" aria-hidden />
            </button>
          ) : (
            <span className="mt-2 inline-block text-[13px] font-medium text-subtle">{route.label}</span>
          ))}
      </div>
    </GlassCard>
  )
}

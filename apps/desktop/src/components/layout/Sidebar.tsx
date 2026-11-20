import { motion } from 'framer-motion'
import { Crown, PanelLeftClose, PanelLeftOpen, Stethoscope } from 'lucide-react'
import { NavLink } from 'react-router-dom'
import { NAV_ITEMS } from '@/app/navigation'
import { useLicense } from '@/hooks/useEngine'
import { useUi } from '@/stores/uiStore'
import { cn } from '@/utils/format'
import { ProBadge } from '../ui/ProBadge'

export function Sidebar() {
  const collapsed = useUi((s) => s.sidebarCollapsed)
  const toggle = useUi((s) => s.toggleSidebar)
  const isPro = useLicense().data?.edition === 'pro'

  return (
    <aside
      aria-label="Main navigation"
      className={cn('glass-strong m-3 mr-0 flex shrink-0 flex-col rounded-card transition-[width] duration-300 ease-out', collapsed ? 'w-[72px]' : 'w-[248px]')}
    >
      {/* The top strip doubles as the macOS traffic-light safe area and a window drag handle. */}
      <div className="drag flex h-14 items-center gap-2.5 px-4 [html[data-platform=mac]_&]:pl-[78px]">
        <span className="no-drag grid size-8 shrink-0 place-items-center rounded-[10px] bg-gradient-to-br from-primary to-accent text-primary-fg shadow-[var(--glow)]" aria-hidden>
          <Stethoscope className="size-[18px]" />
        </span>
        {!collapsed && <span className="text-[15px] font-semibold tracking-tight text-fg">PC Doctor</span>}
      </div>

      <nav className="flex-1 space-y-0.5 overflow-y-auto px-2 py-1">
        {NAV_ITEMS.map(({ path, label, icon: Icon, pro }) => (
          <NavLink key={path} to={path} end={path === '/'} title={collapsed ? label : undefined} className="no-drag relative block rounded-control outline-offset-0">
            {({ isActive }) => (
              <span className={cn('relative flex h-10 items-center gap-3 rounded-control px-3 text-sm font-medium transition-colors duration-150', isActive ? 'text-fg' : 'text-muted hover:bg-line/60 hover:text-fg')}>
                {isActive && (
                  <motion.span
                    layoutId="nav-active"
                    transition={{ type: 'spring', stiffness: 520, damping: 40 }}
                    className="absolute inset-0 rounded-control bg-primary/16 ring-1 ring-primary/35"
                    aria-hidden
                  />
                )}
                <Icon className={cn('relative size-[18px] shrink-0', isActive && 'text-primary')} aria-hidden />
                {!collapsed && <span className="relative truncate">{label}</span>}
                {!collapsed && pro && <ProBadge size="compact" className="relative -mr-1 ml-auto" />}
                {collapsed && <span className="sr-only">{label}{pro && !isPro ? ' (Pro feature)' : ''}</span>}
              </span>
            )}
          </NavLink>
        ))}
      </nav>

      <div className="space-y-2 p-2">
        <NavLink to="/licensing" title={collapsed ? `${isPro ? 'Pro' : 'Free'} edition` : undefined} className="no-drag block rounded-control border border-line bg-gradient-to-br from-primary/14 to-accent/10 p-3 transition-colors hover:border-primary/40">
          <span className="flex items-center gap-2 text-[13px] font-semibold text-fg">
            <Crown className="size-4 shrink-0 text-warning" aria-hidden />
            {!collapsed && `${isPro ? 'Pro' : 'Free'} edition`}
            {collapsed && <span className="sr-only">{isPro ? 'Pro' : 'Free'} edition</span>}
          </span>
          {!collapsed && <span className="mt-0.5 block text-xs text-muted">{isPro ? 'License active' : 'See what Pro adds'}</span>}
        </NavLink>
        <button
          type="button"
          onClick={toggle}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          className="no-drag flex h-9 w-full cursor-pointer items-center gap-3 rounded-control px-3 text-[13px] text-subtle hover:bg-line/60 hover:text-fg"
        >
          {collapsed ? <PanelLeftOpen className="size-[18px]" aria-hidden /> : <PanelLeftClose className="size-[18px]" aria-hidden />}
          {!collapsed && 'Collapse'}
        </button>
      </div>
    </aside>
  )
}

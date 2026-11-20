import { Activity, AppWindow, BarChart3, CalendarClock, Gauge, HardDrive, LayoutDashboard, Rocket, Settings, Sparkles, type LucideIcon } from 'lucide-react'

export interface NavItem {
  path: string
  label: string
  title: string
  icon: LucideIcon
  /** Pro-edition feature. Shows a "PRO" badge. */
  pro?: boolean
}

export const NAV_ITEMS: NavItem[] = [
  { path: '/', label: 'Overview', title: 'Overview', icon: LayoutDashboard },
  { path: '/health-scan', label: 'Health Scan', title: 'Health Scan', icon: Activity },
  { path: '/cleanup', label: 'Smart Cleanup', title: 'Smart Cleanup', icon: Sparkles },
  { path: '/startup', label: 'Startup Apps', title: 'Startup Apps', icon: Rocket },
  { path: '/performance', label: 'Performance', title: 'Performance', icon: Gauge },
  { path: '/storage', label: 'Storage', title: 'Storage', icon: HardDrive, pro: true },
  { path: '/applications', label: 'Applications', title: 'Applications', icon: AppWindow },
  { path: '/maintenance', label: 'Auto Maintenance', title: 'Auto Maintenance', icon: CalendarClock, pro: true },
  { path: '/reports', label: 'Reports', title: 'Reports', icon: BarChart3 },
  { path: '/settings', label: 'Settings', title: 'Settings', icon: Settings }
]

export const titleFor = (pathname: string): string =>
  NAV_ITEMS.find((n) => n.path === pathname)?.title ?? (pathname === '/licensing' ? 'Licensing' : 'PC Doctor')

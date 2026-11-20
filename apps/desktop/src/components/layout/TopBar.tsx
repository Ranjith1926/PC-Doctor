import { Command, Moon, ScanLine, Sun } from 'lucide-react'
import { useLocation, useNavigate } from 'react-router-dom'
import { titleFor } from '@/app/navigation'
import { useResolvedTheme } from '@/app/theme'
import { useSystemInfo } from '@/hooks/useEngine'
import { useSettings } from '@/stores/settingsStore'
import { useUi } from '@/stores/uiStore'
import { Button } from '../ui/Button'

export function TopBar() {
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const theme = useResolvedTheme()
  const setSettings = useSettings((s) => s.set)
  const setCommandOpen = useUi((s) => s.setCommandOpen)
  const system = useSystemInfo()
  const isMac = /Mac/i.test(navigator.platform)

  return (
    <div
      className="drag flex h-14 shrink-0 items-center justify-between gap-4 pl-6"
      // The native Windows caption buttons sit over the right edge. Their width is the window width
      // minus the title-bar area, so reserve exactly that (never less than the normal 24px gutter).
      style={{ paddingRight: 'max(24px, calc(100vw - env(titlebar-area-width, 100vw) + 12px))' }}
    >
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold text-fg">{titleFor(pathname)}</div>
          {system.data && <div className="truncate text-xs text-subtle">{system.data.hostname}</div>}
        </div>
        <button
          type="button"
          onClick={() => setCommandOpen(true)}
          className="glass no-drag hidden h-9 cursor-pointer items-center gap-2 rounded-control px-3 text-[13px] text-muted hover:text-fg md:flex"
          aria-label="Open command palette"
        >
          <Command className="size-3.5" aria-hidden />
          Search or run a command
          <kbd className="num rounded border border-line px-1.5 py-0.5 text-[11px] text-subtle">{isMac ? '⌘K' : 'Ctrl K'}</kbd>
        </button>
        <Button size="sm" variant="primary" icon={<ScanLine className="size-4" aria-hidden />} onClick={() => navigate('/health-scan', { state: { autoStart: true } })}>
          Quick Scan
        </Button>
        <Button
          size="sm"
          variant="ghost"
          aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
          onClick={() => setSettings({ theme: theme === 'dark' ? 'light' : 'dark' })}
          className="w-8 px-0"
        >
          {theme === 'dark' ? <Sun className="size-4" aria-hidden /> : <Moon className="size-4" aria-hidden />}
        </Button>
      </div>
    </div>
  )
}

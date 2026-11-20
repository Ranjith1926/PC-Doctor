import { Command } from 'cmdk'
import { Moon, ScanLine, Sun } from 'lucide-react'
import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { NAV_ITEMS } from '@/app/navigation'
import { useResolvedTheme } from '@/app/theme'
import { useSettings } from '@/stores/settingsStore'
import { useUi } from '@/stores/uiStore'

const item = 'flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-fg aria-selected:bg-primary/16'

export function CommandPalette() {
  const open = useUi((s) => s.commandOpen)
  const setOpen = useUi((s) => s.setCommandOpen)
  const navigate = useNavigate()
  const theme = useResolvedTheme()
  const setSettings = useSettings((s) => s.set)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setOpen(!useUi.getState().commandOpen)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [setOpen])

  const run = (fn: () => void) => () => {
    setOpen(false)
    fn()
  }

  return (
    <Command.Dialog
      open={open}
      onOpenChange={setOpen}
      label="Command palette"
      overlayClassName="fixed inset-0 z-40 bg-black/50 backdrop-blur-[3px]"
      contentClassName="glass-strong fixed left-1/2 top-[18%] z-50 w-[min(560px,calc(100vw-48px))] -translate-x-1/2 overflow-hidden rounded-card"
    >
      <Command.Input placeholder="Go to a page or run an action…" className="selectable h-12 w-full border-b border-line bg-transparent px-4 text-[15px] text-fg outline-none placeholder:text-subtle" />
      <Command.List className="max-h-[320px] overflow-y-auto p-2">
        <Command.Empty className="px-3 py-6 text-center text-sm text-muted">Nothing matches that.</Command.Empty>
        <Command.Group heading="Actions" className="[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:text-subtle">
          <Command.Item className={item} onSelect={run(() => navigate('/health-scan', { state: { autoStart: true } }))}>
            <ScanLine className="size-4 text-primary" aria-hidden /> Run a quick health scan
          </Command.Item>
          <Command.Item className={item} onSelect={run(() => setSettings({ theme: theme === 'dark' ? 'light' : 'dark' }))}>
            {theme === 'dark' ? <Sun className="size-4 text-primary" aria-hidden /> : <Moon className="size-4 text-primary" aria-hidden />}
            Switch to {theme === 'dark' ? 'light' : 'dark'} theme
          </Command.Item>
        </Command.Group>
        <Command.Group heading="Go to" className="[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:text-subtle">
          {NAV_ITEMS.map(({ path, label, icon: Icon }) => (
            <Command.Item key={path} value={`go ${label}`} className={item} onSelect={run(() => navigate(path))}>
              <Icon className="size-4 text-muted" aria-hidden /> {label}
            </Command.Item>
          ))}
          <Command.Item value="go licensing upgrade pro" className={item} onSelect={run(() => navigate('/licensing'))}>
            Licensing and upgrade
          </Command.Item>
        </Command.Group>
      </Command.List>
    </Command.Dialog>
  )
}

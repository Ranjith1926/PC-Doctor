import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { engine } from '@/services/engineClient'
import { useSettings } from '@/stores/settingsStore'

type Resolved = 'dark' | 'light'

const ThemeContext = createContext<Resolved>('dark')

export const useResolvedTheme = () => useContext(ThemeContext)

/** Applies the chosen theme (or the OS preference) to <html> and tells the main process so window controls match. */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const choice = useSettings((s) => s.theme)
  const [systemDark, setSystemDark] = useState(() => window.matchMedia('(prefers-color-scheme: dark)').matches)

  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = () => setSystemDark(mq.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  const resolved: Resolved = choice === 'system' ? (systemDark ? 'dark' : 'light') : choice

  useEffect(() => {
    document.documentElement.dataset.theme = resolved
    // Best effort: outside Electron there is no engine, and that is fine.
    engine.setTheme(resolved).catch(() => undefined)
  }, [resolved])

  return <ThemeContext.Provider value={resolved}>{children}</ThemeContext.Provider>
}

export interface ChartColors {
  primary: string
  accent: string
  success: string
  warning: string
  danger: string
  line: string
  subtle: string
  fg: string
}

/** SVG charts need concrete colours, so read the live CSS tokens whenever the theme changes. */
export function useChartColors(): ChartColors {
  const theme = useResolvedTheme()
  return useMemo(() => {
    const s = getComputedStyle(document.documentElement)
    const v = (name: string) => s.getPropertyValue(name).trim()
    return {
      primary: v('--primary'),
      accent: v('--accent'),
      success: v('--success'),
      warning: v('--warning'),
      danger: v('--danger'),
      line: v('--line-strong'),
      subtle: v('--fg-subtle'),
      fg: v('--fg')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- theme is the intentional trigger
  }, [theme])
}

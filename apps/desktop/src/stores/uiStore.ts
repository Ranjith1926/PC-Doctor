import type { LiveMetrics } from '@shared/contracts'
import { create } from 'zustand'

interface UiState {
  sidebarCollapsed: boolean
  commandOpen: boolean
  /** Rolling window of real live readings, kept across page changes so charts do not restart. */
  metricsHistory: LiveMetrics[]
  toggleSidebar: () => void
  setCommandOpen: (open: boolean) => void
  pushMetrics: (m: LiveMetrics) => void
}

const MAX_POINTS = 90

export const useUi = create<UiState>((set) => ({
  sidebarCollapsed: false,
  commandOpen: false,
  metricsHistory: [],
  toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
  setCommandOpen: (open) => set({ commandOpen: open }),
  pushMetrics: (m) => set((s) => ({ metricsHistory: [...s.metricsHistory, m].slice(-MAX_POINTS) }))
}))

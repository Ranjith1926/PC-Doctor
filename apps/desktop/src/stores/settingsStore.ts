import type { CleanupGroup, HealthScanResult } from '@shared/contracts'
import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type ThemeChoice = 'dark' | 'light' | 'system'
export type MaintenanceFrequency = 'off' | 'weekly' | 'monthly'

export interface MaintenancePrefs {
  frequency: MaintenanceFrequency
  weekday: number
  monthDay: number
  time: string
  groups: CleanupGroup[]
  batteryAware: boolean
}

export interface MaintenanceRun {
  id: string
  timestamp: number
  kind: 'manual-check'
  score: number
}

interface SettingsState {
  theme: ThemeChoice
  metricsIntervalSec: 2 | 5 | 10
  defaultCleanupGroups: CleanupGroup[]
  notifyScanComplete: boolean
  notifyCleanupComplete: boolean
  maintenance: MaintenancePrefs
  maintenanceRuns: MaintenanceRun[]
  /** Last completed scan, kept so the dashboard still has recommendations after a restart. */
  lastScan: HealthScanResult | null

  set: (patch: Partial<Omit<SettingsState, 'set' | 'addMaintenanceRun' | 'setLastScan'>>) => void
  addMaintenanceRun: (run: MaintenanceRun) => void
  setLastScan: (scan: HealthScanResult) => void
}

export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      theme: 'dark',
      metricsIntervalSec: 2,
      defaultCleanupGroups: ['system'],
      notifyScanComplete: true,
      notifyCleanupComplete: true,
      maintenance: { frequency: 'off', weekday: 1, monthDay: 1, time: '13:30', groups: ['system'], batteryAware: true },
      maintenanceRuns: [],
      lastScan: null,

      set: (patch) => set(patch),
      addMaintenanceRun: (run) => set((s) => ({ maintenanceRuns: [run, ...s.maintenanceRuns].slice(0, 50) })),
      setLastScan: (scan) => set({ lastScan: scan })
    }),
    { name: 'pc-doctor-settings', version: 1 }
  )
)

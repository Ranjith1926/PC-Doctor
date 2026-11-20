import type { ScanProgress } from '@shared/contracts'
import { create } from 'zustand'
import { queryClient } from '@/app/queryClient'
import { queryKeys } from '@/hooks/useEngine'
import { EngineError, engine } from '@/services/engineClient'
import { useSettings } from './settingsStore'
import { toast } from './toastStore'

export type ScanStatus = 'idle' | 'scanning' | 'done' | 'failed' | 'cancelled'

interface ScanState {
  status: ScanStatus
  progress: ScanProgress | null
  error: unknown
  cancelling: boolean
  start: (source?: 'scan' | 'maintenance') => Promise<void>
  cancel: () => Promise<void>
  reset: () => void
}

/**
 * Lives outside React so a running scan survives page changes. It is the only place that
 * starts a scan, which keeps "scan already running" handling in one spot.
 */
export const useScan = create<ScanState>((set, get) => ({
  status: 'idle',
  progress: null,
  error: null,
  cancelling: false,

  start: async (source = 'scan') => {
    if (get().status === 'scanning') return
    set({ status: 'scanning', progress: null, error: null, cancelling: false })
    const unsubscribe = engine.onScanProgress((progress) => set({ progress }))
    try {
      const result = await engine.runHealthScan()
      const settings = useSettings.getState()
      settings.setLastScan(result)
      if (source === 'maintenance') {
        settings.addMaintenanceRun({ id: result.id, timestamp: result.finishedAt, kind: 'manual-check', score: result.score })
      }
      await queryClient.invalidateQueries({ queryKey: queryKeys.history })
      set({ status: 'done' })
      if (settings.notifyScanComplete) toast.success(`Scan complete: ${result.score}/100`, result.grade)
    } catch (error) {
      if (error instanceof EngineError && error.code === 'cancelled') {
        set({ status: 'cancelled' })
      } else {
        set({ status: 'failed', error })
      }
    } finally {
      unsubscribe()
      set({ cancelling: false })
    }
  },

  cancel: async () => {
    if (get().status !== 'scanning') return
    set({ cancelling: true })
    await engine.cancelHealthScan().catch(() => undefined)
  },

  reset: () => set({ status: 'idle', progress: null, error: null })
}))

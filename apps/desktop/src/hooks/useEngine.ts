import { useQuery } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { engine } from '@/services/engineClient'
import { useSettings } from '@/stores/settingsStore'
import { useUi } from '@/stores/uiStore'

export const queryKeys = {
  systemInfo: ['system-info'],
  appInfo: ['app-info'],
  processes: ['processes'],
  history: ['health-history'],
  cleanupHistory: ['cleanup-history'],
  cleanupScan: ['cleanup-scan'],
  startup: ['startup'],
  startupSnapshot: ['startup-snapshot'],
  apps: ['apps'],
  license: ['license']
} as const

export const useLicense = () => useQuery({ queryKey: queryKeys.license, queryFn: engine.license, staleTime: 30_000, retry: false })

export const useSystemInfo = () => useQuery({ queryKey: queryKeys.systemInfo, queryFn: engine.systemInfo, staleTime: Infinity, retry: false })
export const useAppInfo = () => useQuery({ queryKey: queryKeys.appInfo, queryFn: engine.appInfo, staleTime: Infinity, retry: false })
export const useHealthHistory = () => useQuery({ queryKey: queryKeys.history, queryFn: engine.healthHistory, retry: false })
export const useCleanupHistory = () => useQuery({ queryKey: queryKeys.cleanupHistory, queryFn: engine.cleanupHistory, retry: false })
export const useTopProcesses = () =>
  useQuery({ queryKey: queryKeys.processes, queryFn: engine.topProcesses, refetchInterval: 8000, retry: false })

/** Live readings: polled at the user's chosen interval and appended to the shared rolling history. */
export function useLiveMetrics() {
  const interval = useSettings((s) => s.metricsIntervalSec)
  const pushMetrics = useUi((s) => s.pushMetrics)
  const query = useQuery({
    queryKey: ['metrics'],
    queryFn: engine.metrics,
    refetchInterval: interval * 1000,
    refetchIntervalInBackground: false,
    retry: false
  })
  useEffect(() => {
    if (query.data) pushMetrics(query.data)
  }, [query.data, pushMetrics])
  return query
}

/** Battery through the Chromium Battery Status API. Returns null where the hardware or platform has none. */
export function useBattery(): { level: number; charging: boolean } | null {
  const [battery, setBattery] = useState<{ level: number; charging: boolean } | null>(null)
  useEffect(() => {
    let cancelled = false
    let manager: BatteryManager | null = null
    const update = () => {
      if (manager && !cancelled) setBattery({ level: Math.round(manager.level * 100), charging: manager.charging })
    }
    navigator
      .getBattery?.()
      .then((m) => {
        // Desktop machines without a battery report a constant 100% and "charging". Treat that as "no battery".
        if (m.level === 1 && m.charging && m.chargingTime === 0 && m.dischargingTime === Infinity) return
        manager = m
        update()
        m.addEventListener('levelchange', update)
        m.addEventListener('chargingchange', update)
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
      manager?.removeEventListener('levelchange', update)
      manager?.removeEventListener('chargingchange', update)
    }
  }, [])
  return battery
}

export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches)
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    const onChange = () => setReduced(mq.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])
  return reduced
}

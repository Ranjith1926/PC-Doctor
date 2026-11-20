import { BrowserWindow, app } from 'electron'
import type { AppInfo, Result, ScanProgress } from '../../../src/shared/contracts'
import { listApps, uninstallApp } from './apps'
import { runCleanup, scanCleanup } from './cleanup'
import { runHealthScan } from './health'
import { createLicenseStore } from './licenseStore'
import { getMetrics, getSystemInfo, getTopProcesses } from './metrics'
import { buildReportHtml, exportReport } from './report'
import { getSnapshotInfo, listStartup, restoreSnapshot, setStartupEnabled } from './startup'
import { analyzeFolder } from './storage'
import { createStore } from './store'
import { fail, guard, ok } from './util'

/**
 * Interim local engine. Every method returns a typed Result and none accepts a command or a path
 * to act on. It is the seam where the C# / .NET engine (named pipe / Unix socket) will plug in.
 */
export function createEngine(getWindow: () => BrowserWindow | null) {
  const store = createStore(app.getPath('userData'))
  const licenseStore = createLicenseStore(app.getPath('userData'))
  let scanCancelled = false
  let scanning = false

  return {
    async getAppInfo(): Promise<Result<AppInfo>> {
      return ok({
        name: app.getName(),
        version: app.getVersion(),
        electron: process.versions.electron,
        chrome: process.versions.chrome,
        node: process.versions.node,
        engine: { kind: 'interim-ts', note: 'Built-in TypeScript engine. The .NET engine replaces it behind the same contract.' },
        launchAtLogin: app.getLoginItemSettings().openAtLogin
      })
    },
    getSystemInfo: () => guard(async () => getSystemInfo()),
    getMetrics: () => guard(getMetrics),
    getTopProcesses: () => guard(() => getTopProcesses()),

    async runHealthScan(onProgress: (p: ScanProgress) => void) {
      if (scanning) return fail('error', 'A scan is already running.')
      scanning = true
      scanCancelled = false
      try {
        return await runHealthScan(store, onProgress, () => scanCancelled)
      } catch (error) {
        return fail('error', error instanceof Error ? error.message : String(error))
      } finally {
        scanning = false
      }
    },
    async cancelHealthScan() {
      scanCancelled = true
      return ok(null)
    },
    getHealthHistory: () => guard(() => store.snapshots()),

    scanCleanup: () => guard(scanCleanup),
    runCleanup: (ids: string[]) => guard(() => runCleanup(ids, store)),
    getCleanupHistory: () => guard(() => store.cleanups()),

    listStartup,
    setStartupEnabled,
    getStartupSnapshotInfo: () => guard(getSnapshotInfo),
    restoreStartupSnapshot: restoreSnapshot,

    listApps,
    uninstallApp,

    analyzeFolder: (target: 'home' | 'choose') => analyzeFolder(target, getWindow()),

    async exportReport(format: 'html' | 'pdf') {
      try {
        const html = buildReportHtml(getSystemInfo(), await store.snapshots(), await store.cleanups())
        return await exportReport(format, html, getWindow())
      } catch (error) {
        return fail('error', error instanceof Error ? error.message : String(error))
      }
    },

    async setLaunchAtLogin(enabled: boolean): Promise<Result<boolean>> {
      app.setLoginItemSettings({ openAtLogin: enabled })
      return ok(app.getLoginItemSettings().openAtLogin)
    },

    async setTheme(theme: 'dark' | 'light'): Promise<Result<null>> {
      const win = getWindow()
      if (win && process.platform === 'win32') {
        win.setTitleBarOverlay({ color: '#00000000', symbolColor: theme === 'dark' ? '#B6C2DE' : '#33405E', height: 44 })
      }
      return ok(null)
    },

    async registerSchedule(): Promise<Result<null>> {
      return fail('unavailable', 'Scheduled maintenance is not connected yet. It arrives with the engine scheduler (Task Scheduler on Windows, LaunchAgent on macOS). Your preferences are saved.')
    },

    getLicense: () => guard(() => licenseStore.status()),
    activateLicense: (key: string) => licenseStore.activate(key),
    deactivateLicense: () => guard(() => licenseStore.deactivate())
  }
}

export type Engine = ReturnType<typeof createEngine>

import { contextBridge, ipcRenderer } from 'electron'
import { IPC, type EngineApi, type ScanProgress } from '../../src/shared/contracts'

/**
 * The only surface the renderer gets. Every entry is one whitelisted channel with typed arguments.
 * No generic invoke/send is exposed, and no Node or Electron object crosses the bridge.
 */
const api: EngineApi = {
  getAppInfo: () => ipcRenderer.invoke(IPC.getAppInfo),
  getSystemInfo: () => ipcRenderer.invoke(IPC.getSystemInfo),
  getMetrics: () => ipcRenderer.invoke(IPC.getMetrics),
  getTopProcesses: () => ipcRenderer.invoke(IPC.getTopProcesses),
  runHealthScan: () => ipcRenderer.invoke(IPC.runHealthScan),
  cancelHealthScan: () => ipcRenderer.invoke(IPC.cancelHealthScan),
  getHealthHistory: () => ipcRenderer.invoke(IPC.getHealthHistory),
  onScanProgress: (listener) => {
    const wrapped = (_event: unknown, progress: ScanProgress) => listener(progress)
    ipcRenderer.on(IPC.scanProgress, wrapped)
    return () => ipcRenderer.removeListener(IPC.scanProgress, wrapped)
  },
  scanCleanup: () => ipcRenderer.invoke(IPC.scanCleanup),
  runCleanup: (ids) => ipcRenderer.invoke(IPC.runCleanup, ids),
  getCleanupHistory: () => ipcRenderer.invoke(IPC.getCleanupHistory),
  listStartup: () => ipcRenderer.invoke(IPC.listStartup),
  setStartupEnabled: (id, enabled) => ipcRenderer.invoke(IPC.setStartupEnabled, id, enabled),
  getStartupSnapshotInfo: () => ipcRenderer.invoke(IPC.getStartupSnapshotInfo),
  restoreStartupSnapshot: () => ipcRenderer.invoke(IPC.restoreStartupSnapshot),
  listApps: () => ipcRenderer.invoke(IPC.listApps),
  uninstallApp: (id) => ipcRenderer.invoke(IPC.uninstallApp, id),
  analyzeFolder: (target) => ipcRenderer.invoke(IPC.analyzeFolder, target),
  exportReport: (format) => ipcRenderer.invoke(IPC.exportReport, format),
  setLaunchAtLogin: (enabled) => ipcRenderer.invoke(IPC.setLaunchAtLogin, enabled),
  setTheme: (theme) => ipcRenderer.invoke(IPC.setTheme, theme),
  registerSchedule: (kind) => ipcRenderer.invoke(IPC.registerSchedule, kind),
  getLicense: () => ipcRenderer.invoke(IPC.getLicense),
  activateLicense: (key) => ipcRenderer.invoke(IPC.activateLicense, key),
  deactivateLicense: () => ipcRenderer.invoke(IPC.deactivateLicense)
}

contextBridge.exposeInMainWorld('pcDoctor', api)

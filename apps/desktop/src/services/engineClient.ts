import type { EngineApi, Result } from '@shared/contracts'

export type EngineErrorCode = Extract<Result<never>, { ok: false }>['code']

/** A failure reported by the engine (or by its absence). The message is always safe to show to the user. */
export class EngineError extends Error {
  readonly code: EngineErrorCode
  constructor(code: EngineErrorCode, message: string) {
    super(message)
    this.name = 'EngineError'
    this.code = code
  }
}

/** True when the failure is an honest "this is not available yet / here" rather than a malfunction. */
export const isUnavailable = (e: unknown): e is EngineError =>
  e instanceof EngineError && (e.code === 'unavailable' || e.code === 'unsupported' || e.code === 'denied')

async function call<T>(fn: (api: EngineApi) => Promise<Result<T>>): Promise<T> {
  const api = window.pcDoctor
  if (!api) {
    throw new EngineError('unavailable', 'The PC Doctor engine is not connected. Open the desktop app to see real system data.')
  }
  const result = await fn(api)
  if (!result.ok) throw new EngineError(result.code, result.message)
  return result.data
}

/** Typed service layer. React components only ever talk to the engine through this object. */
export const engine = {
  appInfo: () => call((e) => e.getAppInfo()),
  systemInfo: () => call((e) => e.getSystemInfo()),
  metrics: () => call((e) => e.getMetrics()),
  topProcesses: () => call((e) => e.getTopProcesses()),

  runHealthScan: () => call((e) => e.runHealthScan()),
  cancelHealthScan: () => call((e) => e.cancelHealthScan()),
  healthHistory: () => call((e) => e.getHealthHistory()),
  onScanProgress: (listener: Parameters<EngineApi['onScanProgress']>[0]) =>
    window.pcDoctor ? window.pcDoctor.onScanProgress(listener) : () => undefined,

  scanCleanup: () => call((e) => e.scanCleanup()),
  runCleanup: (ids: string[]) => call((e) => e.runCleanup(ids)),
  cleanupHistory: () => call((e) => e.getCleanupHistory()),

  listStartup: () => call((e) => e.listStartup()),
  setStartupEnabled: (id: string, enabled: boolean) => call((e) => e.setStartupEnabled(id, enabled)),
  startupSnapshotInfo: () => call((e) => e.getStartupSnapshotInfo()),
  restoreStartupSnapshot: () => call((e) => e.restoreStartupSnapshot()),

  listApps: () => call((e) => e.listApps()),
  uninstallApp: (id: string) => call((e) => e.uninstallApp(id)),

  analyzeFolder: (target: 'home' | 'choose') => call((e) => e.analyzeFolder(target)),

  exportReport: (format: 'html' | 'pdf') => call((e) => e.exportReport(format)),
  setLaunchAtLogin: (enabled: boolean) => call((e) => e.setLaunchAtLogin(enabled)),
  setTheme: (theme: 'dark' | 'light') => call((e) => e.setTheme(theme)),
  registerSchedule: (kind: 'weekly' | 'monthly' | 'off') => call((e) => e.registerSchedule(kind)),
  license: () => call((e) => e.getLicense()),
  activateLicense: (key: string) => call((e) => e.activateLicense(key)),
  deactivateLicense: () => call((e) => e.deactivateLicense())
}

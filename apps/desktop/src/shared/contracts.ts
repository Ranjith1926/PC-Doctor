/**
 * Typed contract between the Electron renderer and the local engine.
 *
 * The renderer never touches Node APIs. It can only call the operations listed in
 * `EngineApi`, each of which maps to one whitelisted IPC channel. No operation accepts a
 * command string, a file path to delete, or any other free-form instruction: the engine
 * decides what to touch, and the UI can only pick from identifiers the engine returned.
 *
 * Today these operations are served by the interim TypeScript engine in electron/main/engine.
 * They are shaped so the C# / .NET engine from SKILL.md can replace that implementation without
 * any renderer change.
 */

export type PlatformId = 'win32' | 'darwin' | 'linux'

/** Every engine call resolves to a Result, so the UI can show honest "unavailable" states. */
export type Result<T> =
  | { ok: true; data: T }
  | { ok: false; code: 'unavailable' | 'unsupported' | 'cancelled' | 'denied' | 'error'; message: string }

// ---------------------------------------------------------------- system ---

export interface SystemInfo {
  hostname: string
  userName: string
  platform: PlatformId
  osRelease: string
  arch: string
  cpuModel: string
  cpuCores: number
  totalMemBytes: number
}

export interface LiveMetrics {
  timestamp: number
  cpuPct: number
  ramUsedPct: number
  ramUsedBytes: number
  ramTotalBytes: number
  diskTotalBytes: number
  diskFreeBytes: number
  diskFreePct: number
  uptimeSec: number
  /** Only present when a real hardware reading exists. Never estimated. */
  tempC: number | null
}

export interface ProcessUsage {
  name: string
  memoryBytes: number
  instances: number
}

// ---------------------------------------------------------------- health ---

export type Severity = 'ok' | 'info' | 'warning' | 'critical'
export type HealthGrade = 'Excellent' | 'Good' | 'Fair' | 'Needs attention'

export type CategoryId = 'memory' | 'storage' | 'cpu' | 'startup' | 'junk' | 'diskType' | 'uptime'

export interface ScanCategoryResult {
  id: CategoryId
  label: string
  valueText: string
  points: number
  maxPoints: number
  severity: Severity
  /** Why the category scored as it did. Shown as evidence next to every score. */
  evidence: string
  recommendation: string | null
}

export interface Recommendation {
  id: string
  title: string
  detail: string
  severity: Severity
  /** Where in the app the user can act on it. */
  action: 'cleanup' | 'startup' | 'performance' | 'storage' | 'applications' | 'restart' | null
}

export interface HealthScanResult {
  id: string
  startedAt: number
  finishedAt: number
  score: number
  grade: HealthGrade
  categories: ScanCategoryResult[]
  recommendations: Recommendation[]
  metrics: LiveMetrics
  recoverableBytes: number
}

export interface ScanProgress {
  step: number
  totalSteps: number
  label: string
}

export interface HealthSnapshot {
  id: string
  timestamp: number
  score: number
  cpuPct: number
  ramUsedPct: number
  diskFreeBytes: number
  diskTotalBytes: number
  junkBytes: number
  startupEnabled: number
}

// --------------------------------------------------------------- cleanup ---

export type CleanupGroup = 'system' | 'browser' | 'developer' | 'heavy'

export interface CleanupCandidate {
  id: string
  group: CleanupGroup
  name: string
  description: string
  sizeBytes: number
  /** Applications that must be closed before this item can be cleaned. */
  requiresClosed: string[]
  /** Names from `requiresClosed` that are running right now. */
  runningApps: string[]
}

export interface CleanupScanResult {
  scannedAt: number
  candidates: CleanupCandidate[]
  totalBytes: number
  /** Locations the engine will never clean, shown to the user for transparency. */
  protectedLocations: string[]
}

export interface CleanupItemOutcome {
  id: string
  name: string
  status: 'done' | 'skipped-app-running' | 'skipped-empty' | 'error'
  freedBytes: number
  message: string | null
}

export interface CleanupRunResult {
  finishedAt: number
  freedBytes: number
  outcomes: CleanupItemOutcome[]
}

export interface CleanupHistoryEntry {
  id: string
  timestamp: number
  freedBytes: number
  itemNames: string[]
}

// --------------------------------------------------------------- startup ---

export interface StartupEntry {
  id: string
  name: string
  publisher: string
  command: string
  scope: 'user' | 'machine' | 'folder'
  enabled: boolean
  /** Windows exposes no per-app impact rating through the registry, so this is null unless measured. */
  impact: 'low' | 'medium' | 'high' | null
  /** True for drivers, security and VPN software. The UI asks for extra confirmation. */
  protected: boolean
  iconDataUrl: string | null
}

export interface StartupSnapshotInfo {
  hasBackup: boolean
  takenAt: number | null
}

// ------------------------------------------------------------- app list ---

export interface InstalledApp {
  id: string
  name: string
  version: string
  publisher: string
  installedOn: string | null
  sizeBytes: number | null
  iconDataUrl: string | null
  protected: boolean
}

// --------------------------------------------------------------- storage ---

export interface FolderAnalysis {
  root: string
  scannedAt: number
  totalBytes: number
  children: { name: string; sizeBytes: number; isDirectory: boolean }[]
  largeFiles: { path: string; sizeBytes: number; modifiedAt: number }[]
  /** True when the scan stopped early because of the time or entry budget. */
  truncated: boolean
}

export type FolderTarget = 'home' | 'choose'

// ------------------------------------------------------------ misc / app ---

export interface DiskTypeInfo {
  type: 'SSD' | 'HDD' | 'Unknown'
}

export interface ReportExportResult {
  filePath: string
}

export interface AppInfo {
  name: string
  version: string
  electron: string
  chrome: string
  node: string
  engine: { kind: 'interim-ts'; note: string }
  launchAtLogin: boolean
}

// --------------------------------------------------------------- license ---

export interface LicenseStatus {
  edition: 'free' | 'pro'
  /** Epoch ms when the key stops working, or null for a perpetual key (and for Free). */
  expiresAt: number | null
  /** Short public identifier of the key, safe to show and to quote to support. Null on Free. */
  keyId: string | null
  activatedAt: number | null
  /** Set when a stored key was found but is no longer valid (expired or revoked). */
  note: string | null
}

// ------------------------------------------------------------ the engine ---

export interface EngineApi {
  getAppInfo(): Promise<Result<AppInfo>>
  getSystemInfo(): Promise<Result<SystemInfo>>
  getMetrics(): Promise<Result<LiveMetrics>>
  getTopProcesses(): Promise<Result<ProcessUsage[]>>

  runHealthScan(): Promise<Result<HealthScanResult>>
  cancelHealthScan(): Promise<Result<null>>
  getHealthHistory(): Promise<Result<HealthSnapshot[]>>
  onScanProgress(listener: (p: ScanProgress) => void): () => void

  scanCleanup(): Promise<Result<CleanupScanResult>>
  /** Cleans only candidates the engine itself returned, identified by id. */
  runCleanup(candidateIds: string[]): Promise<Result<CleanupRunResult>>
  getCleanupHistory(): Promise<Result<CleanupHistoryEntry[]>>

  listStartup(): Promise<Result<StartupEntry[]>>
  setStartupEnabled(id: string, enabled: boolean): Promise<Result<StartupEntry[]>>
  getStartupSnapshotInfo(): Promise<Result<StartupSnapshotInfo>>
  restoreStartupSnapshot(): Promise<Result<StartupEntry[]>>

  listApps(): Promise<Result<InstalledApp[]>>
  uninstallApp(id: string): Promise<Result<null>>

  analyzeFolder(target: FolderTarget): Promise<Result<FolderAnalysis>>

  exportReport(format: 'html' | 'pdf'): Promise<Result<ReportExportResult>>
  setLaunchAtLogin(enabled: boolean): Promise<Result<boolean>>
  setTheme(theme: 'dark' | 'light'): Promise<Result<null>>
  registerSchedule(kind: 'weekly' | 'monthly' | 'off'): Promise<Result<null>>
  getLicense(): Promise<Result<LicenseStatus>>
  activateLicense(key: string): Promise<Result<LicenseStatus>>
  deactivateLicense(): Promise<Result<LicenseStatus>>
}

/** Whitelisted IPC channels. Anything not listed here is rejected by the main process. */
export const IPC = {
  getAppInfo: 'engine:getAppInfo',
  getSystemInfo: 'engine:getSystemInfo',
  getMetrics: 'engine:getMetrics',
  getTopProcesses: 'engine:getTopProcesses',
  runHealthScan: 'engine:runHealthScan',
  cancelHealthScan: 'engine:cancelHealthScan',
  getHealthHistory: 'engine:getHealthHistory',
  scanProgress: 'engine:scanProgress',
  scanCleanup: 'engine:scanCleanup',
  runCleanup: 'engine:runCleanup',
  getCleanupHistory: 'engine:getCleanupHistory',
  listStartup: 'engine:listStartup',
  setStartupEnabled: 'engine:setStartupEnabled',
  getStartupSnapshotInfo: 'engine:getStartupSnapshotInfo',
  restoreStartupSnapshot: 'engine:restoreStartupSnapshot',
  listApps: 'engine:listApps',
  uninstallApp: 'engine:uninstallApp',
  analyzeFolder: 'engine:analyzeFolder',
  exportReport: 'engine:exportReport',
  setLaunchAtLogin: 'engine:setLaunchAtLogin',
  setTheme: 'engine:setTheme',
  registerSchedule: 'engine:registerSchedule',
  getLicense: 'engine:getLicense',
  activateLicense: 'engine:activateLicense',
  deactivateLicense: 'engine:deactivateLicense'
} as const

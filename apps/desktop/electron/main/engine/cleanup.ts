import { randomUUID } from 'node:crypto'
import { readdir, lstat } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import type {
  CleanupCandidate,
  CleanupGroup,
  CleanupItemOutcome,
  CleanupRunResult,
  CleanupScanResult
} from '../../../src/shared/contracts'
import { getProcessNames } from './metrics'
import { PROTECTED_LOCATION_LABELS, pathSize, removeContents } from './safePath'
import type { Store } from './store'
import { platform } from './util'

interface Target {
  id: string
  group: CleanupGroup
  name: string
  description: string
  /** Process names (lowercase, without .exe) that must be closed first. */
  requiresClosed: string[]
  /** Folders whose CONTENTS are cleaned. Resolved at scan time. */
  roots: () => Promise<string[]> | string[]
  /** When set, only top-level files in each root matching this pattern are cleaned. */
  filePattern?: RegExp
}

/** Chrome / Edge keep one cache folder per browser profile. */
async function profileCacheDirs(userData: string, subfolders: string[]): Promise<string[]> {
  const out: string[] = []
  const profiles = await readdir(userData).catch(() => [] as string[])
  for (const profile of profiles) {
    if (profile !== 'Default' && !/^Profile \d+$/.test(profile)) continue
    for (const sub of subfolders) {
      const dir = join(userData, profile, sub)
      if (await lstat(dir).then((i) => i.isDirectory(), () => false)) out.push(dir)
    }
  }
  return out
}

function windowsTargets(): Target[] {
  const env = process.env
  const la = env.LOCALAPPDATA ?? ''
  const roaming = env.APPDATA ?? ''
  const sr = env.SystemRoot ?? 'C:\\Windows'
  const pd = env.ProgramData ?? 'C:\\ProgramData'
  const home = homedir()
  const chromeData = join(la, 'Google', 'Chrome', 'User Data')
  const edgeData = join(la, 'Microsoft', 'Edge', 'User Data')
  const cacheSubs = ['Cache', 'Code Cache', 'GPUCache']

  return [
    { id: 'sys-temp', group: 'system', name: 'Your temporary files', description: 'Temporary files left behind by apps you use.', requiresClosed: [], roots: () => [env.TEMP ?? join(la, 'Temp')] },
    { id: 'win-temp', group: 'system', name: 'Windows temporary files', description: 'System temp folder. Some files need administrator rights and are skipped.', requiresClosed: [], roots: () => [join(sr, 'Temp')] },
    { id: 'crash-reports', group: 'system', name: 'Error reports and crash dumps', description: 'Windows error reports and application crash dumps.', requiresClosed: [], roots: () => [join(pd, 'Microsoft', 'Windows', 'WER', 'ReportArchive'), join(pd, 'Microsoft', 'Windows', 'WER', 'ReportQueue'), join(la, 'CrashDumps'), join(sr, 'Minidump')] },
    { id: 'thumbnails', group: 'system', name: 'Thumbnail cache', description: 'Explorer rebuilds thumbnails automatically when needed.', requiresClosed: [], roots: () => [join(la, 'Microsoft', 'Windows', 'Explorer')], filePattern: /^thumbcache_.*\.db$/i },
    { id: 'chrome-cache', group: 'browser', name: 'Google Chrome cache', description: 'You stay signed in. Sites may load slower once.', requiresClosed: ['chrome'], roots: () => profileCacheDirs(chromeData, cacheSubs) },
    { id: 'edge-cache', group: 'browser', name: 'Microsoft Edge cache', description: 'You stay signed in. Sites may load slower once.', requiresClosed: ['msedge'], roots: () => profileCacheDirs(edgeData, cacheSubs) },
    { id: 'dev-npm', group: 'developer', name: 'npm cache', description: 'Re-downloaded automatically on the next install.', requiresClosed: ['node'], roots: () => [join(la, 'npm-cache', '_cacache'), join(roaming, 'npm-cache', '_cacache'), join(home, '.npm', '_cacache')] },
    { id: 'dev-yarn-pip', group: 'developer', name: 'Yarn and pip caches', description: 'Package download caches.', requiresClosed: [], roots: () => [join(la, 'Yarn', 'Cache'), join(la, 'pip', 'Cache')] },
    { id: 'dev-nuget-http', group: 'developer', name: 'NuGet HTTP and scratch caches', description: 'Not your installed packages. Rebuilt automatically.', requiresClosed: ['devenv', 'dotnet'], roots: () => [join(la, 'NuGet', 'v3-cache'), join(la, 'NuGet', 'http-cache'), join(la, 'NuGet', 'plugins-cache')] },
    { id: 'dev-gradle', group: 'developer', name: 'Gradle build caches', description: 'Rebuilt by the next Gradle build.', requiresClosed: ['studio64', 'java'], roots: () => [join(home, '.gradle', 'caches'), join(home, '.gradle', 'daemon')] },
    { id: 'heavy-nuget-packages', group: 'heavy', name: 'NuGet packages', description: 'Large. Re-downloaded on the next restore, which can take a while.', requiresClosed: ['devenv', 'dotnet'], roots: () => [join(home, '.nuget', 'packages')] }
  ]
}

function macTargets(): Target[] {
  const home = homedir()
  const lib = join(home, 'Library')
  const cacheSubs = ['Cache', 'Code Cache', 'GPUCache']
  return [
    { id: 'crash-reports', group: 'system', name: 'Crash reports', description: 'Application diagnostic reports.', requiresClosed: [], roots: () => [join(lib, 'Logs', 'DiagnosticReports')] },
    { id: 'chrome-cache', group: 'browser', name: 'Google Chrome cache', description: 'Needs Full Disk Access on some macOS versions.', requiresClosed: ['google chrome'], roots: () => profileCacheDirs(join(lib, 'Caches', 'Google', 'Chrome'), cacheSubs) },
    { id: 'dev-npm', group: 'developer', name: 'npm cache', description: 'Re-downloaded automatically on the next install.', requiresClosed: ['node'], roots: () => [join(home, '.npm', '_cacache')] },
    { id: 'dev-yarn-pip', group: 'developer', name: 'Yarn and pip caches', description: 'Package download caches.', requiresClosed: [], roots: () => [join(lib, 'Caches', 'Yarn'), join(lib, 'Caches', 'pip')] },
    { id: 'dev-gradle', group: 'developer', name: 'Gradle build caches', description: 'Rebuilt by the next Gradle build.', requiresClosed: ['java'], roots: () => [join(home, '.gradle', 'caches')] }
  ]
}

const targets = (): Target[] => (platform === 'win32' ? windowsTargets() : platform === 'darwin' ? macTargets() : [])

async function measure(t: Target): Promise<number> {
  const deadline = Date.now() + 25_000
  let total = 0
  for (const root of await t.roots()) {
    if (!t.filePattern) {
      total += await pathSize(root, deadline)
      continue
    }
    const names = await readdir(root).catch(() => [] as string[])
    for (const name of names) if (t.filePattern.test(name)) total += await pathSize(join(root, name), deadline)
  }
  return total
}

/** Read-only scan: sizes only, nothing is modified. */
export async function scanCleanup(): Promise<CleanupScanResult> {
  const running = new Set(await getProcessNames())
  const candidates: CleanupCandidate[] = []
  for (const t of targets()) {
    const sizeBytes = await measure(t)
    candidates.push({
      id: t.id,
      group: t.group,
      name: t.name,
      description: t.description,
      sizeBytes,
      requiresClosed: t.requiresClosed,
      runningApps: t.requiresClosed.filter((p) => running.has(p.replace(/\.exe$/, '')))
    })
  }
  return {
    scannedAt: Date.now(),
    candidates,
    totalBytes: candidates.reduce((sum, c) => sum + c.sizeBytes, 0),
    protectedLocations: PROTECTED_LOCATION_LABELS
  }
}

/**
 * Cleans only targets the engine defines, selected by id. The UI never supplies a path.
 * Every root passes through the central safe-path guard before anything is deleted.
 */
export async function runCleanup(ids: string[], store: Store): Promise<CleanupRunResult> {
  const known = new Map(targets().map((t) => [t.id, t]))
  const running = new Set(await getProcessNames())
  const outcomes: CleanupItemOutcome[] = []

  for (const id of new Set(ids)) {
    const t = known.get(id)
    if (!t) {
      outcomes.push({ id, name: id, status: 'error', freedBytes: 0, message: 'Unknown cleanup item.' })
      continue
    }
    if (t.requiresClosed.some((p) => running.has(p))) {
      outcomes.push({ id, name: t.name, status: 'skipped-app-running', freedBytes: 0, message: `Close ${t.requiresClosed.join(' / ')} and try again.` })
      continue
    }
    try {
      const roots = await t.roots()
      let freed = 0
      let skipped = 0
      for (const root of roots) {
        const r = await removeContents(root, roots, t.filePattern)
        freed += r.freedBytes
        skipped += r.skipped
      }
      outcomes.push({
        id,
        name: t.name,
        status: freed === 0 && skipped === 0 ? 'skipped-empty' : 'done',
        freedBytes: freed,
        message: skipped > 0 ? `${skipped} item(s) in use were left in place.` : null
      })
    } catch (error) {
      outcomes.push({ id, name: t.name, status: 'error', freedBytes: 0, message: error instanceof Error ? error.message : String(error) })
    }
  }

  const freedBytes = outcomes.reduce((s, o) => s + o.freedBytes, 0)
  const done = outcomes.filter((o) => o.status === 'done').map((o) => o.name)
  if (done.length > 0) await store.addCleanup({ id: randomUUID(), timestamp: Date.now(), freedBytes, itemNames: done })
  return { finishedAt: Date.now(), freedBytes, outcomes }
}

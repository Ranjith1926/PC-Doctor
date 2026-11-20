import { lstat, readdir, rm } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join, parse, resolve, sep } from 'node:path'

/** Folders that hold personal data. The engine never cleans anything inside or above them. */
export const PROTECTED_FOLDER_NAMES = [
  'documents',
  'desktop',
  'downloads',
  'pictures',
  'videos',
  'music',
  'movies',
  'onedrive',
  'source',
  'androidstudioprojects',
  'program files',
  'program files (x86)'
]

export const PROTECTED_LOCATION_LABELS = [
  'Documents, Desktop, Downloads, Pictures, Videos and Music',
  'OneDrive and cloud-synced folders',
  'Source code and project folders (for example "source")',
  'Program Files and installed applications',
  'Drive roots and your user profile folder itself'
]

const norm = (p: string) => (process.platform === 'win32' ? p.toLowerCase() : p)

/**
 * Central deletion guard. Port of the prototype's Test-SafeCleanPath, tightened:
 * refuses drive roots, the home folder or its parents, short paths and anything that has a
 * protected folder name anywhere in its path.
 */
export function isSafeCleanPath(input: string, home: string = homedir()): boolean {
  if (!input || !input.trim()) return false
  const full = resolve(input)
  if (parse(full).root === full) return false
  if (full.length < 15) return false

  const fullN = norm(full)
  const homeN = norm(resolve(home))
  // Never the home folder itself, nor one of its ancestors.
  if (fullN === homeN || homeN.startsWith(fullN + sep)) return false

  const segments = fullN.split(sep).filter(Boolean)
  return !segments.some((segment) => PROTECTED_FOLDER_NAMES.includes(segment))
}

function isInside(root: string, allowedRoots: string[]): boolean {
  const r = norm(resolve(root))
  return allowedRoots.some((allowed) => {
    const a = norm(resolve(allowed))
    return r === a || r.startsWith(a + sep)
  })
}

export async function pathSize(path: string, deadline: number): Promise<number> {
  let total = 0
  const stack = [path]
  while (stack.length > 0) {
    if (Date.now() > deadline) break
    const current = stack.pop() as string
    let info
    try {
      info = await lstat(current)
    } catch {
      continue
    }
    if (info.isSymbolicLink()) continue
    if (info.isFile()) {
      total += info.size
      continue
    }
    if (!info.isDirectory()) continue
    try {
      for (const entry of await readdir(current)) stack.push(join(current, entry))
    } catch {
      // Unreadable folder: skipped, not an error.
    }
  }
  return total
}

export interface RemoveOutcome {
  freedBytes: number
  skipped: number
}

/**
 * Deletes the CONTENTS of `root` (never `root` itself). `root` must pass the safety guard and
 * sit inside one of the engine's own allowed cache roots. Symbolic links are never followed.
 * Files in use are left in place and counted as skipped.
 */
export async function removeContents(
  root: string,
  allowedRoots: string[],
  filePattern?: RegExp
): Promise<RemoveOutcome> {
  const outcome: RemoveOutcome = { freedBytes: 0, skipped: 0 }
  if (!isSafeCleanPath(root) || !isInside(root, allowedRoots)) {
    throw new Error(`Refused unsafe cleanup location: ${root}`)
  }
  const rootInfo = await lstat(root).catch(() => null)
  if (!rootInfo || rootInfo.isSymbolicLink() || !rootInfo.isDirectory()) return outcome

  const deadline = Date.now() + 120_000
  for (const entry of await readdir(root)) {
    if (filePattern && !filePattern.test(entry)) continue
    const target = join(root, entry)
    if (!isSafeCleanPath(target)) {
      outcome.skipped++
      continue
    }
    const info = await lstat(target).catch(() => null)
    if (!info) continue
    if (info.isSymbolicLink()) {
      outcome.skipped++
      continue
    }
    const before = info.isFile() ? info.size : await pathSize(target, deadline)
    try {
      await rm(target, { recursive: true, force: true, maxRetries: 0 })
    } catch {
      outcome.skipped++
    }
    const stillThere = await lstat(target).catch(() => null)
    const after = stillThere ? (stillThere.isFile() ? stillThere.size : await pathSize(target, deadline)) : 0
    if (stillThere) outcome.skipped++
    outcome.freedBytes += Math.max(0, before - after)
  }
  return outcome
}

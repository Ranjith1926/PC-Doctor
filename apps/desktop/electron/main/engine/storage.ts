import { BrowserWindow, dialog } from 'electron'
import { lstat, readdir } from 'node:fs/promises'
import { homedir } from 'node:os'
import { basename, join } from 'node:path'
import type { FolderAnalysis, FolderTarget, Result } from '../../../src/shared/contracts'
import { fail, ok } from './util'

const BUDGET_MS = 25_000
const MAX_ENTRIES = 400_000
const LARGE_FILE_MIN = 10 * 1024 * 1024
const KEEP_LARGE = 25

/** Read-only folder analysis. The folder is chosen by the OS dialog in the main process, never typed in the UI. */
export async function analyzeFolder(target: FolderTarget, parent: BrowserWindow | null): Promise<Result<FolderAnalysis>> {
  let root: string
  if (target === 'home') {
    root = homedir()
  } else {
    const options = { title: 'Choose a folder to analyze', properties: ['openDirectory' as const] }
    const picked = parent ? await dialog.showOpenDialog(parent, options) : await dialog.showOpenDialog(options)
    if (picked.canceled || picked.filePaths.length === 0) return fail('cancelled', 'No folder was chosen.')
    root = picked.filePaths[0]
  }

  const deadline = Date.now() + BUDGET_MS
  let seen = 0
  let truncated = false
  const large: FolderAnalysis['largeFiles'] = []

  const consider = (path: string, size: number, mtimeMs: number) => {
    if (size < LARGE_FILE_MIN) return
    large.push({ path, sizeBytes: size, modifiedAt: mtimeMs })
    if (large.length > KEEP_LARGE * 4) {
      large.sort((a, b) => b.sizeBytes - a.sizeBytes)
      large.length = KEEP_LARGE
    }
  }

  async function sizeOf(start: string): Promise<number> {
    let total = 0
    const stack = [start]
    while (stack.length > 0) {
      if (Date.now() > deadline || seen > MAX_ENTRIES) {
        truncated = true
        break
      }
      const current = stack.pop() as string
      const info = await lstat(current).catch(() => null)
      if (!info || info.isSymbolicLink()) continue
      seen++
      if (info.isFile()) {
        total += info.size
        consider(current, info.size, info.mtimeMs)
      } else if (info.isDirectory()) {
        for (const name of await readdir(current).catch(() => [] as string[])) stack.push(join(current, name))
      }
    }
    return total
  }

  const children: FolderAnalysis['children'] = []
  for (const name of await readdir(root).catch(() => [] as string[])) {
    const full = join(root, name)
    const info = await lstat(full).catch(() => null)
    if (!info || info.isSymbolicLink()) continue
    children.push({ name: basename(full), sizeBytes: await sizeOf(full), isDirectory: info.isDirectory() })
    if (truncated) break
  }
  children.sort((a, b) => b.sizeBytes - a.sizeBytes)
  large.sort((a, b) => b.sizeBytes - a.sizeBytes)

  return ok({
    root,
    scannedAt: Date.now(),
    totalBytes: children.reduce((s, c) => s + c.sizeBytes, 0),
    children: children.slice(0, 40),
    largeFiles: large.slice(0, KEEP_LARGE),
    truncated
  })
}

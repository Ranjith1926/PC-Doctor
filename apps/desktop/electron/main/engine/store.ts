import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { CleanupHistoryEntry, HealthSnapshot } from '../../../src/shared/contracts'

interface StoreShape {
  snapshots: HealthSnapshot[]
  cleanups: CleanupHistoryEntry[]
}

const MAX_ENTRIES = 500

/**
 * Interim local history store (JSON). The commercial engine replaces this with SQLite
 * (HealthSnapshots, CleanupActions) behind the same operations.
 */
export function createStore(dir: string) {
  const file = join(dir, 'history.json')
  let cache: StoreShape | null = null

  async function load(): Promise<StoreShape> {
    if (cache) return cache
    try {
      const parsed = JSON.parse(await readFile(file, 'utf8')) as Partial<StoreShape>
      cache = { snapshots: parsed.snapshots ?? [], cleanups: parsed.cleanups ?? [] }
    } catch {
      cache = { snapshots: [], cleanups: [] }
    }
    return cache
  }

  async function save(): Promise<void> {
    if (!cache) return
    await mkdir(dir, { recursive: true })
    const tmp = `${file}.tmp`
    await writeFile(tmp, JSON.stringify(cache), 'utf8')
    await rename(tmp, file) // atomic replace so a crash never leaves a half-written file
  }

  return {
    async snapshots() {
      return (await load()).snapshots
    },
    async cleanups() {
      return (await load()).cleanups
    },
    async addSnapshot(s: HealthSnapshot) {
      const data = await load()
      data.snapshots.push(s)
      data.snapshots = data.snapshots.slice(-MAX_ENTRIES)
      await save()
    },
    async addCleanup(c: CleanupHistoryEntry) {
      const data = await load()
      data.cleanups.push(c)
      data.cleanups = data.cleanups.slice(-MAX_ENTRIES)
      await save()
    }
  }
}

export type Store = ReturnType<typeof createStore>

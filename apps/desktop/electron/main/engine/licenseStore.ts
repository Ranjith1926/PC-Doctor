import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { LicenseStatus, Result } from '../../../src/shared/contracts'
import { verifyLicenseKey } from './license'
import { fail, ok } from './util'

const FREE: LicenseStatus = { edition: 'free', expiresAt: null, keyId: null, activatedAt: null, note: null }

/** Keeps the activated key on this PC. The key is re-verified on every read, so editing the file proves nothing. */
export function createLicenseStore(dir: string, publicKeyB64?: string) {
  const file = join(dir, 'license.json')

  async function read(): Promise<{ key: string; activatedAt: number } | null> {
    try {
      const parsed = JSON.parse(await readFile(file, 'utf8')) as { key?: string; activatedAt?: number }
      return typeof parsed.key === 'string' ? { key: parsed.key, activatedAt: parsed.activatedAt ?? 0 } : null
    } catch {
      return null
    }
  }

  async function status(): Promise<LicenseStatus> {
    const saved = await read()
    if (!saved) return FREE
    const result = verifyLicenseKey(saved.key, { publicKeyB64 })
    if (!result.ok) return { ...FREE, note: `Your saved license is no longer valid. ${result.reason}` }
    return { edition: 'pro', expiresAt: result.license.expiresAt, keyId: result.license.keyId, activatedAt: saved.activatedAt, note: null }
  }

  return {
    status,
    async activate(key: string): Promise<Result<LicenseStatus>> {
      const result = verifyLicenseKey(key, { publicKeyB64 })
      if (!result.ok) return fail('error', result.reason)
      await mkdir(dir, { recursive: true })
      await writeFile(file, JSON.stringify({ key: key.replace(/\s+/g, '').toUpperCase(), activatedAt: Date.now() }), 'utf8')
      return ok(await status())
    },
    async deactivate(): Promise<LicenseStatus> {
      await rm(file, { force: true })
      return FREE
    }
  }
}

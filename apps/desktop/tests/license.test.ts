import { generateKeyPairSync } from 'node:crypto'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { verifyLicenseKey } from '../electron/main/engine/license'
import { createLicenseStore } from '../electron/main/engine/licenseStore'

// The issuing tool is plain JavaScript, so load it by path. Tests sign with a throwaway key pair,
// never with the real private key.
const toolPath = '../tools/license.mjs'
const { issueKey } = (await import(/* @vite-ignore */ toolPath)) as {
  issueKey: (pem: string, o?: { days?: number | null; now?: number }) => { key: string; keyId: string }
}

const pair = generateKeyPairSync('ed25519')
const pem = pair.privateKey.export({ type: 'pkcs8', format: 'pem' }) as string
const pub = pair.publicKey.export({ type: 'spki', format: 'der' }).toString('base64')
const DAY = 86_400_000

describe('license keys', () => {
  it('verifies a key issued by the tool', () => {
    const { key, keyId } = issueKey(pem)
    const r = verifyLicenseKey(key, { publicKeyB64: pub })
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.license.edition).toBe('pro')
      expect(r.license.expiresAt).toBeNull()
      expect(r.license.keyId).toBe(keyId)
    }
  })

  it('accepts pasted keys with stray spaces, line breaks and lower case', () => {
    const { key } = issueKey(pem)
    const messy = ` ${key.toLowerCase().replace(/-/g, '\n-')} `
    expect(verifyLicenseKey(messy, { publicKeyB64: pub }).ok).toBe(true)
  })

  it('rejects a key signed by a different private key', () => {
    const other = generateKeyPairSync('ed25519').privateKey.export({ type: 'pkcs8', format: 'pem' }) as string
    expect(verifyLicenseKey(issueKey(other).key, { publicKeyB64: pub }).ok).toBe(false)
  })

  it('rejects tampered, truncated and malformed keys', () => {
    const { key } = issueKey(pem)
    const flipped = key.slice(0, 10) + (key[10] === 'A' ? 'B' : 'A') + key.slice(11)
    expect(verifyLicenseKey(flipped, { publicKeyB64: pub }).ok).toBe(false)
    expect(verifyLicenseKey(key.slice(0, 40), { publicKeyB64: pub }).ok).toBe(false)
    expect(verifyLicenseKey('', { publicKeyB64: pub }).ok).toBe(false)
    expect(verifyLicenseKey('ABCD-1234-EFGH-5678', { publicKeyB64: pub }).ok).toBe(false)
    expect(verifyLicenseKey('PCD-!!!!', { publicKeyB64: pub }).ok).toBe(false)
  })

  it('honours expiry, including the last valid day', () => {
    const now = Date.UTC(2026, 5, 10, 12)
    const { key } = issueKey(pem, { days: 30, now })
    expect(verifyLicenseKey(key, { publicKeyB64: pub, now: now + 29 * DAY }).ok).toBe(true)
    const expired = verifyLicenseKey(key, { publicKeyB64: pub, now: now + 32 * DAY })
    expect(expired.ok).toBe(false)
    if (!expired.ok) expect(expired.reason).toMatch(/expired/)
  })

  it('refuses revoked key ids', () => {
    const { key, keyId } = issueKey(pem)
    const r = verifyLicenseKey(key, { publicKeyB64: pub, revoked: [keyId] })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toMatch(/revoked/)
  })
})

describe('license store', () => {
  it('activates, persists, re-verifies on read and deactivates', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'pcdoctor-license-'))
    try {
      const store = createLicenseStore(dir, pub)
      expect((await store.status()).edition).toBe('free')

      const bad = await store.activate('PCD-NOTAREALKEY')
      expect(bad.ok).toBe(false)
      expect((await store.status()).edition).toBe('free')

      const good = await store.activate(issueKey(pem).key)
      expect(good.ok).toBe(true)
      expect((await createLicenseStore(dir, pub).status()).edition).toBe('pro')

      // Editing the saved file cannot grant Pro.
      await writeFile(join(dir, 'license.json'), JSON.stringify({ key: 'PCD-FORGED', activatedAt: 1 }))
      const forged = await store.status()
      expect(forged.edition).toBe('free')
      expect(forged.note).toMatch(/no longer valid/)

      expect((await store.deactivate()).edition).toBe('free')
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })
})

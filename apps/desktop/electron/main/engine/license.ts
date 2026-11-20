import { createPublicKey, verify } from 'node:crypto'

/**
 * Offline license verification.
 *
 * A key is "PCD-" followed by base32 of: payload (8 bytes) + Ed25519 signature (64 bytes).
 *   payload = [version=1][edition][expiry u16 big-endian][keyId 4 bytes]
 *   expiry  = whole days since 2020-01-01 UTC, inclusive; 0 means the key never expires.
 *
 * The app only holds the PUBLIC key, so it can check a key but never create one. The private key
 * lives outside the project (see tools/license.mjs). Keys are not tied to a device: that needs the
 * licensing service planned for a later phase.
 */

/** SPKI/DER public key, base64. Replace only together with the private key (see README). */
export const PUBLIC_KEY_SPKI_B64 = 'MCowBQYDK2VwAyEAyyhCF0xev32ftMT0wjAFCL+nCJZVWHnZcQP936CLcHs='

/** Key ids that must stop working. Offline keys cannot be recalled any other way. */
export const REVOKED_KEY_IDS: readonly string[] = []

export const KEY_PREFIX = 'PCD-'
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
const EPOCH_MS = Date.UTC(2020, 0, 1)
const DAY_MS = 86_400_000

export interface VerifiedLicense {
  edition: 'pro'
  expiresAt: number | null
  keyId: string
}

export type VerifyResult = { ok: true; license: VerifiedLicense } | { ok: false; reason: string }

export function base32Decode(text: string): Buffer | null {
  let bits = 0
  let value = 0
  const out: number[] = []
  for (const ch of text) {
    const idx = ALPHABET.indexOf(ch)
    if (idx < 0) return null
    value = (value << 5) | idx
    bits += 5
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff)
      bits -= 8
    }
  }
  return Buffer.from(out)
}

export function verifyLicenseKey(
  raw: string,
  options: { publicKeyB64?: string; now?: number; revoked?: readonly string[] } = {}
): VerifyResult {
  const invalid: VerifyResult = { ok: false, reason: 'That license key is not valid. Check it for typing mistakes and paste the whole key.' }
  const publicKeyB64 = options.publicKeyB64 ?? PUBLIC_KEY_SPKI_B64
  const now = options.now ?? Date.now()

  const key = raw.replace(/\s+/g, '').toUpperCase()
  if (!key.startsWith(KEY_PREFIX)) return invalid
  const bytes = base32Decode(key.slice(KEY_PREFIX.length).replace(/-/g, ''))
  if (!bytes || bytes.length < 72) return invalid
  const payload = bytes.subarray(0, 8)
  const signature = bytes.subarray(8, 72)

  let valid: boolean
  try {
    const publicKey = createPublicKey({ key: Buffer.from(publicKeyB64, 'base64'), format: 'der', type: 'spki' })
    valid = verify(null, payload, publicKey, signature)
  } catch {
    valid = false
  }
  if (!valid) return invalid
  if (payload[0] !== 1 || payload[1] !== 1) return { ok: false, reason: 'This key is for a different version of PC Doctor.' }

  const keyId = payload.subarray(4, 8).toString('hex').toUpperCase()
  if ((options.revoked ?? REVOKED_KEY_IDS).includes(keyId)) return { ok: false, reason: 'This license key has been revoked.' }

  const days = payload.readUInt16BE(2)
  const expiresAt = days === 0 ? null : EPOCH_MS + (days + 1) * DAY_MS - 1
  if (expiresAt !== null && now > expiresAt) return { ok: false, reason: `This license key expired on ${new Date(expiresAt).toLocaleDateString()}.` }

  return { ok: true, license: { edition: 'pro', expiresAt, keyId } }
}

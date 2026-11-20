#!/usr/bin/env node
// PC Doctor license tool. Run it on YOUR machine only: it needs the private key, which must never
// be committed, shared or shipped inside the app.
//
//   node tools/license.mjs keygen             create the signing key pair (once)
//   node tools/license.mjs issue              issue a perpetual Pro key
//   node tools/license.mjs issue --days 365   issue a Pro key that expires after 365 days
//
// The private key is stored outside the project at ~/.pc-doctor/license-private.pem
// (override with PCD_LICENSE_PRIVATE_KEY). Back it up: without it no new keys can be issued.
import { createPrivateKey, createPublicKey, generateKeyPairSync, randomBytes, sign } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
const EPOCH_MS = Date.UTC(2020, 0, 1)
const DAY_MS = 86_400_000

export const defaultPrivateKeyPath = () => process.env.PCD_LICENSE_PRIVATE_KEY || join(homedir(), '.pc-doctor', 'license-private.pem')

function base32Encode(buf) {
  let bits = 0
  let value = 0
  let out = ''
  for (const byte of buf) {
    value = (value << 8) | byte
    bits += 8
    while (bits >= 5) {
      out += ALPHABET[(value >>> (bits - 5)) & 31]
      bits -= 5
    }
  }
  if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31]
  return out
}

/** Creates a signed key. Exported so the tests can verify it with the app's real verifier. */
export function issueKey(privatePem, { days = null, now = Date.now() } = {}) {
  const payload = Buffer.alloc(8)
  payload[0] = 1 // format version
  payload[1] = 1 // edition: 1 = Pro
  const expiryDay = days === null ? 0 : Math.floor((now - EPOCH_MS) / DAY_MS) + days
  if (expiryDay < 0 || expiryDay > 0xffff) throw new Error('Expiry is out of range')
  payload.writeUInt16BE(expiryDay, 2)
  randomBytes(4).copy(payload, 4)
  const signature = sign(null, payload, createPrivateKey(privatePem))
  const text = base32Encode(Buffer.concat([payload, signature]))
  return { key: 'PCD-' + text.match(/.{1,6}/g).join('-'), keyId: payload.subarray(4, 8).toString('hex').toUpperCase(), expiryDay }
}

function main() {
  const [command, ...rest] = process.argv.slice(2)
  const keyPath = defaultPrivateKeyPath()

  if (command === 'keygen') {
    if (existsSync(keyPath)) {
      console.error(`A private key already exists at ${keyPath}. Refusing to overwrite it: existing license keys would stop working.`)
      process.exit(1)
    }
    const { publicKey, privateKey } = generateKeyPairSync('ed25519')
    mkdirSync(dirname(keyPath), { recursive: true })
    writeFileSync(keyPath, privateKey.export({ type: 'pkcs8', format: 'pem' }), { mode: 0o600 })
    console.log(`Private key written to ${keyPath}`)
    console.log('Back it up somewhere safe and never commit it.\n')
    console.log('Public key (put this in electron/main/engine/license.ts as PUBLIC_KEY_SPKI_B64):')
    console.log(publicKey.export({ type: 'spki', format: 'der' }).toString('base64'))
    return
  }

  if (command === 'issue') {
    if (!existsSync(keyPath)) {
      console.error(`No private key at ${keyPath}. Run "node tools/license.mjs keygen" first.`)
      process.exit(1)
    }
    const i = rest.indexOf('--days')
    const days = i >= 0 ? Number(rest[i + 1]) : null
    if (days !== null && (!Number.isInteger(days) || days < 1)) {
      console.error('--days must be a whole number of days, 1 or more.')
      process.exit(1)
    }
    const pem = readFileSync(keyPath, 'utf8')
    const { key, keyId, expiryDay } = issueKey(pem, { days })
    console.log(key)
    console.error(`\nKey id: ${keyId}   Expires: ${days === null ? 'never' : new Date(EPOCH_MS + (expiryDay + 1) * DAY_MS - 1).toDateString()}`)
    console.error(`Public key for this signing key: ${createPublicKey(pem).export({ type: 'spki', format: 'der' }).toString('base64')}`)
    return
  }

  console.log('Usage: node tools/license.mjs keygen | issue [--days N]')
  process.exit(command ? 1 : 0)
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main()

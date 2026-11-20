export interface RegValue {
  name: string
  type: string
  data: string
}

/**
 * Parses the output of `reg query <key>` into values. Subkey header lines (starting with HKEY)
 * and blank lines are ignored. Value lines look like: `    Name    REG_SZ    data`.
 */
export function parseRegQuery(stdout: string): RegValue[] {
  const values: RegValue[] = []
  for (const line of stdout.split(/\r?\n/)) {
    const match = /^\s{4}(.+?)\s{4}(REG_[A-Z_]+)(?:\s{4}(.*))?$/.exec(line)
    if (match) values.push({ name: match[1], type: match[2], data: (match[3] ?? '').trim() })
  }
  return values
}

/** A StartupApproved value is enabled when its first byte is even (02 / 06); 03 means disabled. */
export function isApprovedEnabled(hex: string | undefined): boolean {
  if (!hex || hex.length < 2) return true
  const first = parseInt(hex.slice(0, 2), 16)
  return Number.isNaN(first) ? true : first % 2 === 0
}

/** Builds the 12-byte StartupApproved value, using the same format Task Manager writes. */
export function buildApprovedHex(enabled: boolean, now: number = Date.now()): string {
  if (enabled) return '020000000000000000000000'
  // FILETIME = 100ns ticks since 1601-01-01, little-endian, bytes 4..11.
  let ticks = (BigInt(now) + 11644473600000n) * 10000n
  const bytes: string[] = []
  for (let i = 0; i < 8; i++) {
    bytes.push((ticks & 0xffn).toString(16).padStart(2, '0'))
    ticks >>= 8n
  }
  return '03000000' + bytes.join('')
}

/** Extracts the executable path from a Run-key command line, or null if none is recognisable. */
export function extractExePath(command: string): string | null {
  const text = command.trim()
  const quoted = /^"([^"]+)"/.exec(text)
  if (quoted) return quoted[1]
  const bare = /^(.+?\.(?:exe|lnk|bat|cmd))(?:\s|$)/i.exec(text)
  return bare ? bare[1] : null
}

/** Best-effort publisher guess from the install folder, e.g. C:\Program Files\Vendor\App\app.exe */
export function guessPublisher(exePath: string | null): string {
  if (!exePath) return 'Unknown'
  const parts = exePath.split(/[\\/]/).filter(Boolean)
  const lower = parts.map((p) => p.toLowerCase())
  const generic = new Set(['programs', 'packages', 'apps', 'application', 'microsoft'])
  for (const marker of ['program files', 'program files (x86)', 'local', 'roaming', 'applications']) {
    const i = lower.lastIndexOf(marker)
    if (i < 0) continue
    let j = i + 1
    // "...\Local\Programs\Docker\app.exe": "Programs" is a container, the vendor is the next folder.
    if (generic.has(lower[j] ?? '') && marker !== 'program files' && marker !== 'program files (x86)') j++
    if (parts[j] && !/\.(exe|lnk)$/i.test(parts[j])) return parts[j]
  }
  return 'Unknown'
}

/** Expands %VAR% references such as %windir%, which Run keys often contain. */
export function expandEnv(value: string, env: NodeJS.ProcessEnv = process.env): string {
  return value.replace(/%([^%]+)%/g, (whole, name: string) => env[name] ?? env[name.toUpperCase()] ?? whole)
}

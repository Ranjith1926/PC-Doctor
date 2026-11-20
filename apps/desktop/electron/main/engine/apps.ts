import { app } from 'electron'
import { createHash } from 'node:crypto'
import { access, readdir } from 'node:fs/promises'
import type { InstalledApp, Result } from '../../../src/shared/contracts'
import { PROTECTED_PATTERN, fail, ok, platform, runPowerShell } from './util'

interface RawApp {
  DisplayName?: string
  DisplayVersion?: string
  Publisher?: string
  InstallDate?: string
  EstimatedSize?: number
  DisplayIcon?: string
}

// Fixed script: reads the standard uninstall registry keys. UninstallString is intentionally NOT selected,
// so the renderer can never see or send an uninstall command.
const LIST_SCRIPT = `
$keys = 'HKLM:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*',
        'HKLM:\\Software\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*',
        'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*'
Get-ItemProperty -Path $keys -ErrorAction SilentlyContinue |
  Where-Object { $_.DisplayName -and $_.UninstallString -and ($_.SystemComponent -ne 1) -and (-not $_.ParentKeyName) -and ($_.ReleaseType -notmatch 'Update|Hotfix') } |
  Select-Object DisplayName, DisplayVersion, Publisher, InstallDate, EstimatedSize, DisplayIcon |
  ConvertTo-Json -Compress
`

async function iconFor(displayIcon: string | undefined): Promise<string | null> {
  if (!displayIcon) return null
  const path = displayIcon.replace(/^"|"$/g, '').replace(/,-?\d+$/, '').replace(/"/g, '')
  if (!/\.(exe|ico)$/i.test(path)) return null
  try {
    await access(path)
    const image = await app.getFileIcon(path, { size: 'small' })
    return image.isEmpty() ? null : image.toDataURL()
  } catch {
    return null
  }
}

export async function listApps(): Promise<Result<InstalledApp[]>> {
  if (platform === 'win32') {
    const { stdout, code } = await runPowerShell(LIST_SCRIPT, 45000)
    if (code !== 0 && !stdout.trim()) return fail('error', 'Windows did not return the application list.')
    const parsed: unknown = stdout.trim() ? JSON.parse(stdout) : []
    const raw = (Array.isArray(parsed) ? parsed : [parsed]) as RawApp[]
    const seen = new Set<string>()
    const apps: InstalledApp[] = []
    for (const r of raw) {
      const name = String(r.DisplayName ?? '').trim()
      if (!name) continue
      const version = String(r.DisplayVersion ?? '')
      const key = `${name}|${version}`
      if (seen.has(key)) continue
      seen.add(key)
      const date = /^\d{8}$/.test(String(r.InstallDate ?? ''))
        ? `${String(r.InstallDate).slice(0, 4)}-${String(r.InstallDate).slice(4, 6)}-${String(r.InstallDate).slice(6, 8)}`
        : null
      apps.push({
        id: createHash('sha1').update(key).digest('hex').slice(0, 12),
        name,
        version: version || '—',
        publisher: String(r.Publisher ?? '').trim() || 'Unknown',
        installedOn: date,
        sizeBytes: r.EstimatedSize ? Number(r.EstimatedSize) * 1024 : null,
        iconDataUrl: null,
        protected: PROTECTED_PATTERN.test(`${name} ${r.Publisher ?? ''}`)
      })
      apps[apps.length - 1].iconDataUrl = await iconFor(r.DisplayIcon)
    }
    apps.sort((a, b) => a.name.localeCompare(b.name))
    return ok(apps)
  }

  if (platform === 'darwin') {
    const names = await readdir('/Applications').catch(() => [] as string[])
    return ok(
      names
        .filter((n) => n.endsWith('.app'))
        .map((n) => ({
          id: createHash('sha1').update(n).digest('hex').slice(0, 12),
          name: n.replace(/\.app$/, ''),
          version: '—',
          publisher: 'Unknown',
          installedOn: null,
          sizeBytes: null,
          iconDataUrl: null,
          protected: false
        }))
    )
  }
  return fail('unsupported', 'Application inventory is not supported on this platform.')
}

/**
 * Uninstalling needs the engine's supported-uninstall workflow (restore point, publisher-verified
 * uninstaller, result tracking). Running raw registry uninstall strings from the UI process is
 * exactly what the security requirements forbid, so this is reported honestly as unavailable.
 */
export async function uninstallApp(id: string): Promise<Result<null>> {
  void id // The id is accepted for the contract; no action is taken in this build.
  return fail('unavailable', 'Uninstall is not connected yet. It arrives with the .NET engine so it can run with a restore point and verified uninstallers. Nothing was changed.')
}

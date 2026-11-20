import { app, shell } from 'electron'
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { Result, StartupEntry, StartupSnapshotInfo } from '../../../src/shared/contracts'
import { buildApprovedHex, expandEnv, extractExePath, guessPublisher, isApprovedEnabled, parseRegQuery } from './regParse'
import { PROTECTED_PATTERN, fail, ok, platform, run } from './util'

interface InternalEntry extends StartupEntry {
  approvedKey: string
  valueName: string
}

const APPROVED = 'Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\StartupApproved'
const RUN = 'Software\\Microsoft\\Windows\\CurrentVersion\\Run'

const REG_SOURCES = [
  { key: 'hkcu-run', run: `HKCU\\${RUN}`, approved: `HKCU\\${APPROVED}\\Run`, scope: 'user' as const },
  { key: 'hklm-run', run: `HKLM\\${RUN}`, approved: `HKLM\\${APPROVED}\\Run`, scope: 'machine' as const },
  { key: 'hklm-run32', run: `HKLM\\Software\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Run`, approved: `HKLM\\${APPROVED}\\Run32`, scope: 'machine' as const }
]

async function icon(exePath: string | null): Promise<string | null> {
  if (!exePath) return null
  try {
    const image = await app.getFileIcon(exePath, { size: 'small' })
    return image.isEmpty() ? null : image.toDataURL()
  } catch {
    return null
  }
}

async function readApproved(key: string): Promise<Map<string, string>> {
  const { stdout } = await run('reg.exe', ['query', key])
  return new Map(parseRegQuery(stdout).map((v) => [v.name, v.data]))
}

async function build(
  id: string,
  name: string,
  command: string,
  scope: StartupEntry['scope'],
  approvedKey: string,
  approvedValue: string | undefined
): Promise<InternalEntry> {
  let exe = extractExePath(command)
  if (exe) exe = expandEnv(exe)
  // Startup-folder items are shortcuts: follow them to the real program for its icon and publisher.
  if (exe && /\.lnk$/i.test(exe)) {
    try {
      exe = shell.readShortcutLink(exe).target || null
    } catch {
      exe = null
    }
  }
  return {
    id,
    name,
    command,
    scope,
    publisher: guessPublisher(exe),
    enabled: isApprovedEnabled(approvedValue),
    impact: null,
    protected: PROTECTED_PATTERN.test(`${name} ${command}`),
    iconDataUrl: await icon(exe),
    approvedKey,
    valueName: name
  }
}

async function listInternal(): Promise<InternalEntry[]> {
  if (platform !== 'win32') return []
  const entries: InternalEntry[] = []

  for (const source of REG_SOURCES) {
    const { stdout } = await run('reg.exe', ['query', source.run])
    const approved = await readApproved(source.approved)
    for (const v of parseRegQuery(stdout)) {
      entries.push(await build(`${source.key}::${v.name}`, v.name, v.data, source.scope, source.approved, approved.get(v.name)))
    }
  }

  const folders = [
    { key: 'folder-user', dir: join(process.env.APPDATA ?? '', 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Startup'), approved: `HKCU\\${APPROVED}\\StartupFolder` },
    { key: 'folder-machine', dir: join(process.env.ProgramData ?? '', 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'StartUp'), approved: `HKLM\\${APPROVED}\\StartupFolder` }
  ]
  for (const f of folders) {
    const approved = await readApproved(f.approved)
    for (const file of await readdir(f.dir).catch(() => [] as string[])) {
      if (file.toLowerCase() === 'desktop.ini') continue
      entries.push(await build(`${f.key}::${file}`, file, join(f.dir, file), 'folder', f.approved, approved.get(file)))
    }
  }

  const unique = new Map(entries.map((e) => [e.id, e]))
  return [...unique.values()].sort((a, b) => a.name.localeCompare(b.name))
}

const strip = (entry: InternalEntry): StartupEntry => {
  const { approvedKey, valueName, ...rest } = entry
  void approvedKey
  void valueName
  return rest
}

export async function listStartup(): Promise<Result<StartupEntry[]>> {
  if (platform !== 'win32') {
    return fail('unsupported', platform === 'darwin' ? 'Login item management for macOS arrives with the macOS adapter.' : 'Startup management is not supported on this platform.')
  }
  return ok((await listInternal()).map(strip))
}

// ---------------------------------------------------------- snapshot -----

const snapshotFile = () => join(app.getPath('userData'), 'startup-backup.json')
let snapshotTakenThisSession = false

async function takeSnapshotOnce(entries: InternalEntry[]) {
  if (snapshotTakenThisSession) return
  snapshotTakenThisSession = true
  const states = Object.fromEntries(entries.map((e) => [e.id, e.enabled]))
  await mkdir(app.getPath('userData'), { recursive: true })
  await writeFile(snapshotFile(), JSON.stringify({ takenAt: Date.now(), states }), 'utf8')
}

export async function getSnapshotInfo(): Promise<StartupSnapshotInfo> {
  try {
    const parsed = JSON.parse(await readFile(snapshotFile(), 'utf8')) as { takenAt: number }
    return { hasBackup: true, takenAt: parsed.takenAt }
  } catch {
    return { hasBackup: false, takenAt: null }
  }
}

async function writeState(entry: InternalEntry, enabled: boolean): Promise<Result<null>> {
  // Fixed executable, fixed argument shape. Key and value name come from the engine's own listing, never the UI.
  const { code } = await run('reg.exe', ['add', entry.approvedKey, '/v', entry.valueName, '/t', 'REG_BINARY', '/d', buildApprovedHex(enabled), '/f'])
  if (code === 0) return ok(null)
  return fail('denied', entry.scope === 'machine' || entry.scope === 'folder'
    ? 'Changing items for all users needs administrator rights. PC Doctor runs without them for your safety.'
    : 'Windows did not accept the change.')
}

export async function setStartupEnabled(id: string, enabled: boolean): Promise<Result<StartupEntry[]>> {
  if (platform !== 'win32') return fail('unsupported', 'Startup management is not supported on this platform.')
  const entries = await listInternal()
  const entry = entries.find((e) => e.id === id)
  if (!entry) return fail('error', 'That startup item no longer exists. Refresh the list.')
  await takeSnapshotOnce(entries)
  const result = await writeState(entry, enabled)
  if (!result.ok) return result
  return ok((await listInternal()).map(strip))
}

export async function restoreSnapshot(): Promise<Result<StartupEntry[]>> {
  if (platform !== 'win32') return fail('unsupported', 'Startup management is not supported on this platform.')
  let states: Record<string, boolean>
  try {
    states = (JSON.parse(await readFile(snapshotFile(), 'utf8')) as { states: Record<string, boolean> }).states
  } catch {
    return fail('unavailable', 'There is no saved configuration to restore yet.')
  }
  let blocked = 0
  for (const entry of await listInternal()) {
    const wanted = states[entry.id]
    if (wanted === undefined || wanted === entry.enabled) continue
    const r = await writeState(entry, wanted)
    if (!r.ok) blocked++
  }
  const list = (await listInternal()).map(strip)
  return blocked > 0
    ? fail('denied', `${blocked} item(s) could not be restored because they need administrator rights.`)
    : ok(list)
}

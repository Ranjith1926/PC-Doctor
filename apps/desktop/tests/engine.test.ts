import { mkdir, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { buildApprovedHex, extractExePath, guessPublisher, isApprovedEnabled, parseRegQuery } from '../electron/main/engine/regParse'
import { isSafeCleanPath, removeContents } from '../electron/main/engine/safePath'
import { gradeFor, scoreHealth } from '../electron/main/engine/scoring'
import { createStore } from '../electron/main/engine/store'

const win = process.platform === 'win32'
const HOME = win ? 'C:\\Users\\Alex' : '/home/alex'
const p = (...parts: string[]) => (win ? parts.join('\\') : '/' + parts.join('/'))

describe('isSafeCleanPath', () => {
  it('refuses drive roots, short paths and empty input', () => {
    expect(isSafeCleanPath('', HOME)).toBe(false)
    expect(isSafeCleanPath(win ? 'C:\\' : '/', HOME)).toBe(false)
    expect(isSafeCleanPath(win ? 'C:\\Temp' : '/tmp', HOME)).toBe(false)
  })

  it('refuses the home folder and its parents', () => {
    expect(isSafeCleanPath(HOME, HOME)).toBe(false)
    expect(isSafeCleanPath(win ? 'C:\\Users' : '/home', HOME)).toBe(false)
  })

  it('refuses personal and project folders anywhere in the path', () => {
    for (const name of ['Documents', 'Desktop', 'Downloads', 'Pictures', 'OneDrive', 'source', 'Program Files']) {
      expect(isSafeCleanPath(p(HOME.replace(/^\//, ''), name, 'cache-folder'), HOME)).toBe(false)
    }
  })

  it('allows normal cache locations', () => {
    const cache = win ? 'C:\\Users\\Alex\\AppData\\Local\\Temp' : '/home/alex/.cache/pip'
    expect(isSafeCleanPath(cache, HOME)).toBe(true)
  })
})

describe('removeContents (throwaway folder only)', () => {
  let base = ''
  afterAll(async () => {
    if (base) await rm(base, { recursive: true, force: true })
  })

  it('deletes the contents, keeps the root, and refuses roots outside the allow-list', async () => {
    base = await mkdtemp(join(tmpdir(), 'pcdoctor-test-'))
    const root = join(base, 'cache-root')
    await mkdir(join(root, 'nested'), { recursive: true })
    await writeFile(join(root, 'a.bin'), Buffer.alloc(2048))
    await writeFile(join(root, 'nested', 'b.bin'), Buffer.alloc(1024))

    await expect(removeContents(root, [join(base, 'somewhere-else')])).rejects.toThrow(/Refused/)
    expect((await readdir(root)).length).toBe(2)

    const result = await removeContents(root, [root])
    expect(result.freedBytes).toBe(3072)
    expect(await readdir(root)).toEqual([])
  })

  it('honours the file pattern and leaves other files alone', async () => {
    base = base || (await mkdtemp(join(tmpdir(), 'pcdoctor-test-')))
    const root = join(base, 'pattern-root')
    await mkdir(root, { recursive: true })
    await writeFile(join(root, 'thumbcache_32.db'), Buffer.alloc(100))
    await writeFile(join(root, 'keep.txt'), Buffer.alloc(100))
    await removeContents(root, [root], /^thumbcache_.*\.db$/)
    expect(await readdir(root)).toEqual(['keep.txt'])
  })
})

describe('registry parsing', () => {
  it('parses reg query output', () => {
    const out = ['', 'HKEY_CURRENT_USER\\Software\\X', '    OneDrive    REG_SZ    "C:\\Program Files\\Microsoft OneDrive\\OneDrive.exe" /background', '    Empty    REG_SZ    ', ''].join('\r\n')
    const values = parseRegQuery(out)
    expect(values[0]).toMatchObject({ name: 'OneDrive', type: 'REG_SZ' })
    expect(values[0].data).toContain('OneDrive.exe')
    expect(values[1]).toMatchObject({ name: 'Empty', data: '' })
  })

  it('reads and writes StartupApproved state', () => {
    expect(isApprovedEnabled('020000000000000000000000')).toBe(true)
    expect(isApprovedEnabled('030000000000000000000000')).toBe(false)
    expect(isApprovedEnabled(undefined)).toBe(true)
    expect(buildApprovedHex(true)).toBe('020000000000000000000000')
    const off = buildApprovedHex(false, Date.UTC(2026, 0, 1))
    expect(off).toHaveLength(24)
    expect(off.startsWith('03000000')).toBe(true)
    expect(isApprovedEnabled(off)).toBe(false)
  })

  it('extracts exe paths and publishers', () => {
    expect(extractExePath('"C:\\Program Files\\Zoom\\bin\\Zoom.exe" --silent')).toBe('C:\\Program Files\\Zoom\\bin\\Zoom.exe')
    expect(extractExePath('C:\\Tools\\tool.exe /x')).toBe('C:\\Tools\\tool.exe')
    expect(extractExePath('rundll32 something')).toBeNull()
    expect(guessPublisher('C:\\Program Files\\Zoom\\bin\\Zoom.exe')).toBe('Zoom')
    expect(guessPublisher(null)).toBe('Unknown')
  })
})

describe('scoreHealth', () => {
  const healthy = { ramUsedPct: 40, diskFreePct: 50, cpuPct: 10, startupOn: 3, startupAll: 5, junkBytes: 0, diskType: 'SSD' as const, uptimeDays: 1 }

  it('scores a healthy machine 100 with no recommendations', () => {
    const r = scoreHealth(healthy)
    expect(r.score).toBe(100)
    expect(r.grade).toBe('Excellent')
    expect(r.recommendations).toHaveLength(0)
  })

  it('totals to 100 and explains every category', () => {
    const r = scoreHealth(healthy)
    expect(r.categories.reduce((s, c) => s + c.maxPoints, 0)).toBe(100)
    expect(r.categories.every((c) => c.evidence.length > 0)).toBe(true)
  })

  it('penalises a struggling machine and recommends actions', () => {
    const r = scoreHealth({ ramUsedPct: 92, diskFreePct: 6, cpuPct: 80, startupOn: 20, startupAll: 25, junkBytes: 8 * 1024 ** 3, diskType: 'HDD', uptimeDays: 12 })
    expect(r.score).toBeLessThan(30)
    expect(r.grade).toBe('Needs attention')
    expect(r.recommendations.length).toBeGreaterThanOrEqual(6)
  })

  it('maps grade boundaries', () => {
    expect(gradeFor(85)).toBe('Excellent')
    expect(gradeFor(84)).toBe('Good')
    expect(gradeFor(70)).toBe('Good')
    expect(gradeFor(69)).toBe('Fair')
    expect(gradeFor(50)).toBe('Fair')
    expect(gradeFor(49)).toBe('Needs attention')
  })
})

describe('history store', () => {
  it('persists snapshots to disk and reloads them', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'pcdoctor-store-'))
    try {
      const snap = { id: 'x', timestamp: 1, score: 77, cpuPct: 1, ramUsedPct: 2, diskFreeBytes: 3, diskTotalBytes: 4, junkBytes: 5, startupEnabled: 6 }
      await createStore(dir).addSnapshot(snap)
      expect(await createStore(dir).snapshots()).toEqual([snap])
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })
})

describe('publisher guess and env expansion', () => {
  it('skips generic container folders', async () => {
    const { guessPublisher, expandEnv } = await import('../electron/main/engine/regParse')
    expect(guessPublisher(String.raw`C:\Users\a\AppData\Local\Programs\DockerDesktop\Docker Desktop.exe`)).toBe('DockerDesktop')
    expect(guessPublisher(String.raw`C:\Users\a\AppData\Local\ScreenPal\ScreenPal.exe`)).toBe('ScreenPal')
    expect(expandEnv(String.raw`%windir%\system32\x.exe`, { windir: String.raw`C:\Windows` })).toBe(String.raw`C:\Windows\system32\x.exe`)
    expect(expandEnv(String.raw`%missing%\x`, {})).toBe(String.raw`%missing%\x`)
  })
})

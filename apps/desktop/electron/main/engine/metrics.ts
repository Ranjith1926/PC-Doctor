import { cpus, freemem, hostname, release, totalmem, uptime, userInfo, arch } from 'node:os'
import { statfs } from 'node:fs/promises'
import type { DiskTypeInfo, LiveMetrics, ProcessUsage, SystemInfo } from '../../../src/shared/contracts'
import { platform, run, runPowerShell, sleep } from './util'

// ------------------------------------------------------------- CPU load ---

type CpuTimes = { idle: number; total: number }

function readCpuTimes(): CpuTimes {
  let idle = 0
  let total = 0
  for (const c of cpus()) {
    idle += c.times.idle
    total += c.times.user + c.times.nice + c.times.sys + c.times.idle + c.times.irq
  }
  return { idle, total }
}

let previous: CpuTimes | null = null

/** CPU load since the previous call. The first call takes a short second sample to get a real delta. */
export async function sampleCpuPct(): Promise<number> {
  if (!previous) {
    previous = readCpuTimes()
    await sleep(250)
  }
  const now = readCpuTimes()
  const idle = now.idle - previous.idle
  const total = now.total - previous.total
  previous = now
  if (total <= 0) return 0
  return Math.max(0, Math.min(100, Math.round((1 - idle / total) * 100)))
}

// -------------------------------------------------------------- system ---

export function getSystemInfo(): SystemInfo {
  const first = cpus()[0]
  return {
    hostname: hostname(),
    userName: userInfo().username,
    platform,
    osRelease: release(),
    arch: arch(),
    cpuModel: first ? first.model.trim() : 'Unknown processor',
    cpuCores: cpus().length,
    totalMemBytes: totalmem()
  }
}

export function systemDriveRoot(): string {
  if (platform === 'win32') return `${process.env.SystemDrive ?? 'C:'}\\`
  return '/'
}

export async function getDiskUsage(): Promise<{ total: number; free: number }> {
  const stats = await statfs(systemDriveRoot())
  return { total: stats.blocks * stats.bsize, free: stats.bavail * stats.bsize }
}

export async function getMetrics(): Promise<LiveMetrics> {
  const cpuPct = await sampleCpuPct()
  const ramTotal = totalmem()
  const ramUsed = ramTotal - freemem()
  const disk = await getDiskUsage()
  return {
    timestamp: Date.now(),
    cpuPct,
    ramUsedPct: Math.round((ramUsed / ramTotal) * 100),
    ramUsedBytes: ramUsed,
    ramTotalBytes: ramTotal,
    diskTotalBytes: disk.total,
    diskFreeBytes: disk.free,
    diskFreePct: Math.round((disk.free / disk.total) * 100),
    uptimeSec: uptime(),
    tempC: null // No portable, trustworthy temperature source: never estimate one.
  }
}

// ----------------------------------------------------------- processes ---

export async function getProcessNames(): Promise<string[]> {
  return (await getTopProcesses(true)).map((p) => p.name.toLowerCase())
}

/** Aggregates memory by process name. CPU per process is not available without sampling, so it is omitted. */
export async function getTopProcesses(all = false): Promise<ProcessUsage[]> {
  const map = new Map<string, { memoryBytes: number; instances: number }>()
  const add = (name: string, bytes: number) => {
    const key = name.replace(/\.exe$/i, '')
    const row = map.get(key) ?? { memoryBytes: 0, instances: 0 }
    row.memoryBytes += bytes
    row.instances += 1
    map.set(key, row)
  }

  if (platform === 'win32') {
    const { stdout } = await run('tasklist.exe', ['/fo', 'csv', '/nh'])
    for (const line of stdout.split(/\r?\n/)) {
      const cols = [...line.matchAll(/"([^"]*)"/g)].map((m) => m[1])
      if (cols.length < 5) continue
      const kb = parseInt(cols[4].replace(/[^0-9]/g, ''), 10)
      if (!Number.isNaN(kb)) add(cols[0], kb * 1024)
    }
  } else {
    const { stdout } = await run('ps', ['-A', '-o', 'rss=,comm='])
    for (const line of stdout.split('\n')) {
      const m = /^\s*(\d+)\s+(.+)$/.exec(line)
      if (m) add(m[2].split('/').pop() ?? m[2], parseInt(m[1], 10) * 1024)
    }
  }

  const rows = [...map.entries()].map(([name, v]) => ({ name, ...v }))
  rows.sort((a, b) => b.memoryBytes - a.memoryBytes)
  return all ? rows : rows.slice(0, 12)
}

// ------------------------------------------------------------ disk type ---

export async function getDiskType(): Promise<DiskTypeInfo['type']> {
  try {
    if (platform === 'win32') {
      const script =
        "$n=(Get-Partition -DriveLetter ($env:SystemDrive.TrimEnd(':'))).DiskNumber;" +
        "$d=Get-PhysicalDisk | Where-Object { $_.DeviceId -eq \"$n\" } | Select-Object -First 1;" +
        "if($d.BusType -eq 'NVMe' -or $d.MediaType -eq 'SSD'){'SSD'}elseif($d.MediaType -eq 'HDD'){'HDD'}else{'Unknown'}"
      const { stdout } = await runPowerShell(script, 20000)
      const t = stdout.trim()
      return t === 'SSD' || t === 'HDD' ? t : 'Unknown'
    }
    if (platform === 'darwin') {
      const { stdout } = await run('diskutil', ['info', '/'])
      if (/Solid State:\s+Yes/i.test(stdout)) return 'SSD'
      if (/Solid State:\s+No/i.test(stdout)) return 'HDD'
    }
  } catch {
    // Fall through to Unknown.
  }
  return 'Unknown'
}

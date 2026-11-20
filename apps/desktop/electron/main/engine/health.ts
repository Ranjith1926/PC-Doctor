import { randomUUID } from 'node:crypto'
import { SCAN_STEPS } from '../../../src/shared/constants'
import type { HealthScanResult, Result, ScanProgress } from '../../../src/shared/contracts'
import { scanCleanup } from './cleanup'
import { getDiskType, getDiskUsage, getMetrics, sampleCpuPct } from './metrics'
import { scoreHealth } from './scoring'
import { listStartup } from './startup'
import type { Store } from './store'
import { fail, median, ok, sleep } from './util'
import { freemem, totalmem, uptime } from 'node:os'

const SAMPLES = 6
const STEPS = SCAN_STEPS

/** Real health scan. Progress is reported per step; cancel is honoured between steps and samples. */
export async function runHealthScan(
  store: Store,
  onProgress: (p: ScanProgress) => void,
  isCancelled: () => boolean
): Promise<Result<HealthScanResult>> {
  const startedAt = Date.now()
  const step = (n: number) => onProgress({ step: n, totalSteps: STEPS.length, label: STEPS[n - 1] })
  const cancelled = () => fail('cancelled', 'The scan was cancelled. Nothing was changed.')

  step(1)
  const cpu: number[] = []
  const ram: number[] = []
  await sampleCpuPct() // establishes the baseline for the first real delta
  for (let i = 0; i < SAMPLES; i++) {
    await sleep(1000)
    if (isCancelled()) return cancelled()
    cpu.push(await sampleCpuPct())
    ram.push(((totalmem() - freemem()) / totalmem()) * 100)
  }

  step(2)
  if (isCancelled()) return cancelled()
  const disk = await getDiskUsage()

  step(3)
  if (isCancelled()) return cancelled()
  const startup = await listStartup()
  const startupAll = startup.ok ? startup.data.length : 0
  const startupOn = startup.ok ? startup.data.filter((e) => e.enabled).length : 0

  step(4)
  if (isCancelled()) return cancelled()
  const cleanup = await scanCleanup()
  const junkBytes = cleanup.candidates.filter((c) => c.group === 'system' || c.group === 'browser').reduce((s, c) => s + c.sizeBytes, 0)
  const recoverableBytes = cleanup.candidates.filter((c) => c.group !== 'heavy').reduce((s, c) => s + c.sizeBytes, 0)

  step(5)
  if (isCancelled()) return cancelled()
  const diskType = await getDiskType()

  step(6)
  const metrics = await getMetrics()
  const scored = scoreHealth({
    ramUsedPct: Math.round(median(ram)),
    diskFreePct: Math.round((disk.free / disk.total) * 100),
    cpuPct: Math.round(median(cpu)),
    startupOn,
    startupAll,
    junkBytes,
    diskType,
    uptimeDays: Math.round((uptime() / 86400) * 10) / 10
  })

  const result: HealthScanResult = {
    id: randomUUID(),
    startedAt,
    finishedAt: Date.now(),
    score: scored.score,
    grade: scored.grade,
    categories: scored.categories,
    recommendations: scored.recommendations,
    metrics,
    recoverableBytes
  }

  await store.addSnapshot({
    id: result.id,
    timestamp: result.finishedAt,
    score: result.score,
    cpuPct: Math.round(median(cpu)),
    ramUsedPct: Math.round(median(ram)),
    diskFreeBytes: disk.free,
    diskTotalBytes: disk.total,
    junkBytes,
    startupEnabled: startupOn
  })
  return ok(result)
}

import { execFile } from 'node:child_process'
import type { PlatformId, Result } from '../../../src/shared/contracts'

export const platform = process.platform as PlatformId

export const ok = <T>(data: T): Result<T> => ({ ok: true, data })

export const fail = (
  code: Exclude<Result<never>, { ok: true }>['code'],
  message: string
): Result<never> => ({ ok: false, code, message })

/** Runs an engine operation and converts any thrown error into a typed failure. */
export async function guard<T>(fn: () => Promise<T>): Promise<Result<T>> {
  try {
    return ok(await fn())
  } catch (error) {
    return fail('error', error instanceof Error ? error.message : String(error))
  }
}

/**
 * Runs a fixed executable with a fixed argument array. There is deliberately no shell and
 * nothing here ever receives text from the UI.
 */
export function run(file: string, args: string[], timeoutMs = 20000): Promise<{ stdout: string; code: number }> {
  return new Promise((resolve) => {
    execFile(
      file,
      args,
      { windowsHide: true, timeout: timeoutMs, maxBuffer: 64 * 1024 * 1024, encoding: 'utf8' },
      (error, stdout) => {
        const raw = error ? (error as NodeJS.ErrnoException & { code?: unknown }).code : 0
        resolve({ stdout: String(stdout ?? ''), code: error ? (typeof raw === 'number' ? raw : 1) : 0 })
      }
    )
  })
}

export function runPowerShell(script: string, timeoutMs = 30000) {
  return run(
    'powershell.exe',
    ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script],
    timeoutMs
  )
}

export const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

export function median(values: number[]): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

/** Driver, security and VPN software. Disabling or removing it needs an extra confirmation. */
export const PROTECTED_PATTERN =
  /SecurityHealth|Defender|Realtek|Rtk|Synaptics|ELAN|igfx|Intel|AMD|NVIDIA|Audio|Touchpad|Bluetooth|Quick ?Heal|K7|McAfee|Norton|Kaspersky|Avast|AVG|ESET|Sophos|Trend ?Micro|Bitdefender|CrowdStrike|SentinelOne|Forcepoint|Zscaler|GlobalProtect|FortiClient|Cisco|VPN/i

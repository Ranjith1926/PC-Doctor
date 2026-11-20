import type { HealthGrade, Recommendation, ScanCategoryResult, Severity } from '../../../src/shared/contracts'
import { gradeFor } from '../../../src/shared/grade'

export { gradeFor }

const GB = 1024 ** 3

export interface ScoreInputs {
  ramUsedPct: number
  diskFreePct: number
  cpuPct: number
  startupOn: number
  startupAll: number
  junkBytes: number
  diskType: 'SSD' | 'HDD' | 'Unknown'
  uptimeDays: number
}

const sev = (points: number, max: number): Severity => {
  const ratio = points / max
  if (ratio >= 0.9) return 'ok'
  if (ratio >= 0.6) return 'info'
  if (ratio >= 0.35) return 'warning'
  return 'critical'
}

const fmtGb = (bytes: number) => `${(bytes / GB).toFixed(1)} GB`

/**
 * Explainable scoring. Weights follow the PowerShell prototype (they total 100). Battery and
 * stability categories from the v1.0 proposal are intentionally absent until their inputs
 * are defined, so the score never contains made-up components.
 * This is a guide, not a validated benchmark.
 */
export function scoreHealth(input: ScoreInputs): {
  score: number
  grade: HealthGrade
  categories: ScanCategoryResult[]
  recommendations: Recommendation[]
} {
  const categories: ScanCategoryResult[] = []
  const recommendations: Recommendation[] = []

  const add = (
    c: Omit<ScanCategoryResult, 'severity' | 'recommendation'> & { recommendation?: Recommendation | null }
  ) => {
    const { recommendation, ...rest } = c
    categories.push({ ...rest, severity: sev(c.points, c.maxPoints), recommendation: recommendation?.detail ?? null })
    if (recommendation) recommendations.push(recommendation)
  }

  // Memory (25)
  {
    const v = input.ramUsedPct
    const points = v <= 60 ? 25 : v <= 75 ? 20 : v <= 85 ? 12 : 5
    add({
      id: 'memory',
      label: 'Memory',
      valueText: `${v}% in use`,
      points,
      maxPoints: 25,
      evidence: 'Median of several samples. Up to 60% scores full marks, above 85% scores lowest.',
      recommendation:
        points >= 20
          ? null
          : {
              id: 'rec-memory',
              title: v > 85 ? 'Memory is almost full' : 'Memory is busy',
              detail:
                v > 85
                  ? 'Close heavy apps and reduce startup apps. If this happens daily, more RAM would help most.'
                  : 'Close apps you are not using and review the startup list.',
              severity: v > 85 ? 'critical' : 'warning',
              action: 'performance'
            }
    })
  }

  // Storage (25)
  {
    const v = input.diskFreePct
    const points = v >= 25 ? 25 : v >= 15 ? 18 : v >= 10 ? 10 : 3
    add({
      id: 'storage',
      label: 'Storage',
      valueText: `${v}% free`,
      points,
      maxPoints: 25,
      evidence: 'Free space on the system drive. 25% or more scores full marks; under 10% hurts performance.',
      recommendation:
        points >= 25
          ? null
          : {
              id: 'rec-storage',
              title: v < 10 ? 'System drive is critically full' : 'System drive is getting full',
              detail: 'Run Smart Cleanup and review large files in Storage to free space.',
              severity: v < 10 ? 'critical' : 'warning',
              action: 'cleanup'
            }
    })
  }

  // CPU (15)
  {
    const v = input.cpuPct
    const points = v <= 30 ? 15 : v <= 60 ? 10 : 4
    add({
      id: 'cpu',
      label: 'CPU',
      valueText: `${v}% load`,
      points,
      maxPoints: 15,
      evidence: 'Median CPU load across the scan window while the app was otherwise idle.',
      recommendation:
        points >= 15
          ? null
          : {
              id: 'rec-cpu',
              title: 'CPU is busy at rest',
              detail: 'Check the resource-intensive processes list and close or remove the cause.',
              severity: v > 60 ? 'critical' : 'warning',
              action: 'performance'
            }
    })
  }

  // Startup (10)
  {
    const v = input.startupOn
    const points = v <= 8 ? 10 : v <= 15 ? 6 : 2
    add({
      id: 'startup',
      label: 'Startup apps',
      valueText: `${v} enabled of ${input.startupAll}`,
      points,
      maxPoints: 10,
      evidence: 'Number of enabled startup entries. Eight or fewer scores full marks.',
      recommendation:
        points >= 10
          ? null
          : {
              id: 'rec-startup',
              title: 'Many apps start with your computer',
              detail: 'Disable the ones you do not need. They stay installed and can be re-enabled.',
              severity: points <= 2 ? 'warning' : 'info',
              action: 'startup'
            }
    })
  }

  // Junk (10)
  {
    const v = input.junkBytes
    const points = v < 1 * GB ? 10 : v < 5 * GB ? 6 : 2
    add({
      id: 'junk',
      label: 'Junk files',
      valueText: fmtGb(v),
      points,
      maxPoints: 10,
      evidence: 'Temporary files, crash reports and browser caches found by a read-only scan.',
      recommendation:
        points >= 10
          ? null
          : {
              id: 'rec-junk',
              title: `${fmtGb(v)} of junk files found`,
              detail: 'Preview and clean them in Smart Cleanup. Nothing is removed without your approval.',
              severity: points <= 2 ? 'warning' : 'info',
              action: 'cleanup'
            }
    })
  }

  // Disk type (10)
  {
    const t = input.diskType
    const points = t === 'SSD' ? 10 : t === 'HDD' ? 3 : 7
    add({
      id: 'diskType',
      label: 'Storage type',
      valueText: t === 'Unknown' ? 'Could not detect' : t,
      points,
      maxPoints: 10,
      evidence:
        t === 'Unknown'
          ? 'The drive type could not be read, so a neutral score was used.'
          : 'Solid-state drives are much faster than hard disks for everyday use.',
      recommendation:
        t !== 'HDD'
          ? null
          : {
              id: 'rec-hdd',
              title: 'Windows runs on a hard disk',
              detail: 'Moving to an SSD is the single biggest speed upgrade available.',
              severity: 'info',
              action: null
            }
    })
  }

  // Uptime (5)
  {
    const v = input.uptimeDays
    const points = v <= 3 ? 5 : v <= 7 ? 3 : 0
    add({
      id: 'uptime',
      label: 'Time since restart',
      valueText: `${v.toFixed(1)} days`,
      points,
      maxPoints: 5,
      evidence: 'Restarting clears memory leaks and completes pending updates.',
      recommendation:
        points >= 5
          ? null
          : {
              id: 'rec-uptime',
              title: `No restart for ${v.toFixed(1)} days`,
              detail: 'Restart your computer to clear memory and finish updates.',
              severity: points === 0 ? 'warning' : 'info',
              action: 'restart'
            }
    })
  }

  const score = categories.reduce((sum, c) => sum + c.points, 0)
  return { score, grade: gradeFor(score), categories, recommendations }
}

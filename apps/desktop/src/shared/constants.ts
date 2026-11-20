import type { CleanupGroup } from './contracts'

/** Shown to every user in Settings > About PC Doctor. */
export const APP_AUTHOR = 'Ranjith Kumar'

export const SCAN_STEPS = [
  'Measuring CPU and memory',
  'Checking storage',
  'Reviewing startup apps',
  'Looking for junk files',
  'Detecting drive type',
  'Calculating your score'
] as const

export const CLEANUP_GROUP_LABELS: Record<CleanupGroup, { title: string; blurb: string }> = {
  system: { title: 'System files', blurb: 'Temporary files, crash reports and caches. Safe to remove.' },
  browser: { title: 'Browser caches', blurb: 'You stay signed in. Sites may load a little slower once.' },
  developer: { title: 'Developer caches', blurb: 'npm, Yarn, pip, NuGet and Gradle. Rebuilt automatically.' },
  heavy: { title: 'Large, slow to rebuild', blurb: 'Removing these means a long re-download. Opt in deliberately.' }
}

import type { HealthGrade } from './contracts'

export function gradeFor(score: number): HealthGrade {
  if (score >= 85) return 'Excellent'
  if (score >= 70) return 'Good'
  if (score >= 50) return 'Fair'
  return 'Needs attention'
}

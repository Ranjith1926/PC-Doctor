import { animate, motion, useMotionValue, useTransform } from 'framer-motion'
import { useEffect, useState } from 'react'
import { useChartColors } from '@/app/theme'
import { usePrefersReducedMotion } from '@/hooks/useEngine'
import { gradeFor } from '@shared/grade'

interface HealthScoreRingProps {
  /** null means "no scan yet": the ring is empty and says so, rather than showing an invented number. */
  score: number | null
  size?: number
  caption?: string
}

export function HealthScoreRing({ score, size = 220, caption }: HealthScoreRingProps) {
  const colors = useChartColors()
  const reduced = usePrefersReducedMotion()
  const stroke = 14
  const radius = (size - stroke) / 2
  const circumference = 2 * Math.PI * radius
  const value = useMotionValue(0)
  const offset = useTransform(value, (v) => circumference * (1 - v / 100))
  const [shown, setShown] = useState(0)

  useEffect(() => {
    if (score === null) return
    const controls = animate(value, score, { duration: reduced ? 0 : 1.1, ease: [0.2, 0.8, 0.2, 1] })
    const off = value.on('change', (v) => setShown(Math.round(v)))
    return () => {
      controls.stop()
      off()
    }
  }, [score, value, reduced])

  const grade = score === null ? null : gradeFor(score)
  const tone = score === null ? colors.line : score >= 85 ? colors.success : score >= 70 ? colors.primary : score >= 50 ? colors.warning : colors.danger

  return (
    <div
      role="img"
      aria-label={score === null ? 'PC health score: no scan yet' : `PC health score ${score} out of 100, ${grade}`}
      className="relative grid place-items-center"
      style={{ width: size, height: size }}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90" aria-hidden>
        <defs>
          <linearGradient id="ring-grad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor={tone} />
            <stop offset="100%" stopColor={score !== null && score >= 70 ? colors.accent : tone} />
          </linearGradient>
        </defs>
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke={colors.line} strokeOpacity={0.45} strokeWidth={stroke} />
        {score !== null && (
          <motion.circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="url(#ring-grad)"
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={circumference}
            style={{ strokeDashoffset: offset, filter: `drop-shadow(0 0 10px ${tone}66)` }}
          />
        )}
      </svg>
      <div className="absolute inset-0 grid place-content-center text-center">
        <div className="num text-[56px] font-semibold leading-none text-fg">{score === null ? '—' : shown}</div>
        <div className="mt-1 text-[13px] font-medium" style={{ color: tone }}>
          {grade ?? 'No scan yet'}
        </div>
        {caption && <div className="mt-0.5 text-xs text-subtle">{caption}</div>}
      </div>
    </div>
  )
}

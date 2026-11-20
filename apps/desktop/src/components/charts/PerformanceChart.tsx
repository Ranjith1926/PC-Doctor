import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { useChartColors } from '@/app/theme'
import { usePrefersReducedMotion } from '@/hooks/useEngine'

export interface Series {
  key: string
  label: string
  color: string
}

interface PerformanceChartProps {
  data: Array<Record<string, number>>
  series: Series[]
  xKey?: string
  yDomain?: [number, number]
  unit?: string
  height?: number
  xFormatter?: (x: number) => string
  /** Plain-language summary for screen readers. */
  summary: string
}

export function PerformanceChart({ data, series, xKey = 'x', yDomain = [0, 100], unit = '%', height = 220, xFormatter, summary }: PerformanceChartProps) {
  const colors = useChartColors()
  const reduced = usePrefersReducedMotion()
  const fmtX = xFormatter ?? ((x: number) => new Date(x).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }))

  return (
    <div role="img" aria-label={summary} style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 6, right: 8, bottom: 0, left: -18 }}>
          <defs>
            {series.map((s) => (
              <linearGradient key={s.key} id={`fill-${s.key}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={s.color} stopOpacity={0.35} />
                <stop offset="100%" stopColor={s.color} stopOpacity={0} />
              </linearGradient>
            ))}
          </defs>
          <CartesianGrid stroke={colors.line} strokeOpacity={0.35} vertical={false} />
          <XAxis dataKey={xKey} tickFormatter={fmtX} stroke={colors.subtle} tick={{ fontSize: 11 }} tickLine={false} axisLine={false} minTickGap={48} />
          <YAxis domain={yDomain} stroke={colors.subtle} tick={{ fontSize: 11 }} tickLine={false} axisLine={false} unit={unit} width={52} />
          <Tooltip
            cursor={{ stroke: colors.line }}
            content={({ active, payload, label }) =>
              active && payload?.length ? (
                <div className="glass-strong rounded-lg px-3 py-2 text-xs">
                  <div className="mb-1 text-subtle">{fmtX(Number(label))}</div>
                  {payload.map((p) => (
                    <div key={String(p.dataKey)} className="flex items-center gap-2 text-fg">
                      <span className="size-2 rounded-full" style={{ background: p.color }} aria-hidden />
                      {p.name}: <span className="num font-medium">{Math.round(Number(p.value))}{unit}</span>
                    </div>
                  ))}
                </div>
              ) : null
            }
          />
          {series.map((s) => (
            <Area
              key={s.key}
              type="monotone"
              dataKey={s.key}
              name={s.label}
              stroke={s.color}
              strokeWidth={2}
              fill={`url(#fill-${s.key})`}
              isAnimationActive={!reduced}
              animationDuration={600}
              dot={false}
            />
          ))}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}

export function ChartLegend({ series }: { series: Series[] }) {
  return (
    <ul className="flex flex-wrap items-center gap-4 text-xs text-muted">
      {series.map((s) => (
        <li key={s.key} className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-full" style={{ background: s.color }} aria-hidden />
          {s.label}
        </li>
      ))}
    </ul>
  )
}

import { Cell, Pie, PieChart, ResponsiveContainer } from 'recharts'
import { useChartColors } from '@/app/theme'
import { usePrefersReducedMotion } from '@/hooks/useEngine'
import { formatBytes } from '@/utils/format'

export function StorageDonut({ usedBytes, totalBytes }: { usedBytes: number; totalBytes: number }) {
  const colors = useChartColors()
  const reduced = usePrefersReducedMotion()
  const freeBytes = Math.max(0, totalBytes - usedBytes)
  const pct = totalBytes > 0 ? Math.round((usedBytes / totalBytes) * 100) : 0
  const data = [
    { name: 'Used', value: usedBytes, fill: pct >= 90 ? colors.danger : pct >= 80 ? colors.warning : colors.primary },
    { name: 'Free', value: freeBytes, fill: colors.line }
  ]
  return (
    <div role="img" aria-label={`System drive ${pct}% used: ${formatBytes(usedBytes)} of ${formatBytes(totalBytes)}`} className="relative h-48 w-48">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie data={data} dataKey="value" innerRadius="72%" outerRadius="100%" startAngle={90} endAngle={-270} stroke="none" isAnimationActive={!reduced} animationDuration={700}>
            {data.map((d) => (
              <Cell key={d.name} fill={d.fill} />
            ))}
          </Pie>
        </PieChart>
      </ResponsiveContainer>
      <div className="absolute inset-0 grid place-content-center text-center">
        <div className="num text-3xl font-semibold text-fg">{pct}%</div>
        <div className="text-xs text-subtle">used</div>
      </div>
    </div>
  )
}

export interface BarItem {
  name: string
  sizeBytes: number
  note?: string
}

/** Horizontal size bars. Plain DOM so every row is real, readable text. */
export function StorageBars({ items, emptyText = 'Nothing to show.' }: { items: BarItem[]; emptyText?: string }) {
  const max = Math.max(1, ...items.map((i) => i.sizeBytes))
  if (items.length === 0) return <p className="text-sm text-muted">{emptyText}</p>
  return (
    <ul className="space-y-3">
      {items.map((item) => (
        <li key={item.name}>
          <div className="mb-1 flex items-baseline justify-between gap-3 text-sm">
            <span className="min-w-0 truncate text-fg" title={item.name}>
              {item.name}
              {item.note && <span className="ml-2 text-xs text-subtle">{item.note}</span>}
            </span>
            <span className="num shrink-0 text-muted">{formatBytes(item.sizeBytes)}</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-line" aria-hidden>
            <div className="h-full rounded-full bg-gradient-to-r from-primary to-accent transition-[width] duration-500" style={{ width: `${Math.max(1.5, (item.sizeBytes / max) * 100)}%` }} />
          </div>
        </li>
      ))}
    </ul>
  )
}

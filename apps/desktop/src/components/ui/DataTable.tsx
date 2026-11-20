import { ArrowDown, ArrowUp, ChevronsUpDown } from 'lucide-react'
import { useMemo, useState, type ReactNode } from 'react'
import { cn } from '@/utils/format'

export interface Column<T> {
  key: string
  header: string
  cell: (row: T) => ReactNode
  /** Provide to make the column sortable. */
  sortValue?: (row: T) => string | number
  align?: 'left' | 'right'
  className?: string
}

interface DataTableProps<T> {
  columns: Column<T>[]
  rows: T[]
  rowKey: (row: T) => string
  caption: string
  empty?: ReactNode
  defaultSort?: { key: string; dir: 'asc' | 'desc' }
  maxHeight?: string
}

export function DataTable<T>({ columns, rows, rowKey, caption, empty, defaultSort, maxHeight = '100%' }: DataTableProps<T>) {
  const [sort, setSort] = useState(defaultSort ?? null)

  const sorted = useMemo(() => {
    const col = columns.find((c) => c.key === sort?.key)
    if (!sort || !col?.sortValue) return rows
    const get = col.sortValue
    const factor = sort.dir === 'asc' ? 1 : -1
    return [...rows].sort((a, b) => {
      const x = get(a)
      const y = get(b)
      return (typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y))) * factor
    })
  }, [rows, columns, sort])

  if (rows.length === 0 && empty) return <>{empty}</>

  return (
    <div className="overflow-auto rounded-card" style={{ maxHeight }}>
      <table className="w-full border-collapse text-sm">
        <caption className="sr-only">{caption}</caption>
        <thead className="sticky top-0 z-10 bg-[var(--glass-strong)] backdrop-blur-md">
          <tr>
            {columns.map((c) => {
              const active = sort?.key === c.key
              return (
                <th
                  key={c.key}
                  scope="col"
                  aria-sort={active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : undefined}
                  className={cn('border-b border-line px-4 py-2.5 text-xs font-medium uppercase tracking-wide text-subtle', c.align === 'right' ? 'text-right' : 'text-left', c.className)}
                >
                  {c.sortValue ? (
                    <button
                      type="button"
                      onClick={() => setSort(active && sort.dir === 'asc' ? { key: c.key, dir: 'desc' } : { key: c.key, dir: 'asc' })}
                      className="inline-flex cursor-pointer items-center gap-1 uppercase hover:text-fg"
                    >
                      {c.header}
                      {active ? sort.dir === 'asc' ? <ArrowUp className="size-3" aria-hidden /> : <ArrowDown className="size-3" aria-hidden /> : <ChevronsUpDown className="size-3 opacity-60" aria-hidden />}
                    </button>
                  ) : (
                    c.header
                  )}
                </th>
              )
            })}
          </tr>
        </thead>
        <tbody>
          {sorted.map((row) => (
            <tr key={rowKey(row)} className="border-b border-line/60 transition-colors last:border-0 hover:bg-line/50">
              {columns.map((c) => (
                <td key={c.key} className={cn('px-4 py-3 align-middle', c.align === 'right' && 'text-right', c.className)}>
                  {c.cell(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

import { cn } from '@/utils/format'

/** Real icon when the engine could extract one; otherwise a neutral lettered tile. Never a fake logo. */
export function AppIcon({ src, name, className }: { src: string | null; name: string; className?: string }) {
  if (src) return <img src={src} alt="" width={28} height={28} className={cn('size-7 shrink-0 rounded-md', className)} draggable={false} />
  return (
    <span className={cn('grid size-7 shrink-0 place-items-center rounded-md bg-primary/14 text-xs font-semibold uppercase text-primary', className)} aria-hidden>
      {name.trim().charAt(0) || '?'}
    </span>
  )
}

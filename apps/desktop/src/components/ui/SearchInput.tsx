import { Search, X } from 'lucide-react'
import { cn } from '@/utils/format'

interface SearchInputProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  label: string
  className?: string
}

export function SearchInput({ value, onChange, placeholder = 'Search', label, className }: SearchInputProps) {
  return (
    <div className={cn('glass no-drag relative flex h-10 items-center rounded-control focus-within:ring-2 focus-within:ring-[var(--ring)]', className)}>
      <Search className="pointer-events-none absolute left-3 size-4 text-subtle" aria-hidden />
      <input
        type="search"
        aria-label={label}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="selectable h-full w-full min-w-0 bg-transparent pl-9 pr-8 text-sm text-fg outline-none placeholder:text-subtle [&::-webkit-search-cancel-button]:hidden"
      />
      {value && (
        <button type="button" aria-label="Clear search" onClick={() => onChange('')} className="absolute right-2 grid size-6 cursor-pointer place-items-center rounded text-subtle hover:text-fg">
          <X className="size-4" aria-hidden />
        </button>
      )}
    </div>
  )
}

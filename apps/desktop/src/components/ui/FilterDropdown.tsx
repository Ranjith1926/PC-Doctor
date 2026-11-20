import * as Dropdown from '@radix-ui/react-dropdown-menu'
import { Check, ChevronDown } from 'lucide-react'
import { cn } from '@/utils/format'

export interface FilterOption<T extends string> {
  value: T
  label: string
}

interface FilterDropdownProps<T extends string> {
  label: string
  value: T
  options: FilterOption<T>[]
  onChange: (value: T) => void
}

export function FilterDropdown<T extends string>({ label, value, options, onChange }: FilterDropdownProps<T>) {
  const current = options.find((o) => o.value === value)
  return (
    <Dropdown.Root>
      <Dropdown.Trigger
        aria-label={`${label}: ${current?.label ?? ''}`}
        className="glass no-drag inline-flex h-10 cursor-pointer items-center gap-2 rounded-control px-3 text-sm text-fg hover:bg-surface-strong"
      >
        <span className="text-subtle">{label}</span>
        <span className="font-medium">{current?.label}</span>
        <ChevronDown className="size-4 text-subtle" aria-hidden />
      </Dropdown.Trigger>
      <Dropdown.Portal>
        <Dropdown.Content
          align="end"
          sideOffset={6}
          className="glass-strong z-50 min-w-44 rounded-card p-1.5 data-[state=open]:animate-[menuIn_140ms_var(--ease-out)]"
        >
          <Dropdown.RadioGroup value={value} onValueChange={(v) => onChange(v as T)}>
            {options.map((o) => (
              <Dropdown.RadioItem
                key={o.value}
                value={o.value}
                className={cn('flex cursor-pointer items-center justify-between gap-6 rounded-lg px-3 py-2 text-sm text-fg outline-none', 'data-[highlighted]:bg-line')}
              >
                {o.label}
                <Dropdown.ItemIndicator>
                  <Check className="size-4 text-primary" aria-hidden />
                </Dropdown.ItemIndicator>
              </Dropdown.RadioItem>
            ))}
          </Dropdown.RadioGroup>
        </Dropdown.Content>
      </Dropdown.Portal>
    </Dropdown.Root>
  )
}

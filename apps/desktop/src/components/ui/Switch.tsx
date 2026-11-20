import * as RadixSwitch from '@radix-ui/react-switch'
import { cn } from '@/utils/format'

interface SwitchProps {
  checked: boolean
  onCheckedChange: (checked: boolean) => void
  label: string
  disabled?: boolean
}

export function Switch({ checked, onCheckedChange, label, disabled }: SwitchProps) {
  return (
    <RadixSwitch.Root
      checked={checked}
      onCheckedChange={onCheckedChange}
      disabled={disabled}
      aria-label={label}
      className={cn(
        'no-drag relative h-6 w-11 shrink-0 cursor-pointer rounded-full border border-line-strong transition-colors duration-200',
        'data-[state=checked]:border-primary data-[state=checked]:bg-primary data-[state=unchecked]:bg-line',
        'disabled:cursor-not-allowed disabled:opacity-50'
      )}
    >
      <RadixSwitch.Thumb
        className={cn(
          'block size-[18px] translate-x-[3px] rounded-full bg-white shadow transition-transform duration-200',
          'data-[state=checked]:translate-x-[22px]'
        )}
      />
    </RadixSwitch.Root>
  )
}

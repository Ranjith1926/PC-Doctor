import * as Dialog from '@radix-ui/react-dialog'
import { AlertTriangle, X } from 'lucide-react'
import type { ReactNode } from 'react'
import { Button } from './Button'

interface ConfirmDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description: string
  confirmLabel: string
  cancelLabel?: string
  tone?: 'default' | 'danger'
  loading?: boolean
  /** Extra content such as the preview list of what will change. */
  children?: ReactNode
  onConfirm: () => void
}

/** Every destructive or system-changing action goes through this dialog. Escape and Cancel dismiss it without doing anything. */
export function ConfirmDialog({ open, onOpenChange, title, description, confirmLabel, cancelLabel = 'Cancel', tone = 'default', loading, children, onConfirm }: ConfirmDialogProps) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 grid place-items-center bg-black/50 backdrop-blur-[3px] data-[state=open]:animate-[fadeIn_160ms_ease-out]">
        <Dialog.Content className="glass-strong w-[min(520px,calc(100vw-48px))] rounded-card p-6 data-[state=open]:animate-[dialogIn_200ms_var(--ease-out)]">
          <div className="flex items-start gap-3">
            {tone === 'danger' && (
              <span className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-full bg-danger/15 text-danger">
                <AlertTriangle className="size-5" aria-hidden />
              </span>
            )}
            <div className="min-w-0 flex-1">
              <Dialog.Title className="text-lg font-semibold text-fg">{title}</Dialog.Title>
              <Dialog.Description className="mt-1.5 text-sm text-muted">{description}</Dialog.Description>
            </div>
            <Dialog.Close aria-label="Close dialog" className="grid size-8 cursor-pointer place-items-center rounded-lg text-subtle hover:bg-line hover:text-fg">
              <X className="size-4" aria-hidden />
            </Dialog.Close>
          </div>
          {children && <div className="mt-4 max-h-[40vh] overflow-y-auto">{children}</div>}
          <div className="mt-6 flex justify-end gap-2">
            <Dialog.Close asChild>
              <Button variant="ghost">{cancelLabel}</Button>
            </Dialog.Close>
            <Button variant={tone === 'danger' ? 'danger' : 'primary'} loading={loading} onClick={onConfirm}>
              {confirmLabel}
            </Button>
          </div>
        </Dialog.Content>
        </Dialog.Overlay>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

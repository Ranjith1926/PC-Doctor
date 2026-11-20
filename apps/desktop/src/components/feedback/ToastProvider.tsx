import { AnimatePresence, motion } from 'framer-motion'
import { AlertOctagon, AlertTriangle, CheckCircle2, Info, X } from 'lucide-react'
import { useToasts, type ToastTone } from '@/stores/toastStore'

const icons: Record<ToastTone, { icon: React.ReactNode; cls: string }> = {
  success: { icon: <CheckCircle2 className="size-5" />, cls: 'text-success' },
  info: { icon: <Info className="size-5" />, cls: 'text-primary' },
  warning: { icon: <AlertTriangle className="size-5" />, cls: 'text-warning' },
  danger: { icon: <AlertOctagon className="size-5" />, cls: 'text-danger' }
}

/** Minimal, polite notifications. Rendered once at the app root. */
export function ToastProvider() {
  const toasts = useToasts((s) => s.toasts)
  const dismiss = useToasts((s) => s.dismiss)
  return (
    <div className="pointer-events-none fixed bottom-5 right-5 z-[60] flex w-[min(380px,calc(100vw-40px))] flex-col gap-2" role="status" aria-live="polite">
      <AnimatePresence initial={false}>
        {toasts.map((t) => (
          <motion.div
            key={t.id}
            layout
            initial={{ opacity: 0, y: 16, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, x: 24 }}
            transition={{ duration: 0.18, ease: [0.2, 0.8, 0.2, 1] }}
            className="glass-strong pointer-events-auto flex items-start gap-3 rounded-card p-4"
          >
            <span className={icons[t.tone].cls} aria-hidden>
              {icons[t.tone].icon}
            </span>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold text-fg">{t.title}</div>
              {t.description && <div className="mt-0.5 text-[13px] text-muted">{t.description}</div>}
            </div>
            <button type="button" aria-label="Dismiss notification" onClick={() => dismiss(t.id)} className="grid size-6 cursor-pointer place-items-center rounded text-subtle hover:text-fg">
              <X className="size-4" aria-hidden />
            </button>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  )
}

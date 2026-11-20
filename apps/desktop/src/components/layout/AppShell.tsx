import { MotionConfig } from 'framer-motion'
import { Suspense } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { useLiveMetrics } from '@/hooks/useEngine'
import { ErrorBoundary, LoadingSkeleton } from '../feedback/States'
import { ToastProvider } from '../feedback/ToastProvider'
import { CommandPalette } from './CommandPalette'
import { Sidebar } from './Sidebar'
import { TopBar } from './TopBar'

/** Keeps live readings flowing into the shared history for as long as the app is open. */
function MetricsCollector() {
  useLiveMetrics()
  return null
}

export function AppShell() {
  const { pathname } = useLocation()
  return (
    // reducedMotion="user" makes every Framer Motion animation honour the OS setting.
    <MotionConfig reducedMotion="user">
      <div className="flex h-full">
        <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[70] focus:rounded-lg focus:bg-primary focus:px-3 focus:py-2 focus:text-primary-fg">
          Skip to content
        </a>
        <Sidebar />
        <div className="flex min-w-0 flex-1 flex-col">
          <TopBar />
          <main id="main" tabIndex={-1} className="min-h-0 flex-1 overflow-y-auto px-6 pb-8 outline-none">
            <div key={pathname} className="mx-auto w-full max-w-[1280px] animate-[pageIn_220ms_var(--ease-out)]">
              <ErrorBoundary key={pathname}>
                <Suspense fallback={<LoadingSkeleton rows={6} className="pt-4" />}>
                  <Outlet />
                </Suspense>
              </ErrorBoundary>
            </div>
          </main>
        </div>
        <MetricsCollector />
        <CommandPalette />
        <ToastProvider />
      </div>
    </MotionConfig>
  )
}

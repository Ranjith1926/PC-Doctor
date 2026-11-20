import { QueryClientProvider } from '@tanstack/react-query'
import { lazy } from 'react'
import { HashRouter, Route, Routes } from 'react-router-dom'
import { AppShell } from '@/components/layout/AppShell'
import { queryClient } from './queryClient'
import { ThemeProvider } from './theme'

// Routes are lazy-loaded so the first paint only carries the shell.
const Dashboard = lazy(() => import('@/features/dashboard/DashboardPage'))
const HealthScan = lazy(() => import('@/features/health-scan/HealthScanPage'))
const Cleanup = lazy(() => import('@/features/cleanup/CleanupPage'))
const Startup = lazy(() => import('@/features/startup/StartupPage'))
const Performance = lazy(() => import('@/features/performance/PerformancePage'))
const Storage = lazy(() => import('@/features/storage/StoragePage'))
const Applications = lazy(() => import('@/features/applications/ApplicationsPage'))
const Maintenance = lazy(() => import('@/features/maintenance/MaintenancePage'))
const Reports = lazy(() => import('@/features/reports/ReportsPage'))
const Settings = lazy(() => import('@/features/settings/SettingsPage'))
const Licensing = lazy(() => import('@/features/licensing/LicensingPage'))

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        {/* HashRouter: the packaged app is served from file://, which has no server-side routing. */}
        <HashRouter>
          <Routes>
            <Route element={<AppShell />}>
              <Route index element={<Dashboard />} />
              <Route path="health-scan" element={<HealthScan />} />
              <Route path="cleanup" element={<Cleanup />} />
              <Route path="startup" element={<Startup />} />
              <Route path="performance" element={<Performance />} />
              <Route path="storage" element={<Storage />} />
              <Route path="applications" element={<Applications />} />
              <Route path="maintenance" element={<Maintenance />} />
              <Route path="reports" element={<Reports />} />
              <Route path="settings" element={<Settings />} />
              <Route path="licensing" element={<Licensing />} />
              <Route path="*" element={<Dashboard />} />
            </Route>
          </Routes>
        </HashRouter>
      </ThemeProvider>
    </QueryClientProvider>
  )
}

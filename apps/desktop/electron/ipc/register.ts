import { ipcMain, type IpcMainInvokeEvent } from 'electron'
import { z } from 'zod'
import { IPC } from '../../src/shared/contracts'
import type { Engine } from '../main/engine'
import { fail } from '../main/engine/util'

/** Only the app's own renderer may call the engine: the packaged file:// page or the dev server origin. */
function isTrusted(event: IpcMainInvokeEvent): boolean {
  const url = event.senderFrame?.url ?? ''
  const dev = process.env['ELECTRON_RENDERER_URL']
  return url.startsWith('file://') || (!!dev && url.startsWith(dev))
}

type Handler = (event: IpcMainInvokeEvent, ...args: unknown[]) => unknown

function handle(channel: string, schema: z.ZodType | null, fn: (args: never) => unknown) {
  const handler: Handler = async (event, ...args) => {
    if (!isTrusted(event)) return fail('denied', 'Request rejected: untrusted sender.')
    if (schema) {
      const parsed = schema.safeParse(args)
      if (!parsed.success) return fail('error', 'Request rejected: invalid arguments.')
      return fn(parsed.data as never)
    }
    return fn([] as never)
  }
  ipcMain.handle(channel, handler)
}

export function registerIpc(engine: Engine): void {
  handle(IPC.getAppInfo, null, () => engine.getAppInfo())
  handle(IPC.getSystemInfo, null, () => engine.getSystemInfo())
  handle(IPC.getMetrics, null, () => engine.getMetrics())
  handle(IPC.getTopProcesses, null, () => engine.getTopProcesses())
  handle(IPC.cancelHealthScan, null, () => engine.cancelHealthScan())
  handle(IPC.getHealthHistory, null, () => engine.getHealthHistory())
  handle(IPC.scanCleanup, null, () => engine.scanCleanup())
  handle(IPC.getCleanupHistory, null, () => engine.getCleanupHistory())
  handle(IPC.listStartup, null, () => engine.listStartup())
  handle(IPC.getStartupSnapshotInfo, null, () => engine.getStartupSnapshotInfo())
  handle(IPC.restoreStartupSnapshot, null, () => engine.restoreStartupSnapshot())
  handle(IPC.listApps, null, () => engine.listApps())

  handle(IPC.runCleanup, z.tuple([z.array(z.string().max(64)).max(40)]), ([ids]: [string[]]) => engine.runCleanup(ids))
  handle(IPC.setStartupEnabled, z.tuple([z.string().max(300), z.boolean()]), ([id, enabled]: [string, boolean]) => engine.setStartupEnabled(id, enabled))
  handle(IPC.uninstallApp, z.tuple([z.string().max(64)]), ([id]: [string]) => engine.uninstallApp(id))
  handle(IPC.analyzeFolder, z.tuple([z.enum(['home', 'choose'])]), ([t]: ['home' | 'choose']) => engine.analyzeFolder(t))
  handle(IPC.exportReport, z.tuple([z.enum(['html', 'pdf'])]), ([f]: ['html' | 'pdf']) => engine.exportReport(f))
  handle(IPC.setLaunchAtLogin, z.tuple([z.boolean()]), ([v]: [boolean]) => engine.setLaunchAtLogin(v))
  handle(IPC.setTheme, z.tuple([z.enum(['dark', 'light'])]), ([t]: ['dark' | 'light']) => engine.setTheme(t))
  handle(IPC.registerSchedule, z.tuple([z.enum(['weekly', 'monthly', 'off'])]), () => engine.registerSchedule())
  handle(IPC.getLicense, null, () => engine.getLicense())
  handle(IPC.deactivateLicense, null, () => engine.deactivateLicense())
  handle(IPC.activateLicense, z.tuple([z.string().max(400)]), ([key]: [string]) => engine.activateLicense(key))

  // The scan streams progress back to the window that asked for it.
  ipcMain.handle(IPC.runHealthScan, async (event) => {
    if (!isTrusted(event)) return fail('denied', 'Request rejected: untrusted sender.')
    return engine.runHealthScan((p) => {
      if (!event.sender.isDestroyed()) event.sender.send(IPC.scanProgress, p)
    })
  })
}

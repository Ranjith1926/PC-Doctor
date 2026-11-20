import { BrowserWindow, dialog } from 'electron'
import { writeFile } from 'node:fs/promises'
import type { CleanupHistoryEntry, HealthSnapshot, ReportExportResult, Result, SystemInfo } from '../../../src/shared/contracts'
import { fail, ok } from './util'

const esc = (value: unknown) =>
  String(value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string)

const gb = (bytes: number) => `${(bytes / 1024 ** 3).toFixed(1)} GB`
const when = (ms: number) => new Date(ms).toLocaleString()

/** Builds a self-contained report from real stored history. All values are HTML-escaped. */
export function buildReportHtml(system: SystemInfo, snapshots: HealthSnapshot[], cleanups: CleanupHistoryEntry[]): string {
  const latest = snapshots.at(-1)
  const recovered = cleanups.reduce((s, c) => s + c.freedBytes, 0)
  const rows = snapshots
    .slice(-30)
    .reverse()
    .map((s) => `<tr><td>${esc(when(s.timestamp))}</td><td class="n">${s.score}</td><td class="n">${s.cpuPct}%</td><td class="n">${s.ramUsedPct}%</td><td class="n">${esc(gb(s.diskFreeBytes))}</td><td class="n">${esc(gb(s.junkBytes))}</td></tr>`)
    .join('')
  const cleanRows = cleanups
    .slice(-20)
    .reverse()
    .map((c) => `<tr><td>${esc(when(c.timestamp))}</td><td class="n">${esc(gb(c.freedBytes))}</td><td>${esc(c.itemNames.join(', '))}</td></tr>`)
    .join('')

  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>PC Doctor report - ${esc(system.hostname)}</title>
<style>
 body{font-family:Segoe UI,-apple-system,Arial,sans-serif;max-width:900px;margin:32px auto;padding:0 20px;color:#16203a;background:#f5f7fb}
 .card{background:#fff;border:1px solid #d9e0ee;border-radius:12px;padding:20px 24px;margin-bottom:18px}
 h1{font-size:22px;margin:0 0 4px}h2{font-size:15px;margin:0 0 12px}
 .score{font-size:48px;font-weight:700;color:#2563eb}.muted{color:#51607f;font-size:13px}
 table{width:100%;border-collapse:collapse;font-size:13px}td,th{padding:7px 8px;border-bottom:1px solid #e6ebf5;text-align:left}th{color:#51607f}.n{text-align:right}
</style></head><body>
<div class="card"><h1>PC Doctor health report</h1>
<p class="muted">${esc(system.hostname)} · ${esc(system.platform)} ${esc(system.osRelease)} · ${esc(system.cpuModel)} · generated ${esc(when(Date.now()))}</p>
${latest ? `<div class="score">${latest.score}<span class="muted"> / 100</span></div><p class="muted">Latest scan: ${esc(when(latest.timestamp))}. The score is a guide based on the checks listed below, not a validated benchmark.</p>` : '<p>No health scans have been recorded yet.</p>'}
</div>
<div class="card"><h2>Health history (last ${Math.min(30, snapshots.length)} scans)</h2>
<table><tr><th>Date</th><th class="n">Score</th><th class="n">CPU</th><th class="n">Memory</th><th class="n">Free space</th><th class="n">Junk</th></tr>${rows || '<tr><td colspan="6">No data.</td></tr>'}</table></div>
<div class="card"><h2>Cleanup history · ${esc(gb(recovered))} recovered in total</h2>
<table><tr><th>Date</th><th class="n">Recovered</th><th>Items</th></tr>${cleanRows || '<tr><td colspan="3">No cleanups have been run.</td></tr>'}</table></div>
</body></html>`
}

export async function exportReport(
  format: 'html' | 'pdf',
  html: string,
  parent: BrowserWindow | null
): Promise<Result<ReportExportResult>> {
  const stamp = new Date().toISOString().slice(0, 10)
  const options = {
    title: 'Save PC Doctor report',
    defaultPath: `PC-Doctor-Report-${stamp}.${format}`,
    filters: [{ name: format.toUpperCase(), extensions: [format] }]
  }
  const picked = parent ? await dialog.showSaveDialog(parent, options) : await dialog.showSaveDialog(options)
  if (picked.canceled || !picked.filePath) return fail('cancelled', 'Export cancelled.')

  if (format === 'html') {
    await writeFile(picked.filePath, html, 'utf8')
    return ok({ filePath: picked.filePath })
  }

  // PDF: render in a hidden, sandboxed window with JavaScript disabled.
  const win = new BrowserWindow({ show: false, webPreferences: { sandbox: true, javascript: false, contextIsolation: true } })
  try {
    await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`)
    const pdf = await win.webContents.printToPDF({ printBackground: true, pageSize: 'A4' })
    await writeFile(picked.filePath, pdf)
    return ok({ filePath: picked.filePath })
  } finally {
    win.destroy()
  }
}

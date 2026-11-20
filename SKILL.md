---
name: pc-doctor
description: Work on, extend, debug, or operate PC Doctor, a PowerShell tool for Windows 10/11 that scores PC health, safely cleans junk, manages startup apps, uninstalls apps and applies speed tweaks, and the planned commercial cross-platform product (Electron + React + C#/.NET engine + SQLite). Use when asked to modify PC-Doctor.ps1, add cleanup targets or tweaks, change the scoring, fix its behaviour, explain how to run or schedule it, or plan or build the commercial v1.0 architecture.
---

# PC Doctor

## Overview

PC Doctor v1.1 is a single-file PowerShell tool (`PC-Doctor.ps1`, about 1,000 lines) for Windows 10/11 work PCs. It measures system health, produces a 0–100 performance score with an HTML report, and offers guided cleanup and tuning. Every destructive action shows a preview and asks first, except the explicit AUTO mode, which follows fixed, conservative rules.

### Project files

| File | Purpose |
|---|---|
| `PC-Doctor.ps1` | All logic: menu, health check, cleanup, startup manager, uninstaller, tweaks, scheduler. |
| `Run-PC-Doctor.bat` | Launcher for the interactive menu. Passes `%*` through to the script. |
| `Run-PC-Doctor-AUTO.bat` | Launcher that runs `-Auto` (full tune-up, no questions). |

There is no build step, no dependencies, and no test suite. The tool runs on stock Windows PowerShell 5.1.

## How to run

| Goal | Command |
|---|---|
| Interactive menu | Double-click `Run-PC-Doctor.bat` |
| No questions | Double-click `Run-PC-Doctor-AUTO.bat`, or `PC-Doctor.ps1 -Auto` |
| Report only (no changes) | `powershell -ExecutionPolicy Bypass -File PC-Doctor.ps1 -ReportOnly` |
| Weekly schedule | Menu option 9 (registers the task `PC Doctor Auto Tune-up`, Mondays 1:30 PM, runs `-Auto -Unattended`) |

The script re-launches itself elevated (UAC prompt) if it is not already running as administrator.

### Output location: `%USERPROFILE%\PC-Doctor\`

- `log-<timestamp>.txt` – run log
- `score-history.csv` – one row per health check (Date, Score, RamUsedPct, DiskFreeGB, CpuLoad, StartupOn, JunkGB)
- `PC-Health-Report-<timestamp>.html` – the report
- `state.json` – `LastDevClean` and `LastDism` timestamps used by AUTO mode throttling

## Requirements for changes (functional)

1. Nothing is deleted or modified without a preview and a confirmation, except in `-Auto` mode, which must stay within the rules in "AUTO mode rules" below.
2. User folders (Downloads, Documents, Desktop, Pictures, Videos, Music, OneDrive, `source`, `AndroidStudioProjects`, `Program Files`) are never cleaned. This is enforced by `Test-SafeCleanPath`; do not bypass it.
3. All deletions go through `Remove-PathContents`, never through a direct `Remove-Item` on a computed path.
4. A restore point (`New-SafetyRestorePoint`) is created once per session before uninstalls and interactive tweaks.
5. Startup apps are toggled through the `StartupApproved` registry keys, the same mechanism Task Manager uses, so the change is reversible there.
6. Every action is written with `Write-Log` so it appears in the log file.

## Technical approach

### Structure of `PC-Doctor.ps1`

| Section | Key functions |
|---|---|
| Setup | `Test-Admin`, self-elevation, `$Script:OutDir`, `$Script:LogFile` |
| Helpers | `Write-Log`, `Format-Size`, `Get-Median`, `Get-State` / `Save-State`, `Confirm-Step`, `Get-PathSize`, `Test-SafeCleanPath`, `Remove-PathContents`, `New-SafetyRestorePoint` |
| Cleanup list | `Get-CleanupTargets`, `Get-RecycleBinSize` |
| Startup apps | `Get-StartupEntries`, `Get-ApprovedEnabled`, `Set-ApprovedEnabled`, `$Script:KeepPattern` |
| Health and score | `Get-HealthData`, `Get-Score`, `Save-HtmlReport`, `Invoke-HealthCheck` |
| Cleanup | `Invoke-CleanTarget`, `Invoke-DismCleanup`, `Invoke-Cleanup` |
| Managers | `Invoke-StartupManager`, `Get-InstalledApps`, `Invoke-Uninstaller`, `Invoke-Tweaks` |
| Automation | `Set-AutoTweaks`, `Invoke-AutoTuneUp`, `Install-AutoSchedule` |
| Main | Parameter handling, then the menu loop (`switch -Regex`) |

### Parameters

- `-ReportOnly`: health check only, then exit.
- `-Auto`: runs `Invoke-AutoTuneUp`.
- `-Unattended`: suppresses pauses and opening windows (used by the scheduled task).

### Menu

1 Health check · 2 Clean junk · 3 Startup apps · 4 Uninstall apps · 5 Tweaks · 6 Full guided tune-up · 7 Open reports folder · 8 AUTO tune-up · 9 Weekly schedule on/off · Q Quit

### Performance score (100 points)

| Check | Max | Thresholds |
|---|---|---|
| Memory in use | 25 | ≤60% = 25, ≤75% = 20, ≤85% = 12, else 5 |
| Free space on system drive | 25 | ≥25% = 25, ≥15% = 18, ≥10% = 10, else 3 |
| CPU load | 15 | ≤30% = 15, ≤60% = 10, else 4 |
| Startup apps enabled | 10 | ≤8 = 10, ≤15 = 6, else 2 |
| Junk files | 10 | <1 GB = 10, <5 GB = 6, else 2 |
| System disk type | 10 | SSD = 10, unknown = 7, HDD = 3 |
| Time since restart | 5 | ≤3 days = 5, ≤7 days = 3, else 0 |

Grades: ≥85 Excellent, ≥70 Good, ≥50 Fair, else Needs attention. CPU and RAM use the **median of 10 one-second samples** so a short spike does not distort the result.

### Cleanup targets

`Get-CleanupTargets` returns objects with `Group`, `Name`, `Process`, `Paths`. To add a target, append an entry there; sizing, preview, confirmation, and the "close this app first" check work automatically.

| Group | Contents | Interactive | AUTO |
|---|---|---|---|
| System | Temp, Windows temp, Windows Update cache, Delivery Optimization cache, WER/crash dumps, thumbnail cache | Asked as a group | Always |
| Browser | Chrome and Edge caches | Asked as a group | Only if the browser is closed |
| Developer | npm, Yarn/pip, NuGet caches, Gradle caches | Asked as a group | Every 30 days, or sooner if free space is below 15% |
| Heavy | NuGet packages folder | Asked per item | Never |

Special handling lives in `Invoke-CleanTarget` (stops and restarts `wuauserv`/`bits`, uses `Delete-DeliveryOptimizationCache`, stops Gradle daemons).

### AUTO mode rules

- Takes a health check before and after, with a 60-second settle wait between them.
- Never touches: Recycle Bin, NuGet packages, startup apps, uninstalls, personal folders.
- DISM component cleanup runs at most once every 7 days (`state.json`).
- Applies `Set-AutoTweaks`: Best performance power mode, Storage Sense (weekly, Downloads excluded), background Store apps off, Delivery Optimization peer sharing off.

## How to extend

- **New cleanup location**: add a `[pscustomobject]` to `Get-CleanupTargets`. Choose the group carefully, because the group decides whether AUTO mode runs it.
- **New tweak**: add a prompt in `Invoke-Tweaks`. Call `New-SafetyRestorePoint` first, log the change, and print how to undo it. Mirror it in `Set-AutoTweaks` only if it is safe to apply with no consent.
- **New score check**: add a block in `Get-Score` and update the point maxima so the total remains 100. Add the needed field in `Get-HealthData`.
- **Protect more apps**: extend `$Script:KeepPattern` (matched against startup and uninstall entries, triggers an extra confirmation).

## Assumptions

- Target machines are Windows 10/11 company PCs where the user has local admin rights.
- Windows PowerShell 5.1 is available; `Out-GridView` is used when present, with a text fallback.
- System Protection may be off; a failed restore point is logged and the run continues.

## Known issues and risks (review before shipping changes)

1. **Elevation drops `-Unattended`** (`PC-Doctor.ps1:37-39`). The relaunch forwards only `-ReportOnly` and `-Auto`. A non-admin `-Auto -Unattended` run would lose the flag and then block on prompts. The scheduled task runs elevated, so it is unaffected. Fix: forward `-Unattended` too.
2. **AUTO applies system-wide changes without a restore point.** `Set-AutoTweaks` writes `HKLM\...\DeliveryOptimization` and changes the power plan, but never calls `New-SafetyRestorePoint`. Power mode "Best performance" also increases laptop battery drain.
3. **Uninstaller executes registry strings as-is** (`PC-Doctor.ps1:771-775`). `UninstallString` runs through `cmd /c` with admin rights. This is standard for uninstallers, but only the user's confirmation guards it. Keep the confirmation and the `KeepPattern` check.
4. **`KeepPattern` is broad.** Terms such as `Intel`, `AMD`, `Audio`, `Cisco`, `VPN` flag many harmless apps, so users may see extra prompts. This errs on the safe side but can be noisy.
5. **Label mismatch.** The score row says "CPU load (5 s average)" but the value is a median of 10 samples over about 10 seconds.
6. **`Get-InstalledApps` de-duplicates by name** (`Sort-Object -Unique`), so side-by-side versions of the same app appear once.
7. **Hardcoded wording for `C:`** in score rows and tips, while the logic uses `$env:SystemDrive`. Cosmetic on machines where Windows is not on C:.
8. **No automated tests.** Validate changes with `-ReportOnly` first, then interactive option 2 (preview only, answer `N` to every prompt), before any real cleanup run.

## Out of scope

- Registry "cleaners", driver updates, malware scanning, or disabling Windows services.
- Cleaning or scanning user data folders.
- Non-Windows platforms.
- Remote or fleet management; the tool acts on the local machine only.

## Commercial product direction (v1.0 target)

The PowerShell script is the **prototype and behavioural reference**. The commercial product is a local-first, cross-platform desktop app for Windows 10/11 and macOS. Principles: safe by default, transparent cleanup, no silent destructive changes, offline-first, minimal data collection. Safety, transparency, reliability and user control outrank feature count.

### Commercial requirements

1. Ship Free and Pro editions. Free: basic health, basic cleanup, startup manager, basic reports. Pro: advanced cleanup, storage analyzer, automated maintenance, advanced reports, optimization profiles, premium support.
2. Core functionality works offline. Add ASP.NET Core licensing APIs and PostgreSQL only when account management requires them.
3. Do not promise identical operations on both platforms (see the platform table).
4. Present the score as a guide with category-level evidence and explanations, never as a validated benchmark.
5. The MVP excludes AI recommendations, advanced duplicate detection, fleet management, advanced diagnostics and cloud device management.

### Architecture

| Layer | Technology |
|---|---|
| Desktop shell | Electron (context isolation and renderer sandbox on) |
| Frontend | React + TypeScript + Vite, Tailwind CSS + shadcn/ui, Zustand, TanStack Query, React Hook Form + Zod, Recharts |
| Shared engine | C# / .NET 10 LTS (Core, Contracts, Infrastructure, Persistence, Security) |
| Platform adapters | Windows: C# and Windows APIs. macOS: Swift native helper |
| Storage | SQLite via EF Core |
| IPC | Restricted, typed, authenticated bridge. Named pipes on Windows, Unix domain sockets on macOS |
| Testing | Vitest + Playwright (frontend), xUnit (engine) |
| Packaging and CI | Electron Builder, GitHub Actions, signed binaries, verified updates |

Planned layout: `apps/desktop` (electron main/preload/ipc plus React `src`), `engine/` (.NET solution), `platform/windows` and `platform/macos`, `shared/` (contracts, design-system, constants), `installer/`, `docs/`, `.github/workflows/`.

### Platform support

| Feature | Windows | macOS |
|---|---|---|
| CPU/RAM/storage monitoring, health scoring | Yes | Yes |
| Temporary and developer cache cleanup | Yes | Yes |
| Browser cleanup | Yes | Permission-dependent |
| Startup management | Yes | Yes (login items) |
| App inventory | Yes | Yes |
| Uninstall management | Yes | Limited |
| Scheduled maintenance | Task Scheduler | LaunchAgent |
| Restore points | Supported configurations only | No direct equivalent |

### Modules

Health Dashboard, Smart Cleanup, Startup Manager, Performance Optimizer, Application Manager, Storage Analyzer, Auto Maintenance, Reports (HTML/PDF with history), Security and Privacy, Commercial Licensing. Navigation: Overview, Health Scan, Smart Cleanup, Startup Apps, Performance, Storage, Applications, Auto Maintenance, Reports, Settings.

### Score model (prototype vs v1.0 proposal)

| Category | Prototype | v1.0 |
|---|---:|---:|
| Memory | 25 | 20 |
| Storage | 25 | 20 |
| CPU | 15 | 15 |
| Startup | 10 | 10 |
| Junk files | 10 | 10 |
| Storage type/performance | 10 | 10 |
| Uptime | 5 | 5 |
| Battery/power | – | 5 |
| Stability | – | 5 |

Grades are unchanged (85+ Excellent, 70–84 Good, 50–69 Fair, below 50 Needs attention). Battery/power and Stability need defined inputs before implementation.

### SQLite tables

SystemProfiles, HealthSnapshots, HealthMetrics, CleanupScans, CleanupItems, CleanupActions, StartupEntries, OptimizationActions, ScheduledTasks, ApplicationInventory, UserSettings, ActivityLogs, LicenseCache. Keep sensitive user data out of the database unless essential.

### Security requirements

- Preview and confirmation for destructive actions; protected user-folder allowlists; one centralized safe-deletion implementation (the successor to `Test-SafeCleanPath` and `Remove-PathContents`).
- Least-privilege native helper and authenticated local IPC.
- Never execute arbitrary shell commands supplied by the UI.
- Never silently disable security features or delete personal data.
- Operation audit logs, and rollback where technically possible.

### Mapping prototype to product

| Prototype (PowerShell) | Product component |
|---|---|
| `Get-HealthData`, `Get-Score` | Windows health provider and scoring in the engine |
| `Get-CleanupTargets`, `Test-SafeCleanPath`, `Remove-PathContents` | Cleanup policies plus the central safe-delete service |
| `Get-StartupEntries`, `Set-ApprovedEnabled` | Windows startup adapter (`StartupApproved` keys) |
| `Get-InstalledApps`, `Invoke-Uninstaller` | Application inventory and supported uninstall operations |
| `Install-AutoSchedule` | Windows scheduler adapter (Task Scheduler) |
| `score-history.csv`, `state.json`, log files | SQLite (HealthSnapshots, ActivityLogs, UserSettings) |
| `Save-HtmlReport` | Reports module (HTML, then PDF) |

Port the logic and safety rules, not the PowerShell code. The prototype's thresholds and safe-path blocklist are the starting point for the engine's tests.

### Roadmap (16–20 weeks)

| Phase | Weeks | Deliverable |
|---|---|---|
| Foundation | 1–2 | Desktop shell, engine, SQLite, IPC |
| Monitoring | 3–4 | Cross-platform health dashboard |
| Smart Cleanup | 5–7 | Safe cross-platform cleanup |
| System Management | 8–10 | Startup, applications, optimization |
| Reports and Automation | 11–12 | History, reports, scheduler |
| Commercial Features | 13–14 | Licensing, installers, updates |
| Testing and Release | 15–20 | Security testing, beta, release |

### First milestone and acceptance

Create the `pc-doctor` GitHub repository; initialize the monorepo; set up React + TypeScript + Electron; create the .NET 10 solution; build platform detection, engine communication and SQLite configuration; build the dashboard shell; implement the Windows and macOS health providers.

**Acceptance:** the same desktop application launches on Windows and macOS and shows real system health information through the shared engine.

### Testing strategy

Cover Windows 10/11 and Intel and Apple Silicon macOS; permissions and elevation; locked files and symbolic links; interrupted cleanup; startup restoration; database migrations; scheduled tasks; IPC authentication; installer upgrade and uninstall; signed updates. **Never run destructive tests on a developer's everyday machine.** Use VMs or disposable test machines.

### Risks and open questions

1. **Estimate risk.** The plan covers three runtimes (Electron/Node, .NET, Swift), two signed installers and licensing in 16–20 weeks. macOS signing, notarization and permission prompts (Full Disk Access) are the likeliest sources of slip. Confirm macOS and Swift capacity before committing to dates.
2. **Packaging the .NET engine.** Decide between self-contained publish per platform and a shared runtime. This affects installer size and update design.
3. **Battery/power and Stability inputs** (for example, which crash or event-log signals) are unspecified. Decide before building the score.
4. **Elevation model.** Define which operations need the elevated helper and how it is installed and authenticated on each platform, so the UI process never holds admin rights.
5. **Windows-only prototype behaviours** (restore points, DISM, Delivery Optimization) need explicit "unsupported on macOS" handling in the UI.
6. **Licensing without a server.** Specify offline trial and activation behaviour, what `LicenseCache` stores and how tampering is handled before the Commercial Features phase.
7. **Carry forward the prototype's known issues** listed above, especially restore points before system-wide changes in automated runs.

## Working rules for Claude when editing this project

- Keep it a single dependency-free `.ps1` file that runs on Windows PowerShell 5.1 (no PowerShell 7-only syntax such as `?:`, `??`, or `&&`).
- Preserve the confirm-before-change behaviour; never add a silent destructive path outside `-Auto`.
- Do not run the script on the developer's machine to test destructive options. Use `-ReportOnly`, or review the code paths.
- Keep functions small and commented, and use `Write-Log` for anything that changes the system.
- For the commercial product, follow the architecture above, keep all deletions behind the single safe-delete service, and never add a path where the UI can pass shell commands to the engine.
- Treat `PC-Doctor.ps1` as the maintained prototype until the commercial engine reaches parity; do not delete it.

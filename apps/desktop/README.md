# PC Doctor (desktop app)

A local-first desktop app for Windows 10/11 that checks your PC's health, shows what you can safely clean, manages startup apps and keeps history of what it found. Nothing leaves your PC.

## What you need (on the PC where you develop and build)

- Windows 10 or 11, 64-bit
- [Node.js](https://nodejs.org) 20 or newer (includes `npm`)
- An internet connection for the first install and the first build. After that everything works offline.

The PC that only *runs* a finished build needs none of this.

## How to run it

**Easiest:** double-click **`Run-PC-Doctor.bat`** in this folder. The first run installs the dependencies and builds the app, which takes a few minutes. Later runs start straight away.

| Command | What it does |
|---|---|
| `Run-PC-Doctor.bat` | Start the app (installs and builds first if needed) |
| `Run-PC-Doctor.bat dev` | Start in development mode with live reload while you edit code |
| `Run-PC-Doctor.bat rebuild` | Rebuild from source, then start. **Use this after changing code** |

**Or from a terminal** in this folder:

```
npm install        # first time only
npm run dev        # run with live reload
npm run build      # compile to the "out" folder
npm run preview    # run the compiled build
```

**Quality checks** (run these before making a build): `npm run typecheck`, `npm run lint`, `npm test`.

The batch files in the project root (`Run-PC-Doctor.bat`, `Run-PC-Doctor-AUTO.bat`) run the older PowerShell tool (`PC-Doctor.ps1`), not this app.

## How to take a build

1. Open a terminal in this folder (`apps\desktop`).
2. Optional: change the version number in `package.json` (`"version": "1.0.0"`). It appears in the file names.
3. Run the quality checks: `npm run typecheck`, `npm run lint`, `npm test`.
4. Run:

   ```
   npm run dist
   ```

   The first build downloads the packaging tools, so allow several minutes. Later builds are faster.
5. Collect the files from the **`Output file`** folder:

   | File | What it is |
   |---|---|
   | `PC-Doctor-Portable-1.0.0.exe` | Single file, no install. Best for quick testing. |
   | `PC-Doctor-Setup-1.0.0.exe` | Normal installer for the current user, with a Start menu entry and an uninstaller. |

   Ignore the rest of that folder (`win-unpacked`, `builder-debug.yml`, `.blockmap`). They are build leftovers. For a fast test build without installers, run `npm run dist:dir`, which only creates `win-unpacked`.

The build never includes your license-signing key, this README or the `tools` folder. It is safe to hand the two `.exe` files to testers.

## How to test a build on another PC

Both files are 64-bit Windows 10/11. The other PC needs no Node.js, no internet and no admin rights. Copy the portable `.exe` over (USB drive or a shared folder) and double-click it, or run the Setup file to install.

**Expect a Windows warning.** The files are not code-signed yet, so Windows SmartScreen shows "Windows protected your PC". Click **More info**, then **Run anyway**. A signed build needs a code-signing certificate. The portable file also takes a few extra seconds to start the first time.

**On the other PC**
1. Start the app and check the Overview shows that PC's real CPU, memory and storage.
2. Run **Quick Scan** and wait for the score.
3. In **Smart Cleanup**, run **Scan for junk** and check the preview. Press **Cancel** at the confirmation unless you really want those files deleted.
4. Open **Licensing**, paste the license key below and check the sidebar changes to **Pro edition**.

Settings, history and the license are stored per user in `%APPDATA%\pc-doctor-desktop`. Delete that folder to start fresh.

## Troubleshooting

| Problem | Fix |
|---|---|
| The window never opens and no error appears | Some editors (VS Code) set `ELECTRON_RUN_AS_NODE`, which stops Electron opening windows. `Run-PC-Doctor.bat` clears it. In a terminal, run `set ELECTRON_RUN_AS_NODE=` first. |
| My code changes do not show up | A plain launch reuses the last build. Use `Run-PC-Doctor.bat rebuild`, or `npm run dev` for live reload. |
| `npm install` or `npm run dist` fails | Check you are online and have Node.js 20 or newer (`node -v`). Delete `node_modules` and run `npm install` again. |
| Windows says "Windows protected your PC" | Expected for an unsigned build. Click **More info**, then **Run anyway**. |
| A tester sees the Free edition | Correct. Each PC starts on Free. Paste the license key in **Licensing**. |

## Your Pro license key

```
PCD-AEAQAA-CVU4LD-DBXM2G-WELFMQ-IZXA2X-LETWOH-2EAHD4-42OQCM-KAVU32-GMM4A7-F42E5S-D6MP57-YDEZXH-OVCLWC-L6ZNSA-XRVBQE-4DD7OP-FO4AOX-YT3WBM-GQ
```

- **Edition:** Pro
- **Expires:** never
- **Key id:** `55A71631`
- **Issued:** 20 Nov 2026

### Activate it

1. Open PC Doctor and choose **Licensing** (bottom of the sidebar).
2. Paste the whole key into **License key**, spaces and line breaks are fine.
3. Click **Activate**. The sidebar changes to **Pro edition**.

To remove it from a PC, open **Licensing** and click **Remove license from this PC**.

### Please read

- **Treat this key like a password.** Anyone who has it can use Pro. Do not post this file publicly or commit it to a shared repository.
- **Keys are checked offline and are not tied to one device.** The same key works on any PC. Per-device activation needs the online licensing service, which is planned but not built.
- **Pro badges are labels today.** The Storage and Auto Maintenance pages work for everyone in this build. The key is verified and stored, but nothing is locked behind it yet.

## Issuing more keys (for the owner)

Keys are signed with a private key that is **not in this project**. It lives at:

```
C:\Users\TSI\.pc-doctor\license-private.pem
```

**Back this file up somewhere safe and never commit or share it.** Whoever holds it can issue unlimited keys, and if it is lost you cannot issue new keys. Keys you already issued keep working, because the app only holds the matching public key.

```
node tools/license.mjs issue               a Pro key that never expires
node tools/license.mjs issue --days 365    a Pro key that expires after 365 days
```

Each key has a random id, printed after it, so you can tell issued keys apart. To stop a specific key working, add its id to `REVOKED_KEY_IDS` in `electron/main/engine/license.ts` and ship a new build. Offline keys cannot be recalled any other way.

To replace the signing key pair entirely (this invalidates every key issued so far), delete the private key file, run `node tools/license.mjs keygen`, and paste the printed public key into `PUBLIC_KEY_SPKI_B64` in `electron/main/engine/license.ts`.

## How it works

- **Electron + React + TypeScript + Vite.** The window cannot run commands or choose files to delete. It can only ask the built-in engine for named actions through a typed, whitelisted bridge.
- **Interim engine.** A TypeScript engine in `electron/main/engine` provides health scans, cleanup, startup, history and licensing. It is shaped so the planned .NET engine can replace it without UI changes.
- **Safe cleanup.** Every cleanup shows a preview and asks for confirmation. Documents, Desktop, Downloads, Pictures, Videos, Music, OneDrive and project folders are never touched.
- **Your data** is stored in `%APPDATA%\pc-doctor-desktop`: scan history, your activated license and settings.

## Not built yet

Uninstalling apps, scheduled maintenance, optimization profiles, online purchase and trials, per-device activation, signed installers and auto-update, and macOS support. These screens say so plainly instead of pretending to work.

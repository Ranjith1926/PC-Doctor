# PC-Doctor

PC Doctor checks your Windows PC's health, shows what you can safely clean and manages startup apps. Everything stays on your PC.

This repository holds two things:

| Folder / file | What it is |
|---|---|
| [`apps/desktop`](apps/desktop) | The PC Doctor desktop app (Electron, React, TypeScript). **Start here.** See its [README](apps/desktop/README.md) for how to run it and how to build the installers. |
| [`apps/desktop/website`](apps/desktop/website) | A single-page download site for the installers. |
| `PC-Doctor.ps1` and the `.bat` files | The original PowerShell version, kept as a reference until the new app reaches parity. |
| [`SKILL.md`](SKILL.md) | The project specification and working notes. |

## Quick start

```
cd apps/desktop
npm install
npm run dev
```

On Windows you can also double-click `apps/desktop/Run-PC-Doctor.bat`.

Developer: Ranjith Kumar

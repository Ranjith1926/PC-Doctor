@echo off
REM PC Doctor desktop app launcher (Electron). Double-click to run.
REM Lives in apps\desktop, next to package.json.
REM   Run-PC-Doctor.bat          start the app (installs and builds first if needed)
REM   Run-PC-Doctor.bat dev      start in development mode with live reload
REM   Run-PC-Doctor.bat rebuild  force a fresh build, then start
REM The batch files in the project root run the older PowerShell prototype and are unchanged.
setlocal
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is required but was not found. Install Node.js 20 or newer from https://nodejs.org and run this again.
  pause
  exit /b 1
)

REM Some editors set this variable, which makes Electron behave like plain Node and never open a window.
set ELECTRON_RUN_AS_NODE=

if not exist node_modules (
  echo Installing dependencies - first run only, this can take a few minutes...
  call npm install
  if errorlevel 1 (
    echo npm install failed.
    pause
    exit /b 1
  )
)

if /i "%~1"=="dev" (
  call npm run dev
  exit /b %errorlevel%
)

if /i "%~1"=="rebuild" if exist out rmdir /s /q out

if not exist out\main\index.js (
  echo Building PC Doctor...
  call npm run build
  if errorlevel 1 (
    echo Build failed. See the messages above.
    pause
    exit /b 1
  )
)

echo Starting PC Doctor...
call node_modules\.bin\electron.cmd .
endlocal

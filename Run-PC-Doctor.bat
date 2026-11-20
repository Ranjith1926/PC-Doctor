@echo off
REM PC Doctor launcher - double-click to run. Windows will ask for admin permission.
cd /d "%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0PC-Doctor.ps1" %*

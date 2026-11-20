@echo off
REM PC Doctor AUTO - cleans and tunes your PC with no questions. Click Yes on the admin prompt.
cd /d "%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0PC-Doctor.ps1" -Auto

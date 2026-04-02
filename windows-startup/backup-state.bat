@echo off
setlocal
cd /d "%~dp0\.."

if not exist backups mkdir backups

for /f %%i in ('powershell -NoProfile -Command "Get-Date -Format yyyyMMdd-HHmmss"') do set TS=%%i
set FILE=backups\assistant-backup-%TS%.json

curl -s -o "%FILE%" http://localhost:3000/assistant/export
if errorlevel 1 (
  echo [ERROR] Backup failed. Is server running on http://localhost:3000 ?
  exit /b 1
)

echo [OK] Backup created: %FILE%
endlocal

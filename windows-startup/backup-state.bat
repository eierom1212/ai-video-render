@echo off
setlocal EnableDelayedExpansion
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

REM Retention policy: keep latest 8 backups, delete older files.
set /a COUNT=0
for /f "delims=" %%f in ('dir /b /a:-d /o-d "backups\assistant-backup-*.json" 2^>nul') do (
  set /a COUNT+=1
  if !COUNT! GTR 8 (
    del /q "backups\%%f"
    echo [CLEANUP] Deleted old backup: %%f
  )
)

endlocal

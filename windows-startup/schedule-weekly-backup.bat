@echo off
setlocal
cd /d "%~dp0"

schtasks /Create /SC WEEKLY /D SUN /TN "AIAssistantWeeklyBackup" /TR "\"%~dp0backup-state.bat\"" /ST 21:00 /F
if errorlevel 1 (
  echo [ERROR] Failed to create scheduled task.
  exit /b 1
)

echo [OK] Weekly backup task created: AIAssistantWeeklyBackup (Every Sunday 21:00)
endlocal

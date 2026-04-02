@echo off
setlocal
cd /d "%~dp0\.."

REM If server is already listening on 3000, don't start another node process.
for /f "tokens=5" %%p in ('netstat -ano ^| findstr ":3000" ^| findstr "LISTENING"') do set "PORT3000_PID=%%p"
if defined PORT3000_PID (
  echo [INFO] Port 3000 already in use (PID: %PORT3000_PID%). Skip duplicate startup.
  start http://localhost:3000
  endlocal
  exit /b 0
)

REM Start Ollama app if installed (ignore if already running)
start "" "%LOCALAPPDATA%\Programs\Ollama\Ollama.exe" >nul 2>nul

REM Start assistant in dedicated window
start "AI Personal Assistant" cmd /k "cd /d \"%~dp0\..\" && npm start"

REM Open browser
timeout /t 3 >nul
start http://localhost:3000
endlocal

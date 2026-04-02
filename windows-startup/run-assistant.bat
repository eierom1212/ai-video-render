@echo off
setlocal
cd /d "%~dp0\.."

REM Start Ollama app if installed (ignore if already running)
start "" "%LOCALAPPDATA%\Programs\Ollama\Ollama.exe" >nul 2>nul

REM Start assistant in dedicated window
start "AI Personal Assistant" cmd /k "cd /d \"%~dp0\..\" && npm start"

REM Open browser
timeout /t 3 >nul
start http://localhost:3000
endlocal

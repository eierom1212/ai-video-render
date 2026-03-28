@echo off
setlocal
cd /d "%~dp0"

echo [1/4] 檢查 package.json...
if not exist package.json (
  echo 找不到 package.json，請確認你在專案根目錄。
  exit /b 1
)

echo [2/4] 安裝依賴 npm install...
call npm install
if errorlevel 1 exit /b 1

echo [3/4] 建立 .env（若不存在）...
if not exist .env (
  copy .env.example .env >nul
)

echo [4/4] 啟動服務 npm start...
call npm start
endlocal

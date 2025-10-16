@echo off
:: Quick start script - assumes dependencies are already installed

cls
echo.
echo ==========================================
echo     DDoS Globe - Quick Start
echo ==========================================
echo.

set PROJECT_ROOT=%~dp0
set BACKEND_DIR=%PROJECT_ROOT%backend
set FRONTEND_DIR=%PROJECT_ROOT%frontend
set VENV_DIR=%PROJECT_ROOT%.venv

:: Kill any existing servers
echo Stopping any existing servers...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :8000') do taskkill /f /pid %%a >nul 2>&1
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :5173') do taskkill /f /pid %%a >nul 2>&1

:: Start backend
echo.
echo Starting backend server...
start "DDoS Globe Backend" cmd /k "cd /d "%BACKEND_DIR%" && call "%VENV_DIR%\Scripts\activate.bat" && python start_server.py"

:: Wait a bit
timeout /t 5 /nobreak >nul

:: Start frontend
echo Starting frontend server...
start "DDoS Globe Frontend" cmd /k "cd /d "%FRONTEND_DIR%" && npm run dev -- --host 0.0.0.0 --port 5173"

:: Wait a bit
timeout /t 5 /nobreak >nul

:: Show info
echo.
echo ==========================================
echo            SERVERS STARTED!
echo ==========================================
echo.
echo Frontend: http://localhost:5173
echo Backend: http://localhost:8000
echo.
echo Two terminal windows have opened.
echo Close them to stop the servers.
echo.

:: Ask to open browser
set /p "OPEN_BROWSER=Open browser? (y/n): "
if /i "%OPEN_BROWSER%"=="y" (
    start http://localhost:5173
)

echo.
pause

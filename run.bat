@echo off
REM DDoS Globe Visualizer - Quick Start Script
REM This script starts both backend and frontend servers

echo ==========================================
echo   DDoS Globe Visualizer - Quick Start
echo ==========================================
echo.

REM Start backend in a new PowerShell window
echo Starting backend server...
start "DDoS Globe Backend" powershell -NoExit -Command "cd C:\Users\parth\Documents\ddos-globe-visualizer\backend; Write-Host '========== Backend Server ==========' -ForegroundColor Green; Write-Host 'Starting Python backend...' -ForegroundColor Yellow; python main.py"

REM Wait a moment for backend to initialize
timeout /t 3 /nobreak >nul

REM Start frontend in a new PowerShell window
echo Starting frontend server...
start "DDoS Globe Frontend" powershell -NoExit -Command "cd C:\Users\parth\Documents\ddos-globe-visualizer\frontend; Write-Host '========== Frontend Server ==========' -ForegroundColor Green; Write-Host 'Starting Vite dev server...' -ForegroundColor Yellow; npm run dev"

echo.
echo ==========================================
echo   Both servers are starting...
echo ==========================================
echo.
echo Backend URL: http://localhost:8000
echo Frontend URL: http://localhost:5173
echo.
echo Two PowerShell windows have opened.
echo Close them to stop the servers.
echo.
pause


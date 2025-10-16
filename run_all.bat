@echo off

:: ==========================================
::     DDoS Globe Visualizer - Unified Launcher
:: ==========================================

:: Clear screen and show header
cls
echo.
echo ==========================================
echo     DDoS Globe Visualizer - Starting...
echo ==========================================
echo.

:: Get the directory where this batch file is located
set PROJECT_ROOT=%~dp0
set BACKEND_DIR=%PROJECT_ROOT%backend
set FRONTEND_DIR=%PROJECT_ROOT%frontend
set VENV_DIR=%PROJECT_ROOT%.venv

:: Check if we're in the right directory
if not exist "%BACKEND_DIR%\main.py" (
    echo ERROR: Backend directory not found!
    echo Please run this script from the project root directory.
    echo.
    pause
    exit /b 1
)

if not exist "%FRONTEND_DIR%\package.json" (
    echo ERROR: Frontend directory not found!
    echo Please run this script from the project root directory.
    echo.
    pause
    exit /b 1
)

:: Check for Python
python --version >nul 2>&1
if errorlevel 1 (
    echo ERROR: Python is not installed or not in PATH!
    echo Please install Python 3.8+ and try again.
    echo.
    pause
    exit /b 1
)

:: Check for Node.js
node --version >nul 2>&1
if errorlevel 1 (
    echo ERROR: Node.js is not installed or not in PATH!
    echo Please install Node.js and try again.
    echo.
    pause
    exit /b 1
)

:: Create virtual environment if it doesn't exist
if not exist "%VENV_DIR%\Scripts\activate.bat" (
    echo Creating Python virtual environment...
    python -m venv .venv
    if errorlevel 1 (
        echo ERROR: Failed to create virtual environment!
        echo.
        pause
        exit /b 1
    )
    echo Virtual environment created successfully!
    echo.
)

:: Activate virtual environment and install backend dependencies
echo.
echo [1/3] Installing/updating backend dependencies...
echo This may take a moment on first run...
call "%VENV_DIR%\Scripts\activate.bat"
pip install --upgrade pip --quiet >nul 2>&1
pip install -r "%BACKEND_DIR%\requirements.txt" --quiet
if errorlevel 1 (
    echo ERROR: Failed to install backend dependencies!
    echo Retrying with verbose output...
    pip install -r "%BACKEND_DIR%\requirements.txt"
    if errorlevel 1 (
        echo.
        pause
        exit /b 1
    )
)
echo ✓ Backend dependencies installed successfully!

:: Deactivate virtual environment before npm
call deactivate 2>nul

:: Install frontend dependencies
echo.
echo [2/3] Installing/updating frontend dependencies...
echo This may take a moment on first run...
cd /d "%FRONTEND_DIR%"
call npm install --silent
if errorlevel 1 (
    echo ERROR: Failed to install frontend dependencies!
    echo Retrying with verbose output...
    call npm install
    if errorlevel 1 (
        echo Please check that Node.js is installed correctly.
        echo.
        pause
        exit /b 1
    )
)
echo ✓ Frontend dependencies installed successfully!
cd /d "%PROJECT_ROOT%"

:: Kill any existing servers on our ports
echo.
echo [3/3] Starting servers...
echo Checking for existing servers on ports 8000 and 5173...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :8000') do taskkill /f /pid %%a >nul 2>&1
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :5173') do taskkill /f /pid %%a >nul 2>&1

:: Start backend server in a new window
echo.
echo Starting backend server...
start "DDoS Globe Backend" cmd /k "cd /d "%BACKEND_DIR%" && call "%VENV_DIR%\Scripts\activate.bat" && python start_server.py"

:: Wait for backend to start
echo Waiting for backend to initialize...
timeout /t 8 /nobreak >nul

:: Test backend connection
echo Testing backend connection...
curl -s http://localhost:8000/health >nul 2>&1
if errorlevel 1 (
    echo WARNING: Backend may not be ready yet. Check the backend window for errors.
    echo.
) else (
    echo Backend is responding correctly!
    echo.
)

:: Start frontend server in a new window
echo Starting frontend server...
start "DDoS Globe Frontend" cmd /k "cd /d "%FRONTEND_DIR%" && echo ========================================== && echo     DDoS Globe Frontend Server && echo ========================================== && echo Frontend URL: http://localhost:5173 && echo Press Ctrl+C to stop the server && echo. && echo Starting Vite dev server... && npm run dev -- --host 0.0.0.0 --port 5173"

:: Wait for frontend to start
echo Waiting for frontend to initialize...
timeout /t 8 /nobreak >nul

:: Show success message
echo.
echo ==========================================
echo            SERVERS STARTED!
echo ==========================================
echo.
echo Frontend Application: http://localhost:5173
echo Backend API: http://localhost:8000
echo Admin Dashboard: http://localhost:8000/admin
echo API Health Check: http://localhost:8000/health
echo.
echo Two terminal windows have opened for the servers.
echo Close those windows to stop the servers.
echo.

:: Optional: Open browser to frontend
set /p "OPEN_BROWSER=Open browser to application? (y/n): "
if /i "%OPEN_BROWSER%"=="y" (
    echo Opening browser...
    start http://localhost:5173
)

echo.
echo ==========================================
echo   Launcher completed successfully!
echo ==========================================
echo.
echo Troubleshooting:
echo - If backend shows connection errors, check the backend terminal window
echo - If frontend is black, check the frontend terminal window for errors
echo - Make sure no other applications are using ports 8000 or 5173
echo.
pause
@echo off

:: ==========================================
::     DDoS Globe Backend & Frontend Launcher
:: ==========================================

:: Clear screen and show header
cls
echo.
echo ==========================================
echo     Starting DDoS Globe Backend ^& Frontend
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

:: Check for virtual environment
if not exist "%VENV_DIR%\Scripts\activate.bat" (
    echo WARNING: Virtual environment not found at .venv
    echo Creating virtual environment...
    python -m venv .venv
    if errorlevel 1 (
        echo ERROR: Failed to create virtual environment!
        echo Please ensure Python is installed and accessible.
        echo.
        pause
        exit /b 1
    )
    echo Virtual environment created successfully!
    echo.
)

:: Install backend dependencies if needed
echo Checking backend dependencies...
if not exist "%VENV_DIR%\Scripts\pip.exe" (
    echo Installing backend dependencies...
    call "%VENV_DIR%\Scripts\activate.bat"
    pip install -r "%BACKEND_DIR%\requirements.txt"
    if errorlevel 1 (
        echo ERROR: Failed to install backend dependencies!
        echo.
        pause
        exit /b 1
    )
    echo Backend dependencies installed successfully!
)

:: Install frontend dependencies if needed
echo Checking frontend dependencies...
if not exist "%FRONTEND_DIR%\node_modules" (
    echo Installing frontend dependencies...
    cd /d "%FRONTEND_DIR%"
    npm install
    if errorlevel 1 (
        echo ERROR: Failed to install frontend dependencies!
        echo.
        pause
        exit /b 1
    )
    echo Frontend dependencies installed successfully!
    cd /d "%PROJECT_ROOT%"
)

:: Start backend server in a new window
echo Starting backend server...
start "DDoS Globe Backend" cmd /k "cd /d "%BACKEND_DIR%" && call "%VENV_DIR%\Scripts\activate.bat" && echo ========================================== && echo     DDoS Globe Backend Server && echo ========================================== && echo Backend URL: http://localhost:8000 && echo Admin URL: http://localhost:8000/admin && echo Press Ctrl+C to stop the server && echo. && uvicorn main:app --reload --host 0.0.0.0 --port 8000"

:: Wait a moment for backend to start
echo Waiting for backend to initialize...
timeout /t 5 /nobreak >nul

:: Start frontend server in a new window
echo Starting frontend server...
start "DDoS Globe Frontend" cmd /k "cd /d "%FRONTEND_DIR%" && echo ========================================== && echo     DDoS Globe Frontend Server && echo ========================================== && echo Frontend URL: http://localhost:5173 && echo Press Ctrl+C to stop the server && echo. && npm run dev"

:: Wait a moment for frontend to start
echo Waiting for frontend to initialize...
timeout /t 5 /nobreak >nul

:: Show success message
echo.
echo ==========================================
echo            SUCCESS! Servers Started
echo ==========================================
echo.
echo Backend Server: http://localhost:8000
echo Frontend Server: http://localhost:5173
echo Admin Dashboard: http://localhost:8000/admin
echo.
echo Note: Two new terminal windows have opened for the servers.
echo Close those windows to stop the servers.
echo.

:: Optional: Open browser to frontend
set /p "OPEN_BROWSER=Open browser to frontend? (y/n): "
if /i "%OPEN_BROWSER%"=="y" (
    start http://localhost:5173
)

echo.
echo Launcher completed successfully!
echo.
pause

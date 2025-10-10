# DDoS Globe Launcher

## Quick Start

Simply double-click `run_all.bat` to start both the backend and frontend servers automatically!

## What the Launcher Does

The `run_all.bat` script will:

1. **Check Prerequisites**
   - Verify Python is installed
   - Verify Node.js and npm are installed
   - Check for required directories and files

2. **Setup Environment**
   - Create virtual environment if it doesn't exist
   - Install backend dependencies if needed
   - Install frontend dependencies if needed

3. **Clean Up**
   - Kill any existing processes on ports 8000 and 5173
   - Clear any conflicting server instances

4. **Start Servers**
   - Launch backend server in a new terminal window
   - Launch frontend server in a new terminal window
   - Display server URLs and status

5. **Health Check**
   - Verify both servers are running
   - Test backend health endpoint
   - Show success/failure status

## Server URLs

After running the launcher, you can access:

- **Frontend**: http://localhost:5173
- **Backend API**: http://localhost:8000
- **Admin Dashboard**: http://localhost:8000/admin
- **Health Check**: http://localhost:8000/health

## Features

- ✅ **Automatic dependency installation**
- ✅ **Process cleanup** (kills existing servers)
- ✅ **Colored output** for better readability
- ✅ **Health checks** to verify servers are running
- ✅ **Error handling** with helpful messages
- ✅ **Browser auto-open** option
- ✅ **Virtual environment management**

## Troubleshooting

### Common Issues

1. **"Backend directory not found"**
   - Make sure you're running the script from the project root directory
   - Ensure the `backend` folder exists with `main.py`

2. **"Frontend directory not found"**
   - Make sure the `frontend` folder exists with `package.json`

3. **"Node.js not found"**
   - Install Node.js from https://nodejs.org/
   - Make sure it's added to your system PATH

4. **"Python not found"**
   - Install Python from https://python.org/
   - Make sure it's added to your system PATH

5. **Port already in use**
   - The script will try to kill existing processes
   - If that fails, manually close any applications using ports 8000 or 5173
   - Or restart your computer

### Manual Server Control

If you prefer to run servers manually:

**Backend:**
```cmd
cd backend
call ..\.venv\Scripts\activate
uvicorn main:app --reload
```

**Frontend:**
```cmd
cd frontend
npm run dev
```

## Stopping the Servers

To stop the servers:
1. Close the terminal windows that opened for backend and frontend
2. Or press `Ctrl+C` in each terminal window

The launcher will automatically clean up processes when you run it again.


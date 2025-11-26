# DDoS Globe Visualizer - Troubleshooting Guide

## Common Issues and Solutions

### 1. Backend Connection Issues (Connection Opens/Closes Repeatedly)

**Symptoms:**
- Backend terminal shows repeated connection messages
- Server keeps restarting
- Connection spam in logs

**Solutions:**
- ✅ **Fixed**: The `run_all.bat` now uses a stable server configuration without auto-reload
- The backend now uses `start_server.py` which prevents connection spam
- If issues persist, check that no other application is using port 8000

### 2. Frontend Shows Black Screen

**Symptoms:**
- Frontend terminal opens but shows black command window
- Browser shows blank page
- No errors in frontend terminal

**Solutions:**
- ✅ **Fixed**: The `run_all.bat` now includes better error handling and explicit port configuration
- Check that Node.js is installed: `node --version`
- Check that npm dependencies are installed: `npm install` in frontend directory
- Verify frontend is accessible at: http://localhost:5173

### 3. Port Already in Use

**Symptoms:**
- Error: "Port 8000 is already in use"
- Error: "Port 5173 is already in use"

**Solutions:**
- ✅ **Fixed**: The `run_all.bat` now automatically kills existing processes on these ports
- Manual fix: Kill processes using these ports in Task Manager
- Or use different ports by modifying the configuration

### 4. Python Virtual Environment Issues

**Symptoms:**
- "Python not found" error
- Import errors for backend dependencies

**Solutions:**
- ✅ **Fixed**: The `run_all.bat` now automatically creates and manages the virtual environment
- Ensure Python 3.8+ is installed and in PATH
- The script will automatically install all required dependencies

### 5. Missing Dependencies

**Symptoms:**
- Import errors
- Module not found errors

**Solutions:**
- ✅ **Fixed**: The `run_all.bat` now automatically installs all dependencies
- Backend: Dependencies are installed in virtual environment automatically
- Frontend: npm dependencies are installed automatically

## Quick Start (After Fixes)

1. **Run the Application:**
   ```bash
   # Full setup (first time or after updates):
   run_all.bat
   
   # Quick start (if dependencies already installed):
   run_quick.bat
   ```

2. **If run_all.bat crashes during npm install:**
   - This is usually due to npm output causing batch file issues
   - ✅ **Fixed**: The script now uses `--silent` flag and better error handling
   - Alternative: Use `run_quick.bat` if dependencies are already installed

2. **Access the Application:**
   - Frontend: http://localhost:5173
   - Backend API: http://localhost:8000
   - Admin Dashboard: http://localhost:8000/admin

3. **Stop the Servers:**
   - Close the two terminal windows that opened
   - Or press Ctrl+C in each terminal

## Manual Startup (If Batch File Fails)

### Backend:
```bash
cd backend
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
python start_server.py
```

### Frontend:
```bash
cd frontend
npm install
npm run dev
```

## Environment Variables (Optional)

Create a `.env` file in the project root with:
```env
ABUSEIPDB_KEY=your_api_key_here
DEBUG=true
USE_MOCK_DATA=false
```

## System Requirements

- **Python**: 3.8 or higher
- **Node.js**: 16 or higher
- **Operating System**: Windows 10/11
- **RAM**: 4GB minimum, 8GB recommended
- **Disk Space**: 2GB for dependencies

## Getting Help

If you still encounter issues:

1. Check the terminal windows for specific error messages
2. Ensure all system requirements are met
3. Try running the manual startup commands above
4. Check that no antivirus software is blocking the servers

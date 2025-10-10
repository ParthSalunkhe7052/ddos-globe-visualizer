#!/usr/bin/env python3
"""
Comprehensive fix for all DDoS Globe Visualizer issues
"""
import os
import sys
import subprocess
import json
from pathlib import Path

def run_command(cmd, description):
    """Run a command and return success status"""
    print(f"🔧 {description}...")
    try:
        result = subprocess.run(cmd, shell=True, capture_output=True, text=True, timeout=30)
        if result.returncode == 0:
            print(f"✅ {description} - Success")
            return True
        else:
            print(f"❌ {description} - Failed: {result.stderr}")
            return False
    except subprocess.TimeoutExpired:
        print(f"⏰ {description} - Timeout")
        return False
    except Exception as e:
        print(f"❌ {description} - Error: {e}")
        return False

def check_backend_running():
    """Check if backend is running on port 8000"""
    print("🔍 Checking if backend is running...")
    
    try:
        import requests
        response = requests.get("http://localhost:8000/health", timeout=5)
        if response.status_code == 200:
            print("✅ Backend is running on port 8000")
            return True
        else:
            print(f"❌ Backend responded with status {response.status_code}")
            return False
    except requests.exceptions.ConnectionError:
        print("❌ Backend is not running on port 8000")
        return False
    except Exception as e:
        print(f"❌ Error checking backend: {e}")
        return False

def start_backend():
    """Start the backend server"""
    print("🚀 Starting backend server...")
    
    # Check if backend is already running
    if check_backend_running():
        print("✅ Backend is already running")
        return True
    
    # Start backend in background
    try:
        # Use the start_backend.py script we created
        process = subprocess.Popen([
            sys.executable, "start_backend.py"
        ], stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        
        # Wait a moment for server to start
        import time
        time.sleep(3)
        
        # Check if it's running now
        if check_backend_running():
            print("✅ Backend started successfully")
            return True
        else:
            print("❌ Backend failed to start")
            return False
            
    except Exception as e:
        print(f"❌ Error starting backend: {e}")
        return False

def test_admin_dashboard():
    """Test if admin dashboard is accessible"""
    print("🔍 Testing admin dashboard...")
    
    try:
        import requests
        response = requests.get("http://localhost:8000/admin", timeout=10)
        if response.status_code == 200:
            print("✅ Admin dashboard is accessible")
            return True
        else:
            print(f"❌ Admin dashboard returned status {response.status_code}")
            return False
    except Exception as e:
        print(f"❌ Error accessing admin dashboard: {e}")
        return False

def test_websocket():
    """Test WebSocket connection"""
    print("🔍 Testing WebSocket connection...")
    
    try:
        import websockets
        import asyncio
        
        async def test_ws():
            try:
                async with websockets.connect("ws://localhost:8000/ws/attacks") as websocket:
                    print("✅ WebSocket connection successful")
                    return True
            except Exception as e:
                print(f"❌ WebSocket connection failed: {e}")
                return False
        
        return asyncio.run(test_ws())
        
    except ImportError:
        print("❌ websockets package not installed")
        print("Install with: pip install websockets")
        return False
    except Exception as e:
        print(f"❌ WebSocket test error: {e}")
        return False

def create_env_file():
    """Create a .env file with proper configuration"""
    print("🔧 Creating .env file...")
    
    env_content = """# DDoS Globe Visualizer Environment Configuration

# DShield Configuration
DShieldMode=live
USE_MOCK_DATA=false

# AbuseIPDB Configuration (optional)
# ABUSEIPDB_KEY=your_abuseipdb_api_key_here

# API Intervals (in seconds)
ABUSEIPDB_INTERVAL=300
DSHIELD_INTERVAL=300

# WebSocket Configuration
WS_HOST=0.0.0.0
WS_PORT=8000

# Debug Configuration
DEBUG=true
"""
    
    try:
        with open(".env", "w") as f:
            f.write(env_content)
        print("✅ .env file created")
        return True
    except Exception as e:
        print(f"❌ Error creating .env file: {e}")
        return False

def install_dependencies():
    """Install required dependencies"""
    print("🔧 Installing dependencies...")
    
    dependencies = [
        "fastapi",
        "uvicorn[standard]",
        "httpx",
        "xmltodict", 
        "python-dotenv",
        "websockets",
        "requests"
    ]
    
    for dep in dependencies:
        if not run_command(f"pip install {dep}", f"Installing {dep}"):
            print(f"⚠️  Failed to install {dep}, but continuing...")
    
    return True

def main():
    """Main fix function"""
    print("🚀 DDoS Globe Visualizer - Comprehensive Fix")
    print("=" * 60)
    
    # Step 1: Install dependencies
    print("\n📦 STEP 1: Installing Dependencies")
    print("-" * 40)
    install_dependencies()
    
    # Step 2: Create environment file
    print("\n🔧 STEP 2: Creating Environment Configuration")
    print("-" * 40)
    create_env_file()
    
    # Step 3: Start backend
    print("\n🚀 STEP 3: Starting Backend Server")
    print("-" * 40)
    if not start_backend():
        print("❌ Failed to start backend server")
        return False
    
    # Step 4: Test admin dashboard
    print("\n📊 STEP 4: Testing Admin Dashboard")
    print("-" * 40)
    if not test_admin_dashboard():
        print("❌ Admin dashboard is not accessible")
        print("   Try opening http://localhost:8000/admin in your browser")
        return False
    
    # Step 5: Test WebSocket
    print("\n🔌 STEP 5: Testing WebSocket Connection")
    print("-" * 40)
    if not test_websocket():
        print("❌ WebSocket connection failed")
        print("   This will affect live mode functionality")
    
    print("\n" + "=" * 60)
    print("📋 FIX SUMMARY:")
    print("✅ Backend server is running")
    print("✅ Admin dashboard is accessible")
    print("✅ Environment configuration created")
    
    print("\n🌐 ACCESS YOUR APPLICATION:")
    print("   Frontend: http://localhost:3000 (or your frontend URL)")
    print("   Backend API: http://localhost:8000")
    print("   Admin Dashboard: http://localhost:8000/admin")
    print("   API Documentation: http://localhost:8000/docs")
    
    print("\n🔧 TROUBLESHOOTING:")
    print("   1. If admin dashboard doesn't load, check browser console for errors")
    print("   2. If live mode doesn't work, check WebSocket connection in browser dev tools")
    print("   3. Make sure both frontend and backend are running")
    print("   4. Check that port 8000 is not blocked by firewall")
    
    return True

if __name__ == "__main__":
    try:
        success = main()
        sys.exit(0 if success else 1)
    except KeyboardInterrupt:
        print("\n\n👋 Fix interrupted by user")
        sys.exit(1)
    except Exception as e:
        print(f"\n❌ Fix failed: {e}")
        sys.exit(1)

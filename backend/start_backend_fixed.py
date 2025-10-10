#!/usr/bin/env python3
"""
Fixed startup script for DDoS Globe Visualizer Backend
"""
import os
import subprocess
import sys
import threading
import time
from pathlib import Path

import requests


def check_port_available(port=8000):
    """Check if port is available"""
    import socket

    try:
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            s.bind(("localhost", port))
            return True
    except OSError:
        return False


def kill_existing_server():
    """Kill any existing server on port 8000"""
    try:
        # Find and kill processes using port 8000
        result = subprocess.run(["netstat", "-ano"], capture_output=True, text=True)
        for line in result.stdout.split("\n"):
            if ":8000" in line and "LISTENING" in line:
                parts = line.split()
                if len(parts) > 4:
                    pid = parts[-1]
                    try:
                        subprocess.run(
                            ["taskkill", "/F", "/PID", pid], capture_output=True
                        )
                        print(f"🔪 Killed existing process on port 8000 (PID: {pid})")
                    except:
                        pass
    except Exception as e:
        print(f"⚠️  Could not kill existing processes: {e}")


def wait_for_server(max_wait=30):
    """Wait for server to be ready"""
    print("⏳ Waiting for server to start...")

    for i in range(max_wait):
        try:
            response = requests.get("http://localhost:8000/health", timeout=2)
            if response.status_code == 200:
                print("✅ Server is ready!")
                return True
        except:
            pass

        print(f"   Attempt {i+1}/{max_wait}...")
        time.sleep(1)

    print("❌ Server failed to start within timeout")
    return False


def start_server_directly():
    """Start server directly without subprocess"""
    print("🚀 Starting server directly...")

    # Import and run the app
    try:
        import uvicorn
        from main import app

        print("🌐 Server starting on http://localhost:8000")
        print("📊 Admin dashboard: http://localhost:8000/admin")
        print("📚 API docs: http://localhost:8000/docs")
        print("🔌 WebSocket: ws://localhost:8000/ws/attacks")
        print("\n" + "=" * 50)
        print("✅ Server is running! Press Ctrl+C to stop")
        print("=" * 50)

        uvicorn.run(
            app,
            host="0.0.0.0",
            port=8000,
            log_level="info",
            reload=False,
            access_log=True,
        )

    except KeyboardInterrupt:
        print("\n👋 Server stopped by user")
    except Exception as e:
        print(f"\n❌ Server error: {e}")
        import traceback

        traceback.print_exc()
        sys.exit(1)


def main():
    """Main startup function"""
    print("🚀 DDoS Globe Visualizer Backend - Fixed Startup")
    print("=" * 60)

    # Set environment variables
    os.environ["DShieldMode"] = "live"
    os.environ["USE_MOCK_DATA"] = "false"
    os.environ["DEBUG"] = "true"

    print("🔧 Configuration:")
    print(f"   DShield Mode: {os.environ.get('DShieldMode', 'live')}")
    print(f"   Use Mock Data: {os.environ.get('USE_MOCK_DATA', 'false')}")
    print(f"   Debug Mode: {os.environ.get('DEBUG', 'false')}")
    print(
        f"   AbuseIPDB Key: {'Set' if os.environ.get('ABUSEIPDB_KEY') else 'Not set'}"
    )

    # Check if port is available
    if not check_port_available(8000):
        print("⚠️  Port 8000 is already in use")
        print("🔪 Attempting to kill existing processes...")
        kill_existing_server()
        time.sleep(2)

        if not check_port_available(8000):
            print(
                "❌ Port 8000 is still in use. Please close other applications using this port."
            )
            return False

    print("✅ Port 8000 is available")

    # Start server directly
    start_server_directly()

    return True


if __name__ == "__main__":
    try:
        success = main()
        sys.exit(0 if success else 1)
    except KeyboardInterrupt:
        print("\n\n👋 Startup interrupted by user")
        sys.exit(1)
    except Exception as e:
        print(f"\n❌ Startup failed: {e}")
        import traceback

        traceback.print_exc()
        sys.exit(1)

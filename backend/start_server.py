#!/usr/bin/env python3
"""
Simple server startup script for DDoS Globe Visualizer Backend
This script starts the server without auto-reload to prevent connection spam.
"""

import os
import sys
from pathlib import Path

import uvicorn


def main():
    # Ensure we're in the backend directory
    backend_dir = Path(__file__).parent
    os.chdir(backend_dir)

    print("🚀 Starting DDoS Globe Visualizer Backend...")
    print(f"📁 Working directory: {os.getcwd()}")

    # Set default environment variables if not set
    if not os.getenv("DShieldMode"):
        os.environ["DShieldMode"] = "live"
        print("📋 Set DShieldMode=live (default)")

    if not os.getenv("USE_MOCK_DATA"):
        os.environ["USE_MOCK_DATA"] = "false"
        print("📋 Set USE_MOCK_DATA=false (default)")

    print("📍 Server will be available at: http://localhost:8000")
    print("🔧 Admin dashboard at: http://localhost:8000/admin")
    print("❤️  Health check at: http://localhost:8000/health")
    print("=" * 60)
    print("💡 To stop the server, press Ctrl+C")
    print("=" * 60)

    try:
        # Import the app
        from main import app

        # Start the server with stable configuration
        uvicorn.run(
            app,
            host="0.0.0.0",
            port=8000,
            log_level="info",
            access_log=True,
            reload=False,  # Disable reload to prevent connection spam
            workers=1,  # Single worker for stability
        )
    except KeyboardInterrupt:
        print("\n🛑 Server stopped by user")
        sys.exit(0)
    except ImportError as e:
        print(f"❌ Import error: {e}")
        print(
            "💡 Make sure you're in the backend directory and "
            "dependencies are installed"
        )
        sys.exit(1)
    except Exception as e:
        print(f"❌ Server error: {e}")
        sys.exit(1)


if __name__ == "__main__":
    main()

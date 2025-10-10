#!/usr/bin/env python3
"""
Startup script for DDoS Globe Visualizer Backend
"""
import os
import sys
import asyncio
import uvicorn
from main import app

def main():
    """Start the backend server"""
    print("🚀 Starting DDoS Globe Visualizer Backend...")
    print("=" * 50)
    
    # Set default environment variables if not set
    if not os.getenv("DShieldMode"):
        os.environ["DShieldMode"] = "live"
        print("📋 Set DShieldMode=live (default)")
    
    if not os.getenv("USE_MOCK_DATA"):
        os.environ["USE_MOCK_DATA"] = "false"
        print("📋 Set USE_MOCK_DATA=false (default)")
    
    # Print configuration
    print(f"🔧 Configuration:")
    print(f"   DShield Mode: {os.getenv('DShieldMode', 'live')}")
    print(f"   Use Mock Data: {os.getenv('USE_MOCK_DATA', 'false')}")
    print(f"   AbuseIPDB Key: {'Set' if os.getenv('ABUSEIPDB_KEY') else 'Not set'}")
    
    print("\n🌐 Starting server on http://localhost:8000")
    print("📊 Admin dashboard: http://localhost:8000/admin")
    print("📚 API docs: http://localhost:8000/docs")
    print("🔌 WebSocket: ws://localhost:8000/ws/attacks")
    print("\n" + "=" * 50)
    
    try:
        uvicorn.run(
            app,
            host="0.0.0.0",
            port=8000,
            log_level="info",
            reload=False
        )
    except KeyboardInterrupt:
        print("\n👋 Server stopped by user")
    except Exception as e:
        print(f"\n❌ Server error: {e}")
        sys.exit(1)

if __name__ == "__main__":
    main()

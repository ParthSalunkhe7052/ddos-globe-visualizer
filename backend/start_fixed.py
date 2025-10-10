#!/usr/bin/env python3
"""
Start the fixed backend server
"""
import os
import sys

def main():
    """Start the fixed backend server"""
    print("🚀 Starting DDoS Globe Visualizer Backend - FIXED VERSION")
    print("=" * 70)
    
    # Set environment variables
    os.environ["DShieldMode"] = "live"
    os.environ["USE_MOCK_DATA"] = "true"  # Use mock data to avoid DShield issues
    os.environ["DEBUG"] = "true"
    
    print("🔧 Configuration:")
    print(f"   DShield Mode: {os.environ.get('DShieldMode', 'live')}")
    print(f"   Use Mock Data: {os.environ.get('USE_MOCK_DATA', 'false')}")
    print(f"   Debug Mode: {os.environ.get('DEBUG', 'false')}")
    
    print("\n🌐 Server URLs:")
    print("   Backend API: http://localhost:8000")
    print("   Admin Dashboard: http://localhost:8000/admin")
    print("   API Documentation: http://localhost:8000/docs")
    print("   WebSocket: ws://localhost:8000/ws/attacks")
    
    print("\n✅ Features:")
    print("   - Rate limited to 1 arc per 7 seconds")
    print("   - No WebSocket connection spam")
    print("   - Proper error handling")
    print("   - Mock data for testing")
    
    print("\n" + "=" * 70)
    print("🚀 Starting server...")
    print("=" * 70)
    
    try:
        # Import and run the fixed app
        from main_fixed import app
        import uvicorn
        
        uvicorn.run(
            app,
            host="0.0.0.0",
            port=8000,
            log_level="info",
            reload=False,
            access_log=True
        )
        
    except KeyboardInterrupt:
        print("\n👋 Server stopped by user")
    except Exception as e:
        print(f"\n❌ Server error: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)

if __name__ == "__main__":
    main()

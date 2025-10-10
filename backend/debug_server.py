#!/usr/bin/env python3
"""
Debug server to test and fix the admin dashboard and live mode issues
"""
import asyncio
import sys
import os
import json
from pathlib import Path

# Add the current directory to Python path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

def check_files():
    """Check if all required files exist"""
    print("🔍 Checking required files...")
    
    files_to_check = [
        "main.py",
        "templates/admin.html", 
        "static/js/admin.js",
        "static/css/admin.css",
        "dshield_service.py",
        "geo_service.py"
    ]
    
    missing_files = []
    for file_path in files_to_check:
        if not os.path.exists(file_path):
            missing_files.append(file_path)
        else:
            print(f"✅ {file_path}")
    
    if missing_files:
        print(f"❌ Missing files: {missing_files}")
        return False
    
    print("✅ All required files found")
    return True

def check_dependencies():
    """Check if all required dependencies are installed"""
    print("🔍 Checking dependencies...")
    
    required_packages = [
        "fastapi",
        "uvicorn", 
        "httpx",
        "xmltodict",
        "python-dotenv"
    ]
    
    missing_packages = []
    for package in required_packages:
        try:
            __import__(package.replace("-", "_"))
            print(f"✅ {package}")
        except ImportError:
            missing_packages.append(package)
            print(f"❌ {package}")
    
    if missing_packages:
        print(f"❌ Missing packages: {missing_packages}")
        print("Install with: pip install " + " ".join(missing_packages))
        return False
    
    print("✅ All dependencies found")
    return True

def test_imports():
    """Test if all modules can be imported"""
    print("🔍 Testing imports...")
    
    try:
        from main import app
        print("✅ main.py imports successfully")
        
        from dshield_service import fetch_dshield_events
        print("✅ dshield_service.py imports successfully")
        
        from geo_service import ip_to_location
        print("✅ geo_service.py imports successfully")
        
        return True
    except Exception as e:
        print(f"❌ Import error: {e}")
        return False

def create_simple_test_server():
    """Create a simple test server to verify the setup"""
    print("🔧 Creating simple test server...")
    
    test_server_code = '''
import uvicorn
from fastapi import FastAPI
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from fastapi import Request

app = FastAPI()

# Set up templates and static files
templates = Jinja2Templates(directory="templates")
app.mount("/static", StaticFiles(directory="static"), name="static")

@app.get("/")
async def root():
    return {"message": "Test server is running"}

@app.get("/admin", response_class=HTMLResponse)
async def admin_dashboard(request: Request):
    """Serve the admin dashboard."""
    return templates.TemplateResponse("admin.html", {"request": request})

@app.get("/health")
def health():
    return {"status": "ok", "message": "Test server healthy"}

if __name__ == "__main__":
    print("🚀 Starting test server on http://localhost:8000")
    print("📊 Admin dashboard: http://localhost:8000/admin")
    uvicorn.run(app, host="0.0.0.0", port=8000)
'''
    
    with open("test_server.py", "w") as f:
        f.write(test_server_code)
    
    print("✅ Test server created: test_server.py")
    return True

def main():
    """Main diagnostic function"""
    print("🚀 DDoS Globe Visualizer - Server Diagnostic")
    print("=" * 60)
    
    # Check files
    if not check_files():
        print("\n❌ File check failed!")
        return False
    
    print("\n" + "=" * 60)
    
    # Check dependencies
    if not check_dependencies():
        print("\n❌ Dependency check failed!")
        return False
    
    print("\n" + "=" * 60)
    
    # Test imports
    if not test_imports():
        print("\n❌ Import test failed!")
        return False
    
    print("\n" + "=" * 60)
    
    # Create test server
    create_simple_test_server()
    
    print("\n" + "=" * 60)
    print("📋 DIAGNOSTIC SUMMARY:")
    print("✅ All checks passed!")
    print("\n🔧 NEXT STEPS:")
    print("1. Run the test server: python test_server.py")
    print("2. Open http://localhost:8000/admin in your browser")
    print("3. If that works, run the main server: python main.py")
    print("4. Check the browser console for any JavaScript errors")
    
    return True

if __name__ == "__main__":
    try:
        success = main()
        sys.exit(0 if success else 1)
    except KeyboardInterrupt:
        print("\n\n👋 Diagnostic interrupted by user")
        sys.exit(1)
    except Exception as e:
        print(f"\n❌ Diagnostic failed: {e}")
        sys.exit(1)

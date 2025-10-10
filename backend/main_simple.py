import asyncio
import json
import logging
import os
import random
import time
from datetime import datetime
from typing import Any, Dict, List, Optional

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, HTMLResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Initialize FastAPI app
app = FastAPI(
    title="DDoS Globe Visualizer Backend",
    description="Backend API for DDoS globe visualization and analysis.",
    version="1.0.0",
)

# Set up templates and static files
templates = Jinja2Templates(directory="templates")
app.mount("/static", StaticFiles(directory="static"), name="static")

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Simple connection manager
class SimpleConnectionManager:
    def __init__(self):
        self.active_connections: list[WebSocket] = []
        self.last_event_time = 0
        self.event_interval = 7.0  # 7 seconds between events

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)
        logger.info(f"WebSocket connected. Total: {len(self.active_connections)}")

    def disconnect(self, websocket: WebSocket):
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)
        logger.info(f"WebSocket disconnected. Total: {len(self.active_connections)}")

    async def send_event_with_rate_limit(self, event_data):
        """Send event with rate limiting"""
        current_time = time.time()
        
        # Rate limiting: only send if enough time has passed
        if current_time - self.last_event_time >= self.event_interval:
            for connection in self.active_connections[:]:  # Copy list to avoid modification during iteration
                try:
                    if connection.client_state.name == 'CONNECTED':
                        await connection.send_json({
                            "type": "attack",
                            "data": event_data
                        })
                        logger.info(f"Sent event {event_data.get('id', 'unknown')}")
                    else:
                        self.disconnect(connection)
                except Exception as e:
                    logger.error(f"Failed to send event: {e}")
                    self.disconnect(connection)
            
            self.last_event_time = current_time
            return True
        else:
            logger.debug("Event rate limited, skipping")
            return False

manager = SimpleConnectionManager()

def generate_simple_mock_event():
    """Generate a simple mock event"""
    mock_ips = [
        {"ip": "185.220.101.42", "country": "DE", "lat": 51.1657, "lng": 10.4515},
        {"ip": "45.146.164.110", "country": "RU", "lat": 61.5240, "lng": 105.3188},
        {"ip": "103.149.162.194", "country": "CN", "lat": 35.8617, "lng": 104.1954},
        {"ip": "91.92.109.43", "country": "RU", "lat": 61.5240, "lng": 105.3188},
        {"ip": "185.220.101.35", "country": "DE", "lat": 51.1657, "lng": 10.4515},
    ]
    
    mock_ip = random.choice(mock_ips)
    attack_count = random.randint(10, 1000)
    
    return {
        "id": f"mock-dshield-{mock_ip['ip']}-{int(datetime.utcnow().timestamp())}",
        "src_ip": mock_ip["ip"],
        "dst_ip": "0.0.0.0",
        "src_lat": mock_ip["lat"],
        "src_lng": mock_ip["lng"],
        "dst_lat": 0.0,
        "dst_lng": 0.0,
        "reported_at": datetime.utcnow().isoformat() + "Z",
        "confidence": min(100, max(0, attack_count // 10)),
        "protocol": "tcp",
        "description": f"Mock DShield report: {attack_count} attacks",
        "source": "fallback/mock",
        "attack_count": attack_count,
        "country_code": mock_ip["country"],
        "country_name": mock_ip["country"],
    }

# API Endpoints
@app.get("/health")
def health():
    return {
        "status": "ok",
        "time": datetime.utcnow().isoformat() + "Z",
        "connections": len(manager.active_connections)
    }

@app.get("/ping")
def ping():
    return {"status": "ok"}

# Admin Dashboard Routes
@app.get("/admin", response_class=HTMLResponse)
async def admin_dashboard(request):
    """Serve the admin dashboard."""
    return templates.TemplateResponse("admin.html", {"request": request})

# WebSocket endpoints - SIMPLE VERSION
@app.websocket("/ws/attacks")
async def ws_dshield_attacks(websocket: WebSocket):
    """Stream DShield attack events via WebSocket with simple rate limiting."""
    await manager.connect(websocket)
    logger.info("=== DShield WebSocket client connected ===")
    
    try:
        # Send initial status
        await websocket.send_json({
            "type": "status",
            "message": "Connected to DShield stream",
            "timestamp": datetime.utcnow().isoformat() + "Z",
        })
        
        # Generate and send events with rate limiting
        while True:
            if websocket.client_state.name != 'CONNECTED':
                logger.info("WebSocket disconnected, stopping")
                break
                
            # Generate mock event
            mock_event = generate_simple_mock_event()
            
            # Send with rate limiting
            success = await manager.send_event_with_rate_limit(mock_event)
            
            if not success:
                # Wait a bit if rate limited
                await asyncio.sleep(1)
            else:
                # Wait 7 seconds before next event
                await asyncio.sleep(7)
                
    except WebSocketDisconnect:
        logger.info("DShield WebSocket client disconnected")
    except Exception as e:
        logger.error(f"DShield WebSocket error: {e}")
    finally:
        manager.disconnect(websocket)
        logger.info("DShield WebSocket connection cleanup completed")

@app.websocket("/ws/logs")
async def websocket_logs(websocket: WebSocket):
    """WebSocket endpoint for streaming backend logs."""
    try:
        await websocket.accept()
        logger.info("Log WebSocket client connected")
        
        # Send initial connection message
        await websocket.send_json({
            "type": "log",
            "level": "info",
            "message": "Connected to log stream",
            "timestamp": datetime.utcnow().isoformat() + "Z"
        })
        
        # Keep connection alive
        while True:
            try:
                # Wait for client messages (ping/pong)
                data = await websocket.receive_text()
                if data == "ping":
                    await websocket.send_text("pong")
            except WebSocketDisconnect:
                break
                
    except WebSocketDisconnect:
        logger.info("Log WebSocket client disconnected")
    except Exception as e:
        logger.error(f"Log WebSocket error: {e}")

if __name__ == "__main__":
    import uvicorn
    print("🚀 Starting DDoS Globe Visualizer Backend - SIMPLE VERSION")
    print("🌐 Server: http://localhost:8000")
    print("📊 Admin: http://localhost:8000/admin")
    print("🔌 WebSocket: ws://localhost:8000/ws/attacks")
    print("✅ Features: Rate limited to 1 arc per 7 seconds")
    uvicorn.run(app, host="0.0.0.0", port=8000)

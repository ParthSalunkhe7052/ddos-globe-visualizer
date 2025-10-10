import asyncio
import ipaddress
import json
import logging
import math
import os
import random
import threading
import time
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional

import httpx
import xmltodict
# Import our services
from abuseipdb_service import check_ip
from dotenv import load_dotenv
from dshield_service import (fetch_dshield_events, fetch_dshield_top_ips,
                             generate_mock_dshield_events)
from error_handler import (APIError, InvalidIPError, RateLimitError,
                           ServiceUnavailableError, handle_ws_error,
                           setup_error_handlers)
from fastapi import FastAPI, Query, Request, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from geo_service import ip_to_location
from ip_cache import get_cached, set_cache

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Load environment variables
load_dotenv(override=True)
ABUSEIPDB_KEY = os.getenv("ABUSEIPDB_KEY")
FEED_MODE = os.getenv("DShieldMode", "live").lower()  # live | fallback

# Print configuration for debugging
print(f"🔧 Backend Configuration:")
print(f"   Feed Mode: {FEED_MODE}")
print(f"   AbuseIPDB Key: {'Set' if ABUSEIPDB_KEY else 'Not set'}")
print(f"   Use Mock Data: {os.getenv('USE_MOCK_DATA', 'false')}")

# Global caches and state
DShieldCache: Dict[str, Any] = {"attacks": [], "last_fetch": None}
EnrichCache: Dict[str, Any] = {}
AbuseIPDB429: Dict[str, Optional[datetime]] = {"blocked_until": None}
LIVE_CACHE: Dict[str, Any] = {
    "lock": threading.Lock(),
    "data": [],
    "timestamp": time.time(),
}

# Background polling intervals (seconds)
ABUSEIPDB_INTERVAL = int(os.getenv("ABUSEIPDB_INTERVAL", "300"))
DSHIELD_INTERVAL = int(os.getenv("DSHIELD_INTERVAL", "300"))


# WebSocket Connection Manager - FIXED
class ConnectionManager:
    def __init__(self):
        self.active_connections: list[WebSocket] = []
        self.log_connections: list[WebSocket] = []
        self.last_event_time = 0
        self.event_interval = 7.0  # 7 seconds between events

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)
        logger.info(
            f"WebSocket connected. Total connections: {len(self.active_connections)}"
        )

    async def connect_log(self, websocket: WebSocket):
        await websocket.accept()
        self.log_connections.append(websocket)

    def disconnect(self, websocket: WebSocket):
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)
        if websocket in self.log_connections:
            self.log_connections.remove(websocket)
        logger.info(
            f"WebSocket disconnected. Total connections: {len(self.active_connections)}"
        )

    async def broadcast(self, message: dict):
        if not self.active_connections:
            return

        to_remove = []
        for connection in self.active_connections:
            try:
                if connection.client_state.name == "CONNECTED":
                    await connection.send_json(message)
                else:
                    to_remove.append(connection)
            except Exception as e:
                logger.error(f"Failed to send message: {e}")
                to_remove.append(connection)

        for ws in to_remove:
            self.disconnect(ws)

    async def broadcast_log(self, message: dict):
        to_remove = []
        for connection in self.log_connections:
            try:
                await connection.send_json(message)
            except Exception:
                to_remove.append(connection)
        for ws in to_remove:
            self.disconnect(ws)

    async def send_event_with_rate_limit(self, event_data):
        """Send event with rate limiting"""
        current_time = time.time()

        # Rate limiting: only send if enough time has passed
        if current_time - self.last_event_time >= self.event_interval:
            await self.broadcast({"type": "attack", "data": event_data})
            self.last_event_time = current_time
            logger.info(f"Sent event {event_data.get('id', 'unknown')}")
            return True
        else:
            logger.debug("Event rate limited, skipping")
            return False


manager = ConnectionManager()

# Initialize FastAPI app
app = FastAPI(
    title="DDoS Globe Visualizer Backend",
    description="Backend API for DDoS globe visualization and analysis.",
    version="1.0.0",
)

# Set up templates and static files
templates = Jinja2Templates(directory="templates")
app.mount("/static", StaticFiles(directory="static"), name="static")

# Set up error handlers
setup_error_handlers(app)

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# Utility functions
def iso_now():
    return datetime.utcnow().replace(microsecond=0).isoformat() + "Z"


def log_and_respond(
    success, data=None, error=None, message=None, status_code=200, headers=None
):
    resp = {
        "success": success,
        "data": data if success else None,
        "error": error if not success else None,
        "message": message if not success else None,
    }
    logger.info(f"Response: {resp}")
    return JSONResponse(
        content=resp,
        status_code=status_code,
        headers=headers
        or {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Credentials": "true",
        },
    )


# API Endpoints
@app.get("/health")
def health():
    return log_and_respond(
        True,
        data={
            "status": "ok",
            "time": iso_now(),
            "dshield_last_fetch": (
                DShieldCache["last_fetch"].isoformat() + "Z"
                if DShieldCache["last_fetch"]
                else None
            ),
            "abuseipdb_key_present": bool(ABUSEIPDB_KEY),
        },
    )


@app.get("/ping")
def ping():
    return {"status": "ok"}


# Admin Dashboard Routes
@app.get("/admin", response_class=HTMLResponse)
async def admin_dashboard(request: Request):
    """Serve the admin dashboard."""
    return templates.TemplateResponse("admin.html", {"request": request})


# WebSocket endpoints - FIXED
@app.websocket("/ws/attacks")
async def ws_dshield_attacks(websocket: WebSocket):
    """Stream DShield attack events via WebSocket with proper rate limiting."""
    await manager.connect(websocket)
    logger.info("=== DShield WebSocket client connected ===")

    try:
        # Send initial status
        await websocket.send_json(
            {
                "type": "status",
                "message": "Connected to DShield stream",
                "timestamp": datetime.utcnow().isoformat() + "Z",
            }
        )

        # Generate mock events with rate limiting
        while True:
            if websocket.client_state.name != "CONNECTED":
                logger.info("WebSocket disconnected, stopping")
                break

            # Generate mock event
            mock_events = await generate_mock_dshield_events(count=1)
            mock_event = mock_events[0] if mock_events else None

            if not mock_event:
                await asyncio.sleep(1)
                continue

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
        await manager.connect_log(websocket)
        logger.info("Log WebSocket client connected")

        # Send initial connection message
        await websocket.send_json(
            {
                "type": "log",
                "level": "info",
                "message": "Connected to log stream",
                "timestamp": datetime.utcnow().isoformat() + "Z",
            }
        )

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
    finally:
        manager.disconnect(websocket)
        logger.info("Log WebSocket connection cleanup completed")


# Startup events
@app.on_event("startup")
async def start_background_tasks():
    logger.info("Starting background tasks...")


if __name__ == "__main__":
    import uvicorn

    print("🚀 Starting DDoS Globe Visualizer Backend...")
    print("🌐 Server: http://localhost:8000")
    print("📊 Admin: http://localhost:8000/admin")
    print("🔌 WebSocket: ws://localhost:8000/ws/attacks")
    uvicorn.run(app, host="0.0.0.0", port=8000)

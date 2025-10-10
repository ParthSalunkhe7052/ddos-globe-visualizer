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


# Custom log handler for WebSocket streaming
class WebSocketLogHandler(logging.Handler):
    def __init__(self, manager=None):
        super().__init__()
        self.manager = manager

    def emit(self, record):
        try:
            if self.manager is not None:
                log_entry = {
                    "type": "log",
                    "level": record.levelname.lower(),
                    "message": self.format(record),
                    "timestamp": datetime.utcnow().isoformat() + "Z",
                }
                # Send to all connected log WebSocket clients
                asyncio.create_task(self.manager.broadcast_log(log_entry))
        except Exception:
            pass  # Don't let logging errors break the application


# Add WebSocket log handler
ws_log_handler = WebSocketLogHandler(None)  # Will be set after manager is created
ws_log_handler.setLevel(logging.INFO)
formatter = logging.Formatter("%(asctime)s - %(name)s - %(levelname)s - %(message)s")
ws_log_handler.setFormatter(formatter)
logger.addHandler(ws_log_handler)

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


# WebSocket Connection Manager
class ConnectionManager:
    def __init__(self):
        self.active_connections: list[WebSocket] = []
        self.log_connections: list[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)

    async def connect_log(self, websocket: WebSocket):
        await websocket.accept()
        self.log_connections.append(websocket)

    def disconnect(self, websocket: WebSocket):
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)
        if websocket in self.log_connections:
            self.log_connections.remove(websocket)

    async def broadcast(self, message: dict):
        to_remove = []
        for connection in self.active_connections:
            try:
                await connection.send_json(message)
            except Exception:
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


manager = ConnectionManager()

# Update the WebSocket log handler with the manager
ws_log_handler.manager = manager

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


def load_sample_ips(fallback: bool = True) -> List[Dict[str, Any]]:
    """Load sample IPs with fallback to prevent crashes."""
    path = os.path.join(os.path.dirname(__file__), "mock_data", "sample_ips.json")
    try:
        if not os.path.exists(os.path.dirname(path)):
            os.makedirs(os.path.dirname(path))
            logger.warning(f"Created missing directory: {os.path.dirname(path)}")

        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)
            logger.info(f"Loaded {len(data)} sample IPs from {path}")
            if not isinstance(data, list):
                raise ValueError("Sample IPs must be a JSON array")
            return data

    except FileNotFoundError as e:
        msg = f"Sample IPs file not found: {path}"
        if not fallback:
            logger.error(msg)
            raise
        logger.warning(msg)
        return [
            {
                "ip": "8.8.8.8",
                "countryCode": "US",
                "latitude": 37.386,
                "longitude": -122.084,
                "isp": "Google LLC",
                "domain": "google.com",
                "abuseConfidenceScore": 0,
                "lastReportedAt": "2024-01-01T00:00:00Z",
                "totalReports": 0,
                "usageType": "Data Center/Web Hosting/Transit",
            }
        ]

    except json.JSONDecodeError as e:
        msg = f"Invalid JSON in sample IPs file ({path}): {str(e)}"
        if not fallback:
            logger.error(msg)
            raise
        logger.error(msg)
        return []

    except Exception as e:
        msg = f"Error loading sample IPs from {path}: {str(e)}"
        if not fallback:
            logger.error(msg)
            raise
        logger.error(msg)
        return []


# Global constants
SAMPLE_IPS = load_sample_ips()
USAGE_TYPES = [
    "Data Center/Web Hosting/Transit",
    "ISP",
    "Business",
    "Government",
    "Content Delivery Network",
    "University/College",
    "Mobile ISP",
]


def random_ip():
    return f"{random.randint(1,255)}.{random.randint(0,255)}.{random.randint(0,255)}.{random.randint(1,255)}"


# IP enrichment function
async def enrich_ip(ip: str, use_abuseipdb: bool = False) -> dict:
    now = datetime.utcnow()
    cached = EnrichCache.get(ip)
    if cached and cached["expires"] > now:
        return cached["data"]

    geo = {}
    try:
        async with httpx.AsyncClient() as client:
            r = await client.get(
                f"http://ip-api.com/json/{ip}?fields=status,country,countryCode,lat,lon,isp",
                timeout=5,
            )
            if r.status_code == 200:
                g = r.json()
                if g.get("status") == "success":
                    geo = {
                        "countryCode": g.get("countryCode"),
                        "countryName": g.get("country"),
                        "lat": g.get("lat"),
                        "lon": g.get("lon"),
                        "isp": g.get("isp"),
                    }
    except Exception as e:
        logger.warning(f"Geo enrichment failed for {ip}: {e}")

    domain = None
    try:
        import socket

        loop = asyncio.get_event_loop()
        domain = await asyncio.wait_for(
            loop.run_in_executor(None, lambda: socket.gethostbyaddr(ip)[0]),
            timeout=1,
        )
    except Exception:
        domain = None

    abuse = None
    if (
        use_abuseipdb
        and ABUSEIPDB_KEY
        and (not AbuseIPDB429["blocked_until"] or now > AbuseIPDB429["blocked_until"])
    ):
        try:
            async with httpx.AsyncClient() as client:
                resp = await client.get(
                    "https://api.abuseipdb.com/api/v2/check",
                    headers={"Accept": "application/json", "Key": ABUSEIPDB_KEY},
                    params={"ipAddress": ip, "maxAgeInDays": 90},
                    timeout=8,
                )
                if resp.status_code == 429:
                    logger.warning("AbuseIPDB 429: quota exceeded, blocking for 24h")
                    AbuseIPDB429["blocked_until"] = now + timedelta(hours=24)
                elif resp.status_code == 200:
                    abuse_data = resp.json().get("data", {})
                    abuse = {
                        "abuseConfidenceScore": abuse_data.get(
                            "abuseConfidenceScore", 0
                        ),
                        "totalReports": abuse_data.get("totalReports", 0),
                        "lastReportedAt": abuse_data.get("lastReportedAt", None),
                    }
        except Exception as e:
            logger.warning(f"AbuseIPDB enrich failed for {ip}: {e}")

    result = {"ip": ip, **geo, "domain": domain, "abuse": abuse}
    EnrichCache[ip] = {"data": result, "expires": now + timedelta(hours=24)}
    return result


# Background tasks
async def dshield_fetch_and_enrich():
    while True:
        try:
            logger.info("Fetching DShield top IPs...")
            raw = await fetch_dshield_top_ips()
            enriched = []
            now = datetime.utcnow()
            for entry in raw:
                ip = entry.get("ip")
                attackCount = entry.get("attackCount", 0)
                meta = await enrich_ip(ip, use_abuseipdb=False)
                enriched.append(
                    {
                        "ip": ip,
                        "attackCount": attackCount,
                        "source": "dshield",
                        "lat": meta.get("lat"),
                        "lon": meta.get("lon"),
                        "countryCode": meta.get("countryCode"),
                        "countryName": meta.get("countryName"),
                        "isp": meta.get("isp"),
                        "domain": meta.get("domain"),
                        "firstSeen": now.isoformat() + "Z",
                        "lastSeen": now.isoformat() + "Z",
                        "cached_from": "dshield_xml",
                        "cluster_id": None,
                    }
                )
            DShieldCache["attacks"] = enriched
            DShieldCache["last_fetch"] = now
            logger.info(
                f"DShield fetch complete: {len(enriched)} attacks at {now.isoformat()}Z"
            )
        except Exception as e:
            logger.error(f"DShield fetch/enrich failed: {e}")
        await asyncio.sleep(300)


async def update_live_cache():
    """Background task to update the /live cache."""
    while True:
        try:
            abuse_data, dshield_data = await asyncio.gather(
                fetch_latest_reports(), fetch_dshield_top_ips()
            )
            # Defensive: ensure we have lists
            if isinstance(abuse_data, dict) and abuse_data.get("error"):
                logger.warning(f"Abuse reports fetch returned error: {abuse_data}")
                abuse_data = []
            if not isinstance(abuse_data, list):
                logger.warning(
                    f"Abuse reports unexpected type, normalizing to list: {type(abuse_data)}"
                )
                abuse_data = []
            if not isinstance(dshield_data, list):
                logger.warning(
                    f"DShield data unexpected type, normalizing to list: {type(dshield_data)}"
                )
                dshield_data = []

            # Merge and deduplicate
            merged = {}
            for entry in dshield_data:
                merged[entry["ip"]] = entry.copy()
            for entry in abuse_data:
                if isinstance(entry, dict):
                    ip = entry.get("ip") or entry.get("ipAddress")
                else:
                    logger.debug(f"Skipping non-dict abuse entry: {entry}")
                    continue
                if ip in merged:
                    merged[ip].update(entry)
                else:
                    merged[ip] = entry
            # Convert to list
            combined = list(merged.values())
            with LIVE_CACHE["lock"]:
                LIVE_CACHE["data"] = combined
                LIVE_CACHE["timestamp"] = time.time()
            logger.info(f"/live cache updated: {len(combined)} IPs")
        except Exception as e:
            logger.error(f"/live cache update failed: {e}")
        await asyncio.sleep(min(ABUSEIPDB_INTERVAL, DSHIELD_INTERVAL))


async def fetch_latest_reports(limit=20):
    api_key = ABUSEIPDB_KEY
    if not api_key:
        return {"error": "AbuseIPDB API key not configured"}
    url = "https://api.abuseipdb.com/api/v2/reports"
    headers = {"Accept": "application/json", "Key": api_key}
    params = {"limit": limit}
    async with httpx.AsyncClient() as client:
        try:
            resp = await client.get(url, headers=headers, params=params, timeout=15)
            if resp.status_code != 200:
                return {"error": resp.status_code, "message": resp.text}
            data = resp.json()
            return data.get("data", [])
        except Exception as e:
            return {"error": "request_failed", "message": str(e)}


# Clustering function
def cluster_attacks(attacks, max_distance_km=100):
    clusters = []
    for attack in attacks:
        found = False
        for cluster in clusters:
            lat1, lon1 = attack["latitude"], attack["longitude"]
            lat2, lon2 = cluster["latitude"], cluster["longitude"]
            dlat = math.radians(lat2 - lat1)
            dlon = math.radians(lon2 - lon1)
            a = (
                math.sin(dlat / 2) ** 2
                + math.cos(math.radians(lat1))
                * math.cos(math.radians(lat2))
                * math.sin(dlon / 2) ** 2
            )
            c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
            distance = 6371 * c
            if distance < max_distance_km:
                cluster["cluster_size"] += 1
                found = True
                break
        if not found:
            clusters.append({**attack, "cluster_size": 1})
    return clusters


# Mock attack stream
async def mock_attack_stream(websocket: WebSocket):
    """Stream mock attack events for fallback mode."""
    logger.info("Starting mock attack stream")
    try:
        # Check if WebSocket is still connected before sending
        if websocket.client_state != websocket.client_state.CONNECTED:
            logger.info("WebSocket disconnected, stopping mock stream")
            return

        await websocket.send_json(
            {
                "type": "status",
                "message": "Using fallback/mock stream",
                "timestamp": datetime.utcnow().isoformat() + "Z",
            }
        )

        while True:
            # Check WebSocket state before each iteration
            if websocket.client_state != websocket.client_state.CONNECTED:
                logger.info("WebSocket disconnected during mock stream, stopping")
                break

            # Generate mock DShield events
            mock_events = await generate_mock_dshield_events(count=random.randint(1, 3))

            for event in mock_events:
                # Check WebSocket state before each send
                if websocket.client_state != websocket.client_state.CONNECTED:
                    logger.info(
                        "WebSocket disconnected while sending mock events, stopping"
                    )
                    return

                try:
                    await websocket.send_json({"type": "attack", "data": event})
                    logger.debug(f"Sent mock event: {event['id']}")
                except Exception as send_error:
                    logger.error(f"Failed to send mock event: {send_error}")
                    # If send fails, likely due to disconnection, break out
                    return

            # Random delay between batches
            delay = random.uniform(2.0, 6.0)
            logger.debug(f"Mock stream sleeping for {delay:.1f}s")
            await asyncio.sleep(delay)

    except WebSocketDisconnect:
        logger.info("Client disconnected from mock attack stream")
    except Exception as e:
        logger.error(f"Error in mock attack stream: {str(e)}")
        # Only try to send error if WebSocket is still connected
        if websocket.client_state == websocket.client_state.CONNECTED:
            try:
                await websocket.send_json(
                    {
                        "type": "error",
                        "message": f"Mock stream error: {str(e)}",
                        "timestamp": datetime.utcnow().isoformat() + "Z",
                    }
                )
            except Exception:
                pass


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


@app.get("/api/admin/status")
async def admin_status():
    """Get comprehensive system status for admin dashboard."""
    try:
        # Get basic health info
        health_data = {
            "status": "ok",
            "time": iso_now(),
            "feed_mode": FEED_MODE,
            "dshield_last_fetch": (
                DShieldCache["last_fetch"].isoformat() + "Z"
                if DShieldCache["last_fetch"]
                else None
            ),
            "abuseipdb_key_present": bool(ABUSEIPDB_KEY),
            "active_connections": len(manager.active_connections),
            "log_connections": len(manager.log_connections),
            "total_attacks": len(DShieldCache["attacks"]),
        }

        # Test DShield connectivity
        try:
            events = await fetch_dshield_events(max_retries=1, base_delay=0.5)
            health_data["dshield_status"] = "online" if events else "offline"
        except Exception:
            health_data["dshield_status"] = "offline"

        # Test AbuseIPDB connectivity
        try:
            if ABUSEIPDB_KEY:
                async with httpx.AsyncClient() as client:
                    resp = await client.get(
                        "https://api.abuseipdb.com/api/v2/check",
                        headers={"Accept": "application/json", "Key": ABUSEIPDB_KEY},
                        params={"ipAddress": "8.8.8.8", "maxAgeInDays": 90},
                        timeout=5,
                    )
                    health_data["abuseipdb_status"] = (
                        "online" if resp.status_code == 200 else "offline"
                    )
            else:
                health_data["abuseipdb_status"] = "not_configured"
        except Exception:
            health_data["abuseipdb_status"] = "offline"

        # Test GeoIP service
        try:
            geo_result = ip_to_location("8.8.8.8")
            health_data["geoip_status"] = (
                "online" if not geo_result.get("error") else "offline"
            )
        except Exception:
            health_data["geoip_status"] = "offline"

        return log_and_respond(True, data=health_data)

    except Exception as e:
        logger.error(f"Admin status error: {e}")
        return log_and_respond(
            False, error="ADMIN_STATUS_ERROR", message=str(e), status_code=500
        )


@app.post("/api/admin/clear-cache")
async def admin_clear_cache():
    """Clear all caches."""
    try:
        # Clear enrichment cache
        EnrichCache.clear()

        # Clear DShield cache
        DShieldCache["attacks"] = []
        DShieldCache["last_fetch"] = None

        # Clear live cache
        with LIVE_CACHE["lock"]:
            LIVE_CACHE["data"] = []
            LIVE_CACHE["timestamp"] = time.time()

        # Clear IP cache database
        try:
            import sqlite3

            conn = sqlite3.connect("ip_cache.db")
            cursor = conn.cursor()
            cursor.execute("DELETE FROM ip_cache")
            conn.commit()
            conn.close()
        except Exception as e:
            logger.warning(f"Failed to clear IP cache database: {e}")

        logger.info("All caches cleared by admin")
        return log_and_respond(
            True, data={"message": "All caches cleared successfully"}
        )

    except Exception as e:
        logger.error(f"Cache clear error: {e}")
        return log_and_respond(
            False, error="CACHE_CLEAR_ERROR", message=str(e), status_code=500
        )


@app.post("/api/admin/refresh-dshield")
async def admin_refresh_dshield():
    """Manually refresh DShield data."""
    try:
        logger.info("Manual DShield refresh requested by admin")

        # Force refresh DShield data
        raw = await fetch_dshield_top_ips()
        enriched = []
        now = datetime.utcnow()

        for entry in raw:
            ip = entry.get("ip")
            attackCount = entry.get("attackCount", 0)
            meta = await enrich_ip(ip, use_abuseipdb=False)
            enriched.append(
                {
                    "ip": ip,
                    "attackCount": attackCount,
                    "source": "dshield",
                    "lat": meta.get("lat"),
                    "lon": meta.get("lon"),
                    "countryCode": meta.get("countryCode"),
                    "countryName": meta.get("countryName"),
                    "isp": meta.get("isp"),
                    "domain": meta.get("domain"),
                    "firstSeen": now.isoformat() + "Z",
                    "lastSeen": now.isoformat() + "Z",
                    "cached_from": "dshield_xml",
                    "cluster_id": None,
                }
            )

        DShieldCache["attacks"] = enriched
        DShieldCache["last_fetch"] = now

        logger.info(f"DShield refresh complete: {len(enriched)} attacks")
        return log_and_respond(
            True,
            data={
                "message": f"DShield data refreshed successfully",
                "attack_count": len(enriched),
                "timestamp": now.isoformat() + "Z",
            },
        )

    except Exception as e:
        logger.error(f"DShield refresh error: {e}")
        return log_and_respond(
            False, error="DSHIELD_REFRESH_ERROR", message=str(e), status_code=500
        )


@app.get("/api/health/abuseipdb")
async def health_abuseipdb():
    """Health check for AbuseIPDB API."""
    try:
        if not ABUSEIPDB_KEY:
            return JSONResponse(
                content={
                    "status": "not_configured",
                    "message": "AbuseIPDB API key not configured",
                    "last_check": datetime.utcnow().isoformat() + "Z",
                }
            )

        async with httpx.AsyncClient() as client:
            resp = await client.get(
                "https://api.abuseipdb.com/api/v2/check",
                headers={"Accept": "application/json", "Key": ABUSEIPDB_KEY},
                params={"ipAddress": "8.8.8.8", "maxAgeInDays": 90},
                timeout=10,
            )

            if resp.status_code == 200:
                return JSONResponse(
                    content={
                        "status": "online",
                        "message": "AbuseIPDB API is operational",
                        "last_check": datetime.utcnow().isoformat() + "Z",
                    }
                )
            elif resp.status_code == 429:
                return JSONResponse(
                    content={
                        "status": "rate_limited",
                        "message": "AbuseIPDB API rate limit exceeded",
                        "last_check": datetime.utcnow().isoformat() + "Z",
                    }
                )
            else:
                return JSONResponse(
                    content={
                        "status": "error",
                        "message": f"AbuseIPDB API returned status {resp.status_code}",
                        "last_check": datetime.utcnow().isoformat() + "Z",
                    },
                    status_code=503,
                )

    except Exception as e:
        return JSONResponse(
            content={
                "status": "offline",
                "message": f"AbuseIPDB API error: {str(e)}",
                "last_check": datetime.utcnow().isoformat() + "Z",
            },
            status_code=503,
        )


@app.post("/api/debug/feed_mode")
async def set_feed_mode(mode: str = Query(..., pattern="^(live|fallback)$")):
    """Set live feed mode: 'live' (DShield) or 'fallback' (mock)."""
    global FEED_MODE
    if mode not in ("live", "fallback"):
        return log_and_respond(
            False,
            error="INVALID_MODE",
            message="mode must be 'live' or 'fallback'",
            status_code=400,
        )
    FEED_MODE = mode
    logger.info(f"Feed mode set to: {FEED_MODE}")
    return log_and_respond(True, data={"mode": FEED_MODE})


@app.get("/analyze_ip")
async def analyze_ip_endpoint(ip: str = Query(...)):
    """Analyze an IP address and return comprehensive data."""
    logger.info(f"/analyze_ip requested for IP: {ip}")

    try:
        ipaddress.ip_address(ip)
    except ValueError:
        raise InvalidIPError(ip)

    # Geo lookup
    geo_info = None
    try:
        geo = ip_to_location(ip)
        if isinstance(geo, dict) and not geo.get("error"):
            geo_info = geo
    except Exception as e:
        logger.warning(f"Geo lookup failed for {ip}: {e}")
        geo_info = None

    # AbuseIPDB lookup
    abuse_info = None
    try:
        abuse_resp = check_ip(ip)
        if isinstance(abuse_resp, dict) and abuse_resp.get("error"):
            abuse_info = {
                "error": abuse_resp.get("error"),
                "message": abuse_resp.get("message"),
            }
        else:
            abuse_info = (
                abuse_resp.get("data") if isinstance(abuse_resp, dict) else abuse_resp
            )
    except Exception as e:
        logger.warning(f"AbuseIPDB check failed for {ip}: {e}")
        abuse_info = None

    return JSONResponse(
        content={"ip": ip, "geo_info": geo_info, "abuse_info": abuse_info}
    )


@app.get("/enrich_ip")
async def enrich_ip_endpoint(ip: str, abuse: bool = False):
    try:
        ipaddress.ip_address(ip)
    except ValueError:
        raise InvalidIPError(ip)

    try:
        result = await enrich_ip(ip, use_abuseipdb=abuse)
        return {"success": True, "data": result}
    except httpx.HTTPStatusError as e:
        if e.response.status_code == 429:
            raise RateLimitError("AbuseIPDB")
        raise ServiceUnavailableError(
            "AbuseIPDB", {"status_code": e.response.status_code}
        )
    except Exception as e:
        logger.error(f"Error enriching IP {ip}: {e}")
        raise APIError(
            message=f"Failed to enrich IP {ip}",
            error_code="ENRICH_IP_ERROR",
            status_code=500,
        )


@app.get("/cluster_expand")
async def cluster_expand(
    cluster_id: Optional[str] = None,
    lat: Optional[float] = None,
    lon: Optional[float] = None,
    radius_km: float = 500,
):
    try:
        attacks = DShieldCache["attacks"]
        if cluster_id:
            group = [a for a in attacks if str(a.get("cluster_id")) == str(cluster_id)]
            return {
                "success": True,
                "data": {
                    "attacks": group,
                    "expand_type": "cluster_id",
                    "cluster_id": cluster_id,
                },
            }
        elif lat is not None and lon is not None:

            def haversine(lat1, lon1, lat2, lon2):
                from math import atan2, cos, radians, sin, sqrt

                R = 6371
                dlat = radians(lat2 - lat1)
                dlon = radians(lon2 - lon1)
                a = (
                    sin(dlat / 2) ** 2
                    + cos(radians(lat1)) * cos(radians(lat2)) * sin(dlon / 2) ** 2
                )
                c = 2 * atan2(sqrt(a), sqrt(1 - a))
                return R * c

            group = [
                a
                for a in attacks
                if a.get("lat") is not None
                and a.get("lon") is not None
                and haversine(lat, lon, a["lat"], a["lon"]) <= radius_km
            ]
            return log_and_respond(
                True,
                data={
                    "attacks": group,
                    "expand_type": "geo_radius",
                    "center": {"lat": lat, "lon": lon},
                    "radius_km": radius_km,
                },
            )
        else:
            return log_and_respond(
                False,
                error="NO_CRITERIA",
                message="Provide cluster_id or lat/lon for expansion",
                status_code=400,
            )
    except Exception as e:
        logger.error(f"/cluster_expand error: {e}")
        return log_and_respond(
            False, error="CLUSTER_EXPAND_ERROR", message=str(e), status_code=500
        )


@app.get("/live_feed")
async def live_feed_endpoint(enabled: bool = True, lighten: bool = False):
    logger.info(f"/live_feed requested: enabled={enabled}, lighten={lighten}")
    if not enabled:
        return log_and_respond(True, data={"status": "Live mode off", "attacks": []})
    try:
        attacks = await fetch_dshield_top_ips()
        if not isinstance(attacks, list):
            raise Exception("DShield fetch failed")
        clustered = cluster_attacks(attacks)
        if lighten:

            def simplify(attack):
                return {
                    "ip": attack["ip"],
                    "countryCode": attack["countryCode"],
                    "latitude": round(attack["latitude"], 2),
                    "longitude": round(attack["longitude"], 2),
                    "attackCount": attack["attackCount"],
                    "cluster_size": attack.get("cluster_size", 1),
                    "source": attack.get("source", "dshield"),
                }

            merged = []
            for att in clustered:
                found = False
                for m in merged:
                    dlat = math.radians(m["latitude"] - att["latitude"])
                    dlon = math.radians(m["longitude"] - att["longitude"])
                    a = (
                        math.sin(dlat / 2) ** 2
                        + math.cos(math.radians(att["latitude"]))
                        * math.cos(math.radians(m["latitude"]))
                        * math.sin(dlon / 2) ** 2
                    )
                    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
                    distance = 6371 * c
                    if distance < 20:
                        m["attackCount"] += att["attackCount"]
                        m["cluster_size"] += att.get("cluster_size", 1)
                        found = True
                        break
                if not found:
                    merged.append(simplify(att))
            logger.info(f"Returning {len(merged)} lightened attacks")
            return log_and_respond(True, data={"attacks": merged})
        logger.info(f"Returning {len(clustered)} clustered attacks")
        return log_and_respond(True, data={"attacks": clustered})
    except Exception as e:
        logger.error(f"DShield fetch failed: {str(e)}")
        dummy = [
            {
                "ip": "8.8.8.8",
                "countryCode": "US",
                "latitude": 37.386,
                "longitude": -122.084,
                "attackCount": 1,
                "cluster_size": 1,
                "source": "dshield",
            }
        ]
        return log_and_respond(
            False,
            error="API_FAIL",
            message="DShield unavailable, using fallback data.",
            data={"attacks": dummy},
            status_code=503,
        )


@app.get("/live")
async def live_endpoint():
    """Return combined AbuseIPDB and DShield data for globe visualization."""
    with LIVE_CACHE["lock"]:
        data = LIVE_CACHE["data"]
        ts = LIVE_CACHE["timestamp"]

    if not data:
        logger.info("/live returning fallback sample_ips because live cache is empty")
        sample = load_sample_ips()
        return {"timestamp": ts, "ips": sample, "source": "sample_fallback"}

    return {"timestamp": ts, "ips": data, "source": "live_cache"}


@app.get("/check_ip")
def check_ip_endpoint(ip: str = Query(...)):
    USE_MOCK = os.getenv("USE_MOCK_DATA", "false").lower() == "true"

    def load_mock_ip():
        mock_data = load_sample_ips()
        for item in mock_data:
            if item["ip"] == ip:
                return item
        if mock_data:
            mock = mock_data[0].copy()
            mock["ip"] = ip
            return mock
        return {
            "ip": ip,
            "abuseConfidenceScore": 0,
            "lastReportedAt": "2024-01-01T00:00:00Z",
            "totalReports": 0,
            "usageType": random.choice(USAGE_TYPES),
        }

    if USE_MOCK:
        return load_mock_ip()

    cached = get_cached(ip)
    if cached:
        return json.loads(cached)

    try:
        result = check_ip(ip)
        if isinstance(result, dict) and (
            result.get("error") == 429 or result.get("error") == "request_failed"
        ):
            return load_mock_ip()
        set_cache(ip, json.dumps(result))
        return result
    except Exception as e:
        logger.warning(f"Failed to check IP {ip}, falling back to mock: {str(e)}")
        return load_mock_ip()


@app.get("/geo_ip")
def geo_ip_endpoint(ip: str = Query(...)):
    try:
        ipaddress.ip_address(ip)
    except ValueError:
        raise InvalidIPError(ip)

    try:
        result = ip_to_location(ip)
        if isinstance(result, dict) and result.get("error"):
            raise ServiceUnavailableError("GeoIP", {"reason": result["error"]})
        return result
    except Exception as e:
        raise ServiceUnavailableError("GeoIP", {"reason": str(e)})


# WebSocket endpoints
@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    try:
        await manager.connect(websocket)
        while True:
            data = await websocket.receive_text()
            try:
                await websocket.send_json({"status": "received", "data": data})
            except Exception as e:
                await handle_ws_error(
                    websocket,
                    APIError(
                        message="Failed to process message",
                        error_code="MESSAGE_PROCESSING_ERROR",
                        status_code=400,
                        details={"received": data},
                    ),
                )
    except WebSocketDisconnect:
        manager.disconnect(websocket)
    except Exception as e:
        logger.error(f"WebSocket error: {e}")
        try:
            await handle_ws_error(
                websocket,
                APIError(
                    message="WebSocket connection error",
                    error_code="WS_CONNECTION_ERROR",
                    status_code=500,
                ),
            )
        finally:
            manager.disconnect(websocket)


@app.websocket("/ws/attacks")
async def ws_dshield_attacks(websocket: WebSocket):
    """Stream DShield attack events via WebSocket with resilient fallback."""
    await websocket.accept()
    logger.info("=== DShield WebSocket client connected ===")
    logger.info(f"WebSocket client state: {websocket.client_state}")
    logger.info(f"WebSocket client info: {websocket.client}")
    global FEED_MODE
    logger.info(f"Current FEED_MODE: {FEED_MODE}")
    logger.info(f"USE_MOCK_DATA env: {os.getenv('USE_MOCK_DATA', 'false')}")

    USE_MOCK = os.getenv("USE_MOCK_DATA", "false").lower() == "true"
    MODE = FEED_MODE  # "live" | "fallback"

    async def send_status(message: str):
        try:
            # Check WebSocket state before sending
            if websocket.client_state != websocket.client_state.CONNECTED:
                logger.info(
                    f"WebSocket disconnected, cannot send status message: '{message}'"
                )
                return False
            logger.info(f"Sending status message: '{message}'")
            await websocket.send_json(
                {
                    "type": "status",
                    "message": message,
                    "timestamp": datetime.utcnow().isoformat() + "Z",
                }
            )
            logger.debug(f"Status message sent successfully: '{message}'")
            return True
        except Exception as e:
            logger.error(f"Failed to send status message '{message}': {e}")
            return False

    if USE_MOCK or MODE == "fallback":
        await send_status("Using fallback/mock stream")
        await mock_attack_stream(websocket)
        return

    try:
        if not await send_status("Connected to DShield stream"):
            logger.info("WebSocket disconnected during initial status, stopping")
            return

        sent_events = set()
        backoff = 1.0
        max_backoff = 60.0
        fallback_after = 3  # Reduced attempts for faster fallback
        attempts = 0

        while True:
            # Check WebSocket state before each iteration
            if websocket.client_state != websocket.client_state.CONNECTED:
                logger.info("WebSocket disconnected during main loop, stopping")
                break

            try:
                logger.info(f"=== DShield fetch attempt {attempts + 1} ===")
                logger.info(
                    f"Calling fetch_dshield_events with max_retries=1, base_delay=1.0"
                )
                events = await fetch_dshield_events(max_retries=1, base_delay=1.0)
                logger.info(
                    f"DShield fetch returned {len(events) if events else 0} events"
                )
                if events:
                    logger.info(
                        f"First event sample: {events[0] if events else 'None'}"
                    )
                else:
                    logger.warning("DShield fetch returned empty events list")

                if not events:
                    attempts += 1
                    logger.warning(
                        f"DShield returned no events (attempt {attempts}/{fallback_after})"
                    )
                    if not await send_status("DShield feed offline"):
                        logger.info(
                            "WebSocket disconnected while sending offline status, stopping"
                        )
                        break
                    if attempts >= fallback_after:
                        logger.info(
                            "=== Switching to fallback after failed attempts ==="
                        )
                        if not await send_status("Switching to fallback/mock stream"):
                            logger.info(
                                "WebSocket disconnected while switching to fallback, stopping"
                            )
                            break
                        await mock_attack_stream(websocket)
                        return
                    await asyncio.sleep(min(max_backoff, backoff))
                    backoff = min(max_backoff, backoff * 2)
                    continue

                # reset backoff and attempts on success
                backoff = 1.0
                attempts = 0
                logger.info("✅ Live DShield stream active")

                new_events = []
                for event in events:
                    event_id = event.get("id")
                    if event_id and event_id not in sent_events:
                        sent_events.add(event_id)
                        new_events.append(event)

                logger.info(
                    f"Found {len(new_events)} new events to send (total events: {len(events)}, already sent: {len(sent_events)})"
                )

                for i, event in enumerate(new_events):
                    # Check WebSocket state before each send
                    if websocket.client_state != websocket.client_state.CONNECTED:
                        logger.info(
                            "WebSocket disconnected while sending events, stopping"
                        )
                        return
                    try:
                        logger.debug(
                            f"Sending event {i+1}/{len(new_events)}: {event.get('id', 'unknown')}"
                        )
                        await websocket.send_json({"type": "attack", "data": event})
                        logger.debug(f"Event {i+1}/{len(new_events)} sent successfully")
                    except Exception as send_error:
                        logger.error(
                            f"Failed to send event {event.get('id', 'unknown')}: {send_error}"
                        )
                        # If send fails, likely due to disconnection, break out
                        return

                if new_events:
                    logger.info(f"Sent {len(new_events)} new DShield events")
                else:
                    logger.debug("No new DShield events to send")

                if len(sent_events) > 2000:
                    logger.debug("Clearing sent events cache")
                    sent_events.clear()

                await asyncio.sleep(10)

            except Exception as fetch_error:
                logger.error(f"DShield fetch error: {fetch_error}")
                # Only try to send error if WebSocket is still connected
                if websocket.client_state == websocket.client_state.CONNECTED:
                    try:
                        await websocket.send_json(
                            {
                                "type": "error",
                                "message": f"DShield fetch failed: {str(fetch_error)}",
                                "timestamp": datetime.utcnow().isoformat() + "Z",
                            }
                        )
                    except Exception:
                        pass
                attempts += 1
                if attempts >= fallback_after:
                    logger.info("Switching to fallback due to repeated errors")
                    if not await send_status(
                        "Switching to fallback/mock stream due to errors"
                    ):
                        logger.info(
                            "WebSocket disconnected while switching to fallback, stopping"
                        )
                        break
                    await mock_attack_stream(websocket)
                    return
                await asyncio.sleep(min(max_backoff, backoff))
                backoff = min(max_backoff, backoff * 2)

    except WebSocketDisconnect:
        logger.info("DShield WebSocket client disconnected")
    except Exception as e:
        logger.error(f"DShield WebSocket error: {e}")
        # Only try to send error if WebSocket is still connected
        if websocket.client_state == websocket.client_state.CONNECTED:
            try:
                await websocket.send_json(
                    {
                        "type": "error",
                        "message": f"WebSocket error: {str(e)}",
                        "timestamp": datetime.utcnow().isoformat() + "Z",
                    }
                )
            except Exception:
                pass
        try:
            await websocket.close()
        except Exception:
            pass
        finally:
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


# Debug endpoints
@app.get("/api/debug/dshield")
async def debug_dshield():
    """Debug endpoint to fetch and return latest DShield events."""
    try:
        events = await fetch_dshield_events()
        return {
            "status": "success",
            "count": len(events),
            "events": events,
            "timestamp": datetime.utcnow().isoformat() + "Z",
        }
    except Exception as e:
        logger.error(f"Debug DShield fetch failed: {e}")
        return {
            "status": "error",
            "message": str(e),
            "timestamp": datetime.utcnow().isoformat() + "Z",
        }


@app.get("/api/debug/dshield-fetch")
async def debug_dshield_fetch():
    """Debug endpoint to test DShield fetch with detailed response info."""
    try:
        logger.info("=== DShield Debug Fetch Starting ===")

        # Test direct HTTP fetch
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.get("https://isc.sans.edu/api/topips/")
            logger.info(f"DShield raw status: {resp.status_code}")
            logger.info(
                f"DShield content-type: {resp.headers.get('content-type', 'unknown')}"
            )
            logger.info(f"DShield response length: {len(resp.text)}")
            logger.info(f"DShield response preview: {resp.text[:200]}")

            # Test XML parsing
            if resp.text.strip().startswith("<?xml") or resp.text.strip().startswith(
                "<"
            ):
                logger.info("DShield returned XML, testing xmltodict parsing")
                try:
                    xml_data = xmltodict.parse(resp.text)
                    logger.info(
                        f"XML parsing successful, structure: {list(xml_data.keys())}"
                    )

                    entries = []
                    if "topips" in xml_data and "ipaddress" in xml_data["topips"]:
                        ip_list = xml_data["topips"]["ipaddress"]
                        if not isinstance(ip_list, list):
                            ip_list = [ip_list]

                        for ip_elem in ip_list:
                            try:
                                rank = int(ip_elem.get("rank", 0))
                                ip = ip_elem.get("source", "")
                                reports = int(ip_elem.get("reports", 0))
                                targets = int(ip_elem.get("targets", 0))

                                if ip:
                                    entries.append(
                                        {
                                            "rank": rank,
                                            "ip": ip,
                                            "reports": reports,
                                            "targets": targets,
                                        }
                                    )
                            except (ValueError, TypeError) as e:
                                logger.warning(
                                    f"Failed to parse IP entry: {ip_elem}, error: {e}"
                                )
                                continue

                    logger.info(
                        f"DShield XML parsed successfully: {len(entries)} entries"
                    )

                    return {
                        "status": "success",
                        "http_status": resp.status_code,
                        "content_type": resp.headers.get("content-type", "unknown"),
                        "response_length": len(resp.text),
                        "response_preview": resp.text[:200],
                        "xml_parsing": "success",
                        "entries_count": len(entries),
                        "sample_entries": entries[:5],  # First 5 entries
                        "timestamp": datetime.utcnow().isoformat() + "Z",
                    }

                except Exception as xml_err:
                    logger.error(f"XML parsing failed: {xml_err}")
                    return {
                        "status": "xml_parse_error",
                        "http_status": resp.status_code,
                        "content_type": resp.headers.get("content-type", "unknown"),
                        "response_length": len(resp.text),
                        "response_preview": resp.text[:200],
                        "xml_parsing": "failed",
                        "error": str(xml_err),
                        "timestamp": datetime.utcnow().isoformat() + "Z",
                    }
            else:
                logger.warning("DShield response is not XML")
                return {
                    "status": "not_xml",
                    "http_status": resp.status_code,
                    "content_type": resp.headers.get("content-type", "unknown"),
                    "response_length": len(resp.text),
                    "response_preview": resp.text[:200],
                    "xml_parsing": "not_applicable",
                    "timestamp": datetime.utcnow().isoformat() + "Z",
                }

    except Exception as e:
        logger.error(f"DShield debug fetch failed: {e}")
        return {
            "status": "error",
            "message": str(e),
            "timestamp": datetime.utcnow().isoformat() + "Z",
        }


@app.get("/api/debug/dshield/simulate")
async def debug_dshield_simulate():
    """Debug endpoint to return simulated DShield events for testing."""
    try:
        # Create a few simulated events for testing
        simulated_events = [
            {
                "id": "sim-1.2.3.4-1234567890",
                "src_ip": "1.2.3.4",
                "dst_ip": "0.0.0.0",
                "src_lat": 40.7128,
                "src_lng": -74.0060,
                "dst_lat": 0.0,
                "dst_lng": 0.0,
                "reported_at": datetime.utcnow().isoformat() + "Z",
                "confidence": 85,
                "protocol": "tcp",
                "description": "Simulated DShield report: 42 attacks",
                "source": "dshield",
                "attack_count": 42,
                "country_code": "US",
                "country_name": "United States",
                "isp": "Test ISP",
                "domain": "example.com",
            },
            {
                "id": "sim-5.6.7.8-1234567891",
                "src_ip": "5.6.7.8",
                "dst_ip": "0.0.0.0",
                "src_lat": 51.5074,
                "src_lng": -0.1278,
                "dst_lat": 0.0,
                "dst_lng": 0.0,
                "reported_at": datetime.utcnow().isoformat() + "Z",
                "confidence": 72,
                "protocol": "tcp",
                "description": "Simulated DShield report: 28 attacks",
                "source": "dshield",
                "attack_count": 28,
                "country_code": "GB",
                "country_name": "United Kingdom",
                "isp": "Test ISP UK",
                "domain": "example.co.uk",
            },
        ]
        return {
            "status": "success",
            "count": len(simulated_events),
            "events": simulated_events,
            "timestamp": datetime.utcnow().isoformat() + "Z",
            "note": "This is simulated data for testing",
        }
    except Exception as e:
        logger.error(f"Debug DShield simulation failed: {e}")
        return {
            "status": "error",
            "message": str(e),
            "timestamp": datetime.utcnow().isoformat() + "Z",
        }


@app.get("/api/debug/feed-mode")
async def debug_feed_mode(
    mode: str = Query("live", description="Feed mode: live, fallback, or mock")
):
    """Debug endpoint to test different feed modes."""
    global FEED_MODE

    if mode not in ["live", "fallback", "mock"]:
        return JSONResponse(
            content={"error": "Invalid mode. Use: live, fallback, or mock"},
            status_code=400,
        )

    old_mode = FEED_MODE
    FEED_MODE = mode

    return JSONResponse(
        content={
            "message": f"Feed mode changed from '{old_mode}' to '{mode}'",
            "current_mode": FEED_MODE,
            "instructions": {
                "live": "Connects to real DShield API",
                "fallback": "Uses mock data when DShield fails",
                "mock": "Always uses mock data",
            },
        }
    )


@app.get("/api/health/live-feed")
async def health_live_feed():
    """Health endpoint for live feed status."""
    try:
        # Test DShield connectivity
        events = await fetch_dshield_events(max_retries=1, base_delay=0.5)
        if events:
            return JSONResponse(
                content={
                    "status": "live",
                    "message": "DShield feed is operational",
                    "event_count": len(events),
                    "last_check": datetime.utcnow().isoformat() + "Z",
                }
            )
        else:
            return JSONResponse(
                content={
                    "status": "fallback",
                    "message": "DShield feed unavailable, fallback active",
                    "last_check": datetime.utcnow().isoformat() + "Z",
                }
            )
    except Exception as e:
        return JSONResponse(
            content={
                "status": "down",
                "message": f"DShield feed error: {str(e)}",
                "last_check": datetime.utcnow().isoformat() + "Z",
            },
            status_code=503,
        )


# Startup events
@app.on_event("startup")
async def start_background_tasks():
    asyncio.create_task(dshield_fetch_and_enrich())
    asyncio.create_task(update_live_cache())


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)

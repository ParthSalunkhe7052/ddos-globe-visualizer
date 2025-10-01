import os
import logging
import json
import math
import asyncio
import ipaddress
import random
import time
from typing import List, Dict, Any
from fastapi import FastAPI, Query, WebSocket, WebSocketDisconnect, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from dotenv import load_dotenv
import httpx
from dshield_service import fetch_dshield_top_ips
from abuseipdb_service import check_ip
from geo_service import ip_to_location

# --- In-memory caches ---
from collections import defaultdict
from datetime import datetime, timedelta
import threading

# DShield cache: {"attacks": [...], "last_fetch": datetime}
DShieldCache = {"attacks": [], "last_fetch": None}
# Enrichment cache: {ip: {"data": ..., "expires": datetime}}
EnrichCache = {}
# AbuseIPDB quota state
AbuseIPDB429 = {"blocked_until": None}
# Live cache for combined data used by /live endpoint
LIVE_CACHE = {"lock": threading.Lock(), "data": [], "timestamp": time.time()}

# Background polling intervals (seconds)
ABUSEIPDB_INTERVAL = int(os.getenv("ABUSEIPDB_INTERVAL", "300"))
DSHIELD_INTERVAL = int(os.getenv("DSHIELD_INTERVAL", "300"))

# --- Utility: ISO8601 time ---
def iso_now():
    return datetime.utcnow().replace(microsecond=0).isoformat() + "Z"

# --- Place all FastAPI endpoints and startup after app is defined ---

# ... existing code ...

# Ensure this is after 'app = FastAPI()' and all config

def register_custom_endpoints(app):
    @app.get("/enrich_ip")
    async def enrich_ip_endpoint(ip: str, abuse: bool = False):
        try:
            import ipaddress
            ipaddress.ip_address(ip)
        except Exception:
            return log_and_respond(False, error="INVALID_IP", message="Invalid IP address", status_code=400)
        try:
            result = await enrich_ip(ip, use_abuseipdb=abuse)
            return log_and_respond(True, data=result)
        except Exception as e:
            logger.error(f"/enrich_ip error: {e}")
            return log_and_respond(False, error="ENRICH_IP_ERROR", message=str(e), status_code=500)
    @app.get("/cluster_expand")
    async def cluster_expand(cluster_id: str = None, lat: float = None, lon: float = None, radius_km: float = 500):
        try:
            attacks = DShieldCache["attacks"]
            if cluster_id:
                # Expand by cluster_id (group by ISP or country, etc.)
                group = [a for a in attacks if str(a.get("cluster_id")) == str(cluster_id)]
                return log_and_respond(True, data={"attacks": group, "expand_type": "cluster_id", "cluster_id": cluster_id})
            elif lat is not None and lon is not None:
                # Expand by geo-radius
                def haversine(lat1, lon1, lat2, lon2):
                    from math import radians, sin, cos, sqrt, atan2
                    R = 6371
                    dlat = radians(lat2 - lat1)
                    dlon = radians(lon2 - lon1)
                    a = sin(dlat/2)**2 + cos(radians(lat1))*cos(radians(lat2))*sin(dlon/2)**2
                    c = 2*atan2(sqrt(a), sqrt(1-a))
                    return R * c
                group = [a for a in attacks if a.get("lat") is not None and a.get("lon") is not None and haversine(lat, lon, a["lat"], a["lon"]) <= radius_km]
                return log_and_respond(True, data={"attacks": group, "expand_type": "geo_radius", "center": {"lat": lat, "lon": lon}, "radius_km": radius_km})
            else:
                return log_and_respond(False, error="NO_CRITERIA", message="Provide cluster_id or lat/lon for expansion", status_code=400)
        except Exception as e:
            logger.error(f"/cluster_expand error: {e}")
            return log_and_respond(False, error="CLUSTER_EXPAND_ERROR", message=str(e), status_code=500)
    @app.get("/live_feed")
    async def live_feed():
        try:
            # Serve from cache
            attacks = DShieldCache["attacks"]
            last_fetch = DShieldCache["last_fetch"].isoformat()+"Z" if DShieldCache["last_fetch"] else None
            return log_and_respond(True, data={
                "attacks": attacks,
                "last_fetch": last_fetch,
                "source": "dshield_cache"
            })
        except Exception as e:
            logger.error(f"/live_feed error: {e}")
            return log_and_respond(False, error="LIVE_FEED_ERROR", message=str(e), status_code=500)
    @app.get("/health")
    def health():
        return log_and_respond(True, data={
            "status": "ok",
            "time": iso_now(),
            "dshield_last_fetch": DShieldCache["last_fetch"].isoformat()+"Z" if DShieldCache["last_fetch"] else None,
            "abuseipdb_key_present": bool(ABUSEIPDB_KEY)
        })

    async def enrich_ip(ip: str, use_abuseipdb: bool = False) -> dict:
        now = datetime.utcnow()
        cached = EnrichCache.get(ip)
        if cached and cached["expires"] > now:
            return cached["data"]
        geo = {}
        try:
            async with httpx.AsyncClient() as client:
                r = await client.get(f"http://ip-api.com/json/{ip}?fields=status,country,countryCode,lat,lon,isp", timeout=5)
                if r.status_code == 200:
                    g = r.json()
                    if g.get("status") == "success":
                        geo = {
                            "countryCode": g.get("countryCode"),
                            "countryName": g.get("country"),
                            "lat": g.get("lat"),
                            "lon": g.get("lon"),
                            "isp": g.get("isp")
                        }
        except Exception as e:
            logger.warning(f"Geo enrichment failed for {ip}: {e}")
        domain = None
        try:
            import socket
            loop = asyncio.get_event_loop()
            domain = await asyncio.wait_for(loop.run_in_executor(None, lambda: socket.gethostbyaddr(ip)[0]), timeout=1)
        except Exception:
            domain = None
        abuse = None
        if use_abuseipdb and ABUSEIPDB_KEY and (not AbuseIPDB429["blocked_until"] or now > AbuseIPDB429["blocked_until"]):
            try:
                async with httpx.AsyncClient() as client:
                    resp = await client.get(
                        "https://api.abuseipdb.com/api/v2/check",
                        headers={"Accept": "application/json", "Key": ABUSEIPDB_KEY},
                        params={"ipAddress": ip, "maxAgeInDays": 90},
                        timeout=8
                    )
                    if resp.status_code == 429:
                        logger.warning("AbuseIPDB 429: quota exceeded, blocking for 24h")
                        AbuseIPDB429["blocked_until"] = now + timedelta(hours=24)
                    elif resp.status_code == 200:
                        abuse_data = resp.json().get("data", {})
                        abuse = {
                            "abuseConfidenceScore": abuse_data.get("abuseConfidenceScore", 0),
                            "totalReports": abuse_data.get("totalReports", 0),
                            "lastReportedAt": abuse_data.get("lastReportedAt", None)
                        }
            except Exception as e:
                logger.warning(f"AbuseIPDB enrich failed for {ip}: {e}")
        result = {"ip": ip, **geo, "domain": domain, "abuse": abuse}
        EnrichCache[ip] = {"data": result, "expires": now + timedelta(hours=24)}
        return result

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
                    enriched.append({
                        "ip": ip,
                        "attackCount": attackCount,
                        "source": "dshield",
                        "lat": meta.get("lat"),
                        "lon": meta.get("lon"),
                        "countryCode": meta.get("countryCode"),
                        "countryName": meta.get("countryName"),
                        "isp": meta.get("isp"),
                        "domain": meta.get("domain"),
                        "firstSeen": now.isoformat()+"Z",
                        "lastSeen": now.isoformat()+"Z",
                        "cached_from": "dshield_xml",
                        "cluster_id": None
                    })
                DShieldCache["attacks"] = enriched
                DShieldCache["last_fetch"] = now
                logger.info(f"DShield fetch complete: {len(enriched)} attacks at {now.isoformat()}Z")
            except Exception as e:
                logger.error(f"DShield fetch/enrich failed: {e}")
            await asyncio.sleep(300)

    @app.on_event("startup")
    async def start_background_tasks():
        asyncio.create_task(dshield_fetch_and_enrich())



app = FastAPI(title="DDoS Globe Visualizer Backend", description="Backend API for DDoS globe.", version="1.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register custom endpoints and background tasks
register_custom_endpoints(app)



# --- CLEANED UP, ROBUST, AND CONSISTENT FASTAPI BACKEND ---

# --- WebSocket Connection Manager (needed for /ws endpoints) ---
class ConnectionManager:
    def __init__(self):
        self.active_connections: list[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)

    def disconnect(self, websocket: WebSocket):
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)

    async def broadcast(self, message: dict):
        to_remove = []
        for connection in self.active_connections:
            try:
                await connection.send_json(message)
            except Exception:
                to_remove.append(connection)
        for ws in to_remove:
            self.disconnect(ws)

manager = ConnectionManager()

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Load .env and AbuseIPDB key
load_dotenv(override=True)
ABUSEIPDB_KEY = os.getenv("ABUSEIPDB_KEY")
if ABUSEIPDB_KEY:
    logger.info(f"AbuseIPDB API key loaded: {ABUSEIPDB_KEY[:4]}... (length {len(ABUSEIPDB_KEY)})")
else:
    logger.warning("AbuseIPDB API key not configured")

app = FastAPI(title="DDoS Globe Visualizer Backend", description="Backend API for DDoS globe.", version="1.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- Consistent JSON/logging helper ---
def log_and_respond(success, data=None, error=None, message=None, status_code=200, headers=None):
    resp = {
        "success": success,
        "data": data if success else None,
        "error": error if not success else None,
        "message": message if not success else None
    }
    logger.info(f"Response: {resp}")
    return JSONResponse(content=resp, status_code=status_code, headers=headers or {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Credentials": "true"
    })

# --- Analyze IP endpoint (single consolidated implementation) ---
@app.get("/analyze_ip")
def analyze_ip_endpoint(ip: str = Query(...)):
    """
    Analyze an IP address and return flat JSON with keys: ip, geo_info, abuse_info.
    This is a minimal, robust endpoint used by tests and the frontend.
    """
    try:
        ipaddress.ip_address(ip)
    except Exception:
        logging.error(f"Invalid IP address: {ip}")
        return JSONResponse(content={"error": "Invalid IP address"}, status_code=400)

    # Geo lookup (using local geo_service if available)
    geo_info = None
    try:
        geo = ip_to_location(ip)
        if isinstance(geo, dict) and not geo.get("error"):
            geo_info = geo
        else:
            geo_info = None
    except Exception as e:
        logging.warning(f"Geo lookup failed for {ip}: {e}")
        geo_info = None

    # AbuseIPDB lookup (using abuseipdb_service.check_ip)
    abuse_info = None
    try:
        abuse_resp = check_ip(ip)
        # abuseipdb_service returns dict; if it contains 'error' key, propagate
        if isinstance(abuse_resp, dict) and abuse_resp.get("error"):
            abuse_info = {"error": abuse_resp.get("error"), "message": abuse_resp.get("message")}
        else:
            abuse_info = abuse_resp.get("data") if isinstance(abuse_resp, dict) else abuse_resp
    except Exception as e:
        logging.warning(f"AbuseIPDB check failed for {ip}: {e}")
        abuse_info = None

    return JSONResponse(content={"ip": ip, "geo_info": geo_info, "abuse_info": abuse_info})

# --- DShield Live Feed Endpoint ---
def cluster_attacks(attacks, max_distance_km=100):
    clusters = []
    for attack in attacks:
        found = False
        for cluster in clusters:
            lat1, lon1 = attack['latitude'], attack['longitude']
            lat2, lon2 = cluster['latitude'], cluster['longitude']
            dlat = math.radians(lat2 - lat1)
            dlon = math.radians(lon2 - lon1)
            a = math.sin(dlat/2)**2 + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlon/2)**2
            c = 2 * math.atan2(math.sqrt(a), math.sqrt(1-a))
            distance = 6371 * c
            if distance < max_distance_km:
                cluster['cluster_size'] += 1
                found = True
                break
        if not found:
            clusters.append({**attack, 'cluster_size': 1})
    return clusters

@app.get("/live_feed")
async def live_feed_endpoint(enabled: bool = True, lighten: bool = False, request: Request = None):
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
                    "source": attack.get("source", "dshield")
                }
            merged = []
            for att in clustered:
                found = False
                for m in merged:
                    dlat = math.radians(m["latitude"] - att["latitude"])
                    dlon = math.radians(m["longitude"] - att["longitude"])
                    a = math.sin(dlat/2)**2 + math.cos(math.radians(att["latitude"])) * math.cos(math.radians(m["latitude"])) * math.sin(dlon/2)**2
                    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1-a))
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
        dummy = [{
            "ip": "8.8.8.8",
            "countryCode": "US",
            "latitude": 37.386,
            "longitude": -122.084,
            "attackCount": 1,
            "cluster_size": 1,
            "source": "dshield"
        }]
        return log_and_respond(
            False, error="API_FAIL", message="DShield unavailable, using fallback data.",
            data={"attacks": dummy}, status_code=503
        )

# Duplicate/older analyze endpoint removed. The consolidated synchronous
# analyze implementation above is used for tests and frontend.
        logger.error(f"AbuseIPDB fetch failed: {e}")
        return []

async def update_live_cache():
    """Background task to update the /live cache."""
    while True:
        try:
            abuse_data, dshield_data = await asyncio.gather(
                fetch_latest_reports(),
                fetch_dshield_top_ips()
            )
            # Defensive: ensure we have lists
            if isinstance(abuse_data, dict) and abuse_data.get("error"):
                logger.warning(f"Abuse reports fetch returned error: {abuse_data}")
                abuse_data = []
            if not isinstance(abuse_data, list):
                # Sometimes the API may return a dict or other type; normalize to list
                logger.warning(f"Abuse reports unexpected type, normalizing to list: {type(abuse_data)}")
                abuse_data = []
            if not isinstance(dshield_data, list):
                logger.warning(f"DShield data unexpected type, normalizing to list: {type(dshield_data)}")
                dshield_data = []

            # Merge and deduplicate
            merged = {}
            for entry in dshield_data:
                merged[entry["ip"]] = entry.copy()
            for entry in abuse_data:
                # AbuseIPDB reports use 'ipAddress' key, normalize
                if isinstance(entry, dict):
                    ip = entry.get("ip") or entry.get("ipAddress")
                else:
                    # Skip unexpected entries
                    logger.debug(f"Skipping non-dict abuse entry: {entry}")
                    continue
                if ip in merged:
                    # Merge: prefer AbuseIPDB for abuseConfidenceScore, keep attackCount if present
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

@app.on_event("startup")
async def start_background_tasks():
    asyncio.create_task(update_live_cache())
# --- Live attack streaming WebSocket ---
@app.get("/live")
async def live_endpoint():
    """Return combined AbuseIPDB and DShield data for globe visualization."""
    with LIVE_CACHE["lock"]:
        data = LIVE_CACHE["data"]
        ts = LIVE_CACHE["timestamp"]

    # If cache is empty or not yet populated, return a small sample immediately
    if not data:
        logger.info("/live returning fallback sample_ips because live cache is empty")
        sample = load_sample_ips()
        return {"timestamp": ts, "ips": sample, "source": "sample_fallback"}

    return {"timestamp": ts, "ips": data, "source": "live_cache"}

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Base directory for file operations
BASE_DIR = os.path.dirname(os.path.abspath(__file__))

def load_sample_ips(fallback: bool = True) -> List[Dict[str, Any]]:
    """Load sample IPs with fallback to prevent crashes.
    
    Args:
        fallback (bool): If True, return default data on error. If False, raise exceptions.

    Returns:
        List[Dict[str, Any]]: List of sample IP data dictionaries
    
    Raises:
        FileNotFoundError: If fallback=False and mock_data/sample_ips.json doesn't exist
        json.JSONDecodeError: If fallback=False and the JSON file is invalid
        Exception: If fallback=False and any other error occurs
    """
    path = os.path.join(BASE_DIR, "mock_data", "sample_ips.json")
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
        return [{
            "ip": "8.8.8.8",
            "countryCode": "US",
            "latitude": 37.386,
            "longitude": -122.084,
            "isp": "Google LLC",
            "domain": "google.com",
            "abuseConfidenceScore": 0,
            "lastReportedAt": "2024-01-01T00:00:00Z",
            "totalReports": 0,
            "usageType": "Data Center/Web Hosting/Transit"
        }]

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
    "Mobile ISP"
]
def random_ip():
    return f"{random.randint(1,255)}.{random.randint(0,255)}.{random.randint(0,255)}.{random.randint(1,255)}"

async def mock_attack_stream(websocket: WebSocket):
    await websocket.accept()
    try:
        while True:
            entry = random.choice(SAMPLE_IPS)
            jitter_lat = entry["latitude"] + random.uniform(-1, 1)
            jitter_lon = entry["longitude"] + random.uniform(-1, 1)
            abuse_score = random.randint(0, 100)
            usage_type = random.choice(USAGE_TYPES)
            reported_at = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
            event = {
                "ip": entry["ip"],
                "countryCode": entry["countryCode"],
                "latitude": jitter_lat,
                "longitude": jitter_lon,
                "abuseConfidenceScore": abuse_score,
                "reportedAt": reported_at,
                "usageType": usage_type,
                "isp": entry["isp"],
                "domain": entry["domain"],
                "targetLat": random.uniform(-90, 90),
                "targetLon": random.uniform(-180, 180),
                "raw": dict(entry, abuseConfidenceScore=abuse_score, usageType=usage_type, latitude=jitter_lat, longitude=jitter_lon, reportedAt=reported_at)
            }
            await websocket.send_json(event)
            await asyncio.sleep(random.uniform(3, 8))
    except WebSocketDisconnect:
        logger.info("Client disconnected from mock attack stream")
    except Exception as e:
        logger.error(f"Error in mock attack stream: {str(e)}")
        try:
            await websocket.send_json({"error": str(e)})
            await websocket.close()
        except Exception:
            pass

load_dotenv()


# Mock attacks WebSocket endpoint
# (moved below app = FastAPI definition)

# back to relative imports
from ws import generate_fake_attacks
import json
from ip_cache import get_cached, set_cache
from abuseipdb_service import check_ip
from geo_service import ip_to_location

load_dotenv()

class ConnectionManager:
    def __init__(self):
        self.active_connections: list[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)

    def disconnect(self, websocket: WebSocket):
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)

    async def broadcast(self, message: dict):
        to_remove = []
        for connection in self.active_connections:
            try:
                await connection.send_json(message)
            except Exception:
                to_remove.append(connection)
        for ws in to_remove:
            self.disconnect(ws)



# --- Live attack streaming WebSocket ---
import httpx
from collections import deque

POLL_INTERVAL = 10  # seconds
MAX_CACHE = 1000
_recent_report_sigs = deque(maxlen=MAX_CACHE)

def _report_signature(report):
    # Use id if present, else ip+reportedAt
    if 'reportId' in report:
        return str(report['reportId'])
    ip = report.get('ipAddress') or report.get('ip')
    ts = report.get('reportedAt') or report.get('lastReportedAt')
    return f"{ip}-{ts}"

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

@app.websocket("/ws/live-attacks")
async def ws_live_attacks(websocket: WebSocket):
    USE_MOCK = os.getenv("USE_MOCK_DATA", "false").lower() == "true"
    if USE_MOCK:
        await mock_attack_stream(websocket)
        return
    await websocket.accept()
    api_key = ABUSEIPDB_KEY
    if not api_key:
        await websocket.send_json({"error": "AbuseIPDB API key not configured"})
        await websocket.close()
        return
    try:
        while True:
            reports = await fetch_latest_reports()
            if isinstance(reports, dict) and reports.get("error"):
                await websocket.send_json(reports)
                await asyncio.sleep(POLL_INTERVAL)
                continue
            for report in sorted(reports, key=lambda r: r.get("reportedAt", ""), reverse=True):
                sig = _report_signature(report)
                if sig not in _recent_report_sigs:
                    _recent_report_sigs.append(sig)
                    payload = {
                        "ip": report.get("ipAddress"),
                        "countryCode": report.get("countryCode"),
                        "latitude": report.get("latitude"),
                        "longitude": report.get("longitude"),
                        "abuseConfidenceScore": report.get("abuseConfidenceScore"),
                        "reportedAt": report.get("reportedAt"),
                        "usageType": report.get("usageType"),
                        "isp": report.get("isp"),
                        "domain": report.get("domain"),
                        "targetLat": random.uniform(-90, 90),
                        "targetLon": random.uniform(-180, 180),
                        "raw": report
                    }
                    await websocket.send_json(payload)
            await asyncio.sleep(POLL_INTERVAL)
    except WebSocketDisconnect:
        pass
    except Exception as e:
        await websocket.send_json({"error": "internal_error", "message": str(e)})
        await websocket.close()

@app.on_event("startup")
async def start_fake_traffic():
    asyncio.create_task(generate_fake_attacks(manager))

@app.get("/ping")
def ping():
    return {"status": "ok"}

@app.get("/check_ip")
def check_ip_endpoint(ip: str = Query(...)):
    USE_MOCK = os.getenv("USE_MOCK_DATA", "false").lower() == "true"
    def load_mock_ip():
        """Get mock data for a specific IP from sample data"""
        mock_data = load_sample_ips()
        # Try to find the exact IP first
        for item in mock_data:
            if item["ip"] == ip:
                return item
        # If not found, return the first item with modified IP
        if mock_data:
            mock = mock_data[0].copy()
            mock["ip"] = ip
            return mock
        # If no sample data, return basic mock
        return {
            "ip": ip,
            "abuseConfidenceScore": 0,
            "lastReportedAt": "2024-01-01T00:00:00Z",
            "totalReports": 0,
            "usageType": random.choice(USAGE_TYPES)
        }
        
    if USE_MOCK:
        return load_mock_ip()

    cached = get_cached(ip)
    if cached:
        return json.loads(cached)
        
    try:
        result = check_ip(ip)
        # If AbuseIPDB returns 429 or error, fallback to mock
        if isinstance(result, dict) and (result.get("error") == 429 or result.get("error") == "request_failed"):
            return load_mock_ip()
        set_cache(ip, json.dumps(result))
        return result
    except Exception as e:
        logger.warning(f"Failed to check IP {ip}, falling back to mock: {str(e)}")
        return load_mock_ip()

@app.get("/geo_ip")
def geo_ip_endpoint(ip: str = Query(...)):
    try:
        return ip_to_location(ip)
    except Exception as e:
        return {"error": str(e)}



# --- Async AbuseIPDB analyze endpoint ---
from fastapi import HTTPException
import httpx
import os



@app.get("/analyze_ip")
async def analyze_ip_endpoint(ip: str = Query(...)):
    from fastapi.responses import JSONResponse
    headers = {"Access-Control-Allow-Origin": "*", "Access-Control-Allow-Credentials": "true"}
    logging.info(f"/analyze_ip requested for IP: {ip}")
    if not ABUSEIPDB_KEY:
        logging.error("AbuseIPDB API key not configured")
        return JSONResponse(content={"error": "API key not configured"}, headers=headers)
    try:
        ipaddress.ip_address(ip)
    except Exception:
        logging.error(f"Invalid IP address: {ip}")
        return JSONResponse(content={"error": "Invalid IP address"}, headers=headers)

    url = "https://api.abuseipdb.com/api/v2/check"
    req_headers = {"Accept": "application/json", "Key": ABUSEIPDB_KEY}
    params = {"ipAddress": ip, "maxAgeInDays": 90}
    try:
        async with httpx.AsyncClient() as client:
            resp = await client.get(url, headers=req_headers, params=params, timeout=10)
            logging.info(f"AbuseIPDB response status: {resp.status_code}")
            if resp.status_code == 429:
                logging.warning("AbuseIPDB API rate limit reached")
                return JSONResponse(content={
                    "error": "API_LIMIT",
                    "message": "AbuseIPDB daily request limit reached. Try again tomorrow or upgrade your plan."
                }, headers=headers)
            if resp.status_code == 401 or resp.status_code == 403:
                logging.error("AbuseIPDB API key not configured or invalid")
                return JSONResponse(content={"error": "API key not configured"}, headers=headers)
            if resp.status_code != 200:
                logging.error(f"AbuseIPDB error {resp.status_code}: {resp.text}")
                return JSONResponse(content={"error": "IP data not found"}, headers=headers)
            abuse_data = resp.json().get("data")
            if not abuse_data:
                logging.error(f"No data found for IP: {ip}")
                return JSONResponse(content={"error": "IP data not found"}, headers=headers)
    except Exception as e:
        logging.error(f"AbuseIPDB request failed: {str(e)}")
        return JSONResponse(content={"error": "IP data not found"}, headers=headers)

    # Return only the required fields, directly, with null/empty fallback
    result = {
        "ip": abuse_data.get("ipAddress", ip) or "",
        "abuseConfidenceScore": abuse_data.get("abuseConfidenceScore", 0),
        "countryCode": abuse_data.get("countryCode", "") or "",
        "ISP": abuse_data.get("isp", "") or "",
        "domain": abuse_data.get("domain", "") or "",
        "usageType": abuse_data.get("usageType", "") or "",
        "totalReports": abuse_data.get("totalReports", 0),
        "lastReportedAt": abuse_data.get("lastReportedAt", "")
    }
    return JSONResponse(content=result, headers=headers)

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await manager.connect(websocket)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(websocket)

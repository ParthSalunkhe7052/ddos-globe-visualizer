import asyncio
import ipaddress
import json
import logging
import os
import os as _os
import random
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional

import httpx
# Import our services
from abuseipdb_service import check_ip
from dotenv import load_dotenv
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
from live_feed_service import get_service

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Load environment variables
load_dotenv(override=True)
ABUSEIPDB_KEY = os.getenv("ABUSEIPDB_KEY")
OTX_API_KEY = os.getenv("OTX_API_KEY")

# Avoid noisy configuration prints in production

# Global caches and state
EnrichCache: Dict[str, Any] = {}
AbuseIPDB429: Dict[str, Optional[datetime]] = {"blocked_until": None}

# Background polling intervals (seconds)
ABUSEIPDB_INTERVAL = int(os.getenv("ABUSEIPDB_INTERVAL", "300"))


# WebSocket Connection Manager
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


# Attack Live Mode state
class LiveConnectionManager:
    def __init__(self):
        self.live_connections: list[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.live_connections.append(websocket)

    def disconnect(self, websocket: WebSocket):
        if websocket in self.live_connections:
            self.live_connections.remove(websocket)

    async def broadcast(self, payload: dict):
        to_remove: list[WebSocket] = []
        for ws in self.live_connections:
            try:
                await ws.send_json(payload)
            except Exception:
                to_remove.append(ws)
        for ws in to_remove:
            self.disconnect(ws)


live_manager = LiveConnectionManager()

# Queues and indexes
EventQueue: asyncio.Queue = asyncio.Queue(maxsize=1000)
RecentIndex: Dict[str, datetime] = {}
RecentIocFeeds: Dict[str, List[Dict[str, Any]]] = {}
FeedBackoff: Dict[str, Dict[str, Any]] = {}
FeedStatus: Dict[str, str] = {}
Counters: Dict[str, int] = {
    "events_received": 0,
    "events_emitted": 0,
    "events_dropped": 0,
}

# Collapse aggregation by masked source (30s window)
CollapseIndex: Dict[str, Dict[str, Any]] = {}

# Feed intervals (seconds)
FEED_INTERVALS = {
    "threatfox": 30,
    "urlhaus": 600,
    "malwarebazaar": 60,
    "otx": 30,
}


def _now() -> datetime:
    return datetime.utcnow()


def _exp_backoff(feed: str, base: int) -> int:
    state = FeedBackoff.setdefault(feed, {"retries": 0, "until": None, "delay": base})
    retries = state["retries"] = min(state["retries"] + 1, 7)
    delay = min(base * (2 ** (retries - 1)), 600)
    state["delay"] = delay
    state["until"] = _now() + timedelta(seconds=delay)
    FeedStatus[feed] = "backoff"
    return delay


def _reset_backoff(feed: str):
    FeedBackoff[feed] = {
        "retries": 0,
        "until": None,
        "delay": FEED_INTERVALS.get(feed, 60),
    }
    FeedStatus[feed] = "ok"


def _masked_ip(ip: str) -> str:
    try:
        parts = ip.split(".")
        if len(parts) == 4:
            return ".".join(parts[:3] + ["*"])
    except Exception:
        pass
    return ip


def _headline(event: Dict[str, Any]) -> str:
    ioc = event.get("ioc", "")
    ioc_type = event.get("ioc_type", "")
    feed = event.get("feed", "")
    tags = ",".join(event.get("tags", []) or [])
    conf_pct = int(round((event.get("confidence", 0.0) or 0.0) * 100))
    enrich = event.get("enrich") or {}
    country = enrich.get("country", "?")
    city = enrich.get("city", "?")
    isp = enrich.get("isp", "?")
    ioc_short = _masked_ip(ioc) if ioc_type == "ip" else ioc
    # Default template
    return f"⚡ Attack detected — {city}, {country} → demo-target · Confidence {conf_pct}%, Source: {feed}, IOC: {ioc_short}"


def _confidence(base: float, event: Dict[str, Any]) -> float:
    ioc = event["ioc"]
    feed = event["feed"]
    ioc_type = event["ioc_type"]
    extra = []

    # Cross-feed within 60s → 0.9
    recent = RecentIocFeeds.get(ioc, [])
    cutoff = _now() - timedelta(seconds=60)
    recent = [r for r in recent if r["time"] >= cutoff]
    RecentIocFeeds[ioc] = recent
    feeds_recent = {r["feed"] for r in recent}
    if len(feeds_recent) >= 2 or (len(feeds_recent) == 1 and feed not in feeds_recent):
        extra.append(0.9)

    # ThreatFox C2/Botnet
    if feed == "threatfox" and any(
        t in (event.get("tags") or []) for t in ["c2", "botnet", "c2_server"]
    ):
        extra.append(0.85)

    # URLhaus URLs
    if feed == "urlhaus" and ioc_type == "url":
        extra.append(0.7)

    if not extra:
        extra.append(0.5)

    conf = sum([base] + extra) / (1 + len(extra))
    return max(0.0, min(conf, 1.0))


def _normalize(feed: str, raw: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    try:
        if feed == "threatfox":
            ioc_type = (raw.get("ioc_type") or raw.get("type") or "").lower()
            ioc = raw.get("ioc") or raw.get("value")
            item_id = str(raw.get("id") or raw.get("_id") or ioc)
            tags = raw.get("tags") or raw.get("malware") or []
            sev = raw.get("confidence_level") or raw.get("confidence")
        elif feed == "urlhaus":
            ioc_type = "url"
            ioc = raw.get("url")
            item_id = str(raw.get("id") or raw.get("entry_id") or ioc)
            tags = raw.get("tags") or []
            sev = raw.get("threat") or raw.get("confidence")
        elif feed == "malwarebazaar":
            ioc_type = "hash"
            ioc = raw.get("sha256") or raw.get("sha1") or raw.get("md5")
            item_id = str(raw.get("sha256") or raw.get("id") or ioc)
            tags = raw.get("tags") or raw.get("file_type") or []
            sev = raw.get("confidence")
        elif feed == "otx":
            ind = raw.get("indicator") or {}
            ioc = ind.get("indicator") or raw.get("indicator")
            ioc_type = (ind.get("type") or raw.get("type") or "").lower()
            item_id = str(raw.get("pulse_id") or raw.get("id") or ioc)
            tags = raw.get("tags") or ind.get("tags") or []
            sev = raw.get("confidence") or ind.get("confidence")
        else:
            return None

        if not ioc or not ioc_type:
            return None

        # Map OTX types
        if ioc_type in ["domain", "hostname"]:
            ioc_type = "domain"
        if ioc_type in ["IPv4", "ip", "ipv4"]:
            ioc_type = "ip"

        base = 0.5
        if isinstance(sev, (int, float)):
            sev_norm = max(0.0, min(float(sev) / (100.0 if sev > 1 else 1.0), 1.0))
            base = (base + sev_norm) / 2.0

        event = {
            "id": f"{feed}-{item_id}",
            "seen_at": iso_now(),
            "feed": feed,
            "ioc_type": ioc_type,
            "ioc": ioc,
            "src_ip": ioc if ioc_type == "ip" else None,
            "tags": tags if isinstance(tags, list) else [tags] if tags else [],
            "confidence": 0.0,  # set below
            "meta": {"original": raw},
            "enrich": {},
            "headline": "",
        }

        # Track recent feeds per IOC
        RecentIocFeeds.setdefault(ioc, []).append({"feed": feed, "time": _now()})

        event["confidence"] = _confidence(base, event)
        event["headline"] = _headline(event)
        return event
    except Exception as e:
        logger.warning(f"Normalize error for feed {feed}: {e}")
        return None


def _should_emit(event_id: str) -> bool:
    # Deduplicate window 60s
    cutoff = _now() - timedelta(seconds=60)
    for eid in list(RecentIndex.keys()):
        if RecentIndex[eid] < cutoff:
            RecentIndex.pop(eid, None)
    if event_id in RecentIndex:
        return False
    RecentIndex[event_id] = _now()
    return True


async def _enqueue(event: Dict[str, Any]):
    Counters["events_received"] += 1
    if not _should_emit(event["id"]):
        Counters["events_dropped"] += 1
        return
    try:
        EventQueue.put_nowait(event)
        # Update collapse index for IP sources
        if event.get("ioc_type") == "ip":
            key = _masked_ip(event.get("ioc", ""))
            if key:
                item = CollapseIndex.setdefault(
                    key, {"count": 0, "since": _now(), "last": _now(), "sample": event}
                )
                item["count"] += 1
                item["last"] = _now()
    except asyncio.QueueFull:
        Counters["events_dropped"] += 1


async def _emit_status(feed: str, status: str, message: str = ""):
    payload = {"kind": "status", "feed": feed, "status": status, "message": message}
    await live_manager.broadcast(payload)


async def _dispatcher_loop():
    while True:
        try:
            event = await EventQueue.get()
            payload = {"kind": "attack", "event": event}
            await live_manager.broadcast(payload)
            Counters["events_emitted"] += 1
            # Pace: 1–3 events/sec with 1–8s jitter
            base_delay = random.uniform(0.33, 1.0)
            jitter = random.uniform(1.0, 8.0) if random.random() < 0.2 else 0.0
            await asyncio.sleep(base_delay + jitter)
        except Exception as e:
            logger.warning(f"Dispatcher error: {e}")
            await asyncio.sleep(1)


async def _collapse_loop():
    # Periodically emit collapsed summaries and prune old entries
    while True:
        try:
            now_ts = _now()
            cutoff = now_ts - timedelta(seconds=30)
            keys_to_delete = []
            for key, item in list(CollapseIndex.items()):
                # If recent activity in window, emit and reset
                if (
                    item.get("last")
                    and item["last"] >= cutoff
                    and item.get("count", 0) >= 5
                ):
                    sample = item.get("sample") or {}
                    conf_pct = int(round((sample.get("confidence", 0.0) or 0.0) * 100))
                    headline = (
                        f"10+ similar events from {key} in 30s"
                        if item["count"] >= 10
                        else f"{item['count']} similar events from {key} in 30s"
                    )
                    since_dt = item.get("since") or now_ts
                    payload = {
                        "kind": "collapse",
                        "ioc": key,
                        "count": item["count"],
                        "since": since_dt.replace(microsecond=0).isoformat() + "Z",
                        "headline": headline,
                    }
                    await live_manager.broadcast(payload)
                    # reset counter but keep window
                    CollapseIndex[key] = {
                        "count": 0,
                        "since": now_ts,
                        "last": now_ts,
                        "sample": sample,
                    }
                # prune old
                if item.get("last") and item["last"] < cutoff:
                    keys_to_delete.append(key)
            for k in keys_to_delete:
                CollapseIndex.pop(k, None)
        except Exception as e:
            logger.debug(f"Collapse loop error: {e}")
        finally:
            await asyncio.sleep(5)


async def _poll_threatfox():
    feed = "threatfox"
    base = FEED_INTERVALS[feed]
    _reset_backoff(feed)
    while True:
        try:
            # Respect backoff window
            until = FeedBackoff.get(feed, {}).get("until")
            if until and _now() < until:
                await asyncio.sleep(1)
                continue
            async with httpx.AsyncClient(timeout=15) as client:
                # ThreatFox API: recent IOCs
                resp = await client.post(
                    "https://threatfox.abuse.ch/api/v1/",
                    json={"query": "recent_iocs"},
                )
            if resp.status_code >= 500 or resp.status_code in (429,):
                delay = _exp_backoff(feed, base)
                await _emit_status(
                    feed, "backoff", f"HTTP {resp.status_code}; sleeping {delay}s"
                )
            else:
                data = resp.json()
                _reset_backoff(feed)
                await _emit_status(feed, "ok", "fetched")
                items = data.get("data") or data.get("ioc") or []
                for raw in items:
                    ev = _normalize(feed, raw)
                    if ev:
                        await _enqueue(ev)
            await asyncio.sleep(base)
        except Exception as e:
            delay = _exp_backoff(feed, base)
            await _emit_status(feed, "backoff", f"error: {e}; sleeping {delay}s")
            await asyncio.sleep(delay)


async def _poll_urlhaus():
    feed = "urlhaus"
    base = FEED_INTERVALS[feed]
    _reset_backoff(feed)
    while True:
        try:
            until = FeedBackoff.get(feed, {}).get("until")
            if until and _now() < until:
                await asyncio.sleep(1)
                continue
            async with httpx.AsyncClient(timeout=30) as client:
                resp = await client.get("https://urlhaus.abuse.ch/downloads/csv/")
            if resp.status_code >= 500 or resp.status_code in (429,):
                delay = _exp_backoff(feed, base)
                await _emit_status(
                    feed, "backoff", f"HTTP {resp.status_code}; sleeping {delay}s"
                )
            else:
                _reset_backoff(feed)
                await _emit_status(feed, "ok", "fetched")
                text = resp.text
                lines = [
                    ln for ln in text.splitlines() if ln and not ln.startswith("#")
                ]
                for ln in lines[:500]:  # limit per cycle
                    parts = ln.split(",")
                    if len(parts) < 3:
                        continue
                    entry_id = parts[0].strip()
                    url = parts[2].strip()
                    raw = {"id": entry_id, "url": url, "tags": []}
                    ev = _normalize(feed, raw)
                    if ev:
                        await _enqueue(ev)
            await asyncio.sleep(base)
        except Exception as e:
            delay = _exp_backoff(feed, base)
            await _emit_status(feed, "backoff", f"error: {e}; sleeping {delay}s")
            await asyncio.sleep(delay)


async def _poll_malwarebazaar():
    feed = "malwarebazaar"
    base = FEED_INTERVALS[feed]
    _reset_backoff(feed)
    while True:
        try:
            until = FeedBackoff.get(feed, {}).get("until")
            if until and _now() < until:
                await asyncio.sleep(1)
                continue
            async with httpx.AsyncClient(timeout=20) as client:
                resp = await client.post(
                    "https://mb-api.abuse.ch/api/v1/",
                    data={"query": "get_recent", "limit": 100},
                )
            if resp.status_code >= 500 or resp.status_code in (429,):
                delay = _exp_backoff(feed, base)
                await _emit_status(
                    feed, "backoff", f"HTTP {resp.status_code}; sleeping {delay}s"
                )
            else:
                data = resp.json()
                _reset_backoff(feed)
                await _emit_status(feed, "ok", "fetched")
                items = data.get("data") or []
                for raw in items:
                    ev = _normalize(feed, raw)
                    if ev:
                        await _enqueue(ev)
            await asyncio.sleep(base)
        except Exception as e:
            delay = _exp_backoff(feed, base)
            await _emit_status(feed, "backoff", f"error: {e}; sleeping {delay}s")
            await asyncio.sleep(delay)


async def _poll_otx():
    feed = "otx"
    base = FEED_INTERVALS[feed]
    _reset_backoff(feed)
    if not OTX_API_KEY:
        logger.info("OTX_API_KEY not set; OTX feed disabled")
        return
    headers = {"X-OTX-API-KEY": OTX_API_KEY}
    while True:
        try:
            until = FeedBackoff.get(feed, {}).get("until")
            if until and _now() < until:
                await asyncio.sleep(1)
                continue
            async with httpx.AsyncClient(timeout=20, headers=headers) as client:
                resp = await client.get(
                    "https://otx.alienvault.com/api/v1/pulses/subscribed"
                )
            if resp.status_code >= 500 or resp.status_code in (429,):
                delay = _exp_backoff(feed, base)
                await _emit_status(
                    feed, "backoff", f"HTTP {resp.status_code}; sleeping {delay}s"
                )
            elif resp.status_code == 401:
                await _emit_status(feed, "backoff", "Unauthorized; check OTX_API_KEY")
                await asyncio.sleep(base)
            else:
                data = resp.json()
                _reset_backoff(feed)
                await _emit_status(feed, "ok", "fetched")
                pulses = data.get("results") or data.get("pulses") or []
                for p in pulses:
                    pulse_id = p.get("id")
                    indicators = p.get("indicators") or []
                    for ind in indicators:
                        raw = {
                            "pulse_id": pulse_id,
                            "indicator": ind,
                            "tags": p.get("tags"),
                        }
                        ev = _normalize(feed, raw)
                        if ev:
                            await _enqueue(ev)
            await asyncio.sleep(base)
        except Exception as e:
            delay = _exp_backoff(feed, base)
            await _emit_status(feed, "backoff", f"error: {e}; sleeping {delay}s")
            await asyncio.sleep(delay)


# Startup to launch background tasks
async def _start_live_mode_tasks():
    try:
        asyncio.create_task(_dispatcher_loop())
        asyncio.create_task(_collapse_loop())
        asyncio.create_task(_poll_threatfox())
        asyncio.create_task(_poll_urlhaus())
        asyncio.create_task(_poll_malwarebazaar())
        asyncio.create_task(_poll_otx())
        logger.info("Attack Live Mode tasks started")
    except Exception as e:
        logger.error(f"Failed to start Live Mode tasks: {e}")


# Initialize FastAPI app
app = FastAPI(
    title="DDoS Globe Visualizer Backend",
    description="Backend API for DDoS globe visualization and analysis.",
    version="1.0.0",
)

# Set up templates and static files with robust absolute paths
_BASE_DIR = _os.path.dirname(__file__)
_TEMPLATES_DIR = _os.path.join(_BASE_DIR, "templates")
_STATIC_DIR = _os.path.join(_BASE_DIR, "static")
templates = Jinja2Templates(directory=_TEMPLATES_DIR)
if _os.path.isdir(_STATIC_DIR):
    app.mount("/static", StaticFiles(directory=_STATIC_DIR), name="static")

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


@app.on_event("startup")
async def _startup_hooks():
    # Start Attack Live Mode background loops
    asyncio.create_task(_start_live_mode_tasks())
    # Start live feed service background worker
    try:
        get_service().start()
        logger.info("LiveFeedService started")
    except Exception as e:
        logger.error(f"Failed to start LiveFeedService: {e}")


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
    """Enrich IP with geo and abuse data. Never blocks on failure."""
    now = datetime.utcnow()
    cached = EnrichCache.get(ip)
    if cached and cached["expires"] > now:
        return cached["data"]

    # Default values to ensure we always return valid data
    geo = {
        "countryCode": "--",
        "countryName": "Unknown",
        "lat": 0.0,
        "lon": 0.0,
        "isp": "Unknown ISP",
    }

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
                        "countryCode": g.get("countryCode", "--"),
                        "countryName": g.get("country", "Unknown"),
                        "lat": g.get("lat", 0.0),
                        "lon": g.get("lon", 0.0),
                        "isp": g.get("isp", "Unknown ISP"),
                    }
                else:
                    logger.debug(
                        f"Geo API returned non-success for {ip}: {g.get('status')}"
                    )
    except Exception as e:
        logger.warning(f"⚠️ Geo enrichment failed for {ip}, using defaults: {e}")

    # Reverse DNS lookup (optional, non-blocking)
    domain = None
    try:
        import socket

        loop = asyncio.get_event_loop()
        domain = await asyncio.wait_for(
            loop.run_in_executor(None, lambda: socket.gethostbyaddr(ip)[0]),
            timeout=1,
        )
    except Exception:
        logger.debug(f"Reverse DNS lookup failed for {ip}")
        domain = None

    # AbuseIPDB lookup (optional, non-blocking)
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
                    logger.warning("⚠️ AbuseIPDB 429: quota exceeded, blocking for 24h")
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
            logger.warning(
                f"⚠️ AbuseIPDB enrich failed for {ip}, continuing without abuse data: {e}"
            )

    result = {"ip": ip, **geo, "domain": domain, "abuse": abuse}
    EnrichCache[ip] = {"data": result, "expires": now + timedelta(hours=24)}
    logger.debug(
        f"✅ Enriched IP {ip}: {geo.get('countryCode')}, {geo.get('lat')}, {geo.get('lon')}"
    )
    return result


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


# API Endpoints
@app.get("/health")
def health():
    return log_and_respond(
        True,
        data={
            "status": "ok",
            "time": iso_now(),
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
    try:
        logger.info("Admin dashboard accessed")
        return templates.TemplateResponse("admin.html", {"request": request})
    except Exception as e:
        logger.error(f"Error serving admin dashboard: {e}", exc_info=True)
        return JSONResponse(
            content={
                "error": "ADMIN_DASHBOARD_ERROR",
                "message": f"Failed to load admin dashboard: {str(e)}",
            },
            status_code=500,
        )


@app.get("/api/admin/status")
async def admin_status():
    """Get comprehensive system status for admin dashboard."""
    try:
        logger.info("Admin status endpoint called")

        # Get basic health info
        health_data = {
            "status": "ok",
            "time": iso_now(),
            "abuseipdb_key_present": bool(ABUSEIPDB_KEY),
            "active_connections": len(manager.active_connections),
        }

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
                    logger.info(f"AbuseIPDB status: {health_data['abuseipdb_status']}")
            else:
                health_data["abuseipdb_status"] = "not_configured"
                logger.info("AbuseIPDB not configured")
        except Exception as e:
            logger.error(f"AbuseIPDB connectivity test failed: {e}")
            health_data["abuseipdb_status"] = "offline"

        # Test GeoIP service
        try:
            geo_result = ip_to_location("8.8.8.8")
            health_data["geoip_status"] = (
                "online" if not geo_result.get("error") else "offline"
            )
            logger.info(f"GeoIP status: {health_data['geoip_status']}")
        except Exception as e:
            logger.error(f"GeoIP service test failed: {e}")
            health_data["geoip_status"] = "offline"

        logger.info(f"Admin status returning: {health_data}")
        return log_and_respond(True, data=health_data)

    except Exception as e:
        logger.error(f"Admin status error: {e}", exc_info=True)
        return log_and_respond(
            False, error="ADMIN_STATUS_ERROR", message=str(e), status_code=500
        )


@app.post("/api/admin/clear-cache")
async def admin_clear_cache():
    """Clear all caches."""
    try:
        logger.info("Admin cache clear requested")

        # Clear enrichment cache
        EnrichCache.clear()
        logger.info("EnrichCache cleared")

        # Clear IP cache database
        try:
            import sqlite3

            conn = sqlite3.connect("ip_cache.db")
            cursor = conn.cursor()
            cursor.execute("DELETE FROM ip_cache")
            conn.commit()
            conn.close()
            logger.info("IP cache database cleared")
        except Exception as e:
            logger.warning(f"Failed to clear IP cache database: {e}")

        logger.info("All caches cleared successfully by admin")
        return log_and_respond(
            True, data={"message": "All caches cleared successfully"}
        )

    except Exception as e:
        logger.error(f"Cache clear error: {e}", exc_info=True)
        return log_and_respond(
            False, error="CACHE_CLEAR_ERROR", message=str(e), status_code=500
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


# Live feed debug endpoints (service-backed; not connected to frontend)
@app.get("/api/live-feed/test")
async def live_feed_test(limit: int = 20):
    try:
        svc = get_service()
        snap = svc.snapshot(limit=limit)
        return JSONResponse(content=snap)
    except Exception as e:
        logger.error(f"/api/live-feed/test error: {e}")
        return JSONResponse(content={"ok": False, "error": str(e)}, status_code=500)


@app.get("/api/live-feed/status")
async def live_feed_status():
    try:
        svc = get_service()
        st = svc.get_status()
        return JSONResponse(content=st)
    except Exception as e:
        logger.error(f"/api/live-feed/status error: {e}")
        return JSONResponse(content={"ok": False, "error": str(e)}, status_code=500)


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
async def websocket_attacks_endpoint(websocket: WebSocket):
    """Stub WebSocket endpoint for attack feed - Live Mode removed."""
    try:
        await websocket.accept()
        logger.info(
            "WebSocket /ws/attacks connected (stub endpoint - Live Mode disabled)"
        )
        # Send a notification that this endpoint is disabled
        await websocket.send_json(
            {
                "type": "status",
                "message": "Live Mode has been removed. This endpoint is disabled.",
                "timestamp": iso_now(),
            }
        )
        # Keep connection open but don't send any data
        while True:
            try:
                await websocket.receive_text()
            except WebSocketDisconnect:
                break
    except WebSocketDisconnect:
        logger.info("WebSocket /ws/attacks disconnected")
    except Exception as e:
        logger.error(f"WebSocket /ws/attacks error: {e}")


@app.websocket("/ws/live")
async def websocket_live_endpoint(websocket: WebSocket):
    """Attack Live Mode stream: emits normalized events from feeds."""
    try:
        await live_manager.connect(websocket)
        await websocket.send_json(
            {
                "kind": "status",
                "feed": "live",
                "status": FeedStatus or {},
                "message": "connected",
            }
        )
        # Keep alive; all data is pushed from background tasks
        while True:
            try:
                await websocket.receive_text()
            except WebSocketDisconnect:
                break
    except WebSocketDisconnect:
        live_manager.disconnect(websocket)
    except Exception as e:
        logger.error(f"/ws/live error: {e}")
        try:
            await websocket.close()
        finally:
            live_manager.disconnect(websocket)


@app.websocket("/ws/logs")
async def websocket_logs_endpoint(websocket: WebSocket):
    """Stub WebSocket endpoint for log streaming - Live Mode removed."""
    try:
        await websocket.accept()
        logger.info("WebSocket /ws/logs connected (stub endpoint - Live Mode disabled)")
        # Send a notification that this endpoint is disabled
        await websocket.send_json(
            {
                "type": "log",
                "level": "info",
                "message": "Live Mode has been removed. Log streaming is disabled.",
                "timestamp": iso_now(),
            }
        )
        # Keep connection open but don't send any data
        while True:
            try:
                await websocket.receive_text()
            except WebSocketDisconnect:
                break
    except WebSocketDisconnect:
        logger.info("WebSocket /ws/logs disconnected")
    except Exception as e:
        logger.error(f"WebSocket /ws/logs error: {e}")


if __name__ == "__main__":
    import uvicorn

    # Print startup information
    print("🚀 Starting DDoS Globe Visualizer Backend...")
    print(f"📍 Server will be available at: http://localhost:8000")
    print(f"🔧 Admin dashboard at: http://localhost:8000/admin")
    print(f"❤️  Health check at: http://localhost:8000/health")
    print("=" * 50)

    try:
        uvicorn.run(
            app,
            host="0.0.0.0",
            port=8000,
            log_level="info",
            access_log=True,
            reload=False,  # Set to False to avoid connection spam
        )
    except KeyboardInterrupt:
        print("\n🛑 Server stopped by user")
    except Exception as e:
        print(f"❌ Server error: {e}")
        raise

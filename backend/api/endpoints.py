import ipaddress
import json
import logging
import os
import random
from datetime import datetime

import httpx
from fastapi import APIRouter, Query, Request, WebSocket, WebSocketDisconnect
from fastapi.responses import HTMLResponse, JSONResponse
from fastapi.templating import Jinja2Templates

from backend.abuseipdb_service import check_ip
from backend.config.settings import (ABUSEIPDB_KEY, SAMPLE_IPS, USAGE_TYPES,
                                     EnrichCache, load_sample_ips)
from backend.error_handler import (APIError, InvalidIPError, RateLimitError,
                                   ServiceUnavailableError, handle_ws_error)
from backend.geo_service import ip_to_location
from backend.ip_cache import get_cached, set_cache
from backend.live_feed_service import get_service
from backend.services.ip_enrichment import enrich_ip
from backend.services.live_feed_processor import FeedStatus
from backend.services.websocket_manager import live_manager, manager
from backend.utils.common import iso_now, log_and_respond

logger = logging.getLogger(__name__)

router = APIRouter()

# Templates
_BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
_TEMPLATES_DIR = os.path.join(_BASE_DIR, "templates")
templates = Jinja2Templates(directory=_TEMPLATES_DIR)


@router.get("/health")
def health():
    return log_and_respond(
        True,
        data={
            "status": "ok",
            "time": iso_now(),
            "abuseipdb_key_present": bool(ABUSEIPDB_KEY),
        },
    )


@router.get("/ping")
def ping():
    return {"status": "ok"}


# Admin Dashboard Routes
@router.get("/admin", response_class=HTMLResponse)
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


@router.get("/api/admin/status")
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


@router.post("/api/admin/clear-cache")
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


@router.get("/api/health/abuseipdb")
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


@router.get("/analyze_ip")
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


@router.get("/enrich_ip")
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


@router.get("/check_ip")
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


@router.get("/geo_ip")
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
@router.get("/api/live-feed/test")
async def live_feed_test(limit: int = 20):
    try:
        svc = get_service()
        snap = svc.snapshot(limit=limit)
        return JSONResponse(content=snap)
    except Exception as e:
        logger.error(f"/api/live-feed/test error: {e}")
        return JSONResponse(content={"ok": False, "error": str(e)}, status_code=500)


@router.get("/api/live-feed/status")
async def live_feed_status():
    try:
        svc = get_service()
        st = svc.get_status()
        return JSONResponse(content=st)
    except Exception as e:
        logger.error(f"/api/live-feed/status error: {e}")
        return JSONResponse(content={"ok": False, "error": str(e)}, status_code=500)


# WebSocket endpoints
@router.websocket("/ws")
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


@router.websocket("/ws/attacks")
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


@router.websocket("/ws/live")
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


@router.websocket("/ws/logs")
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

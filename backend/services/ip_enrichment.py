import asyncio
import logging
import random
from datetime import datetime, timedelta

import httpx

from backend.config.settings import ABUSEIPDB_KEY, AbuseIPDB429, EnrichCache

logger = logging.getLogger(__name__)


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


import httpx
from geo_service import ip_to_location
import logging
import xml.etree.ElementTree as ET

logger = logging.getLogger(__name__)

DSHIELD_TOP_IPS_URL = "https://isc.sans.edu/api/topips/records/50/json"
DSHIELD_TOP_COUNTRIES_URL = "https://isc.sans.edu/api/topcountries/records/20/json"

async def fetch_dshield_top_ips():
    """Fetch top attacking IPs from DShield and enrich with geolocation."""
    try:
        async with httpx.AsyncClient() as client:
            resp = await client.get(DSHIELD_TOP_IPS_URL, timeout=20)
            resp.raise_for_status()
            try:
                data = resp.json()
                logger.debug("DShield response parsed as JSON.")
                entries = data.get("topips", [])
            except Exception as json_err:
                # Check if XML
                if resp.text.strip().startswith("<?xml"):
                    logger.warning("DShield returned XML, parsing as XML.")
                    try:
                        root = ET.fromstring(resp.text)
                        entries = []
                        for ip_elem in root.findall(".//ip"):
                            ip = ip_elem.findtext("ip")
                            attack_count = int(ip_elem.findtext("attacks") or 0)
                            geo = ip_to_location(ip)
                            entries.append({
                                "ip": ip,
                                "countryCode": geo.get("country", "--"),
                                "latitude": geo.get("latitude", 0.0),
                                "longitude": geo.get("longitude", 0.0),
                                "attackCount": attack_count,
                                "source": "dshield"
                            })
                        return entries
                    except Exception as xml_err:
                        logger.error(f"DShield XML parse failed: {xml_err}; raw response: {resp.text[:200]}")
                        return []
                else:
                    logger.error(f"DShield JSON decode failed: {json_err}; raw response: {resp.text[:200]}")
                    return []
            # If JSON worked
            result = []
            for entry in entries:
                ip = entry.get("ip")
                attack_count = int(entry.get("attacks", 0))
                geo = ip_to_location(ip)
                result.append({
                    "ip": ip,
                    "countryCode": geo.get("country", "--"),
                    "latitude": geo.get("latitude", 0.0),
                    "longitude": geo.get("longitude", 0.0),
                    "attackCount": attack_count,
                    "source": "dshield"
                })
            return result
    except Exception as e:
        logger.error(f"DShield fetch failed: {e}")
        return []

async def fetch_dshield_top_countries():
    """Fetch top attacking countries from DShield (optional)."""
    try:
        async with httpx.AsyncClient() as client:
            resp = await client.get(DSHIELD_TOP_COUNTRIES_URL, timeout=20)
            resp.raise_for_status()
            try:
                data = resp.json()
            except Exception as json_err:
                logger.error(f"DShield country JSON decode failed: {json_err}; raw response: {resp.text}")
                return []
            return data.get("topcountries", [])
    except Exception as e:
        logger.error(f"DShield country fetch failed: {e}")
        return []

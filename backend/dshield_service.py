import asyncio
import logging
import xml.etree.ElementTree as ET
from datetime import datetime

import httpx
import xmltodict
from geo_service import ip_to_location

logger = logging.getLogger(__name__)

DSHIELD_TOP_IPS_URL = "https://isc.sans.edu/api/topips/"
DSHIELD_TOP_COUNTRIES_URL = "https://isc.sans.edu/api/topcountries/records/20/json"


async def fetch_dshield_top_ips():
    """Fetch top attacking IPs from DShield and enrich with geolocation."""
    logger.info(f"DShield fetch start: {DSHIELD_TOP_IPS_URL}")
    try:
        async with httpx.AsyncClient() as client:
            resp = await client.get(DSHIELD_TOP_IPS_URL, timeout=20)
            logger.info(f"DShield status={resp.status_code} length={len(resp.text)}")
            resp.raise_for_status()

            # Log response content type and first 100 chars
            content_type = resp.headers.get("content-type", "unknown")
            logger.info(f"DShield content-type: {content_type}")
            logger.debug(f"DShield response preview: {resp.text[:100]}")

            # DShield API returns XML, so parse it directly
            if resp.text.strip().startswith("<?xml") or resp.text.strip().startswith(
                "<"
            ):
                logger.info("DShield returned XML, parsing with xmltodict")
                try:
                    # Parse XML to dict using xmltodict
                    xml_data = xmltodict.parse(resp.text)
                    logger.debug(f"XML parsed to dict: {xml_data}")

                    # Extract IP entries from the XML structure
                    entries = []
                    if "topips" in xml_data and "ipaddress" in xml_data["topips"]:
                        ip_list = xml_data["topips"]["ipaddress"]
                        # Handle both single item and list cases
                        if not isinstance(ip_list, list):
                            ip_list = [ip_list]

                        for ip_elem in ip_list:
                            try:
                                rank = int(ip_elem.get("rank", 0))
                                ip = ip_elem.get("source", "")
                                reports = int(ip_elem.get("reports", 0))
                                targets = int(ip_elem.get("targets", 0))

                                if ip:  # Only process valid IPs
                                    geo = ip_to_location(ip)
                                    entries.append(
                                        {
                                            "rank": rank,
                                            "ip": ip,
                                            "reports": reports,
                                            "targets": targets,
                                            "countryCode": geo.get("country", "--"),
                                            "latitude": geo.get("latitude", 0.0),
                                            "longitude": geo.get("longitude", 0.0),
                                            "attackCount": reports,  # Use reports as attack count
                                            "source": "dshield",
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
                    return entries

                except Exception as xml_err:
                    logger.error(f"DShield XML parse failed: {xml_err}")
                    logger.error(f"DShield raw response: {resp.text[:500]}")
                    return []
            else:
                # Try JSON as fallback (though DShield typically returns XML)
                try:
                    data = resp.json()
                    logger.info("DShield response parsed as JSON successfully")
                    entries = data.get("topips", [])
                    result = []
                    for entry in entries:
                        ip = entry.get("ip")
                        attack_count = int(entry.get("attacks", 0))
                        geo = ip_to_location(ip)
                        result.append(
                            {
                                "ip": ip,
                                "countryCode": geo.get("country", "--"),
                                "latitude": geo.get("latitude", 0.0),
                                "longitude": geo.get("longitude", 0.0),
                                "attackCount": attack_count,
                                "source": "dshield",
                            }
                        )
                    return result
                except Exception as json_err:
                    logger.error(f"DShield JSON parse failed: {json_err}")
                    logger.error(f"DShield response is neither valid XML nor JSON")
                    logger.error(f"DShield raw response: {resp.text[:200]}")
                    return []

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
                logger.error(
                    f"DShield country JSON decode failed: {json_err}; raw response: {resp.text}"
                )
                return []
            return data.get("topcountries", [])
    except Exception as e:
        logger.error(f"DShield country fetch failed: {e}")
        return []


def normalize_dshield_event(entry, target_ip="0.0.0.0"):
    """Normalize a DShield entry into a standardized attack event format."""
    try:
        ip = entry.get("ip", "")
        attack_count = int(entry.get("attacks", entry.get("attackCount", 0)))
        geo = ip_to_location(ip)

        # Generate a unique event ID
        event_id = f"dshield-{ip}-{int(datetime.utcnow().timestamp())}"

        return {
            "id": event_id,
            "src_ip": ip,
            "dst_ip": target_ip,
            "src_lat": float(geo.get("latitude", 0.0)),
            "src_lng": float(geo.get("longitude", 0.0)),
            "dst_lat": 0.0,  # Target is at origin
            "dst_lng": 0.0,
            "reported_at": datetime.utcnow().isoformat() + "Z",
            "confidence": min(
                100, max(0, attack_count * 2)
            ),  # Scale attack count to confidence
            "protocol": "tcp",
            "description": f"DShield report: {attack_count} attacks",
            "source": "dshield",
            "attack_count": attack_count,
            "country_code": geo.get("country", "--"),
            "country_name": geo.get("countryName", ""),
            "isp": geo.get("isp", ""),
            "domain": geo.get("domain", ""),
        }
    except Exception as e:
        logger.error(f"Failed to normalize DShield event: {e}")
        return None


async def fetch_dshield_events(max_retries: int = 3, base_delay: float = 2.0):
    """Fetch and normalize DShield events for streaming with retry/backoff.
    Handles DNS failures (getaddrinfo), timeouts, and parse errors gracefully.
    """
    attempt = 0
    while attempt <= max_retries:
        try:
            logger.info(
                f"DShield events fetch attempt {attempt + 1}/{max_retries + 1}: {DSHIELD_TOP_IPS_URL}"
            )
            async with httpx.AsyncClient(timeout=30) as client:
                resp = await client.get(DSHIELD_TOP_IPS_URL)
                logger.info(
                    f"DShield events status={resp.status_code} length={len(resp.text)}"
                )
                resp.raise_for_status()

                content_type = resp.headers.get("content-type", "").lower()
                logger.info(f"DShield events content-type: {content_type}")

                # DShield API returns XML, so parse it directly
                if resp.text.strip().startswith(
                    "<?xml"
                ) or resp.text.strip().startswith("<"):
                    logger.info("DShield events returned XML, parsing with xmltodict")
                    try:
                        # Parse XML to dict using xmltodict
                        xml_data = xmltodict.parse(resp.text)
                        logger.debug(f"XML parsed to dict: {xml_data}")

                        # Extract IP entries from the XML structure
                        entries = []
                        if "topips" in xml_data and "ipaddress" in xml_data["topips"]:
                            ip_list = xml_data["topips"]["ipaddress"]
                            # Handle both single item and list cases
                            if not isinstance(ip_list, list):
                                ip_list = [ip_list]

                            for ip_elem in ip_list:
                                try:
                                    rank = int(ip_elem.get("rank", 0))
                                    ip = ip_elem.get("source", "")
                                    reports = int(ip_elem.get("reports", 0))
                                    targets = int(ip_elem.get("targets", 0))

                                    if ip:  # Only process valid IPs
                                        entries.append(
                                            {
                                                "rank": rank,
                                                "ip": ip,
                                                "reports": reports,
                                                "targets": targets,
                                                "attacks": reports,  # Use reports as attacks for compatibility
                                            }
                                        )
                                except (ValueError, TypeError) as e:
                                    logger.warning(
                                        f"Failed to parse IP entry: {ip_elem}, error: {e}"
                                    )
                                    continue

                        logger.info(
                            f"DShield events XML parsed successfully: {len(entries)} entries"
                        )

                    except Exception as xml_err:
                        logger.error(f"DShield events XML parse failed: {xml_err}")
                        logger.error(f"DShield events raw response: {resp.text[:500]}")
                        entries = []
                else:
                    # Try JSON as fallback (though DShield typically returns XML)
                    try:
                        data = resp.json()
                        logger.info("DShield events response parsed as JSON")
                        entries = data.get("topips", [])
                    except Exception as json_err:
                        logger.error(f"DShield events JSON parse failed: {json_err}")
                        logger.error(
                            f"DShield events response is neither valid XML nor JSON"
                        )
                        logger.error(f"DShield events raw response: {resp.text[:200]}")
                        entries = []

                # Normalize entries
                normalized_events = []
                for entry in entries:
                    if isinstance(entry, dict):
                        normalized = normalize_dshield_event(entry)
                        if normalized:
                            normalized_events.append(normalized)

                logger.info(
                    f"DShield events fetch successful: {len(normalized_events)} events"
                )
                return normalized_events

        except Exception as e:
            attempt += 1
            logger.error(
                f"DShield events fetch failed (attempt {attempt}/{max_retries + 1}): {e}"
            )
            if attempt > max_retries:
                break
            # Exponential backoff with jitter
            delay = base_delay * (2 ** (attempt - 1))
            delay += 0.5
            logger.info(f"DShield events retrying in {delay:.1f}s...")
            try:
                await asyncio.sleep(delay)
            except Exception:
                pass
    logger.error("DShield events fetch failed after all retries")
    return []


async def generate_mock_dshield_events(count: int = 5):
    """Generate realistic mock DShield events for fallback mode."""
    import random

    # Common attacking IP ranges and countries
    mock_ips = [
        {"ip": "185.220.101.42", "country": "DE", "countryName": "Germany"},
        {"ip": "45.146.164.110", "country": "RU", "countryName": "Russia"},
        {"ip": "103.149.162.194", "country": "CN", "countryName": "China"},
        {"ip": "91.92.109.43", "country": "RU", "countryName": "Russia"},
        {"ip": "185.220.101.35", "country": "DE", "countryName": "Germany"},
        {"ip": "45.146.164.120", "country": "RU", "countryName": "Russia"},
        {"ip": "103.149.162.200", "country": "CN", "countryName": "China"},
        {"ip": "91.92.109.50", "country": "RU", "countryName": "Russia"},
    ]

    events = []
    for i in range(count):
        mock_ip = random.choice(mock_ips)
        attack_count = random.randint(10, 1000)

        event = {
            "id": f"mock-dshield-{mock_ip['ip']}-{int(datetime.utcnow().timestamp())}-{i}",
            "src_ip": mock_ip["ip"],
            "dst_ip": "0.0.0.0",
            "src_lat": random.uniform(-60, 60),
            "src_lng": random.uniform(-180, 180),
            "dst_lat": 0.0,
            "dst_lng": 0.0,
            "reported_at": datetime.utcnow().isoformat() + "Z",
            "confidence": min(100, max(0, attack_count // 10)),
            "protocol": "tcp",
            "description": f"Mock DShield report: {attack_count} attacks",
            "source": "fallback/mock",
            "attack_count": attack_count,
            "country_code": mock_ip["country"],
            "country_name": mock_ip["countryName"],
            "isp": f"Mock ISP {random.randint(1, 10)}",
            "domain": f"mock-domain-{random.randint(1, 100)}.com",
        }
        events.append(event)

    logger.info(f"Generated {len(events)} mock DShield events")
    return events

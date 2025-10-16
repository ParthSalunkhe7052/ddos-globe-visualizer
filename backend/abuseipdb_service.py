import logging
import os

import httpx
from dotenv import load_dotenv

# Configure logging
logger = logging.getLogger(__name__)

# Load environment variables (no sensitive prints)
load_dotenv(override=True)
API_KEY = os.getenv("ABUSEIPDB_KEY")
BASE_URL = "https://api.abuseipdb.com/api/v2/check"
if not API_KEY:
    logging.warning("[abuseipdb_service] ABUSEIPDB_KEY not configured!")


def check_ip(ip_address: str):
    """
    Check an IP address against AbuseIPDB API v2.
    Returns the JSON response or error message.
    """
    if not API_KEY:
        logger.warning("AbuseIPDB API key not configured")
        return {"error": "API key not configured"}

    if not ip_address or not ip_address.strip():
        logger.error("AbuseIPDB check called with empty IP address")
        return {"error": "IP address is required"}

    headers = {"Accept": "application/json", "Key": API_KEY}
    params = {"ipAddress": ip_address.strip(), "maxAgeInDays": 90}

    logger.debug(f"AbuseIPDB check request: IP={ip_address}, params={params}")

    try:
        with httpx.Client(timeout=10.0) as client:
            response = client.get(BASE_URL, headers=headers, params=params)
        logger.debug(f"AbuseIPDB response: status={response.status_code}")

        if response.status_code == 422:
            logger.error(f"AbuseIPDB 422 error for IP {ip_address}: {response.text}")
            return {"error": "422", "message": "Invalid IP address format"}
        elif response.status_code == 429:
            logger.warning(f"AbuseIPDB 429 rate limit exceeded for IP {ip_address}")
            return {"error": "429", "message": "Rate limit exceeded"}

        response.raise_for_status()
        return response.json()
    except httpx.HTTPError as e:
        resp = getattr(e, "response", None)
        status = getattr(resp, "status_code", None)
        msg = getattr(resp, "text", str(e))
        logger.error(
            f"AbuseIPDB request failed for IP {ip_address}: status={status}, error={msg}"
        )
        return {"error": status or "request_failed", "message": msg}

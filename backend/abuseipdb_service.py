# Load .env and ABUSEIPDB_KEY for consistency with main.py
import logging
import os
import pprint

import requests
from dotenv import load_dotenv

# Configure logging
logger = logging.getLogger(__name__)

cwd = os.getcwd()
env_path = os.path.join(cwd, ".env")
print(f"[DEBUG abuseipdb_service] Current working directory: {cwd}")
print(f"[DEBUG abuseipdb_service] Looking for .env at: {env_path}")
load_dotenv(dotenv_path=env_path, override=True)
print("[DEBUG abuseipdb_service] All environment variables:")
pprint.pprint(dict(os.environ))
API_KEY = os.getenv("ABUSEIPDB_KEY")
BASE_URL = "https://api.abuseipdb.com/api/v2/check"
if API_KEY:
    logging.info(
        f"[abuseipdb_service] ABUSEIPDB_KEY loaded: {API_KEY[:4]}... (length {len(API_KEY)})"
    )
    print(
        f"[DEBUG abuseipdb_service] ABUSEIPDB_KEY loaded: '{API_KEY}' (type: {type(API_KEY)}, length: {len(API_KEY)})"
    )
    print(f"[DEBUG abuseipdb_service] ABUSEIPDB_KEY repr: {repr(API_KEY)}")
else:
    logging.warning("[abuseipdb_service] ABUSEIPDB_KEY not configured!")
    print("[DEBUG abuseipdb_service] ABUSEIPDB_KEY not loaded from .env!")


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
        response = requests.get(BASE_URL, headers=headers, params=params, timeout=10)
        logger.debug(f"AbuseIPDB response: status={response.status_code}")
        
        if response.status_code == 422:
            logger.error(f"AbuseIPDB 422 error for IP {ip_address}: {response.text}")
            return {"error": "422", "message": "Invalid IP address format"}
        elif response.status_code == 429:
            logger.warning(f"AbuseIPDB 429 rate limit exceeded for IP {ip_address}")
            return {"error": "429", "message": "Rate limit exceeded"}
        
        response.raise_for_status()
        return response.json()
    except requests.exceptions.RequestException as e:
        status = getattr(e.response, "status_code", None)
        msg = getattr(e.response, "text", str(e))
        logger.error(f"AbuseIPDB request failed for IP {ip_address}: status={status}, error={msg}")
        return {"error": status or "request_failed", "message": msg}

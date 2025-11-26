import json
import logging
import os
from datetime import datetime
from typing import Any, Dict, List, Optional

from dotenv import load_dotenv

# Load environment variables
load_dotenv(override=True)

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# API Keys
ABUSEIPDB_KEY = os.getenv("ABUSEIPDB_KEY")
OTX_API_KEY = os.getenv("OTX_API_KEY")

# Background polling intervals (seconds)
ABUSEIPDB_INTERVAL = int(os.getenv("ABUSEIPDB_INTERVAL", "300"))

# Feed intervals (seconds)
FEED_INTERVALS = {
    "threatfox": 30,
    "urlhaus": 600,
    "malwarebazaar": 60,
    "otx": 30,
}

# Global caches and state
EnrichCache: Dict[str, Any] = {}
AbuseIPDB429: Dict[str, Optional[datetime]] = {"blocked_until": None}


def load_sample_ips(fallback: bool = True) -> List[Dict[str, Any]]:
    """Load sample IPs with fallback to prevent crashes."""
    # Adjust path to be relative to this file or absolute
    # Assuming this file is in backend/config/settings.py
    # and mock_data is in backend/mock_data/
    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    path = os.path.join(base_dir, "mock_data", "sample_ips.json")

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

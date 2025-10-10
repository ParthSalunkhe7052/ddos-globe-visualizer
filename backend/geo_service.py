import os
from typing import Optional

import httpx

try:
    import geoip2.database  # type: ignore
except Exception:  # geoip2 is optional; we'll fall back to HTTP if missing
    geoip2 = None  # type: ignore


# Path to the GeoLite2 database from .env
DB_PATH = os.getenv("GEOLITE_DB_PATH", "ml_model/GeoLite2-City.mmdb")

_reader: Optional["geoip2.database.Reader"] = None


def _get_reader() -> Optional["geoip2.database.Reader"]:
    global _reader
    if _reader is not None:
        return _reader
    if geoip2 is None:
        return None
    try:
        if os.path.exists(DB_PATH):
            _reader = geoip2.database.Reader(DB_PATH)  # type: ignore[attr-defined]
            return _reader
        return None
    except Exception:
        return None


def ip_to_location(ip_address: str):
    """
    Returns latitude & longitude for the given IP.
    - Uses local GeoLite2 database if available
    - Falls back to ip-api.com if geoip2/db is unavailable
    """
    reader = _get_reader()
    if reader is not None:
        try:
            response = reader.city(ip_address)
            return {
                "ip": ip_address,
                "country": response.country.name,
                "city": response.city.name,
                "latitude": response.location.latitude,
                "longitude": response.location.longitude,
            }
        except Exception as e:
            return {"error": str(e)}

    # Fallback: external HTTP geolocation
    try:
        url = f"http://ip-api.com/json/{ip_address}?fields=status,message,country,city,lat,lon,query"
        with httpx.Client(timeout=5.0) as client:
            r = client.get(url)
        data = r.json()
        if data.get("status") != "success":
            return {"error": data.get("message", "geolocation_failed")}
        return {
            "ip": data.get("query", ip_address),
            "country": data.get("country"),
            "city": data.get("city"),
            "latitude": data.get("lat"),
            "longitude": data.get("lon"),
        }
    except Exception as e:
        return {"error": str(e)}

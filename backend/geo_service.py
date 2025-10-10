import os

import geoip2.database

# Path to the GeoLite2 database from .env
DB_PATH = os.getenv("GEOLITE_DB_PATH", "ml_model/GeoLite2-City.mmdb")

# Create a single reader instance (thread-safe for FastAPI)
reader = geoip2.database.Reader(DB_PATH)


def ip_to_location(ip_address: str):
    """
    Returns latitude & longitude for the given IP using GeoLite2 database.
    """
    try:
        response = reader.city(ip_address)
        location = {
            "ip": ip_address,
            "country": response.country.name,
            "city": response.city.name,
            "latitude": response.location.latitude,
            "longitude": response.location.longitude,
        }
        return location
    except Exception as e:
        return {"error": str(e)}

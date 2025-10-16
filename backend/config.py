"""
Configuration settings for DDoS Globe Visualizer.
Loads environment variables and exposes constants for use across the backend.
"""

import os

from dotenv import load_dotenv

# Load environment variables
load_dotenv(override=True)

# DShield Configuration
DSHIELD_MODE = os.getenv("DShieldMode", "live").lower()
USE_MOCK_DATA = os.getenv("USE_MOCK_DATA", "false").lower() == "true"

# AbuseIPDB Configuration
ABUSEIPDB_KEY = os.getenv("ABUSEIPDB_KEY")

# API Intervals (in seconds)
ABUSEIPDB_INTERVAL = int(os.getenv("ABUSEIPDB_INTERVAL", "300"))
DSHIELD_INTERVAL = int(os.getenv("DSHIELD_INTERVAL", "300"))

# WebSocket Configuration
WS_HOST = os.getenv("WS_HOST", "0.0.0.0")
WS_PORT = int(os.getenv("WS_PORT", "8000"))

# Debug Configuration
DEBUG = os.getenv("DEBUG", "false").lower() == "true"

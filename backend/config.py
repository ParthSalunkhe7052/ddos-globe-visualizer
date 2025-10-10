"""
Configuration settings for DDoS Globe Visualizer
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

print(f"🔧 Configuration loaded:")
print(f"   DShield Mode: {DSHIELD_MODE}")
print(f"   Use Mock Data: {USE_MOCK_DATA}")
print(f"   AbuseIPDB Key: {'Set' if ABUSEIPDB_KEY else 'Not set'}")
print(f"   Debug Mode: {DEBUG}")

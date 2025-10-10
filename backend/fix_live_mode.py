#!/usr/bin/env python3
"""
Script to diagnose and fix live mode issues
"""
import asyncio
import os
import sys

from dshield_service import fetch_dshield_events, fetch_dshield_top_ips


async def test_dshield_connection():
    """Test DShield API connection"""
    print("🔍 Testing DShield API connection...")
    try:
        # Test the events endpoint
        events = await fetch_dshield_events(max_retries=1, base_delay=0.5)
        print(f"✅ DShield events: {len(events) if events else 0}")

        if events:
            print(f"📊 Sample event: {events[0]}")
        else:
            print("⚠️  No events returned from DShield")

        # Test the top IPs endpoint
        top_ips = await fetch_dshield_top_ips()
        print(f"✅ DShield top IPs: {len(top_ips) if top_ips else 0}")

        if top_ips:
            print(f"📊 Sample top IP: {top_ips[0]}")
        else:
            print("⚠️  No top IPs returned from DShield")

        return len(events) > 0 or len(top_ips) > 0

    except Exception as e:
        print(f"❌ DShield connection failed: {e}")
        return False


def check_environment():
    """Check environment variables"""
    print("🔍 Checking environment variables...")

    # Check DShield mode
    dshield_mode = os.getenv("DShieldMode", "live")
    print(f"📋 DShieldMode: {dshield_mode}")

    # Check if mock data is enabled
    use_mock = os.getenv("USE_MOCK_DATA", "false").lower() == "true"
    print(f"📋 USE_MOCK_DATA: {use_mock}")

    # Check AbuseIPDB key
    abuseipdb_key = os.getenv("ABUSEIPDB_KEY")
    print(f"📋 ABUSEIPDB_KEY: {'Set' if abuseipdb_key else 'Not set'}")

    return dshield_mode, use_mock, abuseipdb_key


async def main():
    """Main diagnostic function"""
    print("🚀 DDoS Globe Visualizer - Live Mode Diagnostic")
    print("=" * 50)

    # Check environment
    dshield_mode, use_mock, abuseipdb_key = check_environment()

    print("\n" + "=" * 50)

    # Test DShield connection
    dshield_working = await test_dshield_connection()

    print("\n" + "=" * 50)
    print("📋 DIAGNOSTIC SUMMARY:")
    print(f"   DShield Mode: {dshield_mode}")
    print(f"   Use Mock Data: {use_mock}")
    print(f"   DShield API Working: {'✅ Yes' if dshield_working else '❌ No'}")
    print(f"   AbuseIPDB Key: {'✅ Set' if abuseipdb_key else '❌ Not set'}")

    if not dshield_working and dshield_mode == "live":
        print("\n🔧 RECOMMENDATIONS:")
        print("   1. Check your internet connection")
        print("   2. Try setting DShieldMode=fallback to use mock data")
        print("   3. Check if DShield API is accessible from your network")
        print("   4. Consider using a VPN if DShield is blocked")

    if use_mock:
        print("\n⚠️  Mock data is enabled - live mode will use simulated data")

    return dshield_working


if __name__ == "__main__":
    try:
        result = asyncio.run(main())
        sys.exit(0 if result else 1)
    except KeyboardInterrupt:
        print("\n\n👋 Diagnostic interrupted by user")
        sys.exit(1)
    except Exception as e:
        print(f"\n❌ Diagnostic failed: {e}")
        sys.exit(1)

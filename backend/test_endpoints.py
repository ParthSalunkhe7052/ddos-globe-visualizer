#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Quick test script to verify admin panel and live mode endpoints
"""
import asyncio
import sys

import httpx


async def test_admin_panel():
    """Test admin panel endpoints"""
    base_url = "http://localhost:8000"

    print("=" * 60)
    print("Testing Admin Panel Endpoints")
    print("=" * 60)

    tests = [
        {"name": "Health Check", "endpoint": "/health", "method": "GET"},
        {"name": "Admin Status", "endpoint": "/api/admin/status", "method": "GET"},
        {
            "name": "DShield Health",
            "endpoint": "/api/health/live-feed",
            "method": "GET",
        },
        {
            "name": "AbuseIPDB Health",
            "endpoint": "/api/health/abuseipdb",
            "method": "GET",
        },
    ]

    results = []

    async with httpx.AsyncClient(timeout=10) as client:
        for test in tests:
            try:
                print(f"\n[TEST] {test['name']} ({test['endpoint']})")

                if test["method"] == "GET":
                    resp = await client.get(f"{base_url}{test['endpoint']}")
                else:
                    resp = await client.post(f"{base_url}{test['endpoint']}")

                if resp.status_code == 200:
                    print(f"   [PASS] Status: {resp.status_code}")
                    try:
                        data = resp.json()
                        print(f"   Response keys: {list(data.keys())}")
                    except:
                        print(f"   Response length: {len(resp.text)} bytes")
                    results.append(
                        {
                            "test": test["name"],
                            "status": "PASS",
                            "code": resp.status_code,
                        }
                    )
                else:
                    print(f"   [FAIL] Status: {resp.status_code}")
                    print(f"   Response: {resp.text[:200]}")
                    results.append(
                        {
                            "test": test["name"],
                            "status": "FAIL",
                            "code": resp.status_code,
                        }
                    )

            except Exception as e:
                print(f"   [ERROR] {str(e)}")
                results.append(
                    {"test": test["name"], "status": "ERROR", "error": str(e)}
                )

    print("\n" + "=" * 60)
    print("Test Summary")
    print("=" * 60)

    passed = sum(1 for r in results if r.get("status") == "PASS")
    failed = sum(1 for r in results if r.get("status") == "FAIL")
    errors = sum(1 for r in results if r.get("status") == "ERROR")

    print(f"Passed: {passed}")
    print(f"Failed: {failed}")
    print(f"Errors: {errors}")
    print(f"Total: {len(results)}")

    return passed == len(results)


async def test_live_mode():
    """Test live mode data flow"""
    print("\n" + "=" * 60)
    print("Testing Live Mode")
    print("=" * 60)

    print("\n[TEST] DShield service directly...")
    try:
        from dshield_service import fetch_dshield_events

        events = await fetch_dshield_events(max_retries=1, base_delay=0.5)
        if events:
            print(f"   [PASS] DShield fetch successful: {len(events)} events")
            print(
                f"   Sample event: {events[0].get('id', 'no-id')} - {events[0].get('src_ip', 'no-ip')}"
            )
            return True
        else:
            print(f"   [FAIL] DShield fetch returned no events")
            return False
    except Exception as e:
        print(f"   [ERROR] {str(e)}")
        return False


async def main():
    """Run all tests"""
    print("\nStarting endpoint tests...\n")
    print("NOTE: Make sure the backend is running on http://localhost:8000")
    print("      (Run: python main.py from backend directory)\n")

    # Test admin panel
    admin_ok = await test_admin_panel()

    # Test live mode
    live_ok = await test_live_mode()

    print("\n" + "=" * 60)
    print("Final Results")
    print("=" * 60)
    print(f"Admin Panel: {'PASS' if admin_ok else 'FAIL'}")
    print(f"Live Mode: {'PASS' if live_ok else 'FAIL'}")
    print("=" * 60)

    return admin_ok and live_ok


if __name__ == "__main__":
    try:
        success = asyncio.run(main())
        sys.exit(0 if success else 1)
    except KeyboardInterrupt:
        print("\n\nTest interrupted by user")
        sys.exit(1)
    except Exception as e:
        print(f"\n\nTest failed with error: {e}")
        import traceback

        traceback.print_exc()
        sys.exit(1)

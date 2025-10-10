#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Test script for Live Mode functionality
Tests DShield streaming, WebSocket connection, and geo enrichment
"""
import asyncio
import json
import sys

import httpx


async def test_feed_mode_endpoint():
    """Test the /api/debug/feed_mode endpoint with JSON body and query params"""
    print("\n" + "=" * 60)
    print("Testing /api/debug/feed_mode Endpoint")
    print("=" * 60)
    
    base_url = "http://localhost:8000"
    results = []
    
    async with httpx.AsyncClient(timeout=10) as client:
        # Test 1: POST with JSON body (how admin panel sends it)
        try:
            print("\n[TEST 1] POST with JSON body")
            resp = await client.post(
                f"{base_url}/api/debug/feed_mode",
                json={"mode": "live"}
            )
            if resp.status_code == 200:
                print(f"   [PASS] Status: {resp.status_code}")
                print(f"   Response: {resp.json()}")
                results.append(("JSON body", "PASS"))
            else:
                print(f"   [FAIL] Status: {resp.status_code}")
                print(f"   Response: {resp.text[:200]}")
                results.append(("JSON body", "FAIL"))
        except Exception as e:
            print(f"   [ERROR] {e}")
            results.append(("JSON body", "ERROR"))
        
        # Test 2: POST with query parameter
        try:
            print("\n[TEST 2] POST with query parameter")
            resp = await client.post(
                f"{base_url}/api/debug/feed_mode?mode=fallback"
            )
            if resp.status_code == 200:
                print(f"   [PASS] Status: {resp.status_code}")
                print(f"   Response: {resp.json()}")
                results.append(("Query param", "PASS"))
            else:
                print(f"   [FAIL] Status: {resp.status_code}")
                print(f"   Response: {resp.text[:200]}")
                results.append(("Query param", "FAIL"))
        except Exception as e:
            print(f"   [ERROR] {e}")
            results.append(("Query param", "ERROR"))
        
        # Test 3: Invalid mode
        try:
            print("\n[TEST 3] Invalid mode (should return 400)")
            resp = await client.post(
                f"{base_url}/api/debug/feed_mode",
                json={"mode": "invalid"}
            )
            if resp.status_code == 400:
                print(f"   [PASS] Correctly rejected with 400")
                print(f"   Response: {resp.json()}")
                results.append(("Invalid mode", "PASS"))
            else:
                print(f"   [FAIL] Status: {resp.status_code}")
                results.append(("Invalid mode", "FAIL"))
        except Exception as e:
            print(f"   [ERROR] {e}")
            results.append(("Invalid mode", "ERROR"))
        
        # Test 4: Missing mode
        try:
            print("\n[TEST 4] Missing mode (should return 400)")
            resp = await client.post(f"{base_url}/api/debug/feed_mode", json={})
            if resp.status_code == 400:
                print(f"   [PASS] Correctly rejected with 400")
                print(f"   Response: {resp.json()}")
                results.append(("Missing mode", "PASS"))
            else:
                print(f"   [FAIL] Status: {resp.status_code}")
                results.append(("Missing mode", "FAIL"))
        except Exception as e:
            print(f"   [ERROR] {e}")
            results.append(("Missing mode", "ERROR"))
    
    print("\n" + "=" * 60)
    print("Feed Mode Endpoint Test Summary")
    print("=" * 60)
    passed = sum(1 for _, status in results if status == "PASS")
    print(f"Passed: {passed}/{len(results)}")
    for test, status in results:
        print(f"  {test}: {status}")
    
    return passed == len(results)


async def test_websocket_connection():
    """Test WebSocket connection to /ws/attacks"""
    print("\n" + "=" * 60)
    print("Testing WebSocket Connection")
    print("=" * 60)
    
    try:
        from websockets import connect
        
        print("\n[TEST] Connecting to ws://localhost:8000/ws/attacks")
        async with connect("ws://localhost:8000/ws/attacks") as websocket:
            print("   [PASS] WebSocket connected")
            
            # Wait for initial status message
            print("   Waiting for status message...")
            message = await asyncio.wait_for(websocket.recv(), timeout=5)
            data = json.loads(message)
            
            if data.get("type") == "status":
                print(f"   [PASS] Received status: {data.get('message')}")
                return True
            else:
                print(f"   [FAIL] Unexpected message type: {data.get('type')}")
                return False
                
    except ImportError:
        print("   [SKIP] websockets library not installed (pip install websockets)")
        print("   Manual test: Open frontend and enable Live Mode")
        return True  # Don't fail the test
    except Exception as e:
        print(f"   [ERROR] {e}")
        return False


async def test_geo_enrichment():
    """Test geo enrichment doesn't block"""
    print("\n" + "=" * 60)
    print("Testing Geo Enrichment")
    print("=" * 60)
    
    try:
        from dshield_service import normalize_dshield_event
        
        print("\n[TEST] Normalizing DShield event with valid IP")
        event = normalize_dshield_event(
            {"ip": "8.8.8.8", "attacks": 10, "attackCount": 10}
        )
        
        if event and event.get("src_ip") == "8.8.8.8":
            print(f"   [PASS] Event normalized successfully")
            print(f"   Event ID: {event.get('id')}")
            print(f"   Location: {event.get('src_lat')}, {event.get('src_lng')}")
            print(f"   Country: {event.get('country_code')}")
            
            # Test with invalid IP (should not crash)
            print("\n[TEST] Normalizing DShield event with invalid IP")
            event2 = normalize_dshield_event(
                {"ip": "999.999.999.999", "attacks": 5}
            )
            
            if event2:
                print(f"   [PASS] Invalid IP handled gracefully")
                print(f"   Event ID: {event2.get('id')}")
                return True
            else:
                print(f"   [PASS] Invalid IP returned None (acceptable)")
                return True
        else:
            print(f"   [FAIL] Event normalization failed")
            return False
            
    except Exception as e:
        print(f"   [ERROR] {e}")
        import traceback
        traceback.print_exc()
        return False


async def test_dshield_fetch():
    """Test DShield data fetching"""
    print("\n" + "=" * 60)
    print("Testing DShield Data Fetch")
    print("=" * 60)
    
    try:
        from dshield_service import fetch_dshield_events
        
        print("\n[TEST] Fetching DShield events (may take 10-30 seconds)...")
        events = await fetch_dshield_events(max_retries=1, base_delay=0.5)
        
        if events and len(events) > 0:
            print(f"   [PASS] Fetched {len(events)} events")
            print(f"   Sample event: {events[0].get('id')} - {events[0].get('src_ip')}")
            print(f"   Location: {events[0].get('src_lat')}, {events[0].get('src_lng')}")
            return True
        else:
            print(f"   [WARN] No events fetched (DShield may be unavailable)")
            return True  # Don't fail if DShield is temporarily down
            
    except Exception as e:
        print(f"   [ERROR] {e}")
        return False


async def main():
    """Run all Live Mode tests"""
    print("\n" + "=" * 60)
    print("Live Mode Comprehensive Test Suite")
    print("=" * 60)
    print("NOTE: Make sure backend is running on http://localhost:8000")
    print("      (Run: cd backend && python main.py)\n")
    
    results = {
        "feed_mode_endpoint": await test_feed_mode_endpoint(),
        "websocket_connection": await test_websocket_connection(),
        "geo_enrichment": await test_geo_enrichment(),
        "dshield_fetch": await test_dshield_fetch(),
    }
    
    print("\n" + "=" * 60)
    print("Final Test Results")
    print("=" * 60)
    
    for test_name, passed in results.items():
        status = "PASS" if passed else "FAIL"
        print(f"{test_name}: {status}")
    
    all_passed = all(results.values())
    print("=" * 60)
    print(f"Overall: {'PASS - All tests passed!' if all_passed else 'FAIL - Some tests failed'}")
    print("=" * 60)
    
    return all_passed


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


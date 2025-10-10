"""
Fixed WebSocket handler for DShield attacks
"""

import asyncio
import logging
import time
from datetime import datetime
from typing import Set

logger = logging.getLogger(__name__)

# Global connection tracking
active_connections: Set = set()
last_event_time = 0
EVENT_INTERVAL = 7.0  # 7 seconds between events


async def send_status_safe(websocket, message: str):
    """Safely send status message with error handling"""
    try:
        if websocket.client_state.name == "CONNECTED":
            await websocket.send_json(
                {
                    "type": "status",
                    "message": message,
                    "timestamp": datetime.utcnow().isoformat() + "Z",
                }
            )
            return True
    except Exception as e:
        logger.error(f"Failed to send status message '{message}': {e}")
    return False


async def send_event_safe(websocket, event_data):
    """Safely send event with error handling"""
    try:
        if websocket.client_state.name == "CONNECTED":
            await websocket.send_json({"type": "attack", "data": event_data})
            return True
    except Exception as e:
        logger.error(f"Failed to send event: {e}")
    return False


async def generate_mock_event():
    """Generate a single mock event"""
    import random
    from datetime import datetime

    mock_ips = [
        {"ip": "185.220.101.42", "country": "DE", "lat": 51.1657, "lng": 10.4515},
        {"ip": "45.146.164.110", "country": "RU", "lat": 61.5240, "lng": 105.3188},
        {"ip": "103.149.162.194", "country": "CN", "lat": 35.8617, "lng": 104.1954},
        {"ip": "91.92.109.43", "country": "RU", "lat": 61.5240, "lng": 105.3188},
        {"ip": "185.220.101.35", "country": "DE", "lat": 51.1657, "lng": 10.4515},
    ]

    mock_ip = random.choice(mock_ips)
    attack_count = random.randint(10, 1000)

    return {
        "id": f"mock-dshield-{mock_ip['ip']}-{int(datetime.utcnow().timestamp())}",
        "src_ip": mock_ip["ip"],
        "dst_ip": "0.0.0.0",
        "src_lat": mock_ip["lat"],
        "src_lng": mock_ip["lng"],
        "dst_lat": 0.0,
        "dst_lng": 0.0,
        "reported_at": datetime.utcnow().isoformat() + "Z",
        "confidence": min(100, max(0, attack_count // 10)),
        "protocol": "tcp",
        "description": f"Mock DShield report: {attack_count} attacks",
        "source": "fallback/mock",
        "attack_count": attack_count,
        "country_code": mock_ip["country"],
        "country_name": mock_ip["country"],
    }


async def handle_websocket_connection(websocket):
    """Handle a single WebSocket connection with rate limiting"""
    global last_event_time

    connection_id = id(websocket)
    active_connections.add(connection_id)

    logger.info(f"WebSocket connection {connection_id} established")

    try:
        # Send initial status
        await send_status_safe(websocket, "Connected to DShield stream")

        while True:
            # Check if connection is still alive
            if websocket.client_state.name != "CONNECTED":
                logger.info(f"WebSocket {connection_id} disconnected")
                break

            current_time = time.time()

            # Rate limiting: only send event every 7 seconds
            if current_time - last_event_time >= EVENT_INTERVAL:
                # Generate mock event
                event = await generate_mock_event()

                # Send event to this connection
                success = await send_event_safe(websocket, event)
                if success:
                    last_event_time = current_time
                    logger.info(
                        f"Sent event {event['id']} to connection {connection_id}"
                    )
                else:
                    logger.warning(
                        f"Failed to send event to connection {connection_id}"
                    )
                    break
            else:
                # Wait a bit before checking again
                await asyncio.sleep(1)

    except Exception as e:
        logger.error(f"WebSocket {connection_id} error: {e}")
    finally:
        active_connections.discard(connection_id)
        logger.info(f"WebSocket connection {connection_id} closed")


async def websocket_handler(websocket):
    """Main WebSocket handler with connection management"""
    await websocket.accept()
    logger.info("=== DShield WebSocket client connected ===")

    try:
        await handle_websocket_connection(websocket)
    except Exception as e:
        logger.error(f"WebSocket handler error: {e}")
    finally:
        logger.info("=== DShield WebSocket client disconnected ===")

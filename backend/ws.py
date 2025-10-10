import asyncio
import random
import time


# --- Fake traffic generator (toggleable via ENABLE_FAKE_TRAFFIC env var) ---
async def generate_fake_attacks(manager, interval: float = 3.0):
    """
    Background coroutine that simulates attack events and broadcasts them
    via `broadcast_event(payload)` (which is defined in this module).
    Call this using asyncio.create_task(generate_fake_attacks(...)) from main.py.
    """
    # A compact set of sample locations (lat, lon, country) for more believable visuals.
    SAMPLE_LOCATIONS = [
        {"lat": 40.7128, "lon": -74.0060, "country": "United States"},  # NYC
        {"lat": 51.5074, "lon": -0.1278, "country": "United Kingdom"},  # London
        {"lat": 35.6895, "lon": 139.6917, "country": "Japan"},  # Tokyo
        {"lat": -33.8688, "lon": 151.2093, "country": "Australia"},  # Sydney
        {"lat": 28.6139, "lon": 77.2090, "country": "India"},  # New Delhi
        {"lat": 34.0522, "lon": -118.2437, "country": "United States"},  # LA
        {"lat": 48.8566, "lon": 2.3522, "country": "France"},  # Paris
        {"lat": 55.7558, "lon": 37.6173, "country": "Russia"},  # Moscow
    ]

    # Keep running until cancelled
    try:
        while True:
            try:
                loc = random.choice(SAMPLE_LOCATIONS)
                score = random.randint(0, 100)
                severity = (
                    "High" if score >= 70 else ("Medium" if score >= 30 else "Low")
                )
                # Synthetic IP — obviously not real
                ip = f"{random.randint(1, 255)}.{random.randint(0,255)}.{random.randint(0,255)}.{random.randint(1,255)}"

                payload = {
                    "ip": ip,
                    "geo_info": {
                        "lat": loc["lat"],
                        "lon": loc["lon"],
                        "country": loc["country"],
                    },
                    "abuse_info": {
                        "abuseConfidenceScore": score,
                        "isp": "Simulated ISP",
                        "type": "Botnet",
                    },
                    "arc": {
                        "startLat": 0,
                        "startLng": 0,
                        "endLat": loc["lat"],
                        "endLng": loc["lon"],
                    },
                    "timestamp": int(time.time() * 1000),
                    "severity": severity,
                }

                # Use the provided manager to broadcast to all connected clients
                try:
                    await manager.broadcast(payload)
                except Exception as e:
                    # Do not propagate — log and continue
                    print("generate_fake_attacks: manager.broadcast error:", str(e))

            except asyncio.CancelledError:
                # allow graceful cancellation
                break
            except Exception as e:
                # Log unexpected error and continue
                print("generate_fake_attacks: unexpected error:", str(e))

            # Sleep before emitting the next event
            await asyncio.sleep(float(interval))
    except asyncio.CancelledError:
        # final cleanup if cancellation bubbles here
        pass


# backend/ws.py
import asyncio
import json
import time

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

router = APIRouter()

# set of connected WebSocket objects
connected_websockets = set()


def compute_severity(abuse_score):
    """Return severity string from numeric abuse_score per spec."""
    try:
        s = int(abuse_score)
    except Exception:
        return "Low"
    if s < 30:
        return "Low"
    if s < 70:
        return "Medium"
    return "High"


async def broadcast_event(payload: dict):
    """
    Broadcast a JSON-serializable payload to all connected websockets.
    This function is safe to call from other modules; it will attach
    severity/timestamp/arc defaults if missing and attempt to send to
    currently connected clients.
    """
    # ensure minimum fields (non-destructive)
    try:
        if "severity" not in payload:
            abuse_score = payload.get("abuse_score") or payload.get(
                "abuse_info", {}
            ).get("abuseConfidenceScore")
            payload["severity"] = compute_severity(abuse_score)
    except Exception:
        payload.setdefault("severity", "Low")

    if "arc" not in payload:
        geo = payload.get("geo_info") or {}
        endLat = geo.get("latitude") or geo.get("lat")
        endLng = geo.get("longitude") or geo.get("lon") or geo.get("lng")
        payload["arc"] = {
            "startLat": 0,
            "startLng": 0,
            "endLat": endLat,
            "endLng": endLng,
        }

    # timestamp in ms for timeline
    payload["timestamp"] = int(time.time() * 1000)

    text = json.dumps(payload)

    # snapshot to avoid mutation during iteration
    sockets = list(connected_websockets)
    for ws in sockets:
        try:
            await ws.send_text(text)
        except Exception:
            # remove broken socket
            try:
                await ws.close()
            except Exception:
                pass
            connected_websockets.discard(ws)


@router.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    """
    Simple /ws endpoint. Accepts the connection, reads text messages (ignored),
    and keeps the connection alive until disconnect.
    """
    await websocket.accept()
    connected_websockets.add(websocket)
    try:
        while True:
            # receive_text keeps the connection readable; we do not process client messages
            await websocket.receive_text()
    except WebSocketDisconnect:
        connected_websockets.discard(websocket)
    except Exception:
        # remove and close on unexpected errors
        connected_websockets.discard(websocket)
        try:
            await websocket.close()
        except Exception:
            pass

import sys
import os
import time

# Make sure Python can find the backend package
# (the folder that contains "backend")
sys.path.insert(
    0, os.path.abspath(os.path.join(os.path.dirname(__file__), "../.."))
)

from main import app
from starlette.testclient import TestClient

client = TestClient(app)


def test_ws_broadcast_on_analyze_ip():
    """Test that /analyze_ip triggers a broadcast over /ws."""
    with client.websocket_connect("/ws") as ws:
        resp = client.get("/analyze_ip?ip=8.8.8.8")
        assert resp.status_code == 200
        # wait briefly for broadcast to be sent
        time.sleep(1)
        data = ws.receive_text()
        assert isinstance(data, str)
        assert "8.8.8.8" in data or "ip" in data.lower()

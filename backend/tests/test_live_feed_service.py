import types

from fastapi.testclient import TestClient

from backend.live_feed_service import NormalizedIndicator, get_service
from backend.main import app


def setup_module():
    # Seed the service with a few sample items without network
    svc = get_service()
    item1 = NormalizedIndicator(
        id="otx-1",
        source="otx",
        raw={"indicator": {"indicator": "1.2.3.4", "type": "IPv4"}},
        type="ip",
        indicator="1.2.3.4",
        category="malicious",
        confidence=80,
        first_seen="2024-01-01T00:00:00Z",
        last_seen="2024-01-01T00:00:00Z",
        country="US",
        latitude=37.0,
        longitude=-122.0,
        meta={},
    )
    item2 = NormalizedIndicator(
        id="urlhaus-2",
        source="urlhaus",
        raw={"url": "http://evil.example/"},
        type="url",
        indicator="http://evil.example/",
        category="malware_download",
        confidence=60,
        first_seen="2024-01-01T00:00:00Z",
        last_seen="2024-01-01T00:00:00Z",
        country=None,
        latitude=None,
        longitude=None,
        meta={},
    )
    # Directly push into buffer via private API
    svc._add(item1)
    svc._add(item2)


def test_live_feed_status_and_test_endpoints():
    client = TestClient(app)

    r = client.get("/api/live-feed/status")
    assert r.status_code == 200
    body = r.json()
    assert body.get("ok") is True
    assert "sources" in body

    t = client.get("/api/live-feed/test?limit=2")
    assert t.status_code == 200
    tb = t.json()
    assert tb.get("ok") is True
    assert isinstance(tb.get("count"), int)
    assert isinstance(tb.get("sample"), list)
    assert len(tb["sample"]) <= 2
    # Validate normalized shape for at least one item
    if tb["sample"]:
        s0 = tb["sample"][0]
        for k in [
            "id",
            "source",
            "raw",
            "type",
            "indicator",
            "confidence",
            "first_seen",
            "last_seen",
            "meta",
        ]:
            assert k in s0

# tests/test_analyze_ip.py
import sys, os
sys.path.append(os.path.dirname(os.path.dirname(__file__)))

import pytest
from fastapi.testclient import TestClient
from main import app   # now it finds your app

client = TestClient(app)

def test_analyze_ip_valid():
    response = client.get("/analyze_ip", params={"ip": "8.8.8.8"})
    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, dict)
    assert "ip" in data
    assert "geo_info" in data

@pytest.mark.parametrize("bad_ip", ["999.999.999.999", "not_an_ip"])
def test_analyze_ip_invalid(bad_ip):
    response = client.get("/analyze_ip", params={"ip": bad_ip})
    assert response.status_code in (400, 422)
    data = response.json()
    assert isinstance(data, dict)
    assert "error" in data or "detail" in data

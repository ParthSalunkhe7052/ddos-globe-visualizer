import sqlite3
import time
import threading

DB_PATH = "ip_cache.db"
CREATE_TABLE = """
CREATE TABLE IF NOT EXISTS ip_cache (
    ip TEXT PRIMARY KEY,
    data TEXT,
    timestamp REAL
)
"""

_lock = threading.Lock()

def init_db():
    with _lock, sqlite3.connect(DB_PATH) as conn:
        conn.execute(CREATE_TABLE)

def get_cached(ip):
    with _lock, sqlite3.connect(DB_PATH) as conn:
        row = conn.execute("SELECT data, timestamp FROM ip_cache WHERE ip=?", (ip,)).fetchone()
        if row:
            data, ts = row
            if time.time() - ts < 86400:  # 24h
                return data
            else:
                conn.execute("DELETE FROM ip_cache WHERE ip=?", (ip,))
    return None

def set_cache(ip, data):
    with _lock, sqlite3.connect(DB_PATH) as conn:
        conn.execute(
            "REPLACE INTO ip_cache (ip, data, timestamp) VALUES (?, ?, ?)",
            (ip, data, time.time())
        )

init_db()

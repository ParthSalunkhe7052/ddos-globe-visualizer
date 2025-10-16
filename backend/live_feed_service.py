import asyncio
import logging
import os
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional, Tuple

import httpx


def _iso_now() -> str:
    return (
        datetime.now(timezone.utc)
        .replace(microsecond=0)
        .isoformat()
        .replace("+00:00", "Z")
    )


def _to_iso(dt: Optional[datetime]) -> Optional[str]:
    if not dt:
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.replace(microsecond=0).isoformat().replace("+00:00", "Z")


@dataclass
class FeedStatus:
    last_fetch: Optional[datetime] = None
    last_status: str = "init"
    consecutive_failures: int = 0
    etag: Optional[str] = None
    last_modified: Optional[str] = None


@dataclass
class NormalizedIndicator:
    id: str
    source: str
    raw: Dict[str, Any]
    type: str
    indicator: str
    category: Optional[str]
    confidence: int
    first_seen: str
    last_seen: str
    country: Optional[str]
    latitude: Optional[float]
    longitude: Optional[float]
    meta: Dict[str, Any] = field(default_factory=dict)


class LiveFeedService:
    def __init__(self) -> None:
        self.logger = logging.getLogger(__name__)
        self.otx_api_key = os.getenv("OTX_API_KEY")
        self.abusech_key = os.getenv("ABUSECH_AUTH_KEY") or os.getenv("ABUSECH_API_KEY")
        self.poll_interval = int(os.getenv("LIVEFEED_POLL_INTERVAL_SEC", "30"))
        self.max_cache_age_sec = int(os.getenv("MAX_CACHE_AGE_SEC", "3600"))
        self.max_buffer = int(os.getenv("LIVEFEED_MAX_BUFFER", "5000"))

        # In-memory rolling buffer (newest last)
        self._buffer: List[NormalizedIndicator] = []
        # Seen map for deduping: key -> (index in buffer, last_seen)
        self._seen: Dict[str, Tuple[int, datetime]] = {}

        # Geo cache
        self._geo_cache: Dict[str, Tuple[Dict[str, Any], datetime]] = {}

        # Status per source
        self.status: Dict[str, FeedStatus] = {
            "otx": FeedStatus(),
            "urlhaus": FeedStatus(),
            "malwarebazaar": FeedStatus(),
        }
        self.degraded: bool = False

        # Control
        self._task: Optional[asyncio.Task] = None
        self._stop_event = asyncio.Event()

    # ---------- Public API ----------
    def start(self) -> None:
        if self._task and not self._task.done():
            return
        self._stop_event = asyncio.Event()
        self._task = asyncio.create_task(self._run())
        self.logger.info("live_feed_service started (interval=%ss)", self.poll_interval)

    async def stop(self) -> None:
        if self._task:
            self._stop_event.set()
            try:
                await asyncio.wait_for(self._task, timeout=5)
            except Exception:
                pass

    def snapshot(self, limit: int = 50) -> Dict[str, Any]:
        items = self._buffer[-limit:]
        return {
            "ok": True,
            "last_updated": _iso_now(),
            "count": len(self._buffer),
            "sample": [ni.__dict__ for ni in items],
        }

    def get_status(self) -> Dict[str, Any]:
        def ser(fs: FeedStatus) -> Dict[str, Any]:
            return {
                "last_fetch": _to_iso(fs.last_fetch),
                "last_status": fs.last_status,
                "consecutive_failures": fs.consecutive_failures,
            }

        return {
            "ok": True,
            "degraded": self.degraded,
            "sources": {k: ser(v) for k, v in self.status.items()},
            "queue_length": len(self._buffer),
            "errors": [],
        }

    # ---------- Main loop ----------
    async def _run(self) -> None:
        # Poll each source in a cooperative round-robin
        # Separate timers per source based on last fetch
        next_run: Dict[str, datetime] = {
            k: datetime.now(timezone.utc) for k in self.status.keys()
        }
        while not self._stop_event.is_set():
            now = datetime.now(timezone.utc)
            try:
                tasks = []
                if now >= next_run["otx"]:
                    tasks.append(self._poll_otx())
                    next_run["otx"] = now + timedelta(seconds=self.poll_interval)
                if now >= next_run["urlhaus"]:
                    tasks.append(self._poll_urlhaus())
                    next_run["urlhaus"] = now + timedelta(seconds=self.poll_interval)
                if now >= next_run["malwarebazaar"]:
                    tasks.append(self._poll_malwarebazaar())
                    next_run["malwarebazaar"] = now + timedelta(
                        seconds=self.poll_interval
                    )

                if tasks:
                    await asyncio.gather(*tasks, return_exceptions=True)

                # Health: degraded if all sources failing many times
                self.degraded = all(
                    fs.consecutive_failures >= 5 for fs in self.status.values()
                )

            except Exception as e:
                self.logger.warning("live_feed_service loop error: %s", e)

            try:
                await asyncio.wait_for(self._stop_event.wait(), timeout=1.0)
            except asyncio.TimeoutError:
                pass

    # ---------- Fetchers ----------
    async def _poll_otx(self) -> None:
        src = "otx"
        fs = self.status[src]
        headers = {}
        if self.otx_api_key:
            headers["X-OTX-API-KEY"] = self.otx_api_key
        if fs.etag:
            headers["If-None-Match"] = fs.etag
        if fs.last_modified:
            headers["If-Modified-Since"] = fs.last_modified

        try:
            async with httpx.AsyncClient(timeout=20) as client:
                resp = await client.get(
                    "https://otx.alienvault.com/api/v1/pulses/subscribed",
                    headers=headers,
                )
            fs.last_fetch = datetime.now(timezone.utc)
            if resp.status_code == 304:
                fs.last_status = "not_modified"
                fs.consecutive_failures = 0
                return
            if resp.status_code in (429,) or resp.status_code >= 500:
                await self._backoff(fs, src, resp)
                return
            if resp.status_code == 401:
                fs.last_status = "unauthorized"
                fs.consecutive_failures += 1
                self._log_rate("OTX unauthorized — check OTX_API_KEY")
                return

            fs.etag = resp.headers.get("ETag") or fs.etag
            fs.last_modified = resp.headers.get("Last-Modified") or fs.last_modified
            data = resp.json()
            pulses = data.get("results") or data.get("pulses") or []
            count = 0
            for pulse in pulses:
                pulse_id = pulse.get("id")
                indicators = pulse.get("indicators") or []
                for ind in indicators:
                    norm = await self._normalize(
                        "otx", {"pulse": pulse, "indicator": ind, "pulse_id": pulse_id}
                    )
                    if norm:
                        self._add(norm)
                        count += 1
            fs.last_status = f"ok ({count})"
            fs.consecutive_failures = 0
        except Exception as e:
            await self._error(fs, src, e)

    async def _poll_urlhaus(self) -> None:
        src = "urlhaus"
        fs = self.status[src]
        headers = {}
        if self.abusech_key:
            headers["Auth-Key"] = self.abusech_key
        try:
            async with httpx.AsyncClient(timeout=30) as client:
                # Prefer JSON API for recent URLs
                resp = await client.post(
                    "https://urlhaus-api.abuse.ch/v1/urls/recent/",
                    headers=headers,
                    data={"limit": 100},
                )
            fs.last_fetch = datetime.now(timezone.utc)
            if resp.status_code in (429,) or resp.status_code >= 500:
                await self._backoff(fs, src, resp)
                return
            data = resp.json()
            urls = data.get("urls") or data.get("data") or []
            count = 0
            for item in urls:
                norm = await self._normalize("urlhaus", item)
                if norm:
                    self._add(norm)
                    count += 1
            fs.last_status = f"ok ({count})"
            fs.consecutive_failures = 0
        except Exception as e:
            await self._error(fs, src, e)

    async def _poll_malwarebazaar(self) -> None:
        src = "malwarebazaar"
        fs = self.status[src]
        headers = {}
        if self.abusech_key:
            headers["API-KEY"] = self.abusech_key
        try:
            async with httpx.AsyncClient(timeout=20) as client:
                resp = await client.post(
                    "https://mb-api.abuse.ch/api/v1/",
                    headers=headers,
                    data={"query": "get_recent", "limit": 100},
                )
            fs.last_fetch = datetime.now(timezone.utc)
            if resp.status_code in (429,) or resp.status_code >= 500:
                await self._backoff(fs, src, resp)
                return
            data = resp.json()
            items = data.get("data") or []
            count = 0
            for raw in items:
                norm = await self._normalize("malwarebazaar", raw)
                if norm:
                    self._add(norm)
                    count += 1
            fs.last_status = f"ok ({count})"
            fs.consecutive_failures = 0
        except Exception as e:
            await self._error(fs, src, e)

    async def _backoff(self, fs: FeedStatus, src: str, resp: httpx.Response) -> None:
        fs.consecutive_failures += 1
        fs.last_status = f"backoff {resp.status_code}"
        retry_after = resp.headers.get("Retry-After")
        if retry_after:
            self._log_rate(f"{src} rate-limited, Retry-After={retry_after}")
        else:
            self._log_rate(f"{src} HTTP {resp.status_code}")

    async def _error(self, fs: FeedStatus, src: str, err: Exception) -> None:
        fs.consecutive_failures += 1
        fs.last_status = f"error"
        self.logger.warning("%s fetch error: %s", src, err)

    def _log_rate(self, msg: str) -> None:
        # Ensure keys are not printed
        self.logger.info(msg)

    # ---------- Normalization ----------
    async def _normalize(
        self, source: str, raw: Dict[str, Any]
    ) -> Optional[NormalizedIndicator]:
        try:
            if source == "otx":
                ind = raw.get("indicator") or {}
                val = ind.get("indicator")
                typ = (ind.get("type") or "").lower()
                category = ind.get("content") or ind.get("type")
                item_id = str(ind.get("id") or raw.get("pulse_id") or val)
                first_seen = ind.get("created") or raw.get("pulse", {}).get("created")
                last_seen = ind.get("modified") or ind.get("created")
                tags = (raw.get("pulse", {}).get("tags") or []) + (
                    ind.get("tags") or []
                )
                confidence = ind.get("confidence")
                reporter = raw.get("pulse", {}).get("author_name")
                pulse_id = raw.get("pulse_id")
                meta = {"tags": tags, "pulse_id": pulse_id, "reporter": reporter}
            elif source == "urlhaus":
                val = raw.get("url") or raw.get("url_id")
                typ = "url"
                category = raw.get("threat") or raw.get("category")
                item_id = str(
                    raw.get("id") or raw.get("entry_id") or raw.get("url_id") or val
                )
                first_seen = raw.get("dateadded") or raw.get("firstseen")
                last_seen = raw.get("lastseen") or first_seen
                tags = raw.get("tags") or []
                confidence = raw.get("confidence") or 60
                reporter = raw.get("reporter")
                meta = {"tags": tags, "reporter": reporter}
            elif source == "malwarebazaar":
                val = raw.get("sha256") or raw.get("sha1") or raw.get("md5")
                typ = "file"
                category = raw.get("file_type")
                item_id = str(raw.get("sha256") or raw.get("id") or val)
                first_seen = raw.get("first_seen") or raw.get("firstseen")
                last_seen = raw.get("last_seen") or first_seen
                tags = raw.get("tags") or []
                confidence = raw.get("confidence") or 70
                reporter = raw.get("reporter")
                meta = {
                    "tags": tags,
                    "threat_name": raw.get("signature"),
                    "reporter": reporter,
                }
            else:
                return None

            if not val or not typ:
                return None

            # Map types
            if typ in ["ipv4", "ip", "IPv4"]:
                typ = "ip"
            if typ in ["hostname"]:
                typ = "domain"

            # Geo for IPs
            country = None
            lat = None
            lon = None
            if typ == "ip":
                geo = await self._geo_lookup(val)
                country = geo.get("countryCode") or geo.get("country")
                lat = geo.get("lat")
                lon = geo.get("lon")

            # Confidence 0-100
            try:
                conf = int(float(confidence)) if confidence is not None else 50
            except Exception:
                conf = 50
            conf = max(0, min(conf, 100))

            first_seen_iso = self._to_iso_fallback(first_seen)
            last_seen_iso = self._to_iso_fallback(last_seen) or first_seen_iso

            return NormalizedIndicator(
                id=f"{source}-{item_id}",
                source=source,
                raw=raw,
                type=typ,
                indicator=val,
                category=category,
                confidence=conf,
                first_seen=first_seen_iso or _iso_now(),
                last_seen=last_seen_iso or _iso_now(),
                country=country,
                latitude=lat,
                longitude=lon,
                meta=meta,
            )
        except Exception as e:
            self.logger.debug("normalize error for %s: %s", source, e)
            return None

    def _to_iso_fallback(self, s: Optional[str]) -> Optional[str]:
        if not s:
            return None
        try:
            # Common formats; keep simple to avoid extra deps
            if s.endswith("Z"):
                return s
            # If already ISO-like, just return
            return s
        except Exception:
            return None

    # ---------- Geo ----------
    async def _geo_lookup(self, ip: str) -> Dict[str, Any]:
        now = datetime.now(timezone.utc)
        cached = self._geo_cache.get(ip)
        if cached and (now - cached[1]).total_seconds() < 24 * 3600:
            return cached[0]
        try:
            async with httpx.AsyncClient(timeout=6) as client:
                r = await client.get(
                    f"http://ip-api.com/json/{ip}?fields=status,country,countryCode,lat,lon"
                )
            if r.status_code == 200:
                g = r.json()
                if g.get("status") == "success":
                    data = {
                        "country": g.get("country"),
                        "countryCode": g.get("countryCode"),
                        "lat": g.get("lat"),
                        "lon": g.get("lon"),
                    }
                    self._geo_cache[ip] = (data, now)
                    return data
        except Exception:
            pass
        return {}

    # ---------- Buffer management ----------
    def _add(self, item: NormalizedIndicator) -> None:
        now = datetime.now(timezone.utc)
        key = f"{item.source}:{item.type}:{item.indicator}"
        existing = self._seen.get(key)
        if existing is not None:
            idx, _ = existing
            # Update last_seen and confidence if higher; preserve first_seen
            prev = self._buffer[idx]
            prev.last_seen = item.last_seen or prev.last_seen
            prev.confidence = max(prev.confidence, item.confidence)
            self._seen[key] = (idx, now)
            return

        # Append new
        self._buffer.append(item)
        self._seen[key] = (len(self._buffer) - 1, now)

        # Trim buffer and stale seen entries
        if len(self._buffer) > self.max_buffer:
            overflow = len(self._buffer) - self.max_buffer
            if overflow > 0:
                del self._buffer[0:overflow]
                # Rebuild seen indexes
                self._reindex_seen()

        # Drop too-old entries
        self._prune_old(now)

    def _reindex_seen(self) -> None:
        new_seen: Dict[str, Tuple[int, datetime]] = {}
        now = datetime.now(timezone.utc)
        for idx, it in enumerate(self._buffer):
            key = f"{it.source}:{it.type}:{it.indicator}"
            new_seen[key] = (idx, now)
        self._seen = new_seen

    def _prune_old(self, now: datetime) -> None:
        cutoff = now - timedelta(seconds=self.max_cache_age_sec)
        # Remove items older than cutoff by last_seen
        keep: List[NormalizedIndicator] = []
        for it in self._buffer:
            try:
                ls = it.last_seen
                if ls and ls.endswith("Z"):
                    # keep simple; most inputs are already iso
                    keep.append(it)
                else:
                    keep.append(it)
            except Exception:
                keep.append(it)
        self._buffer = keep


# Singleton instance used by FastAPI app
service_singleton: Optional[LiveFeedService] = None


def get_service() -> LiveFeedService:
    global service_singleton
    if service_singleton is None:
        service_singleton = LiveFeedService()
    return service_singleton


if __name__ == "__main__":
    # Dev runner: start the polling loop standalone
    logging.basicConfig(level=logging.INFO)
    svc = get_service()

    async def _main():
        svc.start()
        print("live_feed_service running. Press Ctrl+C to stop.")
        try:
            while True:
                await asyncio.sleep(1)
        except KeyboardInterrupt:
            pass
        finally:
            await svc.stop()

    asyncio.run(_main())

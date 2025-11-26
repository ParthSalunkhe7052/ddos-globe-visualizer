import asyncio
import logging
import random
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional

from backend.config.settings import FEED_INTERVALS
from backend.services.websocket_manager import live_manager
from backend.utils.common import iso_now

logger = logging.getLogger(__name__)

# Queues and indexes
EventQueue: asyncio.Queue = asyncio.Queue(maxsize=1000)
RecentIndex: Dict[str, datetime] = {}
RecentIocFeeds: Dict[str, List[Dict[str, Any]]] = {}
FeedBackoff: Dict[str, Dict[str, Any]] = {}
FeedStatus: Dict[str, str] = {}
Counters: Dict[str, int] = {
    "events_received": 0,
    "events_emitted": 0,
    "events_dropped": 0,
}

# Collapse aggregation by masked source (30s window)
CollapseIndex: Dict[str, Dict[str, Any]] = {}


def _now() -> datetime:
    return datetime.utcnow()


def _exp_backoff(feed: str, base: int) -> int:
    state = FeedBackoff.setdefault(feed, {"retries": 0, "until": None, "delay": base})
    retries = state["retries"] = min(state["retries"] + 1, 7)
    delay = min(base * (2 ** (retries - 1)), 600)
    state["delay"] = delay
    state["until"] = _now() + timedelta(seconds=delay)
    FeedStatus[feed] = "backoff"
    return delay


def _reset_backoff(feed: str):
    FeedBackoff[feed] = {
        "retries": 0,
        "until": None,
        "delay": FEED_INTERVALS.get(feed, 60),
    }
    FeedStatus[feed] = "ok"


def _masked_ip(ip: str) -> str:
    try:
        parts = ip.split(".")
        if len(parts) == 4:
            return ".".join(parts[:3] + ["*"])
    except Exception:
        pass
    return ip


def _headline(event: Dict[str, Any]) -> str:
    ioc = event.get("ioc", "")
    ioc_type = event.get("ioc_type", "")
    feed = event.get("feed", "")
    tags = ",".join(event.get("tags", []) or [])
    conf_pct = int(round((event.get("confidence", 0.0) or 0.0) * 100))
    enrich = event.get("enrich") or {}
    country = enrich.get("country", "?")
    city = enrich.get("city", "?")
    isp = enrich.get("isp", "?")
    ioc_short = _masked_ip(ioc) if ioc_type == "ip" else ioc
    # Default template
    return f"⚡ Attack detected — {city}, {country} → demo-target · Confidence {conf_pct}%, Source: {feed}, IOC: {ioc_short}"


def _confidence(base: float, event: Dict[str, Any]) -> float:
    ioc = event["ioc"]
    feed = event["feed"]
    ioc_type = event["ioc_type"]
    extra = []

    # Cross-feed within 60s → 0.9
    recent = RecentIocFeeds.get(ioc, [])
    cutoff = _now() - timedelta(seconds=60)
    recent = [r for r in recent if r["time"] >= cutoff]
    RecentIocFeeds[ioc] = recent
    feeds_recent = {r["feed"] for r in recent}
    if len(feeds_recent) >= 2 or (len(feeds_recent) == 1 and feed not in feeds_recent):
        extra.append(0.9)

    # ThreatFox C2/Botnet
    if feed == "threatfox" and any(
        t in (event.get("tags") or []) for t in ["c2", "botnet", "c2_server"]
    ):
        extra.append(0.85)

    # URLhaus URLs
    if feed == "urlhaus" and ioc_type == "url":
        extra.append(0.7)

    if not extra:
        extra.append(0.5)

    conf = sum([base] + extra) / (1 + len(extra))
    return max(0.0, min(conf, 1.0))


def _normalize(feed: str, raw: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    try:
        if feed == "threatfox":
            ioc_type = (raw.get("ioc_type") or raw.get("type") or "").lower()
            ioc = raw.get("ioc") or raw.get("value")
            item_id = str(raw.get("id") or raw.get("_id") or ioc)
            tags = raw.get("tags") or raw.get("malware") or []
            sev = raw.get("confidence_level") or raw.get("confidence")
        elif feed == "urlhaus":
            ioc_type = "url"
            ioc = raw.get("url")
            item_id = str(raw.get("id") or raw.get("entry_id") or ioc)
            tags = raw.get("tags") or []
            sev = raw.get("threat") or raw.get("confidence")
        elif feed == "malwarebazaar":
            ioc_type = "hash"
            ioc = raw.get("sha256") or raw.get("sha1") or raw.get("md5")
            item_id = str(raw.get("sha256") or raw.get("id") or ioc)
            tags = raw.get("tags") or raw.get("file_type") or []
            sev = raw.get("confidence")
        elif feed == "otx":
            ind = raw.get("indicator") or {}
            ioc = ind.get("indicator") or raw.get("indicator")
            ioc_type = (ind.get("type") or raw.get("type") or "").lower()
            item_id = str(raw.get("pulse_id") or raw.get("id") or ioc)
            tags = raw.get("tags") or ind.get("tags") or []
            sev = raw.get("confidence") or ind.get("confidence")
        else:
            return None

        if not ioc or not ioc_type:
            return None

        # Map OTX types
        if ioc_type in ["domain", "hostname"]:
            ioc_type = "domain"
        if ioc_type in ["IPv4", "ip", "ipv4"]:
            ioc_type = "ip"

        base = 0.5
        if isinstance(sev, (int, float)):
            sev_norm = max(
                0.0, min(float(sev) / (100.0 if sev > 1 else 1.0), 1.0)
            )
            base = (base + sev_norm) / 2.0

        event = {
            "id": f"{feed}-{item_id}",
            "seen_at": iso_now(),
            "feed": feed,
            "ioc_type": ioc_type,
            "ioc": ioc,
            "src_ip": ioc if ioc_type == "ip" else None,
            "tags": tags if isinstance(tags, list) else [tags] if tags else [],
            "confidence": 0.0,  # set below
            "meta": {"original": raw},
            "enrich": {},
            "headline": "",
        }

        # Track recent feeds per IOC
        RecentIocFeeds.setdefault(ioc, []).append({"feed": feed, "time": _now()})

        event["confidence"] = _confidence(base, event)
        event["headline"] = _headline(event)
        return event
    except Exception as e:
        logger.warning(f"Normalize error for feed {feed}: {e}")
        return None


def _should_emit(event_id: str) -> bool:
    # Deduplicate window 60s
    cutoff = _now() - timedelta(seconds=60)
    for eid in list(RecentIndex.keys()):
        if RecentIndex[eid] < cutoff:
            RecentIndex.pop(eid, None)
    if event_id in RecentIndex:
        return False
    RecentIndex[event_id] = _now()
    return True


async def _enqueue(event: Dict[str, Any]):
    Counters["events_received"] += 1
    if not _should_emit(event["id"]):
        Counters["events_dropped"] += 1
        return
    try:
        EventQueue.put_nowait(event)
        # Update collapse index for IP sources
        if event.get("ioc_type") == "ip":
            key = _masked_ip(event.get("ioc", ""))
            if key:
                item = CollapseIndex.setdefault(
                    key, {"count": 0, "since": _now(), "last": _now(), "sample": event}
                )
                item["count"] += 1
                item["last"] = _now()
    except asyncio.QueueFull:
        Counters["events_dropped"] += 1


async def _emit_status(feed: str, status: str, message: str = ""):
    payload = {"kind": "status", "feed": feed, "status": status, "message": message}
    await live_manager.broadcast(payload)


async def _dispatcher_loop():
    while True:
        try:
            event = await EventQueue.get()
            payload = {"kind": "attack", "event": event}
            await live_manager.broadcast(payload)
            Counters["events_emitted"] += 1
            # Pace: 1–3 events/sec with 1–8s jitter
            base_delay = random.uniform(0.33, 1.0)
            jitter = random.uniform(1.0, 8.0) if random.random() < 0.2 else 0.0
            await asyncio.sleep(base_delay + jitter)
        except Exception as e:
            logger.warning(f"Dispatcher error: {e}")
            await asyncio.sleep(1)


async def _collapse_loop():
    # Periodically emit collapsed summaries and prune old entries
    while True:
        try:
            now_ts = _now()
            cutoff = now_ts - timedelta(seconds=30)
            keys_to_delete = []
            for key, item in list(CollapseIndex.items()):
                # If recent activity in window, emit and reset
                if (
                    item.get("last")
                    and item["last"] >= cutoff
                    and item.get("count", 0) >= 5
                ):
                    sample = item.get("sample") or {}

                    headline = (
                        f"10+ similar events from {key} in 30s"
                        if item["count"] >= 10
                        else f"{item['count']} similar events from {key} " f"in 30s"
                    )
                    since_dt = item.get("since") or now_ts
                    payload = {
                        "kind": "collapse",
                        "ioc": key,
                        "count": item["count"],
                        "since": since_dt.replace(
                            microsecond=0
                        ).isoformat()
                        + "Z",
                        "headline": headline,
                    }
                    await live_manager.broadcast(payload)
                    # reset counter but keep window
                    CollapseIndex[key] = {
                        "count": 0,
                        "since": now_ts,
                        "last": now_ts,
                        "sample": sample,
                    }
                # prune old
                if item.get("last") and item["last"] < cutoff:
                    keys_to_delete.append(key)
            for k in keys_to_delete:
                CollapseIndex.pop(k, None)
        except Exception as e:
            logger.debug(f"Collapse loop error: {e}")
        finally:
            await asyncio.sleep(5)

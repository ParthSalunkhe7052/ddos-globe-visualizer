import asyncio
import logging

import httpx

from backend.config.settings import FEED_INTERVALS, OTX_API_KEY
from backend.services.live_feed_processor import (FeedBackoff, _collapse_loop,
                                                  _dispatcher_loop,
                                                  _emit_status, _enqueue,
                                                  _exp_backoff, _normalize,
                                                  _now, _reset_backoff)

logger = logging.getLogger(__name__)


async def _poll_threatfox():
    feed = "threatfox"
    base = FEED_INTERVALS[feed]
    _reset_backoff(feed)
    while True:
        try:
            # Respect backoff window
            until = FeedBackoff.get(feed, {}).get("until")
            if until and _now() < until:
                await asyncio.sleep(1)
                continue
            async with httpx.AsyncClient(timeout=15) as client:
                # ThreatFox API: recent IOCs
                resp = await client.post(
                    "https://threatfox.abuse.ch/api/v1/",
                    json={"query": "recent_iocs"},
                )
            if resp.status_code >= 500 or resp.status_code in (429,):
                delay = _exp_backoff(feed, base)
                await _emit_status(
                    feed, "backoff", f"HTTP {resp.status_code}; sleeping {delay}s"
                )
            else:
                data = resp.json()
                _reset_backoff(feed)
                await _emit_status(feed, "ok", "fetched")
                items = data.get("data") or data.get("ioc") or []
                for raw in items:
                    ev = _normalize(feed, raw)
                    if ev:
                        await _enqueue(ev)
            await asyncio.sleep(base)
        except Exception as e:
            delay = _exp_backoff(feed, base)
            await _emit_status(feed, "backoff", f"error: {e}; sleeping {delay}s")
            await asyncio.sleep(delay)


async def _poll_urlhaus():
    feed = "urlhaus"
    base = FEED_INTERVALS[feed]
    _reset_backoff(feed)
    while True:
        try:
            until = FeedBackoff.get(feed, {}).get("until")
            if until and _now() < until:
                await asyncio.sleep(1)
                continue
            async with httpx.AsyncClient(timeout=30) as client:
                resp = await client.get("https://urlhaus.abuse.ch/downloads/csv/")
            if resp.status_code >= 500 or resp.status_code in (429,):
                delay = _exp_backoff(feed, base)
                await _emit_status(
                    feed, "backoff", f"HTTP {resp.status_code}; sleeping {delay}s"
                )
            else:
                _reset_backoff(feed)
                await _emit_status(feed, "ok", "fetched")
                text = resp.text
                lines = [
                    ln for ln in text.splitlines() if ln and not ln.startswith("#")
                ]
                for ln in lines[:500]:  # limit per cycle
                    parts = ln.split(",")
                    if len(parts) < 3:
                        continue
                    entry_id = parts[0].strip()
                    url = parts[2].strip()
                    raw = {"id": entry_id, "url": url, "tags": []}
                    ev = _normalize(feed, raw)
                    if ev:
                        await _enqueue(ev)
            await asyncio.sleep(base)
        except Exception as e:
            delay = _exp_backoff(feed, base)
            await _emit_status(feed, "backoff", f"error: {e}; sleeping {delay}s")
            await asyncio.sleep(delay)


async def _poll_malwarebazaar():
    feed = "malwarebazaar"
    base = FEED_INTERVALS[feed]
    _reset_backoff(feed)
    while True:
        try:
            until = FeedBackoff.get(feed, {}).get("until")
            if until and _now() < until:
                await asyncio.sleep(1)
                continue
            async with httpx.AsyncClient(timeout=20) as client:
                resp = await client.post(
                    "https://mb-api.abuse.ch/api/v1/",
                    data={"query": "get_recent", "limit": 100},
                )
            if resp.status_code >= 500 or resp.status_code in (429,):
                delay = _exp_backoff(feed, base)
                await _emit_status(
                    feed, "backoff", f"HTTP {resp.status_code}; sleeping {delay}s"
                )
            else:
                data = resp.json()
                _reset_backoff(feed)
                await _emit_status(feed, "ok", "fetched")
                items = data.get("data") or []
                for raw in items:
                    ev = _normalize(feed, raw)
                    if ev:
                        await _enqueue(ev)
            await asyncio.sleep(base)
        except Exception as e:
            delay = _exp_backoff(feed, base)
            await _emit_status(feed, "backoff", f"error: {e}; sleeping {delay}s")
            await asyncio.sleep(delay)


async def _poll_otx():
    feed = "otx"
    base = FEED_INTERVALS[feed]
    _reset_backoff(feed)
    if not OTX_API_KEY:
        logger.info("OTX_API_KEY not set; OTX feed disabled")
        return
    headers = {"X-OTX-API-KEY": OTX_API_KEY}
    while True:
        try:
            until = FeedBackoff.get(feed, {}).get("until")
            if until and _now() < until:
                await asyncio.sleep(1)
                continue
            async with httpx.AsyncClient(timeout=20, headers=headers) as client:
                resp = await client.get(
                    "https://otx.alienvault.com/api/v1/pulses/subscribed"
                )
            if resp.status_code >= 500 or resp.status_code in (429,):
                delay = _exp_backoff(feed, base)
                await _emit_status(
                    feed, "backoff", f"HTTP {resp.status_code}; sleeping {delay}s"
                )
            elif resp.status_code == 401:
                await _emit_status(feed, "backoff", "Unauthorized; check OTX_API_KEY")
                await asyncio.sleep(base)
            else:
                data = resp.json()
                _reset_backoff(feed)
                await _emit_status(feed, "ok", "fetched")
                pulses = data.get("results") or data.get("pulses") or []
                for p in pulses:
                    pulse_id = p.get("id")
                    indicators = p.get("indicators") or []
                    for ind in indicators:
                        raw = {
                            "pulse_id": pulse_id,
                            "indicator": ind,
                            "tags": p.get("tags"),
                        }
                        ev = _normalize(feed, raw)
                        if ev:
                            await _enqueue(ev)
            await asyncio.sleep(base)
        except Exception as e:
            delay = _exp_backoff(feed, base)
            await _emit_status(feed, "backoff", f"error: {e}; sleeping {delay}s")
            await asyncio.sleep(delay)


# Startup to launch background tasks
async def _start_live_mode_tasks():
    try:
        asyncio.create_task(_dispatcher_loop())
        asyncio.create_task(_collapse_loop())
        asyncio.create_task(_poll_threatfox())
        asyncio.create_task(_poll_urlhaus())
        asyncio.create_task(_poll_malwarebazaar())
        asyncio.create_task(_poll_otx())
        logger.info("Attack Live Mode tasks started")
    except Exception as e:
        logger.error(f"Failed to start Live Mode tasks: {e}")

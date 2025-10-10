// Simple in-memory cache for session
const cache = new Map();
export function setCache(key, value, ttlMs = 600000) {
  // Don't cache live feed data if live mode is off
  if (key === "live_feed" && !window.__liveModeEnabled) {
    return;
  }
  cache.set(key, { value, expires: Date.now() + ttlMs });
}
export function getCache(key) {
  // Don't return cached live feed data if live mode is off
  if (key === "live_feed" && !window.__liveModeEnabled) {
    return undefined;
  }
  const entry = cache.get(key);
  if (!entry) return undefined;
  if (Date.now() > entry.expires) {
    cache.delete(key);
    return undefined;
  }
  return entry.value;
}

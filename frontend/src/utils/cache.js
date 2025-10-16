// Simple in-memory cache for session
const cache = new Map();
export function setCache(key, value, ttlMs = 600000) {
  cache.set(key, { value, expires: Date.now() + ttlMs });
}
export function getCache(key) {
  const entry = cache.get(key);
  if (!entry) return undefined;
  if (Date.now() > entry.expires) {
    cache.delete(key);
    return undefined;
  }
  return entry.value;
}

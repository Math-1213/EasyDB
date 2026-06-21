// umlCache.js
let cache = null;
let cachedDb = null;

export function getCache(currentDb) {
  if (cachedDb === currentDb && cache) return cache;
  return null;
}

export function setCache(currentDb, data) {
  cachedDb = currentDb;
  cache = data;
}

export function clearCache() {
  cache = null;
  cachedDb = null;
}

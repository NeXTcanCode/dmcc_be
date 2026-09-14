const CACHE_TTL_MS = 5 * 60 * 1000;
const cache = new Map();

const BASE_URL = 'https://dmrc-rest-api.vercel.app';

// Thin proxy over the public dmrc-rest-api (github.com/tashifkhan/delhi-metro),
// which sends no CORS headers, so the frontend can't call it directly.
// Throws on failure - callers (routes) decide how to surface that to the client.
export const fetchMetroApi = async (path, { cacheable = true } = {}) => {
  const cacheKey = path;
  if (cacheable) {
    const cached = cache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) return cached.data;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);

  try {
    const response = await fetch(`${BASE_URL}${path}`, { signal: controller.signal });
    if (!response.ok) {
      const error = new Error(`Upstream metro API returned ${response.status}`);
      error.status = response.status;
      throw error;
    }
    const data = await response.json();
    if (cacheable) cache.set(cacheKey, { data, expiresAt: Date.now() + CACHE_TTL_MS });
    return data;
  } finally {
    clearTimeout(timer);
  }
};

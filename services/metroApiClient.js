const CACHE_TTL_MS = 5 * 60 * 1000;
const cache = new Map();

// Live official DMRC backend (what github.com/tashifkhan/delhi-metro wraps).
// The previous target, dmrc-rest-api.vercel.app, was a disabled public mirror
// (HTTP 402 DEPLOYMENT_DISABLED). This official origin is the source of truth
// and also carries the rich facility data (gates, lifts, timings, phones).
const BASE_URL = 'https://backend.delhimetrorail.com/api/v2/en';

// The upstream serves content to the official site; send its origin + referer.
const HEADERS = {
  'Origin': 'https://delhimetrorail.com',
  'Referer': 'https://delhimetrorail.com/',
  'Accept': 'application/json',
};

export const fetchMetroApi = async (path, { cacheable = true } = {}) => {
  const cacheKey = path;
  if (cacheable) {
    const cached = cache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) return cached.data;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);

  try {
    const response = await fetch(`${BASE_URL}${path}`, {
      signal: controller.signal,
      headers: HEADERS,
    });
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
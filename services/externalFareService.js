import { DMRC_STATION_CODES } from '../data/dmrcStationCodes.js';
import { calculateDMRCFare, isConcessionDay } from './fareCalculator.js';

const CACHE_TTL_MS = 10 * 60 * 1000;
const cache = new Map();

export const getStationCode = (stationName) => DMRC_STATION_CODES[stationName] || null;

// Returns { weekdayFare, weekendFare } or null if unavailable for any reason. Never throws.
export const fetchExternalFare = async (fromCode, toCode) => {
  if (process.env.EXTERNAL_FARE_API_ENABLED !== 'true') return null;

  const cacheKey = `${fromCode}|${toCode}`;
  const cached = cache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.data;

  const baseUrl = process.env.EXTERNAL_FARE_API_URL;
  if (!baseUrl) return null;

  const timeoutMs = Number(process.env.EXTERNAL_FARE_API_TIMEOUT_MS) || 3000;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const url = `${baseUrl}?from_station_code=${encodeURIComponent(fromCode)}&to_station_code=${encodeURIComponent(toCode)}&strategy=least-distance`;
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) return null;

    const body = await response.json();
    if (typeof body.weekday_fare !== 'number' || typeof body.weekend_fare !== 'number') return null;

    const data = { weekdayFare: body.weekday_fare, weekendFare: body.weekend_fare };
    cache.set(cacheKey, { data, expiresAt: Date.now() + CACHE_TTL_MS });
    return data;
  } catch (error) {
    return null;
  } finally {
    clearTimeout(timer);
  }
};

// Combines external + local: returns { fare, source: 'external' | 'local' }
export const resolveFare = async ({ fromStationName, toStationName, distanceKm, travelDate, isSmartCard }) => {
  const localFare = () => ({ fare: calculateDMRCFare(distanceKm, travelDate, isSmartCard), source: 'local' });

  const fromCode = getStationCode(fromStationName);
  const toCode = getStationCode(toStationName);
  if (!fromCode || !toCode) return localFare();

  const external = await fetchExternalFare(fromCode, toCode);
  if (!external) return localFare();

  const fare = isConcessionDay(travelDate) ? external.weekendFare : external.weekdayFare;
  return { fare, source: 'external' };
};

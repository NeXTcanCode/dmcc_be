import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.js';
import { fetchMetroApi } from '../services/metroApiClient.js';
import {
  fallbackLines,
  fallbackLineStations,
  fallbackStationDetail,
  fallbackStationSearch,
  fallbackMapData,
} from '../services/metroSnapshot.js';
import { planOfflineJourney } from '../services/metroJourneyPlanner.js';

const router = Router();
router.use(authMiddleware);

// Hybrid data access: prefer the live official DMRC API
// (backend.delhimetrorail.com/api/v2/en — tashifkhan/delhi-metro upstream).
// If it's ever unreachable, fall back to the local snapshot captured by
// services/buildMetroSnapshot.js so the app keeps working offline.

const proxyWithFallback = (buildPath, fallback) => async (req, res) => {
  try {
    const data = await fetchMetroApi(buildPath(req));
    return res.json(data);
  } catch (error) {
    const fb = fallback(req);
    if (fb === null) return res.status(502).json({ message: 'Could not reach metro data source', detail: error.message });
    return res.json(fb);
  }
};

router.get('/lines', proxyWithFallback(
  () => '/line_list',
  () => fallbackLines()
));

router.get('/lines/:lineCode/stations', proxyWithFallback(
  (req) => `/station_by_line/${encodeURIComponent(req.params.lineCode)}`,
  (req) => fallbackLineStations(req.params.lineCode)
));

router.get('/stations/search', proxyWithFallback(
  (req) => `/station_by_keyword/all/${encodeURIComponent(req.query.q || '')}`,
  (req) => fallbackStationSearch(req.query.q || '')
));

// Schematic map coordinates for every station, sourced only from the local
// snapshot (DMRC's own diagram x/y positions - geometry doesn't change, and
// there's no live bulk-coordinates endpoint to prefer over it).
router.get('/map', (req, res) => {
  const data = fallbackMapData();
  if (!data) return res.status(502).json({ message: 'Map data unavailable' });
  return res.json(data);
});

router.get('/stations/:code', proxyWithFallback(
  (req) => `/station/${encodeURIComponent(req.params.code)}`,
  (req) => {
    const detail = fallbackStationDetail(req.params.code);
    return detail || null; // null -> 502 (no snapshot for it)
  }
));

// Fare planning is combinatorial and not snapshot; it stays live-only.
// The fare flow (externalFareService) already falls back to local slab calc.
//
// Upstream's /new_fare_with_route shape (stations, weekday_fare/weekend_fare,
// route[{line, start, end, path, path_time}]) doesn't match what the
// frontend renders (station_count, fare.applicable/normal, legs[], total_distance_km),
// so it's normalized here rather than passed through raw.
router.get('/journeys/plan', async (req, res) => {
  const strategy = req.query.strategy === 'minimum-interchange'
    ? 'minimum-interchange' : 'least-distance';
  const from = req.query.from || '';
  const to = req.query.to || '';
  try {
    const [data, lines] = await Promise.all([
      fetchMetroApi(`/new_fare_with_route/${encodeURIComponent(from)}/${encodeURIComponent(to)}/${strategy}/`),
      fetchMetroApi('/line_list').catch(() => fallbackLines()),
    ]);

    const colorByLineLabel = Object.fromEntries(
      (lines || []).map((l) => [l.line_color, l.primary_color_code])
    );
    const route = Array.isArray(data.route) ? data.route : [];

    const legs = route.map((r) => ({
      line_name: r.line,
      line_color: colorByLineLabel[r.line] || '#2f6fd6',
      from_station: r.start,
      to_station: r.end,
      station_count: Array.isArray(r.path) ? r.path.length : undefined,
      duration: r.path_time,
    }));
    const interchanges = route.slice(0, -1).map((r) => ({ station: r.end }));

    const isSunday = new Date().getDay() === 0;
    const fare = {
      normal: data.weekday_fare,
      applicable: isSunday ? data.weekend_fare : data.weekday_fare,
    };

    // Upstream gives no distance figure; estimate from hop count the same
    // way the Dashboard's manual-entry fallback does (~1.2km/station).
    const stationCount = data.stations;
    const totalDistanceKm = Number.isFinite(stationCount)
      ? Math.max(1, Number(((stationCount - 1) * 1.2).toFixed(1)))
      : undefined;

    return res.json({
      ...data,
      station_count: stationCount,
      total_distance_km: totalDistanceKm,
      fare,
      legs,
      interchanges,
    });
  } catch (error) {
    // Offline fallback: reconstruct the journey from the local snapshot.
    const offline = planOfflineJourney({ fromCode: from, toCode: to, strategy });
    if (offline) return res.json(offline);
    return res.status(502).json({ message: 'Could not reach metro data source', detail: error.message });
  }
});

router.get('/notifications', async (req, res) => {
  try {
    const data = await fetchMetroApi('/passengers/notification/');
    return res.json(data);
  } catch (error) {
    return res.status(502).json({ message: 'Could not reach metro data source', detail: error.message });
  }
});

export default router;
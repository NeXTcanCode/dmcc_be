import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.js';
import { fetchMetroApi } from '../services/metroApiClient.js';
import {
  fallbackLines,
  fallbackLineStations,
  fallbackStationDetail,
  fallbackStationSearch,
} from '../services/metroSnapshot.js';

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

router.get('/stations/:code', proxyWithFallback(
  (req) => `/station/${encodeURIComponent(req.params.code)}`,
  (req) => {
    const detail = fallbackStationDetail(req.params.code);
    return detail || null; // null -> 502 (no snapshot for it)
  }
));

// Fare planning is combinatorial and not snapshot; it stays live-only.
// The fare flow (externalFareService) already falls back to local slab calc.
router.get('/journeys/plan', async (req, res) => {
  const strategy = req.query.strategy === 'minimum-interchange'
    ? 'minimum-interchange' : 'least-distance';
  const from = req.query.from || '';
  const to = req.query.to || '';
  try {
    const data = await fetchMetroApi(`/new_fare_with_route/${encodeURIComponent(from)}/${encodeURIComponent(to)}/${strategy}/`);
    return res.json(data);
  } catch (error) {
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
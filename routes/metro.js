import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.js';
import { fetchMetroApi } from '../services/metroApiClient.js';

const router = Router();
router.use(authMiddleware);

const proxy = (buildPath) => async (req, res) => {
  try {
    const data = await fetchMetroApi(buildPath(req));
    return res.json(data);
  } catch (error) {
    return res.status(502).json({ message: 'Could not reach metro data source', detail: error.message });
  }
};

// Live official DMRC backend (backend.delhimetrorail.com/api/v2/en).
// The previous mirror (dmrc-rest-api.vercel.app) was disabled. These paths
// mirror github.com/tashifkhan/delhi-metro's upstream calls and return the
// rich payloads the frontend expects (incl. gates, lifts, timings, phones).

router.get('/lines', proxy(() => '/line_list'));

router.get('/lines/:lineCode/stations', proxy((req) =>
  `/station_by_line/${encodeURIComponent(req.params.lineCode)}`));

router.get('/stations/search', proxy((req) =>
  `/station_by_keyword/all/${encodeURIComponent(req.query.q || '')}`));

router.get('/stations/:code', proxy((req) =>
  `/station/${encodeURIComponent(req.params.code)}`));

// Reconstructed from the tashifkhan delhi-metro journey service — keeps the
// /journeys/plan route shape the frontend already calls.
router.get('/journeys/plan', proxy((req) => {
  const strategy = req.query.strategy === 'minimum-interchange'
    ? 'minimum-interchange' : 'least-distance';
  const from = req.query.from || '';
  const to = req.query.to || '';
  return `/new_fare_with_route/${encodeURIComponent(from)}/${encodeURIComponent(to)}/${strategy}/`;
}));

router.get('/notifications', proxy(() => '/passengers/notification/'));

export default router;
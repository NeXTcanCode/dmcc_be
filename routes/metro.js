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

router.get('/lines', proxy(() => '/api/v1/dmrc/lines'));

router.get('/lines/:lineCode/stations', proxy((req) => `/api/v1/dmrc/lines/${encodeURIComponent(req.params.lineCode)}/stations`));

router.get('/stations/search', proxy((req) => `/api/v1/dmrc/stations/search?q=${encodeURIComponent(req.query.q || '')}`));

router.get('/stations/:code', proxy((req) => `/api/v1/dmrc/stations/${encodeURIComponent(req.params.code)}`));

router.get('/journeys/plan', proxy((req) => {
  const params = new URLSearchParams({
    from_station_code: req.query.from || '',
    to_station_code: req.query.to || '',
    strategy: req.query.strategy || 'least-distance'
  });
  return `/api/v2/journeys/plan?${params.toString()}`;
}));

router.get('/notifications', proxy(() => '/api/v1/dmrc/notifications'));

export default router;

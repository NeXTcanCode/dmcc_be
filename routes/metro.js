import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.js';
import { METRO_LINES, STATIONS_BY_LINE, ALL_STATIONS } from '../data/metroLocal.js';
import { fetchMetroApi } from '../services/metroApiClient.js';

const router = Router();
router.use(authMiddleware);

// Local, offline network data (all 11 DMRC lines + station order).
// Prior upstream https://dmrc-rest-api.vercel.app is dead (HTTP 402), so we
// serve from data/metroLocal.js instead. Zero external calls for these routes.

const findByCode = (code) => ALL_STATIONS.find((s) => s.station_code === code);

router.get('/lines', (req, res) => res.json(METRO_LINES));

router.get('/lines/:lineCode/stations', (req, res) => {
  const line = METRO_LINES.find((l) => l.line_code === req.params.lineCode) ||
               METRO_LINES.find((l) => l.id === req.params.lineCode);
  if (!line) return res.status(404).json({ message: 'Unknown line', line_code: req.params.lineCode });
  return res.json(STATIONS_BY_LINE[line.id] || []);
});

// Unused by the current frontend (master catalog is built from getLines +
// getLineStations), but kept for API parity.
router.get('/stations/search', (req, res) => {
  const q = (req.query.q || '').toLowerCase();
  if (!q) return res.json(ALL_STATIONS);
  return res.json(ALL_STATIONS.filter((s) =>
    s.station_name.toLowerCase().includes(q) || s.station_code.toLowerCase().includes(q)
  ));
});

router.get('/stations/:code', (req, res) => {
  const station = findByCode(req.params.code);
  if (!station) return res.status(404).json({ message: 'Unknown station', code: req.params.code });
  // Interchanges share a name across lines but carry a per-line station_code,
  // so join lines by name (e.g. Rajiv Chowk on both Yellow & Blue).
  const lineIds = METRO_LINES.filter((l) =>
    STATIONS_BY_LINE[l.id].some((s) => s.station_name === station.station_name)
  );
  return res.json({
    station_name: station.station_name,
    station_code: station.station_code,
    station_type: station.interchange ? 'interchange' : 'standard',
    interchange: station.interchange,
    metro_lines: lineIds.map((l) => ({
      id: l.id,
      line_code: l.line_code,
      line_color: l.line_color,
      primary_color_code: l.primary_color_code
    })),
    // Facility/contact fields aren't in local data — UI guards on these.
    station_facility: [],
    gates: [],
    lifts: [],
    parkings: []
  });
});

// NOTE: journeys/plan + notifications still proxy to the dead upstream and
// will 502 until a replacement source is wired up.
router.get('/journeys/plan', async (req, res) => {
  const params = new URLSearchParams({
    from_station_code: req.query.from || '',
    to_station_code: req.query.to || '',
    strategy: req.query.strategy || 'least-distance'
  });
  try {
    const data = await fetchMetroApi(`/api/v2/journeys/plan?${params.toString()}`);
    return res.json(data);
  } catch (error) {
    return res.status(502).json({ message: 'Could not reach metro data source', detail: error.message });
  }
});

router.get('/notifications', async (req, res) => {
  try {
    const data = await fetchMetroApi('/api/v1/dmrc/notifications');
    return res.json(data);
  } catch (error) {
    return res.status(502).json({ message: 'Could not reach metro data source', detail: error.message });
  }
});

export default router;
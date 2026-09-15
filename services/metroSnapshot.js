// Lazy in-memory loader for the offline metro snapshot (data/metroSnapshot.json).
// Serves as the fallback when the live DMRC API is unreachable.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

let snapshot = null;
let loadError = null;

const load = () => {
  if (snapshot !== null || loadError) return;
  try {
    const here = new URL('.', import.meta.url);
    const path = fileURLToPath(new URL('../data/metroSnapshot.json', here));
    snapshot = JSON.parse(readFileSync(path, 'utf8'));
  } catch (e) {
    loadError = e;
  }
};

// Grabs a file that may be a path (process-safe). Falls back to empty.
export const fallbackLines = () => { load(); return snapshot?.lines || []; };

export const fallbackLineStations = (lineCode) => {
  load();
  return snapshot?.stationsByLine?.[lineCode] || [];
};

export const fallbackStationDetail = (code) => {
  load();
  return snapshot?.stations?.[code] || null;
};

export const fallbackStationSearch = (q) => {
  load();
  const map = snapshot?.stations || {};
  const needle = (q || '').toLowerCase();
  const out = [];
  for (const c in map) {
    const s = map[c];
    if (!needle || s.station_name?.toLowerCase().includes(needle) || c.toLowerCase().includes(needle)) {
      out.push(validateSearch(s));
    }
    if (out.length >= 100) break;
  }
  return out;
};

// Keep the search result slim like the live endpoint.
const validateSearch = (s) => ({
  id: s.id,
  station_name: s.station_name,
  station_code: s.station_code,
  station_facility: s.station_facility || [],
  latitude: s.latitude,
  longitude: s.longitude,
  metro_lines: s.metro_lines || [],
});
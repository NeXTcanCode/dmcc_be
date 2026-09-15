// One-shot snapshot builder: pulls the live DMRC network (lines, per-line
// station order, and full station details) and writes data/metroSnapshot.json.
// Run after network data changes:  node services/buildMetroSnapshot.js
import { writeFileSync } from 'node:fs';
import { fetchMetroApi } from './metroApiClient.js';

const snapshot = { capturedAt: new Date().toISOString(), lines: null, stationsByLine: {}, stations: {} };

try {
  const lines = await fetchMetroApi('/line_list', { cacheable: false });
  snapshot.lines = lines;
  console.log('lines:', lines.length);

  const codes = new Set();
  for (const line of lines) {
    const stations = await fetchMetroApi(`/station_by_line/${line.line_code}`, { cacheable: false });
    snapshot.stationsByLine[line.line_code] = stations;
    for (const s of stations) codes.add(s.station_code);
  }
  console.log('unique stations:', codes.size);

  let i = 0;
  for (const code of codes) {
    try {
      snapshot.stations[code] = await fetchMetroApi(`/station/${code}`, { cacheable: false });
    } catch { /* skip one bad station detail */ }
    process.stdout.write(`\rstations ${++i}/${codes.size}`);
  }

  const out = './data/metroSnapshot.json';
  writeFileSync(out, JSON.stringify(snapshot));
  console.log('\nwrote', out);
} catch (e) {
  console.error('ERR', e.message);
  process.exit(1);
}
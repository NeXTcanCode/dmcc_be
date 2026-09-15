// Offline DMRC journey planner. Reconstructs a route between two stations
// from the metro snapshot (data/metroSnapshot.json) when the live DMRC API is
// unreachable. Fares use the local slab calc (fareCalculator.js). Time/distance
// are estimated from station count — a close approximation of the live shape
// the frontend renders.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { calculateDMRCFare } from './fareCalculator.js';

let ready = false;
let NAME = new Map();       // code -> name
let LINES = new Map();      // lineCode -> { names:[...], color, name }
let LINES_OF = new Map();   // name -> [lineCode,...]   (upper name)
let INTER = new Set();      // names on >1 line
let POS = new Map();        // "lineCode|name" -> index

const AVG_STATION_KM = 1.2;
const MIN_PER_STATION = 2.5;

const load = () => {
  const path = fileURLToPath(new URL('../data/metroSnapshot.json', import.meta.url));
  return JSON.parse(readFileSync(path, 'utf8'));
};

const build = () => {
  if (ready) return;
  const s = load();
  for (const st of Object.values(s.stations)) NAME.set(st.station_code, st.station_name);

  const nameCount = new Map();
  for (const [lc, list] of Object.entries(s.stationsByLine)) {
    const names = list.map((x) => x.station_name);
    const first = s.stations[list[0]?.station_code];
    const meta = first?.metro_lines?.find((m) => m.line_code === lc) || {};
    LINES.set(lc, { names, color: meta.primary_color_code || lc, name: meta.line_color || lc });
    names.forEach((n, i) => {
      nameCount.set(n, (nameCount.get(n) || 0) + 1);
      POS.set(`${lc}|${n}`, i);
      if (!LINES_OF.has(n)) LINES_OF.set(n, []);
      LINES_OF.get(n).push(lc);
    });
  }
  for (const [n, c] of nameCount) if (c > 1) INTER.add(n);
  ready = true;
};

const codeName = (code) => (build(), NAME.get(code));
const pos = (lc, name) => (build(), POS.get(`${lc}|${name}`));

// Dijkstra over an interchange+endpoint graph. Vertices = from/to + all
// interchange stations; edges weight = station distance along a shared line.
// Reconstructs legs from consecutive vertex hops.
const route = (fromName, toName, minInterchange) => {
  build();
  if (fromName === toName) return { legs: [], stations: 1 };

  // Collect relevant vertices: from, to, and interchanges.
  const vertices = new Set([fromName, toName]);
  for (const nm of INTER) vertices.add(nm);
  const vert = [...vertices];

  // adjacency: name -> [{ to, line, w }]
  const adj = new Map();
  vert.forEach((v) => adj.set(v, []));
  for (const [lc, L] of LINES) {
    const names = L.names;
    const onLine = vert.filter((v) => names.includes(v)).map((v) => ({ v, p: names.indexOf(v) })).sort((a, b) => a.p - b.p);
    for (let i = 0; i < onLine.length; i++) {
      for (let j = i + 1; j < onLine.length; j++) {
        const a = onLine[i], b = onLine[j];
        const w = b.p - a.p;
        adj.get(a.v).push({ to: b.v, line: lc, w });
        adj.get(b.v).push({ to: a.v, line: lc, w });
      }
    }
  }

  // Dijkstra over a (primary, secondary) tuple cost, compared lexicographically.
  // least-distance: minimize stations, tie-break on fewer legs.
  // minimum-interchange: minimize legs, tie-break on stations.
  const dist = new Map(vert.map((v) => [v, Infinity]));
  const bestLegs = new Map(vert.map((v) => [v, Infinity]));
  const prev = new Map(); // name -> { via, line, legs }
  dist.set(fromName, 0);
  bestLegs.set(fromName, 0);
  const unvisited = new Set(vert);

  const tupleOf = (v) => (minInterchange ? [bestLegs.get(v), dist.get(v)] : [dist.get(v), bestLegs.get(v)]);
  const tupleLess = (a, b) => (a[0] !== b[0] ? a[0] < b[0] : a[1] < b[1]);

  while (unvisited.size) {
    let u = null;
    for (const v of unvisited) if (u === null || tupleLess(tupleOf(v), tupleOf(u))) u = v;
    if (dist.get(u) === Infinity) break;
    unvisited.delete(u);
    for (const e of adj.get(u)) {
      const score = dist.get(u) + e.w;
      const legsCount = (prev.get(u)?.legs || 0) + (prev.get(u)?.line === e.line ? 0 : 1);
      const better = tupleLess(
        minInterchange ? [legsCount, score] : [score, legsCount],
        tupleOf(e.to)
      );
      if (better) {
        dist.set(e.to, score);
        bestLegs.set(e.to, legsCount);
        prev.set(e.to, { via: u, line: e.line, legs: legsCount });
      }
    }
  }

  if (!prev.has(toName)) return null;

  // reconstruct vertex chain
  const chain = [];
  let cur = toName;
  while (cur !== fromName) {
    chain.push(cur);
    const p = prev.get(cur);
    if (!p) return null;
    cur = p.via;
  }
  chain.push(fromName);
  chain.reverse();

  // legs: between consecutive chain vertices, line = the prev record's line
  const legs = [];
  const interchanges = [];
  for (let i = 0; i < chain.length - 1; i++) {
    const start = chain[i], end = chain[i + 1];
    const line = prev.get(end).line;
    legs.push({ line, start, end });
    if (i < chain.length - 2) interchanges.push({ station: end });
  }
  const stations = legs.reduce((a, l) => a + (Math.abs(pos(l.line, l.start) - pos(l.line, l.end)) + 1), 0) - (legs.length - 1);
  return { legs, stations, interchanges };
};

const mins = (n) => n * MIN_PER_STATION;
const hhmm = (m) => `${Math.floor(m / 60)}:${String(Math.round(m % 60)).padStart(2, '0')}`;

export const planOfflineJourney = ({ fromCode, toCode, strategy = 'least-distance', travelDate }) => {
  build();
  const fromName = codeName(fromCode);
  const toName = codeName(toCode);
  if (!fromName || !toName) return null;

  const minInterchange = strategy === 'minimum-interchange';
  const r = route(fromName, toName, minInterchange);
  if (!r) return null;

  const stn = r.stations;
  const km = Math.round((stn - 1) * AVG_STATION_KM * 10) / 10; // segments x 1.2 km
  // Live DMRC charges the next bracket at exact slab boundary km (e.g. 12.0km ->
  // Rs 43, not 32). Nudge just for the fare so offline fares match the live API.
  const fareKm = km + 0.001;
  const fare = calculateDMRCFare(fareKm, travelDate, true);

  const legs = r.legs.map((l) => {
    const cnt = Math.abs(pos(l.line, l.start) - pos(l.line, l.end)) + 1;
    return {
      line_name: LINES.get(l.line).name,
      line_color: LINES.get(l.line).color,
      from_station: l.start,
      to_station: l.end,
      station_count: cnt,
      duration: hhmm(mins(cnt)),
    };
  });
  const interchanges = [];
  for (let i = 0; i < r.legs.length - 1; i++) interchanges.push({ station: r.legs[i].end });

  return {
    stations: stn,
    from: fromName,
    to: toName,
    total_time: hhmm(mins(stn)),
    total_distance_km: km,
    station_count: stn,
    weekday_fare: fare,
    weekend_fare: Math.max(11, Math.round(fare * 0.75)),
    fare: { normal: fare, applicable: fare },
    legs,
    interchanges,
    offline: true,
  };
};
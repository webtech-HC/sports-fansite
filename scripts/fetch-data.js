// scripts/fetch-data.js
// Node 20 has global fetch; no deps.

import { writeFile, mkdir } from 'fs/promises';

const OUTDIR = 'data';
const nowISO = () => new Date().toISOString();

const outJSON = async (file, data) => {
  await mkdir(OUTDIR, { recursive: true });
  await writeFile(`${OUTDIR}/${file}`, JSON.stringify(data, null, 2) + '\n');
  console.log('Wrote', `${OUTDIR}/${file}`);
};

const safeFetch = async (url, opts = {}) => {
  const res = await fetch(url, opts);
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url}`);
  const text = await res.text();
  try { return JSON.parse(text); } catch { return text; }
};

const pickNextGame = (games) => {
  if (!Array.isArray(games) || games.length === 0) return null;
  const sorted = [...games].sort((a, b) => new Date(a.date) - new Date(b.date));
  const now = Date.now();
  return sorted.find(g => new Date(g.date).getTime() >= now) || sorted[sorted.length - 1];
};

// ---------- Providers ----------

// A) CollegeFootballData — schedule (requires CFBD_API_KEY)
async function fetchCFBDSchedule(year = (new Date()).getFullYear()) {
  const key = process.env.CFBD_API_KEY;
  if (!key) throw new Error('Missing CFBD_API_KEY');
  const url = `https://api.collegefootballdata.com/games?year=${year}&seasonType=regular&team=Tennessee`;
  const raw = await safeFetch(url, { headers: { Authorization: `Bearer ${key}` } });

  const games = raw.map(g => {
    const homeTeam = g.home_team ?? '';
    const awayTeam = g.away_team ?? '';
    const isHome   = homeTeam.toLowerCase().includes('tennessee') && !awayTeam.toLowerCase().includes('tennessee');
    const opponent = isHome ? (awayTeam || 'TBD') : (homeTeam || 'TBD');
    const startISO = g.start_date || g.startTime || g.start_time || g.start || null;

    let result = null;
    const hp = g.home_points, ap = g.away_points;
    if (hp != null && ap != null) result = isHome ? `${hp}-${ap}` : `${ap}-${hp}`;

    return {
      date: startISO,
      opponent,
      home: Boolean(isHome),
      tv: g.tv ?? g.network ?? 'TBD',
      result,
      venue: g.venue ?? (isHome ? 'Knoxville, TN' : '')
    };
  });

  return games;
}

// B) Open-Meteo — 3-day forecast for Knoxville (no key)
async function fetchWeather() {
  const lat = 35.9606, lon = -83.9207; // Knoxville
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
              `&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_mean` +
              `&forecast_days=3&timezone=auto`;
  const d = await safeFetch(url);
  if (!d?.daily?.time) return [];

  return d.daily.time.map((t, i) => ({
    date: t,
    hi: d.daily.temperature_2m_max[i],
    lo: d.daily.temperature_2m_min[i],
    precip: d.daily.precipitation_probability_mean?.[i] ?? null
  }));
}

// C) Foursquare Places — open_now (optional; needs FSQ_API_KEY)
async function fetchPlaces() {
  const key = process.env.FSQ_API_KEY;
  if (!key) return [];
  const ll = '35.9606,-83.9207';
  const cats = '13065,13026,13003'; // bars, restaurants, breakfast/brunch
  const url = `https://api.foursquare.com/v3/places/search?ll=${ll}&radius=8000&categories=${cats}&open_now=true&limit=25`;
  const d = await safeFetch(url, { headers: { Authorization: key } });
  const results = d?.results || [];

  return results.map(p => ({
    name: p.name ?? 'Place',
    area: p.location?.neighborhood?.[0] || p.location?.locality || 'Knoxville',
    address: [p.location?.address, p.location?.locality].filter(Boolean).join(', '),
    lat: p.geocodes?.main?.latitude ?? null,
    lon: p.geocodes?.main?.longitude ?? null,
    url: p.website || p.link || null
  }));
}

// ---------- Run all & write JSON ----------
try {
  const year = (new Date()).getFullYear();

  const [schedule, weather, places] = await Promise.all([
    fetchCFBDSchedule(year).catch(e => { console.error('CFBD:', e.message); return []; }),
    fetchWeather().catch(e => { console.error('Weather:', e.message); return []; }),
    fetchPlaces().catch(e => { console.error('FSQ:', e.message); return []; })
  ]);

  if (schedule.length) await outJSON('schedule.json', schedule);
  if (weather.length)  await outJSON('weather.json',  weather);
  if (places.length)   await outJSON('places.json',   places);

  const next = pickNextGame(schedule) || null;
  await outJSON('next.json', next || {});
  await outJSON('meta.json', {
    lastUpdated: nowISO(),
    providers: {
      schedule: 'CollegeFootballData',
      weather:  'Open-Meteo',
      places:   places.length ? 'Foursquare' : null
    },
    year
  });

  console.log('Done.');
} catch (e) {
  console.error('FAILED:', e);
  process.exitCode = 1;
}


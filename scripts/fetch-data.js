// scripts/fetch-data.js
// Pulls live-ish data from CFBD API Next and writes static JSON under /data

import { writeFile } from "node:fs/promises";

const CFBD_KEY = process.env.CFBD_API_KEY;
if (!CFBD_KEY) {
  console.error("Missing CFBD_API_KEY env var.");
  process.exit(1);
}

const API = "https://apinext.collegefootballdata.com";
const TEAM = "Tennessee";
const YEAR = new Date().getFullYear();
const SEASON = "regular";

const headers = {
  "Authorization": `Bearer ${CFBD_KEY}`,
  "accept": "application/json"
};

async function get(path, params = {}) {
  const url = new URL(API + path);
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null) url.searchParams.set(k, v);
  });
  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}: ${url}`);
  return res.json();
}

async function writeJSON(file, data) {
  await writeFile(`data/${file}`, JSON.stringify(data, null, 2));
  console.log("✓ wrote", `data/${file}`);
}

// ---------- helpers ----------
const toISO = (v) => (v ? new Date(v).toISOString() : null);
const normVenue = (v = {}) => ({
  name: v.name ?? null,
  city: v.city ?? null,
  state: v.state ?? null,
  latitude: v.location?.latitude ?? v.latitude ?? null,
  longitude: v.location?.longitude ?? v.longitude ?? null
});

// ---------- main ----------
async function main() {
  const meta = { lastUpdated: new Date().toISOString(), year: YEAR };

  // 1) Full schedule for team (we'll compute the NEXT game from this)
  const teamSchedule = await get("/games", { year: YEAR, team: TEAM, seasonType: SEASON });
  // normalize, just in case the shape changes slightly
  const schedule = (teamSchedule || []).map(g => ({
    id: g.id ?? null,
    week: g.week ?? null,
    start: toISO(g.startDate ?? g.start),
    home: g.homeTeam ?? g.home ?? null,
    away: g.awayTeam ?? g.away ?? null,
    venue: normVenue(g.venue ?? {}),
    tv: g.tv ?? null,
    status: g.status ?? null,
    neutralSite: g.neutralSite ?? false,
  })).sort((a,b) => new Date(a.start || 0) - new Date(b.start || 0));

  await writeJSON("schedule.json", schedule);

  // 2) Next game (soonest in the future)
  const now = Date.now();
  const nextGame = schedule.find(g => g.start && new Date(g.start).getTime() > now) || null;
  await writeJSON("next.json", { ...meta, game: nextGame });

  // current/next week (fallback to nextGame.week or 1)
  const currentWeek = nextGame?.week ?? 1;

  // 3) TV / Streams for the week
  // API Next endpoint is /games/media
  let media = [];
  try {
    const raw = await get("/games/media", { year: YEAR, week: currentWeek, seasonType: SEASON });
    media = (raw || []).map(m => ({
      week: m.week ?? currentWeek,
      homeTeam: m.homeTeam ?? m.home ?? "",
      awayTeam: m.awayTeam ?? m.away ?? "",
      outlet: m.outlet ?? m.network ?? "TBD"
    }));
  } catch (e) {
    console.warn("media fetch failed:", e.message);
  }
  await writeJSON("media.json", media);

  // 4) Odds / Lines for the week (simplified)
  let lines = [];
  try {
    const raw = await get("/lines", { year: YEAR, week: currentWeek, team: TEAM });
    // Normalize to {provider, spread, overUnder}
    lines = (raw || []).map(book => {
      const last = (book.lines || []).slice(-1)[0] || {};
      return {
        provider: last.provider ?? book.provider ?? "TBD",
        spread: last.spread ?? null,
        overUnder: last.overUnder ?? null,
        lastUpdated: toISO(last.lastUpdated)
      };
    });
  } catch (e) {
    console.warn("lines fetch failed:", e.message);
  }
  await writeJSON("lines.json", lines);

  // 5) Rankings (AP)
  // API Next usually exposes consolidated rankings
  let rankings = { polls: [], week: currentWeek, year: YEAR };
  try {
    const raw = await get("/rankings", { year: YEAR, week: currentWeek, seasonType: SEASON });
    // Keep only AP if present; otherwise keep first
    const ap = (raw?.polls || raw || []).find(p => /AP/i.test(p.poll?.name || p.poll)) || (raw?.polls || raw || [])[0];
    const ranks = (ap?.ranks || []).map(r => ({ rank: r.rank, team: r.team ?? r.school }));
    rankings = { poll: "AP Top 25", week: currentWeek, year: YEAR, ranks };
  } catch (e) {
    console.warn("rankings fetch failed:", e.message);
  }
  await writeJSON("rankings.json", rankings);

  // 6) Weather for next game (if coords)
  let weather = null;
  try {
    const lat = Number(nextGame?.venue?.latitude ?? NaN);
    const lon = Number(nextGame?.venue?.longitude ?? NaN);
    if (!isNaN(lat) && !isNaN(lon)) {
      const wxUrl = new URL("https://api.open-meteo.com/v1/forecast");
      wxUrl.searchParams.set("latitude", String(lat));
      wxUrl.searchParams.set("longitude", String(lon));
      wxUrl.searchParams.set("hourly", "temperature_2m,precipitation_probability");
      wxUrl.searchParams.set("daily", "weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max");
      wxUrl.searchParams.set("timezone", "auto");
      const res = await fetch(wxUrl);
      weather = await res.json();
    }
  } catch (e) {
    console.warn("weather fetch failed:", e.message);
  }
  await writeJSON("weather.json", weather || {});

  // 7) Meta
  await writeJSON("meta.json", meta);

  console.log("Done.");
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});



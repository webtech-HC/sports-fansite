// scripts/fetch-data.js
// Pulls team-only season data + weekly media/lines/rankings + weather into /data

import fs from "node:fs/promises";

const CFBD_KEY = process.env.CFBD_API_KEY;
if (!CFBD_KEY) { console.error("Missing CFBD_API_KEY"); process.exit(1); }

const TEAM   = process.env.TEAM || "Tennessee";
const YEAR   = Number(process.env.YEAR) || new Date().getFullYear();
const SEASON = "regular";
const API    = "https://apinext.collegefootballdata.com";

const HEAD = { Authorization: `Bearer ${CFBD_KEY}`, accept: "application/json" };

async function get(path, params = {}) {
  const url = new URL(API + path);
  Object.entries(params).forEach(([k, v]) => v != null && url.searchParams.set(k, v));
  const r = await fetch(url, { headers: HEAD });
  if (!r.ok) throw new Error(`${r.status} ${r.statusText} — ${url}`);
  return r.json();
}

async function writeJSON(name, data) {
  await fs.mkdir("data", { recursive: true });
  await fs.writeFile(`data/${name}`, JSON.stringify(data, null, 2));
  console.log("✓ wrote", `data/${name}`);
}

const toISO = (v) => (v ? new Date(v).toISOString() : null);
const normVenue = (v = {}) => ({
  name: v.name ?? null,
  city: v.city ?? null,
  state: v.state ?? null,
  latitude: v.location?.latitude ?? v.latitude ?? null,
  longitude: v.location?.longitude ?? v.longitude ?? null
});

function weekdayShort(iso) { return new Date(iso).toLocaleDateString([], { weekday: "short" }); }

async function currentWeek(year, seasonType = SEASON) {
  const cal = await get("/calendar", { year });
  const now = new Date();
  let cur = null, next = null;
  for (const w of cal) {
    const st = new Date(w.startDate || w.firstGameStart);
    const en = new Date(w.endDate || w.lastGameStart || w.endDate);
    const type = (w.seasonType || w.season_type || "").toLowerCase();
    if (type !== seasonType) continue;
    if (now >= st && now <= en) { cur = w.week; break; }
    if (!next && st > now) next = w.week;
  }
  return cur ?? next ?? 1;
}

async function main() {
  const meta = { lastUpdated: new Date().toISOString(), team: TEAM, year: YEAR };

  // 1) Team season schedule (Tennessee-only)
  const season = await get("/games", { year: YEAR, seasonType: SEASON, team: TEAM });
  const schedule = (season || []).map(g => ({
    id: g.id ?? null,
    week: g.week ?? null,
    start: toISO(g.startDate ?? g.start),
    home: g.homeTeam ?? g.home ?? null,
    away: g.awayTeam ?? g.away ?? null,
    venue: normVenue(g.venue ?? {}),
    tv: g.tv ?? g.network ?? null,
    status: g.status ?? null,
    neutralSite: g.neutralSite ?? false,
    home_points: g.homePoints ?? g.home_points ?? null,
    away_points: g.awayPoints ?? g.away_points ?? null
  })).sort((a,b) => new Date(a.start || 0) - new Date(b.start || 0));
  await writeJSON("schedule.json", schedule);

  // 2) Next game (soonest in future)
  const now = Date.now();
  const nextGame = schedule.find(g => g.start && new Date(g.start).getTime() > now) || null;
  await writeJSON("next.json", { ...meta, game: nextGame });

  // 3) Compute week (from calendar for accuracy)
  const wk = await currentWeek(YEAR, SEASON);

  // 4) Media (TV/streams)
  let media = [];
  try {
    const raw = await get("/games/media", { year: YEAR, week: wk, seasonType: SEASON });
    media = (raw || []).filter(m =>
      [m.homeTeam, m.home, m.awayTeam, m.away].some(v => String(v || "").toLowerCase() === TEAM.toLowerCase())
    ).map(m => ({
      week: m.week ?? wk,
      homeTeam: m.homeTeam ?? m.home ?? "",
      awayTeam: m.awayTeam ?? m.away ?? "",
      outlet: m.outlet ?? m.network ?? "TBD"
    }));
  } catch (e) { console.warn("media fetch failed:", e.message); }
  await writeJSON("media.json", media);

  // 5) Odds / lines (simplified)
  let lines = [];
  try {
    const raw = await get("/lines", { year: YEAR, week: wk, team: TEAM });
    lines = (raw || []).map(book => {
      const last = (book.lines || []).slice(-1)[0] || {};
      return {
        provider: last.provider ?? book.provider ?? "TBD",
        spread: last.spread ?? null,
        overUnder: last.overUnder ?? null,
        lastUpdated: toISO(last.lastUpdated)
      };
    });
  } catch (e) { console.warn("lines fetch failed:", e.message); }
  await writeJSON("lines.json", lines);

  // 6) Rankings (AP)
  let rankings = { poll: "AP Top 25", week: wk, year: YEAR, ranks: [] };
  try {
    const raw = await get("/rankings", { year: YEAR, week: wk, seasonType: SEASON });
    const polls = raw?.polls || raw || [];
    const ap = polls.find(p => /AP/i.test(p.poll?.name || p.poll)) || polls[0];
    const ranks = (ap?.ranks || []).map(r => ({ rank: r.rank, team: r.team ?? r.school }));
    rankings = { poll: "AP Top 25", week: wk, year: YEAR, ranks };
  } catch (e) { console.warn("rankings fetch failed:", e.message); }
  await writeJSON("rankings.json", rankings);

  // 7) Weather (Open-Meteo) — transform to { days:[ {label,hi,lo,precipPct}, ... ] }
  const KNOX = { lat: 35.9606, lon: -83.9207 };
  let weather = { days: [] };
  try {
    const lat = Number(nextGame?.venue?.latitude ?? KNOX.lat);
    const lon = Number(nextGame?.venue?.longitude ?? KNOX.lon);
    const url = new URL("https://api.open-meteo.com/v1/forecast");
    url.searchParams.set("latitude", String(lat));
    url.searchParams.set("longitude", String(lon));
    url.searchParams.set("daily", "weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max");
    url.searchParams.set("timezone", "auto");
    const r = await fetch(url);
    if (r.ok) {
      const wx = await r.json();
      const times = wx?.daily?.time || [];
      const tmax  = wx?.daily?.temperature_2m_max || [];
      const tmin  = wx?.daily?.temperature_2m_min || [];
      const ppop  = wx?.daily?.precipitation_probability_max || [];
      const days = times.slice(0, 3).map((t, i) => ({
        label: weekdayShort(t),
        hi: tmax[i] ?? null,
        lo: tmin[i] ?? null,
        precipPct: ppop[i] ?? null
      }));
      weather = { days, source: "open-meteo", lat, lon, fetchedAt: new Date().toISOString() };
    }
  } catch (e) { console.warn("weather fetch failed:", e.message); }
  await writeJSON("weather.json", weather);

  // 8) Meta
  await writeJSON("meta.json", meta);

  console.log("Done.");
}

main().catch(e => { console.error(e); process.exit(1); });

// scripts/fetch-live.js
// Produces a lightweight scoreboard snapshot for the current or next game.

import fs from "node:fs/promises";

const CFBD_KEY = process.env.CFBD_API_KEY;
if (!CFBD_KEY) { console.error("Missing CFBD_API_KEY"); process.exit(1); }

const TEAM   = process.env.TEAM || "Tennessee";
const YEAR   = Number(process.env.YEAR) || new Date().getFullYear();
const SEASON = "regular";
const API    = "https://apinext.collegefootballdata.com";
const HEAD   = { Authorization: `Bearer ${CFBD_KEY}`, accept: "application/json" };

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

async function currentWeek(year) {
  const cal = await get("/calendar", { year });
  const now = new Date();
  let cur = null, next = null;
  for (const w of cal) {
    const st = new Date(w.startDate || w.firstGameStart);
    const en = new Date(w.endDate || w.lastGameStart || w.endDate);
    const type = (w.seasonType || w.season_type || "").toLowerCase();
    if (type !== "regular") continue;
    if (now >= st && now <= en) { cur = w.week; break; }
    if (!next && st > now) next = w.week;
  }
  return cur ?? next ?? 1;
}

function normalizeGame(g) {
  if (!g) return null;
  const v = g.venue || {};
  return {
    id: g.id ?? null,
    start: g.startDate ?? g.start ?? null,
    status: g.status ?? (g.completed ? "final" : "scheduled"),
    home: g.homeTeam ?? g.home ?? null,
    away: g.awayTeam ?? g.away ?? null,
    home_points: g.homePoints ?? g.home_points ?? null,
    away_points: g.awayPoints ?? g.away_points ?? null,
    period: g.period ?? null,
    clock: g.clock ?? null,
    tv: g.tv ?? g.network ?? null,
    venue: {
      name: v.name ?? null,
      city: v.city ?? null,
      state: v.state ?? null,
      latitude: v.location?.latitude ?? v.latitude ?? null,
      longitude: v.location?.longitude ?? v.longitude ?? null
    }
  };
}

async function main() {
  const wk = await currentWeek(YEAR);

  // Pull the team's game for this week
  const games = await get("/games", { year: YEAR, week: wk, seasonType: SEASON, team: TEAM });
  const g = games?.[0] || null;

  const payload = {
    team: TEAM,
    year: YEAR,
    week: wk,
    fetchedAt: new Date().toISOString(),
    game: normalizeGame(g)
  };

  await writeJSON("scoreboard.json", payload);
}

main().catch(e => { console.error(e); process.exit(1); });

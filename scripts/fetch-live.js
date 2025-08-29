// scripts/fetch-live.js
import fs from "node:fs/promises";

const OUT  = "data";
const YEAR = new Date().getFullYear();
const TEAM = "Tennessee"; // update if you rebrand

const CFBD = "https://api.collegefootballdata.com";

await fs.mkdir(OUT, { recursive: true });

async function cfbd(path, params = {}) {
  const u = new URL(CFBD + path);
  Object.entries(params).forEach(([k, v]) => v != null && u.searchParams.set(k, v));
  const res = await fetch(u, {
    headers: { Authorization: `Bearer ${process.env.CFBD_API_KEY}` },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} ← ${u}`);
  return res.json();
}

// 1) Full season schedule for this team
const schedule = await cfbd("/games", { year: YEAR, team: TEAM });

// helper: find the next game in the future
function pickNext(games) {
  const now = Date.now();
  return games
    .map(g => ({ ...g, _ts: g.start_date ? Date.parse(g.start_date) : NaN }))
    .filter(g => Number.isFinite(g._ts) && g._ts > now)
    .sort((a, b) => a._ts - b._ts)[0] || null;
}
const next = pickNext(schedule);

// 2) Scoreboard filtered to this team/year (may be empty when no game today)
let scoreboard = await cfbd("/scoreboard", { year: YEAR, team: TEAM }).catch(() => []);
// API sometimes returns { games:[...] } or an array—normalize:
const gamesArray = Array.isArray(scoreboard) ? scoreboard : (scoreboard?.games || []);

// Prefer “live/in-progress” entry for this team if found
const isUs = g =>
  (g?.home_team?.school === TEAM) ||
  (g?.home_team === TEAM) ||
  (g?.away_team?.school === TEAM) ||
  (g?.away_team === TEAM);

const activeGame = gamesArray.find(isUs) || null;

// 3) Live plays (optional) if we have a game id
let livePlays = [];
const gid = activeGame?.id || activeGame?.game_id;
if (gid) {
  livePlays = await cfbd("/live/plays", { gameId: gid }).catch(() => []);
}

// 4) Persist JSON for the front-end
const meta = { team: TEAM, year: YEAR, asOf: new Date().toISOString() };
await fs.writeFile(`${OUT}/scoreboard.json`, JSON.stringify({ meta, games: gamesArray }, null, 2));
await fs.writeFile(`${OUT}/live.json`,        JSON.stringify({ meta, game: activeGame, plays: livePlays }, null, 2));
await fs.writeFile(`${OUT}/next.json`,        JSON.stringify({ meta, next }, null, 2));

console.log("Wrote data/scoreboard.json, data/live.json, data/next.json");

import fs from 'node:fs/promises';

const BASE = 'https://api.collegefootballdata.com';
const YEAR = Number(process.env.YEAR) || new Date().getFullYear();
const H = {
  Accept: 'application/json',
  Authorization: `Bearer ${process.env.CFBD_API_KEY}`
};

async function get(path) {
  const r = await fetch(`${BASE}${path}`, { headers: H });
  if (!r.ok) throw new Error(`${path} -> ${r.status}`);
  return r.json();
}

async function writeJSON(path, data) {
  await fs.mkdir('data', { recursive: true });
  await fs.writeFile(`data/${path}`, JSON.stringify(data, null, 2));
}

(async () => {
  // “Open” items you showed in the screenshot → static equivalents
  const conferences = await get('/conferences');                 // list of conferences
  const calendar    = await get(`/calendar?year=${YEAR}`);       // full season dates
  const teams       = await get('/teams/fbs');                   // FBS teams list
  const venues      = await get('/venues');                      // venues meta (optional; big)
  // You can add more: /coaches, /roster?team=..., etc (usually not daily-critical)

  await writeJSON('conferences.json', conferences);
  await writeJSON('calendar.json', calendar);
  await writeJSON('teams-fbs.json', teams);
  await writeJSON('venues.json', venues);

  // A tiny meta file to show freshness on the site
  await writeJSON('meta.json', { lastUpdated: new Date().toISOString(), year: YEAR });
})();

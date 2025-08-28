// assets/js/app.js
// ======= JSON-driven page logic (GitHub Pages-safe) =======

const PATH_SCHEDULE = 'data/schedule.json';
const PATH_SPECIALS = 'data/specials.json'; // your hand-curated deals
const PATH_WEATHER  = 'data/weather.json';  // produced by the Action
// const PATH_PLACES   = 'data/places.json'; // (optional) for a map later

// Helpers
const $ = s => document.querySelector(s);
const pad = n => String(n).padStart(2, '0');
const fmtDate = iso => new Date(iso).toLocaleDateString([], { month: 'short', day: 'numeric', weekday: 'short' });
const fmtTime = iso => new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
const untilParts = (iso) => {
  const now = new Date(), then = new Date(iso);
  const ms = Math.max(0, then - now);
  const d = Math.floor(ms / 86400000);
  const h = Math.floor((ms % 86400000) / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  return { d, h, m, s };
};

async function fetchJSON(path, fallback = null) {
  try {
    const res = await fetch(path, { cache: 'no-store' });
    if (!res.ok) throw new Error(res.statusText);
    return await res.json();
  } catch (e) {
    console.warn('Failed to fetch', path, e);
    return fallback;
  }
}

// Pick next upcoming game (>= now). If none, last game.
function pickNextGame(schedule) {
  const now = Date.now();
  const sorted = [...schedule].sort((a, b) => new Date(a.date) - new Date(b.date));
  return sorted.find(g => new Date(g.date).getTime() >= now) || sorted[sorted.length - 1] || null;
}

// ---------- Paint quick glance ----------
function paintQuick(game) {
  if (!game) return;
  $("#qOpp").textContent = game.opponent;
  $("#qDate").textContent = new Date(game.date).toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' });
  $("#qTime").textContent = fmtTime(game.date);
  $("#qVenue").textContent = game.venue || (game.home ? "Knoxville, TN" : "");
}

// ---------- Countdown (hero mini + guide block) ----------
function tickCountdown(kickoffISO) {
  if (!kickoffISO) return;
  const { d, h, m, s } = untilParts(kickoffISO);
  $("#miniDays")  && ($("#miniDays").textContent = pad(d));
  $("#miniHours") && ($("#miniHours").textContent = pad(h));
  $("#miniMins")  && ($("#miniMins").textContent = pad(m));
  $("#cdD") && ($("#cdD").textContent = pad(d));
  $("#cdH") && ($("#cdH").textContent = pad(h));
  $("#cdM") && ($("#cdM").textContent = pad(m));
  $("#cdS") && ($("#cdS").textContent = pad(s));
}

// ---------- Render schedule ----------
function paintSchedule(schedule) {
  const tbody = $("#schBody");
  if (!tbody) return;
  tbody.innerHTML = schedule.map(g => `
    <tr>
      <td>${fmtDate(g.date)} ${fmtTime(g.date)}</td>
      <td>${g.opponent}</td>
      <td>${g.home ? "Home" : "Away"}</td>
      <td>${g.tv || "TBD"}</td>
      <td>${g.result ?? ""}</td>
    </tr>
  `).join("");
}

// ---------- Render specials (manual list you control) ----------
function paintSpecials(list) {
  const grid = $("#specialsGrid");
  if (!grid) return;
  grid.innerHTML = (list || []).slice(0, 6).map(x => `
    <article class="sp">
      <h3>${x.title}</h3>
      <div class="meta">${x.biz} • ${x.area} • ${x.time}</div>
      <p><a href="${x.link}" target="_blank" rel="noopener">Details</a></p>
    </article>
  `).join("");
}

// ---------- Weather (from /data/weather.json) ----------
async function paintWeather() {
  const ul = document.querySelector('.wx');
  if (!ul) return;
  const rows = await fetchJSON(PATH_WEATHER, []);
  if (!rows || rows.length === 0) return;
  ul.innerHTML = rows.map(x => {
    const w = new Date(x.date).toLocaleDateString([], { weekday: 'short' });
    const hi = Math.round(x.hi), lo = Math.round(x.lo);
    const pr = (x.precip ?? 0) + '%';
    return `<li><b>${w}</b> <span>${hi}°/${lo}°</span> <em>${pr}</em></li>`;
  }).join('');
}

// ---------- Marquee ticker ----------
function mountTicker(nextGame) {
  const track = $("#tickerTrack");
  if (!track || !nextGame) return;

  function nowCountdownStr() {
    const { d, h, m } = untilParts(nextGame.date);
    return `${pad(d)}d ${pad(h)}h ${pad(m)}m`;
  }
  function buildChunk() {
    const parts = [
      `Kickoff vs ${nextGame.opponent}: ${fmtDate(nextGame.date)} ${fmtTime(nextGame.date)}`,
      `Countdown ${nowCountdownStr()}`,
      (nextGame.venue || (nextGame.home ? "Knoxville, TN" : "Away"))
    ];
    return parts.map(p => `<span class="ticker-item">${p}</span><span class="ticker-bullet">•</span>`).join('');
  }
  track.innerHTML = `<div class="ticker-row">${buildChunk()}</div><div class="ticker-row">${buildChunk()}</div>`;
  setInterval(() => {
    const rows = track.querySelectorAll('.ticker-row');
    rows.forEach(r => r.innerHTML = buildChunk());
  }, 60000);
}

// ---------- Add-to-Calendar (.ics) ----------
function toICSDate(iso) {
  const d = new Date(iso);
  const z = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  const YYYY = z.getUTCFullYear(), MM = pad(z.getUTCMonth() + 1), DD = pad(z.getUTCDate());
  const HH = pad(z.getUTCHours()), m = pad(z.getUTCMinutes()), s = pad(z.getUTCSeconds());
  return `${YYYY}${MM}${DD}T${HH}${m}${s}Z`;
}
function icsBlobForGame(game) {
  const start = new Date(game.date);
  const end = new Date(start.getTime() + 3 * 60 * 60 * 1000); // 3h default
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Tennessee Gameday Hub//HC Web Labs//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${crypto.randomUUID?.() || ('tenn-'+Date.now())}@hcweblabs`,
    `DTSTAMP:${toICSDate(new Date().toISOString())}`,
    `DTSTART:${toICSDate(start.toISOString())}`,
    `DTEND:${toICSDate(end.toISOString())}`,
    `SUMMARY:Tennessee vs ${game.opponent} (Unofficial Reminder)`,
    `DESCRIPTION:Unofficial fan reminder. Times/TV may change. Check official sources.`,
    `LOCATION:${(game.venue || (game.home ? 'Knoxville, TN' : 'Away')).replace(/\n/g,' ')}`,
    'END:VEVENT',
    'END:VCALENDAR'
  ].join('\r\n');
  return new Blob([lines], { type: 'text/calendar' });
}
function wireAddToCal(game) {
  const linkHero = $("#addCalHero");
  const linkCard = $("#addCalCard");
  if (!game) return;
  const blob = icsBlobForGame(game);
  const url = URL.createObjectURL(blob);
  const fname = `tennessee-vs-${game.opponent.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.ics`;
  [linkHero, linkCard].forEach(a => {
    if (!a) return;
    a.href = url;
    a.download = fname;
    a.setAttribute('aria-label', `Add ${game.opponent} game to your calendar`);
  });
}

// ---------- Init ----------
(async function init() {
  // Load site data
  const schedule = await fetchJSON(PATH_SCHEDULE, []);
  const specials = await fetchJSON(PATH_SPECIALS, []);

  // Paint content
  paintSchedule(schedule);
  paintSpecials(specials);
  paintWeather();

  // Next game + countdown/ticker
  const next = pickNextGame(schedule);
  paintQuick(next);
  tickCountdown(next?.date);
  setInterval(() => tickCountdown(next?.date), 1000);
  mountTicker(next);
  wireAddToCal(next);
})();


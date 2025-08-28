// Visible build/version banner (handy to confirm cache-bust in the console)
window.TENNESSEE_APP_VERSION = '2025-08-28-3';
console.log('TENNESSEE APP', window.TENNESSEE_APP_VERSION);

/* ---------- paths to JSON on GitHub Pages ---------- */
const PATH_SCHEDULE = 'data/schedule.json';
const PATH_SPECIALS = 'data/specials.json';
const PATH_WEATHER  = 'data/weather.json';
const PATH_META     = 'data/meta.json';
const PATH_PLACES   = 'data/places.json';

/* ---------- tiny helpers ---------- */
const $  = (s) => document.querySelector(s);
const pad = (n) => String(n).padStart(2, '0');
const isValidISO = (iso) => typeof iso === 'string' && !Number.isNaN(Date.parse(iso));

const fmtDate = (iso) =>
  new Date(iso).toLocaleDateString([], { month: 'short', day: 'numeric', weekday: 'short' });
const fmtTime = (iso) =>
  new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

const untilParts = (iso) => {
  const now = new Date();
  const then = new Date(iso);
  const ms = Math.max(0, then - now);
  return {
    d: Math.floor(ms / 86400000),
    h: Math.floor((ms % 86400000) / 3600000),
    m: Math.floor((ms % 3600000) / 60000),
    s: Math.floor((ms % 60000) / 1000),
  };
};

// Safe setters (no optional-chaining on the LHS of an assignment)
// use the existing $ you already have at the top of the file
const setText = (sel, txt, ctx = document) => {
  const el = $(sel, ctx);
  if (el) el.textContent = txt;
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

/* ---------- data picking ---------- */
function pickNextGame(schedule) {
  const valid = (schedule || []).filter((g) => isValidISO(g.date));
  if (!valid.length) return null;
  const now = Date.now();
  const sorted = valid.sort((a, b) => new Date(a.date) - new Date(b.date));
  return sorted.find((g) => new Date(g.date).getTime() >= now) || sorted.at(-1);
}

/* ---------- paint: quick glance ---------- */
function paintQuick(g = {}) {
  $('#qOpp').textContent  = g.opponent || 'TBD';
  $('#qDate').textContent = g.date && isValidISO(g.date)
    ? new Date(g.date).toLocaleDateString([], { weekday:'long', month:'long', day:'numeric' })
    : 'Date TBA';
  $('#qTime').textContent = g.date && isValidISO(g.date) ? fmtTime(g.date) : 'Time TBA';
  $('#qVenue').textContent= g.venue || (g.home ? 'Knoxville, TN' : '');
}

/* ---------- paint: schedule ---------- */
function paintSchedule(schedule) {
  const tbody = $('#schBody');
  if (!tbody) return;
  tbody.innerHTML = (schedule || [])
    .map((g) => {
      const dateStr = g.date && isValidISO(g.date) ? `${fmtDate(g.date)} ${fmtTime(g.date)}` : 'TBA';
      return `
        <tr>
          <td>${dateStr}</td>
          <td>${g.opponent || 'TBD'}</td>
          <td>${g.home ? 'Home' : 'Away'}</td>
          <td>${g.tv || 'TBD'}</td>
          <td>${g.result ?? ''}</td>
        </tr>`;
    }).join('');
}

/* ---------- paint: specials ---------- */
function paintSpecials(list) {
  const grid = $('#specialsGrid');
  if (!grid) return;
  grid.innerHTML = (list || []).slice(0,6).map(x => `
    <article class="sp">
      <h3>${x.title}</h3>
      <div class="meta">${x.biz} • ${x.area} • ${x.time}</div>
      <p><a href="${x.link}" target="_blank" rel="noopener">Details</a></p>
    </article>
  `).join('');
}

/* ---------- paint: weather ---------- */
async function paintWeather(){
  const ul = document.querySelector('.wx');
  if (!ul) return;
  const rows = await fetchJSON(PATH_WEATHER, []);
  if (!rows?.length) return;
  ul.innerHTML = rows.map(x=>{
    const w = new Date(x.date).toLocaleDateString([], { weekday:'short' });
    const hi = Math.round(x.hi), lo = Math.round(x.lo), pr=(x.precip ?? 0)+'%';
    return `<li><b>${w}</b> <span>${hi}°/${lo}°</span> <em>${pr}</em></li>`;
  }).join('');
}

/* ---------- paint: last updated ---------- */
async function paintLastUpdated(){
  const el = $('#dataUpdated'); if (!el) return;
  const meta = await fetchJSON(PATH_META, null);
  if (!meta?.lastUpdated){
    el.textContent = 'Data updated — n/a'; return;
  }
  const dt = new Date(meta.lastUpdated).toLocaleString([], { dateStyle:'medium', timeStyle:'short' });
  el.textContent = `Data updated — ${dt}`;
}

// -------- countdown / ticker ----------
let countdownTimer = null;

function stopCountdown(resetUI = false) {
  if (countdownTimer) {
    clearInterval(countdownTimer);
    countdownTimer = null;
  }
  if (resetUI) {
    // Zero out both the mini and full guide counters
    [['#miniDays','00'],['#miniHours','00'],['#miniMins','00'],
     ['#cdD','00'],['#cdH','00'],['#cdM','00'],['#cdS','00']].forEach(([sel,val])=>{
      const el = document.querySelector(sel);
      if (el) el.textContent = val;
    });
  }
}

function startCountdown(iso) {
  if (!iso || !isValidISO(iso)) { stopCountdown(true); return; }
  // ensure only one interval runs
  stopCountdown();

  const tick = () => {
    const { d, h, m, s } = untilParts(iso);
    const pad2 = n => String(n).padStart(2,'0');

    const set = (sel, txt) => { const el = document.querySelector(sel); if (el) el.textContent = txt; };
    set('#miniDays', pad2(d));
    set('#miniHours', pad2(h));
    set('#miniMins', pad2(m));
    set('#cdD', pad2(d));
    set('#cdH', pad2(h));
    set('#cdM', pad2(m));
    set('#cdS', pad2(s));
  };

  tick();
  countdownTimer = setInterval(tick, 1000);
}



/* ---------- ICS helpers (uses element.hidden) ---------- */
function toICSDate(iso){
  const d = new Date(iso);
  const z = new Date(d.getTime() - d.getTimezoneOffset()*60000);
  const YYYY=z.getUTCFullYear(), MM=pad(z.getUTCMonth()+1), DD=pad(z.getUTCDate());
  const HH=pad(z.getUTCHours()), m=pad(z.getUTCMinutes()), s=pad(z.getUTCSeconds());
  return `${YYYY}${MM}${DD}T${HH}${m}${s}Z`;
}
function icsBlobForGame(game){
  const start = new Date(game.date);
  const end = new Date(start.getTime() + 3*60*60*1000);
  const lines = [
    'BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//Tennessee Gameday Hub//HC Web Labs//EN',
    'CALSCALE:GREGORIAN','METHOD:PUBLISH','BEGIN:VEVENT',
    `UID:${crypto.randomUUID?.() || 'tenn-'+Date.now()}@hcweblabs`,
    `DTSTAMP:${toICSDate(new Date().toISOString())}`,
    `DTSTART:${toICSDate(start.toISOString())}`,
    `DTEND:${toICSDate(end.toISOString())}`,
    `SUMMARY:Tennessee vs ${game.opponent} (Unofficial Reminder)`,
    'DESCRIPTION:Unofficial fan reminder. Times/TV may change. Check official sources.',
    `LOCATION:${(game.venue || (game.home ? 'Knoxville, TN' : 'Away')).replace(/\n/g,' ')}`,
    'END:VEVENT','END:VCALENDAR'
  ].join('\r\n');
  return new Blob([lines], { type:'text/calendar' });
}
function wireAddToCal(game){
  const links = [$('#addCalHero'), $('#addCalCard')];
  if (!game || !isValidISO(game.date)){
    links.forEach(a=>{ if(!a) return; a.hidden = true; a.removeAttribute('href'); a.removeAttribute('download'); a.setAttribute('aria-hidden','true'); });
    return;
  }
  const blob = icsBlobForGame(game);
  const url  = URL.createObjectURL(blob);
  const fname= `tennessee-vs-${game.opponent.toLowerCase().replace(/[^a-z0-9]+/g,'-')}.ics`;
  links.forEach(a=>{ if(!a) return; a.hidden=false; a.href=url; a.download=fname; a.removeAttribute('aria-hidden'); a.setAttribute('aria-label',`Add ${game.opponent} game to your calendar`); });
}

/* ---------- Leaflet map (safe if no places.json) ---------- */
async function paintLeafletMap(){
  const mapEl = $('#leafletMap'); if (!mapEl || typeof L === 'undefined') return;
  const map = L.map('leafletMap', { scrollWheelZoom:false });
  const center=[35.9606,-83.9207];
  map.setView(center, 13);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom:19, attribution:'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
  }).addTo(map);

  const places = (await fetchJSON(PATH_PLACES, [])) || [];
  if (!places.length){
    $('#mapNote') && ($('#mapNote').textContent = 'No live places data yet — check back soon.');
    setTimeout(()=>map.invalidateSize(),50); return;
  }
  const markers=[];
  places.forEach(p=>{
    if (typeof p.lat!=='number' || typeof p.lon!=='number') return;
    const m=L.marker([p.lat,p.lon]).addTo(map);
    const link=p.url?`<br><a href="${p.url}" target="_blank" rel="noopener">Website</a>`:'';
    m.bindPopup(`<strong>${p.name}</strong><br>${p.address || p.area || ''}${link}`);
    markers.push(m);
  });
  const group=L.featureGroup(markers);
  try { map.fitBounds(group.getBounds().pad(0.2)); } catch {}
  setTimeout(()=>map.invalidateSize(),100);
}

/* ---------- init ---------- */
(async function init(){
  const [schedule, specials] = await Promise.all([
    fetchJSON(PATH_SCHEDULE, []),
    fetchJSON(PATH_SPECIALS, []),
  ]);

  paintSchedule(schedule);
  paintSpecials(specials);
  paintWeather();
  paintLastUpdated();

  const next = pickNextGame(schedule);
  paintQuick(next || { opponent:'TBD', home:true, venue:'Knoxville, TN' });

  stopCountdown();
  if (next?.date && isValidISO(next.date)) startCountdown(next.date);

  mountTicker(next);
  wireAddToCal(next);

  paintLeafletMap();
})();

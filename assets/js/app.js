/* ========================================================================
   Tennessee • Gameday Hub — client JS (GitHub Pages friendly)
   ======================================================================== */

// ---------- tiny helpers ----------
const qs  = (s, ctx = document) => ctx.querySelector(s);
const qsa = (s, ctx = document) => [...ctx.querySelectorAll(s)];
const pad2 = n => String(n).padStart(2, '0');

function untilParts(iso) {
  const now = new Date();
  const then = new Date(iso);
  const ms = Math.max(0, then - now);
  return {
    d: Math.floor(ms / 86400000),
    h: Math.floor((ms % 86400000) / 3600000),
    m: Math.floor((ms % 3600000) / 60000),
    s: Math.floor((ms % 60000) / 1000),
  };
}
const isValidISO = iso => !Number.isNaN(new Date(iso).getTime());

// Safe setter
function setText(sel, txt) {
  const el = qs(sel);
  if (el) el.textContent = txt;
}

// ---------- data fetch ----------
async function fetchJSON(path, fallback = null) {
  try {
    const res = await fetch(path, { cache: 'no-store' });
    if (!res.ok) throw new Error(res.statusText);
    return await res.json();
  } catch (e) {
    console.warn('fetchJSON failed:', path, e);
    return fallback;
  }
}

// ---------- UI painters ----------
function paintLastUpdated(meta) {
  const stamp = meta?.lastUpdated
    ? new Date(meta.lastUpdated).toLocaleString()
    : 'n/a';
  // support both attribute and legacy id
  const elA = document.querySelector('[data-last-updated]');
  const elB = document.querySelector('#lastUpdated');
  if (elA) elA.textContent = stamp;
  if (elB) elB.textContent = stamp;
}

function paintQuick(next) {
  setText('#qOpp', next?.opponent ?? 'Opponent');
  if (next?.date) {
    const d = new Date(next.date);
    setText('#qDate', d.toLocaleDateString([], { weekday:'long', month:'long', day:'numeric' }));
    setText('#qTime', d.toLocaleTimeString([], { hour:'numeric', minute:'2-digit' }));
  } else {
    setText('#qDate', 'Date TBA');
    setText('#qTime', 'Time TBA');
  }
  setText('#qVenue', next?.venue ?? 'Venue, Knoxville, TN');
}

function paintSchedule(list) {
  const tbody = qs('#schBody');
  if (!tbody) return;
  const rows = (list ?? []).map(g => {
    const dt = g.date ? new Date(g.date) : null;
    const dateStr = dt
      ? `${dt.toLocaleDateString([], { month:'short', day:'numeric', weekday:'short' })} ${dt.toLocaleTimeString([], { hour:'numeric', minute:'2-digit' })}`
      : 'TBA';
    return `
      <tr>
        <td>${dateStr}</td>
        <td>${g.opponent ?? 'TBD'}</td>
        <td>${g.home ? 'Home' : 'Away'}</td>
        <td>${g.tv ?? 'TBD'}</td>
        <td>${g.result ?? ''}</td>
      </tr>
    `;
  }).join('');
  tbody.innerHTML = rows || `<tr><td colspan="5">No games yet.</td></tr>`;
}

function paintSpecials(items) {
  const grid = qs('#specialsGrid');
  if (!grid) return;
  grid.innerHTML = (items ?? []).slice(0, 6).map(x => `
    <article class="sp">
      <h3>${x.title}</h3>
      <div class="meta">${x.biz} • ${x.area} • ${x.time}</div>
      <p><a href="${x.link || '#'}">Details</a></p>
    </article>
  `).join('');
}

function paintWeather(wx) {
  if (!wx?.days?.length) return;
  const map = { 0:'#wx0', 1:'#wx1', 2:'#wx2' };
  wx.days.slice(0,3).forEach((d, i) => {
    const el = qs(map[i]);
    if (!el) return;
    el.innerHTML = `
      <b>${d.label}</b>
      <span>${d.hi}°/${d.lo}°</span>
      <em>${d.pop}%</em>
    `;
  });
}

// ---------- countdown / ticker ----------
let countdownTimer = null;

function stopCountdown(resetUI = false) {
  if (countdownTimer) {
    clearInterval(countdownTimer);
    countdownTimer = null;
  }
  if (resetUI) {
    [
      ['#miniDays','00'],['#miniHours','00'],['#miniMins','00'],
      ['#cdD','00'],['#cdH','00'],['#cdM','00'],['#cdS','00']
    ].forEach(([sel,val]) => setText(sel, val));
  }
}

function startCountdown(iso) {
  if (!iso || !isValidISO(iso)) { stopCountdown(true); return; }
  stopCountdown();

  const tick = () => {
    const { d, h, m, s } = untilParts(iso);
    setText('#miniDays',  pad2(d));
    setText('#miniHours', pad2(h));
    setText('#miniMins',  pad2(m));
    setText('#cdD', pad2(d));
    setText('#cdH', pad2(h));
    setText('#cdM', pad2(m));
    setText('#cdS', pad2(s));
  };

  tick();
  countdownTimer = setInterval(tick, 1000);
}

function mountTicker(next) {
  const bar = qs('.ticker');
  if (!bar) return;
  const parts = [];
  if (next?.date) {
    const when = new Date(next.date);
    parts.push(`Kickoff vs ${next.opponent ?? 'TBD'} • ${when.toLocaleDateString()} ${when.toLocaleTimeString([], {hour:'numeric',minute:'2-digit'})}`);
  } else {
    parts.push('Kickoff time TBA');
  }
  parts.push('Countdown 00d 00h 00m');
  bar.innerHTML = `<div class="ticker-inner">${parts.join(' — ')}</div>`;
}

// ---------- add to calendar ----------
function wireAddToCal(next) {
  const links = qsa('[data-add-cal]');
  if (!links.length) return;

  if (!next?.date || !isValidISO(next.date)) {
    links.forEach(a => { a.hidden = true; a.removeAttribute('href'); a.removeAttribute('download'); });
    return;
  }

  const dtStart = new Date(next.date);
  const dtEnd   = new Date(dtStart.getTime() + 3 * 3600000);
  const fmt = d => d.toISOString().replace(/[-:]/g,'').split('.')[0] + 'Z';

  const ics = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//HC Web Labs//Gameday Hub//EN',
    'BEGIN:VEVENT',
    `DTSTAMP:${fmt(new Date())}`,
    `DTSTART:${fmt(dtStart)}`,
    `DTEND:${fmt(dtEnd)}`,
    `SUMMARY:Tennessee vs ${next.opponent ?? 'Opponent'}`,
    `LOCATION:${next.venue ?? 'Knoxville, TN'}`,
    'END:VEVENT',
    'END:VCALENDAR'
  ].join('\r\n');

  const href = 'data:text/calendar;charset=utf-8,' + encodeURIComponent(ics);
  links.forEach(a => { a.href = href; a.download = 'tennessee-gameday.ics'; a.hidden = false; });
}

// ---------- helpers ----------
function pickNextGame(schedule = []) {
  const now = Date.now();
  const future = schedule
    .filter(g => g.date && isValidISO(g.date) && new Date(g.date).getTime() >= now)
    .sort((a,b) => new Date(a.date) - new Date(b.date));
  return future[0] ?? null;
}

// ---------- init ----------
async function init() {
  console.log('TENNESSEE APP', new Date().toISOString().slice(0,10));

  const [meta, next, schedule, specials, weather] = await Promise.all([
    fetchJSON('./data/meta.json', null),
    fetchJSON('./data/next.json', null),
    fetchJSON('./data/schedule.json', []),
    fetchJSON('./data/specials.json', []),
    fetchJSON('./data/weather.json',  null),
  ]);

  paintLastUpdated(meta || {});
  paintSchedule(schedule || []);
  paintSpecials(specials || []);
  if (weather) paintWeather(weather);

  const chosen = (next && next.date) ? next : pickNextGame(schedule || []);
  paintQuick(chosen);
  wireAddToCal(chosen);
  mountTicker(chosen);

  stopCountdown(true);
  if (chosen?.date && isValidISO(chosen.date)) startCountdown(chosen.date);
}

document.addEventListener('DOMContentLoaded', init);

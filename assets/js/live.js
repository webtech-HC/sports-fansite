/* assets/js/live.js
   Live scoreboard — polls /data/scoreboard.json ~30s and paints:
   - Top ticker (#ticker)
   - Dedicated score box (#scoreBox and its child IDs)
   - Upcoming game panel (name/date/venue)
*/

const $ = (s, c = document) => (c || document).querySelector(s);
const setText = (sel, txt) => { const el = typeof sel === 'string' ? $(sel) : sel; if (el) el.textContent = txt; };

const TEAM = 'Tennessee';
const POLL_MS = 30_000;
const PATH = 'data/scoreboard.json';

const isValidISO = (iso) => { try { return !!iso && !Number.isNaN(Date.parse(iso)); } catch { return false; } };
const fmtKick = (iso) => !iso ? 'TBA' : new Date(iso).toLocaleString([], { weekday:'short', month:'short', day:'numeric', hour:'numeric', minute:'2-digit' });
const normStatus = (s='') => s.toLowerCase().replace(/\s+/g,'_'); // "In Progress" -> "in_progress"
const isVolsHome = (g) => String(g?.home || '').toLowerCase() === TEAM.toLowerCase();
const venueLine = (v={}) => [v.name, v.city, v.state].filter(Boolean).join(', ');

function oppOf(g){ return isVolsHome(g) ? g.away : g.home; }

// ---------- Ticker ----------
function paintTicker(g){
  const t = $('#ticker'); if (!t || !g) return;
  const status = normStatus(g.status || (g.completed ? 'final' : 'scheduled'));
  const vs = isVolsHome(g) ? `${TEAM} vs ${g.away}` : `${TEAM} @ ${g.home}`;
  const tv = g.tv ? ` • ${g.tv}` : '';
  const venue = venueLine(g.venue);
  const venueText = venue ? ` — ${venue}` : '';

  if (['final','completed','postgame'].includes(status)) {
    t.textContent = `FINAL — ${vs} — ${g.home}: ${g.home_points ?? '-'}  ${g.away}: ${g.away_points ?? '-'}${tv}`;
    return;
  }
  if (['in_progress','live','halftime','overtime','ot'].includes(status) || /^q\d+/.test(status)) {
    const period = g.period != null ? `Q${g.period}` : (status === 'halftime' ? 'HALF' : 'LIVE');
    const clock  = g.clock ? ` ${g.clock}` : '';
    t.textContent = `[LIVE] ${period}${clock} — ${vs} — ${g.home}: ${g.home_points ?? '-'}  ${g.away}: ${g.away_points ?? '-'}${tv}`;
    return;
  }
  // scheduled
  t.textContent = `Kickoff ${fmtKick(g.start)} — ${vs}${venueText}${tv}`;
}

// ---------- Score Box ----------
function paintScoreBox(g){
  const box = $('#scoreBox'); if (!box || !g) return;

  const statusEl = $('#scStatus');
  const kickEl   = $('#scKick');
  const aName    = $('#scAwayName');
  const hName    = $('#scHomeName');
  const aScore   = $('#scAwayScore');
  const hScore   = $('#scHomeScore');
  const periodEl = $('#scPeriod');
  const clockEl  = $('#scClock');
  const tvEl     = $('#scTV');
  const venueEl  = $('#scVenue');

  // Names
  setText(aName, g.away || 'Away');
  setText(hName, g.home || 'Home');

  // Vols accent
  [aName, hName].forEach(el => el && el.classList.remove('vols'));
  if (isVolsHome(g)) { hName?.classList.add('vols'); } else { aName?.classList.add('vols'); }

  // Status badge
  const status = normStatus(g.status || (g.completed ? 'final' : 'scheduled'));
  const human = (
    status === 'in_progress' ? 'LIVE' :
    status === 'final' || status === 'completed' || status === 'postgame' ? 'FINAL' :
    status === 'halftime' ? 'HALF' :
    'SCHEDULED'
  );
  setText(statusEl, human);
  statusEl?.classList.remove('live','final','scheduled');
  statusEl?.classList.add(human.toLowerCase());

  // Kickoff
  setText(kickEl, `Kickoff ${fmtKick(g.start)}`);

  // Scores
  const showScores = ['in_progress','live','final','completed','postgame','halftime','overtime','ot'].includes(status) || /^q\d+/.test(status);
  setText(aScore, showScores ? (g.away_points ?? '0') : '–');
  setText(hScore, showScores ? (g.home_points ?? '0') : '–');

  // Leader highlight
  aScore?.classList.remove('lead'); hScore?.classList.remove('lead');
  const ah = Number(g.away_points ?? NaN), hh = Number(g.home_points ?? NaN);
  if (showScores && !Number.isNaN(ah) && !Number.isNaN(hh)) {
    if      (ah > hh) aScore?.classList.add('lead');
    else if (hh > ah) hScore?.classList.add('lead');
  }

  // Period / clock / tv
  setText(periodEl, (status === 'in_progress' || /^q\d+/.test(status)) ? `Q${g.period ?? ''}` : (human === 'HALF' ? 'HALF' : human));
  setText(clockEl, g.clock ? g.clock : '—');
  setText(tvEl, `TV: ${g.tv || 'TBD'}`);

  // Venue
  const vline = venueLine(g.venue);
  setText(venueEl, `Venue: ${vline || (isVolsHome(g) ? 'Knoxville, TN' : 'TBA')}`);
}

// ---------- “Upcoming Game” card ----------
function paintUpcoming(g){
  if (!g) return;
  const who   = $('#who');
  const when  = $('#when');
  const where = $('#where');

  const vs = isVolsHome(g) ? `${TEAM} vs ${g.away}` : `${TEAM} @ ${g.home}`;
  setText(who, vs);
  setText(when, isValidISO(g.start) ? fmtKick(g.start) : 'TBA');
  const vline = venueLine(g.venue) || (isVolsHome(g) ? 'Knoxville, TN' : 'TBA');
  setText(where, vline);
}

// ---------- Countdown sync (optional) ----------
let countdownTimer = null;
function stopCountdown(){ if (countdownTimer) { clearInterval(countdownTimer); countdownTimer = null; } }
function startCountdown(iso){
  if (!isValidISO(iso)) return;
  stopCountdown();
  const pad = (n) => String(Math.trunc(n)).padStart(2,'0');
  const tick = () => {
    const end = new Date(iso).getTime(), now = Date.now();
    const ms = Math.max(0, end - now);
    const d = Math.floor(ms / 86400000);
    const h = Math.floor((ms % 86400000)/3600000);
    const m = Math.floor((ms % 3600000)/60000);
    const s = Math.floor((ms % 60000)/1000);
    setText('#miniDays',  pad(d));
    setText('#miniHours', pad(h));
    setText('#miniMins',  pad(m));
    setText('#cDD', pad(d)); setText('#cHH', pad(h)); setText('#cMM', pad(m)); setText('#cSS', pad(s));
  };
  tick();
  countdownTimer = setInterval(tick, 1000);
}

// ---------- Poll loop ----------
async function pollOnce(){
  try {
    const res = await fetch(PATH, { cache: 'no-store' });
    if (!res.ok) return;
    const data = await res.json();
    const g = data?.game;
    if (!g) return;

    paintTicker(g);
    paintScoreBox(g);
    paintUpcoming(g);

    const status = normStatus(g.status || (g.completed ? 'final' : 'scheduled'));
    if (status === 'scheduled' && isValidISO(g.start)) startCountdown(g.start);
    else stopCountdown();
  } catch { /* silent; app.js already paints defaults */ }
}
function startPolling(){
  pollOnce();                // first shot
  setInterval(pollOnce, POLL_MS);
}
document.addEventListener('DOMContentLoaded', startPolling);

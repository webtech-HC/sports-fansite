/* assets/js/app.js
   Front page logic — Tennessee-only view + safe guards.
   Reads local /data/*.json written by your GitHub Actions.
*/

// ---------- tiny DOM guards ----------
const $  = (s, c = document) => (c || document).querySelector(s);
const $$ = (s, c = document) => Array.from((c || document).querySelectorAll(s));
const setText = (s, t = "", c = document) => { const el = $(s, c); if (el) el.textContent = t; };

// ---------- constants / formatters ----------
const TEAM = "Tennessee";
const _tn  = TEAM.toLowerCase();

const tzFmt   = new Intl.DateTimeFormat(undefined, { weekday:"short", month:"short", day:"numeric", hour:"numeric", minute:"2-digit" });
const dateFmt = new Intl.DateTimeFormat(undefined, { month:"short", day:"numeric" });
const timeFmt = new Intl.DateTimeFormat(undefined, { hour:"numeric", minute:"2-digit" });

const isValidISO = (iso) => {
  try { return !!iso && !Number.isNaN(Date.parse(iso)); }
  catch { return false; }
};
const pad = (n) => String(Math.trunc(n)).padStart(2, "0");


// --- PATCH: force all JSON to load from /data and keep guards ---

const DATA = 'data/';
const J = (name) => `${DATA}${name}.json`;
async function fetchJSON(path, fallback = null) {
  try {
    const res = await fetch(path, { cache: 'no-store' });
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    return await res.json();
  } catch (e) {
    console.warn('fetchJSON fallback:', path, e.message);
    return fallback;
  }
}

async function boot() {
  try {
    // Load everything we need from /data/*
    const [
      schedule,             // schedule & results table
      specials,             // featured specials
      media,                // tv/stream links
      nextGame,             // "next.json" for countdown/opponent/venue
      weather,              // 3-day weather
      meta,                 // lastUpdated stamp, year, etc.
    ] = await Promise.all([
      fetchJSON(J('schedule'), []),
      fetchJSON(J('specials'), []),
      fetchJSON(J('media'),    []),
      fetchJSON(J('next'),     null),
      fetchJSON(J('weather'),  null),
      fetchJSON(J('meta'),     { lastUpdated: null }),
    ]);

    // ---- your existing painters below ----
    // paintSchedule(schedule);
    // paintSpecials(specials);
    // paintWeather(weather);
    // paintLastUpdated(meta);
    // mountTicker(nextGame);
    // wireAddToCal(nextGame);
    // paintLeafletMap(); // if you enable it
  } catch (err) {
    console.error('BOOT ERROR', err);
    const el = document.querySelector('#ticker');
    if (el && !el.textContent.trim()) el.textContent = 'Data not available right now.';
  }
}

document.addEventListener('DOMContentLoaded', boot);



// ---------- countdown ----------
let countdownTimer = null;
function stopCountdown(){ if (countdownTimer) { clearInterval(countdownTimer); countdownTimer = null; } }
function untilParts(iso){
  const now = Date.now();
  const to  = new Date(iso).getTime();
  let ms = Math.max(0, to - now);
  const d = Math.floor(ms / 86400000); ms -= d * 86400000;
  const h = Math.floor(ms / 3600000);  ms -= h * 3600000;
  const m = Math.floor(ms / 60000);    ms -= m * 60000;
  const s = Math.floor(ms / 1000);
  return { d, h, m, s };
}
function startCountdown(iso){
  stopCountdown();
  if (!isValidISO(iso)) return;
  const tick = () => {
    const { d, h, m, s } = untilParts(iso);
    setText("#cDD", pad(d));
    setText("#cHH", pad(h));
    setText("#cMM", pad(m));
    setText("#cSS", pad(s));
  };
  tick();
  countdownTimer = setInterval(tick, 1000);
}
// Safe JSON fetch with fallback
if (typeof window.getJSON !== "function") {
  window.getJSON = async function getJSON(path, fallback = null) {
    try {
      const res = await fetch(path, { cache: "no-store" });
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
      return await res.json();
    } catch (err) {
      console.warn("getJSON fallback:", path, err.message);
      return fallback;
    }
  };
}

// ---------- data helpers ----------
async function getJSON(path){
  const res = await fetch(path, { cache: "no-store" }).catch(() => null);
  if (!res || !res.ok) return null;
  return res.json().catch(() => null);
}

// ---------- Vols-only helpers ----------
const isVolsGame = (g) => !!g && ((g.home||"").toLowerCase() === _tn || (g.away||"").toLowerCase() === _tn);
const onlyVols   = (list) => Array.isArray(list) ? list.filter(isVolsGame) : [];

function pickNextGame(schedule){
  const list = onlyVols(schedule)
    .filter(g => isValidISO(g.start))
    .sort((a,b) => new Date(a.start) - new Date(b.start));
  const now = Date.now();
  return list.find(g => new Date(g.start).getTime() > now) || null;
}
const opponentOf = (g) => (!g ? "" : ((String(g.home).toLowerCase() === _tn) ? g.away : g.home));
const homeAway   = (g) => (!g ? "" : ((String(g.home).toLowerCase() === _tn) ? "Home" : "Away"));

// ---------- painters ----------
function paintQuick(next){
  if (!next){
    setText("#who",  `${TEAM} vs Opponent`);
    setText("#when", "Date • Time TBA");
    setText("#where","Venue TBA");
    stopCountdown();
    const t = $(".ticker-inner"); if (t) t.textContent = "Kickoff time TBA — Countdown 00d 00h 00m 00s";
    return;
  }

  const who = (String(next.home).toLowerCase() === _tn)
    ? `${TEAM} vs ${next.away}`
    : `${TEAM} @ ${next.home}`;
  setText("#who", who);

  if (isValidISO(next.start)){
    const dt = new Date(next.start);
    setText("#when", tzFmt.format(dt));
    startCountdown(next.start);
  } else {
    setText("#when", "TBA");
    stopCountdown();
  }

  const v = next.venue || {};
  const where = [v.name, v.city, v.state].filter(Boolean).join(", ")
             || (next.neutralSite ? "Neutral site" : (homeAway(next) === "Home" ? "Knoxville, TN" : "TBA"));
  setText("#where", where);

  const t = $(".ticker-inner");
  if (t){
    const kickoff = isValidISO(next.start) ? timeFmt.format(new Date(next.start)) : "TBA";
    t.textContent = `Kickoff ${kickoff} — ${who} — ${where}`;
  }

  wireAddToCal(next);
}

function paintSchedule(schedule){
  const tbody = $("#schBody");
  if (!tbody) return;

  const rows = onlyVols(schedule)
    .slice()
    .sort((a,b)=> new Date(a.start) - new Date(b.start))
    .map(g => {
      const opp = opponentOf(g) || "TBD";
      const ha  = homeAway(g);
      const tv  = g.tv || g.broadcast || "TBD";
      const dt  = isValidISO(g.start) ? tzFmt.format(new Date(g.start)) : "TBA";
      const result = (g.home_points!=null && g.away_points!=null)
        ? `${g.home_points}-${g.away_points}` : "";
      return `<tr>
        <td>${dt}</td>
        <td>${opp}</td>
        <td>${ha}</td>
        <td>${tv}</td>
        <td>${result}</td>
      </tr>`;
    }).join("");

  tbody.innerHTML = rows || `<tr><td colspan="5">No games posted yet.</td></tr>`;
}

function setLastUpdated(meta){
  const el = document.querySelector("[data-last-updated]");
  const when = meta?.lastUpdated || new Date().toISOString();
  if (el) el.textContent = new Date(when).toLocaleString();
}

function wireAddToCal(g){
  const btn = $("#addToCalendar, #addToCal") || $("#addToCal") || $("#addToCalendar");
  if (!btn || !g) return;
  btn.addEventListener("click", (e) => {
    e.preventDefault();
    const dtStart = isValidISO(g.start) ? new Date(g.start) : null;
    const dtEnd   = dtStart ? new Date(dtStart.getTime() + 3*60*60*1000) : null; // 3h default

    const summary = (String(g.home).toLowerCase() === _tn)
      ? `${TEAM} vs ${g.away}`
      : `${TEAM} @ ${g.home}`;
    const loc = [g.venue?.name, g.venue?.city, g.venue?.state].filter(Boolean).join(", ");

    const fmtICS = (d) => d.toISOString().replace(/[-:]/g,"").replace(/\.\d{3}Z$/, "Z");
    const ics = [
      "BEGIN:VCALENDAR","VERSION:2.0","PRODID:-//gameday-hub//EN","BEGIN:VEVENT",
      dtStart ? `DTSTART:${fmtICS(dtStart)}` : "",
      dtEnd   ? `DTEND:${fmtICS(dtEnd)}`     : "",
      `SUMMARY:${summary}`,
      loc ? `LOCATION:${loc}` : "",
      `DESCRIPTION:${summary}`,
      "END:VEVENT","END:VCALENDAR"
    ].filter(Boolean).join("\r\n");

    const blob = new Blob([ics], { type: "text/calendar" });
    const url  = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${summary.replace(/\s+/g,"_")}.ics`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 800);
  }, { once:true });
}

// ---------- boot ----------
async function boot(){
  try {
    const [schedule, meta] = await Promise.all([
      getJSON("/data/schedule.json"),
      getJSON("/data/meta.json")
    ]);

    paintSchedule(schedule || []);
    const next = pickNextGame(schedule || []);
    paintQuick(next);
    setLastUpdated(meta);
  } catch (err){
    console.error("boot error", err);
    const t = $(".ticker-inner");
    if (t) t.textContent = "Live data unavailable right now.";
  }
}

document.addEventListener("DOMContentLoaded", boot);

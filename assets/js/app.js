/* =========================================================
   Gameday Hub – main script
   - Brightened brand orange, header countdown
   - 3-row schedule preview (expand/collapse)
   - Helpful empty states
========================================================= */

/* ------------- helpers ------------- */
const $ = sel => document.querySelector(sel);
const $$ = sel => Array.from(document.querySelectorAll(sel));

const isValidISO = (s) => !isNaN(Date.parse(s));
const fmtDateOnly = (iso) => {
  if (!isValidISO(iso)) return "TBA";
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, {
    month: "short", day: "numeric", weekday: "short"
  });
};
const fmtTime = (iso) => {
  if (!isValidISO(iso)) return "TBA";
  const d = new Date(iso);
  return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
};

const getJSON = window.getJSON || (window.getJSON = async function(path, fallback=null){
  try{
    const res = await fetch(path, { cache:"no-store" });
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    return await res.json();
  }catch(err){
    console.warn("getJSON fallback:", path, err.message);
    return fallback;
  }
});

/* ------------- paint: schedule (3-row clamp) ------------- */
let fullSchedule = [];
let isClamped = true;

function paintSchedule(list){
  const tbody = $("#sched");
  const wrap = tbody.closest(".table-wrap");
  tbody.innerHTML = "";

  const rows = (list || []).map((g) => {
    const isHome = g.home === "Tennessee";
    const opponent = isHome ? g.away : g.home;
    const ha = isHome ? "H" : "A";
    const tv = g.tv || "—";
    const result = g.result || "—";
    return `<tr>
      <td>${fmtDateOnly(g.date)}</td>
      <td>${opponent}</td>
      <td>${ha}</td>
      <td>${tv}</td>
      <td>${result}</td>
    </tr>`;
  });

  const view = isClamped ? rows.slice(0,3) : rows;
  tbody.innerHTML = view.join("") || `<tr><td colspan="5">No games found.</td></tr>`;
  wrap.classList.toggle("is-clamped", isClamped);
  $("#toggle-sched").textContent = isClamped ? "Show full schedule" : "Show less";
}

function wireScheduleToggle(){
  $("#toggle-sched")?.addEventListener("click", () => {
    isClamped = !isClamped;
    paintSchedule(fullSchedule);
  });
}

/* ------------- next game / ticker / ICS ------------- */
let nextGame = null;

function pickNextGame(schedule){
  const now = Date.now();
  const upcoming = (schedule||[]).filter(g => {
    const t = Date.parse(g.date);
    return !isNaN(t) && t >= now - 2*60*60*1000; // allow small overlap
  });
  upcoming.sort((a,b) => Date.parse(a.date) - Date.parse(b.date));
  return upcoming[0] || null;
}

function paintNext(g){
  const box = $("#next-game");
  const line = $("#next-line");
  const add = $("#add-ics");
  if (!g){
    line.textContent = "No upcoming game found.";
    add.disabled = true;
    return;
  }
  const isHome = g.home === "Tennessee";
  const opp = isHome ? g.away : g.home;
  line.textContent = `${fmtDateOnly(g.date)} • ${fmtTime(g.date)} — Tennessee vs ${opp}`;
  add.disabled = false;
  add.onclick = () => downloadICS(g);
}

function downloadICS(g){
  // Simple single-event ICS
  const dt = new Date(g.date);
  const dtStart = dt.toISOString().replace(/[-:]/g,"").replace(/\.\d{3}Z$/,"Z");
  const dtEnd = new Date(dt.getTime() + 3*60*60*1000) // +3h
                    .toISOString().replace(/[-:]/g,"").replace(/\.\d{3}Z$/,"Z");
  const isHome = g.home === "Tennessee";
  const opp = isHome ? g.away : g.home;
  const summary = `Tennessee vs ${opp}`;
  const ics = [
    "BEGIN:VCALENDAR","VERSION:2.0","PRODID:-//Gameday Hub//TN//EN",
    "BEGIN:VEVENT",
    `DTSTART:${dtStart}`,
    `DTEND:${dtEnd}`,
    `SUMMARY:${summary}`,
    "END:VEVENT","END:VCALENDAR"
  ].join("\r\n");
  const blob = new Blob([ics], { type: "text/calendar" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = summary.replace(/\s+/g,"_") + ".ics";
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(()=>URL.revokeObjectURL(url), 500);
}

/* ------------- countdown (header + rail) ------------- */
let countdownTimer = null;

function setCountdownTargets(ms){
  const targets = $$(".countdown .num");
  const parts = { d:0, h:0, m:0, s:0 };
  if (ms <= 0){
    targets.forEach(el => el.textContent = "00");
    return;
  }
  const days = Math.floor(ms / 86400000);
  const hours = Math.floor((ms % 86400000)/3600000);
  const mins = Math.floor((ms % 3600000)/60000);
  const secs = Math.floor((ms % 60000)/1000);
  parts.d = days; parts.h = hours; parts.m = mins; parts.s = secs;
  $$(".countdown").forEach(box => box.classList.remove("is-loading"));
  $$(".countdown .num").forEach(el => {
    const k = el.dataset.k;
    el.textContent = String(parts[k]).padStart(2,"0");
  });
}

function startCountdown(iso){
  if (!isValidISO(iso)) return;
  countdownTimer && clearInterval(countdownTimer);
  const target = Date.parse(iso);

  const tick = () => setCountdownTargets(target - Date.now());
  tick();
  countdownTimer = setInterval(tick, 1000);
}

/* ------------- live box (scoreboard.json) ------------- */
function paintLiveBox(data){
  // Expecting shape similar to: { inProgress:boolean, home:{name,points}, away:{name,points}, status:string }
  const status = $("#score-status");
  const team = $("#score-team");
  const points = $("#score-points");

  if (!data || !data.inProgress){
    team.textContent = "Tennessee";
    status.textContent = "No game in progress.";
    points.textContent = "—";
    return;
  }
  status.textContent = data.status || "In progress";
  const isHome = (data.home?.name || "").toLowerCase().includes("tennessee");
  const my = isHome ? data.home : data.away;
  team.textContent = my?.name || "Tennessee";
  points.textContent = Number.isFinite(my?.points) ? String(my.points) : "—";
}

/* ------------- ticker (small) ------------- */
function paintTickerSmall(g){
  const t = $("#ticker-small");
  if (!t) return;
  if (!g){ t.textContent = "Next game: TBA"; return; }
  const isHome = g.home === "Tennessee";
  const opp = isHome ? g.away : g.home;
  t.textContent = `Next: ${fmtDateOnly(g.date)} ${fmtTime(g.date)} — vs ${opp}`;
}

/* ------------- boot ------------- */
async function boot(){
  try{
    const [schedule, meta, live] = await Promise.all([
      getJSON("/data/schedule.json", []),
      getJSON("/data/meta.json", { lastUpdated: null }),
      getJSON("/data/scoreboard.json", null)
    ]);

    fullSchedule = schedule || [];
    paintSchedule(fullSchedule);
    $("#data-updated").textContent = meta?.lastUpdated
      ? new Date(meta.lastUpdated).toLocaleString()
      : "—";

    nextGame = pickNextGame(fullSchedule);
    paintNext(nextGame);
    paintTickerSmall(nextGame);
    if (nextGame?.date) startCountdown(nextGame.date);

    paintLiveBox(live);
  }catch(err){
    console.error("boot error", err);
  }
}

document.addEventListener("DOMContentLoaded", () => {
  wireScheduleToggle();
  boot();
});

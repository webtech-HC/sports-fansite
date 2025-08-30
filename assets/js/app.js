/* =========================================================
   App bootstrap (schedule paging + theme-safe helpers)
   ========================================================= */

const TEAM = "Tennessee";

/* ---------- tiny DOM helpers ---------- */
const $  = (sel, el=document) => el.querySelector(sel);
const $$ = (sel, el=document) => [...el.querySelectorAll(sel)];

/* ---------- date helpers ---------- */
const isValidISO = (iso) => {
  if (!iso) return false;
  const d = new Date(iso);
  return !isNaN(d.valueOf());
};

const fmtDateOnly = (iso) => {
  if (!isValidISO(iso)) return "TBA";
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    weekday: "short"
  });
};

/* ---------- idempotent JSON fetch with fallback ---------- */
const getJSON =
  window.getJSON ||
  (window.getJSON = async function (path, fallback = null) {
    try {
      const res = await fetch(path, { cache: "no-store" });
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
      return await res.json();
    } catch (err) {
      console.warn("getJSON fallback:", path, err.message);
      return fallback;
    }
  });

/* ---------- schedule paging state ---------- */
const PAGE_SIZE = 3;
let SCHEDULE = [];
let schedPage = 1;

/* ---------- render: next game line (optional headline) ---------- */
function pickNextGame(list = []) {
  const now = Date.now();
  return (list || [])
    .filter(g => isValidISO(g.start))
    .filter(g => new Date(g.start).getTime() >= now)
    .sort((a,b) => new Date(a.start) - new Date(b.start))[0] || null;
}

function paintNextHeadline(list = []) {
  const next = pickNextGame(list);
  const el = $("#nextLine");
  if (!el) return;
  if (!next) { el.textContent = "No upcoming game found."; return; }
  const isHome = next.home === TEAM;
  const opponent = isHome ? next.away : next.home;
  const when = fmtDateOnly(next.start);
  el.innerHTML = `<strong>${TEAM} vs ${opponent}</strong><br><span class="muted">${when}</span>`;
}

/* ---------- render: schedule table with progressive reveal ---------- */
function paintSchedule(list = [], page = 1) {
  const tbody = $("#sched");
  if (!tbody) return;

  if (list && list.length && SCHEDULE.length === 0) SCHEDULE = list.slice();

  const end   = PAGE_SIZE * page;
  const slice = (list || []).slice(0, end);

  const rows = slice.map((g) => {
    const homeTeam = g.home;
    const awayTeam = g.away;
    const isHome = homeTeam === TEAM;
    const opponent = isHome ? awayTeam : homeTeam;

    let result = "—";
    if (typeof g.home_points === "number" && typeof g.away_points === "number") {
      const my  = isHome ? g.home_points : g.away_points;
      const opp = isHome ? g.away_points : g.home_points;
      result = `${my}–${opp}`;
    }

    const tv = g.tv || "—";
    const date = fmtDateOnly(g.start);

    return `
      <tr>
        <td>${date}</td>
        <td>${opponent}</td>
        <td>${isHome ? "H" : "A"}</td>
        <td>${tv}</td>
        <td>${result}</td>
      </tr>`;
  }).join("");

  tbody.innerHTML = rows || "";

  const moreBtn = $("#btnMoreSched");
  if (moreBtn) {
    const allShown = slice.length >= (list || []).length;
    moreBtn.hidden = allShown;
  }
}

/* ---------- boot ---------- */
async function boot(){
  // Wire the “show more” once
  const moreBtn = $("#btnMoreSched");
  if (moreBtn && !moreBtn.__wired) {
    moreBtn.__wired = true;
    moreBtn.addEventListener("click", () => {
      schedPage += 1;
      paintSchedule(SCHEDULE, schedPage);
    });
  }

  try {
    const [schedule, meta] = await Promise.all([
      getJSON("data/schedule.json", []),
      getJSON("data/meta.json", { lastUpdated: null })
    ]);

    // Set meta stamp
    const stamp = meta?.lastUpdated
      ? new Date(meta.lastUpdated).toLocaleString()
      : "—";
    const lu = document.querySelectorAll("[data-last-updated]");
    lu.forEach((n) => (n.textContent = stamp));

    // Seed + paint
    SCHEDULE = schedule || [];
    schedPage = 1;
    paintNextHeadline(SCHEDULE);
    paintSchedule(SCHEDULE, schedPage);
  } catch (err) {
    console.error("boot error", err);
    const t = $(".three-up .muted");
    if (t) t.textContent = "Live data unavailable right now.";
  }
}

document.addEventListener("DOMContentLoaded", boot);

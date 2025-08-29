/* app.js — Tennessee Gameday Hub (Unofficial) */

const TEAM = "Tennessee";

/* ------------- tiny DOM utils ------------- */
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

/* ------------- date helpers ------------- */
const isValidISO = (iso) => !!iso && !Number.isNaN(Date.parse(iso));
const fmtDateOnly = (iso) => {
  if (!isValidISO(iso)) return "TBA";
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, {
    month: "short", day: "numeric", weekday: "short",
  });
};
const fmtTime = (iso) => {
  if (!isValidISO(iso)) return "TBA";
  return new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
};

/* ------------- base path util (GitHub Pages safe) ------------- */
function addBase(path) {
  // On *.github.io/repo/... we need “/repo” as the base.
  if (location.hostname.endsWith("github.io")) {
    const parts = location.pathname.split("/").filter(Boolean);
    const repo = parts.length ? `/${parts[0]}` : "";
    return `${repo}${path}`;
  }
  return path;
}

/* ------------- Shared JSON helper (idempotent) ------------- */
const getJSON = window.getJSON || (window.getJSON = async function(path, fallback = null) {
  try {
    // try with computed base first
    let res = await fetch(addBase(path), { cache: "no-store" });
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    return await res.json();
  } catch (err) {
    console.warn("getJSON fallback:", path, String(err));
    try {
      // local fallback (useful in dev/alternate hosting)
      const res2 = await fetch(path, { cache: "no-store" });
      if (!res2.ok) throw new Error(`${res2.status} ${res2.statusText}`);
      return await res2.json();
    } catch {
      return fallback;
    }
  }
});

/* ------------- painters / builders ------------- */
function paintSchedule(list = []) {
  const tbody = $("#sched");
  if (!tbody) return;
  const rows = list
    .filter(g => g && (g.home === TEAM || g.away === TEAM))
    .map(g => {
      const isHome = g.home === TEAM;
      const opponent = isHome ? g.away : g.home;
      const ha = isHome ? "H" : (g.away === TEAM ? "A" : "N");
      const when = `${fmtDateOnly(g.start)} ${fmtTime(g.start)}`;
      let result = "–";
      if (typeof g.home_points === "number" && typeof g.away_points === "number") {
        const my = isHome ? g.home_points : g.away_points;
        const other = isHome ? g.away_points : g.home_points;
        result = `${my}-${other}`;
      }
      const tv = g.tv ?? g.tv_network ?? (g.channels ? g.channels.join(", ") : "") || "";
      return `<tr>
        <td>${when}</td>
        <td>${opponent}</td>
        <td>${ha}</td>
        <td>${tv}</td>
        <td>${result}</td>
      </tr>`;
    })
    .join("");
  tbody.innerHTML = rows || `<tr><td colspan="5" class="muted">No games yet.</td></tr>`;
}

function pickNextGame(list = []) {
  const now = Date.now();
  const future = list
    .filter(g => isValidISO(g.start))
    .filter(g => new Date(g.start).getTime() >= now)
    .sort((a, b) => new Date(a.start) - new Date(b.start));
  return future[0] || null;
}

function paintNextCard(g) {
  const match = $("#nextMatch"), t = $("#nextTime"), v = $("#nextVenue"), btn = $("#btnAddCal");
  if (!g) {
    if (match) match.textContent = "No upcoming game found.";
    if (btn) btn.disabled = true;
    return;
  }
  const isHome = g.home === TEAM;
  const opponent = isHome ? g.away : g.home;
  if (match) match.textContent = `${TEAM} vs ${opponent}`;
  if (t) t.textContent = `${fmtDateOnly(g.start)}, ${fmtTime(g.start)}`;
  if (v) v.textContent = g.venue?.name ? `${g.venue.name}${g.venue.city ? ` — ${g.venue.city}` : ""}` : "";
  if (btn) {
    btn.disabled = false;
    btn.onclick = () => downloadICS(g, opponent, isHome);
  }
}

function setLastUpdated(meta) {
  const el = $(".date-last-updated");
  if (!el || !meta) return;
  const when = meta.lastUpdated || meta.updated || meta.time || null;
  el.textContent = when ? new Date(when).toLocaleString() : "—";
}

/* ------------- ICS download ------------- */
function downloadICS(g, opponent, isHome) {
  const dtStart = isValidISO(g.start) ? new Date(g.start) : null;
  const dtEnd = dtStart ? new Date(dtStart.getTime() + 3 * 3600 * 1000) : null; // 3h block
  const summary = `${TEAM} ${isHome ? "vs" : "at"} ${opponent}`;
  const loc = [g.venue?.name, g.venue?.city, g.venue?.state].filter(Boolean).join(", ");
  const ics = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Gameday Hub//TN//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${(g.id || Date.now())}@tn-hub`,
    `DTSTAMP:${new Date().toISOString().replace(/[-:.]/g, "").slice(0, 15)}Z`,
    dtStart ? `DTSTART:${dtStart.toISOString().replace(/[-:.]/g, "").slice(0, 15)}Z` : "",
    dtEnd ? `DTEND:${dtEnd.toISOString().replace(/[-:.]/g, "").slice(0, 15)}Z` : "",
    `SUMMARY:${summary}`,
    `LOCATION:${loc}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ]
  .filter(Boolean)
  .join("\r\n");

  const blob = new Blob([ics], { type: "text/calendar" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${summary.replace(/\s+/g, "_")}.ics`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 800);
}

/* ------------- guarded boot (idempotent) ------------- */
async function boot() {
  if (window.__APP_BOOTED__) return;
  window.__APP_BOOTED__ = true;

  try {
    const [schedule, meta] = await Promise.all([
      getJSON("/data/schedule.json", []),
      getJSON("/data/meta.json", { lastUpdated: null }),
    ]);

    paintSchedule(schedule || []);
    paintNextCard(pickNextGame(schedule || []));
    setLastUpdated(meta);
  } catch (err) {
    console.error("boot error:", err);
    const t = $(".date-last-updated");
    if (t) t.textContent = "Live data unavailable right now.";
  }
}
document.addEventListener("DOMContentLoaded", boot);

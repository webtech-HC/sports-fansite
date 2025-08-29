/* assets/js/app.js
   Front page + shared helpers: schedule table, “upcoming game” card,
   add-to-calendar, and last-updated. Focused on Tennessee only.
*/

"use strict";

// ------------------------------
// Tiny DOM helpers
// ------------------------------
const $  = (sel, ctx = document) => ctx.querySelector(sel);
const $$ = (sel, ctx = document) => Array.from(ctx.querySelectorAll(sel));

// Guarded text helper (tries several selectors safely)
function setText(targets, txt) {
  (Array.isArray(targets) ? targets : [targets])
    .map((t) => (typeof t === "string" ? $(t) : t))
    .filter(Boolean)
    .forEach((el) => (el.textContent = txt));
}

// ------------------------------
// Constants
// ------------------------------
const TEAM = "Tennessee";

// ------------------------------
// Date helpers
// ------------------------------
const isValidISO = (iso) => {
  if (!iso) return false;
  const d = new Date(iso);
  return !Number.isNaN(d.valueOf());
};

const fmtDateTime = (iso) => {
  if (!isValidISO(iso)) return "TBA";
  const d = new Date(iso);
  // Example: Wed, Sep 4 • 7:30 PM
  return d.toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
};

const fmtDateOnly = (iso) => {
  if (!isValidISO(iso)) return "TBA";
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    weekday: "short",
  });
};

// ------------------------------
// Shared JSON helper (idempotent)
// ------------------------------
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

// ------------------------------
// UI painters
// ------------------------------

// Fill the schedule table (#sched) with rows
function paintSchedule(list) {
  const tbody = $("#sched");
  if (!tbody) return;

  const rows = (list || []).map((g) => {
    const homeTeam = g.home;
    const awayTeam = g.away;
    const isHome = homeTeam === TEAM;
    const opponent = isHome ? awayTeam : homeTeam;

    // Result if points present
    let result = "—";
    if (typeof g.home_points === "number" && typeof g.away_points === "number") {
      const my = isHome ? g.home_points : g.away_points;
      const opp = isHome ? g.away_points : g.home_points;
      if (my > opp) result = `W ${my}-${opp}`;
      else if (my < opp) result = `L ${my}-${opp}`;
      else result = `T ${my}-${opp}`;
    }

    const ha = g.neutral_site ? "N" : isHome ? "Home" : "Away";
    const tv = g.tv || "TBD";

    return `<tr>
      <td>${fmtDateOnly(g.start)}</td>
      <td>${opponent || "TBD"}</td>
      <td>${ha}</td>
      <td>${tv}</td>
      <td>${result}</td>
    </tr>`;
  });

  tbody.innerHTML = rows.join("") || `<tr><td colspan="5">No games yet.</td></tr>`;
}

// Choose the next upcoming (future) game for Tennessee
function pickNextGame(list) {
  const now = Date.now();
  const games = (list || []).filter((g) => g.home === TEAM || g.away === TEAM);
  // Sort by start date/time
  games.sort((a, b) => {
    const ta = new Date(a.start).valueOf();
    const tb = new Date(b.start).valueOf();
    return ta - tb;
  });
  return games.find((g) => new Date(g.start).valueOf() > now) || null;
}

// Paint the hero “Upcoming Game” card
function paintQuick(game) {
  if (!game) {
    setText(["#who", "[data-who]"], "Tennessee — Next game TBA");
    setText(["#when", "[data-when]"], "Date/Time TBA");
    setText(["#where", "[data-where]"], "Venue TBA");
    return;
  }

  const isHome = game.home === TEAM;
  const opponent = isHome ? game.away : game.home;

  setText(["#who", "[data-who]"], `Tennessee vs ${opponent || "TBD"}`);
  setText(["#when", "[data-when]"], fmtDateTime(game.start));

  const venue = game.venue || {};
  const venueText =
    venue.name ||
    [venue.city, venue.state].filter(Boolean).join(", ") ||
    (isHome ? "Knoxville, TN" : "TBA");
  setText(["#where", "[data-where]"], venueText);

  // Wire "Add to Calendar" button if present
  wireAddToCal(game);
}

// Footer: last updated timestamp
function setLastUpdated(meta) {
  const stampEls = $$(".date-last-updated");
  if (!stampEls.length) return;

  const iso = meta && meta.lastUpdated;
  const txt = iso ? new Date(iso).toLocaleString() : "—";
  stampEls.forEach((el) => (el.textContent = txt));
}

// ------------------------------
// Add-to-calendar (.ics) wiring
// ------------------------------
function wireAddToCal(game) {
  const btn =
    $("#addToCalendar") ||
    $("[data-add-to-cal]") ||
    $("#iCal") ||
    $("#ical");

  if (!btn || !game) return;

  btn.addEventListener(
    "click",
    (ev) => {
      ev.preventDefault();

      // 3 hour default duration
      const start = isValidISO(game.start) ? new Date(game.start) : new Date();
      const end = new Date(start.valueOf() + 3 * 60 * 60 * 1000);

      const isHome = game.home === TEAM;
      const opponent = isHome ? game.away : game.home;
      const tv = game.tv || "TBD";

      const venue = game.venue || {};
      const loc =
        venue.name ||
        [venue.city, venue.state].filter(Boolean).join(", ") ||
        (isHome ? "Knoxville, TN" : "TBD");

      const pad = (n) => String(n).padStart(2, "0");
      const dt = (d) =>
        `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(
          d.getUTCHours()
        )}${pad(d.getUTCMinutes())}00Z`;

      const summary = `Tennessee vs ${opponent || "TBD"}`;
      const description = [
        `TV: ${tv}`,
        game.neutral_site ? "Neutral site" : isHome ? "Home game" : "Away game",
      ]
        .filter(Boolean)
        .join(" • ");

      const ics = [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "PRODID:-//Gameday Hub//Fansite//EN",
        "BEGIN:VEVENT",
        `UID:${game.id || Date.now()}@gamedayhub`,
        `DTSTAMP:${dt(new Date())}`,
        `DTSTART:${dt(start)}`,
        `DTEND:${dt(end)}`,
        `SUMMARY:${summary}`,
        `LOCATION:${loc}`,
        `DESCRIPTION:${description}`,
        "END:VEVENT",
        "END:VCALENDAR",
      ].join("\r\n");

      const blob = new Blob([ics], { type: "text/calendar" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${summary.replace(/\s+/g, "_")}.ics`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 800);
    },
    { once: true } // don’t attach repeatedly across reloads
  );
}

// ------------------------------
// Home boot (renamed to avoid collisions)
// ------------------------------
const startHome = async () => {
  try {
    const [schedule, meta] = await Promise.all([
      getJSON("/data/schedule.json", []),
      getJSON("/data/meta.json", { lastUpdated: null }),
    ]);

    paintSchedule(schedule ?? []);
    const next = pickNextGame(schedule ?? []);
    paintQuick(next);
    setLastUpdated(meta);
  } catch (err) {
    console.error("home boot error", err);
    const t = $(".ticker-inner");
    if (t) t.textContent = "Live data unavailable right now.";
  }
};

// Run once whether DOM is ready or already loaded
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", startHome, { once: true });
} else {
  startHome();
}

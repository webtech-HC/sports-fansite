/* assets/js/app.js
   Tennessee Gameday Hub — front page helpers
   Safe, no-build JS (idempotent; can be included once per page)
*/

(() => {
  "use strict";

  // -------- constants
  const TEAM = "Tennessee";                // filter to UT Vols only
  const DATA_DIR = "/sports-fansite/data"; // GitHub Pages base
  const NOW = () => new Date();

  // -------- tiny DOM helpers
  const $ = (sel, el = document) => el.querySelector(sel);
  const $$ = (sel, el = document) => Array.from(el.querySelectorAll(sel));

  // -------- time/date helpers
  const isValidISO = (iso) => {
    if (!iso || typeof iso !== "string") return false;
    const d = new Date(iso);
    return !Number.isNaN(d.valueOf());
  };

  const fmtTime = (iso) => {
    if (!isValidISO(iso)) return "TBA";
    const d = new Date(iso);
    return d.toLocaleTimeString(undefined, {
      hour: "numeric",
      minute: "2-digit"
    });
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

  // -------- networking (simple & safe)
  // Avoid "const x = window.x || ..." to keep older parsers happy.
  if (!window.getJSON) {
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
  const getJSON = window.getJSON;

  // -------- painters

  // Fill the schedule table (#sched) with rows
  function paintSchedule(list) {
    const tbody = $("#sched");
    if (!tbody) return;

    const rows = (list || []).map((g) => {
      const homeTeam = g.home;
      const awayTeam = g.away;
      const isHome = homeTeam === TEAM;
      const opponent = isHome ? awayTeam : homeTeam;

      // Result (if points present)
      let result = "—";
      if (typeof g.home_points === "number" && typeof g.away_points === "number") {
        const my = isHome ? g.home_points : g.away_points;
        const opp = isHome ? g.away_points : g.home_points;
        result = `${my}–${opp}`;
      }

      const tv = g.tv ?? "TBD";
      const when = isValidISO(g.start_date) ? `${fmtDateOnly(g.start_date)} ${fmtTime(g.start_date)}` : "TBA";

      return `<tr>
        <td>${when}</td>
        <td>${opponent}</td>
        <td>${isHome ? "H" : "A"}</td>
        <td>${tv}</td>
        <td>${result}</td>
      </tr>`;
    });

    tbody.innerHTML = rows.join("") || `<tr><td colspan="5">No games to show.</td></tr>`;
  }

  // Pick the next upcoming game for Tennessee
  function pickNextGame(list) {
    const now = NOW();
    const upcoming = (list || [])
      .filter(g => g && isValidISO(g.start_date))
      .filter(g => g.home === TEAM || g.away === TEAM)
      .sort((a, b) => new Date(a.start_date) - new Date(b.start_date))
      .find(g => new Date(g.start_date) > now) || null;
    return upcoming;
  }

  // Paint the "Upcoming Game" card
  function paintQuick(next) {
    const card = $("#quick");
    if (!card) return;

    if (!next) {
      const hd = card.querySelector("[data-line='headline']");
      const sub = card.querySelector("[data-line='sub']");
      if (hd) hd.textContent = "Loading...";
      if (sub) sub.textContent = "";
      return;
    }

    const isHome = next.home === TEAM;
    const opponent = isHome ? next.away : next.home;
    const when = isValidISO(next.start_date)
      ? `${fmtDateOnly(next.start_date)} • ${fmtTime(next.start_date)}`
      : "TBA";
    const venue = next.venue && next.venue.city ? `${next.venue.city}, ${next.venue.state ?? ""}`.trim() : (isHome ? "Knoxville, TN" : "");

    const hd = card.querySelector("[data-line='headline']");
    const sub = card.querySelector("[data-line='sub']");
    if (hd) hd.textContent = `${TEAM} vs ${opponent}`;
    if (sub) sub.textContent = when + (venue ? ` — ${venue}` : "");

    // Add-to-calendar button (ics)
    const btn = $("#addToCalendar");
    if (btn) {
      btn.disabled = !isValidISO(next.start_date);
      btn.onclick = () => {
        if (!isValidISO(next.start_date)) return;
        const dtStart = new Date(next.start_date);
        const dtEnd = new Date(dtStart.getTime() + 3 * 3600 * 1000); // 3h block
        const pad = (n) => String(n).padStart(2, "0");
        const fmt = (d) =>
          d.getUTCFullYear().toString() +
          pad(d.getUTCMonth()+1) +
          pad(d.getUTCDate()) + "T" +
          pad(d.getUTCHours()) +
          pad(d.getUTCMinutes()) +
          pad(d.getUTCSeconds()) + "Z";
        const ics = [
          "BEGIN:VCALENDAR",
          "VERSION:2.0",
          "PRODID:-//HC Web Labs//Gameday//EN",
          "BEGIN:VEVENT",
          `UID:${Date.now()}@gameday`,
          `DTSTAMP:${fmt(new Date())}`,
          `DTSTART:${fmt(dtStart)}`,
          `DTEND:${fmt(dtEnd)}`,
          `SUMMARY:${TEAM} vs ${opponent}`,
          `LOCATION:${venue || ""}`,
          "END:VEVENT",
          "END:VCALENDAR"
        ].join("\r\n");

        const blob = new Blob([ics], { type: "text/calendar" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${TEAM}-vs-${opponent}`.replace(/\s+/g,"_") + ".ics";
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 800);
      };
    }
  }

  // Last-updated stamp in footer/header
  function setLastUpdated(meta) {
    const el = $("[data-last-updated]");
    if (!el) return;
    const iso = meta?.lastUpdated || new Date().toISOString();
    el.textContent = isValidISO(iso)
      ? new Date(iso).toLocaleString()
      : "—";
  }

  // Paint the Live Score Box from /data/scoreboard.json
  function paintLiveScore(score) {
    const box = $("#livebox");
    if (!box) return;

    const home = score?.homeTeam;
    const away = score?.awayTeam;
    const status = score?.status;
    const isTennGame = (home === TEAM || away === TEAM);

    const matchEl = box.querySelector("[data-line='match']");
    const statusEl = box.querySelector("[data-line='status']");
    const scoreEl = box.querySelector("[data-line='score']");

    if (!isTennGame) {
      if (matchEl) matchEl.textContent = TEAM;
      if (statusEl) statusEl.textContent = "No game in progress.";
      if (scoreEl) scoreEl.textContent = "—";
      return;
    }

    const usHome = home === TEAM;
    const my = usHome ? score.home_points : score.away_points;
    const opp = usHome ? score.away_points : score.home_points;
    const oppName = usHome ? away : home;

    if (matchEl) matchEl.textContent = `${TEAM} vs ${oppName}`;
    if (statusEl) statusEl.textContent = status || "In progress";
    if (scoreEl) scoreEl.textContent =
      (typeof my === "number" && typeof opp === "number") ? `${my}–${opp}` : "—";
  }

  // -------- boot (safe, idempotent)
  async function boot() {
    try {
      // Load data (gracefully handles 404s)
      const [schedule, meta, board] = await Promise.all([
        getJSON(`${DATA_DIR}/schedule.json`, []),
        getJSON(`${DATA_DIR}/meta.json`, { lastUpdated: null }),
        getJSON(`${DATA_DIR}/scoreboard.json?t=${Date.now()}`, null)
      ]);

      // Tennessee-only list
      const vols = (schedule || []).filter(g => g.home === TEAM || g.away === TEAM);

      // Paint
      paintSchedule(vols);
      paintQuick(pickNextGame(vols));
      setLastUpdated(meta);

      if (board) paintLiveScore(board);

    } catch (err) {
      console.error("boot error", err);
      const t = $(".ticker-inner");
      if (t) t.textContent = "Live data unavailable right now.";
    }
  }

  // Only wire once if someone double-loads the script
  if (!window.__APP_BOOT_WIRED__) {
    window.__APP_BOOT_WIRED__ = true;
    document.addEventListener("DOMContentLoaded", boot, { once: true });
  }
})();

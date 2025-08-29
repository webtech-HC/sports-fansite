/* eslint-disable no-console */
(() => {
  "use strict";

  // ------------------------------
  // Site / team constants
  // ------------------------------
  const TEAM = "Tennessee"; // UT Vols only

  // ------------------------------
  // Small DOM helpers
  // ------------------------------
  const $  = (sel, ctx = document) => ctx.querySelector(sel);
  const $$ = (sel, ctx = document) => [...ctx.querySelectorAll(sel)];
  const setText = (sel, txt, ctx = document) => { const el = $(sel, ctx); if (el) el.textContent = txt; };
  const pad = (n) => String(n).padStart(2, "0");

  // ------------------------------
  // Dates
  // ------------------------------
  const isValidISO = (v) => {
    if (!v || typeof v !== "string") return false;
    const d = new Date(v);
    return !Number.isNaN(d.valueOf());
  };
  const fmtDateOnly = (iso) => {
    if (!isValidISO(iso)) return "TBA";
    return new Date(iso).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      weekday: "short",
    });
  };

  // ------------------------------
  // Shared JSON helper (idempotent)
  //  - Reuses window.getJSON if it exists
  //  - Auto-prefixes the repo base path (GitHub Pages)
  // ------------------------------
  const getJSON =
    window.getJSON ||
    (window.getJSON = async function getJSON(path, fallback = null) {
      try {
        // Build a URL that respects GitHub Pages subdirectory
        let url = path;
        if (!/^https?:\/\//i.test(path)) {
          const base = location.pathname.replace(/[^/]+$/, ""); // '/sports-fansite/'
          url = base + path.replace(/^\//, "");                  // 'data/schedule.json' -> '/sports-fansite/data/schedule.json'
        }
        const res = await fetch(url, { cache: "no-store" });
        if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
        return await res.json();
      } catch (err) {
        console.warn("getJSON fallback:", path, err.message);
        return fallback;
      }
    });

  // ------------------------------
  // Paint: Schedule table (home page)
  // ------------------------------
  function paintSchedule(list) {
    const tbody = $("#sched");
    if (!tbody) return;

    const rows = (list || []).map((g) => {
      const homeTeam = g.home;
      const awayTeam = g.away;
      const isHome   = homeTeam === TEAM;
      const opponent = isHome ? awayTeam : homeTeam;

      // Score (if finished or in-progress)
      let result = "–";
      if (typeof g.home_points === "number" && typeof g.away_points === "number") {
        const my = isHome ? g.home_points : g.away_points;
        const op = isHome ? g.away_points : g.home_points;
        result = `${my}-${op}`;
      }

      const loc = isHome ? "Home" : "Away";
      const tv  = g.tv || "TBD";
      return `<tr>
        <td>${fmtDateOnly(g.start)}</td>
        <td>${opponent || "TBD"}</td>
        <td class="muted">${loc}</td>
        <td class="muted">${tv}</td>
        <td>${result}</td>
      </tr>`;
    });

    tbody.innerHTML = rows.join("") || `<tr><td colspan="5" class="muted">No games yet.</td></tr>`;
  }

  // ------------------------------
  // Compute next upcoming game (for hero card / countdown)
  // ------------------------------
  function pickNextGame(list) {
    const now = Date.now();
    return (list || [])
      .map((g) => ({ ...g, _ts: isValidISO(g.start) ? new Date(g.start).getTime() : null }))
      .filter((g) => g._ts !== null && g._ts > now)
      .sort((a, b) => a._ts - b._ts)[0] || null;
  }

  // ------------------------------
  // Paint: “Upcoming Game” card (be tolerant if elements missing)
  // ------------------------------
  function paintQuick(next) {
    if (!next) {
      setText("#gOpponent", "TBD");
      setText("#gVenue", "TBA");
      setText("#gDate", "—");
      return;
    }
    const isHome   = next.home === TEAM;
    const opponent = isHome ? next.away : next.home;
    const venue    = isHome ? "Knoxville, TN" : (next.venue && next.venue.name) || "TBA";

    setText("#gOpponent", opponent || "TBD");
    setText("#gVenue", venue);
    setText("#gDate", fmtDateOnly(next.start));
  }

  // ------------------------------
  // Last-updated footer helper
  // ------------------------------
  function setLastUpdated(meta) {
    const slot = document.querySelector("[data-last-updated]");
    if (!slot) return;
    const when = meta && meta.lastUpdated ? new Date(meta.lastUpdated) : null;
    slot.textContent = when ? when.toLocaleString() : "—";
  }

  // ------------------------------
  // Export: .ics (optional existing UI)
  // ------------------------------
  function downloadICS(summary, dtStartISO, dtEndISO, loc = "", description = "") {
    // Guard for pages that don’t expose an “Add to Calendar” UI
    const start = isValidISO(dtStartISO) ? new Date(dtStartISO) : null;
    const end   = isValidISO(dtEndISO) ? new Date(dtEndISO) : null;
    if (!start || !end) return;

    const fmtICS = (d) =>
      `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}00Z`;

    const ics = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//HC Web//sports-fansite//EN",
      "CALSCALE:GREGORIAN",
      "BEGIN:VEVENT",
      `DTSTART:${fmtICS(start)}`,
      `DTEND:${fmtICS(end)}`,
      `SUMMARY:${summary}`,
      `LOCATION:${loc}`,
      `DESCRIPTION:${description}`,
      "END:VEVENT",
      "END:VCALENDAR",
    ].join("\r\n");

    const blob = new Blob([ics], { type: "text/calendar" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href = url;
    a.download = `${summary.replace(/\s+/g, "_")}.ics`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 800);
  }

  // ------------------------------
  // Boot (idempotent)
  // ------------------------------
  if (!("boot" in window)) {
    window.boot = async function boot() {
      try {
        const [schedule, meta] = await Promise.all([
          getJSON("data/schedule.json", []),
          getJSON("data/meta.json", { lastUpdated: null }),
        ]);

        paintSchedule(schedule || []);
        const next = pickNextGame(schedule || []);
        paintQuick(next);
        setLastUpdated(meta);
      } catch (err) {
        console.error("boot error:", err);
        const t = $(".ticker-inner");
        if (t) t.textContent = "Live data unavailable right now.";
      }
    };
  }

  // It’s safe to attach this listener more than once; the handler is the same function reference.
  document.addEventListener("DOMContentLoaded", window.boot);
})();


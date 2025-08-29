/* ==========================================================================
   TENNESSEE • Gameday Hub (front page)
   - robust JSON loader that works on GitHub Pages
   - idempotent guards (safe if script is loaded twice)
   - upcoming game, countdown, schedule table, add-to-calendar, last-updated
   ========================================================================== */

(() => {
  "use strict";

  // -------------------------------------------------------
  // Small DOM helpers (install once/idempotent)
  // -------------------------------------------------------
  if (!window.$) {
    window.$ = (sel, ctx = document) => ctx.querySelector(sel);
  }
  if (!window.$$) {
    window.$$ = (sel, ctx = document) => Array.from(ctx.querySelectorAll(sel));
  }
  const setText = (sel, txt, ctx = document) => {
    const el = $(sel, ctx);
    if (el) el.textContent = txt ?? "";
  };

  // -------------------------------------------------------
  // Constants
  // -------------------------------------------------------
  const TEAM = "Tennessee";

  // -------------------------------------------------------
  // Date helpers
  // -------------------------------------------------------
  const isValidISO = (v) => {
    if (!v) return false;
    const d = new Date(v);
    return !Number.isNaN(d.valueOf());
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

  const fmtTime = (iso) => {
    if (!isValidISO(iso)) return "TBA";
    const d = new Date(iso);
    return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  };

  // -------------------------------------------------------
  // Countdown helpers
  // -------------------------------------------------------
  const pad = (n) => String(Math.max(0, n | 0)).padStart(2, "0");

  const untilParts = (iso) => {
    if (!isValidISO(iso)) return { d: 0, h: 0, m: 0, s: 0 };
    const now = Date.now();
    const ms = Math.max(0, new Date(iso).valueOf() - now);
    const d = Math.floor(ms / 86400000);
    const h = Math.floor((ms % 86400000) / 3600000);
    const m = Math.floor((ms % 3600000) / 60000);
    const s = Math.floor((ms % 60000) / 1000);
    return { d, h, m, s };
  };

  let countdownTimer = null;
  function stopCountdown() {
    if (countdownTimer) {
      clearInterval(countdownTimer);
      countdownTimer = null;
    }
  }
  function startCountdown(iso) {
    stopCountdown();
    if (!isValidISO(iso)) return;

    const tick = () => {
      const { d, h, m, s } = untilParts(iso);
      setText("#cdD", pad(d));
      setText("#cdH", pad(h));
      setText("#cdM", pad(m));
      setText("#cdS", pad(s));
    };

    tick();
    countdownTimer = setInterval(tick, 1000);
  }

  // -------------------------------------------------------
  // Idempotent JSON loader + path resolver for GitHub Pages
  // -------------------------------------------------------
  (function installGetJSONOnce() {
    if (window.getJSON) return;

    function assetURL(p) {
      const path = String(p || "");

      // Absolute http(s) URL — return as-is.
      if (/^https?:\/\//i.test(path)) return path;

      // Determine the repo segment, e.g. "/sports-fansite"
      const seg = (location.pathname.split("/")[1] || "");
      const repo = seg ? `/${seg}` : "";

      // If already starts with "/sports-fansite/..." keep from origin.
      if (repo && path.startsWith(`${repo}/`)) return location.origin + path;

      // Leading slash → treat as project-root, not domain root.
      if (path.startsWith("/")) return location.origin + repo + path;

      // Relative path like "data/foo.json"
      return `${location.origin}${repo}/${path}`;
    }

    window.getJSON = async function getJSON(path, fallback = null) {
      try {
        const url = assetURL(path);
        const res = await fetch(url, { cache: "no-store" });
        if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
        return await res.json();
      } catch (err) {
        console.warn(`getJSON fallback: ${path} 404`, err);
        return fallback;
      }
    };
  })();

  // -------------------------------------------------------
  // UI painters
  // -------------------------------------------------------
  function paintSchedule(list) {
    const tbody = $("#sched");
    if (!tbody) return;

    const rows = (list || []).map((g) => {
      const homeTeam = g?.home;
      const awayTeam = g?.away;
      const isHome = homeTeam === TEAM;
      const opponent = isHome ? awayTeam : homeTeam;

      // Result if points present
      let result = "—";
      if (
        typeof g.home_points === "number" &&
        typeof g.away_points === "number"
      ) {
        const my = isHome ? g.home_points : g.away_points;
        const opp = isHome ? g.away_points : g.home_points;
        result = my > opp ? `W ${my}-${opp}` : my < opp ? `L ${my}-${opp}` : `T ${my}-${opp}`;
      }

      const ha = isHome ? "Home" : "Away";
      const tv = g?.tv || "TBD";
      const when = fmtDateOnly(g?.start_date);

      return `
        <tr>
          <td>${when}</td>
          <td>${opponent || ""}</td>
          <td>${ha}</td>
          <td>${tv}</td>
          <td>${result}</td>
        </tr>
      `;
    });

    tbody.innerHTML = rows.join("") || `
      <tr><td colspan="5" style="text-align:center">No games posted yet.</td></tr>
    `;
  }

  function pickNextGame(list) {
    const now = Date.now();
    return (list || [])
      .filter((g) => isValidISO(g?.start_date) && new Date(g.start_date).valueOf() > now)
      .sort((a, b) => new Date(a.start_date) - new Date(b.start_date))[0] || null;
  }

  function setLastUpdated(meta) {
    const t = $("[data-last-updated]");
    const iso = meta?.lastUpdated || null;
    const stamp = iso && isValidISO(iso)
      ? new Date(iso).toLocaleString()
      : new Date().toLocaleString();
    if (t) t.textContent = stamp;
  }

  // -------------------------------------------------------
  // Add-to-calendar (ICS)
  // -------------------------------------------------------
  const fmtICS = (d) =>
    new Date(d).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");

  function makeICS(next) {
    if (!next || !isValidISO(next.start_date)) return "";

    const isHome = next.home === TEAM;
    const opponent = isHome ? next.away : next.home;
    const summary = `${TEAM} vs ${opponent}`;
    const dtStart = fmtICS(next.start_date);

    // Guess 3h duration if no explicit end; you can refine later.
    const dtEnd = fmtICS(new Date(new Date(next.start_date).valueOf() + 3 * 3600 * 1000));
    const loc =
      next.venue?.name
        ? `${next.venue.name}${next.venue.city ? ", " + next.venue.city : ""}`
        : "TBA";

    return [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//HC Web Labs//Gameday Hub//EN",
      "CALSCALE:GREGORIAN",
      "METHOD:PUBLISH",
      "BEGIN:VEVENT",
      `UID:${TEAM}-${opponent}-${dtStart}@hc-weblabs`,
      `DTSTAMP:${fmtICS(new Date())}`,
      `DTSTART:${dtStart}`,
      `DTEND:${dtEnd}`,
      `SUMMARY:${summary}`,
      `LOCATION:${loc}`,
      "END:VEVENT",
      "END:VCALENDAR",
      "",
    ].join("\r\n");
  }

  function wireAddToCal(next) {
    const btn = $("#btnCal");
    if (!btn) return;

    if (!next || !isValidISO(next.start_date)) {
      btn.setAttribute("disabled", "true");
      return;
    }

    btn.removeAttribute("disabled");
    btn.addEventListener(
      "click",
      () => {
        const ics = makeICS(next);
        if (!ics) return;
        const blob = new Blob([ics], { type: "text/calendar" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${TEAM}-game.ics`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 800);
      },
      { once: true }
    );
  }

  function paintQuick(next) {
    if (!next) {
      setText("#upMatch", `${TEAM} vs TBA`);
      setText("#upWhen", "Date • Time TBA");
      setText("#upWhere", "Venue TBA");
      stopCountdown();
      wireAddToCal(null);
      return;
    }

    const isHome = next.home === TEAM;
    const opponent = isHome ? next.away : next.home;
    const when = `${fmtDateOnly(next.start_date)} · ${fmtTime(next.start_date)}`;
    const venue = next.venue?.name
      ? `${next.venue.name}${next.venue.city ? ", " + next.venue.city : ""}`
      : "TBA";

    setText("#upMatch", `${TEAM} vs ${opponent || "TBA"}`);
    setText("#upWhen", when);
    setText("#upWhere", venue);

    startCountdown(next.start_date);
    wireAddToCal(next);
  }

  // -------------------------------------------------------
  // Boot (idempotent)
  // -------------------------------------------------------
  (function installBootOnce() {
    if (window.boot) return;

    window.boot = async function boot() {
      try {
        // Use relative paths — getJSON() will resolve to the correct
        // "/sports-fansite/..." URLs on GitHub Pages.
        const [schedule, meta] = await Promise.all([
          getJSON("data/schedule.json", []),
          getJSON("data/meta.json", { lastUpdated: null }),
        ]);

        paintSchedule(schedule || []);
        const next = pickNextGame(schedule || []);
        paintQuick(next);
        setLastUpdated(meta);
      } catch (err) {
        console.error("boot error", err);
        const t = $(".ticker-inner");
        if (t) t.textContent = "Live data unavailable right now.";
      }
    };

    document.addEventListener("DOMContentLoaded", window.boot);
  })();
})();

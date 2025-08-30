/* Tennessee Fansite — app.js (Neyland weather + Google Calendar)
   - Central countdown (from next scheduled game)
   - Live weather via Open-Meteo (Neyland Stadium coords)
   - Schedule paint (3 rows + toggle on home; full list on schedule page)
   - Scoreboard polling from data/scoreboard.json (if present)
   - Google Calendar link for "Add to Calendar"
   - Mailto submit on Submit page
*/

(() => {
  if (window.__TN_APP_INIT__) return;
  window.__TN_APP_INIT__ = true;

  // --- Site constants ---
  const STADIUM = { lat: 35.9540, lon: -83.9250, name: "Neyland Stadium, Knoxville, TN" };

  const $ = (sel, ctx = document) => ctx.querySelector(sel);
  const $all = (sel, ctx = document) => Array.from(ctx.querySelectorAll(sel));

  const getJSON = async (path, fallback = null) => {
    try {
      const res = await fetch(path, { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (err) {
      console.warn("getJSON fallback:", path, err.message);
      return fallback;
    }
  };

  const isValidISO = (iso) => {
    if (!iso) return false;
    const d = new Date(iso);
    return !isNaN(d);
  };
  const fmtDate = (iso) => {
    if (!isValidISO(iso)) return "TBA";
    return new Date(iso).toLocaleDateString(undefined, {
      month: "short", day: "numeric", weekday: "short"
    });
  };

  /* ---------------- Countdown ---------------- */
  function startCountdown(targetISO) {
    const header = $("#countdown");
    const note = $("#nextGameNote");
    if (!header) return;

    if (!isValidISO(targetISO)) {
      header.innerHTML = `
        <span class="cd-pill">00</span><span class="cd-label">days</span>
        <span class="cd-pill">00</span><span class="cd-label">hrs</span>
        <span class="cd-pill">00</span><span class="cd-label">mins</span>
        <span class="cd-pill">00</span><span class="cd-label">secs</span>`;
      if (note) note.textContent = "Next game: TBA";
      return;
    }

    const target = new Date(targetISO).getTime();
    function tick() {
      const now = Date.now();
      const diff = Math.max(0, target - now);
      const s = Math.floor(diff / 1000);
      const days = Math.floor(s / 86400);
      const hrs = Math.floor((s % 86400) / 3600);
      const mins = Math.floor((s % 3600) / 60);
      const secs = s % 60;

      header.innerHTML = `
        <span class="cd-pill">${String(days).padStart(2,"0")}</span><span class="cd-label">days</span>
        <span class="cd-pill">${String(hrs).padStart(2,"0")}</span><span class="cd-label">hrs</span>
        <span class="cd-pill">${String(mins).padStart(2,"0")}</span><span class="cd-label">mins</span>
        <span class="cd-pill">${String(secs).padStart(2,"0")}</span><span class="cd-label">secs</span>`;
      if (diff <= 0) {
        if (note) note.textContent = "It’s gameday!";
        clearInterval(timer);
      }
    }
    tick();
    const timer = setInterval(tick, 1000);
  }

  /* ---------------- Schedule ---------------- */
  function normalizeGame(g) {
    const start = g.start || g.date || g.gameTime || g.startTime;
    const opponent = g.opponent || g.away_team || g.away || g.opponent_name;
    const homeName = g.home || g.home_team;
    const awayName = g.away || g.away_team || g.opponent;
    const isHome = homeName === "Tennessee" || g.isHome === true;
    const isAway = awayName === "Tennessee" || g.isAway === true;
    return {
      start, opponent, isHome, isAway,
      tv: g.tv || g.network || null,
      result: g.result || g.final || null
    };
  }

  function paintScheduleRows(list = [], tbody, limit = Infinity) {
    if (!tbody) return;
    tbody.innerHTML = "";
    const rows = list.slice(0, limit).map(g => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${fmtDate(g.start)}</td>
        <td>${g.opponent ?? "—"}</td>
        <td>${g.isHome ? "H" : (g.isAway ? "A" : "—")}</td>
        <td>${g.tv ?? "—"}</td>
        <td>${g.result ?? "—"}</td>`;
      return tr;
    });
    if (!rows.length) {
      const tr = document.createElement("tr");
      tr.innerHTML = `<td colspan="5">No games found.</td>`;
      tbody.appendChild(tr);
    } else rows.forEach(tr => tbody.appendChild(tr));
  }

  function pickNextGame(list = []) {
    const now = Date.now();
    const upcoming = list
      .filter(g => isValidISO(g.start) && new Date(g.start).getTime() > now)
      .sort((a,b) => new Date(a.start) - new Date(b.start));
    return upcoming[0] || null;
  }

  function setMetaUpdated(meta) {
    const el = $("#metaUpdated");
    if (!el) return;
    const stamp = (meta && meta.lastUpdated) ? new Date(meta.lastUpdated).toLocaleString() : new Date().toLocaleString();
    el.textContent = `Data updated — ${stamp}`;
  }

  /* ---------------- Google Calendar link ---------------- */
  function toGCalUTC(d){
    const pad = (n)=> String(n).padStart(2,"0");
    return (
      d.getUTCFullYear().toString() +
      pad(d.getUTCMonth()+1) +
      pad(d.getUTCDate()) + "T" +
      pad(d.getUTCHours()) +
      pad(d.getUTCMinutes()) +
      pad(d.getUTCSeconds()) + "Z"
    );
  }
  function openGoogleCal(nextGame){
    const btn = $("#addToCal");
    if (!btn || !nextGame || !isValidISO(nextGame.start)) { if (btn) btn.disabled = true; return; }
    btn.disabled = false;
    btn.addEventListener("click", () => {
      const start = new Date(nextGame.start);
      const end = new Date(start.getTime() + 3 * 3600_000); // +3h default
      const dates = `${toGCalUTC(start)}/${toGCalUTC(end)}`;
      const title = encodeURIComponent(`Tennessee vs ${nextGame.opponent || "Opponent"}`);
      const details = encodeURIComponent("Unofficial Tennessee Fansite — HC Web Labs");
      const location = encodeURIComponent(STADIUM.name);
      const url = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${title}&dates=${dates}&details=${details}&location=${location}&sf=true&output=xml`;
      window.open(url, "_blank", "noopener");
    });
  }

  /* ---------------- Weather (Open-Meteo @ Neyland) ---------------- */
  async function paintWeather() {
    const ul = $("#weatherList");
    const meta = $("#weatherMeta");
    if (!ul) return;

    try {
      const url =
        `https://api.open-meteo.com/v1/forecast?latitude=${STADIUM.lat}` +
        `&longitude=${STADIUM.lon}` +
        `&current_weather=true` +
        `&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max` +
        `&timezone=auto`;

      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) throw new Error(`Weather HTTP ${res.status}`);
      const j = await res.json();

      const cw = j.current_weather || {};
      const nowTemp = cw.temperature;            // °C
      const nowWindKmh = cw.windspeed;           // km/h
      const nowWindMph = typeof nowWindKmh === "number" ? Math.round(nowWindKmh * 0.621371) : null;

      const days = j.daily?.time || [];
      const tmax = j.daily?.temperature_2m_max || [];
      const tmin = j.daily?.temperature_2m_min || [];
      const ppop = j.daily?.precipitation_probability_max || [];

      const rows = [];
      if (typeof nowTemp === "number") {
        const nowF = Math.round(nowTemp * 9/5 + 32);
        rows.push(`<li><strong>Now</strong> — ${nowF}°F${nowWindMph != null ? ` · wind ${nowWindMph} mph` : ""}</li>`);
      }
      for (let i = 0; i < Math.min(3, days.length); i++) {
        const label = new Date(days[i]).toLocaleDateString(undefined,{weekday:"short"});
        const hiF = typeof tmax[i] === "number" ? Math.round(tmax[i] * 9/5 + 32) : "—";
        const loF = typeof tmin[i] === "number" ? Math.round(tmin[i] * 9/5 + 32) : "—";
        const rain = ppop[i] ?? 0;
        rows.push(`<li><strong>${label}</strong> — ${hiF}° / ${loF}° · ${rain}% rain</li>`);
      }

      ul.innerHTML = rows.join("") || "<li>No forecast.</li>";
      if (meta) meta.textContent = `${STADIUM.name} • Source: Open-Meteo • ${new Date().toLocaleTimeString()}`;
    } catch (e) {
      console.error("weather error", e);
      ul.innerHTML = "<li>Weather unavailable.</li>";
      if (meta) meta.textContent = "";
    }
  }

  /* ---------------- Scoreboard (poll /data/scoreboard.json) ---------------- */
  function paintScoreboard(data) {
    const statusEl = $("#scoreStatus");
    const grid = $("#scoreGrid");
    const homeLine = $("#homeLine");
    const awayLine = $("#awayLine");
    const state = $("#scoreState");
    if (!statusEl || !grid) return;

    const s = (data && (data.status || data.game_status || data.state)) || "none";
    const home = data?.home || data?.home_team || { name:"Tennessee", score:null };
    const away = data?.away || data?.away_team || { name:"Opponent", score:null };
    const clock = data?.clock || data?.time || "";

    const pretty = (t) => (t?.name || "—") + (t?.score != null ? ` ${t.score}` : "");

    if (s === "in_progress" || s === "final" || s === "pre") {
      statusEl.hidden = true;
      grid.hidden = false;
      homeLine.textContent = pretty(home);
      awayLine.textContent = pretty(away);
      state.textContent = s === "final" ? "Final" : (clock || s.replace("_"," "));
    } else {
      grid.hidden = true;
      statusEl.hidden = false;
      statusEl.textContent = "No game in progress.";
    }
  }
  async function pollScoreboard() {
    const data = await getJSON("data/scoreboard.json", null);
    if (data) paintScoreboard(data);
  }

  /* ---------------- Submit page (mailto) ---------------- */
  function wireSubmitForm() {
    const form = $("#submitForm");
    if (!form) return;
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const name = $("#fName").value.trim();
      const cat  = $("#fCat").value;
      const det  = $("#fDetails").value.trim();
      const subject = encodeURIComponent(`TN Fansite listing: ${name}`);
      const body = encodeURIComponent(`Category: ${cat}\n\n${det}\n`);
      // Replace with your inbox:
      location.href = `mailto:tenn-fansite@example.com?subject=${subject}&body=${body}`;
    });
  }

  /* ---------------- Boot ---------------- */
  async function boot() {
    wireSubmitForm();
    paintWeather();
    pollScoreboard();
    setInterval(pollScoreboard, 30000);

    const [scheduleRaw, meta] = await Promise.all([
      getJSON("data/schedule.json", []),
      getJSON("data/meta.json", { lastUpdated: null })
    ]);
    const schedule = Array.isArray(scheduleRaw) ? scheduleRaw.map(normalizeGame)
      : (Array.isArray(scheduleRaw?.games) ? scheduleRaw.games.map(normalizeGame) : []);

    // Home schedule: 3 rows + toggle
    if ($("#schedBody")) {
      paintScheduleRows(schedule, $("#schedBody"), 3);
      const toggle = $("#toggleSched");
      if (toggle) {
        let expanded = false;
        toggle.addEventListener("click", () => {
          expanded = !expanded;
          paintScheduleRows(schedule, $("#schedBody"), expanded ? Infinity : 3);
          toggle.textContent = expanded ? "Show less" : "Show full schedule";
        });
      }
    }
    // Schedule page
    if ($("#schedPageBody")) {
      paintScheduleRows(schedule, $("#schedPageBody"), Infinity);
    }

    setMetaUpdated(meta);

    // Upcoming + countdown
    const next = (function pickNext(list){
      const now = Date.now();
      return list
        .filter(g => isValidISO(g.start) && new Date(g.start).getTime() > now)
        .sort((a,b) => new Date(a.start)-new Date(b.start))[0] || null;
    })(schedule);

    const note = $("#nextGameNote");
    if (next && note) note.textContent = `Next game: ${fmtDate(next.start)} vs ${next.opponent || "Opponent"}`;

    if ($("#upcomingLine")) {
      $("#upcomingLine").textContent = next
        ? `${fmtDate(next.start)} — vs ${next.opponent || "Opponent"}`
        : "No upcoming game found.";
    }

    openGoogleCal(next);
    startCountdown(next ? next.start : null);
  }

  document.addEventListener("DOMContentLoaded", boot);
})();

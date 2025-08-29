// assets/js/app.js — reads static JSON under /data and paints UI

const TEAM = "Tennessee";

// Shorthands
const $ = (s, ctx = document) => ctx.querySelector(s);
const setText = (sel, txt, ctx = document) => {
  const el = typeof sel === "string" ? $(sel, ctx) : sel;
  if (el) el.textContent = txt;
};
const pad = (n) => String(n).padStart(2, "0");

async function loadJSON(path) {
  const res = await fetch(path, { cache: "no-store" });
  if (!res.ok) throw new Error(`Fetch ${path} failed`);
  return res.json();
}

function fmtDate(iso) { if (!iso) return "TBA"; return new Date(iso).toLocaleDateString([], {weekday:"short", month:"short", day:"numeric"}); }
function fmtTime(iso) { if (!iso) return "TBA"; return new Date(iso).toLocaleTimeString([], {hour:"numeric", minute:"2-digit"}); }

let countdownTimer = null;
function stopCountdown(){ if(countdownTimer) clearInterval(countdownTimer); countdownTimer = null; }
function startCountdown(iso) {
  if (!iso) return;
  stopCountdown();
  const tick = () => {
    const now = new Date(), then = new Date(iso);
    const ms = Math.max(0, then - now);
    const d = Math.floor(ms / 86400000);
    const h = Math.floor((ms % 86400000)/3600000);
    const m = Math.floor((ms % 3600000)/60000);
    setText("#miniDays", pad(d));
    setText("#miniHours", pad(h));
    setText("#miniMins", pad(m));
    setText("#kickoffTimer", `Kickoff in ${pad(d)}d : ${pad(h)}h : ${pad(m)}m`);
  };
  tick();
  countdownTimer = setInterval(tick, 30000);
}

function paintUpcoming(next) {
  const g = next?.game;
  if (!g) {
    setText("#qOpp", "Tennessee vs Opponent");
    setText("#qDate", "Date • Time");
    setText("#qVenue", "Venue");
    return;
  }
  const isHome = (g.home || "").toLowerCase().includes("tennessee");
  const opp = isHome ? g.away : g.home;
  setText("#qOpp", opp || "Opponent");
  setText("#qDate", `${fmtDate(g.start)} • ${fmtTime(g.start)}`);
  setText("#qVenue", [g.venue?.name, [g.venue?.city, g.venue?.state].filter(Boolean).join(", ")].filter(Boolean).join(" — "));
  setText("#kickoffTimer", `Kickoff: ${fmtDate(g.start)} ${fmtTime(g.start)}`);
  startCountdown(g.start);
}

function paintMedia(list) {
  const ul = $("#tvList");
  const note = $("#tvNote");
  if (!ul) return;
  ul.innerHTML = "";
  if (!Array.isArray(list) || list.length === 0) {
    if (note) note.textContent = "No TV/stream info yet—check again closer to kickoff.";
    return;
  }
  if (note) note.textContent = "";
  list.slice(0, 6).forEach(it => {
    const li = document.createElement("li");
    li.textContent = `${it.homeTeam} vs ${it.awayTeam}: ${it.outlet || "TBD"}`;
    ul.appendChild(li);
  });
}

function paintLines(lines) {
  const box = $("#oddsBox");
  if (!box) return;
  if (!Array.isArray(lines) || lines.length === 0) {
    box.textContent = "No lines posted yet.";
    return;
  }
  const first = lines[0];
  box.innerHTML = `
    <div><b>Spread:</b> ${first.spread ?? "—"}</div>
    <div><b>O/U:</b> ${first.overUnder ?? "—"}</div>
    <div class="muted" style="margin-top:6px">Book: ${first.provider || "TBD"}</div>
  `;
}

function paintRankings(rk) {
  const list = $("#rankList");
  const note = $("#rankNote");
  if (!list) return;
  list.innerHTML = "";
  const ranks = rk?.ranks || [];
  if (ranks.length === 0) {
    if (note) note.textContent = "No rankings available.";
    return;
  }
  ranks.slice(0,10).forEach(r => {
    const li = document.createElement("li");
    li.textContent = `${r.rank}. ${r.team}`;
    list.appendChild(li);
  });
  if (note) note.textContent = rk?.poll ? `${rk.poll}${rk.week ? ` — Week ${rk.week}` : ""}` : "";
}

function paintMap(next) {
  const box = $("#miniMap");
  if (!box) return;
  const lat = Number(next?.game?.venue?.latitude ?? NaN);
  const lon = Number(next?.game?.venue?.longitude ?? NaN);
  if (isNaN(lat) || isNaN(lon)) {
    box.innerHTML = '<p class="muted">Map will appear when coordinates are available.</p>';
    return;
  }
  box.style.height = "220px";
  const boot = () => {
    if (box._leaflet) return;
    const map = L.map(box).setView([lat, lon], 15);
    box._leaflet = map;
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "© OSM contributors"
    }).addTo(map);
    const label = [next.game.venue?.name, next.game.venue?.city, next.game.venue?.state].filter(Boolean).join(", ");
    L.marker([lat, lon]).addTo(map).bindPopup(label || "Venue").openPopup();
  };
  if (window.L) boot(); else window.addEventListener("load", boot);
}

async function init() {
  try {
    const [meta, next, media, lines, rankings] = await Promise.all([
      loadJSON("/sports-fansite/data/meta.json").catch(()=>({})),
      loadJSON("/sports-fansite/data/next.json").catch(()=>({})),
      loadJSON("/sports-fansite/data/media.json").catch(()=>([])),
      loadJSON("/sports-fansite/data/lines.json").catch(()=>([])),
      loadJSON("/sports-fansite/data/rankings.json").catch(()=>({}))
    ]);

    paintUpcoming(next);
    paintMap(next);
    paintMedia(media);
    paintLines(lines);
    paintRankings(rankings);

    setText("#lastUpdated", meta.lastUpdated ? new Date(meta.lastUpdated).toLocaleString() : "");
  } catch (e) {
    console.error(e);
    setText("#kickoffTimer", "Live data unavailable right now.");
  }
}

document.addEventListener("DOMContentLoaded", init);

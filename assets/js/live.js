// assets/js/live.js
// Module scope so it won't collide with your other code.
const $$  = (s, ctx = document) => ctx.querySelector(s);
const pad = n => String(n).padStart(2, "0");

function fmtDateTime(iso) {
  if (!iso) return "Date TBA";
  const d = new Date(iso);
  return d.toLocaleString([], { weekday: "long", month: "long", day: "numeric", hour: "numeric", minute: "2-digit" });
}

// Safe accessors for CFBD team fields (sometimes object, sometimes string)
const teamName = t => (t?.school || t || "TBD");
const venueName = v => (v?.name || v || "TBD");
const venueCity = v => (v?.location?.city || "");
const venueState = v => (v?.location?.state || "");
const venueLat = v => v?.location?.lat ?? v?.location?.latitude ?? null;
const venueLng = v => v?.location?.lng ?? v?.location?.longitude ?? null;

// ---------- countdown ----------
let countdownTimer = null;
function stopCountdown(){ if (countdownTimer) clearInterval(countdownTimer); countdownTimer = null; }
function startCountdown(iso){
  if (!iso) return;
  stopCountdown();
  const tick = () => {
    const ms = new Date(iso) - new Date();
    if (ms <= 0) { stopCountdown(); return; }
    const d = Math.floor(ms/86400000);
    const h = Math.floor(ms/3600000) % 24;
    const m = Math.floor(ms/60000)   % 60;
    const s = Math.floor(ms/1000)    % 60;
    $$("#miniDays")  && ($$("#miniDays").textContent  = pad(d));
    $$("#miniHours") && ($$("#miniHours").textContent = pad(h));
    $$("#miniMins")  && ($$("#miniMins").textContent  = pad(m));
    $$("#miniSecs")  && ($$("#miniSecs").textContent  = pad(s));
  };
  tick(); countdownTimer = setInterval(tick, 1000);
}

// ---------- map ----------
function mountMiniMap(g){
  try{
    const lat = venueLat(g?.venue), lng = venueLng(g?.venue);
    if (!lat || !lng) return;
    const el = $$("#miniMap");
    if (!el) return;
    if (!window.L) return; // Leaflet not present—fail quietly
    const map = L.map(el, { scrollWheelZoom:false, attributionControl:true }).setView([lat, lng], 13);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19 }).addTo(map);
    L.marker([lat, lng]).addTo(map).bindPopup(venueName(g?.venue) || "Venue");
  }catch(e){ /* no-op */ }
}

// ---------- painters ----------
function paintTicker(g){
  const el = $$("#ticker");
  if (!el || !g) return;
  const h = teamName(g.home_team), a = teamName(g.away_team);
  const hs = g.home_points ?? g.home_score ?? "-";
  const as = g.away_points ?? g.away_score ?? "-";
  const period = g.current_period ? `Q${g.current_period}` : (g.period || "");
  const clock  = g.clock || "";
  const status = g.status || "";
  el.textContent = `${a} ${as}  —  ${h} ${hs}   ${period} ${clock} ${status}`.replace(/\s+/g," ").trim();
}

function paintUpcomingCard(g){
  if (!g) return;
  const isHome = teamName(g.home_team) === "Tennessee";
  const opp = isHome ? teamName(g.away_team) : teamName(g.home_team);
  const when = fmtDateTime(g.start_date);
  const where = [venueName(g.venue), venueCity(g.venue), venueState(g.venue)].filter(Boolean).join(", ");

  $$("#qOpp")   && ($$("#qOpp").textContent = opp);
  $$("#qDate")  && ($$("#qDate").textContent = when);
  $$("#qVenue") && ($$("#qVenue").textContent = where);
}

// ---------- boot ----------
async function boot(){
  // fetch in parallel
  const [live, next] = await Promise.allSettled([
    fetch("data/live.json",       { cache:"no-store" }).then(r => r.json()),
    fetch("data/next.json",       { cache:"no-store" }).then(r => r.json()),
  ]);

  const liveGame = live.value?.game || null;
  const nextGame = next.value?.next || null;

  // prefer live if present, else next
  const game = liveGame || nextGame || null;

  paintUpcomingCard(game);
  startCountdown(liveGame?.start_date || nextGame?.start_date || null);
  mountMiniMap(game);
  paintTicker(liveGame);
}

document.addEventListener("DOMContentLoaded", boot);

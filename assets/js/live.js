/* live.js — tiny live scoreboard poller */
const SB = {
  awayName: document.getElementById("sbAwayName"),
  homeName: document.getElementById("sbHomeName"),
  awayScore: document.getElementById("sbAwayScore"),
  homeScore: document.getElementById("sbHomeScore"),
  status: document.getElementById("sbStatus"),
  clock: document.getElementById("sbClock"),
};

function setText(el, v) { if (el) el.textContent = v; }

function selectVolsGame(payload) {
  if (!payload) return null;
  if (payload.activeGame) return payload.activeGame;
  const list = payload.games || payload.scoreboard?.games || [];
  return list.find(g => g.home_team === "Tennessee" || g.away_team === "Tennessee") || null;
}

async function tick() {
  try {
    const url = (location.hostname.endsWith("github.io")
      ? `/${location.pathname.split("/").filter(Boolean)[0]}/data/scoreboard.json`
      : "/data/scoreboard.json") + `?t=${Date.now()}`;
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) throw new Error(res.statusText);
    const data = await res.json();
    const g = selectVolsGame(data);

    if (!g) {
      setText(SB.status, "No game in progress.");
      setText(SB.clock, "");
      setText(SB.homeName, "Tennessee");
      setText(SB.awayName, "");
      setText(SB.homeScore, "–");
      setText(SB.awayScore, "–");
      return;
    }

    setText(SB.homeName, g.home_team || "Home");
    setText(SB.awayName, g.away_team || "Away");
    setText(SB.homeScore, (g.home_points ?? "–").toString());
    setText(SB.awayScore, (g.away_points ?? "–").toString());

    const period = (g.period ? `Q${g.period}` : (g.current_period ?? "")).toString();
    const clock = g.clock || g.display_clock || "";
    const status = g.status ?? g.game_status ?? "";
    setText(SB.status, status || period || "In progress");
    setText(SB.clock, clock);
  } catch (e) {
    // Keep quiet—UI already shows last successful state.
    // console.warn("scoreboard tick error:", e);
  }
}
tick();
setInterval(tick, 20000);

/* Tennessee Fansite — shared JS (idempotent + robust scoreboard) */
(() => {
  if (window.__TN_INIT__) return;
  window.__TN_INIT__ = true;

  const $ = (sel, root=document) => root.querySelector(sel);
  const $$ = (sel, root=document) => [...root.querySelectorAll(sel)];
  const safe = v => (v ?? '') + '';

  const DATA_SCHEDULE = 'data/schedule.json';
  const DATA_META     = 'data/meta.json';
  const DATA_SCORE    = 'data/scoreboard.json';

  const TEAM_RE = /tennessee/i;

  /* ---------------- cache-busted fetch ---------------- */
  function withBust(path){
    const sep = path.includes('?') ? '&' : '?';
    return `${path}${sep}t=${Date.now()}`;
  }
  async function getJSON(path, fallback=null){
    try{
      const res = await fetch(withBust(path), { cache:'no-store' });
      if(!res.ok) throw new Error(`${res.status} ${res.statusText}`);
      return await res.json();
    }catch(err){
      console.warn('getJSON fallback:', path, err.message);
      return fallback;
    }
  }

  /* ---------------- countdown + add-to-calendar ---------------- */
  async function bootCountdown(){
    const data = await getJSON(DATA_SCHEDULE, []);
    const list = Array.isArray(data) ? data : (data?.games||[]);
    const now  = new Date();
    const next = list.find(g => new Date(g.start) > now);
    if(!next) return;

    const days  = $('#cd-days'), hrs  = $('#cd-hrs'),
          mins  = $('#cd-min'),  secs = $('#cd-sec');

    function tick(){
      const end = new Date(next.start), t = new Date();
      let diff = end - t; if (diff < 0) diff = 0;
      const d = Math.floor(diff / 86400000);
      const h = Math.floor(diff % 86400000 / 3600000);
      const m = Math.floor(diff % 3600000 / 60000);
      const s = Math.floor(diff % 60000 / 1000);
      if(days){days.textContent = String(d).padStart(2,'0');}
      if(hrs){hrs.textContent  = String(h).padStart(2,'0');}
      if(mins){mins.textContent = String(m).padStart(2,'0');}
      if(secs){secs.textContent = String(s).padStart(2,'0');}
    }
    tick(); setInterval(tick, 1000);

    const btn = $('#addToCal');
    if (btn){
      const start = new Date(next.start);
      const end   = new Date(start.getTime() + 3*60*60*1000);
      const fmt = d => d.toISOString().replace(/[-:]/g,'').replace(/\.\d{3}Z$/,'Z');
      const title    = encodeURIComponent(`Tennessee vs ${safe(next.opponent)}`);
      const details  = encodeURIComponent('Unofficial fan hub — Tennessee Gameday');
      const location = encodeURIComponent(next.isHome ? 'Neyland Stadium, Knoxville, TN' : 'Away');
      const url = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${title}&dates=${fmt(start)}/${fmt(end)}&details=${details}&location=${location}&sf=true&output=xml`;
      btn.setAttribute('href', url);
      btn.setAttribute('target','_blank');
      btn.setAttribute('rel','noopener');
    }
  }

  /* ---------------- schedule (3 rows on home) ------------------ */
  async function bootSchedule(){
    const [sched, meta] = await Promise.all([
      getJSON(DATA_SCHEDULE, []),
      getJSON(DATA_META, null)
    ]);
    const list = Array.isArray(sched) ? sched : (sched?.games || []);
    const tbody = $('#sched');
    if (!tbody) return;
    tbody.innerHTML = '';

    list.slice(0,3).forEach(g => {
      const d = new Date(g.start);
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${d.toLocaleDateString([], {weekday:'short', month:'short', day:'numeric'})}</td>
        <td>${safe(g.opponent)}</td>
        <td>${g.isHome ? 'H' : 'A'}</td>
        <td>${safe(g.tv||'—')}</td>
        <td>${safe(g.result||'—')}</td>`;
      tbody.appendChild(tr);
    });

    const stampEl = $('#dataStamp');
    if (stampEl){
      const stamp = meta?.lastUpdated ? new Date(meta.lastUpdated) : null;
      stampEl.textContent = stamp ? `Data updated — ${stamp.toLocaleString()}` : '';
    }
  }

  /* ---------------- full schedule page ------------------------- */
  async function bootSchedulePage(){
    const table = $('#fullSchedule');
    if (!table) return;
    const data = await getJSON(DATA_SCHEDULE, []);
    const list = Array.isArray(data) ? data : (data?.games||[]);
    const tbody = table.querySelector('tbody');
    tbody.innerHTML = '';
    list.forEach(g=>{
      const d = new Date(g.start);
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${d.toLocaleDateString([], {weekday:'short', month:'short', day:'numeric'})}</td>
        <td>${safe(g.opponent)}</td>
        <td>${g.isHome ? 'H' : 'A'}</td>
        <td>${safe(g.tv || '—')}</td>
        <td>${safe(g.result || '—')}</td>`;
      tbody.appendChild(tr);
    });
  }

  /* ---------------- scoreboard (ultra-robust) ------------------ */
  function normalizeStatus(s){
    if(!s) return 'none';
    const x = String(s).toLowerCase();
    if (/(final|post)/.test(x)) return 'final';
    if (/(in[-_ ]?progress|live|playing)/.test(x)) return 'in_progress';
    if (/(pre|sched)/.test(x)) return 'pre';
    return x; // fallback (e.g., 'none')
  }
  function pickGameFromContainer(container){
    // Accept: {games:[…]}, […], or single object
    if (!container) return null;
    if (Array.isArray(container)){
      return container.find(g =>
        TEAM_RE.test(safe(g.homeTeam||g.home?.school||g.home?.name||g.home)) ||
        TEAM_RE.test(safe(g.awayTeam||g.away?.school||g.away?.name||g.away))
      ) || container[0] || null;
    }
    if (container.games && Array.isArray(container.games)){
      return pickGameFromContainer(container.games);
    }
    // Assume already a single game object
    return container;
  }
  function toSimpleShape(g){
    if (!g) return null;

    // Names (CFBD styles + our styles)
    const homeName = g.homeTeam || g.home?.school || g.home?.name || g.home || '';
    const awayName = g.awayTeam || g.away?.school || g.away?.name || g.away || '';

    // Scores with many possible keys
    const homeScore = g.homeScore ?? g.home_points ?? g.homePoints ?? g.home?.score ?? 0;
    const awayScore = g.awayScore ?? g.away_points ?? g.awayPoints ?? g.away?.score ?? 0;

    // Clock/period variations
    const period  = g.period ?? g.currentPeriod ?? g.qtr ?? '';
    const clock   = g.clock ?? g.currentClock ?? g.displayClock ?? '';
    const clockStr = (period ? `Q${period} ` : '') + (clock || '').trim();

    // Status variations
    const status = normalizeStatus(g.status || g.gameStatus || g.state);

    return {
      status,
      clock: clockStr.trim(),
      home: { name: homeName, score: Number(homeScore)||0 },
      away: { name: awayName, score: Number(awayScore)||0 }
    };
  }

  async function bootScore(){
    const body = $('#scoreBody');
    const box  = $('#scoreBox');
    if(!box) return;

    // add/ensure a tiny timestamp
    let stamp = $('#scoreStamp');
    if(!stamp){
      stamp = document.createElement('div');
      stamp.id = 'scoreStamp';
      stamp.className = 'kicker';
      stamp.style.marginTop = '6px';
      body && body.appendChild(stamp);
    }

    function paintSimple(s){
      if(!s || s.status==='none'){
        box.innerHTML = `<span class="muted">No game in progress.</span>`;
        return;
      }
      if(s.status==='pre'){
        box.textContent = `${safe(s.home?.name||'Tennessee')} vs ${safe(s.away?.name||'Opponent')} • ${safe(s.clock||'TBA')}`;
        return;
      }
      if(s.status==='in_progress'){
        box.textContent = `${safe(s.home?.name||'Tennessee')} ${safe(s.home?.score||0)} — ${safe(s.away?.name||'Opponent')} ${safe(s.away?.score||0)} • ${safe(s.clock||'Live')}`;
        return;
      }
      if(s.status==='final'){
        box.textContent = `Final: ${safe(s.home?.name||'Tennessee')} ${safe(s.home?.score||0)} — ${safe(s.away?.name||'Opponent')} ${safe(s.away?.score||0)}`;
      }
    }

    async function tick(){
      const raw = await getJSON(DATA_SCORE, {status:'none'});
      // Accept many shapes
      const game = pickGameFromContainer(raw);
      const simple = toSimpleShape(game || raw);
      paintSimple(simple || {status:'none'});
      stamp.textContent = `Score updated ${new Date().toLocaleTimeString()}`;
      // console.debug('scoreboard raw:', raw, 'simple:', simple); // uncomment for debugging
    }

    tick();
    setInterval(tick, 15000); // 15s for snappier updates
  }

  /* ---------------- weather (3-day, Neyland) ------------------- */
  async function bootWeather(){
    const wrap = $('#weather3');
    const nowEl= $('#weatherNow');
    if(!wrap && !nowEl) return;

    const lat = 35.955, lon = -83.925;
    const url =
      `https://api.open-meteo.com/v1/forecast` +
      `?latitude=${lat}&longitude=${lon}` +
      `&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max,wind_speed_10m_max` +
      `&current=temperature_2m,wind_speed_10m` +
      `&temperature_unit=fahrenheit&wind_speed_unit=mph` +
      `&timezone=America%2FNew_York`;

    const wx = await getJSON(url, null);
    if(!wx) return;

    if (nowEl){
      const t = Math.round(wx.current?.temperature_2m ?? 0);
      const w = Math.round(wx.current?.wind_speed_10m ?? 0);
      nowEl.textContent = `${t}°F • Wind ${w} mph`;
    }

    if (wrap){
      const days = wx.daily?.time?.slice(0,3) || [];
      wrap.innerHTML = '';
      days.forEach((iso, i)=>{
        const d = new Date(iso);
        const hi = Math.round(wx.daily.temperature_2m_max[i]);
        const lo = Math.round(wx.daily.temperature_2m_min[i]);
        const p  = Math.round(wx.daily.precipitation_probability_max[i] ?? 0);
        const w  = Math.round(wx.daily.wind_speed_10m_max[i] ?? 0);
        const li = document.createElement('li');
        li.textContent = `${d.toLocaleDateString([], {weekday:'short'})} — ${hi}/${lo}° • ${w} mph • ${p}% precip`;
        wrap.appendChild(li);
      });
      const note = $('#wxNote');
      if (note) note.textContent = 'Neyland Stadium. Source: Open-Meteo.';
    }
  }

  /* ---------------- boot by page ------------------------------- */
  document.addEventListener('DOMContentLoaded', () => {
    bootCountdown();
    bootSchedule();
    bootScore();
    bootWeather();
    bootSchedulePage();
  });
})();

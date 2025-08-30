/* Tennessee Fansite — shared JS (safe / idempotent) */
(() => {
  if (window.__TN_APP_INIT__) return; window.__TN_APP_INIT__ = true;

  // tiny helpers
  const $  = (sel, root=document) => root.querySelector(sel);
  const $$ = (sel, root=document) => [...root.querySelectorAll(sel)];
  const safe = (v) => (v === undefined || v === null) ? '' : v;

  // Base paths (project site)
  const ROOT = '/sports-fansite';
  const path = (p) => `${ROOT}${p}`;

  // ---------- getJSON helper ----------
  async function getJSON(rel, fallback=null){
    try{
      const res = await fetch(path(rel), { cache:'no-store' });
      if(!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    }catch(err){
      console.warn('getJSON fallback:', rel, err?.message);
      return fallback;
    }
  }

  // ---------- Countdown ----------
  async function bootCountdown(){
    const data = await getJSON('/data/schedule.json', []);
    const list = Array.isArray(data) ? data : (data?.games || []);
    const now  = new Date();
    const next = list.find(g => new Date(g.start) > now);
    if(!next) return;

    const cd = $('#countdown');
    if(!cd) return;

    const dN = $('#cd-days'), hN = $('#cd-hrs'), mN = $('#cd-min'), sN = $('#cd-sec');
    if(!(dN && hN && mN && sN)) return;

    function tick(){
      const t0 = new Date(next.start);
      const t1 = new Date();
      const diff = Math.max(0, t0 - t1);
      const d = Math.floor(diff / 86400000);
      const h = Math.floor(diff / 3600000) % 24;
      const m = Math.floor(diff / 60000) % 60;
      const s = Math.floor(diff / 1000) % 60;
      dN.textContent = String(d).padStart(2,'0');
      hN.textContent = String(h).padStart(2,'0');
      mN.textContent = String(m).padStart(2,'0');
      sN.textContent = String(s).padStart(2,'0');
    }
    tick();
    setInterval(tick, 1000);

    // "Add to Calendar" button (if present)
    const btn = $('#addToCal');
    if(btn){
      const start = new Date(next.start);
      const end   = new Date(start.getTime() + 3*60*60*1000); // +3h
      const pad = n => String(n).padStart(2,'0');
      const fmt = d => `${d.getUTCFullYear()}${pad(d.getUTCMonth()+1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}00Z`;
      const title = encodeURIComponent(`Tennessee vs ${safe(next.opponent)}`);
      const details = encodeURIComponent('Unofficial fan hub — Tennessee Gameday');
      const location = encodeURIComponent(next.isHome ? 'Neyland Stadium, Knoxville, TN' : 'Away');
      const url = `https://www.google.com/calendar/render?action=TEMPLATE&text=${title}&dates=${fmt(start)}/${fmt(end)}&location=${location}&details=${details}`;
      btn.href = url;
      btn.target = '_blank'; btn.rel='noopener';
    }
  }

  // ---------- Weather (Neyland area) ----------
  async function bootWeather(){
    const box = $('#weather');
    if(!box) return;

    const LAT = 35.955, LON = -83.925; // Neyland Stadium area
    try{
      const url = `https://api.open-meteo.com/v1/forecast?latitude=${LAT}&longitude=${LON}&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_mean,windspeed_10m_max&timezone=America%2FNew_York`;
      const res = await fetch(url, { cache:'no-store' });
      const data = await res.json();
      const d = data?.daily;
      if(!d) return;

      const days = d.time.slice(0,3).map((t,i)=>({
        date: new Date(t + 'T12:00:00'),
        tmax: d.temperature_2m_max[i],
        tmin: d.temperature_2m_min[i],
        wind: d.windspeed_10m_max[i],
        pop:  d.precipitation_probability_mean[i]
      }));

      const make = (x) => {
        const li = document.createElement('li');
        li.textContent = `${x.date.toLocaleDateString([], { weekday:'short' })} — ${Math.round(x.tmax)}°/${Math.round(x.tmin)}°  ·  wind ${Math.round(x.wind)} mph  ·  precip ${Math.round(x.pop)}%`;
        return li;
      };
      const ul = $('#weatherList'); ul.innerHTML = ''; days.forEach(d=>ul.appendChild(make(d)));
      $('#weatherNote').textContent = 'Neyland Stadium, Knoxville — Source: Open-Meteo';
    }catch(e){
      console.warn('weather error', e);
    }
  }

  // ---------- Schedule (home: 3 rows) ----------
  async function bootScheduleShort(){
    const tbody = $('#sched');
    if(!tbody) return;
    tbody.innerHTML = '';

    const [sched, meta] = await Promise.all([
      getJSON('/data/schedule.json', []),
      getJSON('/data/meta.json',   null)
    ]);

    const list = Array.isArray(sched) ? sched : (sched?.games || []);
    list.slice(0,3).forEach(g=>{
      const d = new Date(g.start);
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${d.toLocaleDateString([], { weekday:'short', month:'short', day:'numeric' })}</td>
        <td>${safe(g.opponent)}</td>
        <td>${g.isHome ? 'H' : 'A'}</td>
        <td>${safe(g.tv)}</td>
        <td>${safe(g.result) || '—'}</td>`;
      tbody.appendChild(tr);
    });

    const stamp = meta?.lastUpdated ? new Date(meta.lastUpdated) : null;
    const ds = $('#dataStamp'); if (ds) ds.textContent = stamp ? `Data updated — ${stamp.toLocaleString()}` : '';
  }

  // ---------- Live scoreboard ----------
  async function bootScoreboard(){
    const box = $('#scoreBody');
    if(!box) return;

    async function paint(){
      const d = await getJSON('/data/scoreboard.json', { status:'none' });
      if(d.status === 'none'){
        box.innerHTML = `<span class="muted">Tennessee</span> — <span class="muted">No game in progress.</span>`;
        return;
      }
      if(d.status === 'pre'){
        box.innerHTML = `<b>${safe(d.home?.name || 'Tennessee')}</b> vs <b>${safe(d.away?.name || '')}</b> — <span class="muted">${safe(d.clock)}</span>`;
        return;
      }
      if(d.status === 'in_progress'){
        box.innerHTML = `<b>${safe(d.home?.name || 'Tennessee')}</b> ${safe(d.home?.score||0)} — ${safe(d.away?.score||0)} <b>${safe(d.away?.name||'')}</b> · <span class="muted">${safe(d.clock)}</span>`;
        return;
      }
      if(d.status === 'final'){
        box.innerHTML = `<b>${safe(d.home?.name || 'Tennessee')}</b> ${safe(d.home?.score||0)} — ${safe(d.away?.score||0)} <b>${safe(d.away?.name||'')}</b> · <span class="muted">Final</span>`;
        return;
      }
      box.textContent = '—';
    }
    paint();
    setInterval(paint, 30000);
  }

  // ---------- boot all ----------
  document.addEventListener('DOMContentLoaded', () => {
    bootCountdown();
    bootWeather();
    bootScheduleShort();
    bootScoreboard();
  });
})();


/* Tennessee Fansite — shared JS (safe & idempotent) */
(() => {
  if (window.__TN_APP_INIT__) return;
  window.__TN_APP_INIT__ = true;

  // tiny helpers
  const $  = (sel, root=document) => root.querySelector(sel);
  const $$ = (sel, root=document) => [...root.querySelectorAll(sel)];
  const safe = (v) => v == null ? '' : v;

  // ---- JSON helper (with graceful fallback) ----
  async function getJSON(path, fallback=null){
    try{
      const res = await fetch(path, { cache: 'no-store' });
      if(!res.ok) throw new Error(`${res.status} ${res.statusText}`);
      return await res.json();
    }catch(err){
      console.warn('getJSON_fallback:', path, err.message);
      return fallback;
    }
  }

  // ---- countdown (uses /data/schedule.json) ----
  async function bootCountdown(){
    const data = await getJSON('/sports-fansite/data/schedule.json', []);
    const list = Array.isArray(data) ? data : (data?.games||[]);
    if (!list.length) return;

    const now = new Date();
    const next = list.find(g => new Date(g.start) > now);
    if(!next) return;

    const tick = () => {
      const t = new Date(next.start) - new Date();
      const max = Math.max(0, t);
      const d = Math.floor(max / 86400000);
      const h = Math.floor((max % 86400000) / 3600000);
      const m = Math.floor((max % 3600000) / 60000);
      const s = Math.floor((max % 60000) / 1000);
      const pad = (n) => String(n).padStart(2,'0');
      $('#cd-days') && ($('#cd-days').textContent = pad(d));
      $('#cd-hrs')  && ($('#cd-hrs').textContent  = pad(h));
      $('#cd-min')  && ($('#cd-min').textContent  = pad(m));
      $('#cd-sec')  && ($('#cd-sec').textContent  = pad(s));
    };
    tick();
    setInterval(tick, 1000);

    // add to calendar deep link if present
    const btn = $('#addToCal');
    if(btn){
      const start = new Date(next.start);
      const end   = new Date(start.getTime() + 3*60*60*1000);
      const pad2  = (n) => String(n).padStart(2,'0');
      const toICS = (d) => (
        d.getUTCFullYear().toString() +
        pad2(d.getUTCMonth()+1) + pad2(d.getUTCDate()) + 'T' +
        pad2(d.getUTCHours())   + pad2(d.getUTCMinutes()) + '00Z'
      );
      const title   = encodeURIComponent('Tennessee vs ' + next.opponent);
      const details = encodeURIComponent('Unofficial fan hub — Tennessee Gameday');
      const where   = encodeURIComponent(`${next.isHome ? 'Neyland Stadium, Knoxville, TN' : 'Away'}`);
      const url =
        `https://www.google.com/calendar/render?action=TEMPLATE&text=${title}` +
        `&dates=${toICS(start)}/${toICS(end)}&location=${where}&details=${details}`;
      btn.href = url;
      btn.target = '_blank'; btn.rel = 'noopener';
      $('#nextLine') && ($('#nextLine').innerHTML =
        `<b>${start.toLocaleDateString([], {weekday:'short', month:'short', day:'numeric'})}</b> — ` +
        `Tennessee <span class="muted">${next.isHome?'vs':'@'}</span> ${safe(next.opponent)} ` +
        (next.tv ? `<span class="muted"> · TV: ${next.tv}</span>` : '')
      );
    }
  }

  // ---- schedule table (3 rows on home, full on schedule.html) ----
  async function bootSchedule(){
    const tbody = $('#sched');
    if(!tbody) return;

    const [sched, meta] = await Promise.all([
      getJSON('/sports-fansite/data/schedule.json', []),
      getJSON('/sports-fansite/data/meta.json', null)
    ]);
    const list = Array.isArray(sched) ? sched : (sched?.games||[]);
    const limit = tbody.dataset.limit === 'all' ? list.length : (parseInt(tbody.dataset.limit||'3',10));

    tbody.innerHTML = '';
    list.slice(0, limit).forEach(g => {
      const d = new Date(g.start);
      const tr = document.createElement('tr');
      tr.innerHTML =
        `<td>${d.toLocaleDateString([], {weekday:'short', month:'short', day:'numeric'})}</td>`+
        `<td>${safe(g.opponent)}</td>`+
        `<td>${g.isHome ? 'H' : 'A'}</td>`+
        `<td>${safe(g.tv)}</td>`+
        `<td>${safe(g.result||'—')}</td>`;
      tbody.appendChild(tr);
    });

    const ds = $('#dataStamp');
    if(ds){
      const stamp = meta?.lastUpdated ? new Date(meta.lastUpdated) : null;
      ds.textContent = stamp ? `Data updated — ${stamp.toLocaleString()}` : '';
    }
  }

  // ---- lightweight scoreboard (/data/scoreboard.json) ----
  async function bootScore(){
    const box = $('#scoreBody');
    if(!box) return;

    const paint = (data) => {
      if(!data || data.status==='none'){
        box.innerHTML = 'Tennessee <span class="muted">No game in progress.</span>';
        return;
      }
      if(data.status==='pre'){
        box.textContent = `${data.away?.name||'TBA'} @ ${data.home?.name||'Tennessee'} — ${data.clock||'TBD'}`;
        return;
      }
      const h = data.home?.name||'Tennessee', a = data.away?.name||'TBA';
      const hs = safe(data.home?.score), as = safe(data.away?.score);
      const clk = safe(data.clock||'');
      box.innerHTML = `<b>${a}</b> ${as} @ <b>${h}</b> ${hs} <span class="muted">${clk}</span>`;
    };

    const tick = async () => {
      const json = await getJSON('/sports-fansite/data/scoreboard.json', {status:'none'});
      paint(json);
    };
    await tick();
    setInterval(tick, 30000);
  }

  // ---- weather (Open-Meteo for Neyland area) ----
  async function bootWeather(){
    const list = $('#wxList');
    const nowBox = $('#wxNow');
    if(!list && !nowBox) return;

    const url = 'https://api.open-meteo.com/v1/forecast?latitude=35.955&longitude=-83.925&timezone=auto&' +
      'current=temperature_2m,wind_speed_10m&daily=temperature_2m_max,temperature_2m_min,wind_speed_10m_max,precipitation_probability_max';
    const data = await getJSON(url, null);
    if(!data) return;

    if(nowBox){
      const t = Math.round(data.current?.temperature_2m ?? NaN);
      const w = Math.round(data.current?.wind_speed_10m ?? NaN);
      nowBox.textContent = isFinite(t) ? `${t}° — Wind ${w} mph · Knoxville` : '—';
    }

    if(list){
      list.innerHTML = '';
      const days = data.daily?.time||[];
      for(let i=0;i<Math.min(3, days.length);i++){
        const day = new Date(days[i]).toLocaleDateString([], {weekday:'short'});
        const hi  = Math.round(data.daily.temperature_2m_max[i]);
        const lo  = Math.round(data.daily.temperature_2m_min[i]);
        const ws  = Math.round(data.daily.wind_speed_10m_max[i]);
        const li = document.createElement('li');
        li.textContent = `${day} — ${hi}°/${lo}° · ${ws} mph`;
        list.appendChild(li);
      }
      $('#wxMeta') && ($('#wxMeta').textContent = 'Neyland Stadium. Source: Open-Meteo');
    }
  }

  // boot everything safely
  const boot = () => {
    bootCountdown();
    bootSchedule();
    bootScore();
    bootWeather();
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once:true });
  } else {
    boot();
  }
})();

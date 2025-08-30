/* Tennessee Fansite — shared JS (safe / idempotent) */
(() => {
  if (window.__TN_APP_INIT__) return; // guard
  window.__TN_APP_INIT__ = true;

  // tiny helpers
  const $ = (sel, root=document) => root.querySelector(sel);
  const $$ = (sel, root=document) => [...root.querySelectorAll(sel)];
  const safe = (v, d='—') => (v==null || v==='') ? d : v;

  async function getJSON(path, fallback=null){
    try{
      const res = await fetch(path, {cache:'no-store'});
      if(!res.ok) throw new Error(`${res.status} ${res.statusText}`);
      return await res.json();
    }catch(err){
      console.warn('getJSON fallback:', path, err.message);
      return fallback;
    }
  }

  // countdown for next game
  async function bootCountdown(){
    const data = await getJSON('/data/schedule.json', []);
    const list = Array.isArray(data) ? data : (data.games||[]);
    const now = new Date();
    const next = list.find(g => new Date(g.start) > now);
    if(!next) return;
    const tgt = new Date(next.start);
    const tick = () => {
      const diff = Math.max(0, tgt - new Date());
      const d = Math.floor(diff / 86400000);
      const h = Math.floor((diff % 86400000) / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      $('#cd-days').textContent = String(d).padStart(2,'0');
      $('#cd-hrs').textContent  = String(h).padStart(2,'0');
      $('#cd-min').textContent  = String(m).padStart(2,'0');
      $('#cd-sec').textContent  = String(s).padStart(2,'0');
    };
    tick(); setInterval(tick, 1000);

    // add to Google Calendar link
    const btn = $('#addToCal');
    if(btn){
      const start = new Date(next.start);
      const end = new Date(start.getTime() + 3*60*60*1000);
      const pad = n => String(n).padStart(2,'0');
      const fmt = d =>
        d.getUTCFullYear().toString() +
        pad(d.getUTCMonth()+1) + pad(d.getUTCDate()) + 'T' +
        pad(d.getUTCHours()) + pad(d.getUTCMinutes()) + '00Z';
      const title = encodeURIComponent(`Tennessee vs ${next.opponent}`);
      const details = encodeURIComponent('Unofficial fan hub — Tennessee Gameday');
      const location = encodeURIComponent(next.isHome ? 'Neyland Stadium, Knoxville, TN' : 'Away');
      btn.href = `https://www.google.com/calendar/render?action=TEMPLATE&text=${title}&dates=${fmt(start)}/${fmt(end)}&location=${location}&details=${details}`;
      btn.target = '_blank'; btn.rel = 'noopener';
      $('#nextBody').innerHTML = `${start.toLocaleString([], {weekday:'short', month:'short', day:'numeric', hour:'numeric', minute:'2-digit'})}<br>
        <b>${next.isHome ? 'vs' : '@'}</b> ${safe(next.opponent)} ${next.tv?`· <span class="muted">TV: ${next.tv}</span>`:''}`;
    }
  }

  // schedule (3 rows default)
  async function bootSchedule(){
    const [sched, meta] = await Promise.all([
      getJSON('/data/schedule.json', []),
      getJSON('/data/meta.json', {lastUpdated:null})
    ]);
    const list = Array.isArray(sched) ? sched : (sched.games||[]);
    const tbody = $('#sched');
    tbody.innerHTML = '';
    list.slice(0,3).forEach(g => {
      const d = new Date(g.start);
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${d.toLocaleDateString([], {weekday:'short', month:'short', day:'numeric'})}</td>
        <td>${safe(g.opponent)}</td>
        <td>${g.isHome ? 'H' : 'A'}</td>
        <td>${safe(g.tv,'—')}</td>
        <td>${g.result ? g.result : '—'}</td>`;
      tbody.appendChild(tr);
    });
    const stamp = meta && meta.lastUpdated ? new Date(meta.lastUpdated) : null;
    $('#dataStamp').textContent = stamp ? `Data updated — ${stamp.toLocaleString()}` : '';
  }

  // live score lightweight
  async function bootScore(){
    const box = $('#scoreBody'); if(!box) return;
    const paint = (data) => {
      if(!data || data.status==='none'){
        box.innerHTML = `Tennessee<br><span class="muted">No game in progress.</span>`;
        return;
      }
      if(data.status==='pre'){
        const h = data.home?.name || 'Tennessee';
        const a = data.away?.name || 'Opponent';
        box.innerHTML = `<b>${h}</b> vs <b>${a}</b><br><span class="muted">${safe(data.clock,'TBA')}</span>`;
        return;
      }
      if(data.status==='in_progress'){
        const hs = data.home?.score ?? '—';
        const as = data.away?.score ?? '—';
        box.innerHTML = `<b>${hs}</b> — <b>${as}</b><br><span class="muted">${safe(data.clock)}</span>`;
        return;
      }
      if(data.status==='final'){
        const hs = data.home?.score ?? '—';
        const as = data.away?.score ?? '—';
        box.innerHTML = `Final<br><b>${hs}</b> — <b>${as}</b>`;
        return;
      }
      box.textContent = '—';
    };
    const tick = async () => {
      const data = await getJSON('/data/scoreboard.json', {status:'none'});
      paint(data);
    };
    await tick(); setInterval(tick, 30000);
  }

  // weather (reads optional /data/weather.json with next 3 days)
  async function bootWeather(){
    const wx = await getJSON('/data/weather.json', null);
    if(!wx) return; // silently skip if not provided
    const ul = $('#wx3'); const stamp = $('#wxStamp');
    if(Array.isArray(wx.days)){
      ul.innerHTML = wx.days.slice(0,3).map(d =>
        `<li>${d.label} — ${d.hi}° / ${d.lo}° ${d.desc} · ${d.wind}</li>`
      ).join('');
    }
    if(wx.stamp){ stamp.textContent = wx.stamp; }
  }

  // boot all
  (async function(){
    await Promise.all([bootCountdown(), bootSchedule(), bootScore(), bootWeather()]);
  })();
})();

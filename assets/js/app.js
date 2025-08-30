/* Tennessee Fansite — shared JS (safe / idempotent) */
(() => {
  if (window.__TN_APP_INIT__) return; window.__TN_APP_INIT__ = true;

  // ---------- tiny helpers ----------
  const $  = (sel, root=document) => root.querySelector(sel);
  const $$ = (sel, root=document) => [...root.querySelectorAll(sel)];
  const safe = (v) => (v == null ? '' : v);

  async function getJSON(path, fallback=null) {
    try {
      const res = await fetch(`${path}?t=${Date.now()}`, { cache: 'no-store' });
      if(!res.ok) throw new Error(`getJSON: ${res.status} ${res.statusText}`);
      return await res.json();
    } catch (err) {
      console.warn('getJSON fallback:', path, err.message);
      return fallback;
    }
  }

  // ---------- countdown for next game ----------
  async function bootCountdown() {
    const data = await getJSON('/data/schedule.json', []);
    const list = Array.isArray(data) ? data : (data.games||[]);
    const now  = new Date();
    const next = list.find(g => new Date(g.start) > now);
    if (!next) return;

    const tick = () => {
      const t0 = new Date(next.start), t1 = new Date();
      const diff = Math.max(0, t0 - t1);
      const d = Math.floor(diff / 86400000);
      const h = Math.floor((diff % 86400000) / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      const p2 = n => String(n).padStart(2,'0');
      $('#cd-days') && ($('#cd-days').textContent = p2(d));
      $('#cd-hrs')  && ($('#cd-hrs').textContent  = p2(h));
      $('#cd-min')  && ($('#cd-min').textContent  = p2(m));
      $('#cd-sec')  && ($('#cd-sec').textContent  = p2(s));
    };
    tick();
    setInterval(tick, 1000);

    // add-to-calendar link
    const btn = $('#addToCal');
    if (btn) {
      const start = new Date(next.start);
      const end   = new Date(start.getTime() + 3*60*60*1000);
      const pad = n => String(n).padStart(2,'0');
      const fmt = (d) => d.getUTCFullYear().toString() +
        pad(d.getUTCMonth()+1) + pad(d.getUTCDate()) + 'T' +
        pad(d.getUTCHours())   + pad(d.getUTCMinutes()) + '00Z';
      const title   = encodeURIComponent(`Tennessee vs ${next.opponent}`);
      const loc     = encodeURIComponent(`Neyland Stadium, Knoxville, TN`);
      const details = encodeURIComponent('Independent fan hub — Tennessee Gameday');

      btn.href   =
        `https://www.google.com/calendar/render?action=TEMPLATE` +
        `&text=${title}&dates=${fmt(start)}/${fmt(end)}&location=${loc}&details=${details}`;
      btn.target = '_blank';
      btn.rel    = 'noopener';
    }
  }

  // ---------- schedule (3 rows default) ----------
  async function bootSchedule() {
    const [sched, meta] = await Promise.all([
      getJSON('/data/schedule.json', []),
      getJSON('/data/meta.json', {lastUpdated:null})
    ]);
    const list = Array.isArray(sched) ? sched : (sched.games||[]);
    const tbody = $('#sched');
    if (!tbody) return;

    tbody.innerHTML = '';
    list.slice(0,3).forEach(g => {
      const d = new Date(g.start);
      const tr = document.createElement('tr');
      tr.innerHTML =
        `<td>${d.toLocaleDateString([], { weekday:'short', month:'short', day:'numeric' })}</td>`+
        `<td>${safe(g.opponent)}</td>`+
        `<td>${g.isHome ? 'H' : 'A'}</td>`+
        `<td>${safe(g.tv) || '—'}</td>`+
        `<td>${safe(g.result) || '—'}</td>`;
      tbody.appendChild(tr);
    });

    const stamp = meta.lastUpdated ? new Date(meta.lastUpdated) : null;
    const ts = stamp ? stamp.toLocaleString() : '—';
    $('#dataStamp') && ($('#dataStamp').textContent = `Data updated — ${ts}`);
  }

  // ---------- live score box (robust to both schemas) ----------
  async function bootScore() {
    const box = $('#scoreBody');
    if (!box) return;

    function mapStatus(s='') {
      s = s.toLowerCase();
      if (s.includes('in progress')) return 'in_progress';
      if (s.includes('final'))        return 'final';
      if (s.includes('scheduled') || s==='pre') return 'pre';
      if (s.includes('postponed'))   return 'postponed';
      if (s.includes('canceled'))    return 'canceled';
      return 'none';
    }

    function normalize(d) {
      if (!d) return { status:'none' };

      // Already flat?
      if (d.status && (d.home || d.away)) {
        return {
          status: mapStatus(d.status),
          home: d.home || { name:'Tennessee', score:'' },
          away: d.away || { name:'', score:'' },
          clock: d.clock || '',
          start: d.start || null
        };
      }

      // Nested "game" shape (what you have now)
      if (d.game) {
        const g = d.game;
        return {
          status: mapStatus(g.status || ''),
          home: { name: g.home || g.home_team || 'Tennessee', score: g.home_points ?? '' },
          away: { name: g.away || g.away_team || '',          score: g.away_points ?? '' },
          clock: g.period ? `Q${g.period} ${g.clock ?? ''}` : (g.clock ?? ''),
          start: g.start || g.start_date || null
        };
      }

      return { status:'none' };
    }

    const data = await getJSON('/data/scoreboard.json', {status:'none'});
    const s = normalize(data);

    // Render
    const line = (t) => `<span class="muted">${t}</span>`;
    if (s.status === 'in_progress') {
      box.innerHTML =
        `<div class="score-row">`+
          `<strong>${safe(s.away.name)}</strong> ${safe(s.away.score)} @ `+
          `<strong>${safe(s.home.name)}</strong> ${safe(s.home.score)} `+
        `</div>`+
        (s.clock ? `<div>${line(s.clock)}</div>` : ``);
      return;
    }
    if (s.status === 'final') {
      box.innerHTML =
        `<div class="score-row">FINAL — `+
          `<strong>${safe(s.away.name)}</strong> ${safe(s.away.score)} @ `+
          `<strong>${safe(s.home.name)}</strong> ${safe(s.home.score)}`+
        `</div>`;
      return;
    }
    if (s.status === 'pre') {
      const when = s.start ? new Date(s.start).toLocaleString() : '';
      const vs = (s.home?.name || '').toLowerCase().includes('tennessee') ? 'vs' : '@';
      box.innerHTML =
        `<div class="score-row">`+
          `Tennessee ${vs} ${safe( (vs==='vs' ? s.away?.name : s.home?.name) || '' )}`+
        `</div>`+
        (when ? `<div>${line(when)}</div>` : ``);
      return;
    }

    // Default
    box.innerHTML = `<span class="muted">No game in progress.</span>`;
  }

  // ---------- init ----------
  bootCountdown();
  bootSchedule();
  bootScore();
})();

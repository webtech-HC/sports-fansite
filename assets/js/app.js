<script>
/* Tennessee Fansite — shared JS (safe / idempotent) */
(() => {
  if (window.__TN_APP_INIT__) return;
  window.__TN_APP_INIT__ = true;

  /* ---------- tiny helpers ---------- */
  const $  = (sel, root=document) => root.querySelector(sel);
  const $$ = (sel, root=document) => [...root.querySelectorAll(sel)];
  const safe = (v, d='—') => (v === null || v === undefined || v === '' ? d : v);

  // Normalize any path to project-relative (works on GH Pages project sites)
  const normalize = (path) => {
    let p = String(path).trim();
    // strip protocol/host and any leading slash so it's repo-relative
    p = p.replace(/^https?:\/\/[^/]+\/+/i, '').replace(/^\/+/, '');
    return p;
  };

  // Project-safe JSON load with cache-bust + graceful fallback
  async function getJSON(path, fallback=null) {
    const rel = normalize(path);
    const url1 = rel.includes('data/') ? rel : `data/${rel}`;
    const attempts = [`${url1}?t=${Date.now()}`, url1];

    for (const u of attempts) {
      try {
        const res = await fetch(u, { cache: 'no-store' });
        if (res.ok) return await res.json();
      } catch (err) {
        // swallow and try next
      }
    }
    return fallback;
  }

  /* ---------- COUNTDOWN (from next scheduled game) ---------- */
  async function bootCountdown() {
    const data = await getJSON('schedule.json', { games: [] });
    const list = Array.isArray(data) ? data : (data.games || []);
    if (!list.length) return;

    const now = new Date();
    const next = list.find(g => new Date(g.start) > now);
    if (!next) return;

    const tEl = $('#cd-days') && $('#cd-hrs') && $('#cd-min') && $('#cd-sec')
      ? { d: $('#cd-days'), h: $('#cd-hrs'), m: $('#cd-min'), s: $('#cd-sec') }
      : null;
    if (!tEl) return;

    function tick() {
      const diff = new Date(next.start) - new Date();
      const s = Math.max(0, Math.floor(diff / 1000));
      const d = Math.floor(s / 86400);
      const h = Math.floor((s % 86400) / 3600);
      const m = Math.floor((s % 3600) / 60);
      const z = Math.floor(s % 60);

      tEl.d.textContent = String(d).padStart(2, '0');
      tEl.h.textContent = String(h).padStart(2, '0');
      tEl.m.textContent = String(m).padStart(2, '0');
      tEl.s.textContent = String(z).padStart(2, '0');
    }
    tick();
    setInterval(tick, 1000);

    // "Add to calendar" link
    const btn = $('#addToCal');
    if (btn) {
      const start = new Date(next.start);
      const end   = new Date(start.getTime() + 3*60*60*1000); // +3h
      const pad = (n) => String(n).padStart(2,'0');

      const fmt = (dt) =>
        `${dt.getUTCFullYear()}${pad(dt.getUTCMonth()+1)}${pad(dt.getUTCDate())}T${pad(dt.getUTCHours())}${pad(dt.getUTCMinutes())}00Z`;

      const title   = encodeURIComponent(`Tennessee vs ${next.opponent}`);
      const details = encodeURIComponent('Unofficial fan hub — Tennessee Gameday');
      const loc     = encodeURIComponent(`${next.isHome ? 'Neyland Stadium, Knoxville, TN' : 'Away'}`);

      const url = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${title}&dates=${fmt(start)}/${fmt(end)}&location=${loc}&details=${details}`;
      btn.href = url;
      btn.target = '_blank';
      btn.rel = 'noopener';
    }
  }

  /* ---------- SCHEDULE (3 rows) ---------- */
  async function bootSchedule() {
    const [sched, meta] = await Promise.all([
      getJSON('schedule.json', { games: [] }),
      getJSON('meta.json', null)
    ]);
    const list = Array.isArray(sched) ? sched : (sched.games || []);
    const tbody = $('#sched');
    if (!tbody) return;

    tbody.innerHTML = '';
    list.slice(0, 3).forEach(g => {
      const d = new Date(g.start);
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${d.toLocaleDateString([], { weekday:'short', month:'short', day:'numeric'})}</td>
        <td>${safe(g.opponent)}</td>
        <td>${g.isHome ? 'H' : 'A'}</td>
        <td>${safe(g.tv)}</td>
        <td>${safe(g.result, '—')}</td>
      `;
      tbody.appendChild(tr);
    });

    const stamp = meta?.lastUpdated ? new Date(meta.lastUpdated) : null;
    if ($('#dataStamp')) $('#dataStamp').textContent =
      stamp ? `Data updated — ${stamp.toLocaleString()}` : 'Data updated — —';
  }

  /* ---------- LIVE SCOREBOX (polls /data/scoreboard.json) ---------- */
  let scoreTimer;
  async function bootScorebox(initial=false) {
    const box = $('#scoreBody');
    const stampEl = $('#scoreStamp');
    if (!box) return;

    const sb = await getJSON('scoreboard.json', { status: 'none' });

    const name = (t) => safe(t?.name, '');
    const sc   = (t) => (t?.score ?? t?.points ?? null);

    let html = '';
    switch (sb.status) {
      case 'pre':
        html = `${name(sb.home)} vs ${name(sb.away)} <span class="muted">${safe(sb.clock, 'Pregame')}</span>`;
        break;
      case 'in_progress':
        html = `
          <strong>${name(sb.home)}</strong> ${safe(sc(sb.home),'0')}
          &nbsp;—&nbsp;
          <strong>${name(sb.away)}</strong> ${safe(sc(sb.away),'0')}
          <span class="muted">${safe(sb.clock,'')}</span>`;
        break;
      case 'final':
        html = `Final — ${name(sb.home)} ${safe(sc(sb.home),'0')} — ${name(sb.away)} ${safe(sc(sb.away),'0')}`;
        break;
      default:
        html = `<span class="muted">No game in progress.</span>`;
    }
    box.innerHTML = html;

    if (stampEl) {
      const when = sb.fetchedAt || sb.fetched_at || sb.fetched || null;
      stampEl.textContent = when ? new Date(when).toLocaleTimeString() : '';
    }

    if (initial) {
      clearInterval(scoreTimer);
      scoreTimer = setInterval(bootScorebox, 30_000);
    }
  }

  /* ---------- WEATHER NOW (optional) ---------- */
  let wxTimer;
  async function bootWeather() {
    const wx = await getJSON('weather.json', null);
    const el = $('#wxNow');
    if (!el || !wx) return;

    const t = Math.round(wx?.current?.temperature ?? wx?.temp ?? NaN);
    const w = Math.round(wx?.current?.windspeed ?? wx?.wind ?? NaN);
    el.textContent = isNaN(t) ? '—' : `${t}° • Wind ${isNaN(w)?'—':w} mph`;
  }

  /* ---------- init all ---------- */
  (async () => {
    bootCountdown();
    bootSchedule();
    bootScorebox(true);
    bootWeather();
    clearInterval(wxTimer);
    wxTimer = setInterval(bootWeather, 10 * 60 * 1000);
  })();

})();
</script>

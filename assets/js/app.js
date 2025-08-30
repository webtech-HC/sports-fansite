/* Tennessee Fansite — shared JS (safe / idempotent) */
(() => {
  if (window.__TN_APP_INIT__) return; // guard
  window.__TN_APP_INIT__ = true;

  // tiny helpers
  const $  = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
  const safe = (v) => (v ?? '');

  // always-bust CDN cache (GH Pages) for JSON fetches
  async function getJSON(path, fallback = null) {
    try {
      const bust = (path.includes('?') ? '&' : '?') + '_=' + Date.now();
      const url  = path + bust;
      const res  = await fetch(url, { cache: 'no-store', headers: { 'Accept': 'application/json' } });
      if (!res.ok) throw new Error(`HTTP ${res.status} for ${path}`);
      return await res.json();
    } catch (err) {
      console.warn('getJSON fallback ->', path, err.message);
      return fallback;
    }
  }

  /* ---------------------------------------------
     COUNTDOWN (from /data/schedule.json)
  ---------------------------------------------- */
  async function bootCountdown() {
    const data = await getJSON('/data/schedule.json', []);
    const list = Array.isArray(data) ? data : (data.games || []);
    const now  = new Date();
    const next = list.find(g => new Date(g.start) > now);
    if (!next) return;

    const $d = $('#cd-days'), $h = $('#cd-hrs'), $m = $('#cd-min'), $s = $('#cd-sec');
    if (!$d || !$h || !$m || !$s) return;

    function tick() {
      const t   = new Date(next.start) - new Date();
      const dd  = Math.max(0, Math.floor(t / 86400000));
      const hh  = Math.max(0, Math.floor((t % 86400000) / 3600000));
      const mm  = Math.max(0, Math.floor((t % 3600000)  / 60000));
      const ss  = Math.max(0, Math.floor((t % 60000)    / 1000));
      $d.textContent = String(dd).padStart(2, '0');
      $h.textContent = String(hh).padStart(2, '0');
      $m.textContent = String(mm).padStart(2, '0');
      $s.textContent = String(ss).padStart(2, '0');
    }
    tick();
    setInterval(tick, 1000);

    // “Add to Google Calendar” deep link
    const btn = $('#addToCal');
    if (btn) {
      const start = new Date(next.start);
      const end   = new Date(start.getTime() + 3 * 60 * 60 * 1000);
      const pad   = (n) => String(n).padStart(2, '0');
      const fmt   = (d) => (
        d.getUTCFullYear() +
        pad(d.getUTCMonth() + 1) +
        pad(d.getUTCDate()) + 'T' +
        pad(d.getUTCHours()) +
        pad(d.getUTCMinutes()) + '00Z'
      );
      const title   = encodeURIComponent('Tennessee vs ' + safe(next.opponent));
      const details = encodeURIComponent('Unofficial fan hub — Tennessee Gameday');
      const location= encodeURIComponent(next.isHome ? 'Neyland Stadium, Knoxville, TN' : 'Away');
      const url =
        `https://www.google.com/calendar/render?action=TEMPLATE` +
        `&text=${title}` +
        `&dates=${fmt(start)}/${fmt(end)}` +
        `&location=${location}` +
        `&details=${details}`;
      btn.href   = url;
      btn.target = '_blank';
      btn.rel    = 'noopener';
    }
  }

  /* ---------------------------------------------
     SCHEDULE (3 rows)
  ---------------------------------------------- */
  async function bootSchedule() {
    const [schedRaw, meta] = await Promise.all([
      getJSON('/data/schedule.json', []),
      getJSON('/data/meta.json', { lastUpdated: null })
    ]);

    const sched = Array.isArray(schedRaw) ? schedRaw : (schedRaw.games || []);
    const tbody = $('#sched');
    if (tbody) {
      tbody.innerHTML = '';
      sched.slice(0, 3).forEach(({ start, opponent, isHome, tv, result }) => {
        const d  = new Date(start);
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td>${d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })}</td>
          <td>${safe(opponent)}</td>
          <td>${isHome ? 'H' : 'A'}</td>
          <td>${safe(tv || '—')}</td>
          <td>${safe(result || '—')}</td>
        `;
        tbody.appendChild(tr);
      });
    }

    const stamp = $('#dataStamp');
    if (stamp) {
      const when = meta && meta.lastUpdated ? new Date(meta.lastUpdated) : new Date();
      stamp.textContent = `Data updated — ${when.toLocaleString()}`;
    }
  }

  /* ---------------------------------------------
     LIVE SCOREBOARD (poll /data/scoreboard.json)
  ---------------------------------------------- */
  async function bootScoreboard() {
    const box   = $('#scoreBody');
    const stamp = $('#scoreStamp');
    if (!box) return;

    function teamRow(label, score) {
      return `<div class="score-row"><span class="team">${safe(label)}</span><strong class="score">${safe(score)}</strong></div>`;
    }

    function paint(data) {
      let html = '';
      const s  = (data && data.status) || 'none';

      if (s === 'pre') {
        html = `<span class="muted">Kickoff soon — ${safe(data.clock || '')}</span>`;
      } else if (s === 'in_progress') {
        html = `
          ${teamRow(data.away?.name, data.away?.score)}
          ${teamRow(data.home?.name, data.home?.score)}
          <div class="clock">${safe(data.clock)}</div>
        `;
      } else if (s === 'final') {
        html = `
          ${teamRow(data.away?.name, data.away?.score)}
          ${teamRow(data.home?.name, data.home?.score)}
          <div class="badge">Final</div>
        `;
      } else if (s === 'postponed' || s === 'canceled') {
        html = `<span class="muted text-warning">${s[0].toUpperCase() + s.slice(1)}</span>`;
      } else {
        html = `<span class="muted">No game in progress.</span>`;
      }

      box.innerHTML = html;
      if (stamp) stamp.textContent = new Date().toLocaleTimeString();
    }

    async function poll() {
      const data = await getJSON('/data/scoreboard.json', { status: 'none' });
      paint(data);
    }

    poll();
    setInterval(poll, 20000); // 20s
  }

  /* --------------------------------------------- */
  document.addEventListener('DOMContentLoaded', () => {
    bootCountdown();
    bootSchedule();
    bootScoreboard();
  });
})();


// Lightweight shared helpers for the sub-pages (no countdowns here).
const $  = (s, ctx=document) => ctx.querySelector(s);
const $$ = (s, ctx=document) => [...ctx.querySelectorAll(s)];
const pad2 = n => String(n).padStart(2,'0');

async function fetchJSON(path, fallback=null){
  try{
    const res = await fetch(path, { cache: 'no-store' });
    if(!res.ok) throw new Error(res.statusText);
    return await res.json();
  }catch(e){
    console.warn('fetchJSON failed:', path, e);
    return fallback;
  }
}

function navActive(){
  const here = location.pathname.split('/').pop() || 'index.html';
  $$('.nav a').forEach(a=>{
    const target = a.getAttribute('href');
    if(target && here && target.endsWith(here)) a.classList.add('active');
  });
}

// ---------- Schedule page ----------
function paintScheduleTable(tbody, games){
  if(!tbody) return;
  tbody.innerHTML = (games||[]).map(g=>{
    const dt = g.date ? new Date(g.date) : null;
    const dateStr = dt
      ? `${dt.toLocaleDateString([], {month:'short', day:'numeric', weekday:'short'})} ${dt.toLocaleTimeString([], {hour:'numeric',minute:'2-digit'})}`
      : 'TBA';
    return `
      <tr>
        <td>${dateStr}</td>
        <td>${g.opponent ?? 'TBD'}</td>
        <td>${g.home ? 'Home' : 'Away'}</td>
        <td>${g.tv ?? 'TBD'}</td>
        <td>${g.result ?? ''}</td>
      </tr>
    `;
  }).join('') || `<tr><td colspan="5">No games yet.</td></tr>`;
}

export async function initSchedulePage(){
  navActive();
  const data = await fetchJSON('./data/schedule.json', []);
  const tbody = $('#schBody');
  paintScheduleTable(tbody, data);

  // simple filter/search
  const q = $('#oppoSearch');
  const onlyHome = $('#fHome');
  const onlyAway = $('#fAway');

  function apply(){
    const term = (q?.value || '').toLowerCase().trim();
    const filtered = (data||[]).filter(g=>{
      if(onlyHome.checked && !g.home) return false;
      if(onlyAway.checked && g.home) return false;
      if(term && !(g.opponent||'').toLowerCase().includes(term)) return false;
      return true;
    });
    paintScheduleTable(tbody, filtered);
  }
  [q, onlyHome, onlyAway].forEach(el=> el && el.addEventListener('input', apply));
}

// ---------- Specials page ----------
function paintSpecialsGrid(container, items){
  if(!container) return;
  container.innerHTML = (items||[]).map(x=>`
    <article class="sp">
      <h3>${x.title}</h3>
      <div class="meta">${x.biz} • ${x.area} • ${x.time}</div>
      <p><a href="${x.link || '#'}">Details</a></p>
    </article>
  `).join('') || `<p class="muted">No specials yet. Check back soon.</p>`;
}

export async function initSpecialsPage(){
  navActive();
  const data = await fetchJSON('./data/specials.json', []);
  paintSpecialsGrid($('#specialsGrid'), data);
}

// ---------- Map page (placeholder) ----------
export function initMapPage(){
  navActive();
  // You can wire Leaflet here later. For now it’s static.
}

// ---------- Guide page ----------
export function initGuidePage(){
  navActive();
}

// ---------- Submit page (preview + copy JSON) ----------
export function initSubmitPage(){
  navActive();
  const form = $('#dealForm');
  const out  = $('#preview');
  const copyBtn = $('#copyJson');

  function readForm(){
    const f = new FormData(form);
    return {
      title:  f.get('title')?.trim() || '',
      biz:    f.get('biz')?.trim() || '',
      area:   f.get('area')?.trim() || '',
      time:   f.get('time')?.trim() || '',
      link:   f.get('link')?.trim() || '',
    };
  }

  function paint(){
    const v = readForm();
    out.innerHTML = `
      <article class="sp">
        <h3>${v.title || 'Deal title'}</h3>
        <div class="meta">${v.biz || 'Business'} • ${v.area || 'Area'} • ${v.time || 'Time window'}</div>
        <p><a href="${v.link || '#'}">Details</a></p>
      </article>
    `;
  }

  form.addEventListener('input', paint);
  paint();

  copyBtn.addEventListener('click', async ()=>{
    const json = JSON.stringify(readForm(), null, 2);
    await navigator.clipboard.writeText(json);
    copyBtn.textContent = 'Copied!';
    setTimeout(()=> copyBtn.textContent = 'Copy JSON', 1200);
  });
}

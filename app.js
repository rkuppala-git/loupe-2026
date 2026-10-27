(() => {
'use strict';
const $ = s => document.querySelector(s);
const el = (t, a = {}, ...kids) => { const e = document.createElement(t); for (const k in a) { if (k === 'class') e.className = a[k]; else if (k.startsWith('on')) e.addEventListener(k.slice(2), a[k]); else e.setAttribute(k, a[k]); } for (const c of kids.flat()) if (c != null) e.append(c.nodeType ? c : document.createTextNode(c)); return e; };
const esc = s => String(s ?? '');

// ---------- small prefs (localStorage, guarded) ----------
const P = {
  get(k, d) { try { const v = localStorage.getItem('lp_' + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem('lp_' + k, JSON.stringify(v)); } catch {} }
};

// ---------- IndexedDB ----------
let dbp;
function db() {
  return dbp ||= new Promise((res, rej) => {
    const r = indexedDB.open('loupe2026', 1);
    r.onupgradeneeded = () => { const d = r.result; d.createObjectStore('contacts', { keyPath: 'id' }); d.createObjectStore('photos'); };
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  });
}
async function tx(store, mode, fn) {
  const d = await db();
  return new Promise((res, rej) => { const t = d.transaction(store, mode); const s = t.objectStore(store); const out = fn(s); t.oncomplete = () => res(out && 'result' in out ? out.result : out); t.onerror = () => rej(t.error); });
}
const allContacts = () => tx('contacts', 'readonly', s => s.getAll());
const putContact = c => tx('contacts', 'readwrite', s => s.put(c));
const delContact = id => tx('contacts', 'readwrite', s => s.delete(id));
const putPhoto = (id, blob) => tx('photos', 'readwrite', s => s.put(blob, id));
const getPhoto = id => tx('photos', 'readonly', s => s.get(id));
const delPhoto = id => tx('photos', 'readwrite', s => s.delete(id));
if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});

// ---------- data ----------
const STAND = {}; for (const s of window.STANDS) if (s[0]) STAND[s[0]] = { code: s[0], type: s[1], x: s[2], y: s[3], w: s[4], d: s[5], name: s[6] };
const ROUTE = window.ROUTE;
const R = id => ROUTE.find(r => r.id === id);

let state = { day: P.get('day', defaultDay()), tab: P.get('tab', 'route'), status: P.get('status', {}), contacts: [] };
function defaultDay() { const d = new Date(); return (d.getFullYear() === 2026 && d.getMonth() === 9 && d.getDate() === 30) ? 2 : 1; }
const dayRoute = () => ROUTE.filter(r => r.day === state.day);
const nextStop = () => dayRoute().find(r => !state.status[r.id]);
const lastDone = () => dayRoute().filter(r => state.status[r.id] === 'done').pop();
function setStatus(id, v) { if (v) state.status[id] = v; else delete state.status[id]; P.set('status', state.status); renderAll(); }

// ---------- toast ----------
let tt; function toast(m) { const t = $('#toast'); t.textContent = m; t.classList.remove('hidden'); clearTimeout(tt); tt = setTimeout(() => t.classList.add('hidden'), 2200); }

// ---------- header ----------
function renderHeader() {
  document.querySelectorAll('#daySeg button').forEach(b => b.classList.toggle('on', +b.dataset.day === state.day));
  document.querySelectorAll('#tabs button').forEach(b => b.classList.toggle('on', b.dataset.tab === state.tab));
  document.querySelectorAll('.tab').forEach(s => s.classList.toggle('on', s.id === 'tab-' + state.tab));
  $('#ccount').textContent = state.contacts.length || '';
}
$('#daySeg').addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; state.day = +b.dataset.day; P.set('day', state.day); renderAll(); if (state.tab === 'map') centerOnNext(); });
$('#tabs').addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; state.tab = b.dataset.tab; P.set('tab', state.tab); renderHeader(); if (state.tab === 'map') { renderMap(); centerOnNext(); } });

// ---------- route ----------
function contactsFor(rid) { return state.contacts.filter(c => c.routeId === rid); }
function renderRoute() {
  const nx = nextStop();
  const nc = $('#nextCard'); nc.innerHTML = '';
  if (nx) {
    const from = lastDone();
    nc.append(el('div', { class: 'next' },
      el('div', { class: 'lbl' }, `Next · ${nx.time} · Stand ${nx.stand}`),
      el('div', { class: 'co' }, nx.co),
      el('div', {}, nx.angle),
      from ? el('div', { class: 'muted' }, `From ${from.stand}: ${walkHint(from.stand, nx.stand)}`) : el('div', { class: 'muted' }, walkHintFromEntrance(nx.stand)),
      el('div', { class: 'btns' },
        el('button', { class: 'primary', onclick: () => openStop(nx.id) }, 'Open'),
        el('button', { class: 'ghost', onclick: () => showOnMap(nx.stand) }, 'Map'),
        el('button', { class: 'ghost', onclick: () => { setStatus(nx.id, 'done'); toast('Marked visited'); } }, 'Visited ✓'),
        el('button', { class: 'ghost', onclick: () => { setStatus(nx.id, 'skip'); toast('Skipped'); } }, 'Skip'))));
  } else nc.append(el('div', { class: 'next' }, el('div', { class: 'co' }, 'Day complete'), el('div', {}, 'Export your contacts from the Contacts tab tonight.')));

  const ul = $('#routeList'); ul.innerHTML = '';
  for (const r of dayRoute()) {
    const st = state.status[r.id]; const n = contactsFor(r.id).length;
    ul.append(el('li', { class: [st || '', r.brk ? 'brk' : '', nx && nx.id === r.id ? 'isnext' : ''].join(' '), onclick: () => openStop(r.id) },
      el('div', { class: 'n' }, st === 'done' ? '✓' : String(r.seq)),
      el('div', { class: 'mid' },
        el('div', { class: 'co' }, r.co),
        el('div', { class: 'meta' }, `${r.time} · Stand ${r.stand}`),
        el('div', { class: 'ang' }, r.angle),
        n ? el('div', { class: 'cc' }, `${n} contact${n > 1 ? 's' : ''}`) : null)));
  }
}
function dirWord(dx, dy) {
  const parts = [];
  if (Math.abs(dy) > 4) parts.push(dy > 0 ? 'towards the back' : 'towards the front');
  if (Math.abs(dx) > 4) parts.push(dx > 0 ? 'right' : 'left');
  return parts.join(', ') || 'right here';
}
function walkHint(a, b) { const A = STAND[a], B = STAND[b]; if (!A || !B) return ''; const m = Math.round(Math.abs(A.x - B.x) + Math.abs(A.y - B.y)); return `~${m} m ${dirWord(B.x - A.x, B.y - A.y)}`; }
function walkHintFromEntrance(b) { const B = STAND[b]; if (!B) return ''; const m = Math.round(Math.abs(B.x - ENT.x) + Math.abs(B.y - ENT.y)); return `From the entrance: ~${m} m ${dirWord(B.x - ENT.x, B.y - ENT.y)}`; }

// ---------- map ----------
const ENT = { x: 64, y: 150 };
const MINX = 10, MAXX = 200, MINY = 144, MAXY = 268; // meters; front = low y (drawn at bottom)
const W = MAXX - MINX, H = MAXY - MINY;
const sx = x => x - MINX, sy = y => MAXY - y;
const COLS = [['A', 16], ['B', 33], ['C', 49], ['D', 61], ['E', 70], ['F', 82], ['G', 95], ['H', 106], ['J', 122], ['K', 140], ['L', 159], ['M', 168], ['N', 184], ['P', 194]];
let zoom = P.get('zoom', 2.2), selected = null, searchHits = new Set();
const NS = 'http://www.w3.org/2000/svg';
const sv = (t, a = {}, txt) => { const e = document.createElementNS(NS, t); for (const k in a) e.setAttribute(k, a[k]); if (txt != null) e.textContent = txt; return e; };

function renderMap() {
  const svg = $('#map'); svg.innerHTML = '';
  const wrap = $('#mapWrap'); const pxW = Math.max(300, wrap.clientWidth || 360) * zoom;
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`); svg.setAttribute('width', pxW); svg.setAttribute('height', pxW * H / W);
  svg.append(sv('rect', { x: sx(13), y: sy(267), width: 196 - 13 + 2, height: 267 - 146, fill: '#fff', stroke: '#9aa6b5', 'stroke-width': 0.4 }));
  for (const [c, x] of COLS) { svg.append(sv('text', { x: sx(x), y: sy(267) - 0.8, 'font-size': 2.6, 'text-anchor': 'middle', fill: '#9aa6b5', 'font-weight': 700 }, c)); svg.append(sv('text', { x: sx(x), y: sy(146) + 3, 'font-size': 2.6, 'text-anchor': 'middle', fill: '#9aa6b5', 'font-weight': 700 }, c)); }
  svg.append(sv('text', { x: W / 2, y: sy(267) - 3.8, 'font-size': 2.4, 'text-anchor': 'middle', fill: '#9aa6b5' }, 'BACK WALL'));
  // entrance
  svg.append(sv('path', { d: `M${sx(ENT.x) - 4} ${sy(146) + 1.5} l4 -3 l4 3 z`, fill: '#D64545' }));
  svg.append(sv('text', { x: sx(ENT.x), y: sy(146) + 5.5, 'font-size': 2.4, 'text-anchor': 'middle', fill: '#D64545', 'font-weight': 700 }, 'ENTRANCE / REGISTRATION'));

  const dr = dayRoute(); const nx = nextStop(); const ld = lastDone();
  const routeStands = new Map(); dr.forEach(r => { if (!routeStands.has(r.stand)) routeStands.set(r.stand, r); });
  for (const s of window.STANDS) {
    const [code, type, x, y, w, d, name] = s;
    let fill = '#e8ecf2', stroke = '#c3ccd8';
    if (type === 4) { fill = '#cfd5de'; stroke = 'none'; }
    if (type === 3) { fill = '#fbe6b0'; stroke = '#e2b955'; }
    const r = code && routeStands.get(code);
    if (r) { const st = state.status[r.id]; fill = st === 'done' ? '#cdebd9' : st === 'skip' ? '#eceff3' : '#cfe0fb'; stroke = st === 'done' ? '#2E9E62' : '#1660D9'; }
    if (code && searchHits.has(code)) { fill = '#ffd9a0'; stroke = '#F7A033'; }
    if (code && selected === code) { stroke = '#2E3A4B'; }
    const g = sv('g', { 'data-code': code || '' });
    g.append(sv('rect', { x: sx(x) - w / 2, y: sy(y) - d / 2, width: w, height: d, fill, stroke, 'stroke-width': r || selected === code ? 0.45 : 0.2, rx: 0.3 }));
    if (code && type !== 4 && !(type === 3 && w < 8)) g.append(sv('text', { x: sx(x), y: sy(y) + 0.5, 'font-size': type === 3 ? 1.8 : (r ? 1.5 : 1.1), 'text-anchor': 'middle', fill: r ? '#1660D9' : '#7a8696', 'font-weight': r ? 700 : 400 }, type === 3 ? name.replace('LOUPE India ', '') : code));
    if (code) g.addEventListener('click', () => selectStand(code));
    svg.append(g);
  }
  // route path
  const pts = dr.filter(r => STAND[r.stand]).map(r => `${sx(STAND[r.stand].x)},${sy(STAND[r.stand].y)}`);
  svg.append(sv('polyline', { points: pts.join(' '), fill: 'none', stroke: '#1660D9', 'stroke-width': 0.35, 'stroke-dasharray': '1.2 0.9', opacity: 0.55 }));
  // markers
  dr.forEach(r => {
    const s = STAND[r.stand]; if (!s) return; const st = state.status[r.id];
    const isNext = nx && nx.id === r.id;
    const off = dr.filter(q => q.stand === r.stand).indexOf(r) * 3.4;
    const cx = sx(s.x) + off, cy = sy(s.y) - (s.d / 2) - 1.2;
    const c = sv('g', {});
    if (isNext) c.append(sv('circle', { cx, cy, r: 3.2, fill: '#F7A033', opacity: 0.35 }, null));
    c.append(sv('circle', { cx, cy, r: 1.7, fill: isNext ? '#F7A033' : st === 'done' ? '#2E9E62' : st === 'skip' ? '#aab3c0' : r.brk ? '#e2b955' : '#1660D9', stroke: '#fff', 'stroke-width': 0.3 }));
    c.append(sv('text', { x: cx, y: cy + 0.75, 'font-size': 2, 'text-anchor': 'middle', fill: isNext ? '#2E3A4B' : '#fff', 'font-weight': 700 }, st === 'done' ? '✓' : String(r.seq)));
    c.addEventListener('click', () => selectStand(r.stand));
    svg.append(c);
  });
  if (ld && STAND[ld.stand]) { const s = STAND[ld.stand]; svg.append(sv('text', { x: sx(s.x), y: sy(s.y) + s.d / 2 + 2.6, 'font-size': 1.9, 'text-anchor': s.x > 185 ? 'end' : s.x < 25 ? 'start' : 'middle', fill: '#2E9E62', 'font-weight': 700 }, 'YOU ARE HERE')); }
}
function selectStand(code) {
  selected = code; const s = STAND[code]; const rs = ROUTE.filter(r => r.stand === code);
  const info = $('#mapInfo'); info.innerHTML = '';
  info.append(el('b', {}, `${code} · ${s ? s.name : ''}`));
  for (const r of rs) info.append(el('div', {}, `Day ${r.day} #${r.seq} ${r.time}: ${r.co} `, el('a', { href: '#', onclick: e => { e.preventDefault(); openStop(r.id); } }, 'open')));
  const ld = lastDone(); if (ld && ld.stand !== code) info.append(el('div', { class: 'muted' }, `From ${ld.stand}: ${walkHint(ld.stand, code)}`));
  renderMap();
}
function scrollToStand(code) {
  const s = STAND[code]; if (!s) return; const wrap = $('#mapWrap'); const svg = $('#map');
  const k = svg.getAttribute('width') / W;
  wrap.scrollTo({ left: sx(s.x) * k - wrap.clientWidth / 2, top: sy(s.y) * k - wrap.clientHeight / 2, behavior: 'smooth' });
}
function centerOnNext() { requestAnimationFrame(() => { const nx = nextStop(); if (nx) scrollToStand(nx.stand); }); }
function showOnMap(code) { state.tab = 'map'; P.set('tab', 'map'); closeSheet(); renderHeader(); selectStand(code); requestAnimationFrame(() => scrollToStand(code)); }
function setZoom(z) {
  const wrap = $('#mapWrap'); const cx = (wrap.scrollLeft + wrap.clientWidth / 2) / (wrap.scrollWidth || 1), cy = (wrap.scrollTop + wrap.clientHeight / 2) / (wrap.scrollHeight || 1);
  zoom = Math.min(8, Math.max(1, z)); P.set('zoom', zoom); renderMap();
  wrap.scrollLeft = cx * wrap.scrollWidth - wrap.clientWidth / 2; wrap.scrollTop = cy * wrap.scrollHeight - wrap.clientHeight / 2;
}
$('#zoomIn').onclick = () => setZoom(zoom * 1.4);
$('#zoomOut').onclick = () => setZoom(zoom / 1.4);
$('#search').addEventListener('input', e => {
  const q = e.target.value.trim().toLowerCase(); searchHits = new Set();
  if (q.length >= 2) for (const c in STAND) { const s = STAND[c]; if (c.toLowerCase() === q || s.name.toLowerCase().includes(q)) searchHits.add(c); }
  for (const r of ROUTE) if (q.length >= 2 && r.co.toLowerCase().includes(q)) searchHits.add(r.stand);
  renderMap();
  const first = [...searchHits][0];
  $('#mapInfo').textContent = q.length < 2 ? 'Tap a stand.' : searchHits.size ? `${searchHits.size} match${searchHits.size > 1 ? 'es' : ''}: ${[...searchHits].slice(0, 6).join(', ')}` : 'No match';
  if (first) scrollToStand(first);
});

// ---------- sheet ----------
function openSheet(content) { const b = $('#sheetBody'); b.innerHTML = ''; b.append(content); $('#sheet').classList.remove('hidden'); }
function closeSheet() { $('#sheet').classList.add('hidden'); }
$('#sheet').addEventListener('click', e => { if (e.target.id === 'sheet') closeSheet(); });

function openStop(rid) {
  const r = R(rid); const s = STAND[r.stand]; const st = state.status[rid];
  const list = el('div', {});
  contactsFor(rid).forEach(c => list.append(contactCard(c)));
  openSheet(el('div', {},
    el('h2', {}, r.co),
    el('div', { class: 'sub' }, `Day ${r.day} · #${r.seq} · ${r.time} · Stand ${r.stand}${s && s.name && !r.brk ? ' (' + s.name + ' on plan)' : ''}`),
    el('div', { class: 'ang' }, r.angle),
    el('div', { class: 'row' },
      el('button', { class: 'primary', onclick: () => editContact({ routeId: rid }) }, '+ Add contact'),
      el('button', { class: 'ghost', onclick: () => showOnMap(r.stand) }, 'Map'),
      st === 'done' ? el('button', { class: 'ghost', onclick: () => { setStatus(rid, null); openStop(rid); } }, 'Undo visited') : el('button', { class: 'ghost', onclick: () => { setStatus(rid, 'done'); closeSheet(); toast('Marked visited'); } }, 'Visited ✓'),
      st === 'skip' ? el('button', { class: 'ghost', onclick: () => { setStatus(rid, null); openStop(rid); } }, 'Unskip') : el('button', { class: 'ghost', onclick: () => { setStatus(rid, 'skip'); closeSheet(); } }, 'Skip')),
    list,
    el('div', { class: 'row' }, el('button', { class: 'ghost', onclick: closeSheet }, 'Close'))));
}

function editContact(c) {
  const isNew = !c.id;
  c = Object.assign({ id: 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), photos: [], person: '', notes: '', next: '', company: '', place: '', ts: Date.now() }, c);
  const r = c.routeId ? R(c.routeId) : null;
  const pending = [...c.photos]; const added = []; const removed = [];
  const thumbs = el('div', { class: 'thumbs' });
  async function drawThumbs() {
    thumbs.innerHTML = '';
    for (const pid of pending) {
      const b = added.find(a => a.id === pid)?.blob || await getPhoto(pid); if (!b) continue;
      const u = URL.createObjectURL(b);
      thumbs.append(el('div', { style: 'position:relative' }, el('img', { src: u, onclick: () => viewImg(u) }),
        el('button', { style: 'position:absolute;top:-6px;right:-6px;border:0;border-radius:50%;width:22px;height:22px;background:#D64545;color:#fff', onclick: () => { pending.splice(pending.indexOf(pid), 1); removed.push(pid); drawThumbs(); } }, '×')));
    }
  }
  const fileIn = el('input', { type: 'file', accept: 'image/*', capture: 'environment' });
  fileIn.addEventListener('change', async () => {
    for (const f of fileIn.files) { const blob = await shrink(f); const id = c.id + '_' + Date.now().toString(36) + added.length; added.push({ id, blob }); pending.push(id); }
    fileIn.value = ''; drawThumbs();
  });
  const fileIn2 = el('input', { type: 'file', accept: 'image/*', multiple: '' });
  fileIn2.addEventListener('change', () => { fileIn.files = fileIn2.files; fileIn.dispatchEvent(new Event('change')); });
  const inCo = el('input', { type: 'text', placeholder: 'Company', value: c.company || '' });
  const inPlace = el('input', { type: 'text', placeholder: 'e.g. Food court, Lounge, Stand H19', value: c.place || '' });
  const inP = el('input', { type: 'text', placeholder: 'Name, role', value: c.person || '' });
  const inN = el('textarea', { placeholder: 'Tap the mic on your keyboard to dictate' }); inN.value = c.notes || '';
  const inX = el('input', { type: 'text', placeholder: 'e.g. Send 2-pager by Mon', value: c.next || '' });
  drawThumbs();
  openSheet(el('div', {},
    el('h2', {}, isNew ? 'New contact' : 'Edit contact'),
    el('div', { class: 'sub' }, r ? `${r.co} · Stand ${r.stand}` : 'Walk-up (not on route)'),
    r ? null : el('label', { class: 'f' }, 'Company'), r ? null : inCo,
    r ? null : el('label', { class: 'f' }, 'Where you met'), r ? null : inPlace,
    el('label', { class: 'f' }, 'Person'), inP,
    el('label', { class: 'f' }, 'Business card'),
    el('div', { class: 'row' }, el('label', { class: 'photobtn' }, '📷 Take photo', fileIn), el('label', { class: 'photobtn', style: 'background:#6b7686' }, 'Gallery', fileIn2)),
    thumbs,
    el('label', { class: 'f' }, 'Notes'), inN,
    el('label', { class: 'f' }, 'Next step'), inX,
    el('div', { class: 'row' },
      el('button', { class: 'primary', onclick: async () => {
        c.person = inP.value.trim(); c.notes = inN.value.trim(); c.next = inX.value.trim(); c.photos = pending;
        if (!r) { c.company = inCo.value.trim(); c.place = inPlace.value.trim(); c.day = state.day; }
        else { c.company = r.co; c.place = 'Stand ' + r.stand; c.day = r.day; c.stand = r.stand; }
        c.updated = Date.now();
        for (const a of added) if (pending.includes(a.id)) await putPhoto(a.id, a.blob);
        for (const pid of removed) await delPhoto(pid);
        await putContact(c);
        if (r && !state.status[r.id]) state.status[r.id] = 'done', P.set('status', state.status);
        await reloadContacts(); toast('Saved on phone'); r ? openStop(r.id) : closeSheet();
      } }, 'Save'),
      el('button', { class: 'ghost', onclick: () => r ? openStop(r.id) : closeSheet() }, 'Cancel'),
      isNew ? null : el('button', { class: 'danger', onclick: async () => { if (!confirm('Delete this contact?')) return; for (const p of c.photos) await delPhoto(p); await delContact(c.id); await reloadContacts(); r ? openStop(r.id) : closeSheet(); } }, 'Delete'))));
}
function viewImg(u) { const v = el('div', { class: 'imgview', onclick: () => v.remove() }, el('img', { src: u })); document.body.append(v); }
async function shrink(file) {
  try {
    const bmp = await createImageBitmap(file); const m = 1800; const k = Math.min(1, m / Math.max(bmp.width, bmp.height));
    const cv = document.createElement('canvas'); cv.width = Math.round(bmp.width * k); cv.height = Math.round(bmp.height * k);
    cv.getContext('2d').drawImage(bmp, 0, 0, cv.width, cv.height);
    return await new Promise(res => cv.toBlob(b => res(b || file), 'image/jpeg', 0.82));
  } catch { return file; }
}

// ---------- contacts tab ----------
function contactCard(c) {
  const th = el('div', { class: 'thumbs' });
  (async () => { for (const p of c.photos || []) { const b = await getPhoto(p); if (b) { const u = URL.createObjectURL(b); th.append(el('img', { src: u, onclick: e => { e.stopPropagation(); viewImg(u); } })); } } })();
  return el('div', { class: 'card', onclick: () => editContact(c) },
    el('div', { class: 'h' }, el('div', {}, el('div', { class: 'who' }, c.person || '(no name)'), el('div', { class: 'where' }, `${c.company || ''} · ${c.place || ''}`)), el('div', { class: 'where' }, new Date(c.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }))),
    c.notes ? el('div', { class: 'notes' }, c.notes) : null,
    c.next ? el('div', { class: 'ns' }, el('b', {}, 'Next: '), c.next) : null, th);
}
function renderContacts() {
  const box = $('#contactList'); box.innerHTML = '';
  const le = P.get('lastExport', 0);
  $('#lastExport').textContent = le ? `Last export ${new Date(le).toLocaleString([], { weekday: 'short', hour: '2-digit', minute: '2-digit' })}` : 'Not exported yet. Export each evening.';
  if (!state.contacts.length) { box.append(el('div', { class: 'muted' }, 'No contacts yet. Open a stop on the Route tab, or tap + Contact for someone you meet at lunch.')); return; }
  for (const d of [1, 2]) {
    const cs = state.contacts.filter(c => c.day === d).sort((a, b) => b.ts - a.ts); if (!cs.length) continue;
    box.append(el('div', { class: 'grp' }, `Day ${d} · ${cs.length}`)); cs.forEach(c => box.append(contactCard(c)));
  }
}
async function reloadContacts() { state.contacts = await allContacts(); renderAll(); }
$('#fab').onclick = () => editContact({ routeId: null, place: '' });

// ---------- export (zip, store method) ----------
const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
const crc32 = u => { let c = 0xFFFFFFFF; for (let i = 0; i < u.length; i++) c = CRC[(c ^ u[i]) & 255] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };
function zip(files) {
  const enc = new TextEncoder(); const parts = []; const cd = []; let off = 0;
  const d = new Date(); const dt = ((d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1)) & 0xFFFF, dd = (((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate()) & 0xFFFF;
  for (const f of files) {
    const name = enc.encode(f.name), data = f.data, crc = crc32(data);
    const h = new DataView(new ArrayBuffer(30)); h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(6, 0x0800, true); h.setUint16(8, 0, true); h.setUint16(10, dt, true); h.setUint16(12, dd, true); h.setUint32(14, crc, true); h.setUint32(18, data.length, true); h.setUint32(22, data.length, true); h.setUint16(26, name.length, true); h.setUint16(28, 0, true);
    parts.push(h.buffer, name, data);
    const c = new DataView(new ArrayBuffer(46)); c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x0800, true); c.setUint16(10, 0, true); c.setUint16(12, dt, true); c.setUint16(14, dd, true); c.setUint32(16, crc, true); c.setUint32(20, data.length, true); c.setUint32(24, data.length, true); c.setUint16(28, name.length, true); c.setUint32(42, off, true);
    cd.push(c.buffer, name); off += 30 + name.length + data.length;
  }
  const cdSize = cd.reduce((s, p) => s + (p.byteLength ?? p.length), 0);
  const e = new DataView(new ArrayBuffer(22)); e.setUint32(0, 0x06054b50, true); e.setUint16(8, files.length, true); e.setUint16(10, files.length, true); e.setUint32(12, cdSize, true); e.setUint32(16, off, true);
  return new Blob([...parts, ...cd, e.buffer], { type: 'application/zip' });
}
const csvCell = v => { v = esc(v); return /[",\n\r]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
async function buildExport() {
  const cs = [...state.contacts].sort((a, b) => a.day - b.day || a.ts - b.ts);
  const rows = [['Day', 'Time', 'Company', 'Where met', 'Stand', 'Route stop', 'Person', 'Notes', 'Next step', 'Card photos']];
  const files = [];
  for (const c of cs) {
    const r = c.routeId ? R(c.routeId) : null; const names = [];
    for (let i = 0; i < (c.photos || []).length; i++) { const b = await getPhoto(c.photos[i]); if (!b) continue; const safe = (c.company || 'walkup').replace(/[^\w]+/g, '-').slice(0, 30); const nm = `cards/D${c.day}_${safe}_${(c.person || 'x').replace(/[^\w]+/g, '-').slice(0, 20)}_${i + 1}.jpg`; names.push(nm); files.push({ name: nm, data: new Uint8Array(await b.arrayBuffer()), blob: b }); }
    rows.push([c.day, new Date(c.ts).toLocaleString('en-IN'), c.company, c.place, c.stand || '', r ? `D${r.day} #${r.seq}` : 'walk-up', c.person, c.notes, c.next, names.join(' ')]);
  }
  const status = ROUTE.map(r => [r.day, r.seq, r.time, r.stand, r.co, state.status[r.id] || 'not visited']);
  const csv = '﻿' + rows.map(r => r.map(csvCell).join(',')).join('\r\n');
  const csv2 = '﻿' + [['Day', 'Seq', 'Time', 'Stand', 'Company', 'Status'], ...status].map(r => r.map(csvCell).join(',')).join('\r\n');
  const enc = new TextEncoder();
  return { csv, files: [{ name: 'contacts.csv', data: enc.encode(csv) }, { name: 'route-status.csv', data: enc.encode(csv2) }, ...files] };
}
$('#exportBtn').onclick = async () => {
  if (!state.contacts.length) { toast('Nothing to export yet'); return; }
  const { csv, files } = await buildExport();
  const stamp = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '');
  const blob = zip(files); const name = `loupe2026_contacts_${stamp}.zip`;
  const choices = el('div', {},
    el('h2', {}, 'Export'),
    el('div', { class: 'sub' }, `${state.contacts.length} contacts, ${files.length - 2} card photos`),
    el('div', { class: 'row' },
      el('button', { class: 'primary', onclick: () => { const a = el('a', { href: URL.createObjectURL(blob), download: name }); document.body.append(a); a.click(); a.remove(); P.set('lastExport', Date.now()); renderContacts(); closeSheet(); toast('Saved to Downloads'); } }, 'Download zip'),
      navigator.canShare ? el('button', { class: 'ghost', onclick: async () => {
        const fs = [new File([csv], 'contacts.csv', { type: 'text/csv' }), ...files.filter(f => f.blob).map(f => new File([f.blob], f.name.replace('cards/', ''), { type: 'image/jpeg' }))];
        try { if (navigator.canShare({ files: fs })) { await navigator.share({ files: fs, title: 'LOUPE 2026 contacts' }); P.set('lastExport', Date.now()); renderContacts(); } else toast('Sharing not supported, use Download'); } catch (e) { if (e.name !== 'AbortError') toast('Share failed, use Download'); }
      } }, 'Share (Drive, email…)') : null),
    el('div', { class: 'muted' }, 'The zip has contacts.csv (opens in Excel or imports to Airtable), route-status.csv and the card photos.'),
    el('div', { class: 'row' }, el('button', { class: 'ghost', onclick: closeSheet }, 'Close')));
  openSheet(choices);
};

// ---------- boot ----------
function renderAll() { renderHeader(); renderRoute(); renderContacts(); if (state.tab === 'map') renderMap(); }
window.addEventListener('resize', () => { if (state.tab === 'map') renderMap(); });
reloadContacts().then(() => { if (state.tab === 'map') { renderMap(); centerOnNext(); } });
renderAll();
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
})();

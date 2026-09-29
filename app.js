'use strict';

// ---------- Storage (IndexedDB, everything stays on the phone) ----------
const DB_NAME = 'triplang';
let dbPromise;

function openDB() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        db.createObjectStore('trips', { keyPath: 'id' });
        db.createObjectStore('expenses', { keyPath: 'id' }).createIndex('tripId', 'tripId');
        db.createObjectStore('photos', { keyPath: 'id' }).createIndex('tripId', 'tripId');
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  return dbPromise;
}

async function tx(store, mode, fn) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const t = db.transaction(store, mode);
    const result = fn(t.objectStore(store));
    t.oncomplete = () => resolve(result && 'result' in result ? result.result : result);
    t.onerror = () => reject(t.error);
  });
}

const db = {
  all: (store) => tx(store, 'readonly', (s) => s.getAll()),
  byTrip: (store, tripId) => tx(store, 'readonly', (s) => s.index('tripId').getAll(tripId)),
  get: (store, id) => tx(store, 'readonly', (s) => s.get(id)),
  put: (store, obj) => tx(store, 'readwrite', (s) => s.put(obj)),
  del: (store, id) => tx(store, 'readwrite', (s) => s.delete(id)),
};

// ---------- Helpers ----------
const CATEGORIES = [
  { id: 'food', label: 'Food', emoji: '🍜' },
  { id: 'transport', label: 'Transport', emoji: '🚕' },
  { id: 'stay', label: 'Stay', emoji: '🏨' },
  { id: 'activity', label: 'Activities', emoji: '🎟️' },
  { id: 'shopping', label: 'Shopping', emoji: '🛍️' },
  { id: 'other', label: 'Other', emoji: '💸' },
];
const CURRENCIES = ['PHP', 'USD', 'EUR', 'JPY', 'KRW', 'SGD', 'THB', 'VND', 'IDR', 'MYR', 'HKD', 'TWD', 'CNY', 'AUD', 'GBP', 'CAD'];

const $ = (sel) => document.querySelector(sel);
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const today = () => new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD in local time
const cat = (id) => CATEGORIES.find((c) => c.id === id) || CATEGORIES[CATEGORIES.length - 1];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function money(n, currency) {
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency, maximumFractionDigits: 2 }).format(n);
  } catch {
    return `${currency} ${n.toFixed(2)}`;
  }
}
function prettyDate(d) {
  return new Date(d + 'T00:00').toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}
function toast(msg) {
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 2200);
}

// Shrink photos before saving so the phone doesn't fill up.
function resizeImage(file, maxSize = 1600, quality = 0.82) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const scale = Math.min(1, maxSize / Math.max(img.width, img.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('resize failed'))), 'image/jpeg', quality);
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Could not read image')); };
    img.src = url;
  });
}

// Object URLs for photo blobs, revoked on each re-render.
let objectUrls = [];
function blobUrl(blob) {
  const u = URL.createObjectURL(blob);
  objectUrls.push(u);
  return u;
}

// ---------- State & routing ----------
const state = { tripId: null, tab: 'expenses' };

function go(tripId, tab) {
  state.tripId = tripId;
  if (tab) state.tab = tab;
  location.hash = tripId ? `trip/${tripId}/${state.tab}` : '';
  render();
}

window.addEventListener('hashchange', () => {
  const [, id, tab] = location.hash.slice(1).split('/');
  state.tripId = id || null;
  if (tab) state.tab = tab;
  render();
});

// ---------- Rendering ----------
async function render() {
  objectUrls.forEach(URL.revokeObjectURL);
  objectUrls = [];
  if (state.tripId) {
    const trip = await db.get('trips', state.tripId);
    if (trip) return renderTrip(trip);
    state.tripId = null;
  }
  renderHome();
}

async function renderHome() {
  $('#title').textContent = 'My Trips';
  $('#backBtn').hidden = true;
  const [trips, expenses, photos] = await Promise.all([db.all('trips'), db.all('expenses'), db.all('photos')]);
  trips.sort((a, b) => (b.startDate || '').localeCompare(a.startDate || '') || b.createdAt - a.createdAt);

  if (!trips.length) {
    $('#app').innerHTML = `<div class="empty"><div style="font-size:48px">🧳</div>
      <p><b>No trips yet</b></p><p>Tap <b>+</b> to start your first trip.</p></div>`;
    return;
  }
  $('#app').innerHTML = trips.map((t) => {
    const total = expenses.filter((e) => e.tripId === t.id).reduce((s, e) => s + e.amount, 0);
    const cover = photos.find((p) => p.tripId === t.id);
    const style = cover ? `style="background-image:url(${blobUrl(cover.blob)})"` : '';
    return `<div class="card trip-item" data-id="${t.id}">
      <div class="cover" ${style}>${cover ? '' : '✈️'}</div>
      <div class="info"><div class="name">${esc(t.name)}</div>
        <div class="muted">${t.startDate ? prettyDate(t.startDate) : ''}${t.budget ? ' · Budget ' + money(t.budget, t.currency) : ''}</div></div>
      <div class="amt">${money(total, t.currency)}</div>
    </div>`;
  }).join('');
  document.querySelectorAll('.trip-item').forEach((el) => (el.onclick = () => go(el.dataset.id, 'expenses')));
}

async function renderTrip(trip) {
  $('#title').textContent = trip.name;
  $('#backBtn').hidden = false;
  const [expenses, photos] = await Promise.all([db.byTrip('expenses', trip.id), db.byTrip('photos', trip.id)]);
  const total = expenses.reduce((s, e) => s + e.amount, 0);

  let budgetHtml = '';
  if (trip.budget) {
    const pct = Math.min(100, (total / trip.budget) * 100);
    const left = trip.budget - total;
    budgetHtml = `<div class="sub"><span>Budget ${money(trip.budget, trip.currency)}</span>
      <span>${left >= 0 ? money(left, trip.currency) + ' left' : money(-left, trip.currency) + ' over!'}</span></div>
      <div class="progress ${left < 0 ? 'over' : ''}"><div style="width:${pct}%"></div></div>`;
  }

  const tabs = [['expenses', 'Expenses'], ['photos', `Photos${photos.length ? ' (' + photos.length + ')' : ''}`], ['summary', 'Summary']];
  let body;
  if (state.tab === 'photos') body = photosView(photos);
  else if (state.tab === 'summary') body = summaryView(trip, expenses);
  else body = expensesView(trip, expenses);

  $('#app').innerHTML = `
    <div class="card total-card">
      <div class="label">Total spent</div>
      <div class="amount">${money(total, trip.currency)}</div>
      ${budgetHtml}
    </div>
    <div class="tabs">${tabs.map(([id, label]) => `<button data-tab="${id}" class="${state.tab === id ? 'active' : ''}">${label}</button>`).join('')}</div>
    ${body}`;

  document.querySelectorAll('.tabs button').forEach((b) => (b.onclick = () => go(trip.id, b.dataset.tab)));
  document.querySelectorAll('.exp').forEach((el) => (el.onclick = () => expenseForm(trip, expenses.find((e) => e.id === el.dataset.id))));
  document.querySelectorAll('.ph').forEach((el) => (el.onclick = () => openViewer(photos.find((p) => p.id === el.dataset.id))));
}

function expensesView(trip, expenses) {
  if (!expenses.length) return `<div class="empty">No expenses yet.<br>Tap <b>+</b> to add one.</div>`;
  const byDay = {};
  expenses.forEach((e) => (byDay[e.date] ||= []).push(e));
  return Object.keys(byDay).sort().reverse().map((day) => {
    const items = byDay[day].sort((a, b) => b.createdAt - a.createdAt);
    const dayTotal = items.reduce((s, e) => s + e.amount, 0);
    return `<div class="day-head"><span>${prettyDate(day)}</span><span>${money(dayTotal, trip.currency)}</span></div>
      <div class="card list-card">${items.map((e) => `
        <div class="exp" data-id="${e.id}">
          <div class="emoji">${cat(e.category).emoji}</div>
          <div class="info"><div class="note">${esc(e.note) || cat(e.category).label}</div>
            <div class="muted">${cat(e.category).label}</div></div>
          <div class="amt">${money(e.amount, trip.currency)}</div>
        </div>`).join('')}</div>`;
  }).join('');
}

function photosView(photos) {
  if (!photos.length) return `<div class="empty">No photos yet.<br>Tap <b>+</b> to add photos of places you've been.</div>`;
  photos.sort((a, b) => (b.date || '').localeCompare(a.date || '') || b.createdAt - a.createdAt);
  return `<div class="grid">${photos.map((p) => `
    <div class="ph" data-id="${p.id}" style="background-image:url(${blobUrl(p.blob)})">
      ${p.place ? `<span>${esc(p.place)}</span>` : ''}</div>`).join('')}</div>`;
}

function summaryView(trip, expenses) {
  if (!expenses.length) return `<div class="empty">Add some expenses to see your summary.</div>`;
  const total = expenses.reduce((s, e) => s + e.amount, 0);
  const days = new Set(expenses.map((e) => e.date));
  const byCat = CATEGORIES.map((c) => ({ ...c, sum: expenses.filter((e) => cat(e.category).id === c.id).reduce((s, e) => s + e.amount, 0) }))
    .filter((c) => c.sum > 0).sort((a, b) => b.sum - a.sum);
  const biggest = expenses.reduce((a, b) => (b.amount > a.amount ? b : a));
  return `
    <div class="stats">
      <div class="card"><div class="muted">Per day (avg)</div><div class="big">${money(total / days.size, trip.currency)}</div></div>
      <div class="card"><div class="muted">Days with spending</div><div class="big">${days.size}</div></div>
    </div>
    <div class="card" style="margin-top:12px">
      <div class="muted" style="margin-bottom:4px">By category</div>
      ${byCat.map((c) => `<div class="bar-row">
        <div class="top"><span>${c.emoji} ${c.label}</span><span>${money(c.sum, trip.currency)} · ${Math.round((c.sum / total) * 100)}%</span></div>
        <div class="bar"><div style="width:${(c.sum / byCat[0].sum) * 100}%"></div></div></div>`).join('')}
    </div>
    <div class="card"><div class="muted">Biggest expense</div>
      <div style="margin-top:4px"><b>${money(biggest.amount, trip.currency)}</b> · ${esc(biggest.note) || cat(biggest.category).label} · ${prettyDate(biggest.date)}</div></div>`;
}

// ---------- Bottom sheet ----------
function openSheet(html) {
  $('#sheet').innerHTML = html;
  $('#sheet').hidden = false;
  $('#sheetBackdrop').hidden = false;
}
function closeSheet() {
  $('#sheet').hidden = true;
  $('#sheetBackdrop').hidden = true;
  $('#sheet').innerHTML = '';
}
$('#sheetBackdrop').onclick = closeSheet;

function tripForm(trip) {
  const t = trip || { name: '', currency: localStorage.getItem('lastCurrency') || 'PHP', budget: '', startDate: today() };
  openSheet(`
    <h2>${trip ? 'Edit trip' : 'New trip'}</h2>
    <form id="f">
      <div class="field"><label>Trip name</label><input name="name" required placeholder="e.g. Tokyo 2026" value="${esc(t.name)}"></div>
      <div class="row">
        <div class="field"><label>Currency</label><select name="currency">
          ${CURRENCIES.map((c) => `<option ${c === t.currency ? 'selected' : ''}>${c}</option>`).join('')}</select></div>
        <div class="field"><label>Start date</label><input type="date" name="startDate" value="${esc(t.startDate)}"></div>
      </div>
      <div class="field"><label>Budget (optional)</label><input name="budget" inputmode="decimal" placeholder="0" value="${t.budget || ''}"></div>
      <button class="btn">${trip ? 'Save' : 'Create trip'}</button>
    </form>`);
  $('#f').onsubmit = async (ev) => {
    ev.preventDefault();
    const fd = new FormData(ev.target);
    const obj = {
      ...(trip || { id: uid(), createdAt: Date.now() }),
      name: fd.get('name').trim(),
      currency: fd.get('currency'),
      startDate: fd.get('startDate'),
      budget: parseFloat(String(fd.get('budget')).replace(/,/g, '')) || 0,
    };
    localStorage.setItem('lastCurrency', obj.currency);
    await db.put('trips', obj);
    closeSheet();
    go(obj.id, trip ? state.tab : 'expenses');
  };
}

function expenseForm(trip, exp) {
  const e = exp || { amount: '', category: 'food', note: '', date: today() };
  let chosen = e.category;
  openSheet(`
    <h2>${exp ? 'Edit expense' : 'Add expense'}</h2>
    <form id="f">
      <div class="field"><input class="big" name="amount" inputmode="decimal" placeholder="0.00" required value="${e.amount}" autocomplete="off"></div>
      <div class="field"><label>Category</label><div class="chips">
        ${CATEGORIES.map((c) => `<button type="button" class="chip ${c.id === chosen ? 'active' : ''}" data-cat="${c.id}">${c.emoji} ${c.label}</button>`).join('')}</div></div>
      <div class="field"><label>Note (optional)</label><input name="note" placeholder="e.g. Ramen at Ichiran" value="${esc(e.note)}"></div>
      <div class="field"><label>Date</label><input type="date" name="date" value="${esc(e.date)}" required></div>
      <button class="btn">${exp ? 'Save' : 'Add'}</button>
      ${exp ? '<button type="button" id="del" class="btn danger">Delete expense</button>' : ''}
    </form>`);
  if (!exp) setTimeout(() => $('#f [name=amount]').focus(), 250);
  document.querySelectorAll('.chip').forEach((b) => (b.onclick = () => {
    chosen = b.dataset.cat;
    document.querySelectorAll('.chip').forEach((x) => x.classList.toggle('active', x === b));
  }));
  $('#f').onsubmit = async (ev) => {
    ev.preventDefault();
    const fd = new FormData(ev.target);
    const amount = parseFloat(String(fd.get('amount')).replace(/,/g, ''));
    if (!(amount > 0)) return toast('Enter an amount');
    await db.put('expenses', {
      ...(exp || { id: uid(), tripId: trip.id, createdAt: Date.now() }),
      amount, category: chosen, note: fd.get('note').trim(), date: fd.get('date'),
    });
    closeSheet();
    render();
  };
  if (exp) $('#del').onclick = async () => {
    if (!confirm('Delete this expense?')) return;
    await db.del('expenses', exp.id);
    closeSheet();
    render();
  };
}

// ---------- Photos ----------
$('#photoInput').onchange = async (ev) => {
  const files = [...ev.target.files];
  ev.target.value = '';
  if (!files.length || !state.tripId) return;
  toast(`Saving ${files.length} photo${files.length > 1 ? 's' : ''}…`);
  let last;
  for (const f of files) {
    try {
      const blob = await resizeImage(f);
      const date = f.lastModified ? new Date(f.lastModified).toLocaleDateString('en-CA') : today();
      last = { id: uid(), tripId: state.tripId, blob, place: '', caption: '', date, createdAt: Date.now() };
      await db.put('photos', last);
    } catch (err) {
      toast(err.message);
    }
  }
  state.tab = 'photos';
  await go(state.tripId, 'photos');
  if (files.length === 1 && last) photoForm(last);
};

function photoForm(photo) {
  openSheet(`
    <h2>About this photo</h2>
    <form id="f">
      <div class="field"><label>Place</label><input name="place" placeholder="e.g. Fushimi Inari Shrine" value="${esc(photo.place)}"></div>
      <div class="field"><label>Caption</label><textarea name="caption" rows="3" placeholder="What made it special?">${esc(photo.caption)}</textarea></div>
      <div class="field"><label>Date</label><input type="date" name="date" value="${esc(photo.date)}"></div>
      <button class="btn">Save</button>
    </form>`);
  $('#f').onsubmit = async (ev) => {
    ev.preventDefault();
    const fd = new FormData(ev.target);
    Object.assign(photo, { place: fd.get('place').trim(), caption: fd.get('caption').trim(), date: fd.get('date') });
    await db.put('photos', photo);
    closeSheet();
    $('#viewer').hidden = true;
    render();
  };
}

function openViewer(photo) {
  const v = $('#viewer');
  v.innerHTML = `
    <div class="bar-top"><button id="vClose">✕ Close</button>
      <span><button id="vEdit">Edit</button><button id="vDel">Delete</button></span></div>
    <img src="${blobUrl(photo.blob)}" alt="">
    <div class="cap">${photo.place ? `<b>📍 ${esc(photo.place)}</b>` : ''}
      ${photo.caption ? `<div>${esc(photo.caption)}</div>` : ''}
      <div class="muted">${photo.date ? prettyDate(photo.date) : ''}</div></div>`;
  v.hidden = false;
  $('#vClose').onclick = () => (v.hidden = true);
  $('#vEdit').onclick = () => photoForm(photo);
  $('#vDel').onclick = async () => {
    if (!confirm('Delete this photo?')) return;
    await db.del('photos', photo.id);
    v.hidden = true;
    render();
  };
}

// ---------- Menu, backup & restore ----------
function blobToDataUrl(blob) {
  return new Promise((resolve) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.readAsDataURL(blob);
  });
}

async function exportBackup() {
  toast('Preparing backup…');
  const [trips, expenses, photos] = await Promise.all([db.all('trips'), db.all('expenses'), db.all('photos')]);
  const photoData = await Promise.all(photos.map(async (p) => ({ ...p, blob: await blobToDataUrl(p.blob) })));
  const file = new Blob([JSON.stringify({ app: 'triplang', version: 1, trips, expenses, photos: photoData })], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(file);
  a.download = `triplang-backup-${today()}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

$('#importInput').onchange = async (ev) => {
  const f = ev.target.files[0];
  ev.target.value = '';
  if (!f) return;
  try {
    const data = JSON.parse(await f.text());
    if (data.app !== 'triplang') throw new Error('Not a TripLang backup');
    for (const t of data.trips) await db.put('trips', t);
    for (const e of data.expenses) await db.put('expenses', e);
    for (const p of data.photos) await db.put('photos', { ...p, blob: await (await fetch(p.blob)).blob() });
    toast('Backup restored');
    go(null);
  } catch (err) {
    toast('Restore failed: ' + err.message);
  }
};

async function exportCsv(trip) {
  const expenses = (await db.byTrip('expenses', trip.id)).sort((a, b) => a.date.localeCompare(b.date));
  const q = (s) => `"${String(s).replace(/"/g, '""')}"`;
  const rows = [['Date', 'Category', 'Note', `Amount (${trip.currency})`], ...expenses.map((e) => [e.date, cat(e.category).label, e.note, e.amount])];
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([rows.map((r) => r.map(q).join(',')).join('\n')], { type: 'text/csv' }));
  a.download = `${trip.name.replace(/[^\w-]+/g, '_')}-expenses.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

$('#menuBtn').onclick = async () => {
  const trip = state.tripId && (await db.get('trips', state.tripId));
  openSheet(`
    <h2>Menu</h2>
    ${trip ? `
      <button class="menu-item" data-a="edit">✏️ Edit trip (name, budget, currency)</button>
      <button class="menu-item" data-a="csv">📄 Export expenses (CSV)</button>` : ''}
    <button class="menu-item" data-a="backup">💾 Back up all data</button>
    <button class="menu-item" data-a="restore">📥 Restore from backup</button>
    ${trip ? '<button class="menu-item danger" data-a="delete">🗑️ Delete this trip</button>' : ''}`);
  document.querySelectorAll('.menu-item').forEach((b) => (b.onclick = async () => {
    closeSheet();
    const a = b.dataset.a;
    if (a === 'edit') tripForm(trip);
    if (a === 'csv') exportCsv(trip);
    if (a === 'backup') exportBackup();
    if (a === 'restore') $('#importInput').click();
    if (a === 'delete' && confirm(`Delete "${trip.name}" and all its expenses and photos?`)) {
      for (const e of await db.byTrip('expenses', trip.id)) await db.del('expenses', e.id);
      for (const p of await db.byTrip('photos', trip.id)) await db.del('photos', p.id);
      await db.del('trips', trip.id);
      go(null);
    }
  }));
};

$('#backBtn').onclick = () => go(null);

$('#fab').onclick = async () => {
  if (!state.tripId) return tripForm();
  if (state.tab === 'photos') return $('#photoInput').click();
  expenseForm(await db.get('trips', state.tripId));
};

// ---------- Start ----------
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js');
if (navigator.storage && navigator.storage.persist) navigator.storage.persist();
window.dispatchEvent(new HashChangeEvent('hashchange'));

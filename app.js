'use strict';

// ---------- Storage (IndexedDB, everything stays on the phone) ----------
const DB_NAME = 'triplang';
let dbPromise;

function openDB() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 2);
      req.onupgradeneeded = (ev) => {
        const db = req.result;
        if (ev.oldVersion < 1) {
          db.createObjectStore('trips', { keyPath: 'id' });
          db.createObjectStore('expenses', { keyPath: 'id' }).createIndex('tripId', 'tripId');
          db.createObjectStore('photos', { keyPath: 'id' }).createIndex('tripId', 'tripId');
        }
        if (ev.oldVersion < 2) {
          db.createObjectStore('entries', { keyPath: 'id' }).createIndex('tripId', 'tripId');
        }
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
const MOODS = ['🤩', '😊', '😌', '😋', '😴', '😫', '🥲'];
const WEATHER = ['☀️', '⛅', '☁️', '🌧️', '⛈️', '❄️', '🌙'];
const CURRENCIES = ['PHP', 'USD', 'EUR', 'JPY', 'KRW', 'SGD', 'THB', 'VND', 'IDR', 'MYR', 'HKD', 'TWD', 'CNY', 'AUD', 'GBP', 'CAD'];

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const today = () => new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD in local time
const nowTime = () => new Date().toTimeString().slice(0, 5);
const cat = (id) => CATEGORIES.find((c) => c.id === id) || CATEGORIES[CATEGORIES.length - 1];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const sum = (list) => list.reduce((s, e) => s + e.amount, 0);

function money(n, currency) {
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency, maximumFractionDigits: 2 }).format(n);
  } catch {
    return `${currency} ${n.toFixed(2)}`;
  }
}
function prettyDate(d, opts = { weekday: 'short', month: 'short', day: 'numeric' }) {
  return new Date(d + 'T00:00').toLocaleDateString(undefined, opts);
}
function dateRange(trip) {
  if (!trip.startDate) return '';
  const short = { month: 'short', day: 'numeric' };
  if (!trip.endDate || trip.endDate === trip.startDate) return prettyDate(trip.startDate, { ...short, year: 'numeric' });
  return `${prettyDate(trip.startDate, short)} – ${prettyDate(trip.endDate, { ...short, year: 'numeric' })}`;
}
function tripDays(trip) {
  if (!trip.startDate || !trip.endDate) return 0;
  return Math.round((new Date(trip.endDate) - new Date(trip.startDate)) / 864e5) + 1;
}
function dayNumber(trip, date) {
  if (!trip.startDate) return null;
  const n = Math.round((new Date(date) - new Date(trip.startDate)) / 864e5) + 1;
  return n >= 1 ? n : null;
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
const fileDate = (f) => (f.lastModified ? new Date(f.lastModified).toLocaleDateString('en-CA') : today());

// Object URLs for photo blobs, revoked on each re-render.
let objectUrls = [];
function blobUrl(blob) {
  const u = URL.createObjectURL(blob);
  objectUrls.push(u);
  return u;
}

// ---------- State & routing ----------
const state = { tripId: null, tab: 'journal' };

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

function coverOf(trip, photos) {
  return photos.find((p) => p.id === trip.coverPhotoId) || photos.find((p) => p.tripId === trip.id);
}

async function renderHome() {
  $('#title').textContent = 'My Journals';
  $('#backBtn').hidden = true;
  const [trips, expenses, photos, entries] = await Promise.all(['trips', 'expenses', 'photos', 'entries'].map(db.all));
  trips.sort((a, b) => (b.startDate || '').localeCompare(a.startDate || '') || b.createdAt - a.createdAt);

  if (!trips.length) {
    $('#app').innerHTML = `<div class="empty"><div style="font-size:52px">📔</div>
      <p class="serif" style="font-size:20px"><b>Your travel journal</b></p>
      <p>Write memories, save photos, and keep track of what you spend.<br>Tap <b>+</b> to start your first trip.</p></div>`;
    return;
  }
  $('#app').innerHTML = trips.map((t) => {
    const cover = coverOf(t, photos.filter((p) => p.tripId === t.id));
    const nEntries = entries.filter((e) => e.tripId === t.id).length;
    const days = tripDays(t);
    const bits = [dateRange(t), days ? `${days} day${days > 1 ? 's' : ''}` : '', `${nEntries} memo${nEntries === 1 ? '' : 's'}`].filter(Boolean);
    return `<article class="trip-card" data-id="${t.id}">
      <div class="trip-cover" ${cover ? `style="background-image:url(${blobUrl(cover.blob)})"` : ''}>
        ${cover ? '' : '<span class="cover-emoji">✈️</span>'}
        <div class="trip-cover-text"><div class="serif trip-name">${esc(t.name)}</div>
          ${t.destination ? `<div>📍 ${esc(t.destination)}</div>` : ''}</div>
      </div>
      <div class="trip-foot"><span class="muted">${bits.join(' · ')}</span>
        <b>${money(sum(expenses.filter((e) => e.tripId === t.id)), t.currency)}</b></div>
    </article>`;
  }).join('');
  $$('.trip-card').forEach((el) => (el.onclick = () => go(el.dataset.id, 'journal')));
}

async function renderTrip(trip) {
  $('#title').textContent = '';
  $('#backBtn').hidden = false;
  const [expenses, photos, entries] = await Promise.all(['expenses', 'photos', 'entries'].map((s) => db.byTrip(s, trip.id)));
  const total = sum(expenses);
  const cover = coverOf(trip, photos);
  const ctx = { trip, expenses, photos, entries };

  const tabs = [['journal', 'Journal'], ['expenses', 'Expenses'], ['photos', 'Photos'], ['summary', 'Summary']];
  const views = { journal: journalView, expenses: expensesView, photos: photosView, summary: summaryView };
  const body = (views[state.tab] || journalView)(ctx);

  $('#app').innerHTML = `
    <header class="hero" ${cover ? `style="background-image:url(${blobUrl(cover.blob)})"` : ''}>
      <div class="hero-text">
        <h2 class="serif">${esc(trip.name)}</h2>
        <div>${[trip.destination && '📍 ' + esc(trip.destination), dateRange(trip)].filter(Boolean).join(' · ')}</div>
      </div>
    </header>
    <div class="stat-row">
      <div><b>${entries.length}</b><span>memos</span></div>
      <div><b>${photos.length}</b><span>photos</span></div>
      <div><b>${money(total, trip.currency)}</b><span>spent</span></div>
    </div>
    <div class="tabs">${tabs.map(([id, label]) => `<button data-tab="${id}" class="${state.tab === id ? 'active' : ''}">${label}</button>`).join('')}</div>
    ${body}`;

  $$('.tabs button').forEach((b) => (b.onclick = () => go(trip.id, b.dataset.tab)));
  $$('[data-exp]').forEach((el) => (el.onclick = () => expenseForm(trip, expenses.find((e) => e.id === el.dataset.exp))));
  $$('[data-entry]').forEach((el) => (el.onclick = () => entryForm(trip, entries.find((e) => e.id === el.dataset.entry))));
  $$('[data-photo]').forEach((el) => (el.onclick = (ev) => {
    ev.stopPropagation();
    openViewer(trip, photos.find((p) => p.id === el.dataset.photo));
  }));
  $$('[data-goto]').forEach((el) => (el.onclick = () => go(trip.id, el.dataset.goto)));
}

// Journal: one section per day with memos, loose photos, and that day's spending.
function journalView({ trip, expenses, photos, entries }) {
  const days = new Set([...entries, ...expenses].map((x) => x.date));
  photos.filter((p) => !p.entryId).forEach((p) => days.add(p.date));
  if (!days.size) {
    return `<div class="empty"><div style="font-size:40px">✍️</div>
      <p class="serif" style="font-size:18px">Every trip has a story.</p><p>Tap <b>+</b> to write your first memo.</p></div>`;
  }
  return [...days].sort().map((day) => {
    const n = dayNumber(trip, day);
    const dayEntries = entries.filter((e) => e.date === day).sort((a, b) => (a.time || '').localeCompare(b.time || '') || a.createdAt - b.createdAt);
    const loose = photos.filter((p) => !p.entryId && p.date === day);
    const spent = expenses.filter((e) => e.date === day);
    return `<section class="day">
      <div class="day-title"><span class="serif">${n ? `Day ${n}` : prettyDate(day, { month: 'short', day: 'numeric' })}</span>
        <span class="muted">${prettyDate(day)}</span></div>
      ${dayEntries.map((e) => entryCard(e, photos.filter((p) => p.entryId === e.id))).join('')}
      ${loose.length ? `<div class="strip">${loose.map((p) => `<div class="ph" data-photo="${p.id}" style="background-image:url(${blobUrl(p.blob)})"></div>`).join('')}</div>` : ''}
      ${spent.length ? `<div class="spent-line" data-goto="expenses">💸 Spent <b>${money(sum(spent), trip.currency)}</b> · ${spent.length} item${spent.length > 1 ? 's' : ''}<span>›</span></div>` : ''}
    </section>`;
  }).join('');
}

function entryCard(e, pics) {
  const meta = [e.time, e.place && `📍 ${esc(e.place)}`].filter(Boolean).join(' · ');
  const icons = [e.mood, e.weather].filter(Boolean).join(' ');
  const gallery = pics.length
    ? `<div class="gallery g${Math.min(pics.length, 3)}">${pics.slice(0, 6).map((p, i) =>
        `<div class="ph" data-photo="${p.id}" style="background-image:url(${blobUrl(p.blob)})">${i === 5 && pics.length > 6 ? `<span class="more">+${pics.length - 6}</span>` : ''}</div>`).join('')}</div>`
    : '';
  return `<article class="entry" data-entry="${e.id}">
    ${gallery}
    <div class="entry-body">
      ${meta || icons ? `<div class="entry-meta"><span>${meta}</span><span class="entry-icons">${icons}</span></div>` : ''}
      ${e.title ? `<h3 class="serif">${esc(e.title)}</h3>` : ''}
      ${e.text ? `<p class="entry-text">${esc(e.text)}</p>` : ''}
    </div>
  </article>`;
}

function expensesView({ trip, expenses }) {
  const total = sum(expenses);
  let budgetHtml = '';
  if (trip.budget) {
    const pct = Math.min(100, (total / trip.budget) * 100);
    const left = trip.budget - total;
    budgetHtml = `<div class="sub"><span>Budget ${money(trip.budget, trip.currency)}</span>
      <span>${left >= 0 ? money(left, trip.currency) + ' left' : money(-left, trip.currency) + ' over!'}</span></div>
      <div class="progress ${left < 0 ? 'over' : ''}"><div style="width:${pct}%"></div></div>`;
  }
  const head = `<div class="card total-card"><div class="label">Total spent</div>
    <div class="amount">${money(total, trip.currency)}</div>${budgetHtml}</div>`;
  if (!expenses.length) return head + `<div class="empty">No expenses yet.<br>Tap <b>+</b> to add one.</div>`;

  const byDay = {};
  expenses.forEach((e) => (byDay[e.date] ||= []).push(e));
  return head + Object.keys(byDay).sort().reverse().map((day) => {
    const items = byDay[day].sort((a, b) => b.createdAt - a.createdAt);
    const n = dayNumber(trip, day);
    return `<div class="day-head"><span>${n ? `Day ${n} · ` : ''}${prettyDate(day)}</span><span>${money(sum(items), trip.currency)}</span></div>
      <div class="card list-card">${items.map((e) => `
        <div class="exp" data-exp="${e.id}">
          <div class="emoji">${cat(e.category).emoji}</div>
          <div class="info"><div class="note">${esc(e.note) || cat(e.category).label}</div>
            <div class="muted">${cat(e.category).label}</div></div>
          <div class="amt">${money(e.amount, trip.currency)}</div>
        </div>`).join('')}</div>`;
  }).join('');
}

function photosView({ photos }) {
  if (!photos.length) return `<div class="empty">No photos yet.<br>Tap <b>+</b> to add photos of places you've been.</div>`;
  photos.sort((a, b) => (b.date || '').localeCompare(a.date || '') || b.createdAt - a.createdAt);
  return `<div class="grid">${photos.map((p) => `
    <div class="ph" data-photo="${p.id}" style="background-image:url(${blobUrl(p.blob)})">
      ${p.place ? `<span>${esc(p.place)}</span>` : ''}</div>`).join('')}</div>`;
}

function summaryView({ trip, expenses, entries, photos }) {
  const places = [...new Set([...entries.map((e) => e.place), ...photos.map((p) => p.place)].filter(Boolean))];
  const moods = entries.map((e) => e.mood).filter(Boolean);
  const topMood = moods.sort((a, b) => moods.filter((m) => m === b).length - moods.filter((m) => m === a).length)[0];
  const placesCard = places.length
    ? `<div class="card"><div class="muted">Places visited (${places.length})</div>
        <div class="chips" style="margin-top:8px">${places.map((p) => `<span class="chip">📍 ${esc(p)}</span>`).join('')}</div></div>`
    : '';
  if (!expenses.length) return placesCard + `<div class="empty">Add some expenses to see your spending summary.</div>`;

  const total = sum(expenses);
  const days = new Set(expenses.map((e) => e.date));
  const byCat = CATEGORIES.map((c) => ({ ...c, sum: sum(expenses.filter((e) => cat(e.category).id === c.id)) }))
    .filter((c) => c.sum > 0).sort((a, b) => b.sum - a.sum);
  const biggest = expenses.reduce((a, b) => (b.amount > a.amount ? b : a));
  return `
    <div class="stats">
      <div class="card"><div class="muted">Per day (avg)</div><div class="big">${money(total / days.size, trip.currency)}</div></div>
      <div class="card"><div class="muted">${topMood ? 'Trip mood' : 'Days with spending'}</div><div class="big">${topMood || days.size}</div></div>
    </div>
    <div class="card" style="margin-top:12px">
      <div class="muted" style="margin-bottom:4px">Spending by category</div>
      ${byCat.map((c) => `<div class="bar-row">
        <div class="top"><span>${c.emoji} ${c.label}</span><span>${money(c.sum, trip.currency)} · ${Math.round((c.sum / total) * 100)}%</span></div>
        <div class="bar"><div style="width:${(c.sum / byCat[0].sum) * 100}%"></div></div></div>`).join('')}
    </div>
    <div class="card"><div class="muted">Biggest expense</div>
      <div style="margin-top:4px"><b>${money(biggest.amount, trip.currency)}</b> · ${esc(biggest.note) || cat(biggest.category).label} · ${prettyDate(biggest.date)}</div></div>
    ${placesCard}`;
}

// ---------- Bottom sheet ----------
function openSheet(html) {
  $('#sheet').innerHTML = html;
  $('#sheet').hidden = false;
  $('#sheetBackdrop').hidden = false;
  $('#sheet').scrollTop = 0;
}
function closeSheet() {
  $('#sheet').hidden = true;
  $('#sheetBackdrop').hidden = true;
  $('#sheet').innerHTML = '';
}
$('#sheetBackdrop').onclick = closeSheet;

function pickChips(selector, initial, allowNone) {
  let value = initial;
  $$(selector).forEach((b) => (b.onclick = () => {
    value = allowNone && value === b.dataset.v ? '' : b.dataset.v;
    $$(selector).forEach((x) => x.classList.toggle('active', x.dataset.v === value));
  }));
  return () => value;
}

function tripForm(trip) {
  const t = trip || { name: '', destination: '', currency: localStorage.getItem('lastCurrency') || 'PHP', budget: '', startDate: today(), endDate: '' };
  openSheet(`
    <h2>${trip ? 'Edit trip' : 'New trip'}</h2>
    <form id="f">
      <div class="field"><label>Trip name</label><input name="name" required placeholder="e.g. Autumn in Japan" value="${esc(t.name)}"></div>
      <div class="field"><label>Destination</label><input name="destination" placeholder="e.g. Tokyo & Kyoto" value="${esc(t.destination)}"></div>
      <div class="row">
        <div class="field"><label>Start</label><input type="date" name="startDate" value="${esc(t.startDate)}"></div>
        <div class="field"><label>End</label><input type="date" name="endDate" value="${esc(t.endDate)}"></div>
      </div>
      <div class="row">
        <div class="field"><label>Currency</label><select name="currency">
          ${CURRENCIES.map((c) => `<option ${c === t.currency ? 'selected' : ''}>${c}</option>`).join('')}</select></div>
        <div class="field"><label>Budget (optional)</label><input name="budget" inputmode="decimal" placeholder="0" value="${t.budget || ''}"></div>
      </div>
      <button class="btn">${trip ? 'Save' : 'Start journal'}</button>
    </form>`);
  $('#f').onsubmit = async (ev) => {
    ev.preventDefault();
    const fd = new FormData(ev.target);
    const startDate = fd.get('startDate');
    let endDate = fd.get('endDate');
    if (endDate && startDate && endDate < startDate) endDate = startDate;
    const obj = {
      ...(trip || { id: uid(), createdAt: Date.now() }),
      name: fd.get('name').trim(),
      destination: fd.get('destination').trim(),
      currency: fd.get('currency'),
      startDate, endDate,
      budget: parseFloat(String(fd.get('budget')).replace(/,/g, '')) || 0,
    };
    localStorage.setItem('lastCurrency', obj.currency);
    await db.put('trips', obj);
    closeSheet();
    go(obj.id, trip ? state.tab : 'journal');
  };
}

// Journal memo with its own photos.
async function entryForm(trip, entry) {
  const e = entry || { title: '', text: '', place: '', mood: '', weather: '', date: today(), time: nowTime() };
  // Photos shown in the form: existing ones (may be removed) and new ones (saved on submit).
  const existing = entry ? (await db.byTrip('photos', trip.id)).filter((p) => p.entryId === entry.id) : [];
  const pics = existing.map((p) => ({ photo: p, url: blobUrl(p.blob), isNew: false }));
  const removed = [];

  openSheet(`
    <h2>${entry ? 'Edit memo' : 'New memo'}</h2>
    <form id="f">
      <div class="field"><input name="title" class="title-input serif" placeholder="Title (e.g. Sunrise at Fushimi Inari)" value="${esc(e.title)}"></div>
      <div class="field"><textarea name="text" rows="6" placeholder="What happened today? How did it feel?">${esc(e.text)}</textarea></div>
      <div class="field"><label>Photos</label><div id="picRow" class="pic-row"></div></div>
      <div class="field"><label>Place</label><input name="place" placeholder="Where were you?" value="${esc(e.place)}"></div>
      <div class="field"><label>Mood</label><div class="chips">
        ${MOODS.map((m) => `<button type="button" class="chip emoji-chip mood ${m === e.mood ? 'active' : ''}" data-v="${m}">${m}</button>`).join('')}</div></div>
      <div class="field"><label>Weather</label><div class="chips">
        ${WEATHER.map((w) => `<button type="button" class="chip emoji-chip weather ${w === e.weather ? 'active' : ''}" data-v="${w}">${w}</button>`).join('')}</div></div>
      <div class="row">
        <div class="field"><label>Date</label><input type="date" name="date" value="${esc(e.date)}" required></div>
        <div class="field"><label>Time</label><input type="time" name="time" value="${esc(e.time)}"></div>
      </div>
      <button class="btn">${entry ? 'Save' : 'Save memo'}</button>
      ${entry ? '<button type="button" id="del" class="btn danger">Delete memo</button>' : ''}
    </form>`);

  const getMood = pickChips('.chip.mood', e.mood, true);
  const getWeather = pickChips('.chip.weather', e.weather, true);

  function drawPics() {
    $('#picRow').innerHTML = pics.map((p, i) =>
      `<div class="pic" style="background-image:url(${p.url})"><button type="button" data-rm="${i}" aria-label="Remove photo">✕</button></div>`).join('')
      + '<button type="button" id="addPic" class="pic add-pic">＋<small>Add</small></button>';
    $('#addPic').onclick = () => $('#entryPhotoInput').click();
    $$('[data-rm]').forEach((b) => (b.onclick = () => {
      const [p] = pics.splice(+b.dataset.rm, 1);
      if (!p.isNew) removed.push(p.photo.id);
      drawPics();
    }));
  }
  drawPics();

  $('#entryPhotoInput').onchange = async (ev) => {
    const files = [...ev.target.files];
    ev.target.value = '';
    for (const f of files) {
      try {
        const blob = await resizeImage(f);
        pics.push({ photo: { id: uid(), blob, date: fileDate(f) }, url: blobUrl(blob), isNew: true });
      } catch (err) {
        toast(err.message);
      }
    }
    drawPics();
  };

  $('#f').onsubmit = async (ev) => {
    ev.preventDefault();
    const fd = new FormData(ev.target);
    const obj = {
      ...(entry || { id: uid(), tripId: trip.id, createdAt: Date.now() }),
      title: fd.get('title').trim(),
      text: fd.get('text').trim(),
      place: fd.get('place').trim(),
      mood: getMood(),
      weather: getWeather(),
      date: fd.get('date'),
      time: fd.get('time'),
    };
    if (!obj.title && !obj.text && !pics.length) return toast('Write something or add a photo');
    await db.put('entries', obj);
    for (const id of removed) await db.del('photos', id);
    for (const p of pics) {
      await db.put('photos', {
        caption: '', createdAt: Date.now(), ...p.photo,
        tripId: trip.id, entryId: obj.id, date: obj.date, place: p.photo.place || obj.place,
      });
    }
    closeSheet();
    go(trip.id, 'journal');
  };
  if (entry) $('#del').onclick = async () => {
    if (!confirm('Delete this memo and its photos?')) return;
    for (const p of existing) await db.del('photos', p.id);
    await db.del('entries', entry.id);
    closeSheet();
    render();
  };
}

function expenseForm(trip, exp) {
  const e = exp || { amount: '', category: 'food', note: '', date: today() };
  openSheet(`
    <h2>${exp ? 'Edit expense' : 'Add expense'}</h2>
    <form id="f">
      <div class="field"><input class="big" name="amount" inputmode="decimal" placeholder="0.00" required value="${e.amount}" autocomplete="off"></div>
      <div class="field"><label>Category</label><div class="chips">
        ${CATEGORIES.map((c) => `<button type="button" class="chip cat ${c.id === e.category ? 'active' : ''}" data-v="${c.id}">${c.emoji} ${c.label}</button>`).join('')}</div></div>
      <div class="field"><label>Note (optional)</label><input name="note" placeholder="e.g. Ramen at Ichiran" value="${esc(e.note)}"></div>
      <div class="field"><label>Date</label><input type="date" name="date" value="${esc(e.date)}" required></div>
      <button class="btn">${exp ? 'Save' : 'Add'}</button>
      ${exp ? '<button type="button" id="del" class="btn danger">Delete expense</button>' : ''}
    </form>`);
  if (!exp) setTimeout(() => $('#f [name=amount]')?.focus(), 250);
  const getCat = pickChips('.chip.cat', e.category, false);
  $('#f').onsubmit = async (ev) => {
    ev.preventDefault();
    const fd = new FormData(ev.target);
    const amount = parseFloat(String(fd.get('amount')).replace(/,/g, ''));
    if (!(amount > 0)) return toast('Enter an amount');
    await db.put('expenses', {
      ...(exp || { id: uid(), tripId: trip.id, createdAt: Date.now() }),
      amount, category: getCat(), note: fd.get('note').trim(), date: fd.get('date'),
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

// "+" in the Journal tab: choose what to add.
function addChooser(trip) {
  openSheet(`
    <h2>Add to ${esc(trip.name)}</h2>
    <button class="menu-item" data-a="memo">✍️ Write a memo</button>
    <button class="menu-item" data-a="expense">💸 Add an expense</button>
    <button class="menu-item" data-a="photo">📷 Add photos</button>`);
  $$('.menu-item').forEach((b) => (b.onclick = () => {
    const a = b.dataset.a;
    if (a === 'memo') entryForm(trip);
    if (a === 'expense') expenseForm(trip);
    if (a === 'photo') { closeSheet(); $('#photoInput').click(); }
  }));
}

// ---------- Loose photos (not attached to a memo) ----------
$('#photoInput').onchange = async (ev) => {
  const files = [...ev.target.files];
  ev.target.value = '';
  if (!files.length || !state.tripId) return;
  toast(`Saving ${files.length} photo${files.length > 1 ? 's' : ''}…`);
  let last;
  for (const f of files) {
    try {
      const blob = await resizeImage(f);
      last = { id: uid(), tripId: state.tripId, blob, place: '', caption: '', date: fileDate(f), createdAt: Date.now() };
      await db.put('photos', last);
    } catch (err) {
      toast(err.message);
    }
  }
  render();
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

function openViewer(trip, photo) {
  const v = $('#viewer');
  v.innerHTML = `
    <div class="bar-top"><button id="vClose">✕ Close</button>
      <span><button id="vCover">Set as cover</button><button id="vEdit">Edit</button><button id="vDel">Delete</button></span></div>
    <img src="${blobUrl(photo.blob)}" alt="">
    <div class="cap">${photo.place ? `<b>📍 ${esc(photo.place)}</b>` : ''}
      ${photo.caption ? `<div>${esc(photo.caption)}</div>` : ''}
      <div class="muted">${photo.date ? prettyDate(photo.date) : ''}</div></div>`;
  v.hidden = false;
  $('#vClose').onclick = () => (v.hidden = true);
  $('#vEdit').onclick = () => photoForm(photo);
  $('#vCover').onclick = async () => {
    await db.put('trips', { ...trip, coverPhotoId: photo.id });
    v.hidden = true;
    toast('Cover photo updated');
    render();
  };
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

function download(blob, name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

async function exportBackup() {
  toast('Preparing backup…');
  const [trips, expenses, photos, entries] = await Promise.all(['trips', 'expenses', 'photos', 'entries'].map(db.all));
  const photoData = await Promise.all(photos.map(async (p) => ({ ...p, blob: await blobToDataUrl(p.blob) })));
  const json = JSON.stringify({ app: 'triplang', version: 2, trips, expenses, entries, photos: photoData });
  download(new Blob([json], { type: 'application/json' }), `triplang-backup-${today()}.json`);
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
    for (const e of data.entries || []) await db.put('entries', e);
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
  download(new Blob([rows.map((r) => r.map(q).join(',')).join('\n')], { type: 'text/csv' }), `${trip.name.replace(/[^\w-]+/g, '_')}-expenses.csv`);
}

// Plain-text copy of the journal, handy for sharing or pasting into notes.
async function exportJournal(trip) {
  const [entries, expenses] = await Promise.all([db.byTrip('entries', trip.id), db.byTrip('expenses', trip.id)]);
  entries.sort((a, b) => a.date.localeCompare(b.date) || (a.time || '').localeCompare(b.time || ''));
  let out = `${trip.name}\n${[trip.destination, dateRange(trip)].filter(Boolean).join(' · ')}\n`;
  let lastDay;
  for (const e of entries) {
    if (e.date !== lastDay) {
      const n = dayNumber(trip, e.date);
      out += `\n=== ${n ? `Day ${n} – ` : ''}${prettyDate(e.date)} ===\n`;
      lastDay = e.date;
    }
    out += `\n${[e.time, e.place && '📍 ' + e.place, e.mood, e.weather].filter(Boolean).join('  ')}\n`;
    if (e.title) out += `${e.title}\n`;
    if (e.text) out += `${e.text}\n`;
  }
  out += `\nTotal spent: ${money(sum(expenses), trip.currency)}\n`;
  const file = new File([out], `${trip.name.replace(/[^\w-]+/g, '_')}-journal.txt`, { type: 'text/plain' });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try { return await navigator.share({ files: [file], title: trip.name }); } catch { /* cancelled: fall back to download */ }
  }
  download(file, file.name);
}

$('#menuBtn').onclick = async () => {
  const trip = state.tripId && (await db.get('trips', state.tripId));
  openSheet(`
    <h2>Menu</h2>
    ${trip ? `
      <button class="menu-item" data-a="edit">✏️ Edit trip details</button>
      <button class="menu-item" data-a="journal">📖 Share journal as text</button>
      <button class="menu-item" data-a="csv">📄 Export expenses (CSV)</button>` : ''}
    <button class="menu-item" data-a="backup">💾 Back up all data</button>
    <button class="menu-item" data-a="restore">📥 Restore from backup</button>
    ${trip ? '<button class="menu-item danger" data-a="delete">🗑️ Delete this trip</button>' : ''}`);
  $$('.menu-item').forEach((b) => (b.onclick = async () => {
    closeSheet();
    const a = b.dataset.a;
    if (a === 'edit') tripForm(trip);
    if (a === 'journal') exportJournal(trip);
    if (a === 'csv') exportCsv(trip);
    if (a === 'backup') exportBackup();
    if (a === 'restore') $('#importInput').click();
    if (a === 'delete' && confirm(`Delete "${trip.name}" with all its memos, expenses and photos?`)) {
      for (const s of ['expenses', 'photos', 'entries']) {
        for (const x of await db.byTrip(s, trip.id)) await db.del(s, x.id);
      }
      await db.del('trips', trip.id);
      go(null);
    }
  }));
};

$('#backBtn').onclick = () => go(null);

$('#fab').onclick = async () => {
  if (!state.tripId) return tripForm();
  const trip = await db.get('trips', state.tripId);
  if (state.tab === 'photos') return $('#photoInput').click();
  if (state.tab === 'expenses') return expenseForm(trip);
  addChooser(trip);
};

// ---------- Start ----------
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js');
if (navigator.storage && navigator.storage.persist) navigator.storage.persist();
window.dispatchEvent(new HashChangeEvent('hashchange'));

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

// Line icons (24x24, stroke).
const ICONS = {
  back: '<path d="M19 12H5M12 19l-7-7 7-7"/>',
  dots: '<circle cx="5" cy="12" r="1.3"/><circle cx="12" cy="12" r="1.3"/><circle cx="19" cy="12" r="1.3"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  book: '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20V3H6.5A2.5 2.5 0 0 0 4 5.5z"/><path d="M4 19.5A2.5 2.5 0 0 0 6.5 22H20v-5"/>',
  wallet: '<rect x="3" y="6" width="18" height="14" rx="3"/><path d="M3 10h18M16 15h2"/>',
  image: '<rect x="3" y="3" width="18" height="18" rx="4"/><circle cx="9" cy="9" r="2"/><path d="m21 15-5-5L5 21"/>',
  chart: '<path d="M5 20V11M12 20V4M19 20v-6"/>',
  calendar: '<rect x="3" y="4" width="18" height="18" rx="3"/><path d="M16 2v4M8 2v4M3 10h18"/>',
  pin: '<path d="M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11z"/><circle cx="12" cy="10" r="2.5"/>',
  edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>',
  star: '<path d="m12 2 3.1 6.3 6.9 1-5 4.9 1.2 6.8L12 17.8 5.8 21 7 14.2 2 9.3l6.9-1z"/>',
  share: '<path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8M16 6l-4-4-4 4M12 2v13"/>',
  arrow: '<path d="M5 12h14M12 5l7 7-7 7"/>',
  chevron: '<path d="m9 18 6-6-6-6"/>',
  x: '<path d="M18 6 6 18M6 6l12 12"/>',
  trash: '<path d="M3 6h18M8 6V4h8v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  camera: '<path d="M4 8h3l2-3h6l2 3h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z"/><circle cx="12" cy="13" r="3.5"/>',
};
const icon = (name) => `<svg class="i" viewBox="0 0 24 24" aria-hidden="true">${ICONS[name]}</svg>`;

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const today = () => new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD in local time
const nowTime = () => new Date().toTimeString().slice(0, 5);
const cat = (id) => CATEGORIES.find((c) => c.id === id) || CATEGORIES[CATEGORIES.length - 1];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const sum = (list) => list.reduce((s, e) => s + e.amount, 0);
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
const bg = (blob) => (blob ? `style="background-image:url(${blobUrl(blob)})"` : '');

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
function addDays(d, n) {
  const x = new Date(d + 'T00:00');
  x.setDate(x.getDate() + n);
  return x.toLocaleDateString('en-CA');
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
function tripStatus(trip) {
  const d = today();
  if (trip.startDate && trip.startDate > d) return 'upcoming';
  if ((trip.endDate || trip.startDate || d) < d) return 'past';
  return 'now';
}
function statusText(trip) {
  const s = tripStatus(trip);
  if (s === 'now') return '● Traveling now';
  if (s === 'upcoming') {
    const n = Math.round((new Date(trip.startDate) - new Date(today())) / 864e5);
    return n === 1 ? 'Starts tomorrow' : `In ${n} days`;
  }
  return 'Memories';
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
const state = { tripId: null, tab: 'journal', day: '', filter: 'all' };

function go(tripId, tab) {
  if (tripId !== state.tripId) state.day = '';
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
  $('#nav').hidden = true;
  $('#fab').hidden = false;
  $('#fab').innerHTML = `${icon('plus')} New journey`;
  const [trips, expenses, photos, entries] = await Promise.all(['trips', 'expenses', 'photos', 'entries'].map(db.all));
  const rank = { now: 0, upcoming: 1, past: 2 };
  trips.sort((a, b) => rank[tripStatus(a)] - rank[tripStatus(b)] || (b.startDate || '').localeCompare(a.startDate || '') || b.createdAt - a.createdAt);

  const name = localStorage.getItem('name') || '';
  const top = `
    <div class="home-top">
      <button class="avatar" id="nameBtn" aria-label="Your name">${esc((name[0] || '✈').toUpperCase())}</button>
      <button class="greet" id="greetBtn">Hi, ${esc(name || 'traveler')} 👋</button>
      <button class="circle" id="menuBtn" aria-label="Menu">${icon('dots')}</button>
    </div>
    <div class="label muted">${icon('book')} Travel journal</div>
    <h1 class="big-title">Your<br>Journeys</h1>`;

  if (!trips.length) {
    $('#app').innerHTML = top + `<div class="feature" id="firstTrip"><span class="cover-emoji">🏔️</span><div class="shade"></div>
      <div class="inner"><div class="label">Start here</div><h2>Your first adventure</h2>
        <div class="meta"><span>Write memories · save photos · track spending</span></div>
        <span class="pill outline">Create a journey</span></div></div>`;
    $('#firstTrip').onclick = () => tripForm();
    bindHome();
    return;
  }

  const filters = [['all', 'All'], ['now', 'Now'], ['upcoming', 'Upcoming'], ['past', 'Past']]
    .filter(([id]) => id === 'all' || trips.some((t) => tripStatus(t) === id));
  if (!filters.some(([id]) => id === state.filter)) state.filter = 'all';
  const shown = trips.filter((t) => state.filter === 'all' || tripStatus(t) === state.filter);
  const [feat, ...rest] = shown;

  const stats = (t) => ({
    photos: photos.filter((p) => p.tripId === t.id),
    memos: entries.filter((e) => e.tripId === t.id).length,
    spent: sum(expenses.filter((e) => e.tripId === t.id)),
  });
  const f = stats(feat);
  const fCover = coverOf(feat, f.photos);
  const days = tripDays(feat);

  $('#app').innerHTML = top + `
    <div class="pill-row">${filters.map(([id, label]) => `<button class="pill ${state.filter === id ? 'active' : ''}" data-filter="${id}">${label}</button>`).join('')}</div>
    <article class="feature" data-trip="${feat.id}" ${bg(fCover?.blob)}>
      ${fCover ? '' : '<span class="cover-emoji">✈️</span>'}
      <div class="shade"></div>
      <span class="pill glass badge">${statusText(feat)}</span>
      <div class="inner">
        ${feat.destination ? `<div class="label">${icon('pin')} ${esc(feat.destination)}</div>` : ''}
        <h2>${esc(feat.name)}</h2>
        <div class="meta">
          ${days ? `<span>${icon('calendar')} ${plural(days, 'day')}</span>` : feat.startDate ? `<span>${icon('calendar')} ${dateRange(feat)}</span>` : ''}
          <span>${icon('book')} ${plural(f.memos, 'memo')}</span>
          <span>${icon('wallet')} ${money(f.spent, feat.currency)}</span>
        </div>
        <span class="pill outline">Open journal ${icon('arrow')}</span>
      </div>
    </article>
    ${rest.length ? `<div class="section-head"><h3>More journeys</h3><span class="muted">${rest.length}</span></div>
      <div class="grid2">${rest.map((t) => {
        const s = stats(t);
        const c = coverOf(t, s.photos);
        return `<article class="tile" data-trip="${t.id}" ${bg(c?.blob)}>
          ${c ? '' : '<span class="cover-emoji">✈️</span>'}
          <div class="txt">${t.destination ? `<div class="label">${esc(t.destination)}</div>` : ''}
            <div class="name">${esc(t.name)}</div>
            <div class="sub">${[t.startDate && prettyDate(t.startDate, { month: 'short', year: 'numeric' }), money(s.spent, t.currency)].filter(Boolean).join(' · ')}</div></div>
        </article>`;
      }).join('')}</div>` : ''}`;

  $$('[data-trip]').forEach((el) => (el.onclick = () => go(el.dataset.trip, 'journal')));
  $$('[data-filter]').forEach((el) => (el.onclick = () => { state.filter = el.dataset.filter; render(); }));
  bindHome();
}

function bindHome() {
  $('#menuBtn').onclick = openMenu;
  $('#nameBtn').onclick = $('#greetBtn').onclick = nameForm;
}

async function renderTrip(trip) {
  $('#fab').hidden = true;
  const [expenses, photos, entries] = await Promise.all(['expenses', 'photos', 'entries'].map((s) => db.byTrip(s, trip.id)));
  const cover = coverOf(trip, photos);
  const ctx = { trip, expenses, photos, entries };
  const views = { journal: journalView, expenses: expensesView, photos: photosView, summary: summaryView };
  if (!views[state.tab]) state.tab = 'journal';
  const days = tripDays(trip);

  $('#app').innerHTML = `
    <div class="hero-wrap">
      <header class="hero" ${bg(cover?.blob)}>
        ${cover ? '' : '<span class="cover-emoji">🏔️</span>'}
        <div class="hero-bar">
          <button class="circle glass" id="backBtn" aria-label="Back">${icon('back')}</button>
          <span class="spacer"></span>
          <button class="circle glass" id="shareBtn" aria-label="Share journal">${icon('share')}</button>
          <button class="circle glass" id="menuBtn" aria-label="Menu">${icon('dots')}</button>
        </div>
        <div class="txt">
          ${trip.destination ? `<div class="label">${icon('pin')} ${esc(trip.destination)}</div>` : `<div class="label">${statusText(trip)}</div>`}
          <h1>${esc(trip.name)}</h1>
          ${trip.startDate ? `<button class="dates" id="datesBtn">${dateRange(trip)} ${icon('chevron')}</button>` : ''}
        </div>
      </header>
      <button class="circle dark hero-action" id="editBtn" aria-label="Edit trip">${icon('edit')}</button>
    </div>
    <div class="pill-row info-row">
      ${days ? `<span class="pill">${icon('calendar')} ${plural(days, 'day')}</span>` : ''}
      <span class="pill">${icon('book')} ${plural(entries.length, 'memo')}</span>
      <span class="pill">${icon('image')} ${plural(photos.length, 'photo')}</span>
      <span class="pill">${icon('wallet')} ${money(sum(expenses), trip.currency)}</span>
    </div>
    ${views[state.tab](ctx)}`;

  const tabs = [['journal', 'book', 'Journal'], ['expenses', 'wallet', 'Expenses'], ['add', 'plus', 'Add'], ['photos', 'image', 'Photos'], ['summary', 'chart', 'Summary']];
  $('#nav').hidden = false;
  $('#nav').innerHTML = tabs.map(([id, ic, label]) =>
    `<button data-tab="${id}" class="${id === 'add' ? 'add' : state.tab === id ? 'active' : ''}" aria-label="${label}">${icon(ic)}</button>`).join('');
  $$('#nav button').forEach((b) => (b.onclick = () => (b.dataset.tab === 'add' ? addFor(trip) : go(trip.id, b.dataset.tab))));

  $('#backBtn').onclick = () => go(null);
  $('#menuBtn').onclick = openMenu;
  $('#shareBtn').onclick = () => exportJournal(trip);
  $('#editBtn').onclick = () => tripForm(trip);
  if ($('#datesBtn')) $('#datesBtn').onclick = () => tripForm(trip);
  $$('[data-day]').forEach((el) => (el.onclick = () => { state.day = el.dataset.day; render(); }));
  $$('[data-exp]').forEach((el) => (el.onclick = () => expenseForm(trip, expenses.find((e) => e.id === el.dataset.exp))));
  $$('[data-entry]').forEach((el) => (el.onclick = () => entryForm(trip, entries.find((e) => e.id === el.dataset.entry))));
  $$('[data-photo]').forEach((el) => (el.onclick = (ev) => {
    ev.stopPropagation();
    openViewer(trip, photos.find((p) => p.id === el.dataset.photo));
  }));
  $$('[data-cover]').forEach((el) => (el.onclick = async (ev) => {
    ev.stopPropagation();
    await db.put('trips', { ...trip, coverPhotoId: el.dataset.cover });
    toast('Cover photo updated');
    render();
  }));
  $$('[data-goto]').forEach((el) => (el.onclick = () => go(trip.id, el.dataset.goto)));
}

// Journal: day picker, then one section per day with memos, loose photos and that day's spending.
function journalView({ trip, expenses, photos, entries }) {
  const withContent = new Set([...entries, ...expenses].map((x) => x.date));
  photos.filter((p) => !p.entryId).forEach((p) => withContent.add(p.date));
  if (!withContent.size) {
    return `<div class="empty"><div class="big-emoji">✍️</div><h3>Every trip has a story</h3>
      <p>Tap <b>+</b> below to write your first memo.</p></div>`;
  }

  // Day strip: every day of the trip when dates are set, plus any other days that have content.
  const strip = new Set(withContent);
  const n = tripDays(trip);
  if (n > 0 && n <= 60) for (let i = 0; i < n; i++) strip.add(addDays(trip.startDate, i));
  const stripDays = [...strip].sort();
  if (state.day && !strip.has(state.day)) state.day = '';

  const dayStrip = `<div class="days">
    <button class="day-chip all ${state.day ? '' : 'active'}" data-day=""><b>All</b></button>
    ${stripDays.map((d) => `<button class="day-chip ${state.day === d ? 'active' : ''}" data-day="${d}">
      ${prettyDate(d, { weekday: 'short' })}<b>${prettyDate(d, { day: 'numeric' })}</b>
      <span class="dot ${withContent.has(d) ? '' : 'none'}"></span></button>`).join('')}
  </div>`;

  const shown = [...withContent].filter((d) => !state.day || d === state.day).sort();
  const sections = shown.length ? shown.map((day) => {
    const num = dayNumber(trip, day);
    const dayEntries = entries.filter((e) => e.date === day).sort((a, b) => (a.time || '').localeCompare(b.time || '') || a.createdAt - b.createdAt);
    const loose = photos.filter((p) => !p.entryId && p.date === day);
    const spent = expenses.filter((e) => e.date === day);
    return `<section class="day">
      <div class="day-title"><h3>${num ? `Day ${num}` : prettyDate(day, { month: 'short', day: 'numeric' })}</h3>
        <span class="pill">${icon('calendar')} ${prettyDate(day)}</span></div>
      ${dayEntries.map((e) => entryCard(e, photos.filter((p) => p.entryId === e.id))).join('')}
      ${loose.length ? `<div class="strip">${loose.map((p) => `<div class="ph" data-photo="${p.id}" ${bg(p.blob)}></div>`).join('')}</div>` : ''}
      ${spent.length ? `<div class="spent-line" data-goto="expenses">💸 <span><b>${money(sum(spent), trip.currency)}</b> spent · ${plural(spent.length, 'item')}</span>
        <span class="circle dark">${icon('arrow')}</span></div>` : ''}
    </section>`;
  }).join('') : `<div class="empty"><div class="big-emoji">🌤️</div><h3>Nothing here yet</h3><p>Tap <b>+</b> to add a memo for this day.</p></div>`;
  return dayStrip + sections;
}

function entryCard(e, pics) {
  const chips = [
    e.time && `<span class="mini">${icon('clock')} ${esc(e.time)}</span>`,
    e.mood && `<span class="mini">${e.mood} Mood</span>`,
    e.weather && `<span class="mini">${e.weather} Weather</span>`,
  ].filter(Boolean).join('');
  const place = e.place ? `<div class="label">${icon('pin')} ${esc(e.place)}</div>` : '';
  if (!pics.length) {
    return `<article class="entry text-only" data-entry="${e.id}"><div class="body">
      ${place}${e.title ? `<h4>${esc(e.title)}</h4>` : ''}
      ${e.text ? `<p class="entry-text">${esc(e.text)}</p>` : ''}
      ${chips ? `<div class="chips-row">${chips}</div>` : ''}</div></article>`;
  }
  const [first, ...others] = pics;
  return `<article class="entry" data-entry="${e.id}">
    <div class="photo" data-photo="${first.id}" ${bg(first.blob)}>
      ${pics.length > 1 ? `<span class="pill glass count">${icon('image')} ${pics.length}</span>` : ''}
      <div class="over">${place}${e.title ? `<h4>${esc(e.title)}</h4>` : ''}</div>
    </div>
    ${others.length ? `<div class="thumbs">${others.slice(0, 4).map((p, i) =>
      `<div class="ph" data-photo="${p.id}" ${bg(p.blob)}>${i === 3 && others.length > 4 ? `<span class="more">+${others.length - 4}</span>` : ''}</div>`).join('')}</div>` : ''}
    ${e.text || chips ? `<div class="body">${e.text ? `<p class="entry-text">${esc(e.text)}</p>` : ''}
      ${chips ? `<div class="chips-row">${chips}</div>` : ''}</div>` : ''}
  </article>`;
}

function expensesView({ trip, expenses }) {
  const total = sum(expenses);
  const days = new Set(expenses.map((e) => e.date)).size;
  const left = trip.budget ? trip.budget - total : null;
  const ticket = `<div class="ticket">
    <div class="side"><span>SPENT</span><span class="circle dark">${icon('wallet')}</span></div>
    <div class="main">
      <div class="top"><div class="muted">Total spent</div>
        <div class="amount">${money(total, trip.currency)}</div>
        ${trip.budget ? `<div class="progress ${left < 0 ? 'over' : ''}"><div style="width:${Math.min(100, (total / trip.budget) * 100)}%"></div></div>` : ''}
      </div>
      <div class="bottom">
        <div><small>Budget</small><b>${trip.budget ? money(trip.budget, trip.currency) : '—'}</b></div>
        <div><small>${left !== null && left < 0 ? 'Over' : 'Left'}</small><b>${left !== null ? money(Math.abs(left), trip.currency) : '—'}</b></div>
        <div><small>Per day</small><b>${days ? money(total / days, trip.currency) : '—'}</b></div>
      </div>
    </div></div>`;
  if (!expenses.length) return ticket + `<div class="empty"><div class="big-emoji">💸</div><h3>No expenses yet</h3><p>Tap <b>+</b> to add one.</p></div>`;

  const byDay = {};
  expenses.forEach((e) => (byDay[e.date] ||= []).push(e));
  return ticket + `<div class="section-head"><h3>Transactions</h3><span class="muted">${expenses.length}</span></div>` +
    Object.keys(byDay).sort().reverse().map((day) => {
      const items = byDay[day].sort((a, b) => b.createdAt - a.createdAt);
      const n = dayNumber(trip, day);
      return `<div class="day-head"><span>${n ? `Day ${n} · ` : ''}${prettyDate(day)}</span><span>${money(sum(items), trip.currency)}</span></div>
        ${items.map((e) => `<div class="exp" data-exp="${e.id}">
          <div class="emoji">${cat(e.category).emoji}</div>
          <div class="info"><div class="note">${esc(e.note) || cat(e.category).label}</div><div class="muted">${cat(e.category).label}</div></div>
          <div class="amt">${money(e.amount, trip.currency)}</div></div>`).join('')}`;
    }).join('');
}

function photosView({ trip, photos }) {
  if (!photos.length) return `<div class="empty"><div class="big-emoji">📷</div><h3>No photos yet</h3><p>Tap <b>+</b> to add photos of places you've been.</p></div>`;
  const cover = coverOf(trip, photos);
  photos.sort((a, b) => (b.date || '').localeCompare(a.date || '') || b.createdAt - a.createdAt);
  return `<div class="section-head"><h3>Gallery</h3><span class="muted">${photos.length}</span></div>
    <div class="photo-grid">${photos.map((p) => `
    <article class="tile" data-photo="${p.id}" ${bg(p.blob)}>
      <button class="corner circle glass sm ${p.id === cover?.id ? 'on' : ''}" data-cover="${p.id}" aria-label="Set as cover">${icon('star')}</button>
      <div class="txt">${p.date ? `<div class="label">${prettyDate(p.date, { month: 'short', day: 'numeric' })}</div>` : ''}
        ${p.place ? `<div class="name">${esc(p.place)}</div>` : ''}</div>
    </article>`).join('')}</div>`;
}

function summaryView({ trip, expenses, entries, photos }) {
  const places = [...new Set([...entries.map((e) => e.place), ...photos.map((p) => p.place)].filter(Boolean))];
  const moods = entries.map((e) => e.mood).filter(Boolean);
  const count = (m) => moods.filter((x) => x === m).length;
  const topMood = [...moods].sort((a, b) => count(b) - count(a))[0];
  const total = sum(expenses);
  const spendDays = new Set(expenses.map((e) => e.date)).size;
  const tiles = `<div class="amenities">
    <div class="amenity"><div class="ic">${topMood || '🙂'}</div><b>${topMood ? 'Mood' : '—'}</b><small>Trip mood</small></div>
    <div class="amenity"><div class="ic">📍</div><b>${places.length}</b><small>Places</small></div>
    <div class="amenity"><div class="ic">📅</div><b>${tripDays(trip) || spendDays || '—'}</b><small>Days</small></div>
  </div>`;
  const placesCard = places.length
    ? `<div class="panel"><h4>Places visited</h4><div class="chips" style="margin-top:12px">${places.map((p) => `<span class="pill" style="background:var(--mint)">${icon('pin')} ${esc(p)}</span>`).join('')}</div></div>`
    : '';
  if (!expenses.length) return `<div class="section-head"><h3>Trip in numbers</h3></div>` + tiles + placesCard;

  const byCat = CATEGORIES.map((c) => ({ ...c, sum: sum(expenses.filter((e) => cat(e.category).id === c.id)) }))
    .filter((c) => c.sum > 0).sort((a, b) => b.sum - a.sum);
  const biggest = expenses.reduce((a, b) => (b.amount > a.amount ? b : a));
  return `<div class="section-head"><h3>Trip in numbers</h3></div>${tiles}
    <div class="dark-card" data-goto="expenses">
      <div class="icon-box">${cat(biggest.category).emoji}</div>
      <div class="info"><div class="label">Biggest expense</div><b>${money(biggest.amount, trip.currency)}</b>
        <div class="muted">${esc(biggest.note) || cat(biggest.category).label} · ${prettyDate(biggest.date)}</div></div>
      <span class="circle lime sm">${icon('arrow')}</span>
    </div>
    <div class="panel"><h4>Spending by category</h4>
      <div class="muted">${money(total, trip.currency)} total · ${money(total / spendDays, trip.currency)} per day</div>
      ${byCat.map((c) => `<div class="bar-row">
        <div class="top"><span>${c.emoji} ${c.label}</span><span>${money(c.sum, trip.currency)} · ${Math.round((c.sum / total) * 100)}%</span></div>
        <div class="bar"><div style="width:${(c.sum / byCat[0].sum) * 100}%"></div></div></div>`).join('')}
    </div>
    ${placesCard}`;
}

// ---------- Bottom sheet ----------
function openSheet(html) {
  $('#sheet').innerHTML = `<button class="circle sm sheet-close" aria-label="Close">${icon('x')}</button>` + html;
  $('#sheet .sheet-close').onclick = closeSheet;
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

function nameForm() {
  openSheet(`<h2>What's your name?</h2>
    <form id="f"><div class="field"><input name="name" placeholder="Your name" value="${esc(localStorage.getItem('name') || '')}" autocomplete="given-name"></div>
    <button class="btn">Save</button></form>`);
  $('#f').onsubmit = (ev) => {
    ev.preventDefault();
    localStorage.setItem('name', new FormData(ev.target).get('name').trim());
    closeSheet();
    render();
  };
}

function tripForm(trip) {
  const t = trip || { name: '', destination: '', currency: localStorage.getItem('lastCurrency') || 'PHP', budget: '', startDate: today(), endDate: '' };
  openSheet(`
    <h2>${trip ? 'Edit journey' : 'New journey'}</h2>
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

// Default date for new items: the selected day in the strip, else today.
const defaultDate = () => state.day || today();

// Journal memo with its own photos.
async function entryForm(trip, entry) {
  const e = entry || { title: '', text: '', place: '', mood: '', weather: '', date: defaultDate(), time: nowTime() };
  // Photos shown in the form: existing ones (may be removed) and new ones (saved on submit).
  const existing = entry ? (await db.byTrip('photos', trip.id)).filter((p) => p.entryId === entry.id) : [];
  const pics = existing.map((p) => ({ photo: p, url: blobUrl(p.blob), isNew: false }));
  const removed = [];

  openSheet(`
    <h2>${entry ? 'Edit memo' : 'New memo'}</h2>
    <form id="f">
      <div class="field"><input name="title" class="title-input" placeholder="Title (e.g. Sunrise at Fushimi Inari)" value="${esc(e.title)}"></div>
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
      `<div class="pic" style="background-image:url(${p.url})"><button type="button" data-rm="${i}" aria-label="Remove photo">${icon('x')}</button></div>`).join('')
      + `<button type="button" id="addPic" class="pic add-pic">${icon('camera')}Add</button>`;
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
  const e = exp || { amount: '', category: 'food', note: '', date: defaultDate() };
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

const menuItem = (a, emoji, label, cls = '') => `<button class="menu-item ${cls}" data-a="${a}"><span class="ic">${emoji}</span>${label}</button>`;

// The "+" button: goes straight to the form for the current tab, or asks in the Journal/Summary tabs.
function addFor(trip) {
  if (state.tab === 'expenses') return expenseForm(trip);
  if (state.tab === 'photos') return $('#photoInput').click();
  openSheet(`
    <h2>Add to your journal</h2>
    ${menuItem('memo', '✍️', 'Write a memo')}
    ${menuItem('expense', '💸', 'Add an expense')}
    ${menuItem('photo', '📷', 'Add photos')}`);
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
  toast(`Saving ${plural(files.length, 'photo')}…`);
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
  const isCover = trip.coverPhotoId === photo.id;
  v.innerHTML = `
    <div class="bar-top">
      <button class="circle glass" id="vClose" aria-label="Close">${icon('x')}</button>
      <span class="spacer"></span>
      <button class="circle ${isCover ? 'lime' : 'glass'}" id="vCover" aria-label="Set as cover">${icon('star')}</button>
      <button class="circle glass" id="vEdit" aria-label="Edit">${icon('edit')}</button>
      <button class="circle glass" id="vDel" aria-label="Delete">${icon('trash')}</button>
    </div>
    <img src="${blobUrl(photo.blob)}" alt="">
    <div class="cap">
      ${photo.date ? `<div class="label muted">${prettyDate(photo.date)}</div>` : ''}
      ${photo.place ? `<b>${esc(photo.place)}</b>` : ''}
      ${photo.caption ? `<div>${esc(photo.caption)}</div>` : ''}
    </div>`;
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

async function openMenu() {
  const trip = state.tripId && (await db.get('trips', state.tripId));
  openSheet(`
    <h2>Menu</h2>
    ${trip ? menuItem('edit', '✏️', 'Edit journey details') + menuItem('journal', '📖', 'Share journal as text') + menuItem('csv', '📄', 'Export expenses (CSV)') : menuItem('name', '👋', 'Change your name')}
    ${menuItem('backup', '💾', 'Back up all data')}
    ${menuItem('restore', '📥', 'Restore from backup')}
    ${trip ? menuItem('delete', '🗑️', 'Delete this journey', 'danger') : ''}`);
  $$('.menu-item').forEach((b) => (b.onclick = async () => {
    closeSheet();
    const a = b.dataset.a;
    if (a === 'edit') tripForm(trip);
    if (a === 'name') nameForm();
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
}

$('#fab').onclick = () => tripForm();

// ---------- Start ----------
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js');
if (navigator.storage && navigator.storage.persist) navigator.storage.persist();
window.dispatchEvent(new HashChangeEvent('hashchange'));

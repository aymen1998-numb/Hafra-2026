/**
 * hafra.dz — app.js
 * All user-supplied content is rendered via DOM text nodes (never innerHTML).
 * Input is sanitised and rate-limited client-side; server enforces RLS + CHECK.
 */

import * as Leaflet from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { db, auth, storage, handleFirestoreError, OperationType } from './firebase.js';
import { collection, query, orderBy, limit, getDocs, addDoc, updateDoc, doc, deleteDoc, onSnapshot, serverTimestamp } from 'firebase/firestore';
import { onAuthStateChanged, signInWithPopup, GoogleAuthProvider, signOut, signInAnonymously } from 'firebase/auth';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';

// Create a mutable copy of L so plugins can attach themselves
// avoiding Vite's "object is not extensible" error on frozen ES modules.
const L = { ...Leaflet };
window.L = L;

// We dynamically load leaflet.heat via a script tag.
await new Promise((resolve, reject) => {
  const script = document.createElement('script');
  script.src = 'https://unpkg.com/leaflet.heat@0.2.0/dist/leaflet-heat.js';
  script.onload = resolve;
  script.onerror = () => { console.error('Failed to load leaflet.heat'); resolve(); };
  document.head.appendChild(script);
});

await import('leaflet.markercluster');
import 'leaflet.markercluster/dist/MarkerCluster.css';
import 'leaflet.markercluster/dist/MarkerCluster.Default.css';

// Fix Leaflet Default Icon path issues with bundlers
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

'use strict';

// Theme persistence initialization
const storedTheme = window.localStorage.getItem('hafra-theme') || 'dark';
if (storedTheme === 'light') document.documentElement.classList.add('light');

// Environment Configuration
// -----------------------------------------------------------------------------

// DOM Helpers for XSS Prevention
/** Escape a string for safe insertion as text content. */
function esc(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/** Create a text node — zero XSS risk. Use for all user-supplied content. */
function txt(str) {
  return document.createTextNode(str == null ? '' : String(str));
}

/** Sanitise comment input: strip HTML tags, limit length, trim. */
function sanitiseComment(raw) {
  if (!raw) return null;
  const stripped = raw.replace(/<[^>]*>/g, '').trim();
  return stripped.slice(0, 300) || null;
}

/** Validate coordinates are within Algeria's bounding box (roughly). */
function validAlgeriaCoords(lat, lng) {
  return lat >= 18.9 && lat <= 37.2 && lng >= -8.7 && lng <= 12.0;
}

/** Allowed categories — anything else is rejected. */
const VALID_CATS = new Set(['pothole','cracks','lighting','signage','flooding','utility']);

// Rate Limiter to prevent spam
/** Prevent spam: max 5 reports per 10 minutes per browser session. */
const RateLimiter = (() => {
  const KEY = 'hf_rl';
  const LIMIT = 5, WINDOW_MS = 10 * 60 * 1000;
  function get() {
    try { return JSON.parse(localStorage.getItem(KEY) || '{"ts":0,"n":0}'); }
    catch { return { ts: 0, n: 0 }; }
  }
  return {
    check() {
      const d = get(), now = Date.now();
      if (now - d.ts > WINDOW_MS) return true;
      return d.n < LIMIT;
    },
    record() {
      const d = get(), now = Date.now();
      if (now - d.ts > WINDOW_MS) { localStorage.setItem(KEY, JSON.stringify({ ts: now, n: 1 })); return; }
      localStorage.setItem(KEY, JSON.stringify({ ts: d.ts, n: d.n + 1 }));
    },
  };
})();

// Constants and Configurations
const CATS = {
  pothole:  { fr: 'Nid-de-poule',  ar: 'حفرة',          en: 'Pothole',   ico: '🕳',  col: '#EF4444' },
  cracks:   { fr: 'Fissures',      ar: 'تشققات',         en: 'Cracks',    ico: '🪨',  col: '#F97316' },
  lighting: { fr: 'Éclairage',     ar: 'إضاءة',   en: 'Lighting',  ico: '🌑',  col: '#818CF8' },
  signage:  { fr: 'Signalisation', ar: 'لافتات',  en: 'Signage',   ico: '🚧',  col: '#FBBF24' },
  flooding: { fr: 'Inondation',    ar: 'فيضان',          en: 'Flooding',  ico: '🌊',  col: '#38BDF8' },
  utility:  { fr: 'ADE / SEAAL',   ar: 'تسربات المياه', en: 'Water Leak', ico: '💧',  col: '#34D399' },
};
const STAR_LABELS = {
  1: { fr: 'Impraticable', ar: 'خطير جداً' },
  2: { fr: 'Très mauvais', ar: 'سيء جداً'  },
  3: { fr: 'Acceptable',   ar: 'مقبول'     },
  4: { fr: 'Bon état',     ar: 'جيد'       },
  5: { fr: 'Parfait',      ar: 'ممتاز'     },
};
const STATUSES = {
  active:   { fr: 'Actif',    ar: 'نشط',         col: '#EF4444', dot: '🔴' },
  reported: { fr: 'Signalé',  ar: 'تم الإبلاغ',  col: '#FBBF24', dot: '🟡' },
  fixed:    { fr: 'Réparé',   ar: 'تم الإصلاح',  col: '#22C55E', dot: '🟢' },
};
const WILAYAS = [
  {n:'Alger',lat:36.737,lng:3.086},{n:'Oran',lat:35.697,lng:-0.627},
  {n:'Constantine',lat:36.365,lng:6.614},{n:'Blida',lat:36.470,lng:2.813},
  {n:'Batna',lat:35.554,lng:6.173},{n:'Sétif',lat:36.190,lng:5.412},
  {n:'Annaba',lat:36.901,lng:7.757},{n:'Tizi Ouzou',lat:36.753,lng:4.053},
  {n:'Béjaïa',lat:36.756,lng:5.084},{n:'Biskra',lat:34.850,lng:5.728},
  {n:'Tlemcen',lat:34.877,lng:-1.316},{n:'Ouargla',lat:31.949,lng:5.335},
  {n:'Ghardaïa',lat:32.490,lng:3.671},{n:'Tiaret',lat:35.370,lng:1.322},
  {n:'Mostaganem',lat:35.938,lng:0.089},{n:'Chlef',lat:36.165,lng:1.338},
  {n:'Mascara',lat:35.395,lng:0.143},{n:'Tipaza',lat:36.588,lng:2.447},
  {n:'Skikda',lat:36.879,lng:6.905},{n:'Guelma',lat:36.462,lng:7.427},
  {n:'Boumerdès',lat:36.762,lng:3.477},{n:'Médéa',lat:36.264,lng:2.749},
  {n:'Djelfa',lat:34.671,lng:3.263},{n:"M'Sila",lat:35.705,lng:4.539},
  {n:'El Oued',lat:33.368,lng:6.863},{n:'Béchar',lat:31.617,lng:-2.214},
  {n:'Tamanrasset',lat:22.785,lng:5.523},{n:'Adrar',lat:27.870,lng:-0.294},
  {n:'Laghouat',lat:33.800,lng:2.865},{n:'Khenchela',lat:35.436,lng:7.143},
];
const MAX_FILE_MB = 5;
const MAX_FILE_BYTES = MAX_FILE_MB * 1024 * 1024;
const ALLOWED_MIME = new Set(['image/jpeg','image/jpg','image/png','image/webp']);

// Application State
let reports = [];
let confirmedIds = new Set();
try { confirmedIds = new Set(JSON.parse(localStorage.getItem('hf_confirmed') || '[]')); } catch {}
let showHeat = true, showMarkers = true;
let addMode = false, pendingLat = null, pendingLng = null;
let selCategory = null, selStars = 0;
let pendingMarker = null, heatLayer = null;
let currentTab = 'feed';
let photoFile = null;

// Translations (i18n)
const I18N = {
  ar: {
    tabFeed: 'الشريط', tabStats: 'إحصائيات', tabMap: 'خريطة',
    anonyme: 'مجهول', login: 'تسجيل الدخول', logout: 'تسجيل الخروج',
    reports: 'بلاغات', avg: 'متوسط ★ / 5', critical: 'حرجة', good: 'جيدة',
    confirmations: 'تأكيدات المواطنين', byCategory: 'حسب الفئة',
    champions: '🏆 الأبطال (أفضل 5)', emptyFeed: 'لا توجد بلاغات حاليا.<br/>كن الأول!',
    emptyFilter: 'لا توجد بلاغات في هذه الفئة.',
    filterAll: 'الكل',
    trafficLayer: 'اكتظاظ حركة المرور (تجريبي)',
    trafficDesc: 'جودة الطرق وحركة المرور (محاكاة)'
  },
  fr: {
    tabFeed: 'Fil', tabStats: 'Stats', tabMap: 'Carte',
    anonyme: 'Anonyme', login: 'Connexion Google', logout: 'Déconnexion',
    reports: 'Signalements', avg: 'Moy. ★ / 5', critical: 'Critiques (1–2★)', good: 'Bons (4–5★)',
    confirmations: 'Confirmations citoyennes', byCategory: 'Par catégorie',
    champions: '🏆 Champions (Top 5)', emptyFeed: 'Aucun signalement pour l\'instant.<br/>Soyez le premier !',
    emptyFilter: 'Aucun signalement dans cette catégorie.',
    filterAll: 'Tous',
    trafficLayer: 'Trafic Qualité (Démo)',
    trafficDesc: 'Gradient de qualité des routes & trafic simulé'
  }
};
let currentLang = 'fr';

window.setLanguage = function(lang) {
  currentLang = lang;
  document.documentElement.lang = lang;
  document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
  // Update Tabs
  const ptabs = document.querySelectorAll('.ptab');
  if (ptabs.length >= 3) {
    ptabs[0].textContent = I18N[lang].tabFeed;
    ptabs[1].textContent = I18N[lang].tabStats;
    ptabs[2].textContent = I18N[lang].tabMap;
  }
  // Update Auth Btn
  const authBtn = document.getElementById('auth-btn');
  if (authBtn) {
    if (currentUserEmail) authBtn.textContent = I18N[lang].logout;
    else authBtn.textContent = I18N[lang].login;
  }
  const authState = document.getElementById('auth-state');
  if (authState && !currentUserEmail) authState.textContent = I18N[lang].anonyme;

  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.getAttribute('data-i18n');
    let text = I18N[lang]?.[key] || key;
    if (key.startsWith('placeholder:')) {
      el.placeholder = text;
    } else {
      el.textContent = text;
    }
  });

  // Re-render
  renderPanel();
  renderMap();
};

window.t = function(key) {
  return I18N[currentLang]?.[key] || key;
};

// Fake Traffic Routes
const FAKE_TRAFFIC_LINES = [
  { path: [[36.7523, 3.0522], [36.7533, 3.0545], [36.7551, 3.0560], [36.7562, 3.0581]], color: '#EF4444' },
  { path: [[36.7562, 3.0581], [36.7580, 3.0592], [36.7610, 3.0596]], color: '#22C55E' },
  { path: [[36.7610, 3.0596], [36.7635, 3.0601], [36.7650, 3.0632]], color: '#F59E0B' },
  { path: [[36.7650, 3.0632], [36.7661, 3.0655], [36.7680, 3.0664], [36.7720, 3.0671]], color: '#EF4444' },
  { path: [[36.7523, 3.0522], [36.7510, 3.0501], [36.7485, 3.0482]], color: '#EF4444' },
  { path: [[36.7551, 3.0560], [36.7530, 3.0602], [36.7512, 3.0645]], color: '#22C55E' },
  { path: [[36.7512, 3.0645], [36.7501, 3.0675], [36.7460, 3.0691]], color: '#F59E0B' },
  { path: [[36.7460, 3.0691], [36.7431, 3.0722], [36.7401, 3.0745]], color: '#EF4444' },
  { path: [[36.7610, 3.0596], [36.7600, 3.0620], [36.7580, 3.0660]], color: '#22C55E' },
  { path: [[36.7720, 3.0671], [36.7735, 3.0690], [36.7750, 3.0710]], color: '#F59E0B' }
];
let trafficLayerGroup = null;

// Supabase
const IS_CONFIGURED = true;
let currentUserEmail = null;
onAuthStateChanged(auth, async (user) => {
  if (user && user.email) {
    currentUserEmail = user.email;
    const as = document.getElementById('auth-state');
    const ab = document.getElementById('auth-btn');
    if (as) { as.textContent = user.email; as.style.color = 'var(--txt)'; }
    if (ab) ab.textContent = 'Déconnexion';
  } else if (user) {
    // signed in anonymously
    currentUserEmail = null;
    const as = document.getElementById('auth-state');
    const ab = document.getElementById('auth-btn');
    if (as) { as.textContent = 'Anonyme'; as.style.color = 'var(--dim)'; }
    if (ab) ab.textContent = 'Connexion Google';
  } else {
    // completely signed out, sign in anonymously by default
    currentUserEmail = null;
    try { await signInAnonymously(auth); } catch(e) {}
  }
});


window.toggleAuth = async function() {
  if (currentUserEmail) {
    await signOut(auth);
    try { await signInAnonymously(auth); } catch(e) {}
  } else {
    try {
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
      showToast("Connexion réussie");
    } catch (e) {
      console.warn("Connexion échouée", e);
      if (e.code === 'auth/popup-closed-by-user' || e.message?.includes('popup')) {
          if (confirm("La pop-up a été bloquée. Voulez-vous ouvrir l'application en plein écran dans un nouvel onglet pour vous connecter ?")) {
              window.open(window.location.href, '_blank');
          }
      } else {
          showToast("Connexion annulée ou échouée");
      }
    }
  }
};


// Map
const map = L.map('map', { center:[28, 1.66], zoom:5, minZoom:4, maxZoom:19, zoomControl:true, touchZoom: true, doubleClickZoom: true, tap: true });
let currentTileLayer = null;

let liveLocationMarker = null;
let liveLocationCircle = null;
const liveLocationIcon = L.divIcon({
  className: 'live-location-icon',
  html: '<div class="live-location-marker"></div>',
  iconSize: [22, 22],
  iconAnchor: [11, 11]
});

function startLiveTracking() {
  if (navigator.geolocation && !window._isTrackingLocation) {
    window._isTrackingLocation = true;
    navigator.geolocation.watchPosition((pos) => {
      const lat = pos.coords.latitude;
      const lng = pos.coords.longitude;
      const accuracy = pos.coords.accuracy;
      
      if (!liveLocationMarker) {
        liveLocationMarker = L.marker([lat, lng], {icon: liveLocationIcon, zIndexOffset: 1000}).addTo(map);
        liveLocationCircle = L.circle([lat, lng], {radius: accuracy, color: '#4285F4', fillColor: '#4285F4', fillOpacity: 0.15, weight: 1, interactive: false}).addTo(map);
      } else {
        liveLocationMarker.setLatLng([lat, lng]);
        liveLocationCircle.setLatLng([lat, lng]);
        liveLocationCircle.setRadius(accuracy);
      }
    }, (err) => {
      console.warn("Live tracking failed/disabled:", err);
    }, {
      enableHighAccuracy: true,
      maximumAge: 10000,
      timeout: 10000
    });
  }
}

function setMapTiles() {
  if (currentTileLayer) map.removeLayer(currentTileLayer);
  const isLight = document.documentElement.classList.contains('light');
  const url = isLight 
    ? 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png'
    : 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';
  
  currentTileLayer = L.tileLayer(url, {
    attribution: '© <a href="https://openstreetmap.org">OpenStreetMap</a> · © <a href="https://carto.com">CARTO</a>',
    subdomains: 'abcd', maxZoom: 20,
  }).addTo(map);
}
setMapTiles();

const markerGroup = L.markerClusterGroup({
  chunkedLoading: true,
  maxClusterRadius: 50
}).addTo(map);

// Helpers
function starCol(s) {
  return s===1?'#EF4444':s===2?'#F97316':s===3?'#FBBF24':s===4?'#84CC16':'#22C55E';
}
/** Returns safe stars HTML — no user data involved, safe to use. */
function starsHTML(s, sz = 14) {
  return Array.from({ length:5 }, (_,i) =>
    `<span style="font-size:${sz}px;filter:${i<s?'none':'grayscale(1) opacity(.2)'}">⭐</span>`
  ).join('');
}
function timeAgo(ts) {
  const timeMs = ts?.toDate ? ts.toDate().getTime() : typeof ts === 'number' && ts < 20000000000 ? ts * 1000 : new Date(ts).getTime();
  const d = Date.now() - timeMs;
  const m = Math.floor(d/60000), h = Math.floor(d/3600000), days = Math.floor(d/86400000);
  if (m < 2) return 'à l\'instant';
  if (m < 60) return `${m}min`;
  if (h < 24) return `${h}h`;
  return `${days}j`;
}
function nearestWilaya(lat, lng) {
  let best = 'Algérie', minD = Infinity;
  WILAYAS.forEach(w => { const d = Math.hypot(w.lat-lat, w.lng-lng); if (d<minD) { minD=d; best=w.n; } });
  return best;
}
function makeIcon(r) {
  const sc = starCol(r.score), c = CATS[r.category] || CATS.pothole;
  // Use a truncated unique id so each marker's filter doesn't collide in the DOM
  const fid = 'ds' + String(r.id).replace(/[^a-z0-9]/gi, '').slice(0, 12);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 50" width="40" height="50">
    <filter id="${fid}"><feDropShadow dx="0" dy="2" stdDeviation="2.5" flood-opacity="0.45"/></filter>
    <path d="M20 0C9 0 0 9.4 0 21C0 36 20 50 20 50S40 36 40 21C40 9.4 31 0 20 0Z" fill="${sc}" filter="url(#${fid})" opacity=".92"/>
    <circle cx="20" cy="20" r="14" fill="rgba(0,0,0,.22)"/>
    <text x="20" y="26" text-anchor="middle" fill="white" font-family="sans-serif" font-size="17">${c.ico}</text>
  </svg>`;
  return L.divIcon({ html:svg, className:'', iconSize:[40,50], iconAnchor:[20,50], popupAnchor:[0,-52] });
}
window.showToast = function showToast(msg, isError = false) {
  const t = document.getElementById('toast');
  if (!t) return;
  // Toast uses textContent — safe
  t.textContent = msg;
  t.style.background = isError ? '#EF4444' : 'var(--acc)';
  t.classList.add('show');
  clearTimeout(t._tid);
  t._tid = setTimeout(() => t.classList.remove('show'), 3400);
}
function setConnPill(ok, text) {
  const pill = document.getElementById('conn-pill');
  document.getElementById('conn-dot').style.background = ok ? '#22C55E' : '#EF4444';
  // textContent — safe
  document.getElementById('conn-text').textContent = text;
  pill?.classList.add('show');
  clearTimeout(pill._tid);
  pill._tid = setTimeout(() => pill?.classList.remove('show'), 3200);
}

// Render Map
function createPopup(r) {
  const c = CATS[r.category] || CATS.pothole;
  const st = STATUSES[r.status] || STATUSES.active;
  const done = confirmedIds.has(r.id);

  const wrapper = document.createElement('div');

  if (r.photo_url && /^(https:\/\/firebasestorage\.googleapis\.com\/|https:\/\/[a-zA-Z0-9._-]+\.supabase\.(co|in)\/|data:image\/)/.test(r.photo_url)) {
    const img = document.createElement('img');
    img.className = 'pu-photo';
    img.alt = 'Photo de la route';
    img.src = r.photo_url;
    img.onerror = () => img.remove();
    wrapper.appendChild(img);
  }

  const body = document.createElement('div');
  body.className = 'pu-body';

  const top = document.createElement('div');
  top.className = 'pu-top';

  const left = document.createElement('div');
  left.style.flex = '1';
  const catSpan = document.createElement('span');
  catSpan.className = 'pu-cat';
  catSpan.style.cssText = `color:${c.col};border-color:${c.col}40;background:${c.col}15`;
  catSpan.textContent = `${c.ico} ${c.fr}`;
  const starsDiv = document.createElement('div');
  starsDiv.style.marginTop = '7px';
  starsDiv.innerHTML = starsHTML(r.score, 15);
  left.appendChild(catSpan);
  left.appendChild(starsDiv);

  const right = document.createElement('div');
  right.style.cssText = 'text-align:right;font-size:11px;color:var(--dim2)';
  const wilayaDiv = document.createElement('div');
  wilayaDiv.style.fontWeight = '700';
  wilayaDiv.textContent = r.wilaya || 'Algérie';
  const timeDiv = document.createElement('div');
  timeDiv.style.cssText = "font-family:'JetBrains Mono',monospace;margin-top:2px;font-size:10px";
  timeDiv.textContent = timeAgo(r.createdAt || r.ts);
  right.appendChild(wilayaDiv);
  right.appendChild(timeDiv);

  top.appendChild(left);
  top.appendChild(right);
  body.appendChild(top);

  if (r.comment) {
    const cDiv = document.createElement('div');
    cDiv.className = 'pu-comment';
    cDiv.textContent = r.comment;
    body.appendChild(cDiv);
  }

  const footer = document.createElement('div');
  footer.className = 'pu-footer';

  const confirmBtn = document.createElement('button');
  confirmBtn.className = 'pu-confirm' + (done ? ' done' : '');
  confirmBtn.type = 'button';
  const confirmCount = document.createElement('span');
  confirmCount.id = 'vc-' + r.id;
  confirmCount.textContent = String(r.votes || 0);
  confirmBtn.appendChild(document.createTextNode('✓ Confirmer '));
  confirmBtn.appendChild(confirmCount);
  confirmBtn.onclick = () => window.upvote(r.id, confirmBtn);

  if (r.status !== 'fixed') {
    const isWatching = watchedIds.has(r.id);
    const notifyBtn = document.createElement('button');
    notifyBtn.className = 'pu-notify' + (isWatching ? ' watching' : '');
    notifyBtn.type = 'button';
    notifyBtn.id = 'nb-' + r.id;
    notifyBtn.textContent = isWatching ? '🔔 Suivi' : '🔕 Me notifier';
    notifyBtn.onclick = () => window.toggleWatch(r.id, notifyBtn);
    footer.appendChild(notifyBtn);
  }

  const statusBtn = document.createElement('span');
  statusBtn.className = 'pu-status';
  statusBtn.textContent = `${st.dot} ${st.fr}`;
  statusBtn.onclick = () => window.cycleStatus(r.id, statusBtn);

  footer.appendChild(confirmBtn);
  footer.appendChild(statusBtn);
  body.appendChild(footer);
  wrapper.appendChild(body);

  return wrapper;
}

function renderMap() {

  markerGroup.clearLayers();
  
  if (showMarkers) {
    // Determine what to cluster: 
    // Instead of rebuilding the cluster group entirely, we only rebuild if we are forcing it.
    // Wait, adding all markers to cluster group is efficient.
    // Let's add them all without bounds limitation so clustering handles zoom out correctly.
    const markers = reports.map(r => {
      const m = L.marker([r.lat, r.lng], { icon: makeIcon(r) });
      m.bindPopup(() => createPopup(r), { minWidth: 240, maxWidth: 300 });
      return m;
    });
    markerGroup.addLayers(markers);
  }

  if (trafficLayerGroup) { map.removeLayer(trafficLayerGroup); trafficLayerGroup = null; }
  if (heatLayer) { map.removeLayer(heatLayer); heatLayer = null; }
  if (window.heatLayerGood) { map.removeLayer(window.heatLayerGood); window.heatLayerGood = null; }
  
  if (showHeat) {
    trafficLayerGroup = L.layerGroup();
    
    // Add fake traffic lines (Demo)
    FAKE_TRAFFIC_LINES.forEach(line => {
      // Glow
      L.polyline(line.path, { color: line.color, weight: 12, opacity: 0.3, lineCap: 'round', lineJoin: 'round' }).addTo(trafficLayerGroup);
      // Core
      L.polyline(line.path, { color: line.color, weight: 5, opacity: 0.9, lineCap: 'round', lineJoin: 'round' }).addTo(trafficLayerGroup);
    });
    
    // Also plot real reports as short segments so they show up
    reports.forEach(r => {
      let c = '#22C55E';
      if(r.score <= 3) c = '#F97316';
      if(r.score <= 2) c = '#EF4444';
      
      const p1 = [r.lat, r.lng];
      const p2 = [r.lat + 0.0003, r.lng + 0.0003];
      L.polyline([p1, p2], { color: c, weight: 12, opacity: 0.3, lineCap: 'round' }).addTo(trafficLayerGroup);
      L.polyline([p1, p2], { color: c, weight: 5, opacity: 0.9, lineCap: 'round' }).addTo(trafficLayerGroup);
    });
    
    trafficLayerGroup.addTo(map);

    // Add back the heat map blobs
    if (reports.length > 0) {
      const size = map.getSize();
      if (size.x > 0 && size.y > 0) {
        const badPts = reports.filter(r => r.score <= 3).map(r => [r.lat, r.lng, 1]);
        const goodPts = reports.filter(r => r.score >= 4).map(r => [r.lat, r.lng, 1]);
        
        if (badPts.length) {
          if (typeof L.heatLayer === 'function') {
            heatLayer = L.heatLayer(badPts, {
              radius: 16, blur: 10, maxZoom: 15,
              gradient: { 0.4: '#F59E0B', 0.7: '#F97316', 1.0: '#EF4444' },
            }).addTo(map);
          } else {
            console.warn("L.heatLayer is not loaded. Skipping bad status heatmap blobs.");
          }
        }
        if (goodPts.length) {
          if (typeof L.heatLayer === 'function') {
            window.heatLayerGood = L.heatLayer(goodPts, {
              radius: 16, blur: 10, maxZoom: 15,
              gradient: { 0.5: '#84CC16', 1.0: '#22C55E' },
            }).addTo(map);
          } else {
            console.warn("L.heatLayer is not loaded. Skipping good status heatmap blobs.");
          }
        }
      } else {
        map.once('resize', renderMap);
      }
    }
  }
}

// Stats Header
function updateStats() {
  const n = reports.length;
  const avg = n ? (reports.reduce((a,r) => a + r.score, 0) / n).toFixed(1) : '—';
  const bad = reports.filter(r => r.score <= 2).length;
  document.getElementById('h-total').textContent = n;
  document.getElementById('h-avg').textContent = avg;
  if (avg !== '—') document.getElementById('h-avg').style.color = starCol(Math.round(parseFloat(avg)));
  document.getElementById('h-bad').textContent = bad;
}

// Load Reports
async function loadReports() {
  try {
    const q = query(collection(db, 'reports'), orderBy('createdAt', 'desc'), limit(500));
    const snap = await getDocs(q);
    reports = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    renderMap(); updateStats(); renderPanel();
  } catch (e) {
    try {
      handleFirestoreError(e, OperationType.GET, 'reports');
    } catch (errInfo) {
      console.warn('[hafra] Load error:', String(e));
    }
    if (!reports.length) reports = getDemoData();
    renderMap(); updateStats(); renderPanel();
    setConnPill(false, 'Mode hors-ligne');
  } finally {
    // Always hide the loader — no matter what throws above
    hideLoader();
  }
}

function hideLoader() {
  const el = document.getElementById('app-loading');
  el?.classList.add('hidden');
  if (el) setTimeout(() => el?.remove(), 500);
}

// Realtime
function subscribeRealtime() {
  const q = query(collection(db, 'reports'), orderBy('createdAt', 'desc'), limit(100));
  onSnapshot(q, (snapshot) => {
    snapshot.docChanges().forEach((change) => {
      const r = { id: change.doc.id, ...change.doc.data() };
      if (change.type === 'added') {
        if (!reports.some(x => x.id === r.id)) {
          reports.unshift(r);
          renderMap(); updateStats(); renderPanel();
        }
      } else if (change.type === 'modified') {
        const idx = reports.findIndex(x => x.id === r.id);
        if (idx > -1) {
          reports[idx] = r;
          renderMap(); updateStats(); renderPanel();
        }
      }
    });
  }, (error) => {
    try {
      handleFirestoreError(error, OperationType.GET, 'reports');
    } catch(e) {
      console.error("Firebase realtime error:", String(error));
    }
  });
}

// Upvote
window.upvote = async function upvote(id, btn) {
  if (confirmedIds.has(id)) { showToast('Vous avez déjà confirmé ce signalement'); return; }
  
  let email = currentUserEmail;
  if (!email) {
    // Show a custom UI instead of confirm/prompt
    showAuthPrompt(id, btn);
    return;
  }
  
  processUpvote(id, btn, email);
}

function showAuthPrompt(id, btn) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay auth-prompt-overlay';
  overlay.innerHTML = `
    <div class="modal auth-prompt-modal">
      <div class="modal-title">Confirmer le signalement</div>
      <p style="margin: 10px 0; font-size: 13px; color: var(--dim);">Une authentification est recommandée. Connectez-vous avec Google ou entrez une adresse email ci-dessous.</p>
      
      <button id="prompt-login-btn" class="submit-btn" style="width: 100%; margin-bottom: 10px;">
        Se connecter avec Google
      </button>
      
      <div style="display:flex; gap: 8px; margin-bottom: 10px;">
        <input type="email" id="prompt-email-input" placeholder="Ou entrez votre email..." style="flex:1; padding: 8px; border-radius: 6px; border: 1px solid var(--bdr); background: var(--s2); color: var(--txt); font-family: inherit;">
        <button id="prompt-submit-btn" class="submit-btn" style="padding: 8px 12px; height: auto; width: auto; font-size: 13px;">Valider</button>
      </div>

      <button id="prompt-cancel-btn" class="submit-btn" style="background: var(--s3); color: var(--txt); width: 100%;">Annuler</button>
    </div>
  `;
  document.body.appendChild(overlay);

  document.getElementById('prompt-login-btn').onclick = async () => {
    document.body.removeChild(overlay);
    await window.toggleAuth();
    if (currentUserEmail) {
      processUpvote(id, btn, currentUserEmail);
    }
  };

  document.getElementById('prompt-submit-btn').onclick = () => {
    const manualEmail = document.getElementById('prompt-email-input').value;
    if (!manualEmail || !manualEmail.includes('@')) {
      showToast('Un email valide est requis.');
      return;
    }
    document.body.removeChild(overlay);
    processUpvote(id, btn, manualEmail);
  };

  document.getElementById('prompt-cancel-btn').onclick = () => {
    document.body.removeChild(overlay);
  };
}

async function processUpvote(id, btn, email) {
  if (confirmedIds.has(id)) { showToast('Vous avez déjà confirmé ce signalement'); return; }
  confirmedIds.add(id);
  try { localStorage.setItem('hf_confirmed', JSON.stringify([...confirmedIds])); } catch {}
  const r = reports.find(x => x.id === id);
  if (r) r.votes = (r.votes || 0) + 1;
  btn?.classList.add('done');
  btn?.classList.add('pop-anim');
  setTimeout(() => btn?.classList.remove('pop-anim'), 300);

  const vc = document.getElementById('vc-' + id);
  if (vc) {
    vc.textContent = String(r?.votes || 1);
    vc.classList.add('pop-anim');
    setTimeout(() => vc.classList.remove('pop-anim'), 300);
  }
  
  // Try to find list btn if this was popup, and vice-versa
  const lstBtn = document.getElementById('rc-btn-' + id);
  if (lstBtn && lstBtn !== btn) {
    lstBtn.classList.add('done', 'pop-anim');
    lstBtn.textContent = '✓ Confirmé';
    setTimeout(() => lstBtn.classList.remove('pop-anim'), 300);
  }

  renderPanel();
  try { 
    // Supabase does not have an atomic increment out of the box in the JS client without an RPC, so we will read/write, or ignore it since the payload has auth
    // Wait, let's just update based on the local value for now since we just need it to work
    await updateDoc(doc(db, 'reports', id), { votes: r.votes });
    await addDoc(collection(db, 'confirmations'), { email, report_id: id, createdAt: new Date().toISOString() });
  } catch(e) { 
    try {
      handleFirestoreError(e, OperationType.UPDATE, 'reports/confirmations');
    } catch(errInfo) {
      console.error(String(e)); 
    }
  }
  showToast('Confirmation enregistrée');
}

window.cycleStatus = async function cycleStatus(id, btn) {
  if (!currentUserEmail) {
    if (confirm("Seuls les modérateurs peuvent changer le statut. Voulez-vous vous connecter avec Google ?")) {
      await window.toggleAuth();
      return;
    } else {
      return;
    }
  }

  const r = reports.find(x => x.id === id);
  if (!r) return;
  const order = ['active','reported','fixed'];
  const nextStatus = order[(order.indexOf(r.status || 'active') + 1) % 3];
  
  // Store old value in case we need to revert
  const oldTxt = btn.textContent;
  
  try { 
    btn.textContent = '...';
    await updateDoc(doc(db, 'reports', id), { status: nextStatus }); 
    r.status = nextStatus;
    const st = STATUSES[r.status];
    btn.textContent = `${st.dot} ${st.fr}`;
    renderPanel();
    showToast(`Statut: ${st.fr}`);
  } catch(e) { 
    btn.textContent = oldTxt; // revert
    
    // Detailed error logging
    try {
      handleFirestoreError(e, OperationType.UPDATE, 'reports');
    } catch(handledErr) {
       let errorObj;
       try { errorObj = JSON.parse(handledErr.message); } catch(parseErr){}
       if (errorObj && errorObj.error && errorObj.error.includes("permission")) {
          showToast("عذراً، يجب أن تكون مشرفاً لتغيير الحالة", true); // red toast
       } else {
          showToast("Erreur serveur", true);
       }
    }
  }
}

// Panel
let currentFeedFilter = 'all';

function renderPanel() {
  const pb = document.getElementById('pbody');
  // Clear safely
  while (pb.firstChild) pb.removeChild(pb.firstChild);

  if (currentTab === 'feed') {
    // Render Filter Bar
    const filterRow = document.createElement('div');
    filterRow.className = 'filter-row';
    filterRow.style.cssText = 'display:flex; gap:8px; overflow-x:auto; padding-bottom:8px; margin-bottom:12px; scrollbar-width:none; border-bottom:1px solid var(--bdr);';
    
    // "All" button
    const btnAll = document.createElement('button');
    btnAll.className = 'filter-btn ' + (currentFeedFilter === 'all' ? 'active' : '');
    btnAll.textContent = 'Tous';
    btnAll.onclick = () => { currentFeedFilter = 'all'; renderPanel(); };
    filterRow.appendChild(btnAll);
    
    // Category buttons
    for (const catId of Array.from(VALID_CATS)) {
      const c = CATS[catId];
      const btn = document.createElement('button');
      btn.className = 'filter-btn ' + (currentFeedFilter === catId ? 'active' : '');
      const catText = `${c.fr} · ${c.ar}`;
      btn.innerHTML = `${c.ico} ${catText}`;
      btn.onclick = () => { currentFeedFilter = catId; renderPanel(); };
      filterRow.appendChild(btn);
    }
    pb.appendChild(filterRow);

    const visibleReports = currentFeedFilter === 'all' ? reports : reports.filter(r => r.category === currentFeedFilter);

    if (!visibleReports.length) {
      if (!reports.length) {
        let e = document.createElement('div'); e.className = 'empty';
        e.innerHTML = `<div class="empty-ico">🗺</div><div class="empty-txt">Aucun signalement pour l'instant.<br/>Soyez le premier !</div>`;
        pb.appendChild(e);
      } else {
        let e = document.createElement('div'); e.className = 'empty';
        e.innerHTML = `<div class="empty-ico">🔍</div><div class="empty-txt">Aucun signalement dans cette catégorie.</div>`;
        pb.appendChild(e);
      }
      return;
    }
    visibleReports.forEach(r => {
      const c = CATS[r.category] || CATS.pothole;
      const st = STATUSES[r.status || 'active'];
      const done = confirmedIds.has(r.id);

      const card = document.createElement('div');
      card.className = 'rcard';
      card.onclick = () => window.flyTo(r.lat, r.lng);

      if (r.photo_url && /^(https:\/\/firebasestorage\.googleapis\.com\/|https:\/\/[a-zA-Z0-9._-]+\.supabase\.(co|in)\/|data:image\/)/.test(r.photo_url)) {
        const img = document.createElement('img');
        img.className = 'rcard-photo';
        img.alt = 'Photo de la route';
        img.loading = 'lazy';
        img.src = r.photo_url;
        img.onerror = () => img.remove();
        card.appendChild(img);
      } else {
        const ph = document.createElement('div');
        ph.className = 'rcard-nophoto';
        ph.style.background = c.col + '10';
        ph.textContent = c.ico;
        card.appendChild(ph);
      }

      const body = document.createElement('div');
      body.className = 'rcard-body';

      // Top row
      const top = document.createElement('div');
      top.className = 'rcard-top';

      const badge = document.createElement('span');
      badge.className = 'cat-badge';
      badge.style.cssText = `color:${c.col};border-color:${c.col}40;background:${c.col}12`;
      badge.textContent = `${c.ico} ${c.fr}`;

      const stars = document.createElement('div');
      stars.innerHTML = starsHTML(r.score, 12); // no user data

      const votes = document.createElement('div');
      votes.className = 'votes-badge';
      votes.textContent = `✓ ${r.votes || 0}`;

      const statusDot = document.createElement('span');
      statusDot.style.cssText = `font-size:11px;color:${st.col}`;
      statusDot.title = st.fr;
      statusDot.textContent = st.dot;

      top.appendChild(badge); top.appendChild(stars);
      top.appendChild(votes); top.appendChild(statusDot);
      body.appendChild(top);

      if (r.comment) {
        const cDiv = document.createElement('div');
        cDiv.className = 'rcard-comment';
        cDiv.textContent = r.comment;           // textContent ✓
        body.appendChild(cDiv);
      }

      const footer = document.createElement('div');
      footer.className = 'rcard-footer';

      const meta = document.createElement('div');
      meta.className = 'rcard-meta';
      meta.textContent = `📍 ${r.wilaya || 'Algérie'} · ${timeAgo(r.createdAt || r.ts)}`;

      const confBtn = document.createElement('button');
      confBtn.type = 'button';
      confBtn.id = 'rc-btn-' + r.id;
      confBtn.className = 'confirm-btn' + (done ? ' done' : '');
      confBtn.textContent = done ? '✓ Confirmé' : '+ Confirmer';
      confBtn.onclick = e => { e.stopPropagation(); window.upvote(r.id, confBtn); };

      footer.appendChild(meta);
      footer.appendChild(confBtn);
      body.appendChild(footer);
      card.appendChild(body);
      pb.appendChild(card);
    });

  } else if (currentTab === 'stats') {
    const n = reports.length;
    const avg = n ? (reports.reduce((a,r) => a+r.score, 0) / n).toFixed(1) : 0;
    const bad = reports.filter(r => r.score <= 2).length;
    const good = reports.filter(r => r.score >= 4).length;
    const totalVotes = reports.reduce((a,r) => a + (r.votes||0), 0);

    pb.innerHTML = `
      <div class="sgrid">
        <div class="scard"><div class="sval">${n}</div><div class="slbl">Signalements</div></div>
        <div class="scard"><div class="sval" style="color:${starCol(Math.round(parseFloat(avg)||3))}">${avg||'—'}</div><div class="slbl">Moy. ★ / 5</div></div>
        <div class="scard"><div class="sval" style="color:#EF4444">${bad}</div><div class="slbl">Critiques (1–2★)</div></div>
        <div class="scard"><div class="sval" style="color:#22C55E">${good}</div><div class="slbl">Bons (4–5★)</div></div>
      </div>
      <div class="scard" style="margin-bottom:14px"><div class="sval">${totalVotes}</div><div class="slbl">Confirmations citoyennes</div></div>
      
      ${(() => {
        const reporters = {};
        reports.forEach(r => {
          if (r.submitter_email) {
            reporters[r.submitter_email] = (reporters[r.submitter_email] || 0) + 1;
          }
        });
        const sortedReporters = Object.entries(reporters).sort((a,b) => b[1] - a[1]);
        const top3 = sortedReporters.slice(0, 3);
        if (!top3.length) return '';
        window._cachedLeaderboard = sortedReporters;
        return `
          <div class="sec-head" style="margin-top:20px; font-size:14px; font-weight:800; color:var(--acc); margin-bottom:12px;">🏆 Champions (Top 3)</div>
          <div class="scard" style="padding: 1px 14px; margin-bottom:14px;">
            ${top3.map((rep, idx) => `
              <div style="display:flex; justify-content:space-between; align-items:center; border-bottom: ${idx < top3.length-1 ? '1px solid var(--bdr)' : 'none'}; padding: 12px 0;">
                <div style="font-size: 13px; font-weight: 600; color: var(--txt); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 70%;">
                  ${idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : '🏅'} ${esc(rep[0])}
                </div>
                <div style="font-size: 12px; font-weight: 700; color: var(--acc); background: rgba(255, 87, 34, 0.15); border: 1px solid var(--acc); padding: 4px 8px; border-radius: 12px;">
                  ${rep[1]} sign.
                </div>
              </div>
            `).join('')}
          </div>
          <button type="button" class="auth-btn" style="width:100%; margin-bottom:20px; padding: 10px; font-size: 12px;" onclick="window.showMyRank()">🏅 Mon rang</button>
        `;
      })()}

      <div class="sec-head">Par catégorie</div>
      ${Object.keys(CATS).map(k => {
        const c = CATS[k], cnt = reports.filter(r => r.category===k).length;
        return `<div class="catrow">
          <div class="catrow-label">${c.ico} ${esc(c.fr)}</div>
          <div class="bar-bg"><div class="bar-fill" style="width:${n?cnt/n*100:0}%;background:${c.col}"></div></div>
          <div class="bar-n">${cnt}</div>
        </div>`;
      }).join('')}
      <div class="sec-head" style="margin-top:18px">Par statut</div>
      ${Object.keys(STATUSES).map(k => {
        const s = STATUSES[k], cnt = reports.filter(r => (r.status||'active')===k).length;
        return `<div class="catrow">
          <div class="catrow-label">${s.dot} ${esc(s.fr)}</div>
          <div class="bar-bg"><div class="bar-fill" style="width:${n?cnt/n*100:0}%;background:${s.col}"></div></div>
          <div class="bar-n">${cnt}</div>
        </div>`;
      }).join('')}
    `;

  } else {
    pb.innerHTML = `
      <div class="sec-head">Couches de la carte</div>
      <div class="tog-row">
        <div class="tog-info"><div class="tl">${I18N[currentLang].trafficLayer}</div><div class="td">${I18N[currentLang].trafficDesc}</div></div>
        <label class="tog"><input type="checkbox" ${showHeat?'checked':''} onchange="window.setLayer('heat',this.checked)"/><span class="tog-s"></span></label>
      </div>
      <div class="tog-row">
        <div class="tog-info"><div class="tl">Marqueurs</div><div class="td">Afficher les pins individuels</div></div>
        <label class="tog"><input type="checkbox" ${showMarkers?'checked':''} onchange="window.setLayer('markers',this.checked)"/><span class="tog-s"></span></label>
      </div>
      <div class="sec-head" style="margin-top:20px">Échelle de notation</div>
      <div style="display:flex;justify-content:space-between;margin-bottom:6px">
        ${[1,2,3,4,5].map(s=>`<div style="text-align:center">
          <div>${starsHTML(s,10)}</div>
          <div style="color:${starCol(s)};font-size:9px;margin-top:3px">${STAR_LABELS[s].fr}</div>
        </div>`).join('')}
      </div>
      <div class="legend-grad"></div>
      <div class="legend-labs"><span>Critique</span><span>Moyen</span><span>Parfait</span></div>
      <div class="oss-box">
        <div class="oss-title">Open Source · مفتوح المصدر</div>
        <div class="oss-txt">Leaflet.js + OpenStreetMap + Supabase.<br/>Exportable en GeoJSON pour QGIS et ArcGIS.</div>
        <button class="export-btn" onclick="window.exportGeoJSON()">↓ Exporter GeoJSON</button>
      </div>
    `;
  }
}

window.setTab = function setTab(name, el) {
  currentTab = name;
  document.querySelectorAll('.ptab').forEach(t => { t?.classList.remove('on'); t.setAttribute('aria-selected','false'); });
  el?.classList.add('on'); el.setAttribute('aria-selected','true');
  renderPanel();
}
window.togglePanel = function togglePanel() { document.getElementById('panel')?.classList.toggle('open'); }

window.showMyRank = function() {
  if (!currentUserEmail) {
    showToast('Veuillez vous connecter pour voir votre rang');
    return;
  }
  const leaderboard = window._cachedLeaderboard || [];
  const idx = leaderboard.findIndex(x => x[0] === currentUserEmail);
  if (idx === -1) {
    showToast("Vous n'avez pas encore de signalements enregistrés", "info");
  } else {
    const rank = idx + 1;
    const score = leaderboard[idx][1];
    showToast(`🏅 Vous êtes classé #${rank} avec ${score} signalement${score>1?'s':''} !`);
  }
}

function updateThemeIcon() {
  const btn = document.getElementById('theme-btn');
  if (btn) btn.textContent = document.documentElement.classList.contains('light') ? '🌙' : '☀️';
}

updateThemeIcon();

window.toggleTheme = function toggleTheme() {
  const isLight = document.documentElement.classList.toggle('light');
  localStorage.setItem('hafra-theme', isLight ? 'light' : 'dark');
  updateThemeIcon();
  if (typeof setMapTiles === 'function') setMapTiles();
}

window.flyTo = function flyTo(lat, lng) { map.flyTo([lat,lng], 15, {duration:1.3}); document.getElementById('panel')?.classList.remove('open'); }
window.setLayer = function setLayer(t, v) { if (t==='heat') showHeat=v; else showMarkers=v; renderMap(); }

// Add Mode & Gps
window.toggleAdd = function toggleAdd() {
  addMode = !addMode;
  const fab = document.getElementById('fab'), hint = document.getElementById('fab-hint');
  if (addMode) {
    fab?.classList.add('active'); fab.textContent = '✕';
    hint?.classList.add('show');
    showToast('Tapez sur la carte pour placer le signalement');
  } else {
    fab?.classList.remove('active'); fab.textContent = '＋';
    hint?.classList.remove('show');
    clearPending();
  }
}

function clearPending() {
  if (pendingMarker) { map.removeLayer(pendingMarker); pendingMarker = null; }
  pendingLat = pendingLng = null;
}

map.on('click', e => {
  if (!addMode) { document.getElementById('panel')?.classList.remove('open'); return; }
  setLocation(e.latlng.lat, e.latlng.lng);
  openModal();
});

let pendingLocationName = null;
let logoClicks = 0;
let logoClickTimer = null;

window.handleLogoClick = function() {
  document.getElementById('panel').classList.add('open');
};

async function getPreciseLocation(lat, lng) {
  try {
    const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=14&addressdetails=1`);
    const data = await res.json();
    if (data && data.address) {
      const a = data.address;
      const place = a.suburb || a.neighbourhood || a.village || a.town || a.city || a.county;
      const state = a.state || nearestWilaya(lat, lng);
      if (place && place !== state) {
        return `${place}, ${state}`;
      }
      return state;
    }
  } catch (err) {
    console.warn("[hafra] Reverse geocoding failed", err);
  }
  return nearestWilaya(lat, lng);
}

function setLocation(lat, lng) {
  pendingLat = lat; pendingLng = lng;
  if (pendingMarker) map.removeLayer(pendingMarker);
  pendingMarker = L.circleMarker([lat, lng], {
    radius:14, color:'#FF5722', fillColor:'#FF5722', fillOpacity:.3, weight:2.5,
  }).addTo(map);
  
  const fallbackWilaya = nearestWilaya(lat, lng);
  document.getElementById('loc-wilaya').textContent = fallbackWilaya;
  pendingLocationName = fallbackWilaya;
  
  getPreciseLocation(lat, lng).then(loc => {
    if (lat === pendingLat && lng === pendingLng) {
      pendingLocationName = loc;
      document.getElementById('loc-wilaya').textContent = loc;
    }
  });

  document.getElementById('loc-coords').textContent = `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
  document.getElementById('loc-dot')?.classList.add('on');
  checkSubmit();
}

window.locateBtnClick = function locateBtnClick() {
  const btn = document.getElementById('btn-locate');
  if (!navigator.geolocation) {
    showToast('GPS non disponible sur cet appareil');
    return;
  }
  btn?.classList.add('locating');
  btn.textContent = '⏳';
  navigator.geolocation.getCurrentPosition(
    pos => {
      const lat = pos.coords.latitude, lng = pos.coords.longitude;
      btn?.classList.remove('locating');
      btn.textContent = '📍';
      startLiveTracking(); // Also start tracking dot
      // Fly to position, enable add mode, pre-fill location, open modal
      map.flyTo([lat, lng], 16, {duration:1.2});
      if (!addMode) {
        addMode = true;
        const fab = document.getElementById('fab');
        fab?.classList.add('active'); fab.textContent = '✕';
        document.getElementById('fab-hint')?.classList.add('show');
      }
      setLocation(lat, lng);
      openModal();
    },
    err => {
      btn?.classList.remove('locating');
      btn.textContent = '📍';
      const msgs = { 1:'Permission GPS refusée', 2:'Position GPS introuvable', 3:'Délai GPS dépassé' };
      showToast(msgs[err.code] || 'Erreur GPS');
    },
    { enableHighAccuracy:true, timeout:15000, maximumAge:0 }
  );
}

window.useMyLocation = function useMyLocation() {
  if (!navigator.geolocation) { showToast('GPS non disponible'); return; }
  const btn = document.getElementById('gps-btn');
  btn.textContent = '📡 Localisation…';
  navigator.geolocation.getCurrentPosition(
    pos => {
      setLocation(pos.coords.latitude, pos.coords.longitude);
      map.flyTo([pos.coords.latitude, pos.coords.longitude], 15, {duration:1});
      btn.textContent = '✅ Position trouvée';
      startLiveTracking();
      setTimeout(() => { btn.textContent = '📍 Ma position'; }, 2500);
    },
    err => {
      btn.textContent = '📍 Ma position';
      const msgs = { 1:'Permission GPS refusée', 2:'Position introuvable', 3:'Délai dépassé' };
      showToast(msgs[err.code] || 'Erreur GPS');
    },
    { enableHighAccuracy:true, timeout:15000, maximumAge:0 }
  );
}

function autoGPS() {
  if (localStorage.getItem('hf_gps_asked')) return;
  localStorage.setItem('hf_gps_asked', '1');
  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(
      pos => {
        map.flyTo([pos.coords.latitude, pos.coords.longitude], 12, {duration:2});
        startLiveTracking();
      },
      () => {},
      { enableHighAccuracy:true, timeout:8000 }
    );
  }
}

// Modal
function openModal() {
  document.getElementById('overlay')?.classList.add('open');
  checkSubmit();
}

window.closeModal = function closeModal() {
  document.getElementById('overlay')?.classList.remove('open');
  selCategory = null; selStars = 0; photoFile = null;
  document.querySelectorAll('.cat-btn').forEach(b => {
    b?.classList.remove('sel');
    b.style.borderColor = ''; b.style.background = '';
    b.setAttribute('aria-pressed','false');
  });
  document.querySelectorAll('.star-btn').forEach(b => b?.classList.remove('on'));
  const sl = document.getElementById('star-label');
  sl.textContent = 'Sélectionnez une note';
  sl?.classList.remove('filled');
  document.getElementById('comment').value = '';
  document.getElementById('char-count').textContent = '0 / 300';
  document.getElementById('char-count').className = 'char-count';
  window.removePhoto({ stopPropagation:()=>{} });
  document.getElementById('loc-dot')?.classList.remove('on');
  clearPending();
  addMode = false;
  document.getElementById('fab')?.classList.remove('active');
  document.getElementById('fab').textContent = '＋';
  document.getElementById('fab-hint')?.classList.remove('show');
  document.getElementById('submit-btn').disabled = true;
  document.getElementById('submit-btn').setAttribute('aria-disabled','true');
  document.getElementById('submit-spin').style.display = 'none';
  document.getElementById('submit-txt').textContent = 'Soumettre le signalement';
}

window.selCat = function selCat(cat, btn) {
  if (!VALID_CATS.has(cat)) return; // reject unknown categories
  selCategory = cat;
  const c = CATS[cat];
  document.querySelectorAll('.cat-btn').forEach(b => {
    b?.classList.remove('sel');
    b.style.borderColor = ''; b.style.background = '';
    b.setAttribute('aria-pressed','false');
  });
  btn?.classList.add('sel');
  btn.style.borderColor = c.col; btn.style.background = c.col + '18';
  btn.setAttribute('aria-pressed','true');
  checkSubmit();
}

window.setStar = function setStar(v) {
  if (v < 1 || v > 5) return;
  selStars = v;
  document.querySelectorAll('.star-btn').forEach((b, i) => b?.classList.toggle('on', i < v));
  const sl = document.getElementById('star-label');
  sl.textContent = `${STAR_LABELS[v].fr} — ${STAR_LABELS[v].ar}`;
  sl?.classList.add('filled');
  checkSubmit();
}

function checkSubmit() {
  const ok = !!(selCategory && selStars && pendingLat !== null);
  document.getElementById('submit-btn').disabled = !ok;
  document.getElementById('submit-btn').setAttribute('aria-disabled', ok ? 'false' : 'true');
}

window.updateCharCount = function updateCharCount(el) {
  const len = el.value.length;
  const cc = document.getElementById('char-count');
  cc.textContent = `${len} / 300`;
  cc.className = 'char-count' + (len > 280 ? ' over' : len > 240 ? ' warn' : '');
}

// Photo Handling
window.onPhoto = function onPhoto(input) {
  const f = input.files[0];
  if (!f) return;

  // Validate MIME type
  if (!ALLOWED_MIME.has(f.type)) {
    showToast('Format non supporté — utilisez JPG, PNG ou WebP');
    input.value = '';
    return;
  }
  // Validate size
  if (f.size > MAX_FILE_BYTES) {
    showToast(`Image trop grande — max ${MAX_FILE_MB} Mo`);
    input.value = '';
    return;
  }

  const reader = new FileReader();
  reader.onload = e => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const MAX_WIDTH = 640;
      const MAX_HEIGHT = 640;
      let width = img.width;
      let height = img.height;

      if (width > height) {
        if (width > MAX_WIDTH) {
          height *= MAX_WIDTH / width;
          width = MAX_WIDTH;
        }
      } else {
        if (height > MAX_HEIGHT) {
          width *= MAX_HEIGHT / height;
          height = MAX_HEIGHT;
        }
      }

      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, width, height);

      // Compress photo with 0.4 quality initial target
      let quality = 0.4;
      photoFile = canvas.toDataURL('image/jpeg', quality);

      // Base64 size check: if string length is > 100,000 chars (approx. 75 KB)
      // dynamically scale down to 0.2 quality to guarantee a very small payload.
      if (photoFile.length > 100000) {
        quality = 0.2;
        photoFile = canvas.toDataURL('image/jpeg', quality);
        console.log(`[hafra] Image compressed to ${Math.round(photoFile.length / 1024)} KB at quality ${quality}`);
      } else {
        console.log(`[hafra] Image compressed to ${Math.round(photoFile.length / 1024)} KB at quality ${quality}`);
      }

      const prev = document.getElementById('photo-prev');
      prev.src = photoFile;
      prev.style.display = 'block';
      document.getElementById('photo-inner').style.display = 'none';
      document.getElementById('photo-rm').style.display = 'flex';
      document.getElementById('photo-zone').style.border = '2px solid var(--acc)';
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(f);
}

window.removePhoto = function removePhoto(e) {
  e.stopPropagation();
  photoFile = null;
  const prev = document.getElementById('photo-prev');
  prev.src = ''; prev.style.display = 'none';
  document.getElementById('photo-inner').style.display = 'flex';
  document.getElementById('photo-rm').style.display = 'none';
  document.getElementById('photo-zone').style.border = '2px dashed var(--bdr2)';
  document.getElementById('photo-input').value = '';
  document.getElementById('upload-progress').style.width = '0%';
}

// Submit
window.submitReport = async function submitReport() {
  // Client-side gate checks
  if (!selCategory || !selStars || pendingLat === null) return;
  if (!VALID_CATS.has(selCategory)) { showToast('Catégorie invalide'); return; }
  if (selStars < 1 || selStars > 5) { showToast('Note invalide'); return; }
  if (!validAlgeriaCoords(pendingLat, pendingLng)) {
    showToast('Position hors du territoire algérien');
    return;
  }
  if (!RateLimiter.check()) {
    showToast('Trop de signalements — réessayez dans 10 minutes');
    return;
  }

  const btn = document.getElementById('submit-btn');
  const spin = document.getElementById('submit-spin');
  const txtEl = document.getElementById('submit-txt');
  btn.disabled = true;
  spin.style.display = 'block';
  txtEl.textContent = 'Envoi en cours…';

  let photo_url = '';
  if (photoFile) {
    photo_url = photoFile;
  }

  const rawComment = document.getElementById('comment').value;
  const payload = {
    lat:       parseFloat(pendingLat.toFixed(6)),
    lng:       parseFloat(pendingLng.toFixed(6)),
    score:     selStars,
    category:  selCategory,
    comment:   sanitiseComment(rawComment) || '',
    photo_url: photo_url || '',
    submitter_email: currentUserEmail || '',
    wilaya:    pendingLocationName || nearestWilaya(pendingLat, pendingLng),
    votes:     0,
    status: 'active',
    createdAt: new Date().toISOString()
  };

  try {
    const docRef = await addDoc(collection(db, 'reports'), payload);
    
    const data = { id: docRef.id, ...payload, createdAt: new Date().toISOString() };
    RateLimiter.record(); 
    if (!reports.some(x => x.id === data.id)) {
      reports.unshift(data);
    }
    closeModal(); renderMap(); updateStats(); renderPanel();
    map.flyTo([data.lat, data.lng], 15, {duration:1});
    const c = CATS[data.category] || CATS.pothole;
    showToast(`Signalement envoyé — ${c.ico} ${data.wilaya}`);
  } catch (err) {
    btn.disabled = false;
    btn.setAttribute('aria-disabled', 'false');
    spin.style.display = 'none';
    txtEl.textContent = 'Soumettre le signalement';

    try {
      handleFirestoreError(err, OperationType.CREATE, 'reports');
    } catch(handledErr) {
       let errorObj;
       try { errorObj = JSON.parse(handledErr.message); } catch(parseErr){}
       if (errorObj && errorObj.error && errorObj.error.includes("permission")) {
          showToast("عذراً، مرفوض: تأكد من الصلاحيات", true); // Refused by rules
       } else {
          showToast("Erreur serveur", true);
       }
    }
  }
}

// Export
window.exportGeoJSON = function exportGeoJSON() {
  const geo = {
    type:'FeatureCollection', name:'hafra-dz',
    generated: new Date().toISOString(),
    features: reports.map(r => ({
      type:'Feature',
      geometry:{ type:'Point', coordinates:[r.lng, r.lat] },
      properties:{
        id:r.id, score:r.score,
        category:r.category, category_fr:(CATS[r.category]||CATS.pothole).fr,
        wilaya:r.wilaya, comment:r.comment,
        votes:r.votes||0, status:r.status||'active',
        photo_url:r.photo_url||null, timestamp:r.createdAt||null,
      },
    })),
  };
  const blob = new Blob([JSON.stringify(geo, null, 2)], {type:'application/json'});
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `hafra-dz-${new Date().toISOString().slice(0,10)}.geojson`;
  a.style.display = 'none';
  // Must be in the DOM for Safari to trigger the download
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 10000);
  showToast('GeoJSON exporté');
}

// Demo Data
function getDemoData() {
  const now = Date.now();
  return [
    {id:'d1',lat:36.737,lng:3.086,score:1,category:'pothole',comment:'Route nationale très dégradée après les pluies',createdAt:new Date(now-7200000).toISOString(),wilaya:'Alger',votes:47,status:'active',photo_url:null},
    {id:'d2',lat:36.365,lng:6.614,score:4,category:'cracks',comment:'Quelques fissures mineures mais praticable',createdAt:new Date(now-86400000).toISOString(),wilaya:'Constantine',votes:12,status:'active',photo_url:null},
    {id:'d3',lat:35.697,lng:-0.627,score:2,category:'pothole',comment:'Nids-de-poule dangereux sur 200m',createdAt:new Date(now-18000000).toISOString(),wilaya:'Oran',votes:33,status:'reported',photo_url:null},
    {id:'d4',lat:36.190,lng:5.412,score:1,category:'flooding',comment:'Zone inondée à chaque pluie, chaussée effondrée',createdAt:new Date(now-172800000).toISOString(),wilaya:'Sétif',votes:28,status:'active',photo_url:null},
    {id:'d5',lat:36.470,lng:2.813,score:3,category:'signage',comment:'Panneaux de signalisation manquants sur l\'échangeur',createdAt:new Date(now-259200000).toISOString(),wilaya:'Blida',votes:9,status:'active',photo_url:null},
    {id:'d6',lat:35.370,lng:1.322,score:1,category:'utility',comment:'Fuite ADE depuis 3 mois, route complètement détruite',createdAt:new Date(now-28800000).toISOString(),wilaya:'Tiaret',votes:56,status:'reported',photo_url:null},
    {id:'d7',lat:36.901,lng:7.757,score:5,category:'cracks',comment:'Route parfaitement entretenue',createdAt:new Date(now-432000000).toISOString(),wilaya:'Annaba',votes:5,status:'fixed',photo_url:null},
    {id:'d8',lat:36.753,lng:4.053,score:2,category:'lighting',comment:'Aucun éclairage public sur 2km, très dangereux la nuit',createdAt:new Date(now-129600000).toISOString(),wilaya:'Tizi Ouzou',votes:21,status:'active',photo_url:null},
    {id:'d9',lat:34.850,lng:5.728,score:1,category:'pothole',comment:'Impraticable après les inondations de novembre',createdAt:new Date(now-10800000).toISOString(),wilaya:'Biskra',votes:39,status:'active',photo_url:null},
    {id:'d10',lat:36.588,lng:2.447,score:2,category:'utility',comment:'SEAAL a cassé la route il y a 6 mois, jamais réparée',createdAt:new Date(now-518400000).toISOString(),wilaya:'Tipaza',votes:44,status:'reported',photo_url:null},
    {id:'d11',lat:36.762,lng:3.477,score:2,category:'flooding',comment:'Sous-terrain inondé à chaque pluie',createdAt:new Date(now-43200000).toISOString(),wilaya:'Boumerdès',votes:29,status:'active',photo_url:null},
    {id:'d12',lat:36.264,lng:2.749,score:3,category:'cracks',comment:'Fissures longitudinales, réparation urgente',createdAt:new Date(now-345600000).toISOString(),wilaya:'Médéa',votes:14,status:'active',photo_url:null},
  ];
}

// Notification System
const WATCH_KEY  = 'hf_watched';
const NOTIF_KEY  = 'hf_notif_asked';

// Load watched report IDs from localStorage
let watchedIds = new Set();
try { watchedIds = new Set(JSON.parse(localStorage.getItem(WATCH_KEY) || '[]')); } catch {}

function saveWatched() {
  try { localStorage.setItem(WATCH_KEY, JSON.stringify([...watchedIds])); } catch {}
}

/** Called when user taps 🔕 Me notifier on a popup */
window.toggleWatch = async function toggleWatch(id, btn) {
  if (watchedIds.has(id)) {
    // Already watching — unwatch
    watchedIds.delete(id);
    saveWatched();
    btn.textContent = '🔕 Me notifier';
    btn?.classList.remove('watching');
    showToast('Suivi désactivé');
    return;
  }

  // Request permission first if not granted
  const granted = await requestNotifPermission();
  if (!granted) return;

  watchedIds.add(id);
  saveWatched();
  btn.textContent = '🔔 Suivi';
  btn?.classList.add('watching');
  showToast('Vous serez notifié quand cette route sera réparée 🔔');
}

/** Ask permission with our custom banner first, then native prompt */
async function requestNotifPermission() {
  if (!('Notification' in window)) {
    showToast('Les notifications ne sont pas supportées sur ce navigateur');
    return false;
  }
  if (Notification.permission === 'granted') return true;
  if (Notification.permission === 'denied') {
    showToast('Notifications bloquées — activez-les dans les paramètres du navigateur');
    return false;
  }

  // Show our custom banner first
  showNotifBanner();

  // Wait for user to tap "Activer" on the banner
  return new Promise(resolve => { _notifResolve = resolve; });
}

let _notifResolve = null;

window.notifBannerAccept = async function notifBannerAccept() {
  hideNotifBanner();
  localStorage.setItem(NOTIF_KEY, 'asked');
  const result = await Notification.requestPermission();
  if (_notifResolve) {
    _notifResolve(result === 'granted');
    _notifResolve = null;
  }
  if (result === 'granted') {
    showToast('Notifications activées ✓');
  } else {
    showToast('Permission refusée');
  }
}

window.notifBannerDismiss = function notifBannerDismiss() {
  hideNotifBanner();
  localStorage.setItem(NOTIF_KEY, 'dismissed');
  if (_notifResolve) { _notifResolve(false); _notifResolve = null; }
}

function showNotifBanner() {
  document.getElementById('notif-banner')?.classList.add('show');
}
function hideNotifBanner() {
  document.getElementById('notif-banner')?.classList.remove('show');
}

/** Fire a browser notification when a watched report is fixed */
function notifyIfWatching(r) {
  if (!watchedIds.has(r.id)) return;
  if (Notification.permission !== 'granted') return;

  const c = CATS[r.category] || CATS.pothole;
  const notif = new Notification('Route réparée ! 🟢', {
    body: `${c.ico} ${c.fr} — ${r.wilaya || 'Algérie'}\nLe signalement que vous suivez a été marqué comme réparé.`,
    tag: 'hafra-fixed-' + r.id,   // prevents duplicate notifications
    renotify: false,
    vibrate: [200, 100, 200],
  });

  notif.onclick = () => {
    window.focus();
    if (r.lat && r.lng) map.flyTo([r.lat, r.lng], 15, { duration: 1.2 });
    notif.close();
  };

  // Also remove from watched since it's fixed
  watchedIds.delete(r.id);
  saveWatched();

  // In-app toast as well
  showToast(`🟢 Route réparée — ${r.wilaya || ''} ${c.ico}`);
}

/** Auto-check if any of our watched reports are already fixed (e.g. after reload) */
function checkWatchedOnLoad() {
  if (!watchedIds.size) return;
  if (Notification.permission !== 'granted') return;
  reports.forEach(r => {
    if (r.status === 'fixed' && watchedIds.has(r.id)) {
      notifyIfWatching(r);
    }
  });
}

// Service Worker
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js')
      .catch(e => console.warn('[hafra] SW registration failed:', e));
  });
}

// Pwa Install Prompt
let _pwaPrompt = null;
const PWA_DISMISSED_KEY = 'hf_pwa_dismissed';
const PWA_INSTALLED_KEY = 'hf_pwa_installed';

// Catch Chrome/Android install event before it fires
window.addEventListener('beforeinstallprompt', e => {
  e.preventDefault();
  _pwaPrompt = e;

  // Don't show if user dismissed or already installed
  if (localStorage.getItem(PWA_DISMISSED_KEY)) return;
  if (localStorage.getItem(PWA_INSTALLED_KEY)) return;

  // Wait 8 seconds so the map loads first — not intrusive
  setTimeout(() => showPwaBanner(), 8000);
});

// Detect successful install
window.addEventListener('appinstalled', () => {
  localStorage.setItem(PWA_INSTALLED_KEY, '1');
  hidePwaBanner();
  showToast('حفرة installée sur votre écran d\'accueil ✓');
});

function showPwaBanner() {
  // Already running as installed PWA — don't show
  if (window.matchMedia('(display-mode: standalone)').matches) return;
  if (window.navigator.standalone === true) return; // iOS standalone
  document.getElementById('pwa-banner')?.classList.add('show');
}

function hidePwaBanner() {
  document.getElementById('pwa-banner')?.classList.remove('show');
}

window.pwaInstall = async function pwaInstall() {
  if (!_pwaPrompt) return;
  hidePwaBanner();
  _pwaPrompt.prompt();
  const { outcome } = await _pwaPrompt.userChoice;
  _pwaPrompt = null;
  if (outcome === 'accepted') {
    localStorage.setItem(PWA_INSTALLED_KEY, '1');
  } else {
    localStorage.setItem(PWA_DISMISSED_KEY, '1');
  }
}

window.pwaDismiss = function pwaDismiss() {
  hidePwaBanner();
  localStorage.setItem(PWA_DISMISSED_KEY, '1');
}

// iOS: Safari doesn't support beforeinstallprompt — show manual tip instead
function checkIOSInstall() {
  const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const isSafari = /safari/i.test(navigator.userAgent) && !/chrome/i.test(navigator.userAgent);
  const isStandalone = window.navigator.standalone === true;
  const dismissed = localStorage.getItem(PWA_DISMISSED_KEY);
  const installed = localStorage.getItem(PWA_INSTALLED_KEY);

  if (isIOS && isSafari && !isStandalone && !dismissed && !installed) {
    setTimeout(() => {
      document.getElementById('ios-tip')?.classList.add('show');
    }, 12000); // Show after 12s on iOS
  }
}

window.iosTipClose = function iosTipClose() {
  document.getElementById('ios-tip')?.classList.remove('show');
  localStorage.setItem(PWA_DISMISSED_KEY, '1');
}

// Init
// Safety net — if anything hangs, force-hide loader after 8 seconds
setTimeout(() => hideLoader(), 8000);

loadReports().then(() => checkWatchedOnLoad());
setTimeout(autoGPS, 1500);
checkIOSInstall();

// Automatically start tracking if we already have permission
if (navigator.permissions && navigator.geolocation) {
  navigator.permissions.query({name: 'geolocation'}).then(res => {
    if (res.state === 'granted') {
      startLiveTracking();
    }
  }).catch(() => {});
}

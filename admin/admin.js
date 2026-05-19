// BraapTrax Admin — shared Firebase init, auth gate, nav, and utilities.
// Firebase v10 modular SDK, loaded as ES modules straight from gstatic.
import { firebaseConfig } from "./firebase-config.js";
import { initializeApp, getApps } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getFirestore,
  doc,
  getDoc,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import {
  getStorage,
  ref as storageRef,
  uploadBytes,
  getDownloadURL,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js";

// ---- Singletons -----------------------------------------------------------
export const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);

// Re-export the SDK pieces pages need so each page imports from one place.
export * from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
export {
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
export {
  ref as storageRef,
  uploadBytes,
  getDownloadURL,
  listAll,
  deleteObject,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js";

// ---- Routing constants ----------------------------------------------------
const ADMIN_BASE = "/admin/";
const LOGIN_PAGE = ADMIN_BASE + "index.html";

export const NAV_ITEMS = [
  { key: "my-rides", label: "My Rides", href: ADMIN_BASE + "my-rides.html" },
  { key: "review-rides", label: "Review Rides", href: ADMIN_BASE + "review-rides.html" },
  { key: "import", label: "Import", href: ADMIN_BASE + "import.html" },
  { key: "draw", label: "Draw", href: ADMIN_BASE + "manual.html" },
  { key: "trails", label: "Trails", href: ADMIN_BASE + "trails.html" },
  { key: "data-sources", label: "Data Sources", href: ADMIN_BASE + "data-sources.html" },
];

// ---- Formatting helpers ---------------------------------------------------
const METERS_PER_MILE = 1609.344;
const FEET_PER_METER = 3.28084;

export function metersToMiles(m) {
  return (Number(m) || 0) / METERS_PER_MILE;
}
export function metersToFeet(m) {
  return (Number(m) || 0) * FEET_PER_METER;
}
export function milesToMeters(mi) {
  return (Number(mi) || 0) * METERS_PER_MILE;
}
export function feetToMeters(ft) {
  return (Number(ft) || 0) / FEET_PER_METER;
}

// Accepts a Firestore Timestamp, JS Date, epoch millis, or ISO string.
export function toDate(v) {
  if (!v) return null;
  if (typeof v.toDate === "function") return v.toDate();
  if (v instanceof Date) return v;
  if (typeof v === "number") return new Date(v);
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d;
}

export function formatDate(v) {
  const d = toDate(v);
  if (!d) return "—";
  return d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function toMillis(v) {
  const d = toDate(v);
  return d ? d.getTime() : 0;
}

// Ride speeds/durations are stored SI (m/s, seconds).
export function mpsToMph(v) {
  return (Number(v) || 0) * 2.2369362920544;
}
export function formatDuration(seconds) {
  const s = Math.max(0, Math.round(Number(seconds) || 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${m}:${pad(sec)}`;
}

// In-memory user-doc cache so review lists don't refetch the same rider
// across rows. Resolves to the user data object (or null). Never throws.
const _userCache = new Map();
export async function getUserDoc(uid) {
  if (!uid) return null;
  if (_userCache.has(uid)) return _userCache.get(uid);
  let data = null;
  try {
    const snap = await getDoc(doc(db, "users", uid));
    data = snap.exists() ? snap.data() : null;
  } catch (e) {
    console.warn("[users] fetch failed for", uid, e.message || e);
  }
  _userCache.set(uid, data);
  return data;
}

// Best-effort display name / avatar from a user doc (field names vary).
export function userDisplayName(u, fallback = "Unknown rider") {
  if (!u) return fallback;
  return (
    u.username || u.displayName || u.name || u.handle || fallback
  );
}
export function userAvatarRaw(u) {
  if (!u) return "";
  return (
    u.photoURL || u.avatarURL || u.profileImageURL || u.photo || u.avatar || ""
  );
}

// Must stay byte-identical to the iOS RideType enum raw values — the app
// Swift-casts on these exact strings. Do not localize, reorder for meaning,
// or add values the app doesn't know.
export const RIDE_TYPES = [
  "trail",
  "motocross",
  "desert",
  "street",
  "raceTrack",
  "offroadTrail",
  "snowmobile",
];

const RIDE_TYPE_ICONS = {
  trail: "🌲",
  motocross: "🏁",
  desert: "🏜️",
  street: "🛣️",
  raceTrack: "🏎️",
  offroadTrail: "⛰️",
  snowmobile: "❄️",
};

// Raw values are case-sensitive (e.g. "raceTrack"); match exactly first,
// then fall back to a lowercased lookup for forgiving display only.
export function rideTypeIcon(t) {
  const key = String(t == null ? "" : t);
  return RIDE_TYPE_ICONS[key] || RIDE_TYPE_ICONS[key.toLowerCase()] || "🏍️";
}

export function escapeHtml(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[c]));
}

// ---- Encoded polyline decode (Google algorithm, default precision 1e5) ----
export function decodePolyline(str, precision = 5) {
  if (!str || typeof str !== "string") return [];
  const factor = Math.pow(10, precision);
  let index = 0;
  let lat = 0;
  let lng = 0;
  const coords = [];
  while (index < str.length) {
    let result = 1;
    let shift = 0;
    let b;
    do {
      b = str.charCodeAt(index++) - 63 - 1;
      result += b << shift;
      shift += 5;
    } while (b >= 0x1f);
    lat += result & 1 ? ~(result >> 1) : result >> 1;

    result = 1;
    shift = 0;
    do {
      b = str.charCodeAt(index++) - 63 - 1;
      result += b << shift;
      shift += 5;
    } while (b >= 0x1f);
    lng += result & 1 ? ~(result >> 1) : result >> 1;

    coords.push([lat / factor, lng / factor]);
  }
  return coords;
}

// Encode [[lat,lng],...] with the standard Google Encoded Polyline
// Algorithm at the given precision (default 5 / 1e5). Round-trips exactly
// with decodePolyline above and with the iOS PolylineEncoder. Used only for
// manually-drawn routes; ride/edit polylines are passed through verbatim.
export function encodePolyline(coords, precision = 5) {
  const factor = Math.pow(10, precision);
  const encodeSigned = (v) => {
    let sgn = v < 0 ? ~(v << 1) : v << 1;
    let out = "";
    while (sgn >= 0x20) {
      out += String.fromCharCode((0x20 | (sgn & 0x1f)) + 63);
      sgn >>= 5;
    }
    out += String.fromCharCode(sgn + 63);
    return out;
  };
  let prevLat = 0;
  let prevLng = 0;
  let result = "";
  for (const [lat, lng] of coords || []) {
    const late = Math.round(lat * factor);
    const lnge = Math.round(lng * factor);
    result += encodeSigned(late - prevLat);
    result += encodeSigned(lnge - prevLng);
    prevLat = late;
    prevLng = lnge;
  }
  return result;
}

// Great-circle distance, meters.
export function haversineMeters(a, b) {
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(b[0] - a[0]);
  const dLng = toRad(b[1] - a[1]);
  const la1 = toRad(a[0]);
  const la2 = toRad(b[0]);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export function routeDistanceMeters(coords) {
  let d = 0;
  for (let i = 1; i < (coords || []).length; i++) {
    d += haversineMeters(coords[i - 1], coords[i]);
  }
  return d;
}

// Sum of positive elevation deltas after a centered N-point moving-average
// smoothing pass (default 3) to suppress GPS/barometer noise. Used for
// GPX/KML imports that carry per-point elevation.
export function elevationGainMeters(eles, windowSize = 3) {
  const xs = (eles || []).filter((e) => typeof e === "number" && isFinite(e));
  if (xs.length < 2) return 0;
  const half = Math.max(0, Math.floor(windowSize / 2));
  const smoothed = xs.map((_, i) => {
    let sum = 0;
    let n = 0;
    for (let j = i - half; j <= i + half; j++) {
      if (j >= 0 && j < xs.length) {
        sum += xs[j];
        n++;
      }
    }
    return sum / n;
  });
  let gain = 0;
  for (let i = 1; i < smoothed.length; i++) {
    const delta = smoothed[i] - smoothed[i - 1];
    if (delta > 0) gain += delta;
  }
  return gain;
}

// Resample a [[lat,lng],...] path to ~uniform spacing (linear interpolation
// between vertices), so DEM elevation sampling is consistent and bounded.
// Always keeps the first and last point. Caps the count (raises the step if
// the path is long) to bound how many elevation lookups we make.
export function resampleByDistanceMeters(latlngs, stepMeters = 60, maxPoints = 384) {
  if (!latlngs || latlngs.length < 2) return (latlngs || []).slice();
  const seg = [];
  let total = 0;
  for (let i = 1; i < latlngs.length; i++) {
    const d = haversineMeters(latlngs[i - 1], latlngs[i]);
    seg.push(d);
    total += d;
  }
  let step = stepMeters;
  if (total / step > maxPoints) step = total / maxPoints;
  const out = [latlngs[0]];
  let acc = 0;
  let nextAt = step;
  for (let i = 1; i < latlngs.length; i++) {
    const a = latlngs[i - 1];
    const b = latlngs[i];
    const d = seg[i - 1];
    while (d > 0 && acc + d >= nextAt) {
      const t = (nextAt - acc) / d;
      out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
      nextAt += step;
    }
    acc += d;
  }
  const last = latlngs[latlngs.length - 1];
  const lp = out[out.length - 1];
  if (lp[0] !== last[0] || lp[1] !== last[1]) out.push(last);
  return out;
}

const _sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Process-wide throttle so concurrent/rapid elevation lookups (batch
// import, overlapping auto-runs) can't burst the free Open-Meteo tier.
// Serializes every call with a minimum gap.
let _omChain = Promise.resolve();
const _OM_MIN_GAP_MS = 450;
function _omThrottle() {
  const p = _omChain.then(() => _sleep(_OM_MIN_GAP_MS));
  _omChain = p.catch(() => {});
  return p;
}

// Fetch with retry/backoff: 429 (rate limited) and 5xx are retried,
// honoring Retry-After when present, with exponential fallback.
async function _omFetch(url, opts, attempts = 5) {
  let delay = 1200;
  for (let i = 0; i < attempts; i++) {
    await _omThrottle();
    let res;
    try {
      res = await fetch(url, { signal: opts.signal });
    } catch (e) {
      if (i === attempts - 1) throw e;
      await _sleep(delay);
      delay = Math.min(delay * 2, 10000);
      continue;
    }
    if (res.status === 429 || res.status >= 500) {
      if (i === attempts - 1) {
        throw new Error(`Elevation service HTTP ${res.status}`);
      }
      const ra = parseInt(res.headers.get("retry-after") || "", 10);
      await _sleep(ra > 0 ? ra * 1000 : delay);
      delay = Math.min(delay * 2, 10000);
      continue;
    }
    return res;
  }
}

// Look up ground elevation (meters) for [[lat,lng],...] via the free,
// key-less, CORS-enabled Open-Meteo Elevation API (Copernicus DEM, ~90 m).
// Batched at 100 coords/request as the API requires; throttled + retried.
export async function fetchElevationsMeters(points, opts = {}) {
  const chunk = opts.chunk || 100;
  const out = [];
  for (let i = 0; i < points.length; i += chunk) {
    const part = points.slice(i, i + chunk);
    const lat = part.map((p) => p[0].toFixed(6)).join(",");
    const lng = part.map((p) => p[1].toFixed(6)).join(",");
    const res = await _omFetch(
      `https://api.open-meteo.com/v1/elevation?latitude=${lat}&longitude=${lng}`,
      opts
    );
    const j = await res.json();
    if (!j || !Array.isArray(j.elevation)) {
      throw new Error("Elevation service returned no data");
    }
    j.elevation.forEach((e) => out.push(e));
  }
  return out;
}

// Estimate total climb (meters) for a 2D path by sampling the terrain DEM.
// It's an estimate from ~90 m data — not barometric truth, but consistent
// and good enough for trail metadata when the file has no elevation.
// Default sampling kept at <=100 points so each track is a single request
// (keeps us well under the elevation API's rate limit).
export async function estimateElevationGainMeters(latlngs, opts = {}) {
  const sampled = resampleByDistanceMeters(
    latlngs,
    opts.stepMeters || 60,
    opts.maxPoints || 100
  );
  if (sampled.length < 2) return 0;
  const eles = await fetchElevationsMeters(sampled, opts);
  return elevationGainMeters(eles, opts.windowSize || 3);
}

// Reverse-geocode a point into a "Place, ST" region string via
// BigDataCloud's key-less, CORS-enabled client endpoint (designed for
// browser use). Picks city -> locality -> nearest admin area, plus the
// 2-letter state/subdivision. Returns "" if nothing usable. Best fed the
// route midpoint, which is more representative than a trailhead.
export async function reverseRegion(lat, lng, opts = {}) {
  const res = await fetch(
    `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat.toFixed(
      5
    )}&longitude=${lng.toFixed(5)}&localityLanguage=en`,
    { signal: opts.signal }
  );
  if (!res.ok) throw new Error(`Geocoder HTTP ${res.status}`);
  const j = await res.json();
  const admins = (j.localityInfo && j.localityInfo.administrative) || [];
  const place =
    j.city ||
    j.locality ||
    (admins.length ? admins[admins.length - 1].name : "") ||
    j.principalSubdivision ||
    "";
  let st = "";
  if (j.principalSubdivisionCode && j.principalSubdivisionCode.includes("-")) {
    st = j.principalSubdivisionCode.split("-").pop();
  } else if (j.principalSubdivision) {
    st = j.principalSubdivision;
  }
  return [place, st].filter(Boolean).join(", ").trim();
}

// Midpoint (by index) of a [[lat,lng],...] path — a decent single sample
// for "where is this trail" reverse geocoding.
export function pathMidpoint(latlngs) {
  if (!latlngs || !latlngs.length) return null;
  return latlngs[Math.floor(latlngs.length / 2)];
}

// Riders often prefix ride/trail names with the date they rode
// ("5/9/26 Rock n Roll Trail"). When we promote a ride into a trail
// the date is noise — the trail isn't dated. Strip a single leading
// date-like token plus trailing punctuation. Conservative: only
// matches recognizable date shapes so names like "5 Mile Loop" or
// "Highway 191" are left alone.
const _LEADING_DATE_RE = new RegExp(
  "^\\s*(?:" +
    // 5/9/26, 05-09-2026, 2026.05.09 etc.
    "\\d{1,4}[\\-/.]\\d{1,2}[\\-/.]\\d{1,4}" +
    // 5/9 (no year)
    "|\\d{1,2}[\\-/.]\\d{1,2}" +
    // May 9, May 9 2026, Sept. 21, 2026
    "|(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)\\.?\\s+\\d{1,2}(?:[,]?\\s*\\d{2,4})?" +
  ")\\s*[-—:·]?\\s*",
  "i"
);
export function stripLeadingDate(name) {
  const s = String(name == null ? "" : name);
  const cleaned = s.replace(_LEADING_DATE_RE, "").trim();
  // Don't strip if it would leave us with nothing meaningful.
  return cleaned.length >= 2 ? cleaned : s.trim();
}

// Lightweight search-index projection of a trail. Stored in the separate
// `trailIndex` collection (same doc id) so the Trails page can list/search
// without ever downloading polylines. NEVER include the polyline here.
export const TRAIL_INDEX_COLLECTION = "trailIndex";
export function buildTrailIndex(t) {
  return {
    name: t.name || "",
    region: t.region || "",
    difficulty: t.difficulty || "",
    rideType: t.rideType || "",
    source: t.source || "",
    isActive: t.isActive !== false,
    distanceMeters: Number(t.distanceMeters) || 0,
    elevationGainMeters: Number(t.elevationGainMeters) || 0,
    updatedAt: serverTimestamp(),
  };
}

// ---- Client-side image compression ---------------------------------------
// Resize so the longest side is <= maxDim, re-encode as JPEG at `quality`.
// Resolves with a Blob. The caller is responsible for the >5MB rejection so
// it can surface a per-file error message.
export function compressImage(file, maxDim = 1920, quality = 0.75) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      let { width, height } = img;
      if (Math.max(width, height) > maxDim) {
        const scale = maxDim / Math.max(width, height);
        width = Math.round(width * scale);
        height = Math.round(height * scale);
      }
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0, width, height);
      canvas.toBlob(
        (blob) => {
          if (!blob) {
            reject(new Error("Image encoding failed"));
            return;
          }
          resolve(blob);
        },
        "image/jpeg",
        quality
      );
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Could not read image: " + (file.name || "")));
    };
    img.src = url;
  });
}

export const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
export const MAX_PHOTOS = 10;

// Uploads one JPEG and returns the Storage OBJECT PATH (NOT a download URL).
// iOS stores/loads verified-trail photos by Storage path, matching how ride
// photos are stored elsewhere in the app; persisting an https URL here would
// break the iOS image loader. {fileName} must be a single path segment
// (Storage rules only expose verified_trails/{trailId}/{fileName}).
export async function uploadTrailPhoto(trailId, fileName, blob) {
  const path = `verified_trails/${trailId}/${fileName}`;
  await uploadBytes(storageRef(storage, path), blob, {
    contentType: "image/jpeg",
  });
  return path;
}

// Resolve a stored photoURLs entry to something an <img> can render.
// New-style entries are Storage paths; tolerate legacy absolute URLs too.
export async function resolvePhotoDisplayURL(stored) {
  if (!stored) return "";
  if (/^https?:\/\//i.test(stored)) return stored;
  return await getDownloadURL(storageRef(storage, stored));
}

// ---- Toast ----------------------------------------------------------------
// Cross-page toast: stash a message in sessionStorage before redirecting,
// the destination page calls flushPendingToast() on load.
export function showToast(message, type = "success") {
  let el = document.getElementById("bt-toast");
  if (!el) {
    el = document.createElement("div");
    el.id = "bt-toast";
    document.body.appendChild(el);
  }
  el.textContent = message;
  el.className = "bt-toast " + (type === "error" ? "bt-toast--error" : "bt-toast--success");
  // restart the show animation
  el.classList.remove("bt-toast--visible");
  void el.offsetWidth;
  el.classList.add("bt-toast--visible");
  clearTimeout(el._t);
  el._t = setTimeout(() => el.classList.remove("bt-toast--visible"), 4000);
}

export function queueToast(message, type = "success") {
  try {
    sessionStorage.setItem("bt_toast", JSON.stringify({ message, type }));
  } catch (_) {}
}

export function flushPendingToast() {
  try {
    const raw = sessionStorage.getItem("bt_toast");
    if (!raw) return;
    sessionStorage.removeItem("bt_toast");
    const { message, type } = JSON.parse(raw);
    showToast(message, type);
  } catch (_) {}
}

// ---- Top navigation -------------------------------------------------------
function injectNav(activeKey) {
  if (document.querySelector(".bt-nav")) return;
  const nav = document.createElement("nav");
  nav.className = "bt-nav";

  const links = NAV_ITEMS.map((item) => {
    const isActive = item.key === activeKey;
    return `<a class="bt-nav-link${isActive ? " bt-nav-link--active" : ""}" href="${item.href}">${item.label}</a>`;
  }).join("");

  nav.innerHTML = `
    <a class="bt-nav-logo" href="${NAV_ITEMS[0].href}">BRAAPTRAX <span>ADMIN</span></a>
    <div class="bt-nav-links">
      ${links}
      <button type="button" class="bt-nav-link bt-nav-signout" id="bt-signout">Sign Out</button>
    </div>`;
  document.body.prepend(nav);
  document.getElementById("bt-signout").addEventListener("click", async () => {
    await signOut(auth);
    location.replace(LOGIN_PAGE);
  });
}

// ---- Access-denied screen -------------------------------------------------
function renderAccessDenied() {
  document.body.innerHTML = `
    <div class="bt-gate">
      <div class="bt-gate-card">
        <div class="bt-gate-label">Restricted</div>
        <h1 class="bt-gate-title">Access Denied</h1>
        <p class="bt-gate-text">This account is not an authorized BraapTrax admin.
        If you believe this is a mistake, contact the project owner to be added
        to the admins collection.</p>
        <button type="button" class="bt-btn bt-btn-ghost" id="bt-denied-signout">Sign Out</button>
      </div>
    </div>`;
  document
    .getElementById("bt-denied-signout")
    .addEventListener("click", async () => {
      await signOut(auth);
      location.replace(LOGIN_PAGE);
    });
}

async function isAdmin(uid) {
  try {
    const snap = await getDoc(doc(db, "admins", uid));
    return snap.exists();
  } catch (e) {
    console.error("[admin] admin check failed:", e);
    return false;
  }
}

// ---- Page guards ----------------------------------------------------------
// Every non-login page calls guardPage(). Resolves with { user } once the
// signed-in user is confirmed to be an admin and the nav is rendered.
// Never resolves if the user is signed out (redirects to login) or not an
// admin (renders the denied screen) — the page content stays hidden.
export function guardPage(activeKey) {
  return new Promise((resolve) => {
    onAuthStateChanged(auth, async (user) => {
      if (!user) {
        location.replace(LOGIN_PAGE);
        return;
      }
      if (!(await isAdmin(user.uid))) {
        renderAccessDenied();
        return;
      }
      injectNav(activeKey);
      flushPendingToast();
      resolve({ user });
    });
  });
}

// Login page: if already an authed admin, skip straight to My Rides.
// Resolves with { user: null } when the form should be shown.
export function initLoginPage() {
  return new Promise((resolve) => {
    onAuthStateChanged(auth, async (user) => {
      if (user && (await isAdmin(user.uid))) {
        location.replace(NAV_ITEMS[0].href);
        return;
      }
      resolve({ user: null });
    });
  });
}

export async function emailLogin(email, password) {
  return signInWithEmailAndPassword(auth, email, password);
}

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

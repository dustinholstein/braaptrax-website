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
  { key: "publish", label: "Publish", href: ADMIN_BASE + "publish.html" },
  { key: "trails", label: "Trails", href: ADMIN_BASE + "trails.html" },
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

export const RIDE_TYPES = [
  "trail",
  "enduro",
  "motocross",
  "single-track",
  "dual-sport",
  "adventure",
  "other",
];

const RIDE_TYPE_ICONS = {
  trail: "🌲",
  enduro: "⛰️",
  motocross: "🏁",
  "single-track": "🌿",
  "dual-sport": "🛣️",
  adventure: "🧭",
  other: "🏍️",
};

export function rideTypeIcon(t) {
  return RIDE_TYPE_ICONS[String(t || "").toLowerCase()] || "🏍️";
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

export async function uploadTrailPhoto(trailId, index, blob) {
  const path = `verified_trails/${trailId}/${index}.jpg`;
  const r = storageRef(storage, path);
  await uploadBytes(r, blob, { contentType: "image/jpeg" });
  return await getDownloadURL(r);
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
    const isPublish = item.key === "publish";
    // Publish is only reachable with a ride/trail selected. If we land on it
    // without context it's handled by publish.html itself; in the nav it
    // stays disabled until the admin picks a ride from My Rides.
    const params = new URLSearchParams(location.search);
    const hasContext =
      isActive && (params.get("rideId") || params.get("trailId"));
    if (isPublish && !isActive && !hasContext) {
      return `<span class="bt-nav-link bt-nav-link--disabled" title="Pick a ride from My Rides to publish">${item.label}</span>`;
    }
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

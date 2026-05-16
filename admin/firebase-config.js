// BraapTrax Admin — public Firebase web config (project: braaptrax-41ada).
//
// These values are NOT secrets. They identify the Firebase project to the
// client SDK; all access control is enforced server-side by Firestore
// security rules (firestore.rules) and Storage rules (storage.rules)
// deployed from the iOS app repo. Shipping these in a public static file
// is the standard, supported Firebase web pattern.
//
// Sourced from the Firebase Console *Web* app "BraapTrax Admin"
// (NOT the iOS app — its API key is bundle-restricted in browsers).
// measurementId is intentionally omitted: the panel does not use
// Analytics, and it isn't required by the SDKs we load.
export const firebaseConfig = {
  apiKey: "AIzaSyDRRF610MkOkWs04YWQmEqTt0Kje4XLlg8",
  authDomain: "braaptrax-41ada.firebaseapp.com",
  projectId: "braaptrax-41ada",
  storageBucket: "braaptrax-41ada.firebasestorage.app",
  messagingSenderId: "670354051007",
  appId: "1:670354051007:web:54e86d58ffc2b9095b9b0a",
};

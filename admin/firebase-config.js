// BraapTrax Admin — public Firebase web config (project: braaptrax-41ada).
//
// These values are NOT secrets. They identify the Firebase project to the
// client SDK; all access control is enforced server-side by Firestore
// security rules (firestore.rules) and Storage rules (storage.rules)
// deployed from the iOS app repo. Shipping these in a public static file
// is the standard, supported Firebase web pattern.
//
// Use the *Web* app's apiKey/appId from Firebase Console → Project settings
// → Your apps → Web app. Do NOT reuse the iOS app's API key: it may be
// bundle-id-restricted and would be rejected from a browser origin.
//
// TODO(dustin): paste the Web app's real apiKey and appId below (the only
// two values that can't be derived). authDomain / projectId /
// storageBucket / messagingSenderId are final and correct as-is — in
// particular storageBucket uses the new ".firebasestorage.app" domain
// verbatim; do NOT rewrite it to ".appspot.com".
export const firebaseConfig = {
  apiKey: "PASTE_WEB_APP_API_KEY_HERE",
  authDomain: "braaptrax-41ada.firebaseapp.com",
  projectId: "braaptrax-41ada",
  storageBucket: "braaptrax-41ada.firebasestorage.app",
  messagingSenderId: "670354051007",
  appId: "PASTE_WEB_APP_APP_ID_HERE",
};

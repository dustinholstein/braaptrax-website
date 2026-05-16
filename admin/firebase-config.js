// BraapTrax Admin — public Firebase web config.
//
// These values are NOT secrets. They identify the Firebase project to the
// client SDK; all access control is enforced server-side by Firestore
// security rules (firestore.rules) and Storage rules (storage.rules)
// deployed from the iOS app repo. Shipping these in a public static file
// is the standard, supported Firebase web pattern.
//
// TODO(dustin): Replace every placeholder below with the real values from
// Firebase Console → Project settings → Your apps → Web app config, then
// commit. Until then auth/Firestore calls will fail by design.
export const firebaseConfig = {
  apiKey: "TODO_FIREBASE_API_KEY",
  authDomain: "TODO_PROJECT.firebaseapp.com",
  projectId: "TODO_PROJECT_ID",
  storageBucket: "TODO_PROJECT.appspot.com",
  messagingSenderId: "TODO_MESSAGING_SENDER_ID",
  appId: "TODO_APP_ID",
};

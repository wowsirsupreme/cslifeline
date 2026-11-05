// Runtime configuration.
//
// backend: 'firebase' uses the Firebase project below (production).
//          'demo' uses the in-browser demonstration backend seeded with synthetic data.
// A visitor can always open the demonstration with ?mode=demo; it never touches Firebase.
//
// The Firebase web API key identifies the project; it is not a secret. Access is
// controlled by firestore.rules, which must be deployed (see docs/DEPLOYMENT_GUIDE.md).

export const CONFIG = {
  appName: 'CS Lifeline',
  appVersion: '4.0.0',
  schemaVersion: '2.0',
  backend: 'firebase',
  firebaseSdkVersion: '10.12.0',
  firebase: {
    apiKey: 'AIzaSyCPdz5f1MqwPzw6RYRxDfYrSJ5ur96Ch_0',
    authDomain: 'cslifeline-63e76.firebaseapp.com',
    projectId: 'cslifeline-63e76',
    storageBucket: 'cslifeline-63e76.firebasestorage.app',
    messagingSenderId: '209375265757',
    appId: '1:209375265757:web:927002d3a2b6f25a03ec34',
  },
  // Set to true after `firebase deploy --only functions`. When false, assessment
  // submissions are scored from the teacher dashboard (the teacher's browser holds
  // the answer keys; students never receive them).
  functionsDeployed: false,
  // Google sign-in must also be enabled in Firebase Console > Authentication.
  googleSignIn: true,
};

export function resolveMode() {
  try {
    const url = new URL(globalThis.location?.href || 'http://x/');
    const q = url.searchParams.get('mode');
    if (q === 'demo' || q === 'firebase') { localStorage.setItem('csl.mode', q); return q; }
    const saved = localStorage.getItem('csl.mode');
    if (saved === 'demo' || saved === 'firebase') return saved;
  } catch { /* storage unavailable */ }
  return CONFIG.backend;
}

export function setMode(mode) {
  try { localStorage.setItem('csl.mode', mode); } catch { /* ignore */ }
}

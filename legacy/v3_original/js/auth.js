// js/auth.js
import { auth, db } from "./firebase-config.js";
import {
  signInWithEmailAndPassword, createUserWithEmailAndPassword,
  signInWithPopup, GoogleAuthProvider, signOut,
  onAuthStateChanged, sendPasswordResetEmail, updateProfile
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
  doc, getDoc, setDoc, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: "select_account" });

export async function getUserRole(uid) {
  try {
    const snap = await getDoc(doc(db, "users", uid));
    return snap.exists() ? snap.data().role : null;
  } catch(e) {
    console.warn("getUserRole failed:", e.message);
    return null;
  }
}

export function routeByRole(role) {
  const dest = { student: "/student/", teacher: "/teacher/", admin: "/admin/" }[role];
  if (dest && !window.location.pathname.startsWith(dest.slice(0,-1))) {
    window.location.href = dest;
  }
}

async function upsertUser(uid, defaults) {
  const ref  = doc(db, "users", uid);
  const snap = await getDoc(ref);
  if (!snap.exists()) await setDoc(ref, { ...defaults, createdAt: serverTimestamp() });
  await setDoc(ref, { lastSeen: serverTimestamp() }, { merge: true });
  return (await getDoc(ref)).data();
}

// ── Student sign-ins ─────────────────────────────────────────────
export async function studentSignInAnon(displayName, classCode) {
  const raw   = `${classCode}__${displayName}`.toLowerCase().replace(/\s+/g, "_");
  const email = `${raw}@cslifeline.student`;
  const pass  = btoa(raw).slice(0, 20) + "Aa1!";
  let uid;
  try {
    uid = (await signInWithEmailAndPassword(auth, email, pass)).user.uid;
  } catch (e) {
    if (["auth/user-not-found","auth/invalid-credential","auth/wrong-password"].includes(e.code)) {
      uid = (await createUserWithEmailAndPassword(auth, email, pass)).user.uid;
    } else throw e;
  }
  await upsertUser(uid, { role:"student", displayName, classCode, anonEmail: email });
  localStorage.setItem("csl_name",  displayName);
  localStorage.setItem("csl_class", classCode);
  return uid;
}

export async function studentSignInGoogle(classCode) {
  const cred = await signInWithPopup(auth, googleProvider);
  const u    = cred.user;
  const role = await getUserRole(u.uid);
  if (role && role !== "student") { await signOut(auth); throw new Error("This Google account is a teacher account."); }
  await upsertUser(u.uid, { role:"student", displayName: u.displayName, classCode, email: u.email });
  localStorage.setItem("csl_name",  u.displayName || "Student");
  localStorage.setItem("csl_class", classCode);
  return u.uid;
}

export async function studentSignUpEmail(email, pass, displayName, classCode) {
  let uid;
  try {
    const cred = await createUserWithEmailAndPassword(auth, email, pass);
    uid = cred.user.uid;
    await updateProfile(cred.user, { displayName });
  } catch (e) {
    if (e.code === "auth/email-already-in-use") {
      uid = (await signInWithEmailAndPassword(auth, email, pass)).user.uid;
    } else throw e;
  }
  await upsertUser(uid, { role:"student", displayName, classCode, email });
  localStorage.setItem("csl_name",  displayName);
  localStorage.setItem("csl_class", classCode);
  return uid;
}

export async function studentSignInEmail(email, pass) {
  const cred = await signInWithEmailAndPassword(auth, email, pass);
  const data = await upsertUser(cred.user.uid, {});
  if (data.role !== "student") { await signOut(auth); throw new Error("Not a student account."); }
  localStorage.setItem("csl_name",  data.displayName || cred.user.displayName || "Student");
  localStorage.setItem("csl_class", data.classCode || "");
}

// ── Teacher sign-ins ─────────────────────────────────────────────
export async function teacherSignIn(email, pass) {
  const cred = await signInWithEmailAndPassword(auth, email, pass);
  const role = await getUserRole(cred.user.uid);
  if (!role) {
    await upsertUser(cred.user.uid, { role:"teacher", email, displayName: cred.user.displayName || email.split("@")[0] });
  }
  routeByRole(role || "teacher");
}

export async function teacherSignUp(email, pass, displayName) {
  const cred = await createUserWithEmailAndPassword(auth, email, pass);
  await updateProfile(cred.user, { displayName });
  await upsertUser(cred.user.uid, { role:"teacher", email, displayName });
  return cred.user;
}

export async function teacherSignInGoogle() {
  const cred = await signInWithPopup(auth, googleProvider);
  const u    = cred.user;
  const role = await getUserRole(u.uid);
  if (role === "student") { await signOut(auth); throw new Error("This is a student account."); }
  if (!role) await upsertUser(u.uid, { role:"teacher", email: u.email, displayName: u.displayName });
  routeByRole(role || "teacher");
}

export async function sendReset(email) { return sendPasswordResetEmail(auth, email); }
export async function signOutUser()    { await signOut(auth); window.location.href = "/"; }

// ── requireRole — robust version ─────────────────────────────────
// Handles missing Firestore user doc (creates it) and Firestore errors
// gracefully rather than redirecting when auth is genuinely valid.
export async function requireRole(expected) {
  // Step 1: Wait for Firebase to restore auth state from localStorage
  if (typeof auth.authStateReady === 'function') {
    await auth.authStateReady();
  } else {
    await new Promise(resolve => {
      const unsub = onAuthStateChanged(auth, () => { unsub(); resolve(); });
    });
  }

  const user = auth.currentUser;

  // Step 2: Genuinely not logged in
  if (!user) {
    window.location.href = "/";
    return new Promise(() => {}); // halt — page is navigating away
  }

  // Step 3: Get or create the Firestore user document
  let role = null;
  try {
    role = await getUserRole(user.uid);

    if (!role) {
      // No user document — this teacher signed in via Firebase Console
      // or their doc was deleted. Create it now with the expected role.
      const displayName = user.displayName || user.email?.split("@")[0] || "Teacher";
      await setDoc(doc(db, "users", user.uid), {
        role:        expected,
        email:       user.email || "",
        displayName,
        createdAt:   serverTimestamp(),
        lastSeen:    serverTimestamp(),
      }, { merge: true });
      role = expected;
      console.log(`requireRole: created missing user doc for ${user.uid} as ${expected}`);
    }
  } catch(firestoreError) {
    // Firestore read failed (network, rules, etc) — don't redirect.
    // Trust the Firebase Auth session and use the expected role.
    console.warn("requireRole: Firestore read failed, trusting auth session:", firestoreError.message);
    role = expected; // optimistic — let the page load, Firestore will catch up
  }

  // Step 4: Role check
  if (role !== expected && !(expected === "teacher" && role === "admin")) {
    console.warn(`requireRole: expected ${expected}, got ${role} — redirecting`);
    window.location.href = "/";
    return new Promise(() => {});
  }

  return { user, role };
}

export { auth, onAuthStateChanged };

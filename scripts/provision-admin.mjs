#!/usr/bin/env node
// Trusted provisioning of the FIRST administrator (afterwards, administrators grant roles in the app).
//
// 1. The person signs up at the CS Lifeline home page ("I am a teacher") so an account exists.
// 2. With a service-account key for the Firebase project:
//      GOOGLE_APPLICATION_CREDENTIALS=service-account.json node scripts/provision-admin.mjs --email head.of.cs@school.org
//
// Nobody can make themselves an administrator from the browser: the security rules forbid it.
const args = process.argv.slice(2);
const email = args[args.indexOf('--email') + 1];
if (!email || email.startsWith('--')) { console.error('Usage: node scripts/provision-admin.mjs --email someone@school.org'); process.exit(1); }
const { initializeApp, applicationDefault } = await import('firebase-admin/app');
const { getAuth } = await import('firebase-admin/auth');
const { getFirestore } = await import('firebase-admin/firestore');
initializeApp({ credential: applicationDefault() });
const user = await getAuth().getUserByEmail(email).catch(() => null);
if (!user) { console.error(`No account uses ${email}. Ask them to register on the CS Lifeline home page first.`); process.exit(1); }
const db = getFirestore();
const ref = db.doc(`users/${user.uid}`);
const before = (await ref.get()).data() || null;
await ref.set({ role: 'admin', status: 'active', display_name: before?.display_name || user.displayName || email.split('@')[0], email, class_codes: before?.class_codes || [], school_id: before?.school_id || null, updated_at: new Date().toISOString(), updated_by: 'provision-admin-script' }, { merge: true });
await db.collection('audit_logs').add({ actor_uid: 'provision-admin-script', actor_role: 'system', action: 'user.provision_admin', target: `users/${user.uid}`, details: { email, previous_role: before?.role || null }, at: new Date().toISOString() });
console.log(`${email} (${user.uid}) is now an administrator. They can sign in at /admin/.`);

# Deployment guide

CS Lifeline is a static web application (hosted on Vercel; Netlify also works) on top of the existing Firebase project `cslifeline-63e76`. Nothing is compiled.

## 0. What you need

* The Firebase project (Spark plan is enough for the core app; Blaze is needed only for Cloud Functions, and possibly for Storage image uploads on newer projects).
* Node.js 20+ and `npm i` in the repository (installs `firebase-tools`, `firebase-admin` and the rules-test library as dev dependencies).
* Java 11+ for the rules tests (Firebase emulator).
* A Vercel account (or Netlify, or Firebase Hosting — `netlify.toml` and `firebase.json` also publish `public/`).

## 1. Firebase console (one-off)

1. **Authentication → Sign-in method:** enable Email/Password; enable Google if wanted (`googleSignIn` in `public/js/core/config.js` controls the button).
2. **Authentication → Settings → Authorised domains:** add your Vercel domain (e.g. `cslifeline.vercel.app`) and any custom domain. Preview deployments use other `*.vercel.app` addresses; add one only if you need to sign in on a preview.
3. Confirm the web-app configuration in `public/js/core/config.js` matches Project settings → Your apps (it is the v3 project's config).

## 2. Test and deploy the rules and indexes

```
npm i
npm run test:rules                      # Firestore emulator; all 14 scenarios must pass
npx firebase login
npx firebase use cslifeline-63e76
npx firebase deploy --only firestore:rules,firestore:indexes,storage
```
Deploying the v4 rules immediately stops v3 pages from writing data in the old shape. Deploy the new site (step 3) at the same time, and run the migration (step 5) right after.

## 3. Publish the site on Vercel

* In Vercel: **Add New → Project → Import** `wowsirsupreme/cslifeline`. Leave the framework as "Other"; `vercel.json` already sets the output directory to `public/`, no install or build step, the security headers (strict Content-Security-Policy), trailing-slash routes for `/student/`, `/teacher/`, `/admin/` and the `/demo` shortcut. Deploy.
* Every push to `main` redeploys production; other branches get preview addresses.
* From a terminal instead: `npx vercel --prod` in the repository folder.
* Open `https://<site>/?mode=demo` to check the demonstration, then `https://<site>/` for the real sign-in.
* Netlify alternative: `netlify.toml` contains the same settings.

## 4. First administrator

1. The head of department registers at `/` → Teacher or admin → "Request an account".
2. Create a service-account key (Project settings → Service accounts → Generate new private key), keep it off shared drives, then:
```
GOOGLE_APPLICATION_CREDENTIALS=./service-account.json npm run provision-admin -- --email head.of.cs@school.org
```
3. They sign in at `/admin/`. From now on, roles are granted in the app (Users and roles), with reasons recorded in the audit log.
4. In the admin portal: create the school, the classes (class codes are what students type to join), approve teachers and assign their classes, check Settings.

## 5. Migrate v3 data (if the v3 database has records)

```
GOOGLE_APPLICATION_CREDENTIALS=./service-account.json npm run migrate:v3                      # dry run: report only
GOOGLE_APPLICATION_CREDENTIALS=./service-account.json npm run migrate:v3 -- --apply --trusted-staff <uid1>,<uid2> --reset-predictable-passwords
```
* `--trusted-staff`: the uids of real v3 teachers/admins; everyone else who held a v3 teacher role becomes "awaiting approval".
* `--reset-predictable-passwords`: v3 quick-sign-in accounts get random passwords, written to `migrations/NEW-PASSWORDS-*.csv` for teachers to hand out privately. Delete the file afterwards.
* Backups of every touched collection go to `migrations/backup-<time>/` before anything is written; the run is recorded in the audit log; re-running is safe.
* After migrating, open each class in Schools and classes, attach its school and teachers, and open joining when wanted.

## 6. Optional: Cloud Functions (Blaze plan)

Automatic marking of submissions, the signed ingest API and hourly closing of expired assessments.
```
cd functions && npm i && cd ..
npx firebase functions:secrets:set CSL_SECRET_WOW_SIR      # a long random string shared with WOW Sir
npx firebase functions:secrets:set CSL_SECRET_DBWOW
npx firebase deploy --only functions                        # predeploy copies the shared engine code
```
Then set `functionsDeployed: true` in `public/js/core/config.js` and redeploy the site. Until then, teachers' browsers mark submissions when they open an assessment's results, and integration data is imported in Administration → Integrations.

## 7. Models

1. Train: `npm run ml:train` (or the Colab notebook) — registers a candidate in `ml/models/`.
2. Administration → Models → Register model → choose `ml/models/<version>/registry_entry.json`.
3. Promote it with a reason. A model trained on synthetic data is labelled "demonstration" everywhere.
4. Logistic models: teachers score their classes on the Early-warning page. Other models: `python -m cslifeline_ml predict --model <version> --data <export folder> --cohort <term> --as-of <date>`, then Administration → Models → Import predictions.

## 8. After deployment — check

| Check | Expected |
|---|---|
| Sign up as a student with a closed class code | refused |
| A student opens `/teacher/` | sent back to the student portal |
| A student practises offline, then reconnects | "waiting to send" badge, then the answers appear for the teacher |
| A student submits an assessment | teacher sees it under Results; marking happens there (or by the Function) |
| Teacher of class A opens a student of class B by URL | no data (rules deny) |
| Admin changes a role | entry with reason in the audit log |

## 9. Updating

Edit files under `public/`, run `npm test && npm run test:e2e`, push (Vercel redeploys). If rules change, run `npm run test:rules` and deploy them. If shared engine files change and Functions are used, redeploy Functions.

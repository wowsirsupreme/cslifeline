# Continuation guide

Where the project stands, what still needs a person or an external service, and where to start next.

## 1. Done and tested

All items in CHANGELOG.md. Tests: 68 unit, 7 Python, 49 browser end-to-end — all passing (TESTING_REPORT.md).

## 2. Needs you (external dependencies)

| # | Task | Why it was not done here | How |
|---|---|---|---|
| 1 | Run the security-rules tests | The Firestore emulator download is blocked in the build environment | `npm i && npm run test:rules` on a computer with Java 11+. Fix any failure before deploying. |
| 2 | Deploy rules, indexes and the site | Needs your Firebase and Vercel accounts | DEPLOYMENT_GUIDE.md §2–3 |
| 3 | Provision the first administrator | Needs a service-account key | DEPLOYMENT_GUIDE.md §4 |
| 4 | Migrate v3 data | Needs the key and your list of genuine v3 teachers | DEPLOYMENT_GUIDE.md §5 (dry run first) |
| 5 | Test the live Firebase flows | No credentials here | The checklist in DEPLOYMENT_GUIDE.md §8 |
| 6 | Cloud Functions | Blaze plan | DEPLOYMENT_GUIDE.md §6; then set `functionsDeployed: true` |
| 7 | Connect WOW Sir and DBWOW for real | Needs data-sharing agreements and changes in those apps | INTEGRATION_GUIDE.md §3–5. WOW Sir students are anonymous guests, so verified identity links are the main work; DBWOW needs a scheduled export (its rules rightly block outside reads). |
| 8 | Ethics and consent | IRB approval pending | SECURITY_AND_PRIVACY.md §5 |
| 9 | Train on real data | Data does not exist yet | Research export → `python -m cslifeline_ml train --data <folder> --train-cohort <earlier term> --test-cohort <later term> --real`; register and promote only if the evaluation supports it |

## 3. Known limitations

* **The demonstration model is trained on synthetic data.** Its metrics test the pipeline only. Every screen says so.
* **Misconception detection is conservative and limited by item design.** On synthetic data "demonstrated" is 27 % precise with 13 % recall; many built-in items link every distractor to one misconception, which cannot separate it from guessing. Improving items is the best lever (the editor warns).
* Rule-based misconception engine: teacher reviews are stored as labels, but no supervised misconception model is trained yet (needs real reviewed data).
* Marking of structured answers is teacher-confirmed with keyword suggestions; coding answers are marked by test cases in the interpreter, which supports the Cambridge pseudocode subset in the reference suite (not every edge of the 9618 syntax).
* Without Cloud Functions, submissions are marked when a teacher opens the assessment's results, and integration data is imported by hand.
* Image upload needs Firebase Storage (which may require the Blaze plan for this project); otherwise use an image URL.
* PDF reports use the browser's "Save as PDF"; there is no server-side PDF generation.
* The demonstration keeps changes per browser (localStorage), so a student and a teacher must use the same browser to see each other's actions in the demo.
* Notifications are in-app only (no email/push).
* Sign-in account deletion after erasure is done in the Firebase console (the browser cannot delete other users' auth accounts without a server).
* The question bank covers T01–T14 unevenly (T08 has 61 questions, T11 has 4).

## 4. Suggested next steps

1. Run the rules tests and deploy (tasks 1–5).
2. Pilot with one class: check offline behaviour on school Wi-Fi and phones.
3. Add questions with discriminating distractors for chapters T10–T12 and for the misconceptions with fewest opportunities (the "coverage" unit test checks that at least 75 % have three or more).
4. Once a term of real data exists, train, compare with the synthetic baseline, and decide on promotion with the supervisor.
5. If WOW Sir is used in class, add a "CS Lifeline research ID" field to its join screen so links can be verified at the source.

## 5. Where things are

| Need to change… | Edit |
|---|---|
| A page | `public/js/views/*.js` (teacher/admin) or `public/js/portals/student.js` |
| What is stored | `public/js/core/store.js` + `firestore.rules` + DATABASE_SCHEMA.md |
| Marking | `public/js/engine/questions.js`, `marking.js` (then `npm run build:functions`) |
| Misconception rules | `public/js/engine/misconception.js`, taxonomy in `taxonomy-data.js`; re-run `scripts/evaluate-misconceptions.mjs` |
| Risk features | `engine/risk.js` **and** `ml/cslifeline_ml/features.py`, bump both versions, `node scripts/make-feature-fixture.mjs`, `npm run test:ml` |
| A new platform | INTEGRATION_GUIDE.md §5 |
| The synthetic world | `scripts/synthetic/generate.mjs`, then retrain and `npm run data:demo` |

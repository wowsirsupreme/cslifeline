// Copies the shared pure modules into functions/shared so the Cloud Functions run the
// exact same marking, record-building and integration code as the browser.
// Runs automatically before `firebase deploy --only functions` (firebase.json predeploy).
import fs from 'node:fs';
import path from 'node:path';
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const out = path.join(root, 'functions', 'shared');
fs.rmSync(out, { recursive: true, force: true });
const copy = (rel) => { const src = path.join(root, 'public', rel); const dst = path.join(out, rel); fs.mkdirSync(path.dirname(dst), { recursive: true }); fs.copyFileSync(src, dst); };
for (const f of ['js/core/util.js', 'js/engine/questions.js', 'js/engine/marking.js', 'js/engine/records.js', 'js/engine/curriculum.js', 'js/engine/taxonomy-data.js',
  'js/engine/pseudocode/interpreter.js', 'js/integration/events.js', 'data/integrations/dbwow_quiz_key.json']) copy(f);
console.log('functions/shared synced');

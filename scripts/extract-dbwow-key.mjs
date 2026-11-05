// Extracts the DBWOW Learning Centre quiz answer key from src/learning/content.ts
// (lines between `export const TOPICS: Topic[] = [` and the closing `];`).
// Usage: node scripts/extract-dbwow-key.mjs <path-to-dbwow-repo> > web/data/integrations/dbwow_quiz_key.json
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
const repo = process.argv[2];
const src = fs.readFileSync(path.join(repo, 'src/learning/content.ts'), 'utf8');
const start = src.indexOf('export const TOPICS: Topic[] = [');
const end = src.indexOf('\n];', start);
const literal = src.slice(src.indexOf('[', start), end + 2);
const topics = vm.runInNewContext('(' + literal + ')', {});
const out = { source: 'github.com/wowsirsupreme/dbwow src/learning/content.ts', extracted_at: new Date().toISOString(), topics: {} };
for (const t of topics) out.topics[t.id] = { title: t.title, quiz: t.quiz.map(q => ({ q: q.q, options: q.options, answer: q.answer })) };
process.stdout.write(JSON.stringify(out, null, 1));

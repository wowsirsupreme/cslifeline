#!/usr/bin/env node
// Vercel build step: copy the static site (public/) into dist/ and check the essentials exist.
// No dependencies are installed or needed. Fails the deployment loudly if a page is missing.
import { cpSync, rmSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'public'), OUT = join(ROOT, 'dist');
rmSync(OUT, { recursive: true, force: true });
cpSync(SRC, OUT, { recursive: true });
const required = ['index.html', 'student/index.html', 'teacher/index.html', 'admin/index.html', 'js/core/config.js', 'css/app.css', 'data/demo/demo_dataset.json'];
const missing = required.filter(f => !existsSync(join(OUT, f)));
if (missing.length) { console.error('Missing from build output:', missing.join(', ')); process.exit(1); }
const count = (d) => readdirSync(d).reduce((n, f) => n + (statSync(join(d, f)).isDirectory() ? count(join(d, f)) : 1), 0);
console.log(`CS Lifeline static build: ${count(OUT)} files copied from public/ to dist/`);

#!/usr/bin/env node
// Minimal static server for local use and tests. Mirrors the Netlify routes in netlify.toml:
// /student, /teacher and /admin serve their index.html; everything else is a real file or 404.
// Usage: node scripts/serve.mjs [port]
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../public');
const PORT = Number(process.argv[2] || process.env.PORT || 8642);
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.ico': 'image/x-icon', '.txt': 'text/plain; charset=utf-8', '.md': 'text/markdown; charset=utf-8', '.csv': 'text/csv; charset=utf-8', '.ipynb': 'application/x-ipynb+json' };

export function startServer(port = PORT) {
  const server = createServer(async (req, res) => {
    try {
      let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
      if (/^\/(student|teacher|admin)$/.test(p)) p += '/';
      if (p.endsWith('/')) p += 'index.html';
      const file = normalize(join(ROOT, p));
      if (!file.startsWith(ROOT)) { res.writeHead(403).end('Forbidden'); return; }
      const s = await stat(file).catch(() => null);
      if (!s || !s.isFile()) { res.writeHead(404, { 'Content-Type': 'text/plain' }).end('Not found'); return; }
      res.writeHead(200, { 'Content-Type': TYPES[extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache', 'X-Content-Type-Options': 'nosniff' });
      res.end(await readFile(file));
    } catch (e) { res.writeHead(500).end(String(e)); }
  });
  return new Promise(r => server.listen(port, () => r(server)));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await startServer();
  console.log(`CS Lifeline on http://localhost:${PORT}/  (demonstration: http://localhost:${PORT}/?mode=demo)`);
}

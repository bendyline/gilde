#!/usr/bin/env node

import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { dirname, extname, join, resolve, sep } from 'node:path';
import { parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';
import { loadResolvedManifest } from './lib/manifest-merge.mjs';
import { listItems } from './lib/walk.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const catalogRoot = resolve(here, '..');
const dataRoot = join(catalogRoot, 'data');

const { values } = parseArgs({
  options: {
    host: { type: 'string', short: 'h', default: '127.0.0.1' },
    port: { type: 'string', short: 'p', default: '4173' },
  },
});

const host = values.host;
const port = Number(values.port);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  console.error(`Invalid port: ${values.port}`);
  process.exit(1);
}

function safeRelativePath(value) {
  if (typeof value !== 'string') return null;
  const normalized = value.replaceAll('\\', '/').replace(/^\.\//, '');
  const parts = normalized.split('/');
  if (!normalized || normalized.startsWith('/') || parts.some((part) => !part || part === '..')) {
    return null;
  }
  return normalized;
}

function demoUrl(id, entry) {
  return `/demos/${encodeURIComponent(id)}/${entry.split('/').map(encodeURIComponent).join('/')}`;
}

const demos = [];
for (const item of listItems(dataRoot, 'project-type')) {
  const { manifest } = loadResolvedManifest(item.itemDir, 'project-type', item.id);
  const entry = safeRelativePath(manifest?.pages?.entry);
  if (!manifest || !entry) continue;

  const pagesRoot = join(item.itemDir, 'versions', manifest.version, 'pages');
  const entryPath = join(pagesRoot, ...entry.split('/'));
  if (!existsSync(entryPath)) continue;

  demos.push({
    id: item.id,
    name: manifest.name,
    description: manifest.description,
    category: manifest.category || 'general',
    version: manifest.version,
    entry,
    pagesRoot,
    url: demoUrl(item.id, entry),
  });
}
demos.sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name));
const demosById = new Map(demos.map((demo) => [demo.id, demo]));

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function homePage() {
  const cards = demos
    .map(
      (demo) => `
        <a class="card" href="${escapeHtml(demo.url)}" target="_blank" rel="noreferrer">
          <span class="category">${escapeHtml(demo.category)}</span>
          <h2>${escapeHtml(demo.name)}</h2>
          <p>${escapeHtml(demo.description)}</p>
          <small>v${escapeHtml(demo.version)} · open demo ↗</small>
        </a>`,
    )
    .join('');

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>gilde page demos</title>
    <style>
      :root { color-scheme: light dark; --bg: #f4efe5; --card: #fffaf0; --ink: #2d261d; --muted: #675c4e; --line: #d9ccb9; --accent: #805022; }
      @media (prefers-color-scheme: dark) { :root { --bg: #1b1814; --card: #242019; --ink: #eee5d7; --muted: #b9ad9c; --line: #463d31; --accent: #e0ac6d; } }
      * { box-sizing: border-box; }
      body { margin: 0; background: var(--bg); color: var(--ink); font: 16px/1.55 ui-sans-serif, system-ui, sans-serif; }
      main { width: min(72rem, calc(100% - 2rem)); margin: 0 auto; padding: 3rem 0 5rem; }
      h1 { margin: 0; font: 700 clamp(2rem, 5vw, 3.6rem)/1.05 ui-serif, Georgia, serif; }
      .lede { max-width: 45rem; margin: .8rem 0 2.2rem; color: var(--muted); }
      .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(17rem, 100%), 1fr)); gap: .9rem; }
      .card { display: block; min-height: 13rem; padding: 1rem 1.1rem; color: inherit; text-decoration: none; background: var(--card); border: 1px solid var(--line); border-radius: 6px; }
      .card:hover, .card:focus-visible { border-color: var(--accent); outline: 2px solid transparent; transform: translateY(-1px); }
      .card h2 { margin: .45rem 0 .35rem; font-size: 1.08rem; }
      .card p { margin: 0 0 1rem; color: var(--muted); font-size: .9rem; }
      .card small { color: var(--accent); }
      .category { display: inline-block; padding: .08rem .4rem; color: var(--muted); background: color-mix(in srgb, var(--card), var(--line) 45%); border-radius: 4px; font-size: .72rem; font-weight: 700; text-transform: uppercase; letter-spacing: .04em; }
    </style>
  </head>
  <body>
    <main>
      <h1>gilde page demos</h1>
      <p class="lede">${demos.length} standalone experiences, served from the latest eligible project-type versions in this checkout. Each demo opens with local sample data and leaves your Gezel files untouched.</p>
      <div class="grid">${cards}</div>
    </main>
  </body>
</html>`;
}

function contentType(path) {
  switch (extname(path).toLowerCase()) {
    case '.html': return 'text/html; charset=utf-8';
    case '.css': return 'text/css; charset=utf-8';
    case '.js':
    case '.mjs': return 'text/javascript; charset=utf-8';
    case '.json': return 'application/json; charset=utf-8';
    case '.svg': return 'image/svg+xml';
    case '.png': return 'image/png';
    case '.webp': return 'image/webp';
    case '.jpg':
    case '.jpeg': return 'image/jpeg';
    case '.gif': return 'image/gif';
    case '.ico': return 'image/x-icon';
    case '.woff': return 'font/woff';
    case '.woff2': return 'font/woff2';
    default: return 'application/octet-stream';
  }
}

function send(res, status, type, body, method) {
  const bytes = Buffer.byteLength(body);
  res.writeHead(status, {
    'Content-Type': type,
    'Content-Length': bytes,
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  });
  if (method === 'HEAD') res.end();
  else res.end(body);
}

function pageFile(demo, relative) {
  const parts = relative.split('/').filter(Boolean).map(decodeURIComponent);
  if (parts.some((part) => part === '.' || part === '..' || part.includes('\\'))) return null;
  let path = resolve(demo.pagesRoot, ...parts);
  const rootPrefix = demo.pagesRoot.endsWith(sep) ? demo.pagesRoot : demo.pagesRoot + sep;
  if (path !== demo.pagesRoot && !path.startsWith(rootPrefix)) return null;
  try {
    if (statSync(path).isDirectory()) path = join(path, 'index.html');
    if (!statSync(path).isFile()) return null;
  } catch {
    return null;
  }
  return path;
}

const server = createServer((req, res) => {
  const method = req.method || 'GET';
  if (method !== 'GET' && method !== 'HEAD') {
    send(res, 405, 'text/plain; charset=utf-8', 'Method not allowed\n', method);
    return;
  }

  let pathname;
  try {
    pathname = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`).pathname;
  } catch {
    send(res, 400, 'text/plain; charset=utf-8', 'Bad request\n', method);
    return;
  }

  if (pathname === '/' || pathname === '/index.html') {
    const html = homePage();
    res.setHeader(
      'Content-Security-Policy',
      "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'",
    );
    send(res, 200, 'text/html; charset=utf-8', html, method);
    return;
  }

  const match = pathname.match(/^\/demos\/([^/]+)(?:\/(.*))?$/);
  if (!match) {
    send(res, 404, 'text/plain; charset=utf-8', 'Not found\n', method);
    return;
  }

  let id;
  try {
    id = decodeURIComponent(match[1]);
  } catch {
    send(res, 400, 'text/plain; charset=utf-8', 'Bad request\n', method);
    return;
  }
  const demo = demosById.get(id);
  if (!demo) {
    send(res, 404, 'text/plain; charset=utf-8', 'Demo not found\n', method);
    return;
  }
  if (!match[2]) {
    res.writeHead(302, { Location: demo.url, 'Cache-Control': 'no-store' });
    res.end();
    return;
  }

  let file;
  try {
    file = pageFile(demo, match[2]);
  } catch {
    file = null;
  }
  if (!file) {
    send(res, 404, 'text/plain; charset=utf-8', 'Demo asset not found\n', method);
    return;
  }

  const size = statSync(file).size;
  res.writeHead(200, {
    'Content-Type': contentType(file),
    'Content-Length': size,
    'Cache-Control': 'no-store',
    'Content-Security-Policy':
      "default-src 'self' data:; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; connect-src 'none'; base-uri 'none'; form-action 'none'",
    'Referrer-Policy': 'no-referrer',
    'X-Content-Type-Options': 'nosniff',
  });
  if (method === 'HEAD') res.end();
  else createReadStream(file).pipe(res);
});

server.on('error', (error) => {
  if (error.code === 'EADDRINUSE') console.error(`Port ${port} is already in use.`);
  else console.error(error);
  process.exitCode = 1;
});

server.listen(port, host, () => {
  console.log(`gilde demos: http://${host}:${port}/ (${demos.length} experiences)`);
  console.log('Press Ctrl+C to stop.');
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => server.close(() => process.exit(0)));
}

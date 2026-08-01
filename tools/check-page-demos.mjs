#!/usr/bin/env node

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Script } from 'node:vm';
import { loadResolvedManifest } from './lib/manifest-merge.mjs';
import { listItems } from './lib/walk.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const dataRoot = resolve(here, '..', 'data');
const failures = [];
let checked = 0;

for (const item of listItems(dataRoot, 'project-type')) {
  const { manifest } = loadResolvedManifest(item.itemDir, 'project-type', item.id);
  const entry = manifest?.pages?.entry;
  if (!manifest || typeof entry !== 'string') continue;

  const pagePath = join(item.itemDir, 'versions', manifest.version, 'pages', entry);
  if (!existsSync(pagePath)) {
    failures.push(`${item.id}@${manifest.version}: missing pages/${entry}`);
    continue;
  }

  checked += 1;
  const html = readFileSync(pagePath, 'utf8');
  const required = [
    '<meta name="gezel-demo" content="standalone"',
    'data-gezel-demo-banner',
    'Reset demo',
    'demoMode',
  ];
  for (const marker of required) {
    if (!html.includes(marker)) failures.push(`${item.id}@${manifest.version}: missing ${marker}`);
  }
  if (/Read-only view|Could not resolve this project/.test(html)) {
    failures.push(`${item.id}@${manifest.version}: retains a standalone dead-end message`);
  }

  for (const match of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)) {
    try {
      new Script(match[1], { filename: `${pagePath} (inline script)` });
    } catch (error) {
      failures.push(`${item.id}@${manifest.version}: ${error.message}`);
    }
  }
}

if (failures.length > 0) {
  for (const failure of failures) console.error(`ERROR ${failure}`);
  console.error(`check-page-demos: ${failures.length} failure(s) across ${checked} page(s)`);
  process.exitCode = 1;
} else {
  console.log(`check-page-demos: ${checked} page(s) carry the standalone demo contract`);
}

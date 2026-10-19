#!/usr/bin/env node

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Script } from 'node:vm';
import { loadResolvedManifest } from './lib/manifest-merge.mjs';
import { listItems } from './lib/walk.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const dataRoot = resolve(here, '..', 'data');
const stubBytes = readFileSync(resolve(here, '..', 'authoring', 'page-demo-stub.js'), 'utf8');

// v0 wire-protocol markers that must not survive a page's migration to
// the Output Pane API (`pages.api: 1`): the postMessage sentinels, the
// hand-rolled gezelPage bridge, and capability parsing of the page URL.
const legacyMarkers = [
  '__gezelPageInvoke',
  '__gezelPageResult',
  '__gezelPageRefresh',
  'gezelPage = (function',
  "parts.indexOf('type')",
];

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
  // Pages may ship their CSS and JS alongside the HTML. Inspect local linked
  // assets too; external URLs and paths outside this page bundle confer no proof.
  const pageRoot = join(item.itemDir, 'versions', manifest.version, 'pages');
  const linked = [];
  for (const match of html.matchAll(/<(?:link|script)\b[^>]*\b(?:href|src)=["']([^"']+\.(?:css|js))["'][^>]*>/gi)) {
    if (/^(?:[a-z]+:|[\/\\])/i.test(match[1])) continue;
    const asset = resolve(dirname(pagePath), match[1]);
    const rel = relative(pageRoot, asset);
    if (rel === '..' || rel.startsWith('..' + sep) || !existsSync(asset)) continue;
    linked.push(readFileSync(asset, 'utf8'));
  }
  if (existsSync(join(pageRoot, 'page-components.js')) || /installGezelComponents/.test([html, ...linked].join('\n'))) {
    failures.push(item.id + ': page components belong to the host/demo bootstrap, not app source');
  }
  const pageSource = [html, ...linked].join('\n');
  const required = [
    '<meta name="gezel-demo" content="standalone"',
    'data-gezel-demo-banner',
    'Reset demo',
    'demoMode',
  ];
  for (const marker of required) {
    if (!pageSource.includes(marker)) failures.push(`${item.id}@${manifest.version}: missing ${marker}`);
  }
  if (/Read-only view|Could not resolve this project/.test(pageSource)) {
    failures.push(`${item.id}@${manifest.version}: retains a standalone dead-end message`);
  }

  // Theming. A page renders in a null-origin sandboxed iframe, so Gezel's own
  // styling cannot reach it; the app instead moves the browser's colour-scheme
  // preference, which makes the media query the contract. A page that ships
  // only light colours becomes a bright slab down the side of a dark workshop.
  if (!/@media\s*\(\s*prefers-color-scheme:\s*dark\s*\)/.test(pageSource)) {
    failures.push(
      `${item.id}@${manifest.version}: no @media (prefers-color-scheme: dark) — the page must follow the reader's theme`,
    );
  }
  if (!/color-scheme:\s*light\s+dark/.test(pageSource)) {
    failures.push(
      `${item.id}@${manifest.version}: missing "color-scheme: light dark" so form controls and scrollbars follow too`,
    );
  }
  // A literal light colour in a component rule survives the media query. Only
  // look outside the dark block, where such a value can never be overridden.
  const withoutDarkBlocks = pageSource.replace(
    /@media\s*\(\s*prefers-color-scheme:\s*dark\s*\)\s*\{[\s\S]*?\n\s*\}/g,
    '',
  );
  const hardcodedLight = withoutDarkBlocks.match(
    /(?:background(?:-color)?|color)\s*:\s*(?:#fff\b|#ffffff\b|white\b)/i,
  );
  if (hardcodedLight) {
    failures.push(
      `${item.id}@${manifest.version}: hardcoded ${hardcodedLight[0].trim()} outside the dark override — drive it through a variable`,
    );
  }

  if (manifest.pages?.api === 1) {
    if (!html.includes(stubBytes) && !pageSource.includes('window.gezel || window.makeDemoGezel(')) {
      failures.push(
        `${item.id}@${manifest.version}: api:1 page must use the injected host or shared demo initializer`,
      );
    }
    for (const marker of legacyMarkers) {
      if (html.includes(marker)) {
        failures.push(`${item.id}@${manifest.version}: api:1 page retains legacy wire marker ${marker}`);
      }
    }
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

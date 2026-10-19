import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { assets, demoHtml, exportDemo } from '../lib/page-demo.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
test('shared demo helper injects manifest targets before app code and exports without modifying source', async () => {
  const pages = join(root, 'data/project-types/me/media-library/versions/1.0.0/pages');
  const before = await readFile(join(pages, 'index.html'), 'utf8');
  const manifest = JSON.parse(await readFile(join(pages, '../manifest.json'), 'utf8'));
  const html = demoHtml(before, manifest.pages.imports);
  assert.match(html, /id="gezel-demo-config"/);
  assert.match(html, /_gezel-demo\/page-demo-bootstrap-[a-f0-9]{16}\.js/);
  assert.ok(html.indexOf('id="gezel-demo-config"') < html.indexOf('src="gallery.js"'));
  assert.ok(html.includes('"id":"library"'));
  assert.ok(assets[1].bytes.includes('data:font/woff2;base64,'));
  const dir = await mkdtemp(join(tmpdir(), 'gilde-demo-'));
  try {
    const out = join(dir, 'export');
    await exportDemo(pages, out, manifest.pages.imports);
    const exported = await readFile(join(out, 'pages/index.html'), 'utf8');
    assert.match(exported, /\.\.\/_gezel-demo\/page-demo-bootstrap/);
    assert.equal(await readFile(join(pages, 'index.html'), 'utf8'), before);
    for (const asset of assets) assert.deepEqual(await readFile(join(out, '_gezel-demo', asset.name)), asset.bytes);
    await assert.rejects(exportDemo(pages, out, manifest.pages.imports), {code:'EEXIST'});
  } finally {
    const target = resolve(dir);
    assert.ok(target.startsWith(resolve(tmpdir())) && target.includes('gilde-demo-'));
    await rm(target, {recursive:true,force:true});
  }
});

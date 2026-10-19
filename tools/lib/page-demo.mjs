import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { injectPageDemo } from '../../authoring/page-demo-injector.mjs';

const authoring = fileURLToPath(new URL('../../authoring/', import.meta.url));
export const assets = ['page-demo-bootstrap.js', 'page-demo-typography.css', 'LICENSE-HankenGrotesk-OFL-1.1.txt', 'LICENSE-PTSerif-OFL-1.1.txt'].map(name => {
  const bytes = readFileSync(join(authoring, name));
  const hash = createHash('sha256').update(bytes).digest('hex').slice(0, 16);
  return { name: name.replace(/\.(js|css)$/, `-${hash}.$1`), bytes };
});

export function demoHtml(html, imports, assetBase = '/_gezel-demo/') {
  return injectPageDemo(html, { imports }, {
    scriptUrl: assetBase + assets[0].name,
    styleUrl: assetBase + assets[1].name,
  });
}

/** A new output directory, so exports cannot overwrite authored content. */
export async function exportDemo(pagesRoot, out, imports) {
  await mkdir(out);
  const shared = join(out, '_gezel-demo');
  await mkdir(shared);
  for (const asset of assets) await writeFile(join(shared, asset.name), asset.bytes);
  async function visit(dir, rel = '') {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      if (entry.isSymbolicLink()) throw new Error('Demo exports do not follow symlinks.');
      const next = join(rel, entry.name), source = join(dir, entry.name);
      if (entry.isDirectory()) { await visit(source, next); continue; }
      if (!entry.isFile()) continue;
      const target = join(out, 'pages', next);
      let bytes = await readFile(source);
      if (/\.html?$/i.test(next)) {
        const base = relative(dirname(target), shared).split(/[\\/]/).map(encodeURIComponent).join('/') + '/';
        bytes = Buffer.from(demoHtml(bytes.toString('utf8'), imports, base));
      }
      await mkdir(dirname(target), { recursive: true });
      await writeFile(target, bytes);
    }
  }
  await visit(pagesRoot);
}

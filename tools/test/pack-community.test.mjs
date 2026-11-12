import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import {
  CONTENT_PACK_FILENAME,
  listPackFiles,
  removeCommunityPack,
  writeCommunityPack,
} from '../pack-community.mjs';

async function tree(t, files) {
  const root = await mkdtemp(join(tmpdir(), 'gilde-pack-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  for (const [path, content] of Object.entries(files)) {
    await mkdir(join(root, ...path.split('/').slice(0, -1)), { recursive: true });
    await writeFile(join(root, ...path.split('/')), content);
  }
  return root;
}

test("writes Gezel's content pack v1, byte for byte", async (t) => {
  // Gezel's catalog loader reads this layout (packages/catalog/src/content-pack.ts
  // in bendyline/gezel). A change here that it cannot read empties the tier.
  const root = await tree(t, {
    'toolsets/b/y/manifest.json': '{"id":"y"}',
    'toolsets/a/x/manifest.json': '{"id":"x"}',
    'toolsets/raw-index.json': '[]',
  });
  const result = await writeCommunityPack(root);
  assert.deepEqual(
    { files: result.files, bytes: result.bytes },
    { files: 3, bytes: 22 },
  );
  const expected =
    '{"format":"gezel-content-pack","version":1,"files":[["toolsets/a/x/manifest.json",10],["toolsets/b/y/manifest.json",10],["toolsets/raw-index.json",2]]}\n' +
    '{"id":"x"}{"id":"y"}[]';
  assert.equal(await readFile(join(root, CONTENT_PACK_FILENAME), 'utf8'), expected);
});

test('sorts by UTF-16 code unit and never packs an earlier pack', async (t) => {
  // Uppercase sorts before lowercase and `.` before `/`, as code units do;
  // names differ beyond case so a case-insensitive filesystem keeps them all.
  const root = await tree(t, {
    'a/z.json': '3',
    'a.json': '1',
    'Z.json': '2',
    [CONTENT_PACK_FILENAME]: 'stale',
  });
  assert.deepEqual(await listPackFiles(root), ['Z.json', 'a.json', 'a/z.json']);
  await writeCommunityPack(root);
  const header = (await readFile(join(root, CONTENT_PACK_FILENAME), 'utf8')).split('\n')[0];
  assert.doesNotMatch(header, /content\.pack/);
});

test('refuses a symlink rather than dropping it', async (t) => {
  const root = await tree(t, { 'real.json': '{}' });
  try {
    await symlink(join(root, 'real.json'), join(root, 'link.json'));
  } catch {
    t.skip('this account cannot create symlinks');
    return;
  }
  await assert.rejects(listPackFiles(root), /not a regular file/);
});

test('--clean removes the pack so a checkout reads its loose files again', async (t) => {
  const root = await tree(t, { 'x.json': '{}' });
  await writeCommunityPack(root);
  await removeCommunityPack(root);
  await assert.rejects(readFile(join(root, CONTENT_PACK_FILENAME)), { code: 'ENOENT' });
  await removeCommunityPack(root);
});

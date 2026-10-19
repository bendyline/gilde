import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';
const script = readFileSync(new URL('../../data/project-types/me/media-library/versions/1.0.0/pages/media-files.js', import.meta.url), 'utf8');
function model() { const window = {}; runInNewContext(script, { window }); return window.mediaLibraryFiles; }
const file = (name, size = 10) => ({ name, kind: 'file', size, mtime: 123 });
const dir = (name) => ({ name, kind: 'dir' });
const paths = (files) => Array.from(files, (f) => f.path);
test('finds nested media, preserves unusual names, and skips derived/hidden folders', async () => {
  const folders = { '.': [file('PHOTO.JPG'), file('clip.webm'), file('notes.wav'), file('readme.md'), dir('album'), dir('.private'), dir('photo_files'), dir('node_modules')], album: [file('a & #b.svg'), file('raw.CR3'), file('../escape.jpg')] };
  const calls = [];
  const result = await model().scan(async path => { calls.push(path); return folders[path]; });
  assert.deepEqual(calls, ['.', 'album']);
  assert.deepEqual(paths(result.files), ['PHOTO.JPG', 'clip.webm', 'notes.wav', 'album/a & #b.svg', 'album/raw.CR3']);
  assert.equal(result.files[4].kind, 'image');
  assert.equal(model().browserImages.has('cr3'), false);
});
test('bounds scans and distinguishes root failure from a partial subfolder listing', async () => {
  const { scan } = model();
  await assert.rejects(scan(async () => { throw Error('denied'); }), /denied/);
  const partial = await scan(async path => { if (path === 'private') throw Error('denied'); return path === '.' ? [dir('private'), dir('public')] : [file('photo.png')]; });
  assert.equal(partial.skipped, 1); assert.deepEqual(paths(partial.files), ['public/photo.png']);
  const capped = await scan(async () => [file('a.png'), file('b.png'), dir('nested')], { maxFiles: 1 });
  assert.equal(capped.limited, true); assert.equal(capped.files.length, 1);
  let calls = 0;
  const folderCap = await scan(async () => { calls++; return [dir('one'), dir('two')]; }, { maxFolders: 2 });
  assert.equal(calls, 2); assert.equal(folderCap.limited, true);
});
test('combines kind, folder and search filters, then sorts without changing the listing', () => {
  const files = [{ path: 'album/Photo 10.jpg', kind: 'image', mtime: 3, size: 10 }, { path: 'album/Photo 2.jpg', kind: 'image', mtime: 1, size: 20 }, { path: 'album-two/Photo.jpg', kind: 'image', mtime: 2, size: 30 }, { path: 'clip.webm', kind: 'video', mtime: 4, size: 40 }];
  const { select } = model();
  assert.deepEqual(paths(select(files, { folder: 'album', query: 'PHOTO', sort: 'name', kind: 'image' })), ['album/Photo 2.jpg', 'album/Photo 10.jpg']);
  assert.deepEqual(paths(select(files, { folder: '.' })), ['clip.webm']);
  assert.equal(select(files, { sort: 'size' })[0].path, 'clip.webm');
  assert.equal(files[0].path, 'album/Photo 10.jpg');
});

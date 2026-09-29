import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { buildFileIndex, snapshotItem } from '../lib/file-index.mjs';

function withItem(files, fn) {
  const root = mkdtempSync(join(tmpdir(), 'gilde-file-index-'));
  try {
    const itemDir = join(root, 'craftbook-templates', 'ab', 'ab-book');
    for (const [rel, value] of Object.entries(files)) {
      const path = join(itemDir, rel);
      mkdirSync(join(path, '..'), { recursive: true });
      writeFileSync(path, typeof value === 'string' ? value : JSON.stringify(value));
    }
    return fn(root, itemDir);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

const identity = (extra = {}) => ({ kind: 'craftbook-template', id: 'ab-book', ...extra });
const doc = (version, extra = {}) => ({ version, releasedAt: '2026-09-01T00:00:00Z', ...extra });

test('carries the files verbatim, including keys no schema knows', () => {
  const payload = doc('1.0.0', { steps: [{ id: 'go', futureField: { any: 'shape' } }] });
  withItem({ 'manifest.json': identity({ fromTheFuture: 1 }), 'versions/1.0.0/craftbook.json': payload }, (_, dir) => {
    assert.deepEqual(snapshotItem(dir, 'craftbook-template', 'ab-book'), {
      id: 'ab-book',
      identity: identity({ fromTheFuture: 1 }),
      versions: [{ version: '1.0.0', releasedAt: '2026-09-01T00:00:00Z' }],
      latest: { version: '1.0.0', file: 'craftbook.json', payload },
    });
  });
});

test('stamps every version, newest first, with its app-version floor', () => {
  withItem(
    {
      'manifest.json': identity(),
      'versions/1.0.0/craftbook.json': doc('1.0.0'),
      'versions/1.10.0/craftbook.json': doc('1.10.0', { minGezelVersion: '1.26300' }),
      'versions/1.2.0/craftbook.json': doc('1.2.0'),
    },
    (_, dir) => {
      const snapshot = snapshotItem(dir, 'craftbook-template', 'ab-book');
      assert.deepEqual(
        snapshot.versions.map((v) => [v.version, v.minGezelVersion]),
        [
          ['1.10.0', '1.26300'],
          ['1.2.0', undefined],
          ['1.0.0', undefined],
        ],
      );
      // The floor is the reader's call: the snapshot still carries 1.10.0.
      assert.equal(snapshot.latest.version, '1.10.0');
    },
  );
});

test('skips yanked and below-minimum versions when choosing the one it carries', () => {
  withItem(
    {
      'manifest.json': identity({ yankedVersions: ['2.0.0'], minSupportedVersion: '1.1.0' }),
      'versions/1.0.0/craftbook.json': doc('1.0.0'),
      'versions/1.5.0/craftbook.json': doc('1.5.0'),
      'versions/2.0.0/craftbook.json': doc('2.0.0'),
    },
    (_, dir) => assert.equal(snapshotItem(dir, 'craftbook-template', 'ab-book').latest.version, '1.5.0'),
  );
});

test('follows the folder layout: craftbook.json first, a stamp that matches its folder', () => {
  withItem(
    {
      'manifest.json': identity(),
      'versions/1.0.0/manifest.json': doc('1.0.0'),
      'versions/1.1.0/craftbook.json': doc('9.9.9'),
      'versions/1.1.0/manifest.json': doc('1.1.0', { legacy: true }),
      'versions/not-semver/craftbook.json': doc('not-semver'),
    },
    (_, dir) => {
      const snapshot = snapshotItem(dir, 'craftbook-template', 'ab-book');
      assert.deepEqual(
        snapshot.versions.map((v) => v.version),
        ['1.1.0', '1.0.0'],
      );
      assert.deepEqual(snapshot.latest, { version: '1.1.0', file: 'manifest.json', payload: doc('1.1.0', { legacy: true }) });
    },
  );
});

test('leaves out an item with no parseable identity, and an empty kind entirely', () => {
  withItem({ 'manifest.json': '{ not json', 'versions/1.0.0/craftbook.json': doc('1.0.0') }, (root, dir) => {
    assert.equal(snapshotItem(dir, 'craftbook-template', 'ab-book'), null);
    assert.equal(buildFileIndex(root, 'craftbook-template'), null);
  });
});

test('writes one deterministic compact line', () => {
  withItem({ 'manifest.json': identity(), 'versions/1.0.0/craftbook.json': doc('1.0.0') }, (root) => {
    const built = buildFileIndex(root, 'craftbook-template');
    assert.equal(built.payload.count, 1);
    assert.equal(built.text, `${JSON.stringify(built.payload)}\n`);
    assert.equal(buildFileIndex(root, 'craftbook-template').text, built.text);
  });
});

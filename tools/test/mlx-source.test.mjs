import assert from 'node:assert/strict';
import test from 'node:test';
import { isSafeRepoRelativePath, selectMlxFiles } from '../lib/mlx-source.mjs';

const tree = [
  { path: 'README.md', sizeBytes: 10 },
  { path: '4bit/config.json', sizeBytes: 20 },
  { path: '4bit/model.safetensors', sizeBytes: 40 },
  { path: '6bit/config.json', sizeBytes: 60 },
  { path: '6bit/tokenizer.json', sizeBytes: 61 },
  { path: '6bit/weights/model-00001.safetensors', sizeBytes: 62 },
  { path: '8bit/config.json', sizeBytes: 80 },
  { path: '8bit/model.safetensors', sizeBytes: 81 },
];

test('selectMlxFiles isolates one multi-quant subtree and strips its remote prefix', () => {
  const selected = selectMlxFiles(tree, '6bit');
  assert.deepEqual(
    selected.map(({ path, repoPath }) => ({ path, repoPath })),
    [
      { path: 'config.json', repoPath: '6bit/config.json' },
      { path: 'tokenizer.json', repoPath: '6bit/tokenizer.json' },
      {
        path: 'weights/model-00001.safetensors',
        repoPath: '6bit/weights/model-00001.safetensors',
      },
    ],
  );
});

test('selectMlxFiles rejects unsafe source roots and post-strip collisions', () => {
  for (const subdir of ['../6bit', '/6bit', 'quants/../6bit', 'quants\\6bit', '6bit/']) {
    assert.throws(() => selectMlxFiles(tree, subdir), /contained POSIX-style relative path/);
  }
  assert.throws(
    () =>
      selectMlxFiles(
        [
          { path: '6bit/config.json', sizeBytes: 1 },
          { path: '6bit/config.json', sizeBytes: 2 },
        ],
        '6bit',
      ),
    /duplicate MLX install path/,
  );
});

test('isSafeRepoRelativePath accepts contained nesting and rejects traversal', () => {
  assert.equal(isSafeRepoRelativePath('quants/6bit'), true);
  assert.equal(isSafeRepoRelativePath('weights/model.safetensors'), true);
  assert.equal(isSafeRepoRelativePath('../weights'), false);
  assert.equal(isSafeRepoRelativePath('weights//model'), false);
  assert.equal(isSafeRepoRelativePath('weights\nmodel'), false);
});

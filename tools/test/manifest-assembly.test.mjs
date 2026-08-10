import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import {
  applyJsonMergePatch,
  assembleManifest,
  providerBlocksWithoutRevision,
} from '../lib/manifest-assembly.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..', '..');
const DATA_DIR = join(ROOT, 'data', 'chat-models');
const CONFIG_DIR = join(ROOT, 'authoring', 'chat-models');

const cfg = {
  id: 'demo',
  name: 'Demo',
  description: 'd',
  tags: ['a'],
  category: 'general',
  maintainer: { name: 'x' },
  version: '1.0.0',
  updatedAt: '2026-01-01T00:00:00Z',
  license: 'MIT',
  parameterSize: '8B',
  approxSizeBytes: 1,
  supportsTools: true,
  contextWindow: 4096,
  upstream: 'https://example.com',
  tuning: { sampling: { temperature: 0.5 } },
  behaviors: ['seed-behavior'],
};
const freshLlama = { huggingfaceRepo: 'org/repo-GGUF', shards: [], approxSizeBytes: 10 };

test('assembleManifest seeds a new identity from its Gilde recipe', () => {
  const { manifest } = assembleManifest({
    cfg,
    providerBlocks: { llamaCpp: { ...freshLlama } },
  });
  assert.equal(manifest.name, 'Demo');
  assert.deepEqual(manifest.tuning, cfg.tuning);
  assert.deepEqual(manifest.llamaCpp, freshLlama);
});

test('assembleManifest preserves eval-tuned fields and revision pins', () => {
  const existing = {
    ...cfg,
    tuning: { sampling: { temperature: 0.7 }, reasoning: { thinkingBudget: 4096 } },
    llamaCpp: { huggingfaceRepo: 'org/repo-GGUF', revision: 'abc123', shards: [] },
  };
  const { manifest, preservedFromManifest, carriedRevisions } = assembleManifest({
    cfg,
    providerBlocks: { llamaCpp: { ...freshLlama } },
    existing,
  });
  assert.deepEqual(manifest.tuning, existing.tuning);
  assert.equal(manifest.llamaCpp.revision, 'abc123');
  assert.deepEqual(Object.keys(manifest.llamaCpp), [
    'huggingfaceRepo',
    'revision',
    'shards',
    'approxSizeBytes',
  ]);
  assert.ok(preservedFromManifest.includes('tuning'));
  assert.deepEqual(carriedRevisions, ['llamaCpp']);
});

test('assembleManifest does not carry a revision across a repo change', () => {
  const { manifest, carriedRevisions } = assembleManifest({
    cfg,
    providerBlocks: { llamaCpp: { ...freshLlama, huggingfaceRepo: 'org/new-GGUF' } },
    existing: {
      ...cfg,
      llamaCpp: { huggingfaceRepo: 'org/old-GGUF', revision: 'abc123', shards: [] },
    },
  });
  assert.equal(manifest.llamaCpp.revision, undefined);
  assert.deepEqual(carriedRevisions, []);
});

test('applyJsonMergePatch preserves evolved siblings and removes null keys', () => {
  const original = {
    tuning: {
      sampling: { temperature: 0.7 },
      engine: { llamaCpp: { contextSize: 65536, spec: { type: 'draft-simple' } } },
    },
  };
  const patched = applyJsonMergePatch(original, {
    tuning: { engine: { llamaCpp: { spec: { type: null, mtp: true } } } },
  });
  assert.deepEqual(patched, {
    tuning: {
      sampling: { temperature: 0.7 },
      engine: { llamaCpp: { contextSize: 65536, spec: { mtp: true } } },
    },
  });
  assert.equal(original.tuning.engine.llamaCpp.spec.type, 'draft-simple');
});

function configsById() {
  const out = new Map();
  for (const filename of readdirSync(CONFIG_DIR)) {
    if (!filename.endsWith('.json')) continue;
    const recipe = JSON.parse(readFileSync(join(CONFIG_DIR, filename), 'utf8'));
    if (typeof recipe.id === 'string') out.set(recipe.id, recipe);
  }
  return out;
}

function currentManifests() {
  const out = [];
  for (const prefix of readdirSync(DATA_DIR, { withFileTypes: true })) {
    if (!prefix.isDirectory()) continue;
    for (const entry of readdirSync(join(DATA_DIR, prefix.name), { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const path = join(DATA_DIR, prefix.name, entry.name, 'manifest.json');
      if (existsSync(path)) out.push({ id: entry.name, path });
    }
  }
  return out;
}

test('every current model has a recipe and survives a provider refresh without data loss', () => {
  const configs = configsById();
  const manifests = currentManifests();
  assert.ok(manifests.length >= 20);
  for (const { id, path } of manifests) {
    const manifest = JSON.parse(readFileSync(path, 'utf8'));
    const recipe = configs.get(manifest.id ?? id);
    assert.ok(recipe, `no authoring/chat-models recipe for ${id}`);
    const { manifest: rebuilt } = assembleManifest({
      cfg: recipe,
      providerBlocks: providerBlocksWithoutRevision(manifest),
      existing: manifest,
    });
    assert.deepEqual(rebuilt, manifest, `${id} loses data during a provider refresh`);
  }
});

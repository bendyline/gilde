import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const VALIDATE = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'validate.mjs');

const identity = (overrides = {}) => ({
  schemaVersion: 1,
  kind: 'video-model',
  id: 'wan2.2-ti2v-5b-q4',
  name: 'Wan 2.2 TI2V-5B (Q4)',
  description: 'A compact model that turns text or a still image into video.',
  tags: ['wan', 'text-to-video'],
  maintainer: { name: 'Alibaba / Wan-AI' },
  license: 'Apache 2.0',
  licenseClass: 'open',
  yankedVersions: [],
  family: 'wan',
  engine: 'sd-cpp',
  architecture: 'wan2.2-ti2v-5b',
  minGezelVersion: '1.26330.0',
  sdCpp: { sampler: 'euler', flowShift: 5 },
  supportsImageToVideo: true,
  commercialUse: true,
  ...overrides,
});

const file = (name, role, extras = {}) => ({
  name,
  sha256: 'a'.repeat(64),
  sizeBytes: 1_000_000,
  ...(role ? { role } : {}),
  ...extras,
});

const WAN_FILES = [
  file('Wan2.2-TI2V-5B-Q4_K_M.gguf', 'diffusion_model'),
  file('umt5-xxl-encoder-Q4_K_M.gguf', 't5xxl'),
  file('wan2.2_vae.safetensors', 'vae', { tensors: { floatElements: { F32: 1_000 }, otherBytes: 0 } }),
];

/** Validate one video model and return the rules it broke. */
function rulesFor(identityBody, files) {
  const root = mkdtempSync(join(tmpdir(), 'gilde-video-engine-'));
  try {
    const dir = join(root, 'video-models', identityBody.id.slice(0, 2), identityBody.id);
    mkdirSync(join(dir, 'versions', '1.0.0'), { recursive: true });
    writeFileSync(join(dir, 'manifest.json'), JSON.stringify(identityBody, null, 2));
    writeFileSync(
      join(dir, 'versions', '1.0.0', 'manifest.json'),
      JSON.stringify(
        {
          schemaVersion: 1,
          version: '1.0.0',
          releasedAt: '2026-11-09T00:00:00Z',
          source: { huggingfaceRepo: 'example/repo', files, approxSizeBytes: 3_000_000 },
        },
        null,
        2,
      ),
    );
    let out;
    try {
      out = execFileSync(process.execPath, [VALIDATE, `--root=${root}`, '--json'], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      });
    } catch (err) {
      out = err.stdout;
    }
    return JSON.parse(out).map((f) => f.rule);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

test('a complete sd-cpp Wan entry passes', () => {
  assert.deepEqual(rulesFor(identity(), WAN_FILES), []);
});

test('an sd-cpp entry must set minGezelVersion and name its architecture', () => {
  const { minGezelVersion: _floor, architecture: _arch, ...bare } = identity();
  const rules = rulesFor(bare, WAN_FILES);
  assert.ok(rules.includes('video-sd-cpp-floor'));
  assert.ok(rules.includes('video-missing-architecture'));
});

test('every file of an sd-cpp entry names a distinct slot', () => {
  const rules = rulesFor(identity(), [
    file('Wan2.2-TI2V-5B-Q4_K_M.gguf', 'diffusion_model'),
    file('umt5-xxl-encoder-Q4_K_M.gguf'),
    file('other.gguf', 'diffusion_model'),
  ]);
  assert.ok(rules.includes('video-sd-cpp-role'));
  assert.ok(rules.includes('video-sd-cpp-duplicate-role'));
});

test('a Wan entry without its text encoder or decoder is refused', () => {
  const rules = rulesFor(identity(), [file('Wan2.2-TI2V-5B-Q4_K_M.gguf', 'diffusion_model')]);
  assert.equal(rules.filter((r) => r === 'video-sd-cpp-role').length, 2);
});

test('only weight files belong in an sd-cpp entry', () => {
  const rules = rulesFor(identity(), [...WAN_FILES, file('README.md', 'llm')]);
  assert.ok(rules.includes('video-sd-cpp-format'));
});

test('engine-specific fields stay with their engine', () => {
  const diffusers = identity({ engine: 'diffusers', promptFormat: 'text', minGezelVersion: undefined });
  assert.ok(rulesFor(diffusers, [file('transformer/model.safetensors')]).includes('video-sd-cpp-only'));
  assert.ok(rulesFor(identity({ load: { strategy: 'diffusers-tree' } }), WAN_FILES).includes('video-load-diffusers-only'));
  const lingbotOnDiffusers = identity({ family: 'lingbot', engine: undefined, sdCpp: undefined, minGezelVersion: undefined });
  assert.ok(rulesFor(lingbotOnDiffusers, [file('transformer/model.safetensors')]).includes('video-sd-cpp-family'));
});

test('a model that only animates pictures must accept one', () => {
  const rules = rulesFor(identity({ supportsImageToVideo: false, imageToVideoOnly: true }), WAN_FILES);
  assert.ok(rules.includes('video-i2v-only-needs-i2v'));
});

test('a LingBot entry ships the full vae, never a tae sd.cpp cannot decode', () => {
  const lingbot = identity({
    id: 'lingbot-video-dense-1.3b',
    family: 'lingbot',
    architecture: 'lingbot-video-1.3b',
    promptFormat: 'lingbot-caption',
  });
  const base = [file('transformer/model.safetensors', 'diffusion_model', { tensors: { floatElements: { BF16: 1_000 }, otherBytes: 0 } }), file('qwen3vl.gguf', 'llm')];
  const vae = file('wan_2.1_vae.safetensors', 'vae', { tensors: { floatElements: { F32: 1_000 }, otherBytes: 0 } });
  const tae = file('taew2_1.safetensors', 'tae', { tensors: { floatElements: { F16: 1_000 }, otherBytes: 0 } });
  assert.ok(!rulesFor(lingbot, [...base, vae]).includes('video-sd-cpp-role'));
  assert.ok(rulesFor(lingbot, [...base, vae, tae]).includes('video-sd-cpp-role'));
  assert.ok(rulesFor(lingbot, [...base, tae]).includes('video-sd-cpp-role'));
});

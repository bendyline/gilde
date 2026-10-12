import assert from 'node:assert/strict';
import test from 'node:test';
import {
  fetchWeightTensors,
  safetensorsWeightFiles,
  setTensors,
  tallySafetensorsHeader,
} from '../lib/safetensors.mjs';

// The same fixture and answer as gezel's packages/core/src/media-memory.test.ts:
// the two tallies must agree, or a model is priced differently before and
// after it is downloaded.
const FIXTURE = {
  __metadata__: { format: 'pt' },
  a: { dtype: 'F32', shape: [10, 10], data_offsets: [0, 400] },
  b: { dtype: 'BF16', shape: [5], data_offsets: [400, 410] },
  c: { dtype: 'F32', shape: [3], data_offsets: [410, 422] },
  ids: { dtype: 'I64', shape: [4], data_offsets: [422, 454] },
};

function safetensorsBytes(header, bodyBytes) {
  const json = Buffer.from(JSON.stringify(header));
  const prefix = Buffer.alloc(8);
  prefix.writeBigUInt64LE(BigInt(json.length));
  return Buffer.concat([prefix, json, Buffer.alloc(bodyBytes)]);
}

function serving(file, { ignoreRange = false } = {}) {
  const calls = [];
  const fetchImpl = async (_url, init) => {
    calls.push(init?.headers?.Range);
    const match = /^bytes=(\d+)-(\d+)$/.exec(init?.headers?.Range ?? '');
    if (ignoreRange || !match) return new Response(file, { status: 200 });
    const start = Number(match[1]);
    const end = Math.min(Number(match[2]), file.byteLength - 1);
    return new Response(file.subarray(start, end + 1), { status: 206 });
  };
  return { fetchImpl, calls };
}

test('tallies float elements by dtype and keeps other tensors at their stored size', () => {
  assert.deepEqual(tallySafetensorsHeader(FIXTURE), {
    floatElements: { F32: 103, BF16: 5 },
    otherBytes: 32,
  });
});

test('reads a published header with one ranged request', async () => {
  const file = safetensorsBytes(FIXTURE, 454);
  const { fetchImpl, calls } = serving(file);
  assert.deepEqual(await fetchWeightTensors('https://example.test/w.safetensors', file.byteLength, { fetchImpl }), {
    floatElements: { F32: 103, BF16: 5 },
    otherBytes: 32,
  });
  assert.equal(calls.length, 1);
});

test('reads the rest of a header longer than the first read', async () => {
  const big = {};
  for (let i = 0; i < 2000; i++) big[`layer.${i}.weight`] = { dtype: 'BF16', shape: [4], data_offsets: [i * 8, i * 8 + 8] };
  const file = safetensorsBytes(big, 16_000);
  const { fetchImpl, calls } = serving(file);
  const tensors = await fetchWeightTensors('https://example.test/w.safetensors', file.byteLength, { fetchImpl });
  assert.deepEqual(tensors.floatElements, { BF16: 8000 });
  assert.equal(calls.length, 2);
});

test('still reads only the header from a server that ignores Range', async () => {
  const file = safetensorsBytes(FIXTURE, 454);
  const { fetchImpl } = serving(file, { ignoreRange: true });
  const tensors = await fetchWeightTensors('https://example.test/w.safetensors', file.byteLength, { fetchImpl });
  assert.deepEqual(tensors.floatElements, { F32: 103, BF16: 5 });
});

test('finds the safetensors weights of a video tree, at the URL the installer downloads', () => {
  const files = safetensorsWeightFiles('video-model', {
    source: {
      huggingfaceRepo: 'Org/Repo',
      revision: 'abc',
      files: [
        { name: 'model_index.json', sha256: 'x', sizeBytes: 1 },
        { name: 'vae/diffusion_pytorch_model.safetensors', sha256: 'x', sizeBytes: 9, repo: 'Org/Other' },
      ],
    },
  });
  assert.deepEqual(
    files.map((f) => [f.pointer, f.url]),
    [['/source/files/1', 'https://huggingface.co/Org/Other/resolve/abc/vae/diffusion_pytorch_model.safetensors?download=true']],
  );
});

test('finds an image model’s safetensors main file and auxiliaries, not its GGUF or tokenizer', () => {
  const files = safetensorsWeightFiles('image-model', {
    downloadUrl: 'https://huggingface.co/a/b/resolve/main/model.gguf',
    approxSizeBytes: 5,
    auxiliaryFiles: [
      { role: 'vae', downloadUrl: 'https://huggingface.co/a/b/resolve/main/ae.safetensors', approxSizeBytes: 3 },
      { role: 'tokenizer', downloadUrl: 'https://huggingface.co/a/b/resolve/main/tokenizer.json', approxSizeBytes: 1 },
    ],
  });
  assert.deepEqual(files.map((f) => f.pointer), ['/auxiliaryFiles/0']);
});

test('writes tensors right after the size, keeping the authored key order', () => {
  const holder = { name: 'w.safetensors', sha256: 'x', sizeBytes: 9, repo: 'Org/Other' };
  setTensors(holder, 'sizeBytes', { floatElements: { F32: 1 }, otherBytes: 0 });
  assert.deepEqual(Object.keys(holder), ['name', 'sha256', 'sizeBytes', 'tensors', 'repo']);
});

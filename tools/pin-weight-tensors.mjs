#!/usr/bin/env node
/**
 * Pin the `tensors` facts of every safetensors weight file in image- and
 * video-model version manifests: the element count at every stored float
 * precision, read from each file's header with a ranged request for its
 * first bytes. Gezel prices a model's memory from them before downloading it;
 * `npm run validate` refuses a newest version without them.
 *
 * Run it on the version you are adding, after its files, shas and sizes are
 * in place. Released versions are immutable: to add facts to an older entry,
 * add a new version.
 *
 * Usage:
 *   node tools/pin-weight-tensors.mjs <manifest.json>...           fill in missing `tensors`
 *   node tools/pin-weight-tensors.mjs --verify <manifest.json>...  re-read every file, fail on a mismatch
 *
 * `HF_TOKEN` in the environment reaches a gated repo. A file that needs it
 * is one the app cannot download, so treat the error as a catalog bug too.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, sep } from 'node:path';
import process from 'node:process';
import { fetchWeightTensors, safetensorsWeightFiles, setTensors } from './lib/safetensors.mjs';

function kindOf(path) {
  const parts = resolve(path).split(sep);
  if (parts.includes('image-models')) return 'image-model';
  if (parts.includes('video-models')) return 'video-model';
  return null;
}

function sameTensors(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

async function main() {
  const args = process.argv.slice(2);
  const verify = args.includes('--verify');
  const paths = args.filter((a) => !a.startsWith('--'));
  if (paths.length === 0) {
    console.error('usage: node tools/pin-weight-tensors.mjs [--verify] <version manifest.json>...');
    process.exit(2);
  }
  let failures = 0;
  for (const path of paths) {
    const kind = kindOf(path);
    if (!kind) {
      console.error(`ERROR ${path} — not under data/image-models or data/video-models`);
      failures += 1;
      continue;
    }
    const version = JSON.parse(readFileSync(path, 'utf8'));
    let changed = 0;
    for (const file of safetensorsWeightFiles(kind, version)) {
      if (!verify && file.holder.tensors) continue;
      let tensors;
      try {
        tensors = await fetchWeightTensors(file.url, file.sizeBytes, { token: process.env.HF_TOKEN });
      } catch (error) {
        const gated = /HTTP 40[13]/.test(error.message)
          ? ' (a gated repo: the app downloads without a token, so this file cannot be installed either)'
          : '';
        console.error(`ERROR ${path} #${file.pointer} — ${error.message}${gated}`);
        failures += 1;
        continue;
      }
      if (verify) {
        if (!sameTensors(file.holder.tensors, tensors)) {
          console.error(`ERROR ${path} #${file.pointer} — pinned tensors do not match the published header`);
          failures += 1;
        }
        continue;
      }
      setTensors(file.holder, file.sizeKey, tensors);
      changed += 1;
    }
    if (changed > 0) {
      writeFileSync(path, `${JSON.stringify(version, null, 2)}\n`);
      console.log(`pinned ${changed} file(s) in ${path}`);
    } else if (!verify) {
      console.log(`nothing to pin in ${path}`);
    }
  }
  if (verify && failures === 0) console.log(`verified ${paths.length} manifest(s)`);
  process.exit(failures > 0 ? 1 : 0);
}

await main();

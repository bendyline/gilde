#!/usr/bin/env node
/**
 * Port of gezel packages/catalog/scripts/build-index.ts for the gilde
 * content repo. Emits one compact index.json per kind directory under
 * data/ and data/community/ so consumers can answer catalog listings
 * from one read instead of walking ~3,800 manifest folders.
 *
 * Byte-compatibility with gezel's generator is the contract: same merge
 * semantics (lib/manifest-merge.mjs), same entry sort
 * (manifest.name.localeCompare), same compact one-line JSON + trailing
 * newline, no generatedAt timestamp.
 *
 * Usage:
 *   node tools/build-index.mjs                 rebuild + write all indexes
 *   node tools/build-index.mjs --check         rebuild in memory, byte-compare
 *                                              against the committed files,
 *                                              report drift, exit 1 on any
 *   node tools/build-index.mjs --kind=toolset  limit to one kind (repeatable)
 *   node tools/build-index.mjs --root=DIR      override data roots (repeatable)
 *   node tools/build-index.mjs --verbose       per-item skip logging
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { categorizeToolset } from './lib/categorize.mjs';
import { loadResolvedManifest } from './lib/manifest-merge.mjs';
import { KINDS, KIND_DIR, listItems } from './lib/walk.mjs';

function parseArgs(argv) {
  const out = { kinds: [...KINDS], roots: [], verbose: false, check: false };
  const explicitKinds = [];
  for (const raw of argv) {
    if (raw === '--verbose' || raw === '-v') out.verbose = true;
    else if (raw === '--check') out.check = true;
    else if (raw === '--help' || raw === '-h') {
      printHelp();
      process.exit(0);
    } else if (raw.startsWith('--kind=')) {
      const k = raw.slice('--kind='.length);
      if (!KINDS.includes(k)) {
        throw new Error(`unknown --kind: ${k}. valid: ${KINDS.join(', ')}`);
      }
      explicitKinds.push(k);
    } else if (raw.startsWith('--root=')) {
      out.roots.push(resolve(raw.slice('--root='.length)));
    } else if (!raw.startsWith('--')) {
      out.roots.push(resolve(raw));
    } else {
      throw new Error(`unknown arg: ${raw}`);
    }
  }
  if (explicitKinds.length > 0) out.kinds = explicitKinds;
  if (out.roots.length === 0) {
    const here = dirname(fileURLToPath(import.meta.url));
    const dataDir = resolve(here, '..', 'data');
    out.roots = [dataDir, join(dataDir, 'community')];
  }
  return out;
}

function printHelp() {
  console.log(`build-index - emit per-kind index.json files for the catalog.

Flags:
  --kind=<k>      Limit to one kind (repeatable). Default: all.
  --root=<dir>    Override the data root (repeatable). Default:
                  data and data/community.
  --check         Rebuild in memory and byte-compare against the
                  committed index files; report drift and exit 1.
  --verbose       Per-item logging.
  --help          This message.
`);
}

function toIndexEntry(kind, manifest) {
  if (kind === 'toolset' && !manifest.category) {
    manifest = {
      ...manifest,
      category: categorizeToolset({
        id: manifest.id,
        name: manifest.name,
        description: manifest.description,
        tags: manifest.tags,
        maintainerName: manifest.maintainer?.name,
      }),
    };
  }
  return { manifest };
}

function buildKindIndex(root, kind, verbose) {
  const entries = [];
  for (const item of listItems(root, kind)) {
    const resolved = loadResolvedManifest(item.itemDir, kind, item.id);
    if (resolved.manifest) {
      entries.push(toIndexEntry(kind, resolved.manifest));
    } else if (verbose && resolved.skip !== 'tombstoned') {
      console.warn(
        `  skip ${rootLabel(root)}/${KIND_DIR[kind]}/${item.shard}/${item.id}: ${resolved.skip}` +
          (resolved.errors ? ` (${resolved.errors[0]})` : ''),
      );
    }
  }
  if (entries.length === 0) return null;
  entries.sort((a, b) => a.manifest.name.localeCompare(b.manifest.name));
  const payload = { schemaVersion: 1, kind, count: entries.length, entries };
  // Compact one-line JSON + newline at EOF, no generatedAt - matches the
  // gezel generator so the files stay byte-identical across rebuilds.
  return { payload, text: `${JSON.stringify(payload)}\n` };
}

function rootLabel(root) {
  const idx = root.lastIndexOf('data');
  return idx >= 0 ? root.slice(idx) : root;
}

function reportDrift(root, kind, builtPayload, committedText) {
  const label = `${rootLabel(root)}/${KIND_DIR[kind]}/index.json`;
  let committed;
  try {
    committed = JSON.parse(committedText);
  } catch {
    console.error(`  ${label}: committed file is not valid JSON`);
    return;
  }
  const builtById = new Map((builtPayload?.entries ?? []).map((e) => [e.manifest.id, e]));
  const committedById = new Map((committed.entries ?? []).map((e) => [e.manifest.id, e]));
  const added = [...builtById.keys()].filter((id) => !committedById.has(id));
  const removed = [...committedById.keys()].filter((id) => !builtById.has(id));
  const changed = [...builtById.keys()].filter(
    (id) =>
      committedById.has(id) &&
      JSON.stringify(builtById.get(id)) !== JSON.stringify(committedById.get(id)),
  );
  console.error(`  DRIFT ${label}:`);
  if (added.length) console.error(`    added (${added.length}): ${added.join(', ')}`);
  if (removed.length) console.error(`    removed (${removed.length}): ${removed.join(', ')}`);
  if (changed.length) console.error(`    changed (${changed.length}): ${changed.join(', ')}`);
  if (!added.length && !removed.length && !changed.length) {
    // Same entries, different bytes: ordering or top-level fields.
    const b = (builtPayload?.entries ?? []).map((e) => e.manifest.id).join(',');
    const c = (committed.entries ?? []).map((e) => e.manifest.id).join(',');
    if (b !== c) console.error('    entry ORDER differs');
    else console.error('    byte difference outside entries (schemaVersion/kind/count/whitespace)');
  }
}

function main() {
  const startedAt = Date.now();
  let args;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (err) {
    console.error(`build-index: ${err.message}`);
    printHelp();
    process.exit(2);
  }

  const results = [];
  let driftCount = 0;
  for (const root of args.roots) {
    for (const kind of args.kinds) {
      const built = buildKindIndex(root, kind, args.verbose);
      const outputPath = join(root, KIND_DIR[kind], 'index.json');
      if (args.check) {
        let committedText = null;
        try {
          committedText = readFileSync(outputPath, 'utf8');
        } catch {
          // absent committed index
        }
        if (built === null && committedText === null) continue;
        if (built === null) {
          console.error(`  DRIFT ${rootLabel(root)}/${KIND_DIR[kind]}/index.json: committed file exists but rebuild produced zero entries`);
          driftCount++;
          continue;
        }
        if (committedText === null) {
          console.error(`  DRIFT ${rootLabel(root)}/${KIND_DIR[kind]}/index.json: missing committed file (rebuild has ${built.payload.count} entries)`);
          driftCount++;
          continue;
        }
        if (committedText === built.text) {
          results.push({ root, kind, count: built.payload.count, outputPath, ok: true });
        } else {
          driftCount++;
          reportDrift(root, kind, built.payload, committedText);
        }
      } else {
        if (built === null) {
          if (args.verbose) console.warn(`  ${rootLabel(root)}/${KIND_DIR[kind]}: empty - skipping index`);
          continue;
        }
        writeFileSync(outputPath, built.text, 'utf8');
        results.push({ root, kind, count: built.payload.count, outputPath });
      }
    }
  }

  const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);
  if (args.check) {
    console.log(`\n=== build-index --check summary (${elapsed}s) ===`);
    for (const r of results) {
      console.log(`  ok ${rootLabel(r.root)}/${KIND_DIR[r.kind]}: ${r.count} entries match`);
    }
    if (driftCount > 0) {
      console.error(`\n${driftCount} index file(s) drifted from a clean rebuild.`);
      console.error('Fix the tooling or the offending manifests; never hand-edit index.json.');
      process.exit(1);
    }
    console.log('  all indexes match a clean rebuild');
  } else {
    console.log(`\n=== build-index summary (${elapsed}s) ===`);
    for (const r of results) {
      console.log(`  ${rootLabel(r.root)}/${KIND_DIR[r.kind]}: ${r.count} entries -> ${r.outputPath}`);
    }
    if (results.length === 0) console.log('  (no kind directories found in any root)');
  }
}

main();

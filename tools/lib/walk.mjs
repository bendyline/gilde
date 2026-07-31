import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { isSemver } from './semver.mjs';

// Singular wire kinds, in the canonical build order used by gezel's
// build-index script. Order matters only for reporting consistency.
export const KINDS = [
  'toolset',
  'gezel-template',
  'craftbook-template',
  'project-type',
  'connector-type',
  'chat-model',
  'image-model',
  'video-model',
];

export const KIND_DIR = {
  toolset: 'toolsets',
  'gezel-template': 'gezel-templates',
  'craftbook-template': 'craftbook-templates',
  'project-type': 'project-types',
  'connector-type': 'connector-types',
  'chat-model': 'chat-models',
  'image-model': 'image-models',
  'video-model': 'video-models',
};

export const DIR_KIND = Object.fromEntries(Object.entries(KIND_DIR).map(([k, d]) => [d, k]));

export function shardPrefix(id) {
  return id.slice(0, 2).toLowerCase();
}

// Filesystem droppings that macOS/Windows scatter through checkouts. They
// are gitignored, never committed, and must not fail a local validate run.
const OS_JUNK_NAMES = new Set(['.DS_Store', 'Thumbs.db', 'desktop.ini', '.localized']);

/** True for OS-generated files that are not part of the catalog. */
export function isOsJunk(name) {
  return OS_JUNK_NAMES.has(name) || name.startsWith('._');
}

function safeReaddir(dir, opts) {
  try {
    return readdirSync(dir, opts);
  } catch (err) {
    if (err.code === 'ENOENT' || err.code === 'ENOTDIR') return null;
    throw err;
  }
}

/**
 * Enumerate the items of one kind under one catalog root. Shards and ids
 * are iterated in sorted order so output is deterministic across
 * filesystems (readdir order is not portable); the committed indexes'
 * name-tie ordering matches sorted id order.
 *
 * Returns [{ root, kind, kindDir, shard, id, itemDir, versions }] where
 * versions is the list of semver-named subdirectory names (unsorted
 * filtering only; payload checks happen in manifest-merge).
 */
export function listItems(root, kind) {
  const kindDir = KIND_DIR[kind];
  const base = join(root, kindDir);
  const shards = safeReaddir(base, { withFileTypes: true });
  if (!shards) return [];
  const out = [];
  for (const shard of shards.map((e) => e.name).sort()) {
    if (shard === 'index.json') continue;
    const shardDir = join(base, shard);
    let st;
    try {
      st = statSync(shardDir);
    } catch {
      continue;
    }
    if (!st.isDirectory()) continue;
    const ids = safeReaddir(shardDir, { withFileTypes: true });
    if (!ids) continue;
    for (const ent of ids.filter((e) => e.isDirectory()).sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))) {
      const id = ent.name;
      const itemDir = join(shardDir, id);
      out.push({
        root,
        kind,
        kindDir,
        shard,
        id,
        itemDir,
        versions: listVersionDirs(itemDir),
      });
    }
  }
  return out;
}

/** Semver-named subdirectories of an item's versions/ folder (unsorted). */
export function listVersionDirs(itemDir) {
  const names = safeReaddir(join(itemDir, 'versions'));
  if (!names) return [];
  return names.filter((n) => isSemver(n));
}

/** Every kind directory that exists under a root, as [kind, kindDir] pairs. */
export function presentKinds(root) {
  const out = [];
  for (const kind of KINDS) {
    const dir = join(root, KIND_DIR[kind]);
    try {
      if (statSync(dir).isDirectory()) out.push([kind, KIND_DIR[kind]]);
    } catch {
      // absent kind dir - fine
    }
  }
  return out;
}

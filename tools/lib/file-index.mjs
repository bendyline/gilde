import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { isSemver, safeCompare } from './semver.mjs';
import { listItems, listVersionDirs } from './walk.mjs';

/**
 * The file-bundle index (`raw-index.json`): one per kind directory, beside
 * the legacy `index.json`. Each entry snapshots an item's own files as raw
 * JSON so a reader can list the kind with one read instead of walking every
 * item folder:
 *
 *   { id, identity, versions: [{ version, releasedAt, minGezelVersion? }],
 *     latest: { version, file, payload } }
 *
 * Nothing here knows a schema. The legacy index is gezel's resolved
 * manifest, re-derived in gilde through the committed JSON Schemas and a
 * hand-kept port of gezel's merge, so it silently lost every field either
 * copy lagged on (step `toolPolicy` on almost every craftbook, for one). This
 * one carries the files verbatim; gezel resolves them with the same code it
 * runs over the folders, so gilde and gezel can move at different speeds.
 *
 * The only rules applied are the folder layout: a version is a semver-named
 * folder whose payload stamps that same version and a `releasedAt`, the
 * payload is `craftbook.json` (else `manifest.json`) for craftbooks and
 * `manifest.json` otherwise. `latest` is the newest version that is neither
 * yanked nor below `minSupportedVersion` — a default, not a decision: a
 * reader whose own pick differs (an app-version floor, say) reads that one
 * version from the folder.
 */

export const FILE_INDEX_FILENAME = 'raw-index.json';

function readJsonFile(path) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return undefined;
  }
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/** One item's snapshot, or null when it has no parseable identity. */
export function snapshotItem(itemDir, kind, id) {
  const identity = readJsonFile(join(itemDir, 'manifest.json'));
  if (!isRecord(identity)) return null;
  const candidates = kind === 'craftbook-template' ? ['craftbook.json', 'manifest.json'] : ['manifest.json'];
  const versions = [];
  const payloads = new Map();
  for (const name of listVersionDirs(itemDir)) {
    if (!isSemver(name)) continue;
    for (const file of candidates) {
      const payload = readJsonFile(join(itemDir, 'versions', name, file));
      if (!isRecord(payload)) continue;
      if (payload.version !== name || typeof payload.releasedAt !== 'string') continue;
      versions.push({
        version: name,
        releasedAt: payload.releasedAt,
        ...(typeof payload.minGezelVersion === 'string' ? { minGezelVersion: payload.minGezelVersion } : {}),
      });
      payloads.set(name, { file, payload });
      break;
    }
  }
  versions.sort((a, b) => safeCompare(b.version, a.version));
  const yanked = new Set(Array.isArray(identity.yankedVersions) ? identity.yankedVersions : []);
  const floor = typeof identity.minSupportedVersion === 'string' ? identity.minSupportedVersion : null;
  const latest = versions.find(
    (v) => !yanked.has(v.version) && (!floor || safeCompare(v.version, floor) >= 0),
  );
  return {
    id,
    identity,
    versions,
    ...(latest ? { latest: { version: latest.version, ...payloads.get(latest.version) } } : {}),
  };
}

/** The file-bundle index for one kind under one data root, or null when empty. */
export function buildFileIndex(root, kind) {
  const items = [];
  for (const item of listItems(root, kind)) {
    const snapshot = snapshotItem(item.itemDir, kind, item.id);
    if (snapshot) items.push(snapshot);
  }
  if (items.length === 0) return null;
  const payload = { format: 'gilde-file-index', schemaVersion: 1, kind, count: items.length, items };
  return { payload, text: `${JSON.stringify(payload)}\n` };
}

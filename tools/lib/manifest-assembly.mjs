/**
 * Non-lossy chat-model manifest assembly for the Gilde authoring workflow.
 *
 * Authoring recipes seed identity/editorial metadata and point at provider
 * sources. Existing manifests remain authoritative for eval-tuned fields and
 * revision pins; freshly fetched provider file metadata is the only data a
 * normal rebuild replaces. Pass `reseed: true` for an intentional editorial
 * reset from the recipe.
 */

export const BASE_FIELDS = [
  'name',
  'description',
  'tags',
  'category',
  'maintainer',
  'version',
  'updatedAt',
  'license',
  'licenseClass',
  'licenseShortName',
  'licenseUrl',
  'recoScore',
  'parameterSize',
  'approxSizeBytes',
  'supportsTools',
  'contextWindow',
  'kvBytesPerTokenF16',
  'kvFixedBytesF16',
  'upstream',
];

export const EDITORIAL_FIELDS = [
  'style',
  'behaviors',
  'tuning',
  'evalHints',
  'minGezelVersion',
];

export const PROVIDER_FIELDS = ['ollama', 'llamaCpp', 'mlx', 'ds4'];

/** Insert a revision directly after huggingfaceRepo to keep disk diffs stable. */
export function carryRevision(block, revision) {
  const out = {};
  for (const [key, value] of Object.entries(block)) {
    out[key] = value;
    if (key === 'huggingfaceRepo') out.revision = revision;
  }
  if (!('revision' in out)) out.revision = revision;
  return out;
}

/** Apply an RFC 7396-style JSON Merge Patch without mutating either input. */
export function applyJsonMergePatch(target, patch) {
  const out = { ...target };
  for (const [key, value] of Object.entries(patch)) {
    if (value === null) {
      delete out[key];
      continue;
    }
    const current = out[key];
    if (
      typeof value === 'object' &&
      value !== null &&
      !Array.isArray(value) &&
      typeof current === 'object' &&
      current !== null &&
      !Array.isArray(current)
    ) {
      out[key] = applyJsonMergePatch(current, value);
    } else if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      out[key] = applyJsonMergePatch({}, value);
    } else {
      out[key] = value;
    }
  }
  return out;
}

export function assembleManifest(input) {
  const { cfg, providerBlocks, existing = null, reseed = false } = input;
  const manifest = {
    schemaVersion: 1,
    kind: 'chat-model',
    id: cfg.id,
  };
  const preservedFromManifest = [];
  const carriedRevisions = [];

  for (const field of [...BASE_FIELDS, ...EDITORIAL_FIELDS]) {
    const fromExisting = existing?.[field];
    const fromCfg = cfg[field];
    const hasExisting = fromExisting !== undefined;
    const hasCfg = fromCfg !== undefined;
    if (reseed) {
      if (hasCfg) manifest[field] = fromCfg;
      else if (hasExisting) {
        manifest[field] = fromExisting;
        preservedFromManifest.push(field);
      }
    } else if (hasExisting) {
      manifest[field] = fromExisting;
      if (!hasCfg || JSON.stringify(fromExisting) !== JSON.stringify(fromCfg)) {
        preservedFromManifest.push(field);
      }
    } else if (hasCfg) {
      manifest[field] = fromCfg;
    }
  }

  for (const key of PROVIDER_FIELDS) {
    const fresh = providerBlocks[key];
    if (!fresh) continue;
    const previousBlock = existing?.[key];
    const previousRevision = previousBlock?.revision;
    const sameRepo =
      previousBlock?.huggingfaceRepo === undefined ||
      fresh.huggingfaceRepo === previousBlock.huggingfaceRepo;
    if (typeof previousRevision === 'string' && fresh.revision === undefined && sameRepo) {
      manifest[key] = carryRevision(fresh, previousRevision);
      carriedRevisions.push(key);
    } else {
      manifest[key] = fresh;
    }
  }

  return { manifest, preservedFromManifest, carriedRevisions };
}

export function providerBlocksWithoutRevision(manifest) {
  const out = {};
  for (const key of PROVIDER_FIELDS) {
    const block = manifest[key];
    if (!block) continue;
    const { revision: _drop, ...rest } = block;
    out[key] = rest;
  }
  return out;
}

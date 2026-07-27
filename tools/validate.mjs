#!/usr/bin/env node
/**
 * Full-tree validation for the gilde content repo. Collects ALL findings
 * (never fail-fast), renders them human-readable (default), as GitHub
 * workflow annotations (--github), or as JSON (--json). Errors exit 1;
 * warnings alone exit 0.
 *
 * Layers:
 *   1. Parse/hygiene - UTF-8, extension allowlist, JSON parses, size caps
 *   2. Schema        - ajv (draft 2020-12) against schemas/*.schema.json
 *   3. Layout        - shard/id/kind/version-folder invariants
 *   4. Cross-checks  - craftbook graph, file references, model sources
 *   5. Community     - permissive-license policy for data/community/**
 *
 * Severity triage rule: a finding is an ERROR when it would also break
 * gezel's runtime (the Zod parse or the catalog merge); schema-only
 * strictness (the exported JSON Schema disagreeing with the tolerant
 * runtime) is a WARN. See the schema layer for the mechanics.
 */

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { basename, dirname, extname, join, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import { PERMISSIVE_LICENSES } from './lib/licenses.mjs';
import { discoverVersionFolders, loadIdentity } from './lib/manifest-merge.mjs';
import { loadSchema, zodParse } from './lib/jsonshape.mjs';
import { makeCollector, render } from './lib/report.mjs';
import { collectSeedExemptFiles } from './lib/seeds.mjs';
import { isSemver, safeCompare } from './lib/semver.mjs';
import { DIR_KIND, KIND_DIR, listItems, presentKinds } from './lib/walk.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, '..');
const ONE_MB = 1024 * 1024;
const BINARY_EXTENSIONS = new Set(['.webp']);
const ALLOWED_EXTENSIONS = new Set(['.json', '.md', '.html', '.svg', ...BINARY_EXTENSIONS]);
const HF_URL_PREFIX = 'https://huggingface.co/';
const URI_TEMPLATE_VARIABLE = /\{[A-Za-z_][A-Za-z0-9_-]*\}/g;

function parseArgs(argv) {
  const out = { mode: 'human', root: join(REPO_ROOT, 'data') };
  for (const raw of argv) {
    if (raw === '--github') out.mode = 'github';
    else if (raw === '--json') out.mode = 'json';
    else if (raw.startsWith('--root=')) out.root = resolve(raw.slice('--root='.length));
    else {
      console.error(`validate: unknown arg ${raw}`);
      console.error('usage: node tools/validate.mjs [--github] [--json] [--root=data]');
      process.exit(2);
    }
  }
  return out;
}

function walkFiles(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) =>
    a.name < b.name ? -1 : a.name > b.name ? 1 : 0,
  )) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) walkFiles(p, out);
    else out.push(p);
  }
  return out;
}

const utf8Strict = new TextDecoder('utf-8', { fatal: true });

function main() {
  const startedAt = Date.now();
  const args = parseArgs(process.argv.slice(2));
  const dataRoot = args.root;
  const c = makeCollector(REPO_ROOT);
  const jsonCache = new Map();

  const readJson = (path) => {
    let cached = jsonCache.get(path);
    if (cached === undefined) {
      try {
        cached = { ok: true, value: JSON.parse(readFileSync(path, 'utf8')) };
      } catch (err) {
        cached = { ok: false, error: err.message };
      }
      jsonCache.set(path, cached);
    }
    return cached;
  };

  // ── Layer 1: parse/hygiene over every file in the tree ─────────────
  const seedExempt = collectSeedExemptFiles(dataRoot);
  const allFiles = walkFiles(dataRoot);
  for (const path of allFiles) {
    const name = basename(path);
    const ext = extname(path).toLowerCase();
    // .gitkeep is a conventional git placeholder for otherwise-empty
    // directories; allowed by name rather than widening the extension list.
    if (name !== '.gitkeep' && !ALLOWED_EXTENSIONS.has(ext)) {
      c.error(path, '', 'ext-not-allowed', `extension "${ext || name}" is not in json/md/html/svg/webp`);
      continue;
    }
    const buf = readFileSync(path);
    if (!BINARY_EXTENSIONS.has(ext)) {
      if (buf.includes(0)) {
        c.error(path, '', 'binary-file', 'contains NUL bytes');
        continue;
      }
      try {
        utf8Strict.decode(buf);
      } catch {
        c.error(path, '', 'not-utf8', 'not valid UTF-8');
        continue;
      }
    }
    if (name !== 'index.json' && buf.length > ONE_MB) {
      c.error(path, '', 'file-too-large', `${buf.length} bytes exceeds the 1 MB cap`);
    }
    if (ext === '.json' && !seedExempt.has(path)) {
      const parsed = readJson(path);
      if (!parsed.ok) c.error(path, '', 'json-parse-failed', parsed.error);
    }
  }

  // ── Layer 2 setup: ajv, one compilation per schema ─────────────────
  const ajv = new Ajv2020.default({ strict: false, allErrors: true });
  addFormats.default(ajv);
  // Registry-authored HTTP MCP URLs may contain runtime-substituted
  // variables such as https://{host}/mcp or ?key={api_key}. Validate the
  // expanded shape as a URI while still rejecting malformed templates and
  // ordinary invalid URLs. The runtime intentionally accepts these strings.
  const strictUriFormat = ajv.formats.uri;
  ajv.formats.uri = (value) => {
    if (strictUriFormat(value)) return true;
    const expanded = value.replace(URI_TEMPLATE_VARIABLE, 'template-value');
    return expanded !== value && !/[{}]/.test(expanded) && strictUriFormat(expanded);
  };
  const validators = new Map();
  const validatorFor = (schemaName) => {
    let v = validators.get(schemaName);
    if (!v) {
      v = ajv.compile(loadSchema(schemaName));
      validators.set(schemaName, v);
    }
    return v;
  };
  // On a failed oneOf, ajv reports every branch's complaints. Surface
  // format-keyword errors first (formats are the only place the exported
  // schema is stricter than the runtime parse, so they are usually the
  // real cause), then the deepest instancePath (the branch the payload
  // was actually trying to be).
  const ajvErrors = (validate) =>
    [...(validate.errors ?? [])]
      .sort(
        (a, b) =>
          (b.keyword === 'format') - (a.keyword === 'format') ||
          b.instancePath.length - a.instancePath.length,
      )
      .slice(0, 3)
      .map((e) => `${e.instancePath || '/'} ${e.message}`)
      .join('; ');

  /**
   * Validate a payload against an exported schema. When ajv rejects but
   * the runtime-equivalent parse (lib/jsonshape.mjs, which mirrors what
   * gezel's Zod actually enforces) accepts, the schema is being stricter
   * than the runtime - that is a WARN per the triage rule, not an ERROR.
   */
  const checkSchema = (path, schemaName, payload, pointerPrefix = '') => {
    const validate = validatorFor(schemaName);
    if (validate(payload)) return true;
    const detail = ajvErrors(validate);
    if (zodParse(loadSchema(schemaName), payload).ok) {
      c.warn(path, pointerPrefix, 'schema-stricter-than-runtime', `${schemaName}: ${detail}`);
      return true;
    }
    c.error(path, pointerPrefix, 'schema', `${schemaName}: ${detail}`);
    return false;
  };

  // Toolset ids for craftbook toolset-need resolution (WARN-level).
  const knownToolsetIds = new Set();
  for (const root of [dataRoot, join(dataRoot, 'community')]) {
    for (const item of listItems(root, 'toolset')) knownToolsetIds.add(item.id);
  }

  // Deep scan for field-shape sanity that applies wherever the field
  // occurs (sha256 pins, HF download URLs, size fields).
  const deepScan = (path, value, pointer = '') => {
    if (Array.isArray(value)) {
      value.forEach((v, i) => deepScan(path, v, `${pointer}/${i}`));
      return;
    }
    if (value === null || typeof value !== 'object') return;
    for (const [key, v] of Object.entries(value)) {
      const p = `${pointer}/${key}`;
      if (key === 'sha256' && (typeof v !== 'string' || !/^[0-9a-f]{64}$/.test(v))) {
        c.error(path, p, 'bad-sha256', 'sha256 must be 64 lowercase hex chars');
      } else if (key === 'downloadUrl' && (typeof v !== 'string' || !v.startsWith(HF_URL_PREFIX))) {
        c.error(path, p, 'non-hf-download-url', `download URLs must start with ${HF_URL_PREFIX}`);
      } else if (key === 'revision' && typeof v === 'string' && !/^[0-9a-f]{40}$/.test(v)) {
        c.warn(path, p, 'unpinned-revision', 'prefer a full 40-char commit SHA (branches/tags can drift the sha256 pins)');
      } else if (
        (key === 'approxSizeBytes' || key === 'residentBytes' || key === 'cacheExpertsBytes') &&
        typeof v === 'number' &&
        (v < 1e6 || v > 1e13)
      ) {
        c.warn(path, p, 'size-out-of-range', `${v} outside the plausible [1e6, 1e13] byte range`);
      } else if (key === 'sizeBytes' && typeof v === 'number' && (v < 1 || v > 1e13)) {
        c.warn(path, p, 'size-out-of-range', `${v} outside the plausible [1, 1e13] byte range`);
      }
      deepScan(path, v, p);
    }
  };

  // ── Layers 2-5 per catalog tier / kind / item ──────────────────────
  const tiers = [
    { root: dataRoot, community: false },
    { root: join(dataRoot, 'community'), community: true },
  ];
  for (const tier of tiers) {
    if (!existsSync(tier.root)) continue;
    for (const [kind, kindDir] of presentKinds(tier.root)) {
      const kindRoot = join(tier.root, kindDir);

      // Layout: kind root carries only index.json + 2-char shard dirs;
      // shard dirs carry only item dirs.
      for (const entry of readdirSync(kindRoot, { withFileTypes: true })) {
        if (entry.isDirectory()) {
          // A shard is the first two chars of an item id; the id grammar
          // ([a-z0-9][a-z0-9.\-:]...) allows ".", "-", ":" from the
          // second char on, so shards like "a-" are legitimate.
          if (!/^[a-z0-9][a-z0-9.:-]$/.test(entry.name)) {
            c.error(join(kindRoot, entry.name), '', 'bad-shard-dir', 'shard dirs are the first 2 chars of an item id');
          } else {
            for (const inner of readdirSync(join(kindRoot, entry.name), { withFileTypes: true })) {
              if (!inner.isDirectory()) {
                c.error(join(kindRoot, entry.name, inner.name), '', 'stray-file', 'shard level allows only item directories');
              }
            }
          }
        } else if (entry.name !== 'index.json') {
          c.error(join(kindRoot, entry.name), '', 'stray-file', 'kind level allows only index.json beside shard dirs');
        }
      }

      // The committed index for this kind.
      const indexPath = join(kindRoot, 'index.json');
      if (existsSync(indexPath)) {
        const idx = readJson(indexPath);
        if (idx.ok) {
          if (checkSchema(indexPath, 'catalog-index', idx.value)) {
            if (idx.value.kind !== kind) {
              c.error(indexPath, '/kind', 'index-kind-mismatch', `index kind "${idx.value.kind}" != directory kind "${kind}"`);
            }
            if (idx.value.count !== idx.value.entries.length) {
              c.error(indexPath, '/count', 'index-count-mismatch', `count ${idx.value.count} != ${idx.value.entries.length} entries`);
            }
          }
        }
      }

      for (const item of listItems(tier.root, kind)) {
        const manifestPath = join(item.itemDir, 'manifest.json');
        const parsed = readJson(manifestPath);
        if (!parsed.ok) {
          c.error(manifestPath, '', 'missing-identity', 'item directory has no parseable manifest.json');
          continue;
        }
        const identity = parsed.value;
        checkSchema(manifestPath, `${kind}-identity`, identity);
        deepScan(manifestPath, identity);

        // Layout invariants.
        if (identity.id !== item.id) {
          c.error(manifestPath, '/id', 'id-dir-mismatch', `manifest id "${identity.id}" != directory name "${item.id}"`);
        }
        if (item.shard !== item.id.slice(0, 2).toLowerCase()) {
          c.error(manifestPath, '', 'bad-shard', `item lives in shard "${item.shard}" but id starts with "${item.id.slice(0, 2).toLowerCase()}"`);
        }
        if (identity.kind !== kind) {
          c.error(manifestPath, '/kind', 'kind-dir-mismatch', `manifest kind "${identity.kind}" != directory kind "${kind}"`);
        }
        if (typeof identity.logo === 'string' && !/^https?:\/\//.test(identity.logo)) {
          if (!existsSync(join(item.itemDir, identity.logo))) {
            c.error(manifestPath, '/logo', 'missing-referenced-file', `logo "${identity.logo}" not found in item directory`);
          }
        }

        // Community license policy.
        if (tier.community) {
          const license = identity.license;
          if (typeof license !== 'string' || !PERMISSIVE_LICENSES.has(license)) {
            c.error(manifestPath, '/license', 'community-license', `"${license}" is not in the permissive allowlist (${[...PERMISSIVE_LICENSES].join(', ')})`);
          }
        }

        // Version folders.
        const versionsDir = join(item.itemDir, 'versions');
        const onDiskVersions = [];
        if (existsSync(versionsDir)) {
          for (const entry of readdirSync(versionsDir, { withFileTypes: true })) {
            if (!entry.isDirectory()) {
              c.error(join(versionsDir, entry.name), '', 'stray-version-entry', 'versions/ allows only semver-named directories');
              continue;
            }
            if (!isSemver(entry.name)) {
              c.error(join(versionsDir, entry.name), '', 'bad-version-dir', 'version directory name is not a semver');
              continue;
            }
            onDiskVersions.push(entry.name);
            checkVersionDir(
              item,
              kind,
              entry.name,
              join(versionsDir, entry.name),
              (identity.yankedVersions ?? []).includes(entry.name),
            );
          }
        }

        // yankedVersions must reference on-disk versions; minSupported
        // must not exceed the highest on-disk version.
        const onDisk = new Set(onDiskVersions);
        for (const y of identity.yankedVersions ?? []) {
          if (!onDisk.has(y)) {
            c.error(manifestPath, '/yankedVersions', 'yanked-unknown-version', `yanked "${y}" has no on-disk version folder`);
          }
        }
        if (typeof identity.minSupportedVersion === 'string' && onDiskVersions.length > 0) {
          const max = onDiskVersions.reduce((a, b) => (safeCompare(a, b) >= 0 ? a : b));
          if (isSemver(identity.minSupportedVersion) && safeCompare(identity.minSupportedVersion, max) > 0) {
            c.error(manifestPath, '/minSupportedVersion', 'min-supported-above-max', `minSupportedVersion ${identity.minSupportedVersion} exceeds highest on-disk version ${max}`);
          }
        }

        // Mirror the runtime's item-resolution outcome: an item that
        // yields no eligible version is silently fine when tombstoned
        // (all versions yanked), a warning otherwise.
        const runtimeIdentity = loadIdentity(item.itemDir, kind, item.id);
        if (runtimeIdentity) {
          const folders = discoverVersionFolders(item.itemDir, kind);
          const yanked = new Set(runtimeIdentity.yankedVersions);
          const eligible = folders.filter((f) => {
            if (yanked.has(f.version)) return false;
            if (runtimeIdentity.minSupportedVersion && safeCompare(f.version, runtimeIdentity.minSupportedVersion) < 0) return false;
            return true;
          });
          const tombstoned = folders.length > 0 && folders.every((f) => yanked.has(f.version));
          if (eligible.length === 0 && !tombstoned) {
            c.warn(manifestPath, '', 'no-eligible-versions', 'no version folder passes the payload/yank/min-supported filters; the item is invisible to consumers');
          }
        }
      }
    }
  }

  /** Per-version-directory checks (schema, payload/folder agreement, kind rules). */
  function checkVersionDir(item, kind, versionName, versionDir, yanked) {
    const isCraftbook = kind === 'craftbook-template';
    const docPath = join(versionDir, 'craftbook.json');
    const manifestPath = join(versionDir, 'manifest.json');

    if (isCraftbook && existsSync(docPath)) {
      const parsed = readJson(docPath);
      if (!parsed.ok) return; // hygiene already reported the parse failure
      const doc = parsed.value;
      checkSchema(docPath, 'craftbook-doc', doc);
      deepScan(docPath, doc);
      if (doc.version !== versionName) {
        c.error(docPath, '/version', 'version-folder-mismatch', `payload version "${doc.version}" != folder "${versionName}"`);
      }
      if (typeof doc.releasedAt !== 'string') {
        c.error(docPath, '/releasedAt', 'missing-releasedAt', 'catalog craftbooks must carry releasedAt (the runtime skips the version without it)');
      }
      checkCraftbookDoc(docPath, doc, yanked);

      const testPath = join(versionDir, 'test.json');
      if (existsSync(testPath)) {
        const test = readJson(testPath);
        if (test.ok) {
          // Deliberately WARN-only: the runtime reads test.json through
          // parseCraftbookTestSpec in TOLERANT mode (a spec written by a
          // newer author must still load), so exported-schema strictness
          // here must not gate CI.
          const validate = validatorFor('craftbook-test');
          if (!validate(test.value)) {
            c.warn(testPath, '', 'test-spec-schema', `craftbook-test: ${ajvErrors(validate)} (runtime parses test.json tolerantly - schema findings are advisory)`);
          }
        }
      }
      return;
    }

    if (isCraftbook) {
      // Legacy layout (manifest.json + about.md). None exist in the
      // committed tree; validate it anyway for completeness.
      if (!existsSync(manifestPath)) {
        c.error(versionDir, '', 'missing-version-payload', 'craftbook version has neither craftbook.json nor manifest.json');
        return;
      }
      const parsed = readJson(manifestPath);
      if (!parsed.ok) return;
      checkSchema(manifestPath, 'craftbook-template-version', parsed.value);
      deepScan(manifestPath, parsed.value);
      if (parsed.value.version !== versionName) {
        c.error(manifestPath, '/version', 'version-folder-mismatch', `payload version "${parsed.value.version}" != folder "${versionName}"`);
      }
      return;
    }

    if (!existsSync(manifestPath)) {
      c.error(versionDir, '', 'missing-version-payload', 'version folder has no manifest.json');
      return;
    }
    const parsed = readJson(manifestPath);
    if (!parsed.ok) return;
    const version = parsed.value;
    checkSchema(manifestPath, `${kind}-version`, version);
    deepScan(manifestPath, version);
    if (version.version !== versionName) {
      c.error(manifestPath, '/version', 'version-folder-mismatch', `payload version "${version.version}" != folder "${versionName}"`);
    }
    if (typeof version.releasedAt !== 'string') {
      c.error(manifestPath, '/releasedAt', 'missing-releasedAt', 'version payload must carry releasedAt');
    }

    if (kind === 'chat-model' && !version.ollama && !version.llamaCpp && !version.mlx && !version.ds4) {
      c.error(manifestPath, '', 'chat-model-no-engine-source', 'no ollama / llamaCpp / mlx / ds4 source - the runtime skips the item');
    }
    if (kind === 'video-model' && !(Array.isArray(version.source?.files) && version.source.files.length > 0)) {
      c.error(manifestPath, '/source/files', 'video-model-no-source-files', 'empty source.files - the runtime skips the item');
    }
    if (kind === 'gezel-template' && typeof version.about === 'string' && version.about.length > 0) {
      if (!existsSync(join(versionDir, version.about))) {
        c.error(manifestPath, '/about', 'missing-referenced-file', `about file "${version.about}" not found in version folder`);
      }
    }
    if (kind === 'project-type') {
      const refs = [
        ['/aboutTemplate', version.aboutTemplate],
        ['/missionTemplate', version.missionTemplate],
        ...(version.workspaceSeed ?? []).map((f, i) => [`/workspaceSeed/${i}`, f]),
        ...(version.artifactsSeed ?? []).map((f, i) => [`/artifactsSeed/${i}`, f]),
      ];
      for (const [pointer, ref] of refs) {
        if (typeof ref === 'string' && !existsSync(join(versionDir, ref))) {
          c.error(manifestPath, pointer, 'missing-referenced-file', `"${ref}" not found in version folder`);
        }
      }
      if (typeof version.pages?.entry === 'string' && !existsSync(join(versionDir, 'pages', version.pages.entry))) {
        c.error(manifestPath, '/pages/entry', 'missing-referenced-file', `pages/${version.pages.entry} not found in version folder`);
      }
    }
  }

  /** Craftbook graph + fully-resolved invariant + toolset refs. */
  function checkCraftbookDoc(path, doc, yanked) {
    const steps = Array.isArray(doc.steps) ? doc.steps : [];
    const ids = new Set();
    steps.forEach((step, i) => {
      if (!step || typeof step !== 'object') return;
      // Fully-resolved invariant: the gilde tooling deliberately does NOT
      // port gezel's expandStepDeliverables (id minting + deliverable ->
      // gate/advanceWhen sugar). That is only sound while every committed
      // book is already fully resolved, so implicit ids, `deliverable`
      // keys, and an implicit entry step are hard errors here.
      if (typeof step.id !== 'string' || step.id.length === 0) {
        c.error(path, `/steps/${i}`, 'craftbook-not-fully-resolved', 'step has no explicit id (gezel would mint one; gilde requires it authored)');
        return;
      }
      if (Object.hasOwn(step, 'deliverable')) {
        c.error(path, `/steps/${i}`, 'craftbook-not-fully-resolved', `step "${step.id}" uses the deliverable sugar; commit the expanded advanceWhen/gate instead`);
      }
      if (ids.has(step.id)) {
        c.error(path, `/steps/${i}/id`, 'duplicate-step-id', `step id "${step.id}" appears more than once`);
      }
      ids.add(step.id);
    });
    for (const [i, step] of (doc.spawn?.steps ?? []).entries()) {
      if (step && typeof step === 'object' && Object.hasOwn(step, 'deliverable')) {
        c.error(path, `/spawn/steps/${i}`, 'craftbook-not-fully-resolved', 'spawn step uses the deliverable sugar');
      }
    }
    if (typeof doc.entryStepId !== 'string' || doc.entryStepId.length === 0) {
      c.error(path, '/entryStepId', 'craftbook-not-fully-resolved', 'entryStepId must be explicit (the runtime would default it to the first step)');
    } else if (!ids.has(doc.entryStepId)) {
      c.error(path, '/entryStepId', 'bad-entry-step', `entryStepId "${doc.entryStepId}" is not a step id`);
    }
    for (const [i, need] of (doc.toolsets ?? []).entries()) {
      const toolsetId = need?.toolsetId;
      // builtin.* toolset groups are synthetic - they ship inside the
      // gezel app binary (BUILTIN_TOOLSETS), never as data/ folders, so
      // they are resolvable at runtime despite having no catalog dir.
      // Yanked releases remain immutable and cannot be installed, so a
      // dependency that disappeared (or was misnamed before the yank)
      // should not keep producing an actionable catalog warning.
      if (yanked || typeof toolsetId !== 'string' || toolsetId.startsWith('builtin.')) continue;
      if (!knownToolsetIds.has(toolsetId)) {
        c.warn(path, `/toolsets/${i}/toolsetId`, 'unresolvable-toolset-ref', `"${toolsetId}" is not a bundled or community toolset id`);
      }
    }
  }

  // ── Render + exit ──────────────────────────────────────────────────
  render(c.findings, args.mode);
  const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);
  const summary = `validate: ${c.errorCount()} error(s), ${c.warnCount()} warning(s) across ${allFiles.length} files in ${elapsed}s`;
  if (args.mode === 'json') console.error(summary);
  else console.log(summary);
  process.exit(c.errorCount() > 0 ? 1 : 0);
}

main();

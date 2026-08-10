import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadSchema, zodParse } from './jsonshape.mjs';
import { isSemver, safeCompare } from './semver.mjs';
import { listVersionDirs } from './walk.mjs';

/**
 * Port of gezel packages/catalog/src/source.ts's identity+version merge
 * pipeline (loadIdentity / discoverVersionFolders / pickVersion /
 * mergeIdentityAndVersion / craftbookManifestFromDoc). The per-kind
 * field spreads are copied field-for-field, including the exact
 * truthy-vs-undefined spread conditions - this is what makes
 * build-index output byte-identical to gezel's generator.
 *
 * `minGezelVersion` gating is deliberately NOT ported: the index is
 * built with no app-version context, so it always embeds the newest
 * eligible version (with its effective floor stamped on the resolved
 * manifest). Gezel's reader gates at read time; its dev builds (0.0.0)
 * never filter, which is what keeps this output byte-identical to a
 * dev gezel's disk walk.
 */

/**
 * Port of core's gezel-version.ts compare: numeric per component,
 * missing components as 0, NaN on malformed input.
 */
function compareGezelVersions(a, b) {
  const pa = a.split('.');
  const pb = b.split('.');
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const na = pa[i] === undefined || pa[i] === '' ? 0 : Number(pa[i]);
    const nb = pb[i] === undefined || pb[i] === '' ? 0 : Number(pb[i]);
    if (!Number.isFinite(na) || !Number.isFinite(nb)) return Number.NaN;
    if (na !== nb) return na < nb ? -1 : 1;
  }
  return 0;
}

/** Port of core's maxMinGezelVersion: the stricter of two optional floors. */
function maxMinGezelVersion(a, b) {
  if (!a) return b;
  if (!b) return a;
  const cmp = compareGezelVersions(a, b);
  if (Number.isNaN(cmp)) {
    const aValid = !Number.isNaN(compareGezelVersions(a, '0'));
    return aValid ? a : b;
  }
  return cmp >= 0 ? a : b;
}

/** Read + validate the identity (root) manifest. Null on any failure (= skip item). */
export function loadIdentity(itemDir, kind, id) {
  let raw;
  try {
    raw = readFileSync(join(itemDir, 'manifest.json'), 'utf8');
  } catch {
    return null;
  }
  let json;
  try {
    json = JSON.parse(raw);
  } catch {
    return null;
  }
  const parsed = zodParse(loadSchema(`${kind}-identity`), json);
  if (!parsed.ok) return null;
  if (parsed.value.kind !== kind) return null;
  if (parsed.value.id !== id) return null;
  return parsed.value;
}

/**
 * Enumerate versions/{semver}/ entries whose payload carries a matching
 * `version` and a string `releasedAt`. Craftbook templates read
 * craftbook.json first, manifest.json as the legacy fallback. Unsorted.
 */
export function discoverVersionFolders(itemDir, kind) {
  const out = [];
  for (const name of listVersionDirs(itemDir)) {
    if (!isSemver(name)) continue;
    const candidates =
      kind === 'craftbook-template' ? ['craftbook.json', 'manifest.json'] : ['manifest.json'];
    for (const filename of candidates) {
      let raw;
      try {
        raw = readFileSync(join(itemDir, 'versions', name, filename), 'utf8');
      } catch {
        continue;
      }
      let json;
      try {
        json = JSON.parse(raw);
      } catch {
        continue;
      }
      const version = typeof json.version === 'string' ? json.version : null;
      const releasedAt = typeof json.releasedAt === 'string' ? json.releasedAt : null;
      if (!version || !releasedAt) continue;
      if (version !== name) continue;
      out.push({ version, releasedAt });
      break;
    }
  }
  return out;
}

function pickVersion(identity, folders) {
  if (folders.length === 0) return null;
  const yanked = new Set(identity.yankedVersions);
  const minSupported = identity.minSupportedVersion;
  const eligible = folders
    .map((f) => f.version)
    .filter((v) => {
      if (yanked.has(v)) return false;
      if (minSupported && safeCompare(v, minSupported) < 0) return false;
      return true;
    });
  if (eligible.length === 0) return null;
  eligible.sort((a, b) => safeCompare(b, a));
  return eligible[0] ?? null;
}

function eligibleVersionsDesc(identity, folders) {
  const yanked = new Set(identity.yankedVersions);
  const minSupported = identity.minSupportedVersion;
  return folders
    .map((f) => f.version)
    .filter((v) => {
      if (yanked.has(v)) return false;
      if (minSupported && safeCompare(v, minSupported) < 0) return false;
      return true;
    })
    .sort((a, b) => safeCompare(b, a));
}

/**
 * Gezel's resolveSteps rebuild (packages/core craftbook.ts), minus the
 * id minting and minus the `deliverable` sugar expansion. Every
 * committed craftbook already carries explicit step ids and zero
 * `deliverable` keys (validate.mjs enforces that invariant), so on this
 * data gezel's expandStepDeliverables reduces to exactly this field-
 * order rebuild - which still matters for bytes, because it re-emits
 * step keys in a fixed order and drops falsy optionals. Throwing on the
 * unported paths keeps the tool honest instead of silently diverging.
 */
function rebuildSteps(steps, context) {
  return steps.map((s) => {
    if (!s.id) {
      throw new Error(
        `${context}: step without explicit id - gezel would mint one; the minting/expansion path is deliberately not ported (see validate.mjs fully-resolved invariant)`,
      );
    }
    if (Object.hasOwn(s, 'deliverable')) {
      throw new Error(
        `${context}: step "${s.id}" carries a deliverable key - the expansion path is deliberately not ported (see validate.mjs fully-resolved invariant)`,
      );
    }
    return {
      id: s.id,
      name: s.name,
      ...(s.description ? { description: s.description } : {}),
      ...(s.prompt ? { prompt: s.prompt } : {}),
      ...(s.suggestedGezelId ? { suggestedGezelId: s.suggestedGezelId } : {}),
      ...(s.suggestedRole ? { suggestedRole: s.suggestedRole } : {}),
      ...(s.capabilityFloor ? { capabilityFloor: s.capabilityFloor } : {}),
      ...(s.assignee ? { assignee: s.assignee } : {}),
      ...(s.onEnter ? { onEnter: s.onEnter } : {}),
      ...(s.onExit ? { onExit: s.onExit } : {}),
      ...(s.advanceWhen ? { advanceWhen: s.advanceWhen } : {}),
      ...(s.gate ? { gate: s.gate } : {}),
      ...(s.next ? { next: s.next } : {}),
      ...(s.branches && s.branches.length > 0 ? { branches: s.branches } : {}),
      ...(s.terminal ? { terminal: s.terminal } : {}),
      ...(s.spawnFanout ? { spawnFanout: s.spawnFanout } : {}),
    };
  });
}

/** source.ts craftbookManifestFromDoc, with the step rebuild above. */
function craftbookManifestFromDoc(identity, doc, version, availableVersions) {
  if (!doc.releasedAt) return null;
  const steps = rebuildSteps(doc.steps, `craftbook-template/${identity.id}@${version}`);
  const entryStepId = doc.entryStepId ?? steps[0].id;
  const scriptNames = Object.keys(doc.scripts ?? {});
  const minGezelVersion = maxMinGezelVersion(identity.minGezelVersion, doc.minGezelVersion);
  return {
    schemaVersion: 1,
    kind: 'craftbook-template',
    id: identity.id,
    name: identity.name,
    description: identity.description,
    tags: identity.tags,
    maintainer: identity.maintainer,
    ...(identity.logo !== undefined ? { logo: identity.logo } : {}),
    ...(identity.license !== undefined ? { license: identity.license } : {}),
    ...(minGezelVersion !== undefined ? { minGezelVersion } : {}),
    version,
    releasedAt: doc.releasedAt,
    role: identity.role ?? 'general',
    ...(identity.workflow ? { workflow: identity.workflow } : {}),
    about: '',
    steps,
    entryStepId,
    ...(doc.defaultAssignee ? { defaultAssignee: doc.defaultAssignee } : {}),
    ...(doc.basedOn ? { basedOn: doc.basedOn } : {}),
    ...(doc.plan !== undefined ? { plan: doc.plan } : {}),
    ...(doc.triggers ? { triggers: doc.triggers } : {}),
    ...(doc.scripts ? { scripts: doc.scripts } : {}),
    ...(scriptNames.length > 0 ? { bundledScripts: scriptNames.map((n) => `${n}.ts`) } : {}),
    ...(doc.paramSchema ? { paramSchema: doc.paramSchema } : {}),
    ...(doc.command ? { command: doc.command } : {}),
    ...(doc.requirements ? { requirements: doc.requirements } : {}),
    ...(doc.runModes ? { runModes: doc.runModes } : {}),
    ...(doc.toolsets ? { toolsets: doc.toolsets } : {}),
    ...(doc.hooks ? { hooks: doc.hooks } : {}),
    ...(doc.spawn ? { spawn: doc.spawn } : {}),
    availableVersions,
  };
}

/** source.ts mergeIdentityAndVersion, field-for-field per kind. */
function mergeIdentityAndVersion(kind, identity, version, availableVersions) {
  // Effective app-version floor - the stricter of identity and version.
  // Mirrors source.ts: forwarded explicitly in every branch below.
  const minGezelVersion = maxMinGezelVersion(identity.minGezelVersion, version.minGezelVersion);
  if (kind === 'toolset') {
    return {
      schemaVersion: 1,
      kind: 'toolset',
      id: identity.id,
      name: identity.name,
      description: identity.description,
      tags: identity.tags,
      maintainer: identity.maintainer,
      ...(identity.logo !== undefined ? { logo: identity.logo } : {}),
      ...(identity.license !== undefined ? { license: identity.license } : {}),
      ...(minGezelVersion !== undefined ? { minGezelVersion } : {}),
      version: version.version,
      releasedAt: version.releasedAt,
      runtime: version.runtime,
      tools: version.tools,
      config: version.config,
      ...(version.requirements ? { requirements: version.requirements } : {}),
      ...(version.notes !== undefined ? { notes: version.notes } : {}),
      availableVersions,
      ...(identity.category ? { category: identity.category } : {}),
    };
  }
  if (kind === 'craftbook-template') {
    // Legacy per-version manifest.json layout (no craftbook.json). No
    // instances in the committed tree, kept for parity with source.ts.
    return {
      schemaVersion: 1,
      kind: 'craftbook-template',
      id: identity.id,
      name: identity.name,
      description: identity.description,
      tags: identity.tags,
      maintainer: identity.maintainer,
      ...(identity.logo !== undefined ? { logo: identity.logo } : {}),
      ...(identity.license !== undefined ? { license: identity.license } : {}),
      ...(minGezelVersion !== undefined ? { minGezelVersion } : {}),
      version: version.version,
      releasedAt: version.releasedAt,
      role: identity.role ?? 'general',
      ...(identity.workflow ? { workflow: identity.workflow } : {}),
      about: version.about,
      steps: version.steps,
      entryStepId: version.entryStepId,
      ...(version.defaultAssignee ? { defaultAssignee: version.defaultAssignee } : {}),
      ...(version.basedOn ? { basedOn: version.basedOn } : {}),
      ...(version.plan !== undefined ? { plan: version.plan } : {}),
      ...(version.notes !== undefined ? { notes: version.notes } : {}),
      ...(version.triggers ? { triggers: version.triggers } : {}),
      ...(version.hooks ? { hooks: version.hooks } : {}),
      ...(version.bundledScripts ? { bundledScripts: version.bundledScripts } : {}),
      ...(version.paramSchema ? { paramSchema: version.paramSchema } : {}),
      ...(version.command ? { command: version.command } : {}),
      ...(version.requirements ? { requirements: version.requirements } : {}),
      ...(version.runModes ? { runModes: version.runModes } : {}),
      ...(version.toolsets ? { toolsets: version.toolsets } : {}),
      availableVersions,
    };
  }
  if (kind === 'project-type') {
    return {
      schemaVersion: 1,
      kind: 'project-type',
      id: identity.id,
      name: identity.name,
      description: identity.description,
      tags: identity.tags,
      ...(identity.category !== undefined ? { category: identity.category } : {}),
      maintainer: identity.maintainer,
      ...(identity.logo !== undefined ? { logo: identity.logo } : {}),
      ...(identity.license !== undefined ? { license: identity.license } : {}),
      ...(minGezelVersion !== undefined ? { minGezelVersion } : {}),
      version: version.version,
      releasedAt: version.releasedAt,
      ...(version.extends !== undefined ? { extends: version.extends } : {}),
      ...(version.meesterManaged !== undefined ? { meesterManaged: version.meesterManaged } : {}),
      ...(version.tabVisibility !== undefined ? { tabVisibility: version.tabVisibility } : {}),
      ...(version.mode !== undefined ? { mode: version.mode } : {}),
      ...(version.leadLabel !== undefined ? { leadLabel: version.leadLabel } : {}),
      ...(version.leanProfile !== undefined ? { leanProfile: version.leanProfile } : {}),
      ...(version.params !== undefined ? { params: version.params } : {}),
      ...(version.nameTemplate !== undefined ? { nameTemplate: version.nameTemplate } : {}),
      ...(version.aboutTemplate !== undefined ? { aboutTemplate: version.aboutTemplate } : {}),
      ...(version.missionTemplate !== undefined
        ? { missionTemplate: version.missionTemplate }
        : {}),
      gezels: version.gezels,
      toolsets: version.toolsets,
      craftbooks: version.craftbooks,
      ...(version.scripts !== undefined ? { scripts: version.scripts } : {}),
      tools: version.tools,
      ...(version.pages !== undefined ? { pages: version.pages } : {}),
      schedules: version.schedules,
      workspaceSeed: version.workspaceSeed,
      artifactsSeed: version.artifactsSeed,
      ...(version.notes !== undefined ? { notes: version.notes } : {}),
      availableVersions,
    };
  }
  if (kind === 'connector-type') {
    return {
      schemaVersion: 1,
      kind: 'connector-type',
      id: identity.id,
      name: identity.name,
      description: identity.description,
      tags: identity.tags,
      maintainer: identity.maintainer,
      ...(identity.logo !== undefined ? { logo: identity.logo } : {}),
      ...(identity.license !== undefined ? { license: identity.license } : {}),
      ...(minGezelVersion !== undefined ? { minGezelVersion } : {}),
      version: version.version,
      releasedAt: version.releasedAt,
      driver: version.driver,
      ...(version.configSchema !== undefined ? { configSchema: version.configSchema } : {}),
      ...(version.secretShape !== undefined ? { secretShape: version.secretShape } : {}),
      source: version.source,
      normalize: version.normalize,
      actions: version.actions,
      ...(version.completeness !== undefined ? { completeness: version.completeness } : {}),
      ...(version.notes !== undefined ? { notes: version.notes } : {}),
      availableVersions,
    };
  }
  if (kind === 'gezel-template') {
    return {
      schemaVersion: 1,
      kind: 'gezel-template',
      id: identity.id,
      name: identity.name,
      description: identity.description,
      tags: identity.tags,
      maintainer: identity.maintainer,
      ...(identity.logo !== undefined ? { logo: identity.logo } : {}),
      ...(identity.license !== undefined ? { license: identity.license } : {}),
      ...(minGezelVersion !== undefined ? { minGezelVersion } : {}),
      version: version.version,
      releasedAt: version.releasedAt,
      role: identity.role,
      about: version.about,
      ...(version.suggestedProvider ? { suggestedProvider: version.suggestedProvider } : {}),
      ...(version.suggestedModel ? { suggestedModel: version.suggestedModel } : {}),
      suggestedTools: version.suggestedTools,
      meesterCandidate: identity.meesterCandidate,
      ...(version.notes !== undefined ? { notes: version.notes } : {}),
      ...(version.frontmatter ? { frontmatter: version.frontmatter } : {}),
      ...(version.nameSuggestions ? { nameSuggestions: version.nameSuggestions } : {}),
      ...(version.suggestedCraftbooks
        ? { suggestedCraftbooks: version.suggestedCraftbooks }
        : {}),
      availableVersions,
    };
  }
  if (kind === 'chat-model') {
    return {
      schemaVersion: 1,
      kind: 'chat-model',
      id: identity.id,
      name: identity.name,
      description: identity.description,
      tags: identity.tags,
      maintainer: identity.maintainer,
      ...(identity.logo !== undefined ? { logo: identity.logo } : {}),
      ...(identity.license !== undefined ? { license: identity.license } : {}),
      ...(identity.licenseClass !== undefined ? { licenseClass: identity.licenseClass } : {}),
      ...(identity.licenseShortName !== undefined
        ? { licenseShortName: identity.licenseShortName }
        : {}),
      ...(identity.licenseUrl !== undefined ? { licenseUrl: identity.licenseUrl } : {}),
      ...(identity.recoScore !== undefined ? { recoScore: identity.recoScore } : {}),
      ...(minGezelVersion !== undefined ? { minGezelVersion } : {}),
      version: version.version,
      releasedAt: version.releasedAt,
      parameterSize: identity.parameterSize,
      approxSizeBytes: version.approxSizeBytes,
      supportsTools: identity.supportsTools,
      ...(identity.contextWindow !== undefined ? { contextWindow: identity.contextWindow } : {}),
      // Architecture-determined KV geometry. Forwarded explicitly to stay in
      // lockstep with gezel's BundledSource merge in packages/catalog/src/source.ts.
      ...(identity.kvBytesPerTokenF16 !== undefined
        ? { kvBytesPerTokenF16: identity.kvBytesPerTokenF16 }
        : {}),
      ...(identity.kvFixedBytesF16 !== undefined
        ? { kvFixedBytesF16: identity.kvFixedBytesF16 }
        : {}),
      ...(identity.upstream !== undefined ? { upstream: identity.upstream } : {}),
      ...(identity.category ? { category: identity.category } : {}),
      ...(identity.style ? { style: identity.style } : {}),
      ...(identity.behaviors ? { behaviors: identity.behaviors } : {}),
      ...(identity.tuning ? { tuning: identity.tuning } : {}),
      ...(version.ollama ? { ollama: version.ollama } : {}),
      ...(version.llamaCpp ? { llamaCpp: version.llamaCpp } : {}),
      ...(version.mlx ? { mlx: version.mlx } : {}),
      ...(version.ds4 ? { ds4: version.ds4 } : {}),
      ...(version.notes !== undefined ? { notes: version.notes } : {}),
      availableVersions,
    };
  }
  if (kind === 'image-model') {
    return {
      schemaVersion: 1,
      kind: 'image-model',
      id: identity.id,
      name: identity.name,
      description: identity.description,
      tags: identity.tags,
      maintainer: identity.maintainer,
      ...(identity.logo !== undefined ? { logo: identity.logo } : {}),
      ...(identity.license !== undefined ? { license: identity.license } : {}),
      ...(identity.licenseClass !== undefined ? { licenseClass: identity.licenseClass } : {}),
      ...(identity.licenseShortName !== undefined
        ? { licenseShortName: identity.licenseShortName }
        : {}),
      ...(identity.licenseUrl !== undefined ? { licenseUrl: identity.licenseUrl } : {}),
      ...(identity.recoScore !== undefined ? { recoScore: identity.recoScore } : {}),
      ...(minGezelVersion !== undefined ? { minGezelVersion } : {}),
      version: version.version,
      releasedAt: version.releasedAt,
      downloadUrl: version.downloadUrl,
      sha256: version.sha256,
      approxSizeBytes: version.approxSizeBytes,
      ...(version.quantization ? { quantization: version.quantization } : {}),
      recommendedSteps: identity.recommendedSteps,
      ...(identity.widthRange ? { widthRange: identity.widthRange } : {}),
      ...(identity.heightRange ? { heightRange: identity.heightRange } : {}),
      ...(identity.upstream !== undefined ? { upstream: identity.upstream } : {}),
      ...(identity.category ? { category: identity.category } : {}),
      weightsKind: identity.weightsKind,
      ...(identity.supportsImg2Img !== undefined
        ? { supportsImg2Img: identity.supportsImg2Img }
        : {}),
      auxiliaryFiles: version.auxiliaryFiles,
      hardwareTier: identity.hardwareTier,
      minRamGB: identity.minRamGB,
      commercialUse: identity.commercialUse,
      ...(version.notes !== undefined ? { notes: version.notes } : {}),
      availableVersions,
    };
  }
  if (kind === 'video-model') {
    return {
      schemaVersion: 1,
      kind: 'video-model',
      id: identity.id,
      name: identity.name,
      description: identity.description,
      tags: identity.tags,
      maintainer: identity.maintainer,
      ...(identity.logo !== undefined ? { logo: identity.logo } : {}),
      ...(identity.license !== undefined ? { license: identity.license } : {}),
      ...(identity.licenseClass !== undefined ? { licenseClass: identity.licenseClass } : {}),
      ...(identity.licenseShortName !== undefined
        ? { licenseShortName: identity.licenseShortName }
        : {}),
      ...(identity.licenseUrl !== undefined ? { licenseUrl: identity.licenseUrl } : {}),
      ...(identity.recoScore !== undefined ? { recoScore: identity.recoScore } : {}),
      ...(minGezelVersion !== undefined ? { minGezelVersion } : {}),
      version: version.version,
      releasedAt: version.releasedAt,
      family: identity.family,
      ...(identity.load !== undefined ? { load: identity.load } : {}),
      source: version.source,
      approxSizeBytes: version.source.approxSizeBytes,
      recommendedSteps: identity.recommendedSteps,
      ...(identity.guidanceScale !== undefined ? { guidanceScale: identity.guidanceScale } : {}),
      defaultNumFrames: identity.defaultNumFrames,
      ...(identity.numFramesRange ? { numFramesRange: identity.numFramesRange } : {}),
      defaultFps: identity.defaultFps,
      ...(identity.fpsRange ? { fpsRange: identity.fpsRange } : {}),
      ...(identity.maxDurationSeconds !== undefined
        ? { maxDurationSeconds: identity.maxDurationSeconds }
        : {}),
      ...(identity.widthRange ? { widthRange: identity.widthRange } : {}),
      ...(identity.heightRange ? { heightRange: identity.heightRange } : {}),
      ...(identity.defaultWidth !== undefined ? { defaultWidth: identity.defaultWidth } : {}),
      ...(identity.defaultHeight !== undefined ? { defaultHeight: identity.defaultHeight } : {}),
      supportsImageToVideo: identity.supportsImageToVideo,
      ...(identity.upstream !== undefined ? { upstream: identity.upstream } : {}),
      hardwareTier: identity.hardwareTier,
      minVramGB: identity.minVramGB,
      commercialUse: identity.commercialUse,
      ...(version.notes !== undefined ? { notes: version.notes } : {}),
      availableVersions,
    };
  }
  return null;
}

/**
 * Resolve one item to its flat manifest, exactly like BundledSource's
 * loadResolvedManifest. Returns { manifest } on success or
 * { skip: <reason> } mirroring every skip branch in source.ts.
 */
export function loadResolvedManifest(itemDir, kind, id) {
  const identity = loadIdentity(itemDir, kind, id);
  if (!identity) return { skip: 'invalid-identity' };
  const folders = discoverVersionFolders(itemDir, kind);
  const chosen = pickVersion(identity, folders);
  if (!chosen) {
    const yanked = new Set(identity.yankedVersions);
    const everythingYanked = folders.length > 0 && folders.every((f) => yanked.has(f.version));
    return { skip: everythingYanked ? 'tombstoned' : 'no-eligible-versions' };
  }
  const availableVersions = eligibleVersionsDesc(identity, folders);
  const versionDir = join(itemDir, 'versions', chosen);
  if (kind === 'craftbook-template') {
    let docText = null;
    try {
      docText = readFileSync(join(versionDir, 'craftbook.json'), 'utf8');
    } catch {
      // fall through to the legacy manifest.json layout
    }
    if (docText !== null) {
      let docJson;
      try {
        docJson = JSON.parse(docText);
      } catch {
        return { skip: 'invalid-craftbook-doc' };
      }
      const parsed = zodParse(loadSchema('craftbook-doc'), docJson);
      if (!parsed.ok) return { skip: 'invalid-craftbook-doc', errors: parsed.errors };
      const manifest = craftbookManifestFromDoc(identity, parsed.value, chosen, availableVersions);
      return manifest ? { manifest } : { skip: 'doc-missing-releasedAt' };
    }
  }
  let versionJson;
  try {
    versionJson = JSON.parse(readFileSync(join(versionDir, 'manifest.json'), 'utf8'));
  } catch {
    return { skip: 'unreadable-version-manifest' };
  }
  const parsedVersion = zodParse(loadSchema(`${kind}-version`), versionJson);
  if (!parsedVersion.ok) return { skip: 'invalid-version-manifest', errors: parsedVersion.errors };
  const version = parsedVersion.value;
  if (
    kind === 'chat-model' &&
    !version.ollama &&
    !version.llamaCpp &&
    !version.mlx &&
    !version.ds4
  ) {
    return { skip: 'chat-model-no-engine-source' };
  }
  if (
    kind === 'video-model' &&
    (!version.source || !Array.isArray(version.source.files) || version.source.files.length === 0)
  ) {
    return { skip: 'video-model-no-source-files' };
  }
  const manifest = mergeIdentityAndVersion(kind, identity, version, availableVersions);
  return manifest ? { manifest } : { skip: 'merge-failed' };
}

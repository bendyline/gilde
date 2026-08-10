#!/usr/bin/env node
/**
 * Chat-model manifest completeness lint - port of gezel
 * packages/catalog/src/chat-model-manifest-lint.ts over
 * data/chat-models, plus a ratchet.
 *
 * Backstory (from the gezel original): every multi-day "bad model"
 * debugging saga traced back to a manifest gap, not model capability -
 * deepseek-r1 ran with an unbounded thinking budget, mistral-medium had
 * no tuning block, the gemma4-26b-q4 QAT swap silently deleted its
 * tuning. These are the blocks strong models all carry, so absence is
 * lintable.
 *
 * Ratchet: tools/lint-models-allowlist.json lists known
 * "<modelId>:<rule>" gaps. New errors (not allowlisted) fail; stale
 * allowlist entries (no longer firing) also fail so the list only
 * shrinks. Warnings never gate.
 *
 * The lint resolves identity + latest eligible version exactly like the
 * runtime. Version-owned engine blocks never need to be copied into the
 * identity just to make this check work.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { loadResolvedManifest } from './lib/manifest-merge.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = resolve(HERE, '..', 'data', 'chat-models');
const ALLOWLIST_PATH = join(HERE, 'lint-models-allowlist.json');

/** "8B" / "2.3B" / "284B" -> numeric billions; null when unparseable. */
function parseParamsB(parameterSize) {
  const m = parameterSize?.match(/^([\d.]+)\s*B$/i);
  return m?.[1] ? Number.parseFloat(m[1]) : null;
}

function behaviorIds(manifest) {
  const out = new Set();
  for (const b of manifest.behaviors ?? []) {
    const id = typeof b === 'string' ? b : b?.id;
    if (id) out.add(id);
  }
  return out;
}

const SMALL_MODEL_PARAMS_B = 9;
const SMALL_MODEL_RESCUE_BEHAVIORS = ['mcp.relax-required-fields', 'mcp.default-missing-fields'];

/**
 * OpenMDW 1.0/1.1 grant unrestricted use, modification, and
 * redistribution; their notice-retention clauses are ordinary permissive
 * conditions, so they must sit in the same green bucket as Apache/MIT.
 */
function isPermissiveOpenMdw(license) {
  return /^openmdw[- ]1\.(?:0|1)$/i.test(license?.trim() ?? '');
}

export function lintChatModelManifest(manifest) {
  const modelId = manifest.id ?? '(unknown id)';
  const errors = [];
  const warnings = [];

  if (isPermissiveOpenMdw(manifest.license) && manifest.licenseClass !== 'open') {
    errors.push({
      modelId,
      rule: 'openmdw-not-open',
      detail: `${manifest.license} is permissive and must use licenseClass=open`,
    });
  }

  const tuning = manifest.tuning;
  if (!tuning) {
    errors.push({
      modelId,
      rule: 'missing-tuning',
      detail:
        'no `tuning` block - every session runs on provider-default sampling ' +
        '(the gemma4-26b-q4 QAT-swap regression class)',
    });
  } else {
    if (!tuning.sampling) {
      errors.push({
        modelId,
        rule: 'missing-tuning-sampling',
        detail: '`tuning` block has no `sampling` defaults',
      });
    }
    if (!tuning.profiles || Object.keys(tuning.profiles).length === 0) {
      warnings.push({
        modelId,
        rule: 'missing-profiles',
        detail:
          'no `tuning.profiles` - gezel `tuningProfile`/`suggestedTuningProfile` requests ' +
          'silently fall through to base tuning for this model',
      });
    }
  }

  // A thinking-format model with no bound on reasoning output repeats
  // the deepseek-r1 saga: unlimited budget -> reason-forever -> every
  // turn aborted by the post-reasoning watchdog.
  const reasoningFormat = manifest.style?.reasoningFormat;
  const isThinkingFormat = reasoningFormat === 'think' || reasoningFormat === 'channel';
  if (isThinkingFormat && tuning) {
    const r = tuning.reasoning;
    const bounded =
      typeof r?.thinkingBudget === 'number' ||
      typeof r?.effort === 'string' ||
      typeof r?.templateKwargs?.reasoning_strength === 'string' ||
      r?.enableThinking === false;
    if (!bounded) {
      errors.push({
        modelId,
        rule: 'unbounded-reasoning',
        detail: `style.reasoningFormat=${reasoningFormat} but tuning.reasoning has no thinkingBudget / effort / templateKwargs.reasoning_strength / enableThinking:false - unbounded thinking stalls turns (deepseek-r1 was 0/19 until thinkingBudget:512 landed)`,
      });
    }
  }

  if (
    typeof manifest.llamaCpp?.residentBytes !== 'number' &&
    typeof manifest.mlx?.residentBytes !== 'number' &&
    typeof manifest.ds4?.residentBytes !== 'number'
  ) {
    errors.push({
      modelId,
      rule: 'missing-resident-bytes',
      detail:
        'no `llamaCpp.residentBytes`, `mlx.residentBytes`, or `ds4.residentBytes` - the capacity broker cannot ' +
        'reserve for this model and either over-admits (OOM) or mis-denies',
    });
  }

  const paramsB = parseParamsB(manifest.parameterSize);
  if (paramsB !== null && paramsB <= SMALL_MODEL_PARAMS_B) {
    const ids = behaviorIds(manifest);
    const missing = SMALL_MODEL_RESCUE_BEHAVIORS.filter((b) => !ids.has(b));
    if (missing.length > 0) {
      warnings.push({
        modelId,
        rule: 'missing-small-model-rescue-behaviors',
        detail: `${manifest.parameterSize} model without ${missing.join(' + ')} - small models drop required tool-call fields routinely; these behaviors are why qwen3.5-2b out-executes mistral-7b on the same harness`,
      });
    }
  }

  return { errors, warnings };
}

export function lintAllChatModelManifests(dataDir = DATA_DIR) {
  const errors = [];
  const warnings = [];
  let modelCount = 0;
  for (const prefix of readdirSync(dataDir, { withFileTypes: true }).sort((a, b) =>
    a.name < b.name ? -1 : 1,
  )) {
    if (!prefix.isDirectory()) continue;
    for (const entry of readdirSync(join(dataDir, prefix.name), { withFileTypes: true }).sort(
      (a, b) => (a.name < b.name ? -1 : 1),
    )) {
      if (!entry.isDirectory()) continue;
      const itemDir = join(dataDir, prefix.name, entry.name);
      const resolved = loadResolvedManifest(itemDir, 'chat-model', entry.name);
      if (!resolved.manifest) {
        errors.push({
          modelId: entry.name,
          rule: 'unresolvable-manifest',
          detail: `cannot resolve identity + version (${resolved.skip ?? 'unknown reason'})`,
        });
        continue;
      }
      modelCount += 1;
      const report = lintChatModelManifest(resolved.manifest);
      errors.push(...report.errors);
      warnings.push(...report.warnings);
    }
  }
  return { errors, warnings, modelCount };
}

function main() {
  let allowlist;
  try {
    allowlist = JSON.parse(readFileSync(ALLOWLIST_PATH, 'utf8'));
  } catch (err) {
    console.error(`lint-models: cannot read ${ALLOWLIST_PATH}: ${err.message}`);
    process.exit(2);
  }
  if (!Array.isArray(allowlist) || allowlist.some((e) => typeof e !== 'string')) {
    console.error('lint-models: allowlist must be a JSON array of "<modelId>:<rule>" strings');
    process.exit(2);
  }

  const report = lintAllChatModelManifests(process.argv[2]);
  process.stdout.write(`linted ${report.modelCount} chat-model manifests\n\n`);

  const fired = report.errors.map((f) => `${f.modelId}:${f.rule}`);
  const firedSet = new Set(fired);
  const allowSet = new Set(allowlist);

  const newGaps = report.errors.filter((f) => !allowSet.has(`${f.modelId}:${f.rule}`));
  const stale = allowlist.filter((entry) => !firedSet.has(entry));

  for (const f of newGaps) {
    process.stdout.write(`ERROR  ${f.modelId.padEnd(28)} ${f.rule}: ${f.detail}\n`);
  }
  for (const entry of stale) {
    process.stdout.write(
      `ERROR  ${entry.padEnd(28)} stale-allowlist: no longer fires - remove it from tools/lint-models-allowlist.json so the ratchet only moves forward\n`,
    );
  }
  for (const f of report.errors.filter((f) => allowSet.has(`${f.modelId}:${f.rule}`))) {
    process.stdout.write(`known  ${f.modelId.padEnd(28)} ${f.rule} (allowlisted)\n`);
  }
  for (const f of report.warnings) {
    process.stdout.write(`WARN   ${f.modelId.padEnd(28)} ${f.rule}: ${f.detail}\n`);
  }

  process.stdout.write(
    `\n${newGaps.length} new error(s), ${stale.length} stale allowlist entr(ies), ` +
      `${report.errors.length - newGaps.length} allowlisted, ${report.warnings.length} warning(s)\n`,
  );
  process.exit(newGaps.length > 0 || stale.length > 0 ? 1 : 0);
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  main();
}

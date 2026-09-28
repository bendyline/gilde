#!/usr/bin/env node
/**
 * Remove community toolsets that break the content policy in
 * lib/community-policy.mjs. Part of `npm run fix`, so an import that slipped
 * one through is cleaned up before the index is rebuilt; validate.mjs fails
 * CI on any that remain.
 *
 * Usage:
 *   node tools/prune-community.mjs              remove matches, print a summary
 *   node tools/prune-community.mjs --dry-run    report without removing
 *   node tools/prune-community.mjs --verbose    list every match
 *   node tools/prune-community.mjs --root=data  data root (default: repo data/)
 */

import { rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { communityPolicyViolation, loadCommunityToolset } from './lib/community-policy.mjs';
import { listItems } from './lib/walk.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, '..');

function parseArgs(argv) {
  const out = { dryRun: false, verbose: false, root: join(REPO_ROOT, 'data') };
  for (const raw of argv) {
    if (raw === '--dry-run') out.dryRun = true;
    else if (raw === '--verbose' || raw === '-v') out.verbose = true;
    else if (raw.startsWith('--root=')) out.root = resolve(raw.slice('--root='.length));
    else {
      console.error(`prune-community: unknown arg ${raw}`);
      console.error('usage: node tools/prune-community.mjs [--dry-run] [--verbose] [--root=data]');
      process.exit(2);
    }
  }
  return out;
}

/** Every community toolset that breaks the policy, in sorted id order. */
export function findCommunityPolicyViolations(dataRoot) {
  const out = [];
  for (const item of listItems(join(dataRoot, 'community'), 'toolset')) {
    const entry = loadCommunityToolset(item.itemDir);
    if (!entry.identity) continue;
    const violation = communityPolicyViolation(entry);
    if (violation) {
      out.push({ id: item.id, itemDir: item.itemDir, name: entry.identity.name, ...violation });
    }
  }
  return out;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const violations = findCommunityPolicyViolations(args.root);
  const byRule = new Map();
  for (const v of violations) byRule.set(v.rule, (byRule.get(v.rule) ?? 0) + 1);

  if (args.verbose) {
    for (const v of violations) console.log(`${v.rule.padEnd(20)} ${v.id} — ${v.name}: ${v.detail}`);
  }
  if (!args.dryRun) {
    for (const v of violations) rmSync(v.itemDir, { recursive: true, force: true });
  }

  const verb = args.dryRun ? 'would remove' : 'removed';
  console.log(`prune-community: ${verb} ${violations.length} community toolset(s)`);
  for (const [rule, count] of [...byRule].sort()) console.log(`  ${rule.padEnd(20)} ${count}`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();

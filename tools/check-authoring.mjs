#!/usr/bin/env node

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { fileURLToPath } from 'node:url';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import { isSafeRepoRelativePath } from './lib/mlx-source.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..');
const authoringRoot = join(repoRoot, 'authoring', 'gstack');
const chatModelAuthoringRoot = join(repoRoot, 'authoring', 'chat-models');
const chatModelDataRoot = join(repoRoot, 'data', 'chat-models');
const dataRoot = join(repoRoot, 'data', 'craftbook-templates');
const errors = [];

function readJson(path, label) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch (error) {
    errors.push(`${label}: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
}

function fileStems(dir, extension) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter((entry) =>
      extension === '' ? entry.isDirectory() : entry.isFile() && entry.name.endsWith(extension),
    )
    .map((entry) => (extension === '' ? entry.name : entry.name.slice(0, -extension.length)))
    .sort();
}

function sameMembers(label, actual, expected) {
  if (!isDeepStrictEqual(actual, expected)) {
    errors.push(`${label}: expected [${expected.join(', ')}], found [${actual.join(', ')}]`);
  }
}

const wave = readJson(join(authoringRoot, 'wave.json'), 'wave.json');
const books = Array.isArray(wave?.books) ? wave.books : [];
if (wave?.schemaVersion !== 1) errors.push('wave.json: schemaVersion must be 1');
if (!/^\d+\.\d+\.\d+$/.test(String(wave?.version ?? ''))) {
  errors.push('wave.json: version must be semver');
}
if (!/^[0-9a-f]{40}$/.test(String(wave?.sourceRevision ?? ''))) {
  errors.push('wave.json: sourceRevision must be a full lowercase git commit');
}
const licensePath = join(authoringRoot, 'LICENSE.gstack');
if (!existsSync(licensePath)) {
  errors.push('authoring/gstack: LICENSE.gstack is required for the published snapshots');
} else {
  const license = readFileSync(licensePath, 'utf8');
  if (!license.includes('MIT License') || !license.includes('Copyright (c) 2026 Garry Tan')) {
    errors.push('authoring/gstack: LICENSE.gstack must preserve upstream MIT attribution');
  }
}
if (!books.length) errors.push('wave.json: books must be a non-empty array');

const sources = books
  .map((book) => (typeof book?.source === 'string' ? book.source : ''))
  .filter(Boolean)
  .sort();
if (new Set(sources).size !== sources.length) errors.push('wave.json: duplicate source names');
const ids = books.map((book) => book?.id).filter((id) => typeof id === 'string');
if (new Set(ids).size !== ids.length) errors.push('wave.json: duplicate craftbook ids');

sameMembers('snapshots', fileStems(join(authoringRoot, 'snapshots'), ''), sources);
sameMembers('overlays', fileStems(join(authoringRoot, 'overlays'), '.json'), sources);
sameMembers('evals', fileStems(join(authoringRoot, 'evals'), '.json'), sources);

const schema = readJson(join(repoRoot, 'schemas', 'craftbook-test.schema.json'), 'test schema');
let validateTest = null;
if (schema) {
  const ajv = new Ajv2020({ allErrors: true, strict: false });
  addFormats(ajv);
  validateTest = ajv.compile(schema);
}

for (const book of books) {
  const source = String(book?.source ?? 'unknown');
  const id = String(book?.id ?? '');
  if (!/^[a-z0-9][a-z0-9-]*$/.test(source)) errors.push(`${source}: invalid source name`);
  if (!/^[a-z0-9][a-z0-9-]*$/.test(id)) errors.push(`${source}: invalid craftbook id "${id}"`);

  const snapshotPath = join(authoringRoot, 'snapshots', source, 'SKILL.md');
  if (!existsSync(snapshotPath) || readFileSync(snapshotPath, 'utf8').trim().length < 100) {
    errors.push(`${source}: missing or implausibly short snapshot`);
  }

  const overlay = readJson(join(authoringRoot, 'overlays', `${source}.json`), `${source} overlay`);
  if (!overlay || typeof overlay !== 'object' || Array.isArray(overlay)) {
    errors.push(`${source}: overlay must be an object`);
  }

  const evalSpec = readJson(join(authoringRoot, 'evals', `${source}.json`), `${source} eval`);
  if (validateTest && evalSpec && !validateTest(evalSpec)) {
    errors.push(
      `${source}: eval fails craftbook-test.schema.json: ${validateTest.errors?.[0]?.instancePath || '/'} ${validateTest.errors?.[0]?.message || 'invalid'}`,
    );
  }

  const shard = id.slice(0, 2).toLowerCase();
  const bookRoot = join(dataRoot, shard, id);
  const versionRoot = join(bookRoot, 'versions', String(wave?.version ?? ''));
  const identity = readJson(join(bookRoot, 'manifest.json'), `${id} identity`);
  const craftbook = readJson(join(versionRoot, 'craftbook.json'), `${id} craftbook`);
  const emittedTest = readJson(join(versionRoot, 'test.json'), `${id} emitted test`);

  for (const [field, expected] of [
    ['id', id],
    ['name', book?.name],
  ]) {
    if (identity?.[field] !== expected) errors.push(`${id}: identity ${field} does not match wave.json`);
    if (craftbook?.[field] !== expected) errors.push(`${id}: craftbook ${field} does not match wave.json`);
  }
  if (!isDeepStrictEqual(identity?.tags, book?.tags)) {
    errors.push(`${id}: identity tags do not match wave.json`);
  }
  for (const [field, expected] of [
    ['description', book?.description],
    ['version', wave?.version],
    ['releasedAt', wave?.releasedAt],
    ['command', id],
  ]) {
    if (craftbook?.[field] !== expected) errors.push(`${id}: craftbook ${field} does not match wave.json`);
  }
  if (!isDeepStrictEqual(craftbook?.basedOn, wave?.basedOn)) {
    errors.push(`${id}: craftbook basedOn does not match wave.json`);
  }
  if (evalSpec && emittedTest && !isDeepStrictEqual(evalSpec, emittedTest)) {
    errors.push(`${id}: emitted test.json differs semantically from ${source}.json`);
  }
}

const chatModelRecipes = new Map();
for (const filename of readdirSync(chatModelAuthoringRoot).filter((name) => name.endsWith('.json'))) {
  const recipe = readJson(join(chatModelAuthoringRoot, filename), `chat-models/${filename}`);
  if (!recipe) continue;
  const expectedId = filename.slice(0, -'.json'.length);
  if (recipe.id !== expectedId) {
    errors.push(`chat-models/${filename}: id must match the filename (${expectedId})`);
  }
  if (chatModelRecipes.has(recipe.id)) {
    errors.push(`chat-models/${filename}: duplicate recipe id ${recipe.id}`);
  }
  chatModelRecipes.set(recipe.id, recipe);
  for (const field of [
    'id',
    'name',
    'description',
    'tags',
    'category',
    'maintainer',
    'version',
    'updatedAt',
    'license',
    'parameterSize',
    'approxSizeBytes',
    'supportsTools',
    'contextWindow',
    'upstream',
  ]) {
    if (recipe[field] === undefined) {
      errors.push(`chat-models/${filename}: missing required field ${field}`);
    }
  }
  if (!/^\d+\.\d+\.\d+$/.test(String(recipe.version ?? ''))) {
    errors.push(`chat-models/${filename}: version must be semver`);
  }
  if (
    recipe.versionMinGezelVersion !== undefined &&
    !/^\d+\.\d+(?:\.\d+)?$/.test(String(recipe.versionMinGezelVersion))
  ) {
    errors.push(
      `chat-models/${filename}: versionMinGezelVersion must be a numeric dotted Gezel version`,
    );
  }
  if (recipe.mlx?.subdir !== undefined && !isSafeRepoRelativePath(recipe.mlx.subdir)) {
    errors.push(`chat-models/${filename}: mlx.subdir must be a contained POSIX-style path`);
  }
  if (!recipe.ollama && !recipe.llamaCpp && !recipe.mlx && !recipe.ds4) {
    errors.push(`chat-models/${filename}: requires an ollama, llamaCpp, mlx, or ds4 source`);
  }
}

const chatModelIdentities = new Set();
for (const shard of readdirSync(chatModelDataRoot, { withFileTypes: true })) {
  if (!shard.isDirectory()) continue;
  for (const entry of readdirSync(join(chatModelDataRoot, shard.name), { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const id = entry.name;
    chatModelIdentities.add(id);
    const recipe = chatModelRecipes.get(id);
    if (!recipe) {
      errors.push(`${id}: identity has no authoring/chat-models recipe`);
      continue;
    }
    const versionPath = join(
      chatModelDataRoot,
      shard.name,
      id,
      'versions',
      String(recipe.version),
      'manifest.json',
    );
    if (!existsSync(versionPath)) {
      errors.push(`${id}: recipe version ${recipe.version} has no generated version manifest`);
    } else if (recipe.versionMinGezelVersion !== undefined) {
      const versionManifest = readJson(versionPath, `${id}@${recipe.version} version manifest`);
      if (versionManifest?.minGezelVersion !== recipe.versionMinGezelVersion) {
        errors.push(
          `${id}@${recipe.version}: generated minGezelVersion must match versionMinGezelVersion`,
        );
      }
    }
  }
}
for (const id of chatModelRecipes.keys()) {
  if (!chatModelIdentities.has(id)) {
    errors.push(`${id}: authoring recipe has no generated identity manifest`);
  }
}

if (errors.length) {
  for (const error of errors) console.error(`ERROR authoring/gstack — ${error}`);
  process.exit(1);
}

console.log(
  `authoring: checked ${books.length} gstack pair(s) and ${chatModelRecipes.size} chat-model recipe(s), 0 errors`,
);

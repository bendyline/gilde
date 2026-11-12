#!/usr/bin/env node
/**
 * Ship the community tier as one file: write `data/community/content.pack`
 * during `prepack`, and remove it in `postpack`.
 *
 * WHY: the tier is ~45k tiny MCP-registry manifests, nearly half the files of
 * a Gezel npm install. Every file is a separate extraction and, on Windows, a
 * Defender scan: a cold `npx gezel-cli` sat silent for about seven minutes
 * (2026-11-11 audit). `package.json` `files` keeps the loose
 * `data/community/toolsets/` tree out of the tarball, so the pack is all the
 * tier ships as.
 *
 * FORMAT: Gezel's content pack, version 1, which its catalog loader reads in
 * place (packages/catalog/src/content-pack.ts in bendyline/gezel; readers
 * since 2026-09-29). Line 1 is a JSON header
 * {"format":"gezel-content-pack","version":1,"files":[[path,size],…]}; the
 * rest is every file's bytes, concatenated in header order. Paths are
 * `/`-separated, relative to the packed directory, and sorted by UTF-16 code
 * unit, so packing is byte-for-byte deterministic. Gezel's desktop bundle and
 * its live content updates already pack this tier themselves; they now find it
 * packed and leave it as is.
 *
 * A packed directory is read only through its pack, so a pack left behind in
 * a checkout would hide later edits to the loose tree from `pnpm link:gilde`.
 * `postpack` removes it, and it is git-ignored.
 *
 * Usage:
 *   node tools/pack-community.mjs            write data/community/content.pack
 *   node tools/pack-community.mjs --clean    remove it
 *   node tools/pack-community.mjs --root=<data dir>
 */

import { lstat, open, readFile, readdir, rename, rm, stat } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const CONTENT_PACK_FILENAME = 'content.pack';
const FORMAT = 'gezel-content-pack';
const FORMAT_VERSION = 1;
const WRITE_BATCH_BYTES = 4 * 1024 * 1024;
const READ_CONCURRENCY = 64;

/** A file write can land short; keep going until every byte is down. */
async function writeFully(handle, buffer) {
  let offset = 0;
  while (offset < buffer.length) {
    const { bytesWritten } = await handle.write(buffer, offset, buffer.length - offset);
    if (bytesWritten <= 0) throw new Error('pack-community: write made no progress');
    offset += bytesWritten;
  }
}

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function compareCodeUnits(a, b) {
  return a < b ? -1 : a > b ? 1 : 0;
}

function isValidPackPath(path) {
  if (path.length === 0 || path.includes('\\') || path.includes('\0')) return false;
  return path.split('/').every((part) => part !== '' && part !== '.' && part !== '..');
}

/**
 * Every regular file under `dir` as sorted `/`-joined relative paths, without
 * a pack already at its root. A symlink or other special entry has no place in
 * a pack, so it refuses the whole pack rather than silently dropping content.
 */
export async function listPackFiles(dir) {
  const out = [];
  async function walk(abs, rel) {
    for (const entry of await readdir(abs, { withFileTypes: true })) {
      const childRel = rel ? `${rel}/${entry.name}` : entry.name;
      if (!rel && entry.name === CONTENT_PACK_FILENAME) continue;
      if (entry.isDirectory()) {
        await walk(join(abs, entry.name), childRel);
      } else if (entry.isFile()) {
        if (!isValidPackPath(childRel)) {
          throw new Error(`pack-community: cannot pack ${childRel}: unrepresentable path`);
        }
        out.push(childRel);
      } else {
        throw new Error(`pack-community: cannot pack ${childRel}: not a regular file`);
      }
    }
  }
  await walk(dir, '');
  return out.sort(compareCodeUnits);
}

/** Write `dir`'s files into a pack at `<dir>/content.pack`, replacing any older one. */
export async function writeCommunityPack(dir) {
  const paths = await listPackFiles(dir);
  const contents = [];
  // Per-file latency, not bandwidth, dominates 45k small reads.
  for (let i = 0; i < paths.length; i += READ_CONCURRENCY) {
    const chunk = paths.slice(i, i + READ_CONCURRENCY);
    contents.push(...(await Promise.all(chunk.map((path) => readFile(join(dir, ...path.split('/')))))));
  }
  const files = paths.map((path, i) => [path, contents[i].length]);
  const header = Buffer.from(
    `${JSON.stringify({ format: FORMAT, version: FORMAT_VERSION, files })}\n`,
    'utf8',
  );
  const target = join(dir, CONTENT_PACK_FILENAME);
  const staging = `${target}.tmp-${process.pid}`;
  const handle = await open(staging, 'w');
  try {
    let batch = [header];
    let batchBytes = header.length;
    for (const data of contents) {
      batch.push(data);
      batchBytes += data.length;
      if (batchBytes >= WRITE_BATCH_BYTES) {
        await writeFully(handle, Buffer.concat(batch));
        batch = [];
        batchBytes = 0;
      }
    }
    if (batch.length > 0) await writeFully(handle, Buffer.concat(batch));
    await handle.sync();
  } catch (err) {
    await handle.close().catch(() => {});
    await rm(staging, { force: true }).catch(() => {});
    throw err;
  }
  await handle.close();
  await rename(staging, target);
  const bytes = contents.reduce((sum, data) => sum + data.length, 0);
  return { files: files.length, bytes, packPath: target };
}

export async function removeCommunityPack(dir) {
  await rm(join(dir, CONTENT_PACK_FILENAME), { force: true });
}

async function main() {
  const args = process.argv.slice(2);
  let root = join(REPO_ROOT, 'data');
  let clean = false;
  for (const arg of args) {
    if (arg === '--clean') clean = true;
    else if (arg.startsWith('--root=')) root = resolve(arg.slice('--root='.length));
    else {
      console.error(`pack-community: unknown arg ${arg}`);
      console.error('usage: node tools/pack-community.mjs [--clean] [--root=<data dir>]');
      process.exit(2);
    }
  }
  const dir = join(root, 'community');
  if (clean) {
    await removeCommunityPack(dir);
    console.log(`pack-community: removed ${join(dir, CONTENT_PACK_FILENAME)}`);
    return;
  }
  if (!(await stat(dir).catch(() => null))?.isDirectory()) {
    throw new Error(`pack-community: no community tier at ${dir}`);
  }
  // `build` writes these during prepack; a pack without them lists nothing.
  for (const index of ['toolsets/raw-index.json', 'toolsets/index.json']) {
    if (!(await stat(join(dir, ...index.split('/'))).catch(() => null))?.isFile()) {
      throw new Error(`pack-community: ${index} is missing; run \`npm run build\` first`);
    }
  }
  const started = Date.now();
  const result = await writeCommunityPack(dir);
  const size = (await lstat(result.packPath)).size;
  console.log(
    `pack-community: ${result.files} files -> ${CONTENT_PACK_FILENAME} (${(size / 1048576).toFixed(1)} MB, ${((Date.now() - started) / 1000).toFixed(1)}s)`,
  );
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().catch((err) => {
    console.error(err.message ?? err);
    process.exit(1);
  });
}

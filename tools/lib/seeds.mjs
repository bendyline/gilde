import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { listItems, listVersionDirs } from './walk.mjs';

/**
 * Absolute paths of project-type seed files (workspaceSeed /
 * artifactsSeed entries, resolved inside their version folder).
 *
 * Why they need special-casing: seeds are param-templated by design -
 * gezel substitutes `{{param}}` placeholders at adoption time and only
 * then writes the result into the new project. A seed like
 * `"weeklyTarget": {{weeklyTarget}}` is therefore NOT valid JSON on
 * disk and never parsed as JSON by the runtime, so the "every .json
 * parses" hygiene rule and the canonical-format check must skip them.
 */
export function collectSeedExemptFiles(dataRoot) {
  const out = new Set();
  for (const root of [dataRoot]) {
    for (const item of listItems(root, 'project-type')) {
      for (const version of listVersionDirs(item.itemDir)) {
        const versionDir = join(item.itemDir, 'versions', version);
        let manifest;
        try {
          manifest = JSON.parse(readFileSync(join(versionDir, 'manifest.json'), 'utf8'));
        } catch {
          continue;
        }
        for (const name of [...(manifest.workspaceSeed ?? []), ...(manifest.artifactsSeed ?? [])]) {
          if (typeof name === 'string') out.add(join(versionDir, name));
        }
      }
    }
  }
  return out;
}

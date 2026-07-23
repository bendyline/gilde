// Vendored from gezel packages/catalog/scripts/importer/license-resolver.ts.
// SPDX ids the importer is willing to ship in the community tier; anything
// outside this list is quarantined for human review, so a community
// identity carrying one is a policy error here too.
export const PERMISSIVE_LICENSES = new Set([
  'MIT',
  'Apache-2.0',
  'BSD-2-Clause',
  'BSD-3-Clause',
  'BSD-3-Clause-Clear',
  'ISC',
  '0BSD',
  'MPL-2.0',
  'CC0-1.0',
  'Unlicense',
]);

export function isPermissive(spdx) {
  return PERMISSIVE_LICENSES.has(spdx);
}

// Vendored from gezel packages/core/src/schemas/catalog.ts (isSemver /
// compareSemver and the SemverRegex they share). Byte-compatible ordering
// with the gezel catalog runtime is load-bearing for build-index.

export const SemverRegex = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;

export function isSemver(v) {
  return SemverRegex.test(v);
}

function parseSemver(v) {
  const m = SemverRegex.exec(v);
  if (!m) return null;
  const noBuild = v.split('+', 1)[0] ?? v;
  const [versionCore, pre] = noBuild.split('-', 2);
  const [major, minor, patch] = versionCore.split('.').map((n) => Number.parseInt(n, 10));
  return { major: major ?? 0, minor: minor ?? 0, patch: patch ?? 0, pre: pre ?? '' };
}

function compareIdentifier(a, b) {
  // Numeric identifiers compare numerically; alphanumerics lexically;
  // numeric identifiers always sort below alphanumerics. (semver 11.4.3)
  const aNum = /^\d+$/.test(a);
  const bNum = /^\d+$/.test(b);
  if (aNum && bNum) return Number.parseInt(a, 10) - Number.parseInt(b, 10);
  if (aNum) return -1;
  if (bNum) return 1;
  return a < b ? -1 : a > b ? 1 : 0;
}

export function compareSemver(a, b) {
  const pa = parseSemver(a);
  const pb = parseSemver(b);
  if (!pa) throw new Error(`not semver: ${a}`);
  if (!pb) throw new Error(`not semver: ${b}`);
  if (pa.major !== pb.major) return pa.major - pb.major;
  if (pa.minor !== pb.minor) return pa.minor - pb.minor;
  if (pa.patch !== pb.patch) return pa.patch - pb.patch;
  if (pa.pre === pb.pre) return 0;
  if (pa.pre === '') return 1;
  if (pb.pre === '') return -1;
  const aIds = pa.pre.split('.');
  const bIds = pb.pre.split('.');
  const len = Math.max(aIds.length, bIds.length);
  for (let i = 0; i < len; i++) {
    const ai = aIds[i];
    const bi = bIds[i];
    if (ai === undefined) return -1;
    if (bi === undefined) return 1;
    const c = compareIdentifier(ai, bi);
    if (c !== 0) return c;
  }
  return 0;
}

/** Compare two semver strings, swallowing parse errors as "equal" (source.ts safeCompare). */
export function safeCompare(a, b) {
  try {
    return compareSemver(a, b);
  } catch {
    return 0;
  }
}

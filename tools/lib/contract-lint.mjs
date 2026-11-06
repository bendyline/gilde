/**
 * Lint a craftbook contract (gezel docs/task-strategies.md). Shared by
 * add-contract.mjs, which refuses a contract with problems, and
 * draft-contract.mjs, which hands the problems back to the drafting model.
 */

const RUNTIME_TOKEN = /^(?:task|diffpack)\./;
const PATTERN_KINDS = new Set(['contains', 'notContains', 'citationsResolve', 'valuesSubsetOf']);

export const normalizeContractPath = (p) =>
  p.trim().replace(/^\.\//, '').replace(/\/+$/, '').toLowerCase();

/** The files a check reads, where the check names them directly. */
export function checkedFiles(check) {
  return [
    ...(typeof check.file === 'string' ? [check.file] : []),
    ...(Array.isArray(check.files) ? check.files.filter((f) => typeof f === 'string') : []),
  ];
}

/**
 * Mirrors gezel's `contractLintProblems` (core/src/craftbook-contract-lint.ts).
 * A contract judges the RESULT: each check may read only a file the contract
 * declares (a deliverable, its text source, an input, a grounding source, or a
 * path under one of those). A check on `outline.md` or `verdict.md` would
 * grade the recipe's process and fail any strategy that skips it.
 */
export function lintContract(contract) {
  const problems = [];
  const declared = new Set();
  const add = (p) => p && declared.add(normalizeContractPath(p));
  for (const d of contract.deliverables ?? []) {
    add(d.path);
    add(d.textSource?.path);
  }
  for (const i of contract.inputs ?? []) add(i.path);
  for (const s of contract.grounding?.sources ?? []) add(s);
  const isDeclared = (file) =>
    declared.has(normalizeContractPath(file)) ||
    [...declared].some((d) => normalizeContractPath(file).startsWith(`${d}/`));
  if (!(contract.deliverables ?? []).some((d) => (d.role ?? 'primary') === 'primary')) {
    problems.push('no primary deliverable');
  }
  const ids = new Set();
  for (const c of contract.criteria ?? []) {
    if (ids.has(c.id)) problems.push(`duplicate criterion id "${c.id}"`);
    ids.add(c.id);
    if ((c.enforce ?? 'gate') === 'gate' && !(c.checks ?? []).length) {
      problems.push(`criterion "${c.id}" is enforced as a gate but has no checks`);
    }
    for (const check of c.checks ?? []) {
      for (const file of checkedFiles(check)) {
        if (!isDeclared(file)) {
          problems.push(
            `criterion "${c.id}" checks ${file}, which the contract does not declare as a deliverable, text source, input or grounding source`,
          );
        }
      }
    }
  }
  if (typeof contract.goal !== 'string' || !contract.goal.trim() || contract.goal.length > 400) {
    problems.push('goal must be 1-400 characters');
  }
  return problems;
}

/**
 * Problems a contract has against the book it belongs to: a `{{token}}` the
 * book never defines interpolates to itself and names a file nobody writes,
 * and a pattern that does not compile fails every run.
 */
export function contractBookProblems(contract, book) {
  const problems = [];
  const params = new Set(Object.keys(book.paramSchema?.properties ?? {}));
  const tokens = new Set(
    [...JSON.stringify(contract).matchAll(/\{\{\s*([^}]+?)\s*\}\}/g)].map((m) => m[1]),
  );
  for (const token of tokens) {
    if (!params.has(token) && !RUNTIME_TOKEN.test(token)) {
      problems.push(`{{${token}}} is not one of the book's parameters (${[...params].join(', ') || 'none'})`);
    }
  }
  for (const c of contract.criteria ?? []) {
    for (const check of c.checks ?? []) {
      if (!PATTERN_KINDS.has(check.kind) || typeof check.pattern !== 'string') continue;
      try {
        new RegExp(check.pattern, check.flags ?? '');
      } catch (err) {
        problems.push(`criterion "${c.id}": pattern ${JSON.stringify(check.pattern)} does not compile (${err.message})`);
      }
    }
  }
  const bookText = JSON.stringify(book.steps ?? []);
  for (const d of contract.deliverables ?? []) {
    for (const path of [d.path, d.textSource?.path]) {
      if (!path || path === './') continue;
      const name = path.split('/').filter(Boolean).at(-1);
      if (name && !bookText.includes(name)) {
        problems.push(`deliverable "${d.id}" names ${path}, but no step of the book mentions ${name}`);
      }
    }
  }
  return problems;
}

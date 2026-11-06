import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  buildPrompt,
  checkVocabulary,
  draftProblems,
  examplesFor,
  holdUnreviewedChecks,
} from '../draft-contract.mjs';
import { contractBookProblems, lintContract } from '../lib/contract-lint.mjs';

const book = {
  id: 'memo',
  name: 'Memo',
  paramSchema: { properties: { workPath: { default: '{{task.dir}}' }, topic: {} } },
  steps: [
    { id: 'outline', prompt: 'Write {{workPath}}/outline.md.' },
    { id: 'write', prompt: 'Write {{workPath}}/memo.md with write_artifact.' },
  ],
};

const contract = {
  goal: 'A one-page memo on the topic.',
  deliverables: [
    { id: 'memo', path: '{{workPath}}/memo.md', artifact: true, kind: 'markdown-doc', description: 'The memo' },
  ],
  criteria: [
    {
      id: 'written',
      kind: 'acceptance',
      text: 'The memo is written',
      checks: [{ kind: 'minBytes', file: '{{workPath}}/memo.md', bytes: 200, artifact: true }],
    },
    {
      id: 'clear',
      kind: 'quality',
      enforce: 'advisory',
      text: 'It reads clearly',
      judge: { rubric: 'Does it read clearly?' },
    },
  ],
};

test('a sound draft has no problems', () => {
  assert.deepEqual(draftProblems(contract, book), []);
});

test('flags a check on a process file the contract does not declare', () => {
  const bad = structuredClone(contract);
  bad.criteria[0].checks.push({ kind: 'minBytes', file: '{{workPath}}/outline.md', bytes: 50, artifact: true });
  assert.match(lintContract(bad).join('\n'), /outline\.md, which the contract does not declare/);
});

test('flags an undefined token, a broken pattern and a deliverable no step names', () => {
  const bad = structuredClone(contract);
  bad.deliverables[0].path = '{{outDir}}/summary.md';
  bad.criteria[0].checks = [{ kind: 'contains', file: '{{outDir}}/summary.md', pattern: '(unclosed' }];
  const problems = contractBookProblems(bad, book).join('\n');
  assert.match(problems, /\{\{outDir\}\} is not one of the book's parameters/);
  assert.match(problems, /does not compile/);
  assert.match(problems, /no step of the book mentions summary\.md/);
});

test('reports schema failures and refuses eval-only criteria', () => {
  const bad = structuredClone(contract);
  delete bad.deliverables[0].description;
  bad.criteria[1].enforce = 'eval-only';
  const problems = draftProblems(bad, book).join('\n');
  assert.match(problems, /missing required key "description"/);
  assert.match(problems, /eval-only; use gate or advisory/);
});

test('the vocabulary lists contract checks and leaves out process checks', () => {
  const vocabulary = checkVocabulary();
  assert.match(vocabulary, /- claimsGrounded \{ file, /);
  assert.match(vocabulary, /- commandEvidence \{ .*expect: pass\|fail/);
  assert.doesNotMatch(vocabulary, /corpusCoverage|markdownHeadingsMatch|planStructure/);
});

test('examples never include the book being drafted', () => {
  const ids = examplesFor('research-report').map((e) => e.outline.id);
  assert.equal(ids.length, 4);
  assert.ok(!ids.includes('research-report'));
});

test('the prompt shows the book without its contract', () => {
  const prompt = buildPrompt({ ...book, contract }, [], 'VOCAB');
  assert.ok(prompt.includes('"id": "memo"'));
  assert.ok(!prompt.includes('A one-page memo on the topic.'));
});

test('an unreviewed draft enforces only structure and citation checks', () => {
  const full = structuredClone(contract);
  full.criteria[0].checks.push({ kind: 'contains', file: '{{workPath}}/memo.md', pattern: 'summary', artifact: true });
  full.criteria.push({
    id: 'owner',
    kind: 'acceptance',
    text: 'It names an owner',
    checks: [{ kind: 'contains', file: '{{workPath}}/memo.md', pattern: 'owner', artifact: true }],
  });
  const shipped = holdUnreviewedChecks(full);
  assert.deepEqual(
    shipped.criteria[0].checks.map((c) => c.kind),
    ['minBytes'],
  );
  assert.equal(shipped.criteria[2].enforce, 'advisory');
  assert.equal(shipped.criteria[2].checks.length, 1);
  assert.equal(full.criteria[0].checks.length, 2);
});

test('an unreviewed draft does not enforce citation checks on a page', () => {
  const full = structuredClone(contract);
  full.criteria.push({
    id: 'grounded',
    kind: 'quality',
    text: 'Its facts appear in its sources',
    checks: [
      { kind: 'claimsGrounded', file: 'digest.html' },
      { kind: 'claimsGrounded', file: '{{workPath}}/memo.md', artifact: true },
      { kind: 'claimsGrounded', file: '{{sourceOutputPath}}' },
    ],
  });
  const files = holdUnreviewedChecks(full).criteria[2].checks.map((c) => c.file);
  assert.deepEqual(files, ['{{workPath}}/memo.md', '{{sourceOutputPath}}']);
});

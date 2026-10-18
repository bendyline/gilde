import assert from 'node:assert/strict';
import { test } from 'node:test';
import { lintCraftbookHandoffs } from '../lint-handoffs.mjs';

const rules = (book) => lintCraftbookHandoffs(book).map((f) => `${f.rule}:${f.detail.split(' ')[1]}`);

// invoice-run before 1.1.x: collect was asked about skipped clients while
// consuming only billables.json, so a fresh session had no way to know.
const scope = {
  id: 'scope',
  suggestedRole: 'kantoormeester',
  advanceWhen: { file: '{{workPath}}/billables.json', artifact: true },
  gate: { checks: [{ kind: 'minBytes', file: '{{workPath}}/scope.md', artifact: true }] },
  next: 'collect',
};
const collect = {
  id: 'collect',
  suggestedRole: 'copywriter',
  prompt: 'Open {{workPath}}/billables.json, and name every client scope.md skipped.',
  consumes: [{ file: '{{workPath}}/billables.json', artifact: true }],
  advanceWhen: { file: 'report.md' },
  next: 'finish',
};
const finish = { id: 'finish', suggestedRole: 'developer', terminal: true };

test('flags a later step that names an upstream file it does not consume', () => {
  assert.deepEqual(rules({ id: 'b', steps: [scope, collect, finish] }), [
    'unconsumed-handoff:"collect"',
  ]);
});

test('accepts the handoff once it is consumed, by full path or file name', () => {
  for (const file of ['{{workPath}}/scope.md', 'scope.md']) {
    const fixed = { ...collect, consumes: [...collect.consumes, { file, artifact: true }] };
    assert.deepEqual(rules({ id: 'b', steps: [scope, fixed, finish] }), []);
  }
});

test('leaves a same-role successor alone, since it may share the session', () => {
  const sameRole = { ...collect, suggestedRole: 'kantoormeester' };
  assert.deepEqual(rules({ id: 'b', steps: [scope, sameRole, finish] }), []);
});

test('does not read a file name inside a longer one as a mention', () => {
  const notes = { id: 'notes', suggestedRole: 'a', advanceWhen: { file: 'notes.md' } };
  const later = { id: 'later', suggestedRole: 'b', prompt: 'Update release-notes.md.' };
  assert.deepEqual(rules({ id: 'b', steps: [notes, later] }), []);
});

test('flags an entry-step scope file nothing downstream ever opens', () => {
  const silent = { ...collect, prompt: 'Open {{workPath}}/billables.json.' };
  assert.deepEqual(rules({ id: 'b', steps: [scope, silent, finish] }), [
    'orphan-scope-file:step',
  ]);
});

test('flags routing that lives in a prose next argument on a loop-back default', () => {
  const evaluate = {
    id: 'evaluate',
    suggestedRole: 'reviewer',
    prompt: 'All pass: call `advance_task_step({ ref, stepId: "evaluate", next: "finish" })`.',
    next: 'collect',
  };
  const steps = [scope, { ...collect, consumes: [...collect.consumes, { file: 'scope.md' }] }];
  assert.deepEqual(rules({ id: 'b', steps: [...steps, evaluate, finish] }), [
    'routing-in-prose:"evaluate"',
  ]);
});

test('accepts a verdict gate that routes rejections and defaults forward', () => {
  const evaluate = {
    id: 'evaluate',
    suggestedRole: 'reviewer',
    prompt: 'Write the verdict. On PASS, advance; the default edge is finish.',
    gate: { checks: [{ kind: 'contains', file: 'verdict.md', pattern: 'PASS' }], onReject: 'collect' },
    next: 'finish',
  };
  const repair = { id: 'repair', suggestedRole: 'developer', prompt: 'Fix it.', next: 'evaluate' };
  const steps = [scope, { ...collect, consumes: [...collect.consumes, { file: 'scope.md' }] }];
  assert.deepEqual(rules({ id: 'b', steps: [...steps, evaluate, finish, repair] }), []);
});

// automation-recipe and freeze-scope stalled on steps told to write a file
// whose own toolPolicy removed every writer (gezel coverage run, 2026-10-10).
test('flags a step told to write a file its toolPolicy cannot write', () => {
  const draft = {
    id: 'draft',
    suggestedRole: 'a',
    prompt: 'Slug it and write the recipe to automations/<slug>.json, one file.',
    toolPolicy: { outputMedium: 'task-note', disallowBuiltinToolsets: ['workspace-fs-write'] },
  };
  assert.deepEqual(rules({ id: 'b', steps: [draft] }), ['output-without-writer:"draft"']);
  const writable = { ...draft, toolPolicy: { outputMedium: 'workspace' } };
  assert.deepEqual(rules({ id: 'b', steps: [writable] }), []);
});

test('reads a path after "from" or "following" as an input, and a reviews/ path as an artifact', () => {
  const evaluate = {
    id: 'evaluate',
    suggestedRole: 'a',
    prompt: 'Write PASS/FAIL per criterion, checking every sub-question from {{workPath}}/scope.md.',
    toolPolicy: { outputMedium: 'task-note', disallowBuiltinToolsets: ['workspace-fs-write', 'artifacts'] },
  };
  const review = {
    id: 'review',
    suggestedRole: 'b',
    prompt: 'Write the findings to reviews/security.md.',
    toolPolicy: { outputMedium: 'artifact', disallowBuiltinToolsets: ['workspace-fs-write'] },
  };
  assert.deepEqual(rules({ id: 'b', steps: [evaluate, review] }), []);
});

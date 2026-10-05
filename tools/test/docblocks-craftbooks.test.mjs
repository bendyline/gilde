import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const data = new URL('../../data/', import.meta.url);
const loadIndex = async (kind) => JSON.parse(await readFile(new URL(`${kind}/index.json`, data), 'utf8')).entries;

test('DocBlocks publishing steps use reasoning roles rather than fixed-function generators', async () => {
  const [books, roles] = await Promise.all([loadIndex('craftbook-templates'), loadIndex('gezel-templates')]);
  assert.equal(roles.find((entry) => entry.manifest.id === 'video-generator')?.manifest.frontmatter?.fixedFunction?.tool, 'generate_video');
  for (const id of ['powerpoint-deck', 'research-to-document', 'report-pdf', 'narrated-slideshow']) {
    const book = books.find((entry) => entry.manifest.id === id)?.manifest;
    assert.ok(book, `missing ${id}`);
    for (const step of book.steps.filter((step) => ['publish', 'save', 'finish'].includes(step.id))) {
      const role = roles.find((entry) => entry.manifest.id === step.suggestedRole)?.manifest;
      assert.ok(role, `${id}/${step.id}: missing role ${step.suggestedRole}`);
      assert.equal(role.frontmatter?.fixedFunction, undefined, `${id}/${step.id}: a fixed-function role bypasses the DocBlocks procedure`);
    }
  }
});

// Required-input declarations currently synthesize text-read instructions. Native
// binaries stay in format-aware procedures and output gates until that contract
// can name a format-aware reader.
test('DocBlocks successful reviews advance forward and never request binary text reads', async () => {
  const books = await loadIndex('craftbook-templates');
  for (const id of ['powerpoint-deck', 'research-to-document', 'report-pdf', 'narrated-slideshow']) {
    const book = books.find((entry) => entry.manifest.id === id)?.manifest;
    assert.ok(book, `missing ${id}`);
    if (id !== 'powerpoint-deck') assert.equal(book.steps.find((step) => step.id === 'evaluate')?.next, 'finish', `${id}: PASS must finish by default`);
    if (id === 'powerpoint-deck') assert.equal(book.steps.find((step) => step.id === 'review')?.next, 'save');
    for (const step of book.steps) {
      for (const input of step.consumes ?? []) {
        assert.doesNotMatch(input.file, /\.(?:docx|pptx|pdf|mp4|gif)$/i, `${id}/${step.id}: consumes currently forces a text read`);
      }
    }
  }
});

test('PowerPoint completes on saving the deck, retaining checks without extra handoffs', async () => {
  const books = await loadIndex('craftbook-templates');
  const book = books.find((entry) => entry.manifest.id === 'powerpoint-deck')?.manifest;
  assert.ok(book);
  assert.deepEqual(book.steps.map((step) => step.id), ['research', 'outline', 'write', 'review', 'save']);
  const save = book.steps.at(-1);
  assert.equal(save.terminal, true);
  assert.equal(save.next, undefined);
  assert.equal(save.gate.onReject, 'save');
  assert.ok(book.steps.every((step) => step.assignee?.kind !== 'user'));
  for (const [file, artifact] of [['{{outputPath}}', false], ['{{workPath}}/deck.pptx', true]]) {
    assert.ok(save.gate.checks.some((check) => check.kind === 'minBytes' && check.file === file && Boolean(check.artifact) === artifact && check.bytes >= 1000), 'both saved copies must exist before completion');
  }
  for (const action of ['convert_document', 'preview_document', 'inspect_document', 'save_artifact', 'copy_artifact_to_workspace']) assert.ok(save.prompt.includes(action), action);
  assert.match(save.prompt, /Reopen workspace/);
  assert.match(save.prompt, /Saved your PowerPoint to/);
  assert.match(save.prompt, /source hash matches the retained artifact/);
  assert.match(book.steps.find((step) => step.id === 'review').prompt, /next: "write"/);
  const evalSpec = JSON.parse(await readFile(new URL(`craftbook-templates/po/powerpoint-deck/versions/${book.version}/test.json`, data), 'utf8'));
  for (const [path, artifact] of [['deliverables/d-day.pptx', false], ['{{task.dir}}/deck.pptx', true]]) {
    assert.ok(evalSpec.success.deliverables.some((d) => d.path === path && Boolean(d.artifact) === artifact && d.checks?.some((check) => check.kind === 'binaryDocument')), 'the eval must reject text pretending to be a PPTX');
  }
});

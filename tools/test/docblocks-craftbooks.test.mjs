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
    for (const step of book.steps.filter((step) => ['publish', 'finish'].includes(step.id))) {
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
    assert.equal(book.steps.find((step) => step.id === 'evaluate')?.next, 'finish', `${id}: PASS must finish by default`);
    if (id === 'powerpoint-deck') assert.equal(book.steps.find((step) => step.id === 'review')?.next, 'publish');
    for (const step of book.steps) {
      for (const input of step.consumes ?? []) {
        assert.doesNotMatch(input.file, /\.(?:docx|pptx|pdf|mp4|gif)$/i, `${id}/${step.id}: consumes currently forces a text read`);
      }
    }
  }
});

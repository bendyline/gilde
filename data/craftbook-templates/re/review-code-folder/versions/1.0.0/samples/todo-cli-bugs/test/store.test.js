import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { addTodo, loadTodos, removeTodo } from '../src/store.js';

async function withFile(run) {
  const dir = await mkdtemp(join(tmpdir(), 'todo-cli-'));
  try {
    await run(join(dir, 'todos.json'));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

test('a missing file is an empty list', () =>
  withFile(async (file) => {
    assert.deepEqual(await loadTodos(file), []);
  }));

test('add keeps to-dos in the order they were added', () =>
  withFile(async (file) => {
    await addTodo(file, 'Buy oat milk');
    await addTodo(file, 'Call the plumber');
    const todos = await loadTodos(file);
    assert.deepEqual(
      todos.map((todo) => todo.text),
      ['Buy oat milk', 'Call the plumber'],
    );
  }));

test('a number past the end is an error', () =>
  withFile(async (file) => {
    await addTodo(file, 'Buy oat milk');
    await assert.rejects(removeTodo(file, 3), /no to-do number 3/);
  }));

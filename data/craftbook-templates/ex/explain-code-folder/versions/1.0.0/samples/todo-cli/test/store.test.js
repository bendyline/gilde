import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { addTodo, completeTodo, loadTodos, removeTodo } from '../src/store.js';

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

test('done marks the numbered to-do and saves it', () =>
  withFile(async (file) => {
    await addTodo(file, 'Buy oat milk');
    await addTodo(file, 'Call the plumber');
    await completeTodo(file, 2);
    const todos = await loadTodos(file);
    assert.equal(todos[0].done, false);
    assert.equal(todos[1].done, true);
  }));

test('remove takes out the numbered to-do', () =>
  withFile(async (file) => {
    await addTodo(file, 'Buy oat milk');
    await addTodo(file, 'Call the plumber');
    await addTodo(file, 'Water the plants');
    const removed = await removeTodo(file, 1);
    assert.equal(removed.text, 'Buy oat milk');
    const todos = await loadTodos(file);
    assert.deepEqual(
      todos.map((todo) => todo.text),
      ['Call the plumber', 'Water the plants'],
    );
  }));

test('a number past the end is an error', () =>
  withFile(async (file) => {
    await addTodo(file, 'Buy oat milk');
    await assert.rejects(removeTodo(file, 3), /no to-do number 3/);
  }));

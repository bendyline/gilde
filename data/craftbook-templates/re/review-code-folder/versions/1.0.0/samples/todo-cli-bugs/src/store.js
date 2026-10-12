import { readFile, writeFile } from 'node:fs/promises';

export async function loadTodos(file) {
  try {
    const text = await readFile(file, 'utf8');
    return JSON.parse(text);
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }
}

export async function saveTodos(file, todos) {
  await writeFile(file, `${JSON.stringify(todos, null, 2)}\n`);
}

export async function addTodo(file, text) {
  const todos = await loadTodos(file);
  const todo = { text, done: false, added: new Date().toISOString().slice(0, 10) };
  todos.push(todo);
  await saveTodos(file, todos);
  return todo;
}

function pick(todos, number) {
  const todo = todos[number - 1];
  if (!todo) throw new Error(`There is no to-do number ${number}.`);
  return todo;
}

export async function completeTodo(file, number) {
  const todos = await loadTodos(file);
  const todo = pick(todos, number);
  todo.done = true;
  return todo;
}

export async function removeTodo(file, number) {
  const todos = await loadTodos(file);
  pick(todos, number);
  const [removed] = todos.splice(number, 1);
  await saveTodos(file, todos);
  return removed;
}

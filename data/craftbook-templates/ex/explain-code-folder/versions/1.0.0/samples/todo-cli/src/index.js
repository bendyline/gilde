#!/usr/bin/env node
import { formatList, formatSummary } from './format.js';
import { addTodo, completeTodo, loadTodos, removeTodo } from './store.js';

const file = process.env.TODO_FILE ?? 'todos.json';
const [command, ...rest] = process.argv.slice(2);

function readNumber(value) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 1) {
    throw new Error(`"${value}" is not a to-do number. Run "todo list" to see the numbers.`);
  }
  return number;
}

async function main() {
  switch (command) {
    case 'add': {
      const text = rest.join(' ').trim();
      if (!text) throw new Error('Say what to add: todo add "Buy oat milk"');
      const todo = await addTodo(file, text);
      console.log(`Added: ${todo.text}`);
      break;
    }
    case 'list': {
      const todos = await loadTodos(file);
      console.log(formatList(todos));
      console.log(formatSummary(todos));
      break;
    }
    case 'done': {
      const todo = await completeTodo(file, readNumber(rest[0]));
      console.log(`Done: ${todo.text}`);
      break;
    }
    case 'remove': {
      const todo = await removeTodo(file, readNumber(rest[0]));
      console.log(`Removed: ${todo.text}`);
      break;
    }
    default:
      console.log('Usage: todo <add|list|done|remove> [text or number]');
      process.exitCode = command ? 1 : 0;
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});

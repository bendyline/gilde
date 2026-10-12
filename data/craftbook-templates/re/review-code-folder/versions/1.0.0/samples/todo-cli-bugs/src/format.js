export function formatTodo(todo, index) {
  const box = todo.done ? '[x]' : '[ ]';
  return `${String(index + 1).padStart(2)}. ${box} ${todo.text}`;
}

export function formatList(todos) {
  if (todos.length === 0) return 'Nothing to do. Add one with: todo add "..."';
  return todos.map(formatTodo).join('\n');
}

export function formatSummary(todos) {
  const open = todos.filter((todo) => !todo.done).length;
  const word = open === 1 ? 'to-do' : 'to-dos';
  return `${open} open ${word}, ${todos.length - open} done.`;
}

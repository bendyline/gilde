# todo-cli

A tiny to-do list for the command line. It keeps your to-dos in a JSON file
in the current folder, so each project folder can have its own list.

## Usage

```sh
node src/index.js add "Buy oat milk"
node src/index.js list
node src/index.js done 2
node src/index.js remove 1
```

`list` prints every to-do with its number. `done` and `remove` take that
number. Set `TODO_FILE` to keep the list somewhere else:

```sh
TODO_FILE=~/todos.json node src/index.js list
```

## Tests

```sh
npm test
```

The tests use Node's built-in test runner (Node 18 or newer). There are no
dependencies to install.

// The standalone demo's sample conversation. In Gezel, the Go player's moves
// and table talk come from the model the person chooses; here a small scripted
// policy picks a legal white move (or a pass) and plays it through the same
// make_move tool the live crew member calls. The page hands over its rules
// engine as `rules` (the game-store script's own), so every stone is checked.
window.demoChat = (function () {
  'use strict';
  var script = {
    name: 'Sora',
    role: 'Go Player',
    greeting: 'Hello, I’m Sora. We’ve each placed two stones on a 9×9 board, and mine just settled on C3. You have black and the move: click any point to place a stone, or pass.',
    suggestions: [
      'Explain your last move',
      'Who’s winning?',
      'What’s a good opening plan?',
      'Start a 13×13 game',
    ],
    respond: respond,
    reactions: { user_move: onUserMove },
  };

  function rules() { return script.rules; }
  function read(ctx) { return ctx.read('game.json'); }
  function plural(n, word) { return n + ' ' + word + (n === 1 ? '' : 's'); }

  // Who borders the empty region holding `index`: 'X', 'O', 'both', or 'none'.
  function region(squares, size, index) {
    var R = rules();
    var seen = {};
    var queue = [index];
    var points = 0;
    var borders = {};
    seen[index] = true;
    while (queue.length) {
      var current = queue.pop();
      points += 1;
      R.neighbors(current, size).forEach(function (next) {
        if (squares[next] === '.' && !seen[next]) { seen[next] = true; queue.push(next); }
        else if (squares[next] !== '.') borders[squares[next]] = true;
      });
    }
    return { size: points, owner: borders.X && borders.O ? 'both' : borders.X ? 'X' : borders.O ? 'O' : 'none' };
  }

  // Empty points that still sit between our areas (or nowhere yet).
  function openPoints(squares, size) {
    var seen = {};
    var open = 0;
    for (var i = 0; i < squares.length; i += 1) {
      if (squares[i] !== '.' || seen[i]) continue;
      var r = region(squares, size, i);
      var queue = [i];
      seen[i] = true;
      while (queue.length) {
        var current = queue.pop();
        rules().neighbors(current, size).forEach(function (next) { if (squares[next] === '.' && !seen[next]) { seen[next] = true; queue.push(next); } });
      }
      if (r.owner === 'both' || r.owner === 'none') open += r.size;
    }
    return open;
  }

  // Captures first, then rescue a group in atari, never fill an own eye or
  // play into self-atari, and otherwise build on the third and fourth lines.
  function scorePoint(state, name, index) {
    var R = rules();
    var size = state.boardSize;
    var squares = state.squares;
    var point = R.parsePoint(name, size);
    var placed = R.applyPlacement(squares, size, 'ai', name, state.previousPosition);
    if (placed.error) return -Infinity;
    var next = placed.squares;
    var near = R.neighbors(point.index, size);
    var value = placed.captures.length * 10;
    if (near.every(function (i) { return squares[i] === 'O'; })) value -= 20;
    var mine = R.groupAt(next, point.index, size);
    var libs = mine.liberties.length;
    if (libs === 1 && !placed.captures.length) value -= 6 + 4 * mine.stones.length;
    var counted = {};
    near.forEach(function (i) {
      if (squares[i] !== 'O' || counted[i]) return;
      var group = R.groupAt(squares, i, size);
      group.stones.forEach(function (s) { counted[s] = true; });
      if (group.liberties.length === 1 && libs >= 2) value += 6 * group.stones.length;
    });
    var pressed = {};
    near.forEach(function (i) {
      if (next[i] !== 'X' || pressed[i]) return;
      var group = R.groupAt(next, i, size);
      group.stones.forEach(function (s) { pressed[s] = true; });
      if (group.liberties.length === 1) value += 3 + group.stones.length;
    });
    var owner = region(squares, size, point.index).owner;
    if (owner === 'O') value -= 1;
    if (owner === 'X' && !placed.captures.length) value -= 3;
    var edge = Math.min(point.x, point.y, size - 1 - point.x, size - 1 - point.y);
    var stones = squares.replace(/\./g, '').length;
    if (stones < size) value += edge === 2 ? 2 : edge === 3 ? 1.5 : edge >= 4 ? 1 : edge === 1 ? -1 : -2;
    else if (edge === 0) value -= 0.8;
    var theirs = state.lastMove && state.lastMove.by === 'user' && state.lastMove.move !== 'pass' ? R.parsePoint(state.lastMove.move, size) : null;
    if (theirs) value += Math.max(0, 3 - Math.max(Math.abs(theirs.x - point.x), Math.abs(theirs.y - point.y))) * 0.3;
    value += Math.min(libs, 4) * 0.15;
    return value + ((state.moveLog.length * 7 + index * 13) % 10) / 100;
  }

  function choose(state) {
    var R = rules();
    var best = null;
    var bestScore = -Infinity;
    state.legalMoves.forEach(function (name, index) {
      if (name === 'pass') return;
      var value = scorePoint(state, name, index);
      if (value > bestScore) { best = name; bestScore = value; }
    });
    var score = R.scoreArea(state.squares, state.boardSize, state.komi);
    var theyPassed = state.lastMove && state.lastMove.by === 'user' && state.lastMove.move === 'pass';
    var settled = openPoints(state.squares, state.boardSize) <= state.boardSize;
    var mature = settled || state.squares.replace(/\./g, '').length >= state.squares.length / 3;
    if (!best || bestScore < 0) return 'pass';
    // After a pass: end the game when ahead on a mature board, or when nothing useful is left.
    if (theyPassed && ((score.white > score.black && mature && bestScore < 3) || (settled && bestScore < 1))) return 'pass';
    return best;
  }

  function resultLine(score) {
    if (score.winner === 'draw') return 'Black ' + score.black + ', white ' + score.white + ' with komi: an even game';
    return 'Black ' + score.black + ', white ' + score.white + ' with komi, so ' + (score.winner === 'user' ? 'you win' : 'I win') + ' by ' + score.margin;
  }

  // Calm table talk about her own stones; reading stays private.
  function thought(state, move) {
    var R = rules();
    var theirs = state.lastMove && state.lastMove.by === 'user' ? state.lastMove : null;
    if (move === 'pass') {
      if (theirs && theirs.move === 'pass') {
        return 'I’ll pass too, so we count. ' + resultLine(R.scoreArea(state.squares, state.boardSize, state.komi)) + '. Thank you for the game.';
      }
      var mine = state.moveLog.filter(function (entry) { return entry.by === 'ai'; });
      var again = mine.length && mine[mine.length - 1].move === 'pass';
      return again ? 'I’ll pass again. Nothing useful is left for me.' : 'I’ll pass. The board feels settled to me.';
    }
    var taken = R.applyPlacement(state.squares, state.boardSize, 'ai', move, state.previousPosition).captures.length;
    if (theirs && theirs.move === 'pass') {
      return 'You passed, so I’ll keep playing' + (taken ? ' and take ' + plural(taken, 'stone') + ' at ' : ' at ') + move + '.';
    }
    var lead = theirs && theirs.captures && theirs.captures.length ? 'Well taken. ' : '';
    if (taken) {
      if (state.moveLog.length % 2) return lead + (taken === 1 ? 'That stone comes off the board.' : 'Those ' + taken + ' stones come off the board.') + ' Thank you.';
      return lead + move + ' captures ' + (taken === 1 ? 'one stone' : taken + ' stones') + '. The board breathes a little.';
    }
    var quiet = [
      'A stone at ' + move + '.',
      move + ', quietly.',
      'I’ll settle at ' + move + '.',
      move + '. Plenty of room on this board.',
    ];
    return lead + quiet[state.moveLog.length % quiet.length];
  }

  function playReply(ctx, state) {
    var move = choose(state);
    var say = thought(state, move);
    return ctx.invoke('make_move', { move: move, moveThought: say }, move === 'pass' ? 'Pass' : move).then(function () {
      return say;
    });
  }

  function onUserMove(input, output, ctx) {
    return read(ctx).then(function (state) {
      if (!state) return null;
      if (state.status !== 'playing') {
        return 'Two passes, so we count. ' + (state.score ? resultLine(state.score) + '. ' : '') + 'Thank you for a calm, lovely game. Ask me for a new one whenever you like.';
      }
      if (state.turn !== 'ai') return null;
      return playReply(ctx, state);
    });
  }

  // Replays the move log to find the position before a given move.
  function positionBefore(state, index) {
    var R = rules();
    var squares = R.buildInitial(state.boardSize);
    var previous = null;
    for (var i = 0; i < index; i += 1) {
      var entry = state.moveLog[i];
      if (entry.move === 'pass') { previous = squares; continue; }
      var placed = R.applyPlacement(squares, state.boardSize, entry.by, entry.move, previous);
      if (placed.error) return null;
      previous = squares;
      squares = placed.squares;
    }
    return squares;
  }

  function explain(ctx) {
    return read(ctx).then(function (state) {
      var R = rules();
      var index = -1;
      state.moveLog.forEach(function (entry, i) { if (entry.by === 'ai') index = i; });
      if (index < 0) return 'I haven’t placed a stone yet. Black goes first, so place yours and I’ll answer.';
      var entry = state.moveLog[index];
      if (entry.move === 'pass') return 'I passed because every point left looked settled to me, and passing is how a Go game heads for the count.';
      var size = state.boardSize;
      var before = positionBefore(state, index);
      if (!before) return 'My last stone went on ' + entry.move + '.';
      var point = R.parsePoint(entry.move, size);
      var reasons = [];
      if (entry.captures && entry.captures.length) reasons.push('it captured ' + plural(entry.captures.length, 'stone'));
      var rescued = R.neighbors(point.index, size).some(function (i) { return before[i] === 'O' && R.groupAt(before, i, size).liberties.length === 1; });
      if (rescued) reasons.push('it gave my stones next to it more liberties');
      var edge = Math.min(point.x, point.y, size - 1 - point.x, size - 1 - point.y);
      var stones = before.replace(/\./g, '').length;
      if (!reasons.length && stones < size && edge === 2) reasons.push('the third line is where territory and safety balance, and corners are the easiest place to start');
      else if (!reasons.length && stones < size && edge === 3) reasons.push('the fourth line leans toward the center and influence');
      var prev = index > 0 ? state.moveLog[index - 1] : null;
      if (prev && prev.by === 'user' && prev.move !== 'pass') {
        var theirs = R.parsePoint(prev.move, size);
        if (theirs && Math.max(Math.abs(theirs.x - point.x), Math.abs(theirs.y - point.y)) <= 2) reasons.push('it answers your stone at ' + prev.move);
      }
      if (!reasons.length) reasons.push('it keeps my stones connected while claiming a little open space');
      return 'I played **' + entry.move + '** because ' + reasons.join(', and ') + '.';
    });
  }

  function standing(ctx) {
    return read(ctx).then(function (state) {
      if (state.status !== 'playing' && state.score) return 'The game is over: ' + resultLine(state.score) + '. Ask me for a new game whenever you like.';
      var score = rules().scoreArea(state.squares, state.boardSize, state.komi);
      var leader = score.winner === 'draw' ? 'we’re level' : (score.winner === 'user' ? 'you lead' : 'I lead') + ' by ' + score.margin;
      var early = openPoints(state.squares, state.boardSize) > state.boardSize * 2;
      return 'If we counted now, black would have ' + score.black + ' and white ' + score.white + ' (that includes ' + state.komi + ' komi), so ' + leader + '. ' +
        'Captures so far: black ' + state.captures.user + ', white ' + state.captures.ai + '.' +
        (early ? ' With this much open board, the count will move a lot before the end.' : '');
    });
  }

  function plan(ctx) {
    return read(ctx).then(function (state) {
      var open = openPoints(state.squares, state.boardSize);
      if (open <= state.boardSize * 2) {
        return 'The board is nearly settled. Close the borders between our areas, check that each of your groups has two eyes, and pass when nothing useful is left. Two passes in a row end the game and the board counts.';
      }
      if (state.moveLog.length < state.boardSize * 2) {
        return 'A simple plan for the opening:\n\n- Corners first, then sides, then the center.\n- Play on the third and fourth lines.\n- Keep your stones within reach of each other, and give each group room for two eyes.';
      }
      return 'Count liberties before you fight: the group with more of them usually wins the race. Strengthen your weakest group first, then look for open space to claim.';
    });
  }

  function newGame(ctx, size) {
    return read(ctx).then(function (state) {
      var lines = size || (state && state.boardSize) || 9;
      var komi = state ? state.komi : 6.5;
      return ctx.invoke('new_game', { boardSize: lines, komi: komi }, lines + '×' + lines + ', komi ' + komi).then(function () {
        return 'A fresh ' + lines + '×' + lines + ' board. You have black, so the first stone is yours.';
      });
    });
  }

  function yourMove(ctx) {
    return read(ctx).then(function (state) {
      if (state.status !== 'playing') return 'This game is over. Ask me for a new game and I’ll clear the board.';
      if (state.turn === 'ai') return playReply(ctx, state);
      return 'It’s your move. Click any point to place a black stone, or use Pass.';
    });
  }

  function respond(text, ctx) {
    var lower = text.toLowerCase();
    var lines = lower.match(/(?:^|\D)(9|13|19)(?!\d)/);
    var size = lines ? Number(lines[1]) : 0;
    if (/\b(new|fresh|another)\b[^.?!]*\b(game|board)\b|\b(rematch|start over|restart|reset|play again)\b/.test(lower) ||
      (size && /\b(game|play|start|switch|try|set up)\b/.test(lower))) {
      return newGame(ctx, size);
    }
    if (/\b(explain|why did you|why that|why'd you|last move|that move|last stone)\b/.test(lower)) return explain(ctx);
    if (/\b(winning|ahead|behind|score|count|how am i doing|who'?s up)\b/.test(lower)) return standing(ctx);
    if (/\b(hint|what should i|best move|help me|where should i)\b/.test(lower)) {
      return 'I’ll keep my reading to myself, since finding the move is the pleasure of the game. One habit that helps: before you play, look at which groups, yours and mine, are short of liberties.';
    }
    if (/\bpass\b/.test(lower)) {
      return 'Use the Pass button beside the board. I can’t place your stones for you. If you pass and I pass too, the game ends and the board counts the score.';
    }
    if (/\bko\b/.test(lower)) {
      return 'Ko: you can’t make a move that recreates the position from just before my last move. When a single stone is captured back and forth, play somewhere else first. The board won’t offer the illegal point.';
    }
    if (/\bkomi\b/.test(lower)) {
      return read(ctx).then(function (state) {
        return 'Komi is the points white gets for moving second. This game uses ' + state.komi + (state.komi % 1 ? ', and the half point means there are no ties.' : ', so a tie is possible.');
      });
    }
    if (/\b(liberty|liberties|capture)\b/.test(lower)) {
      return 'A liberty is an empty point next to a stone or chain. A chain with none left is captured and comes off the board. The board removes captured stones for you.';
    }
    if (/\b(plan|opening|strategy|tips?|advice|improve|better)\b/.test(lower)) return plan(ctx);
    if (/\b(your (move|turn)|go ahead|play)\b/.test(lower)) return yourMove(ctx);
    if (/^\s*(hi|hello|hey|good (morning|afternoon|evening))\b/.test(lower)) return 'Hello. The stones are ready. Your move with black whenever you like.';
    return null;
  }

  return script;
})();

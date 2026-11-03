// The standalone demo's sample conversation. In Gezel, the checkers player's
// moves and table talk come from the model the person chooses; here a small
// scripted policy picks a legal black move and plays it through the same
// make_move tool the live crew member calls. The page hands over its rules
// engine as `rules` (the game-store script's own), so every move is checked.
window.demoChat = (function () {
  'use strict';
  var FILES = 'abcdefgh';
  var script = {
    name: 'Bram',
    role: 'Checkers Player',
    greeting: 'Hi, I’m Bram. We’re two moves in, and I just tucked a man onto g5. You have red and the move: click a red piece, then a highlighted square, and I’ll answer with black.',
    suggestions: [
      'Explain your last move',
      'Who’s winning?',
      'What’s a good opening plan?',
      'Start a new game',
    ],
    respond: respond,
    reactions: { user_move: onUserMove },
  };

  function rules() { return script.rules; }
  function at(name) { return { x: FILES.indexOf(name[0]), y: 8 - Number(name[1]) }; }
  function pieceOn(squares, name) { var p = at(name); return squares[p.y * 8 + p.x]; }
  function forced(state) { return state.forceCaptures !== false; }
  function notation(move) { return move.path.join(move.captures.length ? 'x' : '-'); }
  function read(ctx) { return ctx.read('game.json'); }

  function tally(squares) {
    var c = { red: 0, redKings: 0, black: 0, blackKings: 0 };
    for (var i = 0; i < squares.length; i += 1) {
      var ch = squares[i];
      if (ch === 'r' || ch === 'R') c.red += 1;
      if (ch === 'b' || ch === 'B') c.black += 1;
      if (ch === 'R') c.redKings += 1;
      if (ch === 'B') c.blackKings += 1;
    }
    return c;
  }

  // One ply of lookahead: take what is on offer, crown when possible, and
  // avoid stepping into the biggest jump red could answer with.
  function scoreMove(state, move, index) {
    var R = rules();
    var before = state.squares;
    var piece = pieceOn(before, move.from);
    var next = R.applySequence(before, move);
    var value = move.captures.reduce(function (sum, c) { return sum + (pieceOn(before, c) === 'R' ? 15 : 10); }, 0);
    if (piece === 'b' && move.to[1] === '1') value += 7;
    var replies = R.legalMovesFor(next, 'user', forced(state));
    if (!replies.length) return 1000;
    var worst = 0;
    replies.forEach(function (reply) {
      var lost = reply.captures.reduce(function (sum, c) { return sum + (pieceOn(next, c) === 'B' ? 15 : 10); }, 0);
      if (pieceOn(next, reply.from) === 'r' && reply.to[1] === '8') lost += 5;
      if (lost > worst) worst = lost;
    });
    value -= worst;
    var from = at(move.from);
    var to = at(move.to);
    var c = tally(before);
    var endgame = c.red + c.black <= 10 || c.blackKings > 0;
    if (piece === 'b' && from.y === 0 && !endgame) value -= 1.5;
    if (to.x >= 2 && to.x <= 5) value += 0.8;
    if (to.x === 0 || to.x === 7) value += 0.4;
    if (piece === 'b') value += to.y * (endgame ? 0.3 : 0.05);
    // Late in the game, a king that is not behind walks toward red rather than shuffling.
    if (piece === 'B' && c.black + c.blackKings * 0.5 >= c.red + c.redKings * 0.5) {
      value += (nearestRed(before, from) - nearestRed(next, to)) * 0.6;
    }
    return value + ((state.moveLog.length * 7 + index * 13) % 10) / 100;
  }

  function nearestRed(squares, from) {
    var best = 8;
    for (var i = 0; i < squares.length; i += 1) {
      if (squares[i] !== 'r' && squares[i] !== 'R') continue;
      var d = Math.max(Math.abs(i % 8 - from.x), Math.abs(Math.floor(i / 8) - from.y));
      if (d < best) best = d;
    }
    return best;
  }

  function choose(state) {
    var best = null;
    var bestScore = -Infinity;
    state.legalMoves.forEach(function (move, index) {
      var value = scoreMove(state, move, index);
      if (value > bestScore) { best = move; bestScore = value; }
    });
    return best;
  }

  // Table talk teases the position, never the person, and keeps plans private.
  function thought(state, move) {
    var R = rules();
    var next = R.applySequence(state.squares, move);
    var theirs = state.lastMove && state.lastMove.by === 'user' ? state.lastMove : null;
    var lead = theirs && theirs.captures.length ? (theirs.captures.length > 1 ? 'What a double jump! ' : 'Nice jump. ') : '';
    if (!R.legalMovesFor(next, 'user', forced(state)).length) return lead + 'And that’s the game. Thank you, that was a fun one. Rematch?';
    if (move.captures.length > 1) return lead + 'Two for one! I’ll take that gratefully.';
    if (move.captures.length) {
      var hops = ['Hop! One of yours comes off the board.', 'Jump! I’ll take that one, thank you.', 'Over we go. That piece is mine now.'];
      return lead + hops[state.moveLog.length % hops.length];
    }
    var piece = pieceOn(state.squares, move.from);
    if (piece === 'b' && move.to[1] === '1') return lead + 'King me! This one gets to walk backward now.';
    if (piece === 'B') {
      return lead + (state.moveLog.length % 2 ? 'My king strolls over to ' + move.to + '.' : 'The king takes a little walk to ' + move.to + '.');
    }
    var quiet = [
      'A quiet step to ' + move.to + '. Your move.',
      move.to + ' looked comfy, so there I go.',
      'Sliding over to ' + move.to + ' to keep things tidy.',
      'Easing up to ' + move.to + '. No rush.',
    ];
    return lead + quiet[state.moveLog.length % quiet.length];
  }

  function playReply(ctx, state) {
    var move = choose(state);
    if (!move) return null;
    var say = thought(state, move);
    return ctx.invoke('make_move', { from: move.from, to: move.to, moveThought: say }, notation(move)).then(function () {
      return say;
    });
  }

  function onUserMove(input, output, ctx) {
    return read(ctx).then(function (state) {
      if (!state) return null;
      if (state.status === 'user_won') {
        return 'That’s the game, and you earned it. Well played! Ask me for a new game whenever you want a rematch.';
      }
      if (state.status !== 'playing' || state.turn !== 'ai') return null;
      return playReply(ctx, state);
    });
  }

  // Replays the move log to find the position before a given move.
  function positionBefore(state, index) {
    var R = rules();
    var squares = R.buildInitial();
    for (var i = 0; i < index; i += 1) {
      var entry = state.moveLog[i];
      var seq = R.legalMovesFor(squares, entry.by, forced(state)).find(function (m) { return m.from === entry.from && m.to === entry.to; });
      if (!seq) return null;
      squares = R.applySequence(squares, seq);
    }
    return squares;
  }

  function explain(ctx) {
    return read(ctx).then(function (state) {
      var R = rules();
      var index = -1;
      state.moveLog.forEach(function (entry, i) { if (entry.by === 'ai') index = i; });
      if (index < 0) return 'I haven’t moved yet this game. Red opens, so make your move and I’ll answer.';
      var entry = state.moveLog[index];
      var before = positionBefore(state, index);
      var seq = before && R.legalMovesFor(before, 'ai', forced(state)).find(function (m) { return m.from === entry.from && m.to === entry.to; });
      if (!seq) return 'My last move was ' + entry.from + '-' + entry.to + '.';
      var reasons = [];
      if (seq.captures.length) {
        reasons.push((seq.captures.length > 1 ? 'it was a jump that took ' + seq.captures.length + ' of yours' : 'it was a jump') +
          (forced(state) ? ', and captures are required at this table, so taking it was the rule as much as the plan' : ', and a free piece is hard to pass up'));
      } else {
        var to = at(seq.to);
        if (to.x === 0 || to.x === 7) reasons.push('a man on the edge can’t be jumped, so it is safe there');
        else if (to.x >= 2 && to.x <= 5) reasons.push('center squares give a man two ways forward');
        else reasons.push('it keeps my pieces close together, so none of them stands alone');
      }
      if (pieceOn(before, seq.from) === 'b' && seq.to[1] === '1') reasons.push('it reached your back row and crowned');
      var after = R.applySequence(before, seq);
      var safe = !R.legalMovesFor(after, 'user', forced(state)).some(function (m) { return m.captures.length; });
      return 'I played **' + notation(seq) + '** because ' + reasons.join(', and ') + '.' +
        (safe ? ' It also left nothing of mine for you to jump.' : '');
    });
  }

  function standing(ctx) {
    return read(ctx).then(function (state) {
      var c = tally(state.squares);
      function side(n, kings) { return n + (n === 1 ? ' piece' : ' pieces') + (kings ? ' (' + kings + (kings === 1 ? ' king' : ' kings') + ')' : ''); }
      var line = 'You have ' + side(c.red, c.redKings) + ' and I have ' + side(c.black, c.blackKings) + '.';
      if (state.status === 'user_won') return 'You won this one. ' + line + ' Ask for a new game when you’re ready for a rematch.';
      if (state.status === 'ai_won') return 'I took this one, but it was close to the end. ' + line + ' Rematch?';
      var gap = (c.red + c.redKings * 0.5) - (c.black + c.blackKings * 0.5);
      if (gap >= 1.5) return line + ' You’re well ahead. I’m in trouble here!';
      if (gap > 0) return line + ' You’re a little ahead, nicely done.';
      if (gap <= -1.5) return line + ' I’m ahead for now, but there’s plenty of board left.';
      if (gap < 0) return line + ' I’m a touch ahead, nothing a good jump can’t fix.';
      return line + ' Dead even, so it’s anyone’s game.';
    });
  }

  function plan(ctx) {
    return read(ctx).then(function (state) {
      var c = tally(state.squares);
      if (c.red + c.black <= 8) {
        return 'With this few pieces, kings decide it. Crown when you can, keep your kings in the middle where they reach the most squares, and trade down when you’re ahead.';
      }
      if (state.moveLog.length < 14) {
        return 'Three habits carry most openings:\n\n- Build toward the center, where a man has two ways forward.\n- Keep your back row (a1, c1, e1, g1) home as long as you can, so crowning is hard for me.\n- Move in pairs, so no man stands alone to be jumped.';
      }
      return 'Trade when you’re ahead and avoid trades when you’re behind. Keep your pieces connected, and before you step forward, check whether the square behind you is open, because that is what lets me jump.';
    });
  }

  function newGame(ctx, force) {
    return read(ctx).then(function (state) {
      var keep = force === undefined ? !(state && state.forceCaptures === false) : force;
      return ctx.invoke('new_game', { forceCaptures: keep }, keep ? 'Captures required' : 'Captures optional').then(function () {
        return 'Fresh board, with captures ' + (keep ? 'required' : 'optional') + '. You have red and the first move.';
      });
    });
  }

  function yourMove(ctx) {
    return read(ctx).then(function (state) {
      if (state.status !== 'playing') return 'This game is over. Ask me for a new game and we’ll set up again.';
      if (state.turn === 'ai') return playReply(ctx, state);
      return 'It’s your move. Click a red piece, then one of the highlighted squares.';
    });
  }

  function respond(text, ctx) {
    var lower = text.toLowerCase();
    if (/\b(new|fresh|another)\b[^.?!]*\b(game|board)\b|\b(rematch|start over|restart|reset|play again)\b/.test(lower)) {
      return newGame(ctx, /optional/.test(lower) ? false : /\b(forced|required|mandatory)\b/.test(lower) ? true : undefined);
    }
    if (/optional capture|captures? (be )?optional/.test(lower)) return newGame(ctx, false);
    if (/\b(explain|why did you|why that|why'd you|last move|that move)\b/.test(lower)) return explain(ctx);
    if (/\b(winning|ahead|behind|score|how am i doing|who'?s up|count)\b/.test(lower)) return standing(ctx);
    if (/\b(hint|what should i|best move|help me|which move)\b/.test(lower)) {
      return 'I’ll keep my reading to myself, since finding the move is half the fun. One general rule: before you step forward, check the square behind you. An open square there is what lets me jump.';
    }
    if (/\b(plan|opening|strategy|tips?|advice|improve|better)\b/.test(lower)) return plan(ctx);
    if (/\b(kings?|crown)/.test(lower)) {
      return 'A man that reaches the far row is crowned and wears a K. Kings move and jump diagonally in all four directions, which makes them worth about one and a half men.';
    }
    if (/\b(how do i|how to|rules)\b/.test(lower)) {
      return 'Men move one square diagonally forward. A jump goes over an enemy piece to the empty square beyond, and you keep jumping while you can. Click a red piece, then a highlighted square.';
    }
    if (/\b(your (move|turn)|go ahead|play)\b/.test(lower)) return yourMove(ctx);
    if (/^\s*(hi|hello|hey|good (morning|afternoon|evening))\b/.test(lower)) return 'Hi! Pull up a chair. Your move with red whenever you’re ready.';
    return null;
  }

  return script;
})();

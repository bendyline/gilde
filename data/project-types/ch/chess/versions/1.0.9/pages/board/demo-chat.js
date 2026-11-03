// The standalone demo's sample conversation. In Gezel, the chess player's
// moves and table talk come from the model the person chooses; here a small
// scripted policy picks a legal black move and plays it through the same
// make_move tool the live crew member calls. The page hands over its rules
// engine as `rules` (the game-store script's own), so every move is checked.
window.demoChat = (function () {
  'use strict';
  var FILES = 'abcdefgh';
  var VALUE = { p: 1, n: 3, b: 3.2, r: 5, q: 9, k: 0 };
  var NAMES = { p: 'pawn', n: 'knight', b: 'bishop', r: 'rook', q: 'queen', k: 'king' };
  var script = {
    name: 'Ines',
    role: 'Chess Player',
    greeting: 'Hello, I’m Ines. We’re two moves into an open game, and I’ve just brought a knight to c6. You have white and the move: click a piece, then a highlighted square.',
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
  function capital(text) { return text.charAt(0).toUpperCase() + text.slice(1); }
  function read(ctx) { return ctx.read('game.json'); }
  function takenBy(squares, move) { return move.enPassant ? 'p' : pieceOn(squares, move.to).toLowerCase(); }

  function material(squares) {
    var m = { white: 0, black: 0 };
    for (var i = 0; i < squares.length; i += 1) {
      var ch = squares[i];
      if (ch === '.') continue;
      var v = Math.round(VALUE[ch.toLowerCase()]);
      if (ch === ch.toUpperCase()) m.white += v; else m.black += v;
    }
    return m;
  }

  // The values of `side`'s pieces that attack (x, y), cheapest first.
  function attackers(squares, x, y, side) {
    var out = [];
    var mine = function (ch) { return ch !== '.' && (ch === ch.toUpperCase()) === (side === 'user'); };
    var on = function (cx, cy) { return cx < 0 || cx > 7 || cy < 0 || cy > 7 ? null : squares[cy * 8 + cx]; };
    var py = side === 'user' ? y + 1 : y - 1;
    [-1, 1].forEach(function (dx) { var ch = on(x + dx, py); if (ch && mine(ch) && ch.toLowerCase() === 'p') out.push(VALUE.p); });
    [[-2, -1], [-2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2], [2, -1], [2, 1]].forEach(function (d) {
      var ch = on(x + d[0], y + d[1]); if (ch && mine(ch) && ch.toLowerCase() === 'n') out.push(VALUE.n);
    });
    [[-1, 0, 'rq'], [1, 0, 'rq'], [0, -1, 'rq'], [0, 1, 'rq'], [-1, -1, 'bq'], [-1, 1, 'bq'], [1, -1, 'bq'], [1, 1, 'bq']].forEach(function (d) {
      for (var cx = x + d[0], cy = y + d[1]; on(cx, cy) !== null; cx += d[0], cy += d[1]) {
        var ch = on(cx, cy);
        if (ch === '.') continue;
        if (mine(ch) && d[2].indexOf(ch.toLowerCase()) >= 0) out.push(VALUE[ch.toLowerCase()]);
        break;
      }
    });
    for (var ky = -1; ky <= 1; ky += 1) for (var kx = -1; kx <= 1; kx += 1) {
      var ch = (kx || ky) ? on(x + kx, y + ky) : null;
      if (ch && mine(ch) && ch.toLowerCase() === 'k') out.push(100);
    }
    return out.sort(function (a, b) { return a - b; });
  }

  // What `side` nets by capturing `victim` on (x, y) with a piece worth
  // `capturer`, when both sides keep recapturing only while it pays.
  function exchange(squares, x, y, victim, capturer, side) {
    var ours = attackers(squares, x, y, side);
    var theirs = attackers(squares, x, y, side === 'user' ? 'ai' : 'user');
    var used = ours.indexOf(capturer);
    if (used >= 0) ours.splice(used, 1);
    var gains = [victim];
    var standing = capturer;
    var lists = [theirs, ours];
    for (var turn = 0; lists[turn % 2].length; turn += 1) {
      gains.push(standing - gains[gains.length - 1]);
      standing = lists[turn % 2].shift();
    }
    for (var d = gains.length - 1; d > 0; d -= 1) gains[d - 1] = -Math.max(-gains[d - 1], gains[d]);
    return gains[0];
  }

  function kingSquare(squares, king) {
    var i = squares.indexOf(king);
    return i < 0 ? null : { x: i % 8, y: Math.floor(i / 8) };
  }

  // Two plies of material lookahead: take what is on offer, never leave a
  // piece where white wins it, never walk into a mate, and mate when it can.
  function scoreMove(state, move, index) {
    var R = rules();
    var sq = state.squares;
    var kind = pieceOn(sq, move.from).toLowerCase();
    var next = R.applyUnchecked(sq, move, 'ai');
    var castling = R.nextCastling(state.castling, sq, move);
    var ep = R.nextEnPassant(move, 'ai');
    var taken = takenBy(sq, move);
    var value = taken !== '.' ? VALUE[taken] : 0;
    if (move.promotion) value += VALUE[move.promotion] - 1;
    var replies = R.legalMovesFor(next, 'user', castling, ep);
    var lead = material(next).black - material(next).white;
    if (!replies.length) return R.inCheck(next, 'user') ? 1000 : (lead > 0 ? -50 : 0);
    var worst = 0;
    for (var i = 0; i < replies.length; i += 1) {
      var reply = replies[i];
      var after = R.applyUnchecked(next, reply, 'user');
      if (R.inCheck(after, 'ai') &&
        !R.legalMovesFor(after, 'ai', R.nextCastling(castling, next, reply), R.nextEnPassant(reply, 'user')).length) {
        return -500;
      }
      if (!reply.capture && !reply.promotion) continue;
      var got = takenBy(next, reply);
      var t = at(reply.to);
      var gain = exchange(next, t.x, t.y, got !== '.' ? VALUE[got] : 0, VALUE[pieceOn(next, reply.from).toLowerCase()], 'user') +
        (reply.promotion ? VALUE[reply.promotion] - 1 : 0);
      if (gain > worst) worst = gain;
    }
    value -= worst;

    var from = at(move.from);
    var to = at(move.to);
    var mat = material(sq);
    var endgame = mat.white + mat.black <= 26;
    if (move.castle) value += 1.2;
    if (kind === 'k' && !move.castle && !endgame) value -= 0.8;
    if (state.fullmoveNumber <= 12) {
      if ((kind === 'n' || kind === 'b') && from.y === 0) value += 0.6;
      if ((kind === 'n' || kind === 'b') && from.y !== 0) value -= 0.2;
      if (kind === 'q') value -= 0.4;
      if (kind === 'r') value -= 0.3;
      if (kind === 'p' && (move.from[0] === 'd' || move.from[0] === 'e')) value += 0.35;
      if (kind === 'p' && 'afgh'.indexOf(move.from[0]) >= 0) value -= 0.25;
    }
    if (kind === 'n' || kind === 'b' || kind === 'q') {
      value += (3.5 - Math.max(Math.abs(to.x - 3.5), Math.abs(to.y - 3.5))) * 0.08;
    }
    if (kind === 'p' && endgame) value += to.y * 0.08;
    if (R.inCheck(next, 'user')) value += 0.25;
    // Ahead, steer away from repeating a position (three times is a draw).
    if (lead > 0) {
      var seen = (state.positionHistory || []).filter(function (key) { return key.indexOf(next + '|user|') === 0; }).length;
      if (seen) value -= seen > 1 ? 3 : 0.6;
    }
    // Well ahead: take squares from white's king and walk my own king in.
    if (lead >= 4) {
      value -= replies.filter(function (r) { return pieceOn(next, r.from) === 'K'; }).length * 0.15;
      var theirs = kingSquare(next, 'K');
      if (kind === 'k' && theirs) {
        var dist = function (p) { return Math.max(Math.abs(p.x - theirs.x), Math.abs(p.y - theirs.y)); };
        value += (dist(from) - dist(to)) * 0.1;
      }
    }
    return value + ((state.moveLog.length * 7 + index * 13) % 10) / 100;
  }

  function choose(state) {
    var best = null;
    var bestScore = -Infinity;
    state.legalMoves.forEach(function (move, index) {
      if (move.promotion && move.promotion !== 'q' && move.promotion !== 'n') return;
      var value = scoreMove(state, move, index);
      if (value > bestScore) { best = move; bestScore = value; }
    });
    return best;
  }

  // Table talk is about her own move or the atmosphere; plans stay private.
  function thought(state, move) {
    var R = rules();
    var sq = state.squares;
    var kind = pieceOn(sq, move.from).toLowerCase();
    var next = R.applyUnchecked(sq, move, 'ai');
    var replies = R.legalMovesFor(next, 'user', R.nextCastling(state.castling, sq, move), R.nextEnPassant(move, 'ai'));
    var theirs = state.lastMove && state.lastMove.by === 'user' ? state.lastMove : null;
    var lead = theirs && /x/.test(theirs.notation) ? 'Nicely taken. ' : '';
    if (!replies.length) {
      return R.inCheck(next, 'user') ? 'Checkmate. Thank you for a lovely game. Another?' : 'That’s stalemate, so we share the point. A fair result.';
    }
    var check = R.inCheck(next, 'user') ? ' Check.' : '';
    var taken = takenBy(sq, move);
    var piece = capital(NAMES[kind]);
    if (move.castle) return lead + 'Castling. My king feels safer already.' + check;
    if (move.promotion) return lead + 'My pawn arrives on ' + move.to + ' and becomes a ' + NAMES[move.promotion] + '.' + check;
    if (move.enPassant) return lead + 'En passant, the rarest little capture.' + check;
    if (taken !== '.') {
      return lead + (state.moveLog.length % 2 ? 'I’ll take the ' + NAMES[taken] + ' on ' + move.to + ', thank you.' :
        piece + ' takes on ' + move.to + '. Your ' + NAMES[taken] + ' comes off.') + check;
    }
    if (check) return lead + piece + ' to ' + move.to + '. Check.';
    var quiet = [
      piece + ' to ' + move.to + '. A quiet move.',
      piece + ' to ' + move.to + '. Your move.',
      'My ' + NAMES[kind] + ' finds a home on ' + move.to + '.',
      piece + ' to ' + move.to + '. Let’s see where this goes.',
    ];
    return lead + quiet[state.moveLog.length % quiet.length];
  }

  function playReply(ctx, state) {
    var move = choose(state);
    if (!move) return null;
    var say = thought(state, move);
    return ctx.invoke('make_move', { from: move.from, to: move.to, promotion: move.promotion || 'q', moveThought: say },
      rules().describeMove(move)).then(function () {
      return read(ctx);
    }).then(function (after) {
      if (after && after.status === 'draw' && !/stalemate/i.test(say)) {
        return [say, 'And that makes it a draw by the rules. Thank you for a well-played game. Another?'];
      }
      return say;
    });
  }

  function onUserMove(input, output, ctx) {
    return read(ctx).then(function (state) {
      if (!state) return null;
      if (state.status === 'user_won') return 'Checkmate. Beautifully played. I’m ready for a rematch whenever you are.';
      if (state.status === 'draw') return 'That’s a draw, and a fair one. Thank you for a well-played game. Shall we play another?';
      if (state.status !== 'playing' || state.turn !== 'ai') return null;
      return playReply(ctx, state);
    });
  }

  // Replays the move log to find the position before a given move.
  function positionBefore(state, index) {
    var R = rules();
    var pos = { squares: R.buildInitial(), castling: 'KQkq', ep: null };
    for (var i = 0; i < index; i += 1) {
      var move = findMove(pos, state.moveLog[i]);
      if (!move) return null;
      pos = {
        squares: R.applyUnchecked(pos.squares, move, state.moveLog[i].by),
        castling: R.nextCastling(pos.castling, pos.squares, move),
        ep: R.nextEnPassant(move, state.moveLog[i].by),
      };
    }
    return pos;
  }
  function findMove(pos, entry) {
    var options = rules().legalMovesFor(pos.squares, entry.by, pos.castling, pos.ep).filter(function (m) {
      return m.from === entry.from && m.to === entry.to;
    });
    return options.find(function (m) { return (m.promotion || 'q') === (entry.promotion || 'q'); }) || options[0] || null;
  }

  function explain(ctx) {
    return read(ctx).then(function (state) {
      var R = rules();
      var index = -1;
      state.moveLog.forEach(function (entry, i) { if (entry.by === 'ai') index = i; });
      if (index < 0) return 'I haven’t moved yet this game. White opens, so make your move and I’ll answer.';
      var pos = positionBefore(state, index);
      var move = pos && findMove(pos, state.moveLog[index]);
      if (!move) return 'My last move was ' + state.moveLog[index].notation + '.';
      var kind = pieceOn(pos.squares, move.from).toLowerCase();
      var after = R.applyUnchecked(pos.squares, move, 'ai');
      var taken = takenBy(pos.squares, move);
      var reasons = [];
      if (move.castle) reasons.push('castling tucks my king away and brings a rook toward the middle');
      else if (move.promotion) reasons.push('the pawn reached the last rank and became a ' + NAMES[move.promotion]);
      else if (taken !== '.') reasons.push('it took your ' + NAMES[taken]);
      else if ((kind === 'n' || kind === 'b') && move.from[1] === '8') reasons.push('it develops a piece, and getting pieces out early is most of what an opening asks');
      else if (kind === 'p' && (move.from[0] === 'd' || move.from[0] === 'e')) reasons.push('it claims a share of the center');
      if (R.inCheck(after, 'user')) reasons.push('it gives check');
      for (var i = 0; i < 64 && reasons.length < 3; i += 1) {
        var ch = after[i];
        var x = i % 8;
        var y = Math.floor(i / 8);
        if (ch === '.' || ch !== ch.toLowerCase() || ch === 'k' || FILES[x] + String(8 - y) === move.to) continue;
        if (R.isAttacked(after, x, y, 'user') && R.isAttacked(after, x, y, 'ai') && !R.isAttacked(pos.squares, x, y, 'ai')) {
          reasons.push('it protects my ' + NAMES[ch] + ' on ' + FILES[x] + String(8 - y));
          break;
        }
      }
      if (!reasons.length) reasons.push('it improves a piece without loosening anything around my king');
      var label = move.castle ? 'castled (' + move.from + '-' + move.to + ')' : 'moved my **' + NAMES[kind] + ' to ' + move.to + '**';
      return 'I ' + label + ' because ' + reasons.join(', and ') + '.';
    });
  }

  function amount(diff) {
    if (diff === 1) return 'a pawn';
    if (diff === 2) return 'two pawns';
    if (diff === 3) return 'about a piece';
    if (diff === 5) return 'about a rook';
    if (diff >= 8 && diff <= 10) return 'about a queen';
    return diff + ' points';
  }

  function standing(ctx) {
    return read(ctx).then(function (state) {
      var m = material(state.squares);
      var counts = 'By the usual count (pawn 1, knight or bishop 3, rook 5, queen 9), you have ' + m.white + ' and I have ' + m.black + '.';
      if (state.status === 'user_won') return 'You won this one by checkmate. ' + counts + ' Ask for a new game when you want a rematch.';
      if (state.status === 'ai_won') return 'I won this one by checkmate, but it was a real game. ' + counts + ' Rematch?';
      if (state.status === 'draw') return 'This one ended in a draw. ' + counts;
      var diff = m.white - m.black;
      var check = state.turn === 'user' && rules().inCheck(state.squares, 'user') ? ' And your king is in check, so that comes first.' : '';
      if (diff > 0) return counts + ' You’re up ' + amount(diff) + '.' + check;
      if (diff < 0) return counts + ' I’m up ' + amount(-diff) + ' for now, but material isn’t everything.' + check;
      return counts + ' Material is even, so it comes down to position.' + check;
    });
  }

  function plan(ctx) {
    return read(ctx).then(function (state) {
      var m = material(state.squares);
      if (m.white + m.black <= 26) {
        return 'In an endgame the king becomes a fighting piece, so bring it toward the center. Passed pawns matter most: push yours, and stop mine.';
      }
      if (state.fullmoveNumber <= 10) {
        return 'A good opening plan comes in three parts:\n\n- Put a pawn or two in the center.\n- Bring out knights and bishops before moving the queen twice.\n- Castle early, then connect your rooks.';
      }
      return 'In the middlegame, find your least active piece and give it a better square. Keep your king safe, and trade pieces when you’re ahead in material.';
    });
  }

  function newGame(ctx) {
    return ctx.invoke('new_game', {}, 'Standard position').then(function () {
      return 'Fresh board. You have white, so the first move is yours.';
    });
  }

  function yourMove(ctx) {
    return read(ctx).then(function (state) {
      if (state.status !== 'playing') return 'This game is over. Ask me for a new game and I’ll set up the pieces.';
      if (state.turn === 'ai') return playReply(ctx, state);
      return 'It’s your move. Click one of your white pieces, then a highlighted square.';
    });
  }

  function respond(text, ctx) {
    var lower = text.toLowerCase();
    if (/\b(new|fresh|another)\b[^.?!]*\b(game|board)\b|\b(rematch|start over|restart|reset|play again)\b/.test(lower)) return newGame(ctx);
    if (/\b(explain|why did you|why that|why'd you|last move|that move)\b/.test(lower)) return explain(ctx);
    if (/\b(winning|ahead|behind|score|material|how am i doing|who'?s up)\b/.test(lower)) return standing(ctx);
    if (/\b(hint|what should i|best move|help me|which move)\b/.test(lower)) {
      return 'I’ll keep my plans to myself, since finding the move is the pleasure of the game. A general habit that helps: before each move, look at every check and capture available to both of us.';
    }
    if (/\bcastl/.test(lower)) {
      return 'Castling moves the king two squares toward a rook, and that rook hops over to the other side of the king. It’s allowed when neither piece has moved, the squares between are empty, and the king doesn’t pass through check. The board handles it: click your king, and castling shows up as a highlighted square.';
    }
    if (/en passant/.test(lower)) {
      return 'En passant: when a pawn moves two squares and lands beside an enemy pawn, that pawn may capture it as if it had moved one square, but only on the very next move. The board offers it when it’s legal.';
    }
    if (/\b(promot|queen a pawn)/.test(lower)) {
      return 'A pawn that reaches the last rank becomes a queen, rook, bishop, or knight. The board asks which piece you want when it happens.';
    }
    if (/\b(plan|opening|strategy|tips?|advice|improve|better)\b/.test(lower)) return plan(ctx);
    if (/\b(your (move|turn)|go ahead|play)\b/.test(lower)) return yourMove(ctx);
    if (/^\s*(hi|hello|hey|good (morning|afternoon|evening))\b/.test(lower)) return 'Hello! The board is set. Your move with white whenever you’re ready.';
    return null;
  }

  return script;
})();

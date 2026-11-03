// The standalone demo's sample conversation. In Gezel, the clue givers' turns
// come from the model the person chooses; here Pim's are scripted, and every
// clue goes through the same give_clue tool the live crew member calls.
window.demoChat = (function () {
  'use strict';
  // Pim's word sense: a clue and the board words it fits. A clue that fits the
  // trap is never given; one that fits a bystander is a last resort.
  var VOCAB = [
    ['sea', ['whale', 'sail', 'shell', 'harbor', 'ship', 'boat', 'wave', 'island', 'fish', 'shark', 'dolphin', 'pearl', 'anchor', 'beach', 'sand', 'salt']],
    ['picnic', ['bread', 'cheese', 'grape', 'basket', 'blanket', 'apple', 'sandwich']],
    ['orchestra', ['violin', 'drum', 'piano', 'flute', 'trumpet']],
    ['winter', ['snow', 'ice', 'scarf', 'coat', 'glove', 'sock']],
    ['night', ['moon', 'star', 'owl', 'ghost', 'candle', 'lantern', 'shadow', 'torch']],
    ['sky', ['moon', 'star', 'cloud', 'eagle', 'kite', 'balloon', 'bird', 'rain', 'sun', 'storm']],
    ['boat', ['sail', 'harbor', 'anchor', 'canoe', 'ship']],
    ['frost', ['snow', 'ice', 'window']],
    ['toast', ['bread', 'cheese', 'jam']],
    ['wine', ['grape', 'cheese', 'glass', 'bottle', 'barrel']],
    ['orbit', ['rocket', 'moon', 'planet']],
    ['wand', ['wizard']],
    ['oyster', ['shell', 'pearl']],
    ['moby', ['whale']],
    ['port', ['harbor', 'ship', 'boat']],
    ['launch', ['rocket', 'boat']],
    ['hoot', ['owl']],
    ['twinkle', ['star']],
    ['lunar', ['moon']],
    ['raisin', ['grape']],
    ['loaf', ['bread']],
    ['bow', ['violin', 'arrow']],
    ['keys', ['piano', 'lock', 'door']],
    ['beat', ['drum']],
    ['wool', ['scarf', 'sheep', 'sock', 'blanket']],
    ['flake', ['snow']],
    ['rink', ['ice', 'skate']],
  ];
  var TALK = [
    'Fortune favors the bold.',
    'I like this one more than I should.',
    'Take your time; the board isn’t going anywhere.',
    'Trust your first instinct.',
    'Go on, you’ve got this.',
    'This one made me grin.',
  ];

  function game(ctx) { return ctx.read('game.json'); }
  function targets(g) { return g.words.filter(function (w) { return w.kind === 'target'; }); }
  function hidden(g) { return targets(g).filter(function (w) { return !w.revealed; }); }
  function trapWord(g) { return (g.words.find(function (w) { return w.kind === 'trap'; }) || {}).word || ''; }
  function list(words) {
    return words.length < 2 ? words.join('') : words.slice(0, -1).join(', ') + ' and ' + words[words.length - 1];
  }
  function plural(n, word) { return n + ' ' + word + (n === 1 ? '' : 's'); }
  function current(g) { return g.clue ? '**' + g.clue.word + ', ' + g.clue.count + '**' : 'the clue'; }
  // The live engine refuses a clue on the board or a form of a board word.
  function allowed(g, clue) {
    return g.words.every(function (w) {
      var shorter = clue.length < w.word.length ? clue : w.word;
      var longer = clue.length < w.word.length ? w.word : clue;
      return w.word !== clue && !(shorter.length >= 3 && longer.indexOf(shorter) === 0);
    });
  }

  function chooseClue(g) {
    var trap = trapWord(g);
    var mine = hidden(g).map(function (w) { return w.word; });
    var others = g.words.filter(function (w) { return w.kind === 'neutral' && !w.revealed; }).map(function (w) { return w.word; });
    var given = (g.history || []).map(function (h) { return String(h.clue).toLowerCase(); });
    var best = null;
    [false, true].some(function (repeat) {
      VOCAB.forEach(function (entry) {
        var clue = entry[0], fits = entry[1];
        if (!allowed(g, clue) || fits.indexOf(trap) >= 0 || given.indexOf(clue) >= 0 !== repeat) return;
        var hits = mine.filter(function (word) { return fits.indexOf(word) >= 0; });
        var risk = others.filter(function (word) { return fits.indexOf(word) >= 0; }).length;
        if (!hits.length) return;
        var score = Math.min(hits.length, 3) - risk * 1.5;
        if (!best || score > best.score) best = { clue: clue, count: Math.min(hits.length, 3), score: score };
      });
      return !!best;
    });
    return best;
  }

  function giveClue(ctx, g) {
    var pick = chooseClue(g);
    if (!pick) return 'I’m out of fair clues for this board. Tap New game and I’ll start fresh.';
    var say = pick.count === 3
      ? (g.round % 2 ? 'Three at once. Let’s see how brave you feel.' : 'Three in one go, if you’re feeling brave.')
      : pick.count === 1 && g.round % 2 ? 'Just the one. Make it count.' : TALK[(g.round + pick.clue.length) % TALK.length];
    var shown = pick.clue.toUpperCase() + ', ' + pick.count;
    return ctx.invoke('give_clue', { clue: pick.clue, count: pick.count, say: say }, shown).then(function (out) {
      return (out && out.display) || 'Clue: ' + shown + '. ' + say;
    });
  }

  function gameOver(g) {
    var found = targets(g).filter(function (w) { return w.revealed; }).length;
    if (g.status === 'won') {
      return 'You found all six in ' + plural(g.round, 'clue') + '. That was a joy to clue for. Tap New game whenever you want another board.';
    }
    return 'The ' + trapWord(g) + ' got us. ' +
      (found >= 4 ? 'You’d found ' + found + ' of 6, so that one was close. ' : found ? 'You’d found ' + found + ' of 6 by then. ' : '') +
      'Tap New game and we’ll go again.';
  }

  function standing(ctx) {
    return ctx.invoke('board', {}, 'Reading the table').then(function () { return game(ctx); }).then(function (g) {
      var found = targets(g).filter(function (w) { return w.revealed; }).map(function (w) { return w.word; });
      var s = g.stats || { won: 0, lost: 0 };
      var record = ' Your record in this sample: ' + s.won + ' won, ' + s.lost + ' lost.';
      if (g.status === 'won' || g.status === 'lost') return gameOver(g) + record;
      var head = found.length
        ? 'You’ve found ' + found.length + ' of your 6 words: ' + list(found) + '.'
        : 'None of your 6 words are found yet.';
      return 'Round ' + g.round + '. ' + head + ' ' + current(g) + ' is on the table with ' +
        plural(g.clue ? g.clue.guessesLeft : 0, 'pick') + ' left.' + record;
    });
  }

  function recap(g) {
    var rows = (g.history || []).map(function (h) {
      var open = g.status === 'guessing' && g.clue && h.round === g.round;
      return '- **' + h.clue + ', ' + h.count + '**: ' + (h.found.length ? list(h.found) : 'nothing yet') + (open ? ' (still guessing)' : '');
    });
    if (!rows.length) return 'No clues yet on this board. Your first one is coming up.';
    return 'Here’s every clue on this board so far:\n\n' + rows.join('\n');
  }

  function tips(g) {
    var open = (g.history || []).filter(function (h) { return h.round !== g.round && h.found.length < h.count; });
    var lead = 'No hints beyond the clue; that’s the one rule I keep. But here’s some table craft. ';
    var picks = current(g) + ' gives you ' + plural(g.clue.guessesLeft, 'pick') + '. ';
    var extra = open.length
      ? '**' + open[0].clue + ', ' + open[0].count + '** still has ' + plural(open[0].count - open[0].found.length, 'word') +
        ' out there, so a spare pick can go after it.'
      : 'Every earlier clue found its words, so a spare pick is a free swing. Only take it if you’re sure.';
    return lead + picks + extra + ' And when a word feels shaky, Stop guessing is always safe.';
  }

  function rules(g) {
    var left = hidden(g).length;
    return 'Find your 6 words before you touch the trap. Each clue is one word and a count, and you get one pick more than the count. ' +
      'A bystander ends your turn and the trap ends the game. ' +
      (g.status === 'guessing' ? 'You have ' + left + ' to go.' : '');
  }

  return {
    name: 'Pim',
    role: 'Clue Giver',
    greeting: 'Hi, I’m Pim. I give the clues; you find your six words. SPACE already found the rocket, and **SEA, 3** is on the table: three of your words, four picks. Tap the ones you think I mean, and when your turn ends I’ll be right back with the next clue.',
    suggestions: [
      'Where do we stand?',
      'Recap your clues',
      'Any tips for this clue?',
    ],
    respond: function (text, ctx) {
      var lower = text.toLowerCase();
      return game(ctx).then(function (g) {
        var over = g.status === 'won' || g.status === 'lost';
        // In Gezel a message while a clue is owed is answered with the clue.
        if (g.status === 'clue_needed') return giveClue(ctx, g);
        if (/\b(stand|score|status|progress|left|record|doing)\b/.test(lower)) return standing(ctx);
        if (/\b(recap|history|so far|clues)\b/.test(lower)) return recap(g);
        if (/\b(new game|another game|another board|start over|deal)\b/.test(lower)) {
          return 'Dealing is yours: tap New game under the board and I’ll open with a fresh clue.';
        }
        if (/\btrap\b/.test(lower)) {
          if (g.status === 'won') return 'The trap was the ' + trapWord(g) + ', and you steered clear of it.';
          return over
            ? gameOver(g)
            : 'I know where the trap is, and my lips are sealed. Every clue I give is picked to stay clear of it.';
        }
        if (/\b(tip|tips|advice|strategy|hint|help)\b/.test(lower)) return over ? gameOver(g) : tips(g);
        if (/\b(clue|next)\b/.test(lower)) {
          if (over) return gameOver(g);
          return 'You still have ' + plural(g.clue.guessesLeft, 'pick') + ' on ' + current(g) +
            '. Tap a word, or Stop guessing when you’re done, and the next clue is yours.';
        }
        if (/\b(rule|rules|win|play|how does)\b/.test(lower)) return rules(g);
        return null;
      });
    },
    reactions: {
      // The page asks for a clue when the person's turn ends or the game does.
      ask_clue_a: function (input, output, ctx) {
        return game(ctx).then(function (g) {
          if (g.status === 'clue_needed') return giveClue(ctx, g);
          if (g.status === 'won' || g.status === 'lost') return gameOver(g);
          return null;
        });
      },
      ask_clue_b: function (input, output, ctx) {
        return game(ctx).then(function (g) {
          if (g.status === 'clue_needed') return giveClue(ctx, g);
          if (g.status === 'won' || g.status === 'lost') return gameOver(g);
          return null;
        });
      },
    },
  };
})();

// The standalone demo's sample conversation. In Gezel, the study partner's
// replies come from the model the person chooses; here they are scripted, and
// every new card goes through the same add_cards tool the live crew member calls.
window.demoChat = (function () {
  'use strict';
  var SESSION_MS = 15 * 60 * 1000;
  var POOLS = {
    market: [
      ['Ik wil graag een kilo appels.', 'I would like a kilo of apples.'],
      ['Heeft u ook aardbeien?', 'Do you also have strawberries?'],
      ['Wat is de prijs per stuk?', 'What is the price per piece?'],
      ['Twee zakjes, alstublieft.', 'Two bags, please.'],
      ['Mag ik even proeven?', 'May I have a taste?'],
      ['Is dit vers?', 'Is this fresh?'],
      ['Ik kijk alleen even.', 'I am just looking.'],
    ],
    numbers: [
      ['twee euro vijftig', 'two euros fifty (2.50 euros)'],
      ['een tientje', 'a ten-euro note'],
      ['de helft', 'half'],
      ['een pond', 'half a kilo (500 grams)'],
      ['goedkoop', 'cheap'],
      ['duur', 'expensive'],
    ],
    produce: [
      ['de aardbei', 'the strawberry'],
      ['de peer', 'the pear'],
      ['de prei', 'the leek'],
      ['de ui', 'the onion'],
      ['de kaas', 'the cheese'],
      ['het brood', 'the bread'],
    ],
    greetings: [
      ['Fijne dag nog!', 'Have a nice day!'],
      ['Tot ziens!', 'Goodbye!'],
      ['Alstublieft', 'Please, or here you go'],
      ['Graag gedaan', 'You are welcome'],
      ['Goedemiddag!', 'Good afternoon!'],
    ],
  };
  var TOPIC_NAMES = { market: 'market phrases', numbers: 'price and number words', produce: 'produce words', greetings: 'greetings' };
  var NOTES = {
    'een bos bloemen': '**Een bos bloemen** is “a bunch of flowers.” **Bos** means a bunch or bundle (it also means a forest), and **bloemen** is the plural of **bloem**, flower. You’ll hear it at every flower stall: “Een bos tulpen, alstublieft.”',
    'mag ik pinnen?': '**Mag ik pinnen?** is “Can I pay by card?” **Pinnen** comes from the PIN you type, so it’s the everyday verb for paying by debit card. If the seller says “alleen contant,” it’s cash only.',
    'hoeveel kost dit?': '**Hoeveel kost dit?** is “How much does this cost?” **Hoeveel** is “how much,” **kost** is “costs,” and **dit** is “this.” Point at the thing and you’re set.',
    'dat is alles, dank u.': '**Dat is alles, dank u.** is “That is all, thank you.” **Dank u** is the polite thank-you; with friends it’s **dank je**.',
    'contant': '**Contant** means cash. Ask “Kan ik contant betalen?” to check whether a stall takes it.',
    'een halve kilo': '**Een halve kilo** is half a kilo. **Halve** takes an -e because it sits before a noun, and many stalls simply call it **een pond**.',
    'de markt': '**De markt** is the market. Most towns hold one each week, often on a square that is itself called the Markt.',
    'goedemorgen!': '**Goedemorgen!** is “Good morning!” Use it until about noon; after that it’s **goedemiddag**.',
  };
  var BASE = ['How am I doing?', 'Add five more market phrases', 'Explain the one I keep missing', 'Quiz me on one'];
  var quiz = null;
  var quizzes = 0;
  var lastQuiz = null;
  var offer = null;

  // The suggestion keys: the standing ones, an open offer, and what fits this moment.
  function keys(extra) { return BASE.concat(offer ? [offer] : [], extra || []); }

  function deck(ctx) { return ctx.read('deck.json'); }
  function plural(n, word) { return n + ' ' + word + (n === 1 ? '' : 's'); }
  // A card's answer in bold, ending the sentence without doubling its own punctuation.
  function said(text) { return '**' + text + '**' + (/[.!?]$/.test(text) ? '' : '.'); }
  function norm(text) { return String(text || '').toLowerCase().replace(/[“”"'’.,!?¿¡()]/g, ' ').replace(/\s+/g, ' ').trim(); }
  function byId(d, id) { return d.cards.find(function (c) { return c.id === id; }) || null; }
  function language(d) {
    var match = /\b(Dutch|Spanish|French|German|Italian|Portuguese|Japanese)\b/i.exec(d.subject || '');
    return match ? match[1].charAt(0).toUpperCase() + match[1].slice(1).toLowerCase() : '';
  }
  function hardest(d) {
    return d.cards
      .filter(function (c) { return c.stats && c.stats.missed > 0; })
      .sort(function (a, b) { return b.stats.missed - a.stats.missed || a.box - b.box; });
  }
  function reviewedLately(d) {
    var since = Date.now() - SESSION_MS;
    return d.cards.filter(function (c) { return c.lastReviewedAt && Date.parse(c.lastReviewedAt) >= since; });
  }
  function named(d, text) {
    var lower = norm(text);
    return d.cards.find(function (c) { return norm(c.front).length > 2 && lower.indexOf(norm(c.front)) >= 0; }) ||
      d.cards.find(function (c) { return norm(c.back).length > 3 && lower.indexOf(norm(c.back)) >= 0; }) || null;
  }
  function ask(card) {
    return /^(what|who|when|where|why|how|which|fill in)\b/i.test(card.front)
      ? '**' + card.front + '**'
      : 'what does **' + card.front + '** mean?';
  }

  function progress(ctx) {
    return ctx.invoke('deck_status', {}, 'Boxes and due cards').then(function () { return deck(ctx); }).then(function (d) {
      if (!d.cards.length) return 'The deck is empty. Ask me for a few cards and we’ll start there.';
      var boxes = [0, 0, 0, 0];
      d.cards.forEach(function (c) { boxes[c.box] += 1; });
      var lines = [
        '**' + plural(d.cards.length, 'card') + '** on ' + d.subject + ', and ' + d.dueCardIds.length + ' due now. ' +
          boxes[3] + ' sit on the weekly shelf, ' + boxes[2] + ' come back every three days, and ' + boxes[1] + ' come back daily.',
      ];
      var tough = hardest(d)[0];
      if (tough) {
        lines.push('The one that keeps slipping is **' + tough.front + '** (missed ' + plural(tough.stats.missed, 'time') + '). ' +
          (d.dueCardIds.indexOf(tough.id) >= 0 ? 'It’s due today, which is exactly right.' : 'It isn’t due yet; it comes back on schedule.'));
      }
      var lately = reviewedLately(d);
      if (lately.length) {
        var up = lately.filter(function (c) { return c.box > 1; }).length;
        lines.push('Today you reviewed ' + plural(lately.length, 'card') + ', and ' + up + ' of them moved up a box.');
      }
      return lines;
    });
  }

  function addTopic(ctx, text) {
    var lower = text.toLowerCase();
    var topic = /\b(number|numbers|price|prices|money|euro|euros|cost)\b/.test(lower) ? 'numbers'
      : /\b(fruit|vegetables?|produce|food|cheese|bread)\b/.test(lower) ? 'produce'
        : /\b(greet\w*|polite|hello|goodbye|please|thanks?|manners)\b/.test(lower) ? 'greetings' : 'market';
    var words = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8 };
    var asked = /\b(\d+|one|two|three|four|five|six|seven|eight)\b/.exec(lower);
    var count = Math.min(8, Math.max(1, asked ? Number(words[asked[1]] || asked[1]) : 5));
    return deck(ctx).then(function (d) {
      var have = d.cards.map(function (c) { return norm(c.front); });
      var fresh = POOLS[topic].filter(function (pair) { return have.indexOf(norm(pair[0])) < 0; }).slice(0, count);
      if (!fresh.length) {
        return 'Every one of my ' + TOPIC_NAMES[topic] + ' is already in your deck. Try asking for greetings, produce, or price words.';
      }
      var cards = fresh.map(function (pair) { return { front: pair[0], back: pair[1] }; });
      return ctx.invoke('add_cards', { cards: cards }, plural(cards.length, TOPIC_NAMES[topic].replace(/s$/, ''))).then(function (out) {
        return out.summary;
      });
    });
  }

  function explain(ctx, text) {
    return deck(ctx).then(function (d) {
      if (!d.cards.length) return 'There’s nothing in the deck to explain yet. Ask me for a few cards first.';
      var card = named(d, text) || hardest(d)[0] || byId(d, d.dueCardIds[0]) || d.cards[0];
      var note = NOTES[card.front.toLowerCase()];
      var missed = card.stats && card.stats.missed;
      var lead = !named(d, text) && missed ? 'That’s **' + card.front + '**, missed ' + plural(missed, 'time') + ' so far. ' : '';
      return lead + (note || '**' + card.front + '** goes with ' + said(card.back) + ' I don’t have more notes on that one in this sample.') +
        (missed && !named(d, text) ? ' Want a couple of practice cards on it from a new angle?' : '');
    }).then(function (reply) {
      if (/practice cards/.test(reply)) offer = 'Yes, add practice cards for it';
      return { reply: reply, suggestions: keys() };
    });
  }

  function angleCards(ctx) {
    offer = null;
    return deck(ctx).then(function (d) {
      var lately = reviewedLately(d).filter(function (c) { return c.box === 1 && c.stats.missed > 0; });
      var targets = (lately.length ? lately : hardest(d).slice(0, 1)).slice(0, 2);
      if (!targets.length) return 'Nothing has slipped yet, so there’s nothing to come at from a new angle. Ask me for new cards instead.';
      var lang = language(d);
      var have = d.cards.map(function (c) { return norm(c.front); });
      var cards = [];
      targets.forEach(function (card) {
        cards.push({
          front: lang ? 'How do you say “' + card.back + '” in ' + lang + '?' : 'What goes with “' + card.back + '”?',
          back: card.front,
        });
        var words = card.front.replace(/[.!?]+$/, '').split(/\s+/);
        if (words.length > 1) {
          var pick = words
            .map(function (w) { return w.replace(/[^\p{L}’'-]/gu, ''); })
            .reduce(function (best, w) { return w.length > best.length ? w : best; }, '');
          cards.push({ front: 'Fill in the blank: ' + card.front.replace(pick, '___'), back: pick });
        }
      });
      cards = cards.filter(function (c) { return have.indexOf(norm(c.front)) < 0; });
      if (!cards.length) return 'Those practice cards are already in your deck. They’ll come up in your next review.';
      var names = targets.map(function (c) { return c.front; }).join(' and ');
      return ctx.invoke('add_cards', { cards: cards }, plural(cards.length, 'practice card') + ' for ' + names).then(function (out) {
        return out.summary;
      });
    });
  }

  function startQuiz(ctx) {
    return deck(ctx).then(function (d) {
      if (!d.cards.length) return 'The deck is empty, so there’s nothing to quiz yet. Ask me for a few cards first.';
      var pool = d.dueCardIds.map(function (id) { return byId(d, id); }).filter(Boolean);
      if (!pool.length) pool = d.cards.slice();
      var card = pool.find(function (c) { return c.id !== lastQuiz; }) || pool[0];
      quiz = { id: card.id, front: card.front, back: card.back };
      lastQuiz = card.id;
      quizzes += 1;
      return {
        reply: 'Quick one, just for practice: ' + ask(card) + ' Answer here when you’re ready.',
        suggestions: keys([quizzes % 2 ? 'I’m not sure, tell me' : 'No idea, what is it?']),
      };
    });
  }

  function keywords(text) {
    var stop = ['the', 'and', 'for', 'you', 'your', 'this', 'that', 'does', 'are', 'was', 'with', 'how', 'what'];
    return norm(text).split(' ').filter(function (w) { return w.length >= 3 && stop.indexOf(w) < 0; });
  }

  function grade(answer) {
    var card = quiz;
    quiz = null;
    var want = keywords(card.back), said = norm(answer);
    var hits = want.filter(function (w) { return said.indexOf(w.slice(0, 4)) >= 0; }).length;
    var after = { reply: '', suggestions: keys([quizzes % 2 ? 'Quiz me on another' : 'One more quiz']) };
    if (said === norm(card.back) || (want.length && hits / want.length >= 0.6)) {
      after.reply = 'That’s it: ' + said(card.back) + ' That one’s sticking.';
    } else if (hits) {
      after.reply = 'Close. It’s ' + said(card.back) + ' You had the gist; marking it on the deck is what moves it up a box.';
    } else {
      after.reply = 'Not quite: it’s ' + said(card.back) + ' No harm done. It comes back in your next review, and that’s the system working.';
    }
    return after;
  }

  return {
    name: 'Noor',
    role: 'Study Partner',
    greeting: 'Hi, I’m Noor. Four cards are due this morning, and **een bos bloemen** keeps slipping, so it’s first in line. Start the review when you’re ready, or ask me for more cards.',
    suggestions: BASE,
    respond: function (text, ctx) {
      // Every reply refreshes the keys, so an answer to a finished quiz never lingers.
      return Promise.resolve(answer()).then(function (r) {
        return r == null || (typeof r === 'object' && !Array.isArray(r)) ? r : { reply: r, suggestions: keys() };
      });
      function answer() {
        var lower = text.toLowerCase();
        var other = /\b(how am i|progress|explain|quiz|add|more|due|hardest)\b/.test(lower);
        if (quiz && /\b(not sure|don.?t know|tell me|give up|no idea|reveal|show me|what is it)\b/.test(lower)) {
          var card = quiz;
          quiz = null;
          return {
            reply: 'It’s ' + said(card.back) + ' That’s exactly why it’s in the deck; it comes back in your next review.',
            suggestions: keys([quizzes % 2 ? 'Quiz me on another' : 'One more quiz']),
          };
        }
        if (quiz && !other) return grade(text);
        quiz = null;
        if (/\b(explain|what does|meaning|why)\b/.test(lower)) return explain(ctx, text);
        if (/\b(practice cards?|new angle|another angle|ones? i missed|missed ones|yes)\b/.test(lower)) return angleCards(ctx);
        if (/\b(quiz|test me|ask me)\b/.test(lower)) return startQuiz(ctx);
        if (/\b(how am i|progress|stats|summary|status|how.?s it going)\b/.test(lower)) return progress(ctx);
        if (/\b(due)\b/.test(lower)) {
          return deck(ctx).then(function (d) {
            var due = d.dueCardIds.map(function (id) { return byId(d, id); }).filter(Boolean);
            return due.length
              ? 'Due now, in review order:\n\n' + due.map(function (c) { return '- ' + c.front; }).join('\n')
              : 'Nothing is due right now. The deck brings each card back on schedule.';
          });
        }
        if (/\b(hardest|struggl\w*|trouble|difficult|tricky)\b/.test(lower)) {
          return deck(ctx).then(function (d) {
            var tough = hardest(d).slice(0, 3);
            return tough.length
              ? 'The ones that slip most:\n\n' + tough.map(function (c) { return '- **' + c.front + '**: missed ' + plural(c.stats.missed, 'time'); }).join('\n')
              : 'Nothing has slipped yet. Every card you’ve reviewed, you got.';
          });
        }
        if (/\b(add|more|write|make|new)\b/.test(lower) && /\b(cards?|phrases?|words?|greetings?|numbers?|prices?|produce|fruit)\b/.test(lower)) return addTopic(ctx, text);
        return null;
      }
    },
    reactions: {
      // The live reaction: one short, specific line after a review session.
      finish_session: function (input, output, ctx) {
        return deck(ctx).then(function (d) {
          var reviewed = Number(input.reviewed) || 0;
          var missed = (input.missedIds || []).map(function (id) { return byId(d, id); }).filter(Boolean);
          var top = reviewedLately(d).filter(function (c) { return c.box === 3; })[0];
          var lift = top ? ' **' + top.front + '** made it to the weekly shelf.' : '';
          if (!missed.length) {
            return (reviewed > 1 ? 'All ' + reviewed + ', no misses.' : 'Got it, no misses.') + (lift || ' Every one moved up a box.');
          }
          var names = missed.map(function (c) { return '**' + c.front + '**'; }).join(' and ');
          offer = missed.length === 1 ? 'Yes, add practice cards for it' : 'Yes, add practice cards for those';
          return {
            reply: (reviewed - missed.length) + ' of ' + reviewed + '.' + lift + ' ' + names + ' slipped, which is the deck doing its job. ' +
              'Want a couple of fresh cards that come at ' + (missed.length === 1 ? 'it' : 'them') + ' from a new angle?',
            suggestions: keys(),
          };
        });
      },
      // The live reaction turns staged notes into cards with add_cards.
      forge_from_notes: function (input, output, ctx) {
        var cards = cardsFromNotes(String((output && output.notes) || input.notes || ''));
        if (!cards.length) return 'I couldn’t find clear facts in those notes. Try a few full sentences, one fact each.';
        return ctx.invoke('add_cards', { cards: cards }, plural(cards.length, 'card') + ' from your notes').then(function (out) {
          return out.summary;
        });
      },
    },
  };

  // One fact per card, the way the live prompt asks: a term and its meaning,
  // "X means Y", a short "X is Y", or a fill-in-the-blank for anything else.
  function cardsFromNotes(notes) {
    var NUMBER = /^(\d[\d.,]*|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|twenty|hundred|thousand)$/i;
    var ARTICLE = /^(the|a|an|een|de|het)\s/i;
    var cards = [];
    notes.split(/(?<=[.!?])\s+|\n+/).forEach(function (raw) {
      if (cards.length >= 8) return;
      var s = raw.trim().replace(/[.!]+$/, '');
      if (s.length < 6) return;
      var m = /^(.{1,60}?)(?:\s*[:=]\s+|\s+[-–]\s+)(.+)$/.exec(s);
      if (m) return cards.push({ front: m[1], back: m[2] });
      m = /^(.+?)\s+means\s+(.+)$/i.exec(s);
      if (m) {
        var term = m[1].split(/\s+/).length <= 2 ? m[1].charAt(0).toLowerCase() + m[1].slice(1) : m[1];
        return cards.push({ front: 'What does ' + term + ' mean?', back: m[2] });
      }
      m = /^(.+?)\s+(is|are)\s+(.+)$/i.exec(s);
      if (m && m[1].split(/\s+/).length <= 3) {
        return cards.push({ front: 'What ' + m[2].toLowerCase() + ' ' + m[1].replace(ARTICLE, function (a) { return a.toLowerCase(); }) + '?', back: m[3] });
      }
      var words = s.split(/\s+/);
      if (words.length < 4) return;
      var at = words.findIndex(function (w) { return NUMBER.test(w); });
      if (at < 0) at = words.findIndex(function (w, i) { return i > 0 && /^[A-Z][a-z]/.test(w); });
      if (at < 0) {
        for (var i = words.length - 1; i > 0; i -= 1) if (words[i].replace(/\W/g, '').length >= 4) { at = i; break; }
      }
      if (at < 0) return;
      var answer = words[at].replace(/[^\w’'-]/g, '');
      words[at] = '___';
      cards.push({ front: 'Fill in the blank: ' + words.join(' ') + '.', back: answer });
    });
    return cards;
  }
})();

// The standalone demo's sample conversation. In Gezel, the writing
// partner's replies come from the model the person chooses; here they are
// scripted, and every change goes through the same tools the real crew
// member calls. The partner reads the outline and session notes, not pages.
window.demoChat = (function () {
  'use strict';
  var DAY = 86400000;
  var STAGES = ['outline', 'drafting', 'revised', 'done'];
  var WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  var SUGGESTIONS = [
    'What’s working in the ferryman chapter?',
    'Give Oskar a want of his own',
    'Put the price scene on the board',
    'I wrote 900 words on the bargain scene',
    'Where does the book stand?',
  ];
  var STOP = ['the', 'and', 'that', 'this', 'with', 'into', 'from', 'what', 'when', 'where', 'over', 'under', 'chapter', 'scene', 'last'];

  // What a careful reader would say about the sample chapters, from their outline lines.
  var READINGS = {
    'ch-1': {
      works: 'The opening promise is clean: a map changes, and the world obeys it by noon. That’s the whole book’s question in one image.',
      help: ['Give Ilse one private reaction before anyone else notices the harbor, so the reader meets her fear before the town’s.'],
    },
    'ch-2': {
      works: 'Streets kept under bell jars is the kind of picture readers retell, and learning the master sold the harbor turns wonder into betrayal.',
      help: ['Let the sale land on Ilse personally: one thing of hers that was on the old harbor makes the betrayal hers, not only the city’s.'],
    },
    'ch-3': {
      works: 'The price Oskar won’t name until they’re on the water is a built-in clock. The reader rides with Ilse into a deal she can’t back out of.',
      help: [
        'Name the price before the chapter ends, and make it cost Ilse something the book already set up. Her master sold the old harbor in chapter 2; Oskar could ask for the one thing that still proves it existed, the original chart.',
      ],
    },
    'ch-4': {
      works: 'Walking into the blank part of the map is a strong turn: the story leaves the drawn world.',
      help: ['“Something there is drawing them” is doing a lot of work. Decide what Ilse thinks it is before she finds out she’s wrong.'],
    },
    'ch-5': {
      works: 'Meeting the hand that holds the pen is an ending with weight, because the first chapter taught us to fear whoever draws.',
      help: ['Plant that hand earlier: one smudge or unfamiliar line on the chart in chapter 3 would make this a payoff instead of a surprise.'],
    },
  };
  var WANTS = {
    oskar: {
      find: /ferry|oskar/i,
      note: 'Oskar wants the river back: the redrawn map erased his landing and his house with it. That’s why the price is the original chart.',
      say: 'Here’s one to try. The new map erased Oskar’s landing and his house with it, so what he wants is the river back. That makes the original chart his price for a reason of his own, not a ferryman’s whim, and it puts him and Ilse on the same side of the map for a while.',
    },
    ilse: {
      find: /map that changed|ilse/i,
      note: 'Ilse wants proof the map can be trusted again; she trusts paper over people, which is what Oskar will test.',
      say: 'Ilse already has a need, the harbor back. Give her a want underneath it: proof that maps can be trusted again. She trusts paper over people, which is exactly what Oskar will test.',
    },
  };
  var PRICE_SCENE = {
    title: 'What the ferryman asks',
    summary: 'Midstream, Oskar names his price: the original chart of Vell. Ilse must choose between the only proof of the old harbor and the far side of the glass line.',
  };

  function fmt(n) { return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ','); }
  function title(r) { return String((r.fields && r.fields.title) || r.id); }
  function words(e) { var w = e && e.data ? Number(e.data.words) : NaN; return isFinite(w) && w > 0 ? Math.round(w) : 0; }
  function capitalize(text) { return text.charAt(0).toUpperCase() + text.slice(1); }
  function weekStart() { var now = Date.now(); return Date.parse(new Date(now).toISOString().slice(0, 10) + 'T00:00:00Z') - ((new Date(now).getUTCDay() + 6) % 7) * DAY; }

  function room(ctx) {
    return Promise.all([ctx.read('sessions.json'), ctx.read('chapters.json')]).then(function (v) {
      var sessions = v[0] || {}, chapters = v[1] || {};
      var events = Array.isArray(sessions.events) ? sessions.events : [];
      var start = weekStart();
      var goal = Number(sessions.weeklyWordGoal) > 0 ? Math.round(Number(sessions.weeklyWordGoal)) : 0;
      return {
        book: sessions.title || 'the book',
        goal: goal,
        events: events,
        total: events.reduce(function (n, e) { return n + words(e); }, 0),
        week: events.filter(function (e) { return Date.parse(e.at) >= start; }).reduce(function (n, e) { return n + words(e); }, 0),
        chapters: Array.isArray(chapters.records) ? chapters.records : [],
      };
    });
  }
  function byStage(r, stage) { return r.chapters.filter(function (c) { return c.status === stage; }); }
  // A chapter named by id ("ch-3", "chapter 3") or by the words of its title.
  function chapterIn(text, chapters) {
    var lower = text.toLowerCase();
    var id = lower.match(/\b(?:ch-?|chapter\s+)(\d+)\b/);
    if (id) return chapters.find(function (c) { return c.id === 'ch-' + id[1]; }) || null;
    var best = null, score = 0;
    chapters.forEach(function (c) {
      var hits = title(c).toLowerCase().replace(/[’']s\b/g, '').split(/[^a-z]+/).filter(function (w) {
        return w.length > 3 && STOP.indexOf(w) < 0 && new RegExp('\\b' + w).test(lower);
      }).length;
      if (hits > score) { best = c; score = hits; }
    });
    return best;
  }
  function paceLine(r) {
    if (!r.goal) return 'That makes ' + fmt(r.week) + ' words this week.';
    var day = (new Date().getUTCDay() + 6) % 7, expected = Math.round(r.goal * (day + 1) / 7);
    var base = fmt(r.week) + ' of ' + fmt(r.goal) + ' this week';
    if (r.week >= r.goal) return base + ': the week’s goal is met. Anything more is momentum in the bank.';
    if (r.week >= expected) return base + ', ahead of pace for a ' + WEEKDAYS[day] + '. Writers forget their own momentum, so I’m saying it.';
    return base + '. A little behind pace for a ' + WEEKDAYS[day] + ', and that’s fine: one more session like this closes most of it.';
  }

  function feedback(ctx, text) {
    return ctx.invoke('outline', {}, 'Chapter summaries and notes').then(function () { return room(ctx); }).then(function (r) {
      var c = chapterIn(text, r.chapters);
      var asked = text.match(/\b(?:on|of|about|for|in)\s+((?:the\s+)?[a-z][a-z’' -]{3,60}?)\s*[?.!]*$/i);
      if (!c && asked && !/\b(it|this|draft|book|novel|story|chapter|pages?|outline|so far)\b/i.test(asked[1])) {
        return 'I don’t see “' + asked[1] + '” on the board. Ask me to add it and I’ll put it in Outline.';
      }
      c = c || byStage(r, 'drafting')[0] || r.chapters[r.chapters.length - 1];
      if (!c) return 'There’s nothing on the board yet. Put a chapter there with a one-line summary and I’ll read it with you.';
      var reading = READINGS[c.id] || null;
      var summary = c.fields && c.fields.summary ? String(c.fields.summary) : '';
      var parts = ['Reading the outline and your notes for “' + title(c) + '”, not the pages themselves:'];
      if (reading) {
        parts.push('**What works:** ' + reading.works);
        var help = reading.help.slice();
        if (c.id === 'ch-3') {
          var backstory = r.events.filter(function (e) { return /backstory/i.test(e.note || ''); }).pop();
          if (backstory) help.push('Your session note asks whether Oskar’s first scene carries too much backstory. Keep only what changes the bargain; the rest can surface on the crossing, a line at a time.');
        }
        parts.push('**What would help most:**\n\n' + help.map(function (h) { return '- ' + h; }).join('\n'));
      } else if (summary) {
        parts.push('**What I see:** “' + summary + '”');
        parts.push('**What would help most:** decide what is different for Ilse, or whoever carries this chapter, by its last line. If nothing changes, the chapter is a bridge, and bridges can be short.');
      } else {
        parts.push('It has no summary yet, so I’d only be guessing. Tell me in a line what changes by the end, and we’ll look at that together.');
      }
      return parts.join('\n\n');
    });
  }

  // A question gets an answer and an offer; only a request ("give", "pin it") writes the note.
  var offered = '';
  function giveWant(ctx, text, who) {
    return room(ctx).then(function (r) {
      who = who || (/\bilse\b/i.test(text) ? 'ilse' : 'oskar');
      var want = WANTS[who];
      var c = r.chapters.find(function (ch) { return want.find.test(title(ch)) || want.find.test((ch.fields && ch.fields.summary) || ''); });
      if (!c) return capitalize(who) + ' isn’t on the board anymore, so there’s no chapter to pin this to. ' + want.say;
      var already = (c.history || []).some(function (h) { return h.note === want.note; });
      if (already) return 'That’s already noted on “' + title(c) + '”: ' + want.note;
      if (/^(what|who|why|how|does|is)\b/i.test(text.trim()) || /\?\s*$/.test(text)) {
        offered = who;
        return want.say + '\n\nSay “pin it” and I’ll add that as a note on “' + title(c) + '”.';
      }
      var accepted = offered === who;
      offered = '';
      return ctx.invoke('chapter_stage', { id: c.id, stage: c.status, note: want.note }, c.id + ': a note on ' + capitalize(who)).then(function () {
        var pinned = 'I pinned it as a note on “' + title(c) + '”, where it matters first. It’s an option, not a decision; the book is yours.';
        return accepted ? pinned : [want.say, pinned];
      });
    });
  }

  function addScene(ctx, text) {
    return room(ctx).then(function (r) {
      var quoted = text.match(/[“"']([^”"']{3,80})[”"']/);
      var named = text.match(/\b(?:called|titled|named)\s+(.{3,80}?)[.!?]*$/i);
      var t = quoted ? quoted[1] : named ? named[1] : /\b(price|bargain|asks)\b/i.test(text) ? PRICE_SCENE.title : '';
      if (!t) return 'What should I call it? Give me a title, like “add a chapter called The salt market”, and a line on what happens if you have one.';
      if (r.chapters.some(function (c) { return title(c).toLowerCase() === t.toLowerCase(); })) return '“' + t + '” is already on the board.';
      var input = { title: t };
      if (t === PRICE_SCENE.title) input.summary = PRICE_SCENE.summary;
      return ctx.invoke('add_chapter', input, t).then(function () { return room(ctx); }).then(function (after) {
        var added = after.chapters[after.chapters.length - 1];
        return 'On the board in Outline as ' + added.id + ', “' + t + '”.' +
          (input.summary ? ' I gave the price scene its own chapter for now, because it’s the hinge between the ferry and the blank map: the moment Ilse pays for the crossing.' : '') +
          '\n\nThat’s ' + after.chapters.length + ' chapters, ' + byStage(after, 'outline').length + ' of them still in outline.';
      });
    });
  }

  function logWords(ctx, text) {
    var m = text.replace(/,(?=\d{3})/g, '').match(/(\d+(?:\.\d+)?)\s*(k\b)?/i);
    var count = m ? Math.round(Number(m[1]) * (m[2] ? 1000 : 1)) : 0;
    if (!count) return 'How many words? Even a hundred counts.';
    var about = text.match(/\b(?:on|about|for)\s+((?:the\s+)?[a-z][^.!?]{2,60})$/i);
    var input = { words: count };
    if (about) input.note = capitalize(about[1].trim());
    return ctx.invoke('log_session', input, fmt(count) + ' words').then(function () { return room(ctx); }).then(function (r) {
      return 'Logged ' + fmt(count) + ' words' + (input.note ? ' on ' + input.note.charAt(0).toLowerCase() + input.note.slice(1) : '') + '. ' +
        r.book + ' now stands at ' + fmt(r.total) + '.\n\n' + paceLine(r);
    });
  }

  function standing(ctx) {
    return ctx.invoke('novel_status', {}, 'Words, pace, and the board').then(function () { return room(ctx); }).then(function (r) {
      var shape = STAGES.map(function (s) { return byStage(r, s).length + ' ' + s; }).join(', ');
      var drafting = byStage(r, 'drafting'), outline = byStage(r, 'outline');
      var next, follow = null;
      if (drafting.length) {
        next = 'Next to push: finish drafting “' + title(drafting[0]) + '”. ' + (outline.length ? 'The ' + (outline.length === 1 ? 'chapter' : 'chapters') + ' still in outline lean on it.' : 'It’s the last one in progress.');
      } else if (outline.length) {
        next = 'Nothing is in drafting right now, so the next chapter to start is “' + title(outline[0]) + '”.';
        follow = 'Start drafting ' + title(outline[0]);
      } else {
        next = 'Every chapter is past drafting. Revision is where this book gets its shape.';
      }
      if (drafting.length && outline.length) follow = 'Start drafting ' + title(outline[0]);
      var reply = r.book + ' stands at **' + fmt(r.total) + ' words**. ' + paceLine(r).replace(/^That makes/, 'That’s') +
        '\n\nThe board: ' + shape + '.\n\n' + next;
      return follow ? { reply: reply, suggestions: SUGGESTIONS.concat([follow]) } : reply;
    });
  }

  function moveChapter(ctx, text) {
    return room(ctx).then(function (r) {
      var lower = text.toLowerCase();
      var c = chapterIn(text, r.chapters);
      if (!c) return 'Which chapter? Name it, like “start drafting North of the last road”.';
      var stage = /\b(to|into)\s+(outline)\b/.test(lower) ? 'outline'
        : /\b(start|begin|starting|to drafting|into drafting)\b/.test(lower) ? 'drafting'
          : /\b(to revised|revised|revision done)\b/.test(lower) ? 'revised'
            : /\b(to done|mark .* done|is done|complete|completed)\b/.test(lower) ? 'done'
              : STAGES[Math.min(STAGES.length - 1, STAGES.indexOf(c.status) + 1)];
      if (stage === c.status) return '“' + title(c) + '” is already in ' + stage + '.';
      return ctx.invoke('chapter_stage', { id: c.id, stage: stage }, c.id + ': ' + c.status + ' to ' + stage).then(function () { return room(ctx); }).then(function (after) {
        var lines = {
          drafting: '“' + title(c) + '” is in drafting. Start with the scene you can already see; the rest follows it.',
          revised: '“' + title(c) + '” moves to revised. That’s a real pass done.',
          done: '“' + title(c) + '” is done. ' + byStage(after, 'done').length + ' of ' + after.chapters.length + ' chapters finished.',
          outline: '“' + title(c) + '” is back in outline. Rethinking is part of it.',
        };
        return lines[stage];
      });
    });
  }

  function unstick(ctx) {
    return room(ctx).then(function (r) {
      var last = r.events[r.events.length - 1];
      var drafting = byStage(r, 'drafting')[0];
      return 'Blocked chapters are normal weather. ' +
        (last && last.note ? 'Your last note says: “' + last.note + '.” ' : '') +
        'Start there, with ten minutes and the next line only' + (drafting ? ', in “' + title(drafting) + '”' : '') + '. A hundred words logged beats a perfect page unwritten.';
    });
  }

  return {
    name: 'Esmee',
    role: 'Writing Partner',
    greeting: 'Hello, I’m Esmee, your writing partner. The Glass Cartographer stands at 4,740 words, and your last session stopped the ferryman’s bargain mid-dialogue. Shall we find the way back in?',
    suggestions: SUGGESTIONS,
    respond: function (text, ctx) {
      var lower = text.toLowerCase();
      if (offered && lower.length < 30 && /\b(pin|note it|add it|yes|do it|please)\b/.test(lower)) return giveWant(ctx, 'pin it', offered);
      if (/\b(stuck|blocked|block|can’t write|can't write|no ideas)\b/.test(lower)) return unstick(ctx);
      if (/\b(wrote|written|drafted|got down|managed)\b/.test(lower) && /\d/.test(lower)) return logWords(ctx, text);
      if (/\b\d[\d,]*\s*(k\s+)?words?\b/.test(lower) && !/\bwhere|how many\b/.test(lower)) return logWords(ctx, text);
      if (/\b(want|wants|motivation|motive|goal for|desire)\b/.test(lower) && /\b(oskar|ilse|ferryman|character)\b/.test(lower)) return giveWant(ctx, text);
      if (/\b(add|put|new|create)\b/.test(lower) && /\b(chapter|scene|on the board)\b/.test(lower)) return addScene(ctx, text);
      if (/\b(feedback|working|works|what do you think|thoughts|critique|notes on|read)\b/.test(lower)) return feedback(ctx, text);
      if (/\b(move|start|begin|finish|finished|revised|mark|done with|complete)\b/.test(lower)) return moveChapter(ctx, text);
      if (/\b(where|stand|status|progress|pace|total|how am i|how is the book|how’s the book)\b/.test(lower)) return standing(ctx);
      return null;
    },
    reactions: {
      page_log_session: function (input, output, ctx) {
        return room(ctx).then(function (r) {
          return 'Logged ' + fmt(Math.round(Number(input.words) || 0)) + ' words. ' + paceLine(r);
        });
      },
      page_add_chapter: function (input) {
        return '“' + input.title + '” is on the board in Outline. When you’re ready to start it, move it to drafting.';
      },
      page_chapter_stage: function (input, output, ctx) {
        return room(ctx).then(function (r) {
          var c = r.chapters.find(function (ch) { return ch.id === input.id; });
          if (!c) return null;
          if (input.stage === 'done') return '“' + title(c) + '” is done. That’s ' + byStage(r, 'done').length + ' of ' + r.chapters.length + '. Take the win.';
          if (input.stage === 'drafting') return '“' + title(c) + '” is in drafting. Tell me the words when the session ends and I’ll log them.';
          if (input.stage === 'revised') return '“' + title(c) + '” moves to revised. That’s a real pass done.';
          return '“' + title(c) + '” is back in outline.';
        });
      },
    },
  };
})();

// The standalone demo's sample conversation. In Gezel, the researcher's
// replies come from the model the person chooses; here they are scripted,
// and every change goes through the same tools the crew calls.
window.demoChat = (function () {
  'use strict';
  var DAY = 86400000;
  var SOURCE_LABEL = { google: 'Google', yelp: 'Yelp', tripadvisor: 'Tripadvisor', survey: 'survey', email: 'email', social: 'social', 'in-person': 'in-person', other: 'other' };
  // What a comment is about, by its words; `key` finds the board's theme, `name` starts one.
  var HINTS = [
    { re: /\b(wait|waited|line|slow|minutes|queue)\b/i, key: 'slow', name: 'Slow weekend service', kind: 'problem', title: 'Cut the weekend wait' },
    { re: /\b(friendly|kind|remembered|lovely|staff|team)\b/i, key: 'friendly', name: 'Friendly staff', kind: 'praise', title: 'Thank the team for the kind words' },
    { re: /\b(croissants?|pastr\w*|sold out|gone by)\b/i, key: 'sell out', name: 'Pastries sell out early', kind: 'problem', title: 'Bake a second batch of almond croissants at 10' },
    { re: /\b(croissants?|pastr\w*|baking|baked)\b/i, key: 'people love', name: 'Pastries people love', kind: 'praise', title: 'Feature the almond croissant on the menu board' },
    { re: /\b(oat milk|charge|price|expensive|steep)\b/i, key: 'oat milk', name: 'Oat milk charge', kind: 'problem', title: 'Decide on the oat milk charge' },
    { re: /\b(seats?|seating|outlets?|window|plugs?)\b/i, key: 'seating', name: 'Seating and outlets', kind: 'request', title: 'Add more seats and outlets' },
    { re: /\b(opened|opening|open earlier|hours|6:30|commuters?)\b/i, key: 'opening', name: 'Earlier opening hours', kind: 'request', title: 'Try opening at 6:30 on weekdays' },
  ];

  function pad(n) { return n < 10 ? '0' + n : String(n); }
  function iso(ms) { var d = new Date(ms); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function niceDate(day) { return new Date(String(day).slice(0, 10) + 'T12:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric' }); }
  function daysAgo(day) { return Math.round((Date.parse(iso(Date.now()) + 'T00:00:00') - Date.parse(String(day).slice(0, 10) + 'T00:00:00')) / DAY); }
  function short(text, n) { var t = String(text || '').trim(); return t.length > n ? t.slice(0, n - 1).trim() + '…' : t; }
  function first(name) { return String(name || '').trim().split(/\s+/)[0] || ''; }

  // The log folded the way the store folds it: entries with their latest themes and replies.
  function state(ctx) {
    return Promise.all([ctx.read('feedback.json'), ctx.read('themes.json'), ctx.read('actions.json')]).then(function (v) {
      var byId = {}, list = [];
      ((v[0] && v[0].events) || []).forEach(function (e) {
        var d = e.data || {};
        if (/^(review|survey|comment)$/.test(e.kind) && d.id && !byId[d.id]) {
          var entry = { id: d.id, text: e.note || '', source: d.source, rating: d.rating || null, author: d.author || '', day: d.day, themes: (d.themes || []).slice(), replyNeeded: !!d.replyNeeded, reply: '', posted: false };
          byId[d.id] = entry; list.push(entry); return;
        }
        var t = byId[d.feedbackId];
        if (!t) return;
        if (e.kind === 'tagged' || (e.kind === 'edited' && d.themes)) t.themes = (d.themes || []).slice();
        if (e.kind === 'reply') { t.reply = e.note || t.reply; if (d.posted) t.posted = true; }
        if (e.kind === 'replied') t.posted = true;
      });
      var themes = ((v[1] && v[1].records) || []).filter(function (t) { return t.status !== 'retired'; });
      return { list: list, themes: themes, actions: (v[2] && v[2].records) || [] };
    });
  }
  function themeName(s, id) { var t = s.themes.find(function (x) { return x.id === id; }); return t ? t.fields.name : id; }
  function counts(s, id) {
    var hits = s.list.filter(function (e) { return e.themes.indexOf(id) >= 0; });
    var recent = hits.filter(function (e) { var d = daysAgo(e.day); return d >= 0 && d < 30; }).length;
    var before = hits.filter(function (e) { var d = daysAgo(e.day); return d >= 30 && d < 60; }).length;
    return { recent: recent, before: before, latest: hits.sort(function (a, b) { return String(b.day).localeCompare(String(a.day)); })[0] };
  }
  function trendWords(c) {
    return !c.recent && !c.before ? 'quiet' : !c.before ? 'new this month' : c.recent > c.before ? 'up from ' + c.before + ' the month before' : c.recent < c.before ? 'down from ' + c.before + ' the month before' : 'the same as the month before';
  }
  // The theme a comment belongs to: an existing one when the words point there, or a new name.
  // Stars decide the side: a glowing review never lands in a complaint, nor a one-star one in praise.
  function themeFor(s, text, rating) {
    var hint = HINTS.find(function (h) {
      if (rating >= 4 && h.kind === 'problem') return false;
      if (rating && rating <= 2 && h.kind === 'praise') return false;
      return h.re.test(text);
    });
    if (!hint) return null;
    var theme = s.themes.find(function (t) { return t.fields.name.toLowerCase().indexOf(hint.key) >= 0; });
    return { name: theme ? theme.fields.name : hint.name, id: theme ? theme.id : null, kind: hint.kind, title: hint.title };
  }
  function owed(s) {
    return s.list.filter(function (e) { return e.replyNeeded && !e.posted; }).sort(function (a, b) { return String(a.day).localeCompare(String(b.day)); });
  }
  function who(e) { return (SOURCE_LABEL[e.source] || e.source) + (e.rating ? ', ' + e.rating + ' of 5' : '') + (e.author ? ', from ' + e.author : ''); }
  // “Carla M.’s Yelp review (2 of 5)” or “the survey answer (3 of 5)”.
  function reviewName(e) {
    var kind = e.source === 'survey' ? 'survey answer' : /^(google|yelp|tripadvisor|social)$/.test(e.source) ? SOURCE_LABEL[e.source] + ' review' : SOURCE_LABEL[e.source] + ' comment';
    return (e.author ? e.author + '’s ' : 'the ') + kind + (e.rating ? ' (' + e.rating + ' of 5)' : '');
  }
  function sentence(text) { return /[.!?]$/.test(text) ? text : text + '.'; }
  function pickEntry(list, text) {
    var words = text.toLowerCase().match(/[a-z]{4,}/g) || [];
    var best = null, score = 0;
    list.forEach(function (e) {
      var hay = (e.author + ' ' + e.source + ' ' + e.text).toLowerCase();
      var hits = words.filter(function (w) { return hay.indexOf(w) >= 0 || hay.indexOf(w.replace(/s$/, '')) >= 0; }).length;
      if (hits > score) { best = e; score = hits; }
    });
    return best;
  }
  function gerund(title) {
    var words = title.split(' '), verb = words[0].toLowerCase();
    verb = /[^e]e$/.test(verb) ? verb.slice(0, -1) + 'ing' : verb + 'ing';
    return [verb].concat(words.slice(1)).join(' ');
  }

  function status(ctx) {
    return ctx.invoke('voice_status', {}, 'Read the feedback').then(function () { return state(ctx); }).then(function (s) {
      var month = s.list.filter(function (e) { var d = daysAgo(e.day); return d >= 0 && d < 30; });
      var rated = month.filter(function (e) { return e.rating; });
      var ranked = s.themes.map(function (t) { return { t: t, c: counts(s, t.id) }; }).sort(function (a, b) { return b.c.recent - a.c.recent; });
      var unsorted = s.list.filter(function (e) { return !e.themes.length; }).length;
      return 'In the last 30 days: ' + month.length + ' pieces of feedback' + (rated.length ? ', averaging ' + (Math.round((rated.reduce(function (n, e) { return n + e.rating; }, 0) / rated.length) * 10) / 10) + ' stars' : '') + '. By theme:\n' +
        ranked.map(function (r) {
          return '- **' + r.t.fields.name + '** (' + r.t.fields.kind + '): ' + r.c.recent + (r.c.recent === 1 ? ' mention, ' : ' mentions, ') + trendWords(r.c) + (r.c.latest ? '. Latest: “' + short(r.c.latest.text, 70) + '”' : '');
        }).join('\n') +
        '\n\n' + (ranked[0] && ranked[0].c.recent > ranked[0].c.before ? 'The one to act on is ' + ranked[0].t.fields.name.toLowerCase() + '. ' : '') +
        (unsorted ? unsorted + (unsorted === 1 ? ' new piece isn’t' : ' new pieces aren’t') + ' sorted yet, and ' : '') + owed(s).length + ' reviews still need a reply.';
    });
  }

  function sortNew(ctx) {
    return state(ctx).then(function (s) {
      var unsorted = s.list.filter(function (e) { return !e.themes.length; });
      if (!unsorted.length) return 'Everything is already sorted into themes.';
      var groups = {}, left = [];
      unsorted.forEach(function (e) {
        var t = themeFor(s, e.text, e.rating);
        if (!t) { left.push(e); return; }
        (groups[t.name] = groups[t.name] || { theme: t, items: [] }).items.push(e);
      });
      var names = Object.keys(groups);
      return names.reduce(function (chain, name) {
        var g = groups[name];
        return chain.then(function () {
          return ctx.invoke('tag_feedback', { id: g.items.map(function (e) { return e.id; }).join(', '), themes: name, kind: g.theme.kind }, g.items.map(function (e) { return e.id; }).join(', ') + ': ' + name);
        });
      }, Promise.resolve()).then(function () { return state(ctx); }).then(function (after) {
        var lines = names.map(function (name) {
          var g = groups[name], t = after.themes.find(function (x) { return x.fields.name === name; }), c = t ? counts(after, t.id) : { recent: 0, before: 0 };
          return '- **' + name + '**: ' + g.items.map(function (e) { return '“' + short(e.text, 60) + '” (' + who(e) + ')'; }).join('; ') + '. Now ' + c.recent + ' this month, ' + trendWords(c) + '.';
        });
        return 'Sorted ' + (unsorted.length - left.length) + ' new ' + (unsorted.length - left.length === 1 ? 'piece' : 'pieces') + ':\n' + lines.join('\n') +
          (left.length ? '\n\n' + left.length + ' didn’t fit a theme; tell me what to call it.' : '') +
          (groups['Slow weekend service'] ? '\n\nThat makes the weekend wait the clearest problem on the board.' : '');
      });
    });
  }

  function draftReply(ctx, text) {
    return state(ctx).then(function (s) {
      var e = pickEntry(owed(s), text) || owed(s)[0];
      if (!e) return 'No review is waiting on a reply right now.';
      var t = e.themes[0] ? themeName(s, e.themes[0]) : '';
      var hint = HINTS.find(function (h) { return h.re.test(e.text); });
      var action = s.actions.find(function (a) { return a.status !== 'done' && e.themes.indexOf(a.fields.theme) >= 0; });
      var sorry = /slow|wait/i.test(t) || (hint && hint.key === 'slow') ? 'I’m sorry about the wait; that is far too long.' : /oat|charge/i.test(t) ? 'You’re right to ask about the oat milk charge.' : 'I’m sorry your visit fell short.';
      var reply = (first(e.author) ? first(e.author) + ', thank' : 'Thank') + ' you for telling us. ' + sorry + ' ' +
        (action ? 'We’re ' + gerund(action.fields.title).replace(/^./, function (c) { return c.toLowerCase(); }) + ', so it should be better on your next visit. ' : 'We’re looking at what went wrong. ') +
        'We hope you’ll give us another try.\n\nThe Harbor Street Café team';
      return ctx.invoke('save_reply', { id: e.id, reply: reply }, 'Reply to ' + e.id).then(function () {
        return 'Drafted a reply to ' + reviewName(e) + ':\n\n' + reply + '\n\n' + (action ? 'I mentioned the action already under way, ' + action.fields.title.toLowerCase() + ', and nothing that isn’t on the list. ' : 'I didn’t promise a fix, because no action is on the list yet. ') +
          'It’s saved on the review; post it on ' + (SOURCE_LABEL[e.source] || e.source) + ', then press Mark replied.';
      });
    });
  }

  function markReplied(ctx, text) {
    return state(ctx).then(function (s) {
      var e = pickEntry(owed(s), text);
      if (!e) return 'Which reply did you post? Name the reviewer, like “I posted the reply to Nadia”.';
      return ctx.invoke('save_reply', { id: e.id, posted: true }, e.id + ': replied').then(function () { return state(ctx); }).then(function (after) {
        var left = owed(after);
        return 'Marked ' + reviewName(e) + ' replied. ' + (left.length ? left.length + (left.length === 1 ? ' reply is' : ' replies are') + ' still owed, oldest first: ' + sentence(left.map(function (x) { return x.author || SOURCE_LABEL[x.source]; }).join(', ')) : 'Every review that needs a reply has one.');
      });
    });
  }

  function addAction(ctx, text) {
    return state(ctx).then(function (s) {
      var t = themeFor(s, text, 0);
      if (!t) return 'Which theme is the action for? Say something like “make the oat milk charge an action for Priya”.';
      var owner = (text.match(/\bfor\s+([A-Z][a-z]+)\b/) || [])[1];
      var due = iso(Date.now() + 14 * DAY);
      return ctx.invoke('add_action', { title: t.title, theme: t.name, owner: owner, dueAt: due }, t.title).then(function () { return state(ctx); }).then(function (after) {
        var theme = after.themes.find(function (x) { return x.fields.name === t.name; });
        var c = theme ? counts(after, theme.id) : { recent: 0, before: 0 };
        return 'Added **' + t.title + '**' + (owner ? ' for ' + owner : '') + ', due ' + niceDate(due) + ', against ' + t.name.toLowerCase() + ' (' + c.recent + ' this month, ' + trendWords(c) + '). Its count stays on the board, so you’ll see whether the change lands.';
      });
    });
  }

  function moveAction(ctx, text, status) {
    return state(ctx).then(function (s) {
      var words = text.toLowerCase().match(/[a-z]{4,}/g) || [];
      var best = null, score = 0;
      s.actions.filter(function (a) { return a.status !== 'done'; }).forEach(function (a) {
        var hay = (a.fields.title + ' ' + (a.fields.owner || '') + ' ' + themeName(s, a.fields.theme)).toLowerCase();
        var hits = words.filter(function (w) { return hay.indexOf(w) >= 0; }).length;
        if (hits > score) { best = a; score = hits; }
      });
      if (!best) return 'Which action? Open ones: ' + sentence(s.actions.filter(function (a) { return a.status !== 'done'; }).map(function (a) { return a.fields.title.toLowerCase(); }).join('; ') || 'none');
      return ctx.invoke('set_action_status', { id: best.id, status: status, note: text.trim() }, best.fields.title + ': ' + status).then(function () { return state(ctx); }).then(function (after) {
        var c = best.fields.theme ? counts(after, best.fields.theme) : null;
        return (status === 'done' ? 'Marked **' + best.fields.title + '** done.' : 'Marked **' + best.fields.title + '** under way.') +
          (c ? ' ' + themeName(after, best.fields.theme) + ' has ' + c.recent + (c.recent === 1 ? ' mention' : ' mentions') + ' this month, ' + trendWords(c) + '; I’ll watch whether it settles.' : '');
      });
    });
  }

  function logIt(ctx, text) {
    var words = (text.match(/[“"]([^”"]+)[”"]/) || [])[1];
    if (!words) return Promise.resolve('Paste the customer’s words in quotes and say where it came from, like: log a Google review, “Lovely staff”, 5 stars.');
    words = words.trim().replace(/[,.;]+$/, '') + (/[.!?]$/.test(words.trim()) ? '' : '.');
    var lower = text.toLowerCase();
    var rating = Number((lower.match(/\b([1-5])\s*(?:stars?|of 5|\/5)/) || [])[1]) || undefined;
    var source = /survey/.test(lower) ? 'survey' : /google/.test(lower) ? 'google' : /yelp/.test(lower) ? 'yelp' : /email/.test(lower) ? 'email' : /in person|counter/.test(lower) ? 'in-person' : 'other';
    return state(ctx).then(function (s) {
      var t = themeFor(s, words, rating || 0);
      var input = { text: words, source: source, rating: rating };
      if (t) { input.themes = t.name; input.kind = t.kind; }
      return ctx.invoke('log_feedback', input, short(words, 40)).then(function (out) {
        var id = ((out && out.summary || '').match(/\bfb-\d+/) || [])[0];
        if (!t) return 'Logged it' + (id ? ' as ' + id : '') + '. It doesn’t fit a theme yet; I’ll sort it with the next batch.';
        return state(ctx).then(function (after) {
          var theme = after.themes.find(function (x) { return x.fields.name.toLowerCase() === t.name.toLowerCase(); });
          var c = theme ? counts(after, theme.id) : { recent: 1, before: 0 };
          return 'Logged it' + (id ? ' as ' + id : '') + ' under ' + (t.id ? '**' + t.name + '**' : 'a new theme, **' + t.name + '**') + '. ' +
            (t.id ? 'That makes ' + c.recent + ' this month, ' + trendWords(c) + '.' : 'One mention so far; I’ll flag it if more customers ask.');
        });
      });
    });
  }

  function owedReport(ctx) {
    return ctx.invoke('voice_status', {}, 'Read the feedback').then(function () { return state(ctx); }).then(function (s) {
      var list = owed(s);
      if (!list.length) return 'No replies owed. Every public review of three stars or fewer has one.';
      return list.length + (list.length === 1 ? ' review needs' : ' reviews need') + ' a reply, oldest first:\n' + list.map(function (e) {
        return '- **' + who(e) + '** (' + niceDate(e.day) + '): “' + short(e.text, 110) + '”' + (e.reply ? ', reply drafted, not posted' : '');
      }).join('\n');
    });
  }

  return {
    name: 'Yara',
    role: 'Researcher',
    greeting: 'Hello, I’m Yara. I read everything Harbor Street Café’s customers say. Slow weekend service is the theme on the rise this month, two new reviews aren’t sorted yet, and three still need a reply.',
    suggestions: [
      'What are customers saying this month?',
      'Sort the new reviews into themes',
      'Draft a reply to Carla’s Yelp review',
      'Make the oat milk charge an action for Priya',
      'Log a survey answer: “Wish you opened at 6:30 for commuters,” 4 stars',
    ],
    respond: function (text, ctx) {
      var lower = text.toLowerCase();
      if (/\b(import|csv|spreadsheet|upload)\b/.test(lower)) return 'Add the CSV under **All feedback**, in Import reviews from a spreadsheet. I read every row: the review, and the date, stars, name and source when the columns are there. Rows already in the log are skipped, and the new ones arrive unsorted, ready for me to sort into themes.';
      if (/[“"]/.test(text) && /\b(log|add|survey|review|said|wrote)\b/.test(lower)) return logIt(ctx, text);
      if (/\b(sort|tag|group|categori[sz]e)\b/.test(lower)) return sortNew(ctx);
      if (/\b(posted|replied|sent the reply)\b/.test(lower)) return markReplied(ctx, text);
      if (/\b(draft|reply to|respond to|write back|answer)\b/.test(lower)) return draftReply(ctx, text);
      if (/\b(action|barista|batch)\b/.test(lower) && /\b(done|finished|complete|completed)\b/.test(lower)) return moveAction(ctx, text, 'done');
      if (/\b(action|barista|batch)\b/.test(lower) && /\b(started|under way|underway|doing)\b/.test(lower)) return moveAction(ctx, text, 'doing');
      if (/\b(action|to-?do|assign)\b/.test(lower)) return addAction(ctx, text);
      if (/\b(need|needs|owe|owed)\b.{0,20}\brepl/.test(lower)) return owedReport(ctx);
      if (/\b(saying|say|themes?|trends?|this month|this week|summary|complain|happy)\b/.test(lower)) return status(ctx);
      return null;
    },
    reactions: {
      page_import_reviews: function (input, output) {
        var line = output && output.summary ? output.summary.split('. ')[0] + '.' : 'Imported.';
        return line + ' Ask me to sort the new rows into themes when you’re ready.';
      },
      page_mark_replied: function (input, output) {
        return output && typeof output.repliesNeeded === 'number' ? 'Marked replied. ' + (output.repliesNeeded ? output.repliesNeeded + ' still to go.' : 'That was the last one owed.') : 'Marked replied.';
      },
      page_log_feedback: function (input) {
        return input.themes ? 'Logged under ' + input.themes + '.' : 'Logged. I’ll sort it into a theme with the next batch.';
      },
      page_add_action: function (input) {
        return 'On the list: ' + input.title + '. I’ll keep an eye on whether its theme quiets down.';
      },
      page_set_action_status: function (input, output) {
        return output && output.summary ? output.summary.split('. ')[0] + '.' : 'Updated.';
      },
    },
  };
})();

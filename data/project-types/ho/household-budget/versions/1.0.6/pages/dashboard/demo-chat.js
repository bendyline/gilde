// The standalone demo's sample conversation. In Gezel, the household
// treasurer's replies come from the model the person chooses; here they are
// scripted, and every change goes through the same tools the real crew member
// calls.
window.demoChat = (function () {
  'use strict';
  var SYNONYMS = [
    { category: 'groceries', words: /\b(grocer|supermarket|food shop|market)/ },
    { category: 'eating out', words: /\b(eating out|takeout|take-out|restaurant|dinner out|lunch out|cafe|coffee|pizza|brunch)/ },
    { category: 'transport', words: /\b(transport|gas|fuel|train|bus|subway|parking|taxi|rideshare|toll)/ },
    { category: 'housing', words: /\b(rent|mortgage|housing)/ },
    { category: 'utilities', words: /\b(utilit|electric|power bill|water bill|internet|phone bill|heating)/ },
    { category: 'subscriptions', words: /\b(subscription|streaming|membership)/ },
  ];
  var pending = null;

  function money(cents) {
    var abs = Math.abs(cents);
    var whole = String(Math.floor(abs / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return (cents < 0 ? '-$' : '$') + whole + '.' + String(abs % 100).padStart(2, '0');
  }
  function percent(part, whole) { return whole ? Math.round((part / whole) * 100) : 0; }
  function plural(n, one, many) { return n + ' ' + (n === 1 ? one : many); }
  function words(n) { return ['No', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine'][n] || String(n); }

  function isLeak(e) {
    return e.kind === 'out' && (/subscri/i.test(e.category) || /stream|subscri|membership|storage/i.test(e.note || ''));
  }
  function shape(ctx) {
    return ctx.read('ledger.json').then(function (ledger) {
      var month = new Date().toISOString().slice(0, 7);
      var rows = ((ledger && ledger.entries) || []).filter(function (e) { return typeof e.at === 'string' && e.at.slice(0, 7) === month; });
      var inC = 0, outC = 0, by = {}, names = {};
      rows.forEach(function (e) {
        if (e.kind === 'in') { inC += e.amountCents; return; }
        outC += e.amountCents;
        var key = String(e.category).toLowerCase();
        by[key] = (by[key] || 0) + e.amountCents;
        names[key] = names[key] || String(e.category);
      });
      var cats = Object.keys(by).map(function (key) { return { key: key, name: names[key], cents: by[key] }; })
        .sort(function (a, b) { return b.cents - a.cents; });
      return { rows: rows, inC: inC, outC: outC, net: inC - outC, cats: cats, leaks: rows.filter(isLeak) };
    });
  }
  function find(s, key) { return s.cats.find(function (c) { return c.key === key; }); }

  function parseAmount(text) {
    var match = text.match(/\$?\s*(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d{1,2}))?/);
    if (!match) return null;
    var value = Number(match[1].replace(/,/g, '') + (match[2] ? '.' + match[2] : ''));
    return value > 0 ? value : null;
  }
  // Prefer a category the ledger already uses, then a known synonym.
  function categoryIn(text, s) {
    var lower = text.toLowerCase();
    var known = s.cats.find(function (c) { return new RegExp('\\b' + c.key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).test(lower); });
    if (known) return known.key;
    var hit = SYNONYMS.find(function (entry) { return entry.words.test(lower); });
    return hit ? hit.category : null;
  }
  function noteFrom(text) {
    var match = text.match(/\b(?:for|at)\s+(?:the\s+|a\s+)?([a-z][a-z' -]{2,40})$/i);
    return match ? match[1].replace(/[.!?]+$/, '').trim() : '';
  }
  function capitalize(text) { return text.charAt(0).toUpperCase() + text.slice(1); }

  function observation(s) {
    if (s.leaks.length >= 2) {
      var total = s.leaks.reduce(function (sum, e) { return sum + e.amountCents; }, 0);
      return 'One observation: ' + words(s.leaks.length).toLowerCase() + ' recurring charges add up to ' + money(total) + ' a month.';
    }
    if (s.cats.length) return 'One observation: ' + s.cats[0].key + ' is ' + percent(s.cats[0].cents, s.outC) + '% of what went out.';
    return '';
  }

  function status(ctx) {
    return ctx.invoke('budget_status', {}, 'This month').then(function () { return shape(ctx); }).then(function (s) {
      if (!s.rows.length) return 'Nothing is in the ledger for this month yet. Tell me the first receipt and I’ll start it.';
      var top = s.cats.slice(0, 3).map(function (c) { return c.key + ' ' + money(c.cents); }).join(', ');
      return [
        '**In ' + money(s.inC) + ', out ' + money(s.outC) + ', net ' + money(s.net) + '.**',
        top ? 'Biggest: ' + top + '.' : 'Nothing has gone out yet this month.',
        observation(s),
      ].filter(Boolean).join('\n\n');
    });
  }

  function recordExpense(ctx, amount, key, note) {
    var input = { amount: amount, category: key };
    if (note) input.note = capitalize(note);
    return ctx.invoke('add_expense', input, capitalize(key) + ' · ' + money(Math.round(amount * 100))).then(function () {
      return shape(ctx);
    }).then(function (s) {
      var cat = find(s, key);
      return 'Recorded **' + money(Math.round(amount * 100)) + '** on ' + key + '. ' +
        (cat ? capitalize(key) + ' is ' + money(cat.cents) + ' this month, ' + percent(cat.cents, s.outC) + '% of what went out. ' : '') +
        'Net is now ' + money(s.net) + '.';
    });
  }

  function expense(ctx, text, amount) {
    return shape(ctx).then(function (s) {
      var key = categoryIn(text, s);
      if (!key) {
        if (!/\b(on|for|spent|spend|paid|bought|cost|log|add|record)\b/i.test(text)) return null;
        pending = { amount: amount, note: noteFrom(text) };
        var options = s.cats.slice(0, 3).map(function (c) { return c.key; });
        return 'Got it, ' + money(Math.round(amount * 100)) + '. Which category does it belong to' +
          (options.length ? ': ' + options.join(', ') + ', or something else?' : '?');
      }
      return recordExpense(ctx, amount, key, noteFrom(text));
    });
  }

  function income(ctx, text, amount) {
    if (!amount) return 'Glad to hear it. How much came in? Something like “salary landed, 2,600” is plenty.';
    var lower = text.toLowerCase();
    var note = /freelance/.test(lower) ? 'Freelance payment' : /refund/.test(lower) ? 'Refund' : /salary|paycheck|pay\b/.test(lower) ? 'Paycheck' : '';
    var input = { amount: amount, category: 'income' };
    if (note) input.note = note;
    return ctx.invoke('add_income', input, 'Income · ' + money(Math.round(amount * 100))).then(function () {
      return shape(ctx);
    }).then(function (s) {
      return 'Recorded **' + money(Math.round(amount * 100)) + '** coming in. In is ' + money(s.inC) +
        ' this month, and net is ' + money(s.net) + '.';
    });
  }

  function leaks(ctx) {
    return shape(ctx).then(function (s) {
      if (!s.leaks.length) {
        return 'No recurring charges stand out this month.' + (s.cats.length ? ' The largest category is ' + s.cats[0].key + ' at ' + money(s.cats[0].cents) + '.' : '');
      }
      var rows = s.leaks.slice().sort(function (a, b) { return b.amountCents - a.amountCents; });
      var total = rows.reduce(function (sum, e) { return sum + e.amountCents; }, 0);
      var video = rows.filter(function (e) { return /video/i.test(e.note || ''); }).length;
      return [
        words(rows.length) + ' recurring ' + (rows.length === 1 ? 'charge' : 'charges') + ' this month, ' + money(total) + ' together:',
        rows.map(function (e) { return '- ' + (e.note || e.category) + ' ' + money(e.amountCents); }).join('\n'),
        (video >= 2 ? words(video) + ' of them are video streaming. ' : '') +
          'That’s an observation, not a verdict. In Gezel, the subscription audit walks through each one with you.',
      ].join('\n\n');
    });
  }

  function categoryTotal(ctx, text) {
    return shape(ctx).then(function (s) {
      var key = categoryIn(text, s);
      if (!key) return null;
      var cat = find(s, key);
      if (!cat) return 'Nothing has gone to ' + key + ' this month.';
      var count = s.rows.filter(function (e) { return e.kind === 'out' && String(e.category).toLowerCase() === key; }).length;
      return capitalize(key) + ' is **' + money(cat.cents) + '** this month across ' + plural(count, 'entry', 'entries') +
        ', ' + percent(cat.cents, s.outC) + '% of what went out.';
    });
  }

  return {
    name: 'Ruben',
    role: 'Household Treasurer',
    greeting: 'Hello, I’m Ruben. I keep the ledger honest, no lecture attached. This month is in the black so far, and a few small subscriptions are quietly adding up.',
    suggestions: [
      'How does the month look?',
      'Log 64.30 on groceries',
      'My freelance payment of 650 came in',
      'We spent 48 on takeout last night',
      'Any quiet leaks this month?',
    ],
    respond: function (text, ctx) {
      var lower = text.toLowerCase();
      var amount = parseAmount(text);
      if (pending) {
        var held = pending;
        pending = null;
        if (!amount && text.trim().split(/\s+/).length <= 4) {
          return shape(ctx).then(function (s) {
            var key = categoryIn(text, s) || text.trim().replace(/[.!?]+$/, '').replace(/^(under|in|as|it'?s|its)\s+/i, '').toLowerCase();
            return recordExpense(ctx, held.amount, key, held.note);
          });
        }
      }
      if (/\b(leak|subscription|recurring|streaming)/.test(lower) && !amount) return leaks(ctx);
      if (/\b(came in|landed|arrived|got paid|income|salary|paycheck|refund|deposit|earned)\b/.test(lower)) return income(ctx, text, amount);
      if (amount) return expense(ctx, text, amount);
      if (!amount && /\b(how much|what did we spend|spent on|spend on|went to|going to)\b/.test(lower)) {
        return categoryTotal(ctx, text).then(function (reply) { return reply || status(ctx); });
      }
      if (/\b(month|status|how are we|how do we stand|net|overview|look|shape|doing)\b/.test(lower)) return status(ctx);
      return null;
    },
    reactions: {
      record_expense: function (input, output, ctx) {
        var key = String(input.category || '').toLowerCase();
        return shape(ctx).then(function (s) {
          var cat = find(s, key);
          return 'In the ledger. ' + (cat ? capitalize(key) + ' is ' + money(cat.cents) + ' this month; ' : '') + 'out is now ' + money(s.outC) + '.';
        });
      },
      page_add_income: function (input, output, ctx) {
        return shape(ctx).then(function (s) {
          return 'Recorded ' + money(Math.round(Number(input.amount) * 100)) + ' coming in. In is ' + money(s.inC) + ' this month, and net is ' + money(s.net) + '.';
        });
      },
    },
  };
})();

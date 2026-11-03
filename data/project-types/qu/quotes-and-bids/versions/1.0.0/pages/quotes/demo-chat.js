// The standalone demo's sample conversation. In Gezel, the estimator's
// replies come from the model the person chooses; here they are scripted,
// and every change goes through the same tools the crew calls, so every
// amount and total comes from the quote store's own arithmetic.
window.demoChat = (function () {
  'use strict';
  var DAY = 86400000;
  var WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

  function pad(n) { return n < 10 ? '0' + n : String(n); }
  function iso(ms) { var d = new Date(ms); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function daysLeft(day) { return Math.round((Date.parse(String(day).slice(0, 10) + 'T00:00:00') - Date.parse(iso(Date.now()) + 'T00:00:00')) / DAY); }
  function when(days) { return days < 0 ? -days + (days === -1 ? ' day late' : ' days late') : days === 0 ? 'today' : days === 1 ? 'tomorrow' : 'in ' + days + ' days'; }
  function niceDate(day) { return new Date(String(day).slice(0, 10) + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }); }
  function money(cents) {
    var n = Math.round(Number(cents) || 0), abs = Math.abs(n);
    return (n < 0 ? '-$' : '$') + String(Math.floor(abs / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, ',') + '.' + pad(abs % 100);
  }
  function fold(text) { return String(text || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase(); }
  function cap(text) { return text.charAt(0).toUpperCase() + text.slice(1); }
  function isOpen(r) { return r.status === 'draft' || r.status === 'sent'; }
  function total(r) { return Number(r.fields.totalCents) || 0; }
  function unitText(qty, unit) { return qty + ' ' + (qty === 1 || unit === 'each' || unit === 'lot' ? unit : unit === 'foot' ? 'feet' : unit + 's'); }
  function lineText(l) { return l.description + ', ' + unitText(l.qty, l.unit) + ' × ' + money(l.rateCents) + ' = ' + money(l.amountCents); }
  function taxText(r) { var bp = Number(r.fields.taxBp) || 0; return bp ? (bp / 100).toFixed(2).replace(/\.?0+$/, '') + '% on ' + (r.fields.taxOn === 'all' ? 'the whole quote' : 'materials') : 'no tax set'; }

  function state(ctx) {
    return Promise.all([ctx.read('quotes.json'), ctx.read('rates.json')]).then(function (v) {
      return { records: (v[0] && v[0].records) || [], rates: (v[1] && v[1].rates) || [] };
    });
  }
  // The quote the person means: the one whose title and client share the most words with what they wrote.
  function find(s, text, onlyOpen) {
    var words = fold(text).match(/[a-z]{4,}/g) || [];
    var best = null, score = 0;
    s.records.forEach(function (r) {
      if (onlyOpen && !isOpen(r)) return;
      var name = fold(r.fields.title + ' ' + (r.fields.client || ''));
      var hits = words.filter(function (w) { return name.indexOf(w) >= 0 || name.indexOf(w.replace(/s$/, '')) >= 0; }).length;
      if (hits > score) { best = r; score = hits; }
    });
    return best;
  }
  function savedRate(s, text) {
    var t = fold(text);
    return s.rates.filter(function (r) { var n = fold(r.name); return t.indexOf(n) >= 0 || n.indexOf(t.trim()) >= 0 && t.trim().length > 3; })[0] || null;
  }
  function dollars(text) { var m = text.match(/\$\s?([\d,]+(?:\.\d{1,2})?)/); return m ? Number(m[1].replace(/,/g, '')) : null; }
  function dateIn(text) {
    var lower = text.toLowerCase(), m = lower.match(/\b(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/);
    if (m) { var d = new Date(); d.setHours(12, 0, 0, 0); d.setDate(d.getDate() + (((WEEKDAYS.indexOf(m[1]) - d.getDay() + 7) % 7) || 7)); return iso(d.getTime()); }
    if (/\btomorrow\b/.test(lower)) return iso(Date.now() + DAY);
    if (/\bnext week\b/.test(lower)) return iso(Date.now() + 7 * DAY);
    return null;
  }
  // One spoken item ('10 hours electrician', '200A panel $1,850', 'permit $185') as a quote line.
  function item(s, words) {
    var hours = words.match(/^(\d+(?:\.\d+)?)\s*(?:hours?|hrs?)\s+(?:of\s+)?(.+)$/i);
    if (hours) {
      var who = hours[2].replace(/\s+(?:labor|time|work)$/i, '').trim(), rate = savedRate(s, who);
      var labor = { description: cap(rate ? rate.name : who) + ' labor', kind: 'labor', qty: Number(hours[1]), unit: 'hour' };
      if (rate) labor.rateName = rate.name;
      return labor;
    }
    var price = dollars(words);
    var count = words.match(/^(\d+)\s*x?\s+/i);
    var name = words.replace(/\$\s?[\d,]+(?:\.\d{1,2})?/, '').replace(/^(\d+)\s*x?\s+/i, '').replace(/\s+(?:at|for|@)\s*$/i, '').trim();
    var saved = savedRate(s, name);
    var line = { description: cap(saved ? saved.name : name), kind: saved ? saved.kind : /permit|fee|inspection|haul|disposal|dumpster/i.test(name) ? 'other' : 'materials', qty: count ? Number(count[1]) : 1, unit: saved ? saved.unit : 'each' };
    if (price !== null) line.rate = price;
    else if (saved) line.rateName = saved.name;
    else return null;
    return line;
  }
  function totalsReply(r) {
    var f = r.fields;
    return 'Subtotal ' + money(f.subtotalCents) + ', tax ' + money(f.taxCents) + ' (' + taxText(r) + '), **total ' + money(f.totalCents) + '**.';
  }

  function followUps(ctx) {
    return ctx.invoke('quotes_status', {}, 'Quotes and follow-ups').then(function () { return state(ctx); }).then(function (s) {
      var due = s.records.filter(function (r) { return r.status === 'sent' && r.fields.followUpAt && daysLeft(r.fields.followUpAt) <= 7; })
        .sort(function (a, b) { return String(a.fields.followUpAt).localeCompare(String(b.fields.followUpAt)); });
      var drafts = s.records.filter(function (r) { return r.status === 'draft'; });
      if (!due.length) return 'Nothing needs a follow-up this week.' + (drafts.length ? ' ' + drafts.map(function (r) { return r.fields.title; }).join(' and ') + ' is still a draft.' : '');
      return 'These need a call, the late one first:\n' + due.map(function (r) {
        var notes = (r.history || []).filter(function (h) { return h.note && !/^Sent to the client/.test(h.note); });
        return '- **' + r.fields.title + '**, ' + when(daysLeft(r.fields.followUpAt)) + ' (' + money(total(r)) + (r.fields.contact ? ', ' + r.fields.contact : '') + ', sent ' + when(daysLeft(r.fields.sentAt)).replace('late', 'ago') + ')' +
          (notes.length ? '. Last note: ' + notes[notes.length - 1].note.replace(/\.$/, '') + '.' : '');
      }).join('\n') + (drafts.length ? '\n\n' + drafts.map(function (r) { return r.fields.title; }).join(' and ') + (drafts.length === 1 ? ' is' : ' are') + ' still a draft, not sent.' : '');
    });
  }

  function addHours(ctx, text) {
    return state(ctx).then(function (s) {
      var r = find(s, text, true);
      if (!r) return 'Which quote should that go on? Name the job, like “the Juniper Press quote”.';
      var qty = Number((text.match(/(\d+(?:\.\d+)?)/) || [])[1]);
      var what = (text.match(/\d+(?:\.\d+)?\s+(?:more\s+|extra\s+)?(.+?)\s+(?:to|on)\s+the\b/i) || [])[1] || '';
      if (!qty || !what) return 'Tell me the amount and the item, like “add 6 more electrician hours to the Juniper Press quote”.';
      var hours = /\bhours?\b|\bhrs?\b/i.test(what), who = what.replace(/\b(?:hours?|hrs?|of)\b/gi, '').trim();
      var rate = savedRate(s, who);
      var existing = (r.fields.lines || []).filter(function (l) { return fold(l.description).indexOf(fold(rate ? rate.name : who)) >= 0; })[0];
      var input = { id: r.id };
      if (existing) { input.description = existing.description; input.addQty = qty; }
      else if (hours && rate) { input.description = rate.name + ' labor'; input.rateName = rate.name; input.qty = qty; input.kind = 'labor'; input.unit = 'hour'; }
      else return 'What does ' + who + ' cost per unit? Give me a price, like “' + who + ' at $40 each”.';
      var before = total(r);
      return ctx.invoke('add_quote_line', input, (existing ? existing.description + ' + ' : input.description + ' × ') + qty).then(function () { return state(ctx); }).then(function (after) {
        var now = after.records.find(function (x) { return x.id === r.id; });
        var l = now.fields.lines.find(function (x) { return fold(x.description) === fold(input.description); });
        return (existing
          ? 'Added ' + unitText(qty, l.unit) + ' to ' + l.description + ' on **' + now.fields.title + '**: now ' + unitText(l.qty, l.unit) + ' × ' + money(l.rateCents) + ' = ' + money(l.amountCents)
          : 'Added a line to **' + now.fields.title + '**: ' + lineText(l)) + '.\n\n' +
          totalsReply(now) + ' That’s ' + money(total(now) - before) + ' more than before' + (l.kind === 'labor' && now.fields.taxOn !== 'all' ? ', with no change to the tax, since tax applies to materials only' : '') + '.';
      });
    });
  }

  function sendIt(ctx, text) {
    return state(ctx).then(function (s) {
      var r = find(s, text, true);
      if (!r) return 'Which quote went out? Name the job, like “send the Juniper Press quote”.';
      return ctx.invoke('send_quote', { id: r.id }, r.fields.title + ': sent').then(function () { return state(ctx); }).then(function (after) {
        var now = after.records.find(function (x) { return x.id === r.id; });
        return 'Marked **' + now.fields.title + '** sent: ' + money(total(now)) + ', valid until ' + niceDate(now.fields.validUntil) + '. ' +
          'The first follow-up is ' + niceDate(now.fields.followUpAt) + ', and Gezel will remind you that morning. ' +
          'In Gezel, with DocBlocks installed, I can also turn it into a PDF for you to attach.';
      });
    });
  }

  function decided(ctx, text) {
    return state(ctx).then(function (s) {
      var r = find(s, text, true);
      if (!r) return 'Which quote was that? Name the job, like “we won the café kitchen rewire”.';
      var lost = /\b(lost|went with|chose|said no|turned us down|passed)\b/i.test(text);
      var reason = lost ? ((text.match(/\b((?:went with|because|chose) .+)$/i) || [])[1] || '') : '';
      var input = { id: r.id, outcome: lost ? 'lost' : 'won' };
      if (reason) input.note = cap(reason.replace(/[.\s]+$/, ''));
      return ctx.invoke('record_quote_outcome', input, r.fields.title + ': ' + input.outcome).then(function () { return state(ctx); }).then(function (after) {
        var won = after.records.filter(function (x) { return x.status === 'won'; }).length;
        var decidedCount = after.records.filter(function (x) { return x.status === 'won' || x.status === 'lost'; }).length;
        var rate = 'That makes ' + won + ' won of ' + decidedCount + ' decided (' + Math.round((won / decidedCount) * 100) + '%).';
        return lost
          ? 'Recorded **' + r.fields.title + '** as lost' + (input.note ? ': ' + input.note.toLowerCase() : '') + '. ' + rate + ' If price was the reason, it may be worth comparing your labor hours on the next bid like it.'
          : 'Congratulations: **' + r.fields.title + '** is won, ' + money(total(r)) + '. ' + rate + ' When the work is done, the Invoice Generator plan can turn these same lines into an invoice.';
      });
    });
  }

  function priceJob(ctx, text) {
    var m = text.match(/\b(?:price|quote)\s+(?:a|an|the)\s+(.+?)\s+for\s+(.+?):\s*(.+)$/i);
    if (!m) return Promise.resolve('Give me the job, the client and the items, like “price a panel upgrade for Maple Row: 200A panel $1,850, 10 hours electrician, permit $185”.');
    var job = m[1].trim(), client = m[2].trim(), title = client + ' ' + job;
    return state(ctx).then(function (s) {
      var lines = m[3].split(/,\s+|\s+and\s+/).map(function (w) { return item(s, w.trim()); });
      if (lines.some(function (l) { return !l; })) return 'I need a price for each item, like “200A panel $1,850”, or hours for a saved rate, like “10 hours electrician”.';
      var chain = ctx.invoke('start_quote', { title: title, client: client }, title);
      var id = null;
      chain = chain.then(function () { return state(ctx); }).then(function (after) { id = after.records.find(function (x) { return fold(x.fields.title) === fold(title); }).id; });
      lines.forEach(function (l) {
        chain = chain.then(function () { return ctx.invoke('add_quote_line', Object.assign({ id: id }, l), l.description + (l.qty !== 1 ? ' × ' + l.qty : '')); });
      });
      return chain.then(function () { return state(ctx); }).then(function (after) {
        var r = after.records.find(function (x) { return x.id === id; });
        return 'Started **' + r.fields.title + '** and priced it:\n' + r.fields.lines.map(function (l) { return '- ' + lineText(l); }).join('\n') + '\n\n' +
          totalsReply(r) + ' It’s a draft; tell me what to change, or say “send it” when it’s ready.';
      });
    });
  }

  function logFollow(ctx, text) {
    return state(ctx).then(function (s) {
      var r = find({ records: s.records.filter(function (x) { return x.status === 'sent'; }) }, text);
      if (!r) return 'Which sent quote was that about? Name the client, like “left a voicemail with Mei at Fernwood”.';
      var next = dateIn(text), input = { id: r.id, note: cap(text.replace(/\s+/g, ' ').trim().replace(/[.\s]+$/, '')) + '.' };
      if (next) input.followUpAt = next;
      return ctx.invoke('log_quote_follow_up', input, r.fields.title + ': follow-up').then(function () { return state(ctx); }).then(function (after) {
        var now = after.records.find(function (x) { return x.id === r.id; });
        return 'Logged it on **' + now.fields.title + '**. Next follow-up: ' + niceDate(now.fields.followUpAt) + '.';
      });
    });
  }

  function showTotal(ctx, text) {
    return state(ctx).then(function (s) {
      var r = find(s, text);
      if (!r) return 'Which quote? Name the job or the client.';
      return ctx.invoke('show_quote', { id: r.id }, r.fields.title).then(function () {
        return '**' + r.fields.title + '** (' + r.status + '):\n' + r.fields.lines.map(function (l) { return '- ' + lineText(l); }).join('\n') + '\n\n' + totalsReply(r);
      });
    });
  }

  function saveRate(ctx, text) {
    var m = text.match(/\b(?:our\s+)?([a-z][a-z ]+?)\s+rate\s+(?:is|to)\s+(?:now\s+)?\$\s?([\d,]+(?:\.\d{1,2})?)/i);
    if (!m) return Promise.resolve('Tell me the rate and the price, like “our electrician rate is now $98 an hour”.');
    var name = cap(m[1].trim()), price = Number(m[2].replace(/,/g, ''));
    return ctx.invoke('save_rate', { name: name, kind: 'labor', unit: 'hour', rate: price }, name + ' ' + money(price * 100) + '/hour').then(function () {
      return 'Saved: ' + name + ' at ' + money(price * 100) + ' an hour. Lines already on quotes keep the price they were given; new ' + name.toLowerCase() + ' lines use this one.';
    });
  }

  function setTax(ctx, text) {
    var pct = Number((text.match(/(\d+(?:\.\d+)?)\s*%/) || [])[1]);
    var on = /\b(everything|whole|all|labor too|total)\b/i.test(text) ? 'all' : 'materials';
    return ctx.invoke('set_quote_terms', { taxRate: pct, taxOn: on }, 'Sales tax ' + pct + '%').then(function () {
      return 'Sales tax is now ' + pct + '% on ' + (on === 'all' ? 'the whole quote' : 'materials') + '. Draft quotes are re-totaled; quotes already sent keep the tax they went out with. ' +
        'Which work is taxable is worth confirming with your accountant or the state revenue department.';
    });
  }

  function winRate(ctx) {
    return ctx.invoke('quotes_status', {}, 'Win and loss record').then(function () { return state(ctx); }).then(function (s) {
      var won = s.records.filter(function (r) { return r.status === 'won'; }), lost = s.records.filter(function (r) { return r.status === 'lost'; });
      var sum = function (list) { return list.reduce(function (t, r) { return t + total(r); }, 0); };
      if (!won.length && !lost.length) return 'Nothing is decided yet.';
      return 'You’ve won ' + won.length + ' of ' + (won.length + lost.length) + ' decided quotes (' + Math.round((won.length / (won.length + lost.length)) * 100) + '%), ' + money(sum(won)) + ' of ' + money(sum(won) + sum(lost)) + ' by value.' +
        (lost.length ? ' Lost: ' + lost.map(function (r) { return r.fields.title + (r.fields.reason ? ' (' + r.fields.reason.toLowerCase() + ')' : ''); }).join(', ') + '.' : '');
    });
  }

  return {
    name: 'Teun',
    role: 'Estimator',
    greeting: 'Hello, I’m Teun. I price Brightline Electric’s jobs and keep the quotes moving. Fernwood’s follow-up is 2 days late, the café quote is due a call today, and Juniper Press is still a draft.',
    suggestions: [
      'Which quotes need a follow-up?',
      'Add 6 more electrician hours to the Juniper Press quote',
      'Send the Juniper Press quote',
      'We won the café kitchen rewire',
      'Price a panel upgrade for Maple Row: 200A panel $1,850, 10 hours electrician, permit $185',
    ],
    respond: function (text, ctx) {
      var lower = text.toLowerCase();
      if (/\b(?:price|quote)\s+(?:a|an|the)\b.*\bfor\b.*:/.test(lower)) return priceJob(ctx, text);
      if (/\b(we won|won the|signed|we lost|lost the|went with|turned us down)\b/.test(lower)) return decided(ctx, text);
      if (/\bwin rate\b|\bhow many\b.*\b(won|lost)\b/.test(lower)) return winRate(ctx);
      if (/\btax\b/.test(lower) && /\d\s*%/.test(lower)) return setTax(ctx, text);
      if (/\brate\b/.test(lower) && /\$\s?\d/.test(lower)) return saveRate(ctx, text);
      if (/\b(add|more|another|extra)\b/.test(lower) && /\d/.test(lower)) return addHours(ctx, text);
      if (/\b(send|mark sent|sent it|mail)\b/.test(lower)) return sendIt(ctx, text);
      if (/\b(followed up|called|voicemail|emailed|spoke|talked)\b/.test(lower)) return logFollow(ctx, text);
      if (/\b(follow|chase|need a call|waiting)\b/.test(lower)) return followUps(ctx);
      if (/\b(total|how much|price|cost|show)\b/.test(lower)) return showTotal(ctx, text);
      return null;
    },
    reactions: {
      page_record_quote_outcome: function (input, output) {
        return output && output.summary
          ? output.summary.split('. ')[0] + '. ' + (input.outcome === 'won' ? 'When the work is done, I can turn it into an invoice.' : 'The reason goes on the record for the next bid.')
          : 'Recorded.';
      },
      page_add_quote_line: function (input, output) {
        return output && output.total ? 'Added. The quote now totals ' + money(Math.round(output.total * 100)) + ', tax included.' : 'Added.';
      },
      page_send_quote: function (input, output) {
        return output && output.summary ? output.summary.split('. ').slice(0, 2).join('. ') + '. I’ll keep the follow-up on the list.' : 'Marked sent.';
      },
    },
  };
})();

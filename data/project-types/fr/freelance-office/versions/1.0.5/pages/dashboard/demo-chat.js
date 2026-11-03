// The standalone demo's sample conversation. In Gezel, the office
// administrator's replies come from the model the person chooses; here they
// are scripted, and every change goes through the same tools the real crew
// member calls. Money stays in whole cents from input to reply.
window.demoChat = (function () {
  'use strict';
  var DAY = 86400000;
  var WORDS = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];

  function word(n) { return n >= 0 && n < WORDS.length ? WORDS[n] : String(n); }
  function plural(n, one) { return word(n) + ' ' + (n === 1 ? one : one + 's'); }
  function money(cents) {
    var abs = Math.abs(cents);
    return (cents < 0 ? '-' : '') + String(Math.floor(abs / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, ',') + '.' + String(abs % 100).padStart(2, '0');
  }
  function day(iso) { return String(iso || '').slice(0, 10); }
  function client(r) { return String((r.fields && r.fields.client) || r.id); }
  function cents(r) { return (r.fields && r.fields.amountCents) || 0; }
  function dueMs(r) { var t = r.fields && r.fields.dueAt ? Date.parse(r.fields.dueAt) : NaN; return isFinite(t) ? t : NaN; }
  function daysLate(r) { return Math.floor((Date.now() - dueMs(r)) / DAY); }
  function sum(list) { return list.reduce(function (n, r) { return n + cents(r); }, 0); }

  function book(ctx) {
    return ctx.read('invoices.json').then(function (doc) {
      var records = (doc && Array.isArray(doc.records)) ? doc.records : [];
      var now = Date.now(), month = new Date(now).toISOString().slice(0, 7);
      var sent = records.filter(function (r) { return r.status === 'sent'; });
      return {
        records: records,
        drafts: records.filter(function (r) { return r.status === 'draft'; }),
        sent: sent,
        overdue: sent.filter(function (r) { return dueMs(r) < now; }).sort(function (a, b) { return dueMs(a) - dueMs(b); }),
        paidMonth: records.filter(function (r) { return r.status === 'paid' && String(r.updatedAt).slice(0, 7) === month; }),
      };
    });
  }

  // A client named in the text: the full name, or its first word ("Canal" for Canal House).
  function clientIn(text, records) {
    var lower = text.toLowerCase();
    var names = [];
    records.forEach(function (r) { if (names.indexOf(client(r)) < 0) names.push(client(r)); });
    return names.find(function (n) { return lower.indexOf(n.toLowerCase()) >= 0; }) ||
      names.find(function (n) { var first = n.toLowerCase().split(/\s+/)[0]; return first.length > 3 && new RegExp('\\b' + first.replace(/[^a-z0-9]/g, '') + '\\b').test(lower); }) || '';
  }
  function invoiceIn(text, records, prefer) {
    var id = text.toLowerCase().match(/\binv-?(\d+)\b/);
    if (id) return records.find(function (r) { return r.id === 'inv-' + id[1]; }) || null;
    var name = clientIn(text, records);
    var mine = records.filter(function (r) { return name && client(r) === name; });
    for (var i = 0; i < prefer.length; i++) {
      var hit = mine.filter(function (r) { return r.status === prefer[i]; });
      if (hit.length) return hit[hit.length - 1];
    }
    return null;
  }

  // "1,250", "1250.50", "2.4k" → whole cents, without floating-point drift.
  function centsOf(raw, k) {
    var parts = String(raw).replace(/,/g, '').split('.');
    var whole = Number(parts[0] || 0), frac = parts[1] ? Number((parts[1] + '0').slice(0, 2)) : 0;
    var value = whole * 100 + frac;
    return k ? value * 1000 : value;
  }
  function billIn(text) {
    var clean = text.replace(/\binv-?\d+\b/gi, '');
    var hours = clean.match(/(\d+(?:\.\d+)?)\s*(?:hours?|hrs?|h)\b\s*(?:at|@|x|×)\s*(\d[\d,]*(?:\.\d{1,2})?)/i);
    if (hours) {
      var rate = centsOf(hours[2]), h = Number(hours[1]);
      return { cents: Math.round(h * rate), hours: h, rateCents: rate };
    }
    var amount = clean.match(/(\d{1,3}(?:,\d{3})+|\d+)(\.\d{1,2})?\s*(k)?\b/i);
    if (!amount) return null;
    return { cents: centsOf(amount[1] + (amount[2] || ''), !!amount[3]) };
  }
  function billClient(text, records) {
    var known = clientIn(text, records);
    if (known) return known;
    var m = text.match(/\b(?:bill|invoice|charge)\s+(.+?)(?=\s+(?:for|\d)|\s*$)/i);
    return m ? m[1].replace(/^(the|my)\s+/i, '').trim() : '';
  }
  function noteIn(text, bill) {
    if (bill.hours) return bill.hours + ' hours at ' + money(bill.rateCents);
    var m = text.match(/\bfor\s+(?:the\s+|a\s+|an\s+)?([a-z][^.,!?]*)$/i);
    return m ? m[1].charAt(0).toUpperCase() + m[1].slice(1) : '';
  }

  function picture(ctx) {
    return ctx.invoke('office_status', {}, 'Outstanding, overdue, paid this month').then(function () { return book(ctx); }).then(function (b) {
      if (!b.records.length) return 'The book is empty. Tell me when you bill something and I’ll record it.';
      var lines = [
        '- Outstanding: **' + money(sum(b.sent)) + '** across ' + plural(b.sent.length, 'sent invoice'),
        '- Overdue: ' + (b.overdue.length
          ? b.overdue.map(function (r) { return client(r) + ', ' + money(cents(r)) + ', ' + plural(daysLate(r), 'day') + ' late'; }).join('; ')
          : 'nothing'),
        '- Paid this month: **' + money(sum(b.paidMonth)) + '**',
      ];
      if (b.drafts.length) lines.push('- In draft, not sent yet: ' + money(sum(b.drafts)) + ' (' + b.drafts.map(client).join(', ') + ')');
      var next = b.overdue.length
        ? 'The one thing to chase next: ' + client(b.overdue[0]) + '. Want me to draft the note?'
        : b.drafts.length ? 'Nothing is late. The one thing to do next: send the ' + client(b.drafts[0]) + ' invoice.'
          : 'Nothing is late and nothing is waiting to go out. A calm week.';
      return 'Here’s the picture:\n\n' + lines.join('\n') + '\n\n' + next;
    });
  }

  function chase(ctx, text) {
    return ctx.invoke('list_invoices', {}, 'Reading the invoice book').then(function () { return book(ctx); }).then(function (b) {
      var named = clientIn(text, b.records);
      var target = named ? b.sent.filter(function (r) { return client(r) === named; })[0] : b.overdue[0];
      if (!target) {
        if (named) return 'Nothing from ' + named + ' is waiting on payment, so there’s nothing to chase.';
        var upcoming = b.sent.filter(function (r) { return isFinite(dueMs(r)); }).sort(function (a, c) { return dueMs(a) - dueMs(c); })[0];
        return 'Nothing is overdue right now.' + (upcoming ? ' The next one due is ' + client(upcoming) + ', ' + money(cents(upcoming)) + ', on ' + day(upcoming.fields.dueAt) + '.' : '');
      }
      var late = isFinite(dueMs(target)) && dueMs(target) < Date.now();
      var what = target.fields.note ? ' (' + String(target.fields.note).toLowerCase() + ')' : '';
      var due = isFinite(dueMs(target)) ? day(target.fields.dueAt) : '';
      return [
        (late ? 'Here’s a first nudge for ' + client(target) + ', ' + plural(daysLate(target), 'day') + ' past due.' : client(target) + ' isn’t late yet' + (due ? ' (due ' + due + ')' : '') + ', so this one is a friendly heads-up.') +
          ' Friendly and firm; you send it.',
        '**Subject:** Invoice ' + target.id + ', ' + money(cents(target)) + (due ? ', due ' + due : '') + '\n\n' +
          'Hi ' + client(target) + ' team,\n\n' +
          (late
            ? 'A quick reminder that invoice ' + target.id + ' for ' + money(cents(target)) + what + ' was due on ' + due + '. Could you let me know when it’s scheduled for payment? If it’s already on its way, thank you, and please disregard this note.'
            : 'Invoice ' + target.id + ' for ' + money(cents(target)) + what + ' comes due' + (due ? ' on ' + due : ' soon') + '. Just checking it reached the right person; let me know if you need anything from me.') +
          '\n\nBest regards,\n[Your name]',
        late ? 'If it’s still quiet next week, ask me for a firmer second note.' : '',
      ].filter(Boolean);
    });
  }

  function markPaid(ctx, text) {
    return book(ctx).then(function (b) {
      var r = invoiceIn(text, b.records, ['sent', 'draft']);
      if (!r) {
        var name = clientIn(text, b.records);
        if (name) return name + '’s invoices are already marked paid.';
        if (b.sent.length === 1) r = b.sent[0];
        else return 'Which invoice? Name the client, like “Canal House paid”.';
      }
      var wasOverdue = b.overdue.indexOf(r) >= 0;
      return ctx.invoke('invoice_paid', { id: r.id }, r.id + ', ' + client(r) + ', ' + money(cents(r))).then(function () { return book(ctx); }).then(function (after) {
        return 'Marked paid: ' + r.id + ', ' + client(r) + ', **' + money(cents(r)) + '**.' + (wasOverdue ? ' That clears the late one, and asking was the right call.' : '') +
          '\n\nOutstanding is now ' + money(sum(after.sent)) + ' across ' + plural(after.sent.length, 'invoice') +
          (after.overdue.length ? ', ' + word(after.overdue.length) + ' of them overdue' : ', none of it overdue') +
          '. Paid this month comes to ' + money(sum(after.paidMonth)) + '.';
      });
    });
  }

  function markSent(ctx, text) {
    return book(ctx).then(function (b) {
      var r = invoiceIn(text, b.records, ['draft']);
      if (!r && !clientIn(text, b.records) && b.drafts.length === 1) r = b.drafts[0];
      if (!r) {
        var name = clientIn(text, b.records);
        if (name) return 'There’s no draft for ' + name + ' to send. Tell me the amount and I’ll record one.';
        return b.drafts.length ? 'Which one went out? In draft: ' + b.drafts.map(function (d) { return client(d) + ' (' + money(cents(d)) + ')'; }).join(', ') + '.' : 'There’s nothing in draft to send.';
      }
      return ctx.invoke('invoice_sent', { id: r.id }, r.id + ', ' + client(r) + ', ' + money(cents(r))).then(function () { return book(ctx); }).then(function (after) {
        var due = isFinite(dueMs(r)) ? ' It’s due ' + day(r.fields.dueAt) + '.' : ' It has no due date on it, so it can’t go overdue on paper.';
        return 'Sent: ' + r.id + ' to ' + client(r) + ', **' + money(cents(r)) + '**.' + due +
          '\n\nOutstanding is now ' + money(sum(after.sent)) + ' across ' + plural(after.sent.length, 'invoice') + '.';
      });
    });
  }

  function record(ctx, text) {
    return book(ctx).then(function (b) {
      var bill = billIn(text), name = billClient(text, b.records);
      if (!name) return 'Who is it for? Try “Bill Juniper Press 1,200 for the cover sketches”.';
      if (!bill || bill.cents <= 0) return 'How much should I put on it for ' + name + '? An amount, or hours and a rate, works.';
      var due = new Date(Date.now() + 30 * DAY).toISOString().slice(0, 10);
      var note = noteIn(text, bill);
      var input = { client: name, amount: bill.cents / 100, due: due };
      if (note) input.note = note;
      return ctx.invoke('record_invoice', input, name + ', ' + money(bill.cents)).then(function () { return book(ctx); }).then(function (after) {
        var added = after.records[after.records.length - 1];
        var math = bill.hours ? bill.hours + ' hours at ' + money(bill.rateCents) + ' comes to **' + money(bill.cents) + '**' : '**' + money(bill.cents) + '**';
        return 'Recorded ' + added.id + ' for ' + name + ': ' + math + ', due ' + due + '. That’s 30 days; tell me if your terms differ.' +
          '\n\nIt waits in Draft until you send it. Drafts now total ' + money(sum(after.drafts)) + '.';
      });
    });
  }

  function list(ctx) {
    return ctx.invoke('list_invoices', {}, 'The whole book').then(function () { return book(ctx); }).then(function (b) {
      if (!b.records.length) return 'The book is empty.';
      return 'Everything in the book:\n\n' + b.records.map(function (r) {
        return '- ' + r.id + ', ' + client(r) + ', ' + money(cents(r)) + ', ' + r.status + (b.overdue.indexOf(r) >= 0 ? ' (overdue)' : '');
      }).join('\n');
    });
  }

  return {
    name: 'Milan',
    role: 'Office Administrator',
    greeting: 'Hello, I’m Milan, your office administrator. One invoice is late: Canal House, 875.00, four days past due. Everything else is on schedule.',
    suggestions: [
      'How’s business this month?',
      'Draft a chase for the overdue invoice',
      'Canal House just paid',
      'Send the Northwind invoice',
      'Bill Harbor & Pine for 14 hours at 85',
    ],
    respond: function (text, ctx) {
      var lower = text.toLowerCase();
      if (/\b(track|log|timer|timesheet)\b/.test(lower) && /\b(time|hours)\b/.test(lower) && !/\b(bill|invoice|charge)\b/.test(lower)) {
        return 'I keep the invoice book, not a timesheet. When you bill, give me the hours and the rate and I’ll do the math, like “Bill Juniper Press for 6 hours at 90”.';
      }
      if (/\b(chase|nudge|remind|reminder|follow.?up|dunning)\b/.test(lower)) return chase(ctx, text);
      if (/^(how|what|where)\b/.test(lower) && /\b(business|money|picture|outstanding|owed|owe|overdue|month|status|doing)\b/.test(lower)) return picture(ctx);
      if (/\b(bill|invoice|charge)\b/.test(lower) && (/\d/.test(lower)) && !/\b(paid|sent|send)\b/.test(lower)) return record(ctx, text);
      if (/\b(paid|payment came|received|settled|cleared|came in)\b/.test(lower)) return markPaid(ctx, text);
      if (/\b(sent|send|mailed|emailed|went out)\b/.test(lower)) return markSent(ctx, text);
      if (/\b(list|show|everything|all (the )?invoices|whole book)\b/.test(lower)) return list(ctx);
      if (/\b(overdue|late)\b/.test(lower)) return chase(ctx, text);
      if (/\b(business|outstanding|owed|status|picture)\b/.test(lower)) return picture(ctx);
      return null;
    },
    reactions: {
      page_record_invoice: function (input, output, ctx) {
        return book(ctx).then(function (b) {
          var added = b.records[b.records.length - 1];
          return 'Recorded ' + (added ? added.id + ' for ' + client(added) + ', ' + money(cents(added)) : 'it') + '. It waits in Draft until you send it.' +
            (input.due ? ' Due ' + day(input.due) + '; once it’s sent, the board marks it overdue if that date passes unpaid.' : ' It has no due date, so it can’t show as overdue.');
        });
      },
      page_invoice_sent: function (input, output, ctx) {
        return book(ctx).then(function (b) {
          var r = b.records.find(function (x) { return x.id === input.id; });
          return 'Sent' + (r ? ': ' + client(r) + ', ' + money(cents(r)) : '') + '. Outstanding is now ' + money(sum(b.sent)) + '.';
        });
      },
      page_invoice_paid: function (input, output, ctx) {
        return book(ctx).then(function (b) {
          var r = b.records.find(function (x) { return x.id === input.id; });
          return 'Paid' + (r ? ': ' + client(r) + ', ' + money(cents(r)) : '') + '. That brings this month to ' + money(sum(b.paidMonth)) + '.';
        });
      },
    },
  };
})();

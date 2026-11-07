// The standalone demo's sample conversation. In Gezel, the bookkeeper's
// replies come from the model the person chooses; here they are scripted, and
// every change goes through the same tools the crew calls.
window.demoChat = (function () {
  'use strict';
  // ── books-rules-start ──
  // Pure derivations shared by the script, the page and the sample conversation:
  // integer-cent money, the P&L by category group, the receipts still waiting in
  // the inbox, and the month-close checklist. Kept self-contained between these
  // sentinels so unit tests execute the shipped bytes.
  var CATEGORY_GROUP = {
    materials: 'cost',
    subcontractors: 'cost',
    payroll: 'expense',
    vehicle: 'expense',
    tools: 'expense',
    insurance: 'expense',
    rent: 'expense',
    utilities: 'expense',
    software: 'expense',
    marketing: 'expense',
    office: 'expense',
    'professional-fees': 'expense',
    'bank-fees': 'expense',
    licenses: 'expense',
    meals: 'expense',
    other: 'expense',
    sales: 'income',
    'other-income': 'income',
    'owner-draw': 'equity',
    uncategorized: 'unsorted',
  };
  var CATEGORIES = Object.keys(CATEGORY_GROUP);
  var CATEGORY_WORDS = {
    income: 'sales', revenue: 'sales', sale: 'sales', job: 'sales', jobs: 'sales', interest: 'other-income', refund: 'other-income',
    material: 'materials', supplies: 'materials', supply: 'materials', parts: 'materials', stock: 'materials',
    subcontractor: 'subcontractors', contractor: 'subcontractors', contractors: 'subcontractors',
    wages: 'payroll', salary: 'payroll', salaries: 'payroll',
    fuel: 'vehicle', gas: 'vehicle', van: 'vehicle', truck: 'vehicle', mileage: 'vehicle',
    tool: 'tools', equipment: 'tools',
    advertising: 'marketing', ads: 'marketing',
    phone: 'utilities', internet: 'utilities', electric: 'utilities',
    legal: 'professional-fees', accounting: 'professional-fees', accountant: 'professional-fees',
    fees: 'bank-fees', 'bank-fee': 'bank-fees', license: 'licenses', permit: 'licenses', permits: 'licenses',
    meal: 'meals', food: 'meals', draw: 'owner-draw', 'owner-draws': 'owner-draw',
    unknown: 'uncategorized', 'not-sure': 'uncategorized',
  };
  var GROUP_ORDER = ['income', 'cost', 'expense', 'equity'];
  var STEPS = [
    { id: 'receipts', label: 'Book every receipt in the inbox', words: ['receipt', 'inbox'] },
    { id: 'categories', label: 'Give every entry a category', words: ['categor'] },
    { id: 'bank', label: 'Match the bank statement', words: ['bank', 'checking'] },
    { id: 'card', label: 'Match the card statement', words: ['card', 'credit'] },
    { id: 'payroll', label: 'Record payroll and subcontractor payments', words: ['payroll', 'wage', 'subcontract'] },
    { id: 'income', label: 'Record every customer payment', words: ['customer', 'payment', 'invoice', 'income', 'deposit'] },
    { id: 'review', label: 'Review the P&L with the owner', words: ['review', 'p&l', 'owner', 'profit'] },
  ];
  var MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

  function pad(n) {
    return n < 10 ? '0' + n : String(n);
  }
  function localDay(ms) {
    var d = new Date(ms);
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }
  function normalizeDate(text) {
    var raw = String(text || '').trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
    var parsed = Date.parse(raw);
    return isFinite(parsed) ? localDay(parsed) : null;
  }
  function prevMonth(month) {
    var y = Number(month.slice(0, 4));
    var m = Number(month.slice(5, 7)) - 1;
    if (m < 1) {
      m = 12;
      y -= 1;
    }
    return y + '-' + pad(m);
  }
  function monthName(month) {
    return MONTHS[Number(String(month).slice(5, 7)) - 1] + ' ' + String(month).slice(0, 4);
  }
  // 'YYYY-MM', a date, 'last month', or a month name; a bare name means its latest past or current occurrence.
  function normalizeMonth(text, nowMs) {
    var raw = String(text || '').trim().toLowerCase();
    var current = localDay(nowMs).slice(0, 7);
    if (/^\d{4}-\d{2}$/.test(raw)) return raw;
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw.slice(0, 7);
    if (/last|previous/.test(raw)) return prevMonth(current);
    if (/this|current/.test(raw)) return current;
    for (var i = 0; i < 12; i++) {
      if (raw.indexOf(MONTHS[i].toLowerCase().slice(0, 3)) === 0) {
        var year = raw.match(/\d{4}/);
        var candidate = (year ? year[0] : current.slice(0, 4)) + '-' + pad(i + 1);
        if (!year && candidate > current) candidate = Number(current.slice(0, 4)) - 1 + '-' + pad(i + 1);
        return candidate;
      }
    }
    return null;
  }
  // Integer cents from 284.17, '284.17' or '$1,912.40', with no float arithmetic; null unless positive.
  function toCents(value) {
    var text = typeof value === 'number' ? (isFinite(value) ? String(value) : '') : String(value == null ? '' : value);
    var m = /^(\d+)(?:\.(\d*))?$/.exec(text.replace(/[$,\s]/g, ''));
    if (!m) return null;
    var frac = (m[2] || '') + '000';
    var cents = Number(m[1]) * 100 + Number(frac.slice(0, 2)) + (Number(frac.charAt(2)) >= 5 ? 1 : 0);
    return cents > 0 ? cents : null;
  }
  function money(cents) {
    var abs = Math.abs(Math.round(cents));
    var whole = String(Math.floor(abs / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return (cents < 0 ? '-' : '') + whole + '.' + pad(abs % 100);
  }
  function normalizeCategory(text) {
    var key = String(text || '').trim().toLowerCase().replace(/&/g, 'and').replace(/[\s_]+/g, '-');
    if (Object.prototype.hasOwnProperty.call(CATEGORY_GROUP, key)) return key;
    if (Object.prototype.hasOwnProperty.call(CATEGORY_WORDS, key)) return CATEGORY_WORDS[key];
    var words = key.split('-');
    for (var i = 0; i < words.length; i++) {
      if (Object.prototype.hasOwnProperty.call(CATEGORY_GROUP, words[i])) return words[i];
      if (Object.prototype.hasOwnProperty.call(CATEGORY_WORDS, words[i])) return CATEGORY_WORDS[words[i]];
    }
    return null;
  }
  function normalizeStep(text) {
    var raw = String(text || '').trim().toLowerCase();
    for (var i = 0; i < STEPS.length; i++) if (STEPS[i].id === raw) return STEPS[i].id;
    for (var j = 0; j < STEPS.length; j++) {
      for (var k = 0; k < STEPS[j].words.length; k++) if (raw.indexOf(STEPS[j].words[k]) >= 0) return STEPS[j].id;
    }
    return null;
  }
  function stepLabel(id) {
    for (var i = 0; i < STEPS.length; i++) if (STEPS[i].id === id) return STEPS[i].label;
    return id;
  }
  function entryDate(entry) {
    return String((entry.data && entry.data.date) || entry.at || '').slice(0, 10);
  }
  function monthOf(entry) {
    return entryDate(entry).slice(0, 7);
  }
  function payeeOf(entry) {
    return String((entry.data && entry.data.payee) || entry.note || '');
  }
  function groupOf(entry) {
    var group = CATEGORY_GROUP[entry.category] || 'expense';
    return group === 'unsorted' ? (entry.kind === 'in' ? 'income' : 'expense') : group;
  }
  function entryLine(entry) {
    return (
      entry.id + ' ' + entryDate(entry) + ' ' + payeeOf(entry) + ' ' + money(entry.amountCents) +
      (entry.kind === 'in' ? ' in, ' : ' out, ') + entry.category +
      (entry.data && entry.data.file ? ' (receipt ' + entry.data.file + ')' : '')
    );
  }
  // The month's P&L: income less cost of jobs is gross profit; less expenses is net profit. Owner draws stay off it.
  function pnl(entries, month) {
    var rows = {};
    var totals = { income: 0, cost: 0, expense: 0, equity: 0 };
    var count = 0;
    entries.forEach(function (e) {
      if (monthOf(e) !== month) return;
      count += 1;
      var group = groupOf(e);
      var cents = e.kind === (group === 'income' ? 'in' : 'out') ? e.amountCents : -e.amountCents;
      totals[group] += cents;
      var key = group + ':' + e.category;
      if (!rows[key]) rows[key] = { group: group, category: e.category, cents: 0 };
      rows[key].cents += cents;
    });
    var lines = Object.keys(rows)
      .map(function (k) { return rows[k]; })
      .sort(function (a, b) { return GROUP_ORDER.indexOf(a.group) - GROUP_ORDER.indexOf(b.group) || b.cents - a.cents; });
    var gross = totals.income - totals.cost;
    return {
      month: month, count: count, incomeCents: totals.income, costCents: totals.cost, grossCents: gross,
      expenseCents: totals.expense, netCents: gross - totals.expense, drawCents: totals.equity, lines: lines,
    };
  }
  function pnlLine(p) {
    if (!p.count) return monthName(p.month) + ': nothing booked.';
    var part = function (group) {
      var rows = p.lines.filter(function (l) { return l.group === group; }).map(function (l) { return l.category + ' ' + money(l.cents); });
      return rows.length ? ' (' + rows.join(', ') + ')' : '';
    };
    return (
      monthName(p.month) + ': income ' + money(p.incomeCents) + part('income') +
      '; cost of jobs ' + money(p.costCents) + part('cost') +
      '; gross profit ' + money(p.grossCents) +
      '; expenses ' + money(p.expenseCents) + part('expense') +
      '; net profit ' + money(p.netCents) + (p.netCents < 0 ? ' (a loss)' : '') +
      (p.drawCents ? '; owner draws ' + money(p.drawCents) + ', not on the P&L' : '') + '.'
    );
  }
  // Inbox files that no entry names as its receipt yet.
  function waitingFiles(names, entries) {
    var booked = {};
    entries.forEach(function (e) {
      if (e.data && e.data.file) booked[String(e.data.file)] = true;
    });
    return names
      .filter(function (n) { return n.charAt(0) !== '.' && !booked['inbox/' + n]; })
      .map(function (n) { return 'inbox/' + n; });
  }
  function needsCategory(entries, month) {
    return entries.filter(function (e) { return e.category === 'uncategorized' && (!month || monthOf(e) === month); });
  }
  function closeRecord(closes, month) {
    for (var i = 0; i < closes.length; i++) if (closes[i].fields && closes[i].fields.month === month) return closes[i];
    return null;
  }
  function isClosed(closes, month) {
    var r = closeRecord(closes, month);
    return !!r && r.status === 'closed';
  }
  // The month to close: the earliest finished month with entries that is still open, else last month.
  function monthToClose(entries, closes, nowMs) {
    var current = localDay(nowMs).slice(0, 7);
    var months = {};
    entries.forEach(function (e) {
      var m = monthOf(e);
      if (m && m < current) months[m] = true;
    });
    closes.forEach(function (r) {
      if (r.fields && r.fields.month && r.fields.month < current) months[r.fields.month] = true;
    });
    var open = Object.keys(months).filter(function (m) { return !isClosed(closes, m); }).sort();
    return open.length ? open[0] : prevMonth(current);
  }
  function closeView(month, entries, closes, waiting) {
    var rec = closeRecord(closes, month);
    var fields = (rec && rec.fields) || {};
    var done = fields.done || {};
    var notes = fields.notes || {};
    var closed = !!rec && rec.status === 'closed';
    var unsorted = needsCategory(entries, month);
    var steps = STEPS.map(function (s) {
      var ticked = !!done[s.id];
      var auto = s.id === 'receipts' ? waiting.length === 0 : s.id === 'categories' ? unsorted.length === 0 : false;
      var ok = closed || (s.id === 'categories' ? auto : auto || ticked);
      return { id: s.id, label: s.label, done: ok, on: done[s.id] || '', note: notes[s.id] || '', auto: auto && !ticked };
    });
    var left = steps.filter(function (s) { return !s.done; });
    return { month: month, closed: closed, closedOn: fields.closedOn || '', steps: steps, left: left, ready: !closed && left.length === 0, unsorted: unsorted };
  }
  function closeLine(view) {
    if (view.closed) return monthName(view.month) + ' is closed' + (view.closedOn ? ' (closed ' + view.closedOn + ')' : '') + '.';
    var count = view.steps.length - view.left.length;
    return (
      'Close of ' + monthName(view.month) + ': ' + count + ' of ' + view.steps.length + ' steps done. ' +
      (view.ready
        ? 'Every step is done, so it is ready to close.'
        : 'Still to do: ' + view.left.map(function (s) { return s.label + ' (' + s.id + ')'; }).join('; ') + '.')
    );
  }
  function picture(entries, closes, inboxNames, nowMs, focusMonth) {
    var current = localDay(nowMs).slice(0, 7);
    var last = prevMonth(current);
    var closing = monthToClose(entries, closes, nowMs);
    var waiting = waitingFiles(inboxNames, entries);
    var unsorted = needsCategory(entries);
    var view = closeView(closing, entries, closes, waiting);
    var parts = [];
    var shown = [];
    function addPnl(month) {
      if (!month || shown.indexOf(month) >= 0) return;
      shown.push(month);
      var label = month === last ? 'P&L for last month, ' : month === current ? 'This month so far, ' : 'P&L for ';
      parts.push(label + pnlLine(pnl(entries, month)));
    }
    addPnl(focusMonth);
    addPnl(last);
    addPnl(closing);
    parts.push(closeLine(view));
    parts.push(
      waiting.length
        ? waiting.length + (waiting.length === 1 ? ' receipt is' : ' receipts are') + ' waiting in the inbox to be booked: ' + waiting.join(', ') + '.'
        : 'No receipts are waiting in the inbox.',
    );
    parts.push(
      unsorted.length
        ? unsorted.length + (unsorted.length === 1 ? ' entry needs' : ' entries need') + ' a category: ' + unsorted.map(entryLine).join(' | ') + '.'
        : 'Every entry has a category.',
    );
    addPnl(current);
    var closedMonths = closes
      .filter(function (r) { return r.status === 'closed' && r.fields && r.fields.month; })
      .map(function (r) { return r.fields.month; })
      .sort();
    if (closedMonths.length) parts.push('Closed months: ' + closedMonths.map(monthName).join(', ') + '.');
    return { closing: closing, view: view, waiting: waiting, unsorted: unsorted, netCents: pnl(entries, closing).netCents, summary: parts.join(' ') };
  }
  // ── books-rules-end ──
  var LABELS = {"materials":"Materials","subcontractors":"Subcontractors","payroll":"Payroll","vehicle":"Vehicle and fuel","tools":"Tools and equipment","insurance":"Insurance","rent":"Rent","utilities":"Utilities and phone","software":"Software","marketing":"Marketing","office":"Office","professional-fees":"Professional fees","bank-fees":"Bank and card fees","licenses":"Licenses and permits","meals":"Meals","other":"Other","sales":"Sales","other-income":"Other income","owner-draw":"Owner draw","uncategorized":"Needs a category"};
  var LAST = prevMonth(localDay(Date.now()).slice(0, 7));
  var LAST_NAME = MONTHS[Number(LAST.slice(5, 7)) - 1];

  function cash(cents) { return (cents < 0 ? '-$' : '$') + money(Math.abs(cents)); }
  function label(category) { return (LABELS[category] || category).toLowerCase(); }
  function niceDate(day) { return new Date(String(day).slice(0, 10) + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }); }
  function state(ctx) {
    return Promise.all([ctx.read('ledger.json'), ctx.read('close.json'), ctx.read('inbox')]).then(function (v) {
      var entries = (v[0] && v[0].entries) || [];
      var names = (Array.isArray(v[2]) ? v[2] : []).map(function (f) { return f.name; });
      var closes = (v[1] && v[1].records) || [];
      var waiting = waitingFiles(names, entries);
      var closing = monthToClose(entries, closes, Date.now());
      return { entries: entries, closes: closes, waiting: waiting, view: closeView(closing, entries, closes, waiting) };
    });
  }
  function leftList(view) {
    return view.left.map(function (s) {
      var detail = s.id === 'receipts' ? ' (receipts still in the inbox)' : s.id === 'categories' ? ' (' + view.unsorted.length + ' to sort)' : '';
      return '- ' + s.label + detail;
    }).join('\n');
  }
  function guessCategory(text) {
    var t = text.toLowerCase();
    var rules = [
      [/\b(van|truck|vehicle|fuel|gas|diesel|oil change|tires?|car wash)\b/, 'vehicle'],
      [/\b(wire|wiring|cable|conduit|breakers?|outlets?|connectors?|boxes|supply|supplies|materials?|parts)\b/, 'materials'],
      [/\b(subcontract\w*|trench\w*|helper)\b/, 'subcontractors'],
      [/\b(payroll|wages)\b/, 'payroll'],
      [/\b(drill|ladder|tools?|equipment|meter)\b/, 'tools'],
      [/\b(insurance)\b/, 'insurance'],
      [/\b(rent)\b/, 'rent'],
      [/\b(phone|internet|utilit\w*)\b/, 'utilities'],
      [/\b(software|app|subscription)\b/, 'software'],
      [/\b(ads?|advertis\w*|marketing|flyers?)\b/, 'marketing'],
      [/\b(accountant|lawyer|legal|bookkeeping)\b/, 'professional-fees'],
      [/\b(permits?|licen[cs]e)\b/, 'licenses'],
      [/\b(lunch|dinner|meal|coffee)\b/, 'meals'],
      [/\b(paper|printer|office)\b/, 'office'],
      [/\b(draw|personal)\b/, 'owner-draw'],
    ];
    for (var i = 0; i < rules.length; i++) if (rules[i][0].test(t)) return rules[i][1];
    return null;
  }
  // The entry the person means: the one whose payee shares the most words with what they wrote.
  function findEntry(entries, text) {
    var words = text.toLowerCase().match(/[a-z]{4,}/g) || [];
    var best = null, score = 0;
    entries.forEach(function (e) {
      var payee = payeeOf(e).toLowerCase();
      var hits = words.filter(function (w) { return payee.indexOf(w) >= 0; }).length + (e.category === 'uncategorized' ? 0.5 : 0);
      if (hits > score && hits >= 1) { best = e; score = hits; }
    });
    return best;
  }

  function bookInbox(ctx) {
    return state(ctx).then(function (s) {
      if (!s.waiting.length) return 'The inbox is clear. Drop a receipt in and I’ll book it.';
      var booked = [], skipped = [];
      return s.waiting.reduce(function (chain, path) {
        return chain.then(function () {
          return ctx.read(path).then(function (text) {
            text = String(text || '');
            var total = (text.match(/total\s+\$?([\d,]+\.\d{2})/i) || [])[1];
            var date = (text.match(/\d{4}-\d{2}-\d{2}/) || [])[0];
            var payee = text.split('\n')[0].replace(/\s*#\d+\s*$/, '').trim();
            if (!total || !date || !payee) { skipped.push(path); return; }
            var category = guessCategory(text);
            var input = { payee: payee, amount: Number(total.replace(/,/g, '')), date: date, file: path };
            if (category) input.category = category;
            return ctx.invoke('record_entry', input, payee + ', $' + total).then(function () {
              booked.push('- **' + payee + '**, $' + total + ' on ' + niceDate(date) + (category ? ', under ' + label(category) : ', with no category yet'));
            });
          }, function () { skipped.push(path); });
        });
      }, Promise.resolve()).then(function () { return state(ctx); }).then(function (after) {
        return (booked.length ? 'Booked ' + (booked.length === 1 ? 'the receipt' : booked.length === 2 ? 'both receipts' : 'all ' + booked.length + ' receipts') + ' from the inbox, each with its receipt attached:\n' + booked.join('\n') : 'I couldn’t read those receipts.') +
          (skipped.length ? '\n\nI can’t open ' + skipped.join(', ') + ' in this preview; in Gezel I would read it.' : '') +
          '\n\n' + (after.waiting.length ? after.waiting.length + ' still waiting.' : 'The inbox is clear, so that close step checks itself.') +
          (after.view.unsorted.length ? ' ' + payeeOf(after.view.unsorted[0]) + ' still needs a category. What was it for?' : '');
      });
    });
  }

  function categorize(ctx, text, category) {
    return state(ctx).then(function (s) {
      var e = findEntry(s.entries, text);
      if (!e) return 'Which charge was that? Name the payee, like “the Brightway Auto charge was the van’s oil change”.';
      return ctx.invoke('categorize_entry', { id: e.id, category: category }, payeeOf(e) + ': ' + label(category)).then(function () { return state(ctx); }).then(function (after) {
        return 'Done: **' + payeeOf(e) + '**, ' + cash(e.amountCents) + ' on ' + niceDate(entryDate(e)) + ', is now under ' + label(category) + '. ' +
          (after.view.unsorted.length ? plural(after.view.unsorted.length, 'entry still needs', 'entries still need') + ' a category.' : 'Every ' + MONTHS[Number(after.view.month.slice(5, 7)) - 1] + ' entry has a category, so that close step checks itself.');
      });
    });
  }
  function plural(n, one, many) { return n + ' ' + (n === 1 ? one : many); }

  function tick(ctx, step, text) {
    return state(ctx).then(function (s) {
      if (s.view.closed) return monthName(s.view.month) + ' is already closed.';
      var note = text.replace(/\s+/g, ' ').trim();
      return ctx.invoke('tick_close_step', { step: step, note: note }, stepLabel(step) + ': done').then(function () { return state(ctx); }).then(function (after) {
        var v = after.view;
        return 'Done: **' + stepLabel(step) + '** for ' + monthName(v.month) + '. ' +
          (v.ready ? 'That was the last step, so ' + monthName(v.month) + ' is ready to close whenever you say.' : (v.steps.length - v.left.length) + ' of ' + v.steps.length + ' done. Still to do:\n' + leftList(v));
      });
    });
  }

  function report(ctx) {
    return ctx.invoke('books_status', {}, 'The books for ' + LAST_NAME).then(function () { return state(ctx); }).then(function (s) {
      var month = s.view.month, p = pnl(s.entries, month);
      if (!p.count) return 'Nothing is booked for ' + monthName(month) + ' yet.';
      var group = function (g) {
        return p.lines.filter(function (l) { return l.group === g; }).slice(0, 2).map(function (l) { return label(l.category) + ' ' + cash(l.cents); }).join(', ');
      };
      return '**' + monthName(month) + '** as booked so far:\n' +
        '- Income: ' + cash(p.incomeCents) + ' (' + group('income') + ')\n' +
        '- Cost of jobs: ' + cash(p.costCents) + ' (' + group('cost') + ')\n' +
        '- Gross profit: ' + cash(p.grossCents) + '\n' +
        '- Expenses: ' + cash(p.expenseCents) + ', mostly ' + group('expense') + '\n' +
        '- **Net profit: ' + cash(p.netCents) + '**' + (p.drawCents ? ' (owner draws of ' + cash(p.drawCents) + ' are kept off the P&L)' : '') + '\n\n' +
        (s.waiting.length || s.view.unsorted.length ? 'It isn’t final: ' + [s.waiting.length ? plural(s.waiting.length, 'receipt is', 'receipts are') + ' still in the inbox' : '', s.view.unsorted.length ? plural(s.view.unsorted.length, 'entry has', 'entries have') + ' no category' : ''].filter(Boolean).join(' and ') + '. ' : '') +
        (s.view.closed ? 'The month is closed.' : s.view.ready ? 'Every close step is done; it is ready to close.' : (s.view.steps.length - s.view.left.length) + ' of ' + s.view.steps.length + ' close steps are done.');
    });
  }

  function closeFlow(ctx, text) {
    var reviewed = /\b(looks? (right|good|fine)|review(ed)?|approved?|p&l)\b/i.test(text);
    return state(ctx).then(function (s) {
      if (s.view.closed) return monthName(s.view.month) + ' is already closed.';
      var reviewStep = s.view.steps.filter(function (x) { return x.id === 'review'; })[0];
      var ticked = reviewed && !reviewStep.done;
      var first = ticked ? ctx.invoke('tick_close_step', { step: 'review', note: 'The owner reviewed the P&L.' }, 'Review the P&L: done') : Promise.resolve();
      return first.then(function () { return state(ctx); }).then(function (s2) {
        var v = s2.view;
        if (!v.ready) return (ticked ? 'Checked off the owner’s review. ' : '') + 'I can’t close ' + monthName(v.month) + ' yet. Still to do:\n' + leftList(v) + '\n\nTell me as each one is done and I’ll close it.';
        return ctx.invoke('close_month', { month: v.month }, 'Close ' + monthName(v.month)).then(function () { return state(ctx); }).then(function (s3) {
          var p = pnl(s3.entries, v.month);
          return (ticked ? 'Checked off the review, and ' : '') + '**' + monthName(v.month) + '** is closed with net profit ' + cash(p.netCents) + '. Its entries are locked now; if something turns up, I can reopen it. Next I’ll start ' + MONTHS[Number(v.month.slice(5, 7)) % 12] + ' with the inbox.';
        });
      });
    });
  }

  function whatsLeft(ctx) {
    return state(ctx).then(function (s) {
      var v = s.view;
      if (v.closed) return monthName(v.month) + ' is closed.';
      return v.ready ? monthName(v.month) + ' is ready to close: every step is done.' : monthName(v.month) + ' close, ' + (v.steps.length - v.left.length) + ' of ' + v.steps.length + ' done. Still to do:\n' + leftList(v);
    });
  }

  function recordFree(ctx, text) {
    var amount = (text.match(/\$\s?([\d,]+(?:\.\d{1,2})?)/) || text.match(/\b([\d,]+\.\d{2})\b/) || [])[1];
    var payee = (text.match(/\b(?:from|to|at)\s+(?:the\s+)?(.+?)(?=\s+(?:job|for|today|yesterday|paid|on|this|last)\b|[,.;!]|$)/i) || [])[1];
    if (!amount || !payee) return Promise.resolve('Tell me the amount and who it was with, like “log $2,450 from the Kim residence job, paid today”.');
    payee = payee.trim().replace(/^./, function (c) { return c.toUpperCase(); });
    var income = /\b(from|received|got paid|paid us|deposit|invoice)\b/i.test(text);
    var category = income ? 'sales' : guessCategory(text);
    var date = /\byesterday\b/i.test(text) ? localDay(Date.now() - 86400000) : localDay(Date.now());
    var cents = toCents(amount) || 0;
    var input = { payee: payee, amount: cents / 100, date: date, kind: income ? 'income' : 'expense' };
    if (category) input.category = category;
    return ctx.invoke('record_entry', input, payee + ', ' + cash(cents)).then(function () { return state(ctx); }).then(function (s) {
      var p = pnl(s.entries, date.slice(0, 7));
      return 'Booked **' + payee + '**, ' + cash(cents) + ' on ' + niceDate(date) + (category ? ', under ' + label(category) : ' with no category yet. What was it for?') + '. ' + MONTHS[Number(date.slice(5, 7)) - 1] + ' so far: net profit ' + cash(p.netCents) + '.';
    });
  }

  return {
    name: 'Julia',
    role: 'Bookkeeper',
    greeting: 'Hello, I’m Julia. I keep Brightline Electric’s books. Two receipts are waiting in the inbox, and ' + LAST_NAME + '’s close is 3 of 7 steps done.',
    suggestions: [
      'Book the receipts in the inbox',
      'The Brightway Auto charge was the van’s oil change',
      'We matched the bank statement',
      'How did last month do?',
      'The P&L looks right. Close the month.',
    ],
    respond: function (text, ctx) {
      var lower = text.toLowerCase();
      if (/\breopen\b/.test(lower)) return ctx.invoke('reopen_month', {}, 'Reopen the last closed month').then(function (out) { return String((out && out.summary) || 'Reopened.').split('. ')[0] + '.'; });
      var asking = /\?\s*$/.test(text) || /^(can|could|is|are|what|when)\b/.test(lower);
      if (/\b(left|still|remaining|to do|ready)\b/.test(lower) || (asking && /\bclose\b/.test(lower))) return whatsLeft(ctx);
      if (/\bclose\b/.test(lower)) return closeFlow(ctx, text);
      if (/\breceipts?\b|\binbox\b/.test(lower) && /\b(book|file|enter|log|process|do)\b/.test(lower)) return bookInbox(ctx);
      var step = /\b(matched|reconciled|balanced|done|finished|checked|recorded|went through)\b/.test(lower) ? normalizeStep(lower) : null;
      if (step && step !== 'categories' && step !== 'receipts') return tick(ctx, step, text);
      var category = guessCategory(text);
      if (category && /\b(was|were|is|for|categor\w*|put|under)\b/.test(lower) && !/\$\s?\d/.test(text)) return categorize(ctx, text, category);
      if (/\b(how did|p&l|profit|net|last month|numbers|doing)\b/.test(lower)) return report(ctx);
      if (/\b(left|status|still|remaining|to do|ready)\b/.test(lower)) return whatsLeft(ctx);
      if (/\b(log|record|book|paid|got|received|spent|bought)\b/.test(lower) && /\d/.test(text)) return recordFree(ctx, text);
      return null;
    },
    reactions: {
      page_record_entry: function (input) {
        var category = input.category && input.category !== 'uncategorized' ? normalizeCategory(input.category) : null;
        return 'Booked ' + input.payee + ', ' + cash(toCents(input.amount) || 0) + (category ? ', under ' + label(category) + '.' : ', with no category yet. Tell me what it was for and I’ll sort it.');
      },
      page_categorize_entry: function (input, output) {
        return output && output.summary ? output.summary.split('. ')[0].replace(/\.$/, '') + '.' : 'Sorted.';
      },
      page_tick_close_step: function (input, output, ctx) {
        return state(ctx).then(function (s) {
          return 'Checked off ' + stepLabel(normalizeStep(input.step) || input.step).toLowerCase() + '. ' + (s.view.ready ? monthName(s.view.month) + ' is ready to close.' : s.view.left.length + ' to go for ' + monthName(s.view.month) + '.');
        });
      },
      page_close_month: function (input, output) {
        var first = output && output.summary ? output.summary.split('. ')[0] + '.' : 'The month is closed.';
        return first + ' I’ll start the next month with the inbox.';
      },
    },
  };
})();

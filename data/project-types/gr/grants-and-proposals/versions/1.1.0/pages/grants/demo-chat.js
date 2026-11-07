// The standalone demo's sample conversation. In Gezel, the fundraiser's
// replies come from the model the person chooses; here they are scripted, and
// every change goes through the same tools the crew calls.
window.demoChat = (function () {
  'use strict';
  var DAY = 86400000;
  var MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
  var NUMBERS = { a: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6 };
  var OPEN = ['prospect', 'drafting'];

  function pad(n) { return n < 10 ? '0' + n : String(n); }
  function iso(ms) { var d = new Date(ms); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function daysLeft(day) { return Math.round((Date.parse(String(day).slice(0, 10) + 'T00:00:00') - Date.parse(iso(Date.now()) + 'T00:00:00')) / DAY); }
  function when(days) { return days < 0 ? -days + (days === -1 ? ' day late' : ' days late') : days === 0 ? 'due today' : 'in ' + days + (days === 1 ? ' day' : ' days'); }
  function niceDate(day) { return new Date(String(day).slice(0, 10) + 'T12:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric' }); }
  function money(cents) { var c = Math.round(Number(cents) || 0); return '$' + String(Math.floor(c / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, ',') + (c % 100 ? '.' + pad(c % 100) : ''); }
  function lowerFirst(text) { return String(text).replace(/^./, function (c) { return c.toLowerCase(); }); }

  function state(ctx) {
    return Promise.all([ctx.read('opportunities.json'), ctx.read('requirements.json')]).then(function (v) {
      return { ops: (v[0] && v[0].records) || [], reqs: (v[1] && v[1].records) || [] };
    });
  }
  function openOps(s) {
    return s.ops.filter(function (o) { return OPEN.indexOf(o.status) >= 0; }).sort(function (a, b) { return String(a.fields.deadline || '9999').localeCompare(String(b.fields.deadline || '9999')); });
  }
  function todo(s, op) { return s.reqs.filter(function (r) { return r.fields.opportunityId === op.id && r.status !== 'done'; }); }
  function all(s, op) { return s.reqs.filter(function (r) { return r.fields.opportunityId === op.id; }); }
  // The record that shares the most words with what the person wrote (titles and funders).
  function best(records, text, extra) {
    var words = text.toLowerCase().match(/[a-z]{4,}/g) || [];
    var top = null, score = 0;
    records.forEach(function (r) {
      var hay = (r.fields.title + ' ' + (extra ? r.fields[extra] || '' : '')).toLowerCase();
      var hits = words.filter(function (w) { return hay.indexOf(w) >= 0 || hay.indexOf(w.replace(/s$/, '')) >= 0; }).length;
      if (hits > score) { top = r; score = hits; }
    });
    return top;
  }
  function dollars(text) {
    var m = text.match(/\$\s?([\d,]+(?:\.\d{1,2})?)\s*(k)?\b/i);
    if (!m) return null;
    var n = Number(m[1].replace(/,/g, ''));
    return m[2] ? n * 1000 : n;
  }
  function dateIn(text) {
    var m = text.toLowerCase().match(new RegExp('\\b(' + MONTHS.join('|') + ')\\s+(\\d{1,2})'));
    if (!m) return null;
    var year = new Date().getFullYear();
    var candidate = year + '-' + pad(MONTHS.indexOf(m[1]) + 1) + '-' + pad(Number(m[2]));
    return daysLeft(candidate) < 0 ? (year + 1) + candidate.slice(4) : candidate;
  }

  function dueNext(ctx) {
    return ctx.invoke('grants_status', {}, 'Open opportunities').then(function () { return state(ctx); }).then(function (s) {
      var dated = openOps(s).filter(function (o) { return o.fields.deadline; });
      if (!dated.length) return 'No open opportunity has a deadline yet. Tell me about one worth a look.';
      var lines = dated.map(function (o) {
        var left = todo(s, o), total = all(s, o).length;
        return '- **' + o.fields.title + '**' + (o.fields.funder ? ' (' + o.fields.funder + ')' : '') + ' ' + when(daysLeft(o.fields.deadline)) + ': ' +
          (total ? total - left.length + ' of ' + total + ' ready' + (left.length ? '; still to do: ' + left.map(function (r) { return lowerFirst(r.fields.title) + (r.fields.owner ? ' (' + r.fields.owner + ')' : ''); }).join(', ') : '') : 'no requirements listed yet');
      });
      var first = dated[0], firstLeft = todo(s, first);
      return 'Soonest first:\n' + lines.join('\n') + '\n\n' +
        (firstLeft.length ? 'The ' + first.fields.title + ' is the one to finish this week: ' + firstLeft.length + (firstLeft.length === 1 ? ' piece is' : ' pieces are') + ' still open.' : 'The ' + first.fields.title + ' is ready to submit.');
    });
  }

  function ready(ctx, text) {
    return state(ctx).then(function (s) {
      var op = best(openOps(s), text, 'funder');
      var pool = op ? todo(s, op) : s.reqs.filter(function (r) { return r.status !== 'done'; });
      var req = best(pool, text);
      if (!req) return 'Which requirement is ready? Name it, like “the budget narrative for the Regional Arts Fund is done”.';
      return ctx.invoke('check_requirement', { requirement: req.id }, req.fields.title).then(function () { return state(ctx); }).then(function (after) {
        var owner = after.ops.find(function (o) { return o.id === req.fields.opportunityId; });
        var left = todo(after, owner), total = all(after, owner).length;
        return 'Checked off: **' + req.fields.title + '** for the ' + owner.fields.title + '. That’s ' + (total - left.length) + ' of ' + total + ' ready' +
          (left.length ? '; still to do: ' + left.map(function (r) { return lowerFirst(r.fields.title) + (r.fields.owner ? ' (' + r.fields.owner + ')' : ''); }).join(', ') + '.' : ', so it’s ready to submit. Tell me when it’s in and I’ll move it to submitted.') +
          (owner.fields.deadline ? ' Deadline: ' + niceDate(owner.fields.deadline) + ', ' + when(daysLeft(owner.fields.deadline)) + '.' : '');
      });
    });
  }

  function extended(ctx, text) {
    var lower = text.toLowerCase();
    var m = lower.match(/\bby\s+(\d+|a|one|two|three|four|five|six)\s+(day|week)s?\b/);
    return state(ctx).then(function (s) {
      var op = best(openOps(s).concat(s.ops.filter(function (o) { return o.status === 'submitted'; })), text, 'funder');
      if (!op) return 'Which opportunity moved its deadline? Name the funder or the grant.';
      if (!m) return 'By how much did the ' + op.fields.title + ' deadline move? “By two weeks” is enough, or give me the new date.';
      var n = NUMBERS[m[1]] || Number(m[1]);
      var days = m[2] === 'week' ? n * 7 : n;
      var before = op.fields.deadline;
      return ctx.invoke('update_opportunity', { opportunity: op.id, extendDays: days }, op.fields.title + ': +' + days + ' days').then(function () { return state(ctx); }).then(function (after) {
        var now = after.ops.find(function (o) { return o.id === op.id; });
        var left = todo(after, now);
        return 'Moved: the **' + now.fields.title + '** deadline is now ' + niceDate(now.fields.deadline) + ' (was ' + niceDate(before) + '), ' + when(daysLeft(now.fields.deadline)) + '. ' +
          (left.length ? 'That’s breathing room for ' + left.map(function (r) { return lowerFirst(r.fields.title); }).join(' and ') + '.' : 'Everything on its checklist is already done.') +
          ' The reminder now sits two weeks ahead of the new date.';
      });
    });
  }

  function decided(ctx, text) {
    var lower = text.toLowerCase();
    var outcome = /\b(declined|turned us down|rejected|didn.?t get|not funded)\b/.test(lower) ? 'declined' : 'awarded';
    var amount = dollars(text);
    return state(ctx).then(function (s) {
      var op = best(s.ops.filter(function (o) { return ['awarded', 'declined', 'passed'].indexOf(o.status) < 0; }), text, 'funder');
      if (!op) return 'Which funder decided? Name them and I’ll record it.';
      var input = { opportunity: op.id, outcome: outcome };
      if (outcome === 'awarded' && amount !== null) input.award = amount;
      return ctx.invoke('record_outcome', input, op.fields.title + ': ' + outcome + (input.award ? ' ' + money(input.award * 100) : '')).then(function () { return state(ctx); }).then(function (after) {
        var next = openOps(after).filter(function (o) { return o.fields.deadline; })[0];
        if (outcome === 'awarded') {
          return 'Wonderful news. Recorded: **' + op.fields.title + '**' + (op.fields.funder ? ' from ' + op.fields.funder : '') + ' was awarded ' + (input.award ? money(input.award * 100) : 'in full') + (op.fields.askCents ? ' of the ' + money(op.fields.askCents) + ' we asked for' : '') + '. ' +
            'Next steps: a thank-you to the program officer this week, and the reporting dates from the award letter in the note so nothing is missed.' +
            (next ? ' Then back to the ' + next.fields.title + ', ' + when(daysLeft(next.fields.deadline)) + '.' : '');
        }
        return 'Recorded: **' + op.fields.title + '** was declined. It’s worth asking ' + (op.fields.funder ? op.fields.funder + '’s' : 'the funder’s') + ' program officer for feedback; it often shapes the next round.' + (next ? ' Next up: the ' + next.fields.title + ', ' + when(daysLeft(next.fields.deadline)) + '.' : '');
      });
    });
  }

  function added(ctx, text) {
    var m = text.match(/\badd\s+(?:the|a|an)?\s*([^:,]+?)(?:\s*[:,]|$)/i);
    if (!m) return Promise.resolve('What should I add? Give me the name, the deadline and the ask, like “Add the Ashland Book Arts Grant: due December 15, ask $4,000, good fit”.');
    var title = m[1].trim().replace(/^./, function (c) { return c.toUpperCase(); });
    var lower = text.toLowerCase();
    var input = { title: title, kind: /\brfp\b|request for proposals/.test(lower) ? 'rfp' : /fellowship|residency/.test(lower) ? 'fellowship' : /sponsor/.test(lower) ? 'sponsorship' : 'grant' };
    var deadline = dateIn(text), ask = dollars(text);
    if (deadline) input.deadline = deadline;
    if (ask !== null) input.ask = ask;
    var fit = /\bstrong\b/.test(lower) ? 'strong' : /long shot|weak/.test(lower) ? 'long shot' : /\bgood\b/.test(lower) ? 'good' : '';
    if (fit) input.fit = fit;
    return ctx.invoke('add_opportunity', input, title + (deadline ? ', due ' + niceDate(deadline) : '')).then(function () {
      return 'Added **' + title + '**' + (deadline ? ', due ' + niceDate(deadline) + ' (' + when(daysLeft(deadline)) + ')' : '') + (ask !== null ? ', asking ' + money(ask * 100) : '') + (fit ? ', ' + fit + ' fit' : '') + '. ' +
        'Paste the guidelines or tell me what they ask for, and I’ll start its checklist. In Gezel the researcher can read the funder’s past awards first.';
    });
  }

  function submitted(ctx, text) {
    return state(ctx).then(function (s) {
      var op = best(openOps(s), text, 'funder');
      if (!op) return 'Which one went in? Name the funder or the grant.';
      var ref = (text.match(/\b([A-Z]{1,4}-?\d[\w-]{2,})\b/) || [])[1];
      var input = { opportunity: op.id, stage: 'submitted' };
      if (ref) input.note = 'Confirmation ' + ref;
      var left = todo(s, op);
      return ctx.invoke('set_stage', input, op.fields.title + ': submitted').then(function () {
        return 'Moved **' + op.fields.title + '** to submitted' + (ref ? ', confirmation ' + ref + ' on file' : '') + '. ' +
          (left.length ? 'Heads up: ' + left.map(function (r) { return lowerFirst(r.fields.title); }).join(' and ') + (left.length === 1 ? ' was' : ' were') + ' still unchecked on its list.' : 'Every requirement was checked off.');
      });
    });
  }

  return {
    name: 'Amira',
    role: 'Fundraiser',
    greeting: 'Hello, I’m Amira. I keep Juniper Press’s funding pipeline moving. The Regional Arts Fund grant is due in 9 days with two pieces still open, and the Morrow Family Foundation decision is still out.',
    suggestions: [
      'What’s due next?',
      'The budget narrative for the Regional Arts Fund is done',
      'The Regional Arts Fund extended its deadline by two weeks',
      'The Morrow Family Foundation awarded us $9,000',
      'Add the Ashland Book Arts Grant: due December 15, ask $4,000, good fit',
    ],
    respond: function (text, ctx) {
      var lower = text.toLowerCase();
      if (/^\s*add\b/.test(lower)) return added(ctx, text);
      if (/\b(extend|extended|moved|pushed|postponed)\b/.test(lower) && /deadline/.test(lower)) return extended(ctx, text);
      if (/\b(awarded|funded|granted|won|declined|turned us down|rejected|didn.?t get)\b/.test(lower)) return decided(ctx, text);
      if (/\b(submitted|sent in|sent off|went in)\b/.test(lower)) return submitted(ctx, text);
      if (/\b(done|ready|finished|complete|completed|in hand|signed)\b/.test(lower)) return ready(ctx, text);
      if (/\b(due|next|deadline|coming up|missing|left|status|where)\b/.test(lower)) return dueNext(ctx);
      return null;
    },
    reactions: {
      page_record_outcome: function (input, output) {
        if (input.outcome === 'awarded') return 'Congratulations. ' + (output && output.summary ? output.summary.split('. ')[0] + '. ' : '') + 'I’d send the thank-you this week and note the reporting dates.';
        if (input.outcome === 'declined') return 'Recorded. Asking the program officer for feedback is worth one short email; it often shapes the next round.';
        return 'Passed on, and off the active list.';
      },
      page_set_stage: function (input, output) {
        var moved = output && output.summary ? output.summary.replace(/\s*(?:\d+|No) open opportunit[\s\S]*$/, '') : '';
        return (moved || 'Moved.') + (input.stage === 'submitted' ? ' I’ll watch for the decision.' : '');
      },
      page_add_opportunity: function (input) {
        return 'Added ' + input.title + (input.deadline ? ', due ' + niceDate(input.deadline) : '') + '. Tell me what its guidelines ask for and I’ll start the checklist.';
      },
      page_add_requirement: function (input) {
        return 'On the checklist: ' + input.title + '.';
      },
    },
  };
})();

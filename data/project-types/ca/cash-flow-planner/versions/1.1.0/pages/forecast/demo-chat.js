// The standalone demo's sample conversation. In Gezel, the bookkeeper's
// replies come from the model the person chooses; here they are scripted, and
// every change goes through the same tools the crew calls.
window.demoChat = (function () {
  'use strict';
  // ── cashflow-rules-start ──
  // Pure derivations shared by the script, the page and the sample conversation:
  // integer-cent money, repeat dates, and the 13-week forecast with its tightest
  // week, for the plan and for each what-if. Kept self-contained between these
  // sentinels so unit tests execute the shipped bytes.
  var DAY_MS = 86400000;
  var WEEKS = 13;
  var RECURS = ['none', 'weekly', 'biweekly', 'monthly', 'quarterly'];
  var RECURS_TEXT = { none: 'once', weekly: 'every week', biweekly: 'every two weeks', monthly: 'every month', quarterly: 'every quarter' };
  var SHORT_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

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
  // Local noon, so adding days never trips over a daylight-saving change.
  function dayMs(day) {
    return Date.parse(String(day).slice(0, 10) + 'T12:00:00');
  }
  function addDays(day, n) {
    var d = new Date(dayMs(day));
    d.setDate(d.getDate() + n);
    return localDay(d.getTime());
  }
  // The same day of the month `months` later; the 31st lands on a shorter month's last day.
  function addMonths(day, months, dom) {
    var d = new Date(dayMs(day));
    var date = dom || d.getDate();
    d.setDate(1);
    d.setMonth(d.getMonth() + months);
    d.setDate(Math.min(date, new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()));
    return localDay(d.getTime());
  }
  // The k-th date of a series counted from its anchor, so a monthly 31st never drifts.
  function occurrence(anchor, recurs, k, dom) {
    if (recurs === 'weekly') return addDays(anchor, 7 * k);
    if (recurs === 'biweekly') return addDays(anchor, 14 * k);
    if (recurs === 'monthly') return addMonths(anchor, k, dom);
    if (recurs === 'quarterly') return addMonths(anchor, 3 * k, dom);
    return k === 0 ? anchor : null;
  }
  function daysBetween(from, to) {
    return Math.round((dayMs(to) - dayMs(from)) / DAY_MS);
  }
  function mondayOf(day) {
    return addDays(day, -((new Date(dayMs(day)).getDay() + 6) % 7));
  }
  function weekLabel(day) {
    return SHORT_MONTHS[Number(day.slice(5, 7)) - 1] + ' ' + Number(day.slice(8, 10));
  }
  // Integer cents from 9600, '9,600.00' or '-1240', with no float arithmetic.
  function parseCents(value) {
    var text = typeof value === 'number' ? (isFinite(value) ? String(value) : '') : String(value == null ? '' : value);
    var m = /^(-?)(\d+)(?:\.(\d*))?$/.exec(text.replace(/[$,\s]/g, ''));
    if (!m) return null;
    var frac = (m[3] || '') + '000';
    var cents = Number(m[2]) * 100 + Number(frac.slice(0, 2)) + (Number(frac.charAt(2)) >= 5 ? 1 : 0);
    return m[1] ? -cents : cents;
  }
  function toCents(value) {
    var cents = parseCents(value);
    return cents !== null && cents > 0 ? cents : null;
  }
  function money(cents) {
    var abs = Math.abs(Math.round(cents));
    var whole = String(Math.floor(abs / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return (cents < 0 ? '-' : '') + whole + '.' + pad(abs % 100);
  }
  function normalizeRecurs(text) {
    var raw = String(text || '').trim().toLowerCase();
    if (RECURS.indexOf(raw) >= 0) return raw;
    if (/two weeks|fortnight|bi-?weekly/.test(raw)) return 'biweekly';
    if (/week/.test(raw)) return 'weekly';
    if (/quarter/.test(raw)) return 'quarterly';
    if (/month/.test(raw)) return 'monthly';
    if (/once|one-?off|single/.test(raw)) return 'none';
    return null;
  }
  function scenarioNames(records) {
    var names = [];
    records.forEach(function (r) {
      var s = r.status === 'whatif' && r.fields && r.fields.scenario;
      if (s && names.indexOf(s) < 0) names.push(s);
    });
    return names;
  }
  // The plan's expected items, or the plan with one what-if's changes applied.
  function planItems(records, scenario) {
    var changes = records.filter(function (r) {
      return scenario && r.status === 'whatif' && r.fields.scenario === scenario && r.fields.change !== 'add';
    });
    return records
      .filter(function (r) {
        return r.status === 'expected' || (scenario && r.status === 'whatif' && r.fields.scenario === scenario && r.fields.change === 'add');
      })
      .map(function (r) {
        var shift = 0;
        var dropped = false;
        changes.forEach(function (c) {
          if (c.fields.itemId !== r.id) return;
          if (c.fields.change === 'drop') dropped = true;
          if (c.fields.change === 'delay') shift += Math.round(Number(c.fields.weeks) || 0);
        });
        var f = r.fields;
        return dropped
          ? null
          : { id: r.id, name: f.name, direction: f.direction, amountCents: f.amountCents, date: f.date, recurs: f.recurs || 'none', until: f.until || '', dom: f.dom, shiftDays: 7 * shift, whatIf: r.status === 'whatif' };
      })
      .filter(Boolean);
  }
  // Thirteen weeks from this Monday. A repeat dated before the balance is already in it; a one-off
  // that never came stays expected and is counted (and flagged late) in the first week.
  function forecast(file, scenario, nowMs) {
    var today = localDay(nowMs);
    var balance = file && file.balance && typeof file.balance.amountCents === 'number' ? file.balance : null;
    var asOf = balance && balance.asOf ? balance.asOf : today;
    var start = mondayOf(today);
    var end = addDays(start, 7 * WEEKS - 1);
    var from = asOf < start ? asOf : start;
    var weeks = [];
    for (var w = 0; w < WEEKS; w++) weeks.push({ start: addDays(start, 7 * w), inCents: 0, outCents: 0, items: [] });
    var late = [];
    planItems((file && file.records) || [], scenario).forEach(function (item) {
      if (!item.date || !(item.amountCents > 0)) return;
      var k = 0;
      if (item.recurs !== 'none') {
        var gap = daysBetween(item.date, from) - item.shiftDays;
        var period = { weekly: 7, biweekly: 14, monthly: 31, quarterly: 92 }[item.recurs] || 7;
        if (gap > 0) k = Math.max(0, Math.floor(gap / period) - 1);
      }
      for (var guard = 0; guard < 600; guard++, k++) {
        var raw = occurrence(item.date, item.recurs, k, item.dom);
        if (!raw || (item.until && raw > item.until)) break;
        var day = item.shiftDays ? addDays(raw, item.shiftDays) : raw;
        if (day > end) break;
        if (item.recurs !== 'none' && day < asOf) continue;
        var isLate = item.recurs === 'none' && day < today;
        var hit = { id: item.id, name: item.name, direction: item.direction, amountCents: item.amountCents, day: day, late: isLate, whatIf: item.whatIf };
        var week = weeks[day < start ? 0 : Math.floor(daysBetween(start, day) / 7)];
        if (item.direction === 'in') week.inCents += item.amountCents;
        else week.outCents += item.amountCents;
        week.items.push(hit);
        if (isLate) late.push(hit);
        if (item.recurs === 'none') break;
      }
    });
    var running = balance ? balance.amountCents : 0;
    var totalIn = 0;
    var totalOut = 0;
    weeks.forEach(function (wk) {
      wk.openCents = running;
      running += wk.inCents - wk.outCents;
      wk.closeCents = running;
      totalIn += wk.inCents;
      totalOut += wk.outCents;
    });
    var cushion = file && typeof file.cushionCents === 'number' ? file.cushionCents : 0;
    var lowest = weeks[0];
    weeks.forEach(function (wk) {
      if (wk.closeCents < lowest.closeCents) lowest = wk;
    });
    return {
      today: today, start: start, asOf: asOf, hasBalance: !!balance, balanceCents: balance ? balance.amountCents : 0,
      cushionCents: cushion, weeks: weeks, lowest: lowest, late: late, inCents: totalIn, outCents: totalOut, endCents: running,
      firstLow: weeks.filter(function (wk) { return wk.closeCents < cushion; })[0] || null,
      firstNegative: weeks.filter(function (wk) { return wk.closeCents < 0; })[0] || null,
      belowCushion: weeks.filter(function (wk) { return wk.closeCents < cushion; }).length,
    };
  }
  function biggest(week) {
    return week.items
      .filter(function (i) { return i.direction === 'out'; })
      .sort(function (a, b) { return b.amountCents - a.amountCents; })
      .slice(0, 3)
      .map(function (i) { return i.name + ' ' + money(i.amountCents); })
      .reduce(function (text, part, i, all) { return text + (i === 0 ? '' : i === all.length - 1 ? ' and ' : '; ') + part; }, '');
  }
  // The answer to "when does cash get tight?": the warning week first, with what goes out in it.
  function tightLine(f) {
    var low = f.lowest;
    var warn = f.firstNegative || f.firstLow;
    var week = function (w) { return 'the week of ' + weekLabel(w.start) + ' (' + w.start + ')'; };
    var going = function (w) { var out = biggest(w); return out ? ', when ' + out + ' go out' : ''; };
    if (!warn) {
      return 'Cash stays above the ' + money(f.cushionCents) + ' cushion for all ' + WEEKS + ' weeks; the tightest is ' + week(low) + ', ending at ' + money(low.closeCents) + going(low) + '.';
    }
    return (
      (f.firstNegative ? 'Cash runs out in ' : 'Cash first drops below the ' + money(f.cushionCents) + ' cushion in ') + week(warn) +
      ', ending at ' + money(warn.closeCents) + going(warn) + '. ' +
      (low === warn ? 'That is the tightest week.' : 'The tightest is ' + week(low) + ', ending at ' + money(low.closeCents) + '.')
    );
  }
  function compareLine(name, plan, alt) {
    var low = alt.lowest;
    return (
      name + ': tightest week ' + weekLabel(low.start) + ' at ' + money(low.closeCents) +
      ' (plan: ' + weekLabel(plan.lowest.start) + ' at ' + money(plan.lowest.closeCents) + ')' +
      (alt.firstNegative
        ? '; runs out in the week of ' + weekLabel(alt.firstNegative.start)
        : alt.firstLow
          ? '; below the cushion from the week of ' + weekLabel(alt.firstLow.start)
          : '; never below the cushion') +
      '; ends the 13 weeks at ' + money(alt.endCents) + ' (plan ' + money(plan.endCents) + ')'
    );
  }
  function itemLine(r, records) {
    var f = r.fields || {};
    if (f.change === 'delay' || f.change === 'drop') {
      var target = records.filter(function (x) { return x.id === f.itemId; })[0];
      var what = target ? target.fields.name + ' (' + target.id + ')' : f.itemId;
      return r.id + ' [what-if ' + f.scenario + '] ' + (f.change === 'drop' ? 'drop ' + what : 'delay ' + what + ' by ' + f.weeks + (Number(f.weeks) === 1 ? ' week' : ' weeks'));
    }
    return (
      r.id + (r.status === 'whatif' ? ' [what-if ' + f.scenario + '] add ' : ' ') + f.name + ': ' + (f.direction === 'in' ? 'in ' : 'out ') +
      money(f.amountCents || 0) + ' ' + (f.recurs && f.recurs !== 'none' ? RECURS_TEXT[f.recurs] + ' from ' + f.date + (f.until ? ' until ' + f.until : '') : 'on ' + f.date) +
      (r.status === 'done' ? ' (done)' : '')
    );
  }
  function cashPicture(file, nowMs, scenario) {
    var records = (file && file.records) || [];
    var plan = forecast(file, null, nowMs);
    var view = scenario ? forecast(file, scenario, nowMs) : plan;
    var planned = records.filter(function (r) { return r.status === 'expected'; }).length;
    if (!plan.hasBalance && !planned) {
      return { plan: plan, view: view, summary: 'The plan is empty: no bank balance and no expected income or bills yet. Ask for today’s bank balance, the regular bills (payroll, rent, suppliers) and the invoices still to be paid.' };
    }
    var parts = [(scenario ? 'With the what-if ' + scenario + ': ' : '') + tightLine(view)];
    parts.push(
      plan.hasBalance
        ? 'Cash in the bank: ' + money(plan.balanceCents) + ' as of ' + plan.asOf + ' (cushion ' + money(plan.cushionCents) + ').' +
            (daysBetween(plan.asOf, plan.today) > 7 ? ' That balance is ' + daysBetween(plan.asOf, plan.today) + ' days old; a fresh one sharpens the forecast.' : '')
        : 'No bank balance yet, so the forecast starts from zero. Ask for today’s balance.',
    );
    if (view.late.length) {
      parts.push('Late, counted in this week until it arrives or is moved: ' + view.late.map(function (i) { return i.name + ' (' + i.id + ', ' + (i.direction === 'in' ? 'in ' : 'out ') + money(i.amountCents) + ', expected ' + i.day + ')'; }).join('; ') + '.');
    }
    parts.push(
      'Week by week, ending balance: ' +
        view.weeks.map(function (wk) { return weekLabel(wk.start) + ' ' + money(wk.closeCents) + ' (in ' + money(wk.inCents) + ', out ' + money(wk.outCents) + ')'; }).join(' | ') + '.',
    );
    parts.push('Over 13 weeks: in ' + money(view.inCents) + ', out ' + money(view.outCents) + ', ending at ' + money(view.endCents) + '.');
    var names = scenarioNames(records);
    if (names.length) {
      parts.push('What-ifs: ' + names.map(function (n) { return compareLine(n, plan, forecast(file, n, nowMs)); }).join(' | ') + '.');
    }
    return { plan: plan, view: view, summary: parts.join(' ') };
  }
  // ── cashflow-rules-end ──
  // Brightline Electric's sample cash plan, dated from today so the demo never goes stale.
  function demoPlan(nowMs) {
    var today = localDay(nowMs);
    var at = function (n) { return addDays(today, n); };
    var nextFirst = addMonths(today.slice(0, 8) + '01', 1);
    var rows = [
      ['Payroll', 'out', 585000, at(4), 'biweekly'],
      ['Cascade Electric Supply account', 'out', 320000, at(12), 'monthly'],
      ['Shop rent', 'out', 160000, nextFirst, 'monthly'],
      ['Van loan', 'out', 68400, at(19), 'monthly'],
      ['Ridgeway Insurance', 'out', 123600, at(40), 'quarterly'],
      ['Estimated tax payment', 'out', 450000, at(58), 'none'],
      ['Delgado Trenching', 'out', 190000, at(26), 'none'],
      ['Alder Street remodel, final invoice', 'in', 960000, at(-6), 'none'],
      ['Service calls (weekly average)', 'in', 140000, at(5), 'weekly'],
      ['Kim residence panel upgrade', 'in', 325000, at(9), 'none'],
      ['Ridgeview Apartments service contract', 'in', 240000, at(15), 'monthly'],
      ['Hollis Bakery lighting retrofit', 'in', 720000, at(33), 'none'],
      ['Juniper Press warehouse lighting', 'in', 1240000, at(47), 'none'],
      ['Fernwood Studio office rewire', 'in', 580000, at(68), 'none'],
    ];
    var stamp = new Date(nowMs).toISOString();
    var records = rows.map(function (r, i) {
      return {
        id: 'cf-' + (i + 1), status: 'expected', createdAt: stamp, updatedAt: stamp, history: [],
        fields: { name: r[0], direction: r[1], amountCents: r[2], date: r[3], recurs: r[4], dom: Number(r[3].slice(8, 10)) },
      };
    });
    records.push({
      id: 'cf-15', status: 'whatif', createdAt: stamp, updatedAt: stamp, history: [],
      fields: { scenario: 'Lose the Ridgeview contract', change: 'drop', itemId: 'cf-11' },
    });
    return {
      version: 1,
      stages: ['expected', 'whatif', 'done', 'removed'],
      currency: 'USD',
      balance: { amountCents: 984000, asOf: today },
      cushionCents: 1200000,
      records: records,
    };
  }
  var MONTH_WORDS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
  var NUMBER_WORDS = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, eight: 8 };

  function cash(cents) { return (cents < 0 ? '-$' : '$') + money(Math.abs(cents)).replace(/\.00$/, ''); }
  function state(ctx) {
    return ctx.read('cashflow.json').then(function (file) {
      file = file || { records: [] };
      return { file: file, records: file.records || [], plan: forecast(file, null, Date.now()) };
    });
  }
  function warnText(f) {
    var w = f.firstNegative || f.firstLow;
    if (!w) return 'cash stays above the ' + cash(f.cushionCents) + ' cushion for all 13 weeks (tightest: the week of ' + weekLabel(f.lowest.start) + ', at ' + cash(f.lowest.closeCents) + ')';
    return (f.firstNegative ? 'cash runs out in the week of ' : 'cash first dips below the ' + cash(f.cushionCents) + ' cushion in the week of ') + weekLabel(w.start) + ', ending at ' + cash(w.closeCents);
  }
  function outsOf(week) {
    return week.items.filter(function (i) { return i.direction === 'out'; }).sort(function (a, b) { return b.amountCents - a.amountCents; }).slice(0, 3).map(function (i) { return i.name + ' (' + cash(i.amountCents) + ')'; });
  }
  function joinWords(parts) { return parts.length < 2 ? parts.join('') : parts.slice(0, -1).join(', ') + ' and ' + parts[parts.length - 1]; }
  function cap(text) { return text.charAt(0).toUpperCase() + text.slice(1); }
  function amountIn(text) {
    var m = text.match(/\$\s?([\d,]+(?:\.\d{1,2})?)\s*(k)?/i) || text.match(/\b([\d,]{3,}(?:\.\d{1,2})?)\b/);
    if (!m) return null;
    var cents = toCents(m[1]);
    return cents && m[2] ? cents * 1000 : cents;
  }
  function weeksIn(text) {
    var lower = text.toLowerCase();
    var m = lower.match(/\b(\d+|a|an|one|two|three|four|five|six|eight)\s+(week|month)s?\b/);
    if (!m) return /\blate\b/.test(lower) ? 4 : null;
    var n = Number(m[1]) || NUMBER_WORDS[m[1]] || 1;
    return m[2] === 'month' ? n * 4 : n;
  }
  // The expected item the person means: the one whose name shares the most words with what they wrote.
  function findItem(records, text) {
    var words = (text.toLowerCase().match(/[a-z]{3,}/g) || []).filter(function (w) {
      return ['the', 'and', 'our', 'for', 'was', 'has', 'got', 'are', 'all', 'came', 'what', 'paid', 'pays', 'late', 'month', 'week', 'weeks', 'today', 'invoice', 'with', 'from', 'lose', 'lost'].indexOf(w) < 0;
    });
    var best = null, score = 0;
    records.forEach(function (r) {
      if (r.status !== 'expected') return;
      var name = String(r.fields.name).toLowerCase();
      var hits = words.filter(function (w) { return name.indexOf(w) >= 0; }).length;
      if (hits > score) { best = r; score = hits; }
    });
    return best;
  }
  function nextDayOfMonth(day) {
    var today = localDay(Date.now()), candidate = today.slice(0, 8) + (day < 10 ? '0' + day : String(day));
    return candidate > today ? candidate : addMonths(candidate, 1, day);
  }
  function compare(name, plan, alt) {
    var w = alt.firstNegative || alt.firstLow, pw = plan.firstNegative || plan.firstLow;
    return '- Tightest week: ' + weekLabel(alt.lowest.start) + ' at ' + cash(alt.lowest.closeCents) + ' (the plan: ' + weekLabel(plan.lowest.start) + ' at ' + cash(plan.lowest.closeCents) + ')\n' +
      '- ' + (alt.firstNegative ? '**Runs out in the week of ' + weekLabel(w.start) + '**' : w ? 'Below the cushion from the week of ' + weekLabel(w.start) : 'Never below the cushion') +
      (pw ? ' (the plan: ' + weekLabel(pw.start) + ')' : ' (the plan never dips)') + '\n' +
      '- After 13 weeks: ' + cash(alt.endCents) + ' (the plan: ' + cash(plan.endCents) + ')';
  }

  function tight(ctx) {
    return ctx.invoke('cash_forecast', {}, '13 weeks ahead').then(function () { return state(ctx); }).then(function (s) {
      var f = s.plan, w = f.firstNegative || f.firstLow;
      var late = f.late.map(function (i) { return i.name + ' (' + cash(i.amountCents) + ', due ' + weekLabel(i.day) + ')'; });
      if (!f.hasBalance) return 'I need today’s bank balance first. Tell me what is in the account and I’ll run the 13 weeks.';
      var head = w
        ? cap(warnText(f)) + ', when ' + joinWords(outsOf(w)) + ' go out in the same week.'
        : cap(warnText(f)) + '.';
      var low = w && w !== f.lowest ? ' The tightest point is the week of ' + weekLabel(f.lowest.start) + ', at ' + cash(f.lowest.closeCents) + '.' : '';
      return head + low + '\n\n' +
        (late.length ? 'That already counts ' + joinWords(late) + ' as arriving this week. If it slips, every week after it is lower by the same amount, so it is the one to chase.' : 'Nothing expected is late.') +
        '\n\nCash in the bank today: ' + cash(f.balanceCents) + '.';
    });
  }

  function settle(ctx, text) {
    return state(ctx).then(function (s) {
      var rec = findItem(s.records, text);
      if (!rec) return 'Which one came in? Name it, like “Alder Street paid the $9,600 today”.';
      var cents = amountIn(text);
      var input = { item: rec.id };
      if (cents && cents !== rec.fields.amountCents) input.amount = cents / 100;
      var before = s.plan;
      return ctx.invoke('settle_cash_item', input, rec.fields.name).then(function () { return state(ctx); }).then(function (after) {
        var moved = (after.plan.firstLow || {}).start !== (before.firstLow || {}).start || after.plan.lowest.closeCents !== before.lowest.closeCents;
        var thisWeek = before.weeks[0].items.some(function (i) { return i.id === rec.id; });
        return 'Recorded: **' + rec.fields.name + '** ' + (rec.fields.direction === 'in' ? 'came in' : 'was paid') + ', ' + cash(input.amount ? cents : rec.fields.amountCents) + '. Cash in the bank is now ' + cash(after.plan.balanceCents) + '.\n\n' +
          (moved
            ? 'The forecast moved: ' + warnText(after.plan) + '.'
            : thisWeek
              ? 'The forecast holds steady, because I was already counting it this week; now it is money in the bank rather than a promise. Still, ' + warnText(after.plan) + '.'
              : 'It was expected on ' + weekLabel(rec.fields.date) + ', so only the weeks before then change. Still, ' + warnText(after.plan) + '.');
      });
    });
  }

  function whatIf(ctx, text) {
    var lower = text.toLowerCase();
    return state(ctx).then(function (s) {
      var amount = amountIn(text), item = findItem(s.records, text), input;
      if (/\b(hire|hiring|add|buy|lease|new)\b/.test(lower) && amount) {
        var who = (lower.match(/\b(?:hire|hiring)\s+(?:an?\s+)?([a-z]+)/) || [])[1];
        var payroll = s.records.filter(function (r) { return r.status === 'expected' && /payroll/i.test(r.fields.name); })[0];
        var start = payroll ? payroll.fields.date : localDay(Date.now() + 7 * 86400000);
        var three = lower.match(/\bin (\w+) weeks?\b/);
        if (three) start = addDays(localDay(Date.now()), 7 * (Number(three[1]) || NUMBER_WORDS[three[1]] || 1));
        var recurs = normalizeRecurs(lower) || (who ? 'biweekly' : 'none');
        var name = who ? cap(who) + ' wages' : 'New cost';
        input = { scenario: who ? 'Hire ' + (/^[aeiou]/.test(who) ? 'an ' : 'a ') + who : 'New cost', change: 'add', name: name, direction: 'out', amount: amount / 100, date: start, recurs: recurs };
      } else if (item && /\b(lose|lost|drop|cancel|cancels|cancelled|without)\b/.test(lower)) {
        input = { scenario: 'Lose ' + item.fields.name.split(/[,(]/)[0].trim(), change: 'drop', item: item.id };
      } else if (item) {
        var weeks = weeksIn(text) || 4;
        input = { scenario: item.fields.name.split(/[ ,]/)[0] + ' ' + item.fields.name.split(/[ ,]/)[1] + ' pays ' + (weeks % 4 === 0 ? (weeks === 4 ? 'a month' : weeks / 4 + ' months') : weeks + ' weeks') + ' late', change: 'delay', item: item.id, weeks: weeks };
      } else {
        return 'What should I try? For example “what if Hollis Bakery pays a month late?” or “what if we hire an apprentice at $1,900 every two weeks?”.';
      }
      // A what-if that already makes this change keeps its name, so the board never shows the same scenario twice.
      if (input.item) {
        var same = s.records.filter(function (r) { return r.status === 'whatif' && r.fields.itemId === input.item && r.fields.change === input.change; })[0];
        if (same) input.scenario = same.fields.scenario;
      }
      return ctx.invoke('what_if', input, 'What if: ' + input.scenario).then(function () { return state(ctx); }).then(function (after) {
        var names = scenarioNames(after.records), scenario = names.filter(function (n) { return n.toLowerCase() === input.scenario.toLowerCase(); })[0] || input.scenario;
        var alt = forecast(after.file, scenario, Date.now());
        return 'I tried **' + scenario + '** as a what-if; the plan itself is unchanged.\n' + compare(scenario, after.plan, alt) + '\n\n' +
          (alt.firstNegative ? 'That runs the account dry, so it would need a plan first: chase an invoice, move a bill, or start later.' : (alt.firstLow || {}).start && (!(after.plan.firstLow) || alt.firstLow.start < after.plan.firstLow.start) ? 'It brings the warning week forward, so I’d keep an eye on it.' : 'The plan absorbs it.') +
          ' It sits beside the plan under What-ifs; tell me to clear it whenever you like.';
      });
    });
  }

  function add(ctx, text) {
    var lower = text.toLowerCase();
    var cents = amountIn(text);
    var nameMatch = text.match(/\badd (?:the |a |an |our )?(.+?)(?:,|\s+\$|\s+at\b|\s+for\b|$)/i);
    if (!cents || !nameMatch) return Promise.resolve('Tell me what it is, how much and when, like “add the new van insurance, $310 a month from the 15th”.');
    var name = cap(nameMatch[1].replace(/^new\s+/i, '').trim());
    var dayMatch = lower.match(/\b(?:the\s+)?(\d{1,2})(?:st|nd|rd|th)\b/);
    var monthMatch = lower.match(new RegExp('\\b(' + MONTH_WORDS.join('|') + ')\\s+(\\d{1,2})'));
    var date = monthMatch ? localDay(Date.parse(new Date().getFullYear() + '-' + String(MONTH_WORDS.indexOf(monthMatch[1]) + 1).padStart(2, '0') + '-' + String(monthMatch[2]).padStart(2, '0') + 'T12:00:00')) : dayMatch ? nextDayOfMonth(Number(dayMatch[1])) : localDay(Date.now() + 7 * 86400000);
    var recurs = /\ba month|monthly|every month\b/.test(lower) ? 'monthly' : normalizeRecurs(lower) || 'none';
    var direction = /\b(invoice|income|payment from|pays us|deposit|retainer)\b/.test(lower) ? 'in' : 'out';
    return state(ctx).then(function (s) {
      var before = s.plan;
      return ctx.invoke('add_cash_item', { name: name, direction: direction, amount: cents / 100, date: date, recurs: recurs }, name + ', ' + cash(cents)).then(function () { return state(ctx); }).then(function (after) {
        var bw = before.firstNegative || before.firstLow, aw = after.plan.firstNegative || after.plan.firstLow;
        return 'Added **' + name + '**: ' + (direction === 'in' ? 'in ' : 'out ') + cash(cents) + ' ' + (recurs === 'none' ? 'on ' : RECURS_TEXT[recurs] + ' from ') + weekLabel(date) + '.\n\n' +
          (aw && (!bw || aw.start !== bw.start) ? 'That moves the warning week: ' + warnText(after.plan) + '.' : 'The warning week stays where it was: ' + warnText(after.plan) + '. Over 13 weeks the plan now ends at ' + cash(after.plan.endCents) + '.');
      });
    });
  }

  function setBalance(ctx, text) {
    var cents = amountIn(text);
    if (!cents) return Promise.resolve('How much is in the bank? A number like “$14,200” is enough.');
    return ctx.invoke('set_balance', { amount: cents / 100 }, 'Balance ' + cash(cents)).then(function () { return state(ctx); }).then(function (s) {
      return 'Saved: ' + cash(cents) + ' in the bank as of today. With that, ' + warnText(s.plan) + '.';
    });
  }

  function clearWhatIf(ctx, text) {
    return state(ctx).then(function (s) {
      var names = scenarioNames(s.records);
      var lower = text.toLowerCase();
      var name = names.filter(function (n) { return n.toLowerCase().split(/\s+/).some(function (w) { return w.length > 3 && lower.indexOf(w) >= 0; }); })[0] || names[names.length - 1];
      if (!name) return 'There are no what-ifs to clear.';
      return ctx.invoke('what_if', { scenario: name, change: 'clear' }, 'Clear ' + name).then(function () { return 'Cleared the what-if **' + name + '**. The plan never changed.'; });
    });
  }

  var start = forecast(demoPlan(Date.now()), null, Date.now());
  var firstWarn = start.firstNegative || start.firstLow;
  return {
    name: 'Gijs',
    role: 'Bookkeeper',
    greeting: 'Hello, I’m Gijs. I keep Brightline Electric’s cash plan. ' + (firstWarn ? 'Cash first dips below the ' + cash(start.cushionCents) + ' cushion in the week of ' + weekLabel(firstWarn.start) : 'Cash holds above the cushion for 13 weeks') + ', and the Alder Street invoice is six days late.',
    suggestions: [
      'When does cash get tight?',
      'Alder Street paid the $9,600 today',
      'What if Hollis Bakery pays a month late?',
      'What if we hire an apprentice at $1,900 every two weeks?',
      'Add the new van insurance, $310 a month from the 15th',
    ],
    respond: function (text, ctx) {
      var lower = text.toLowerCase();
      if (/\b(clear|forget|drop|remove)\b.*\bwhat-?if\b/.test(lower)) return clearWhatIf(ctx, text);
      if (/\bwhat if\b|\bwhat happens if\b|\bsuppose\b/.test(lower)) return whatIf(ctx, text);
      if (/\b(balance|in the bank|bank has|we have)\b/.test(lower) && /\d/.test(text)) return setBalance(ctx, text);
      if (/^\s*add\b|\bnew (bill|invoice|cost)\b/.test(lower)) return add(ctx, text);
      if (/\b(paid|came in|received|cleared|got the)\b/.test(lower)) return settle(ctx, text);
      if (/\b(tight|low|short|forecast|runway|cash|when|weeks)\b/.test(lower)) return tight(ctx);
      return null;
    },
    reactions: {
      page_set_balance: function (input, output, ctx) {
        return state(ctx).then(function (s) { return 'Saved ' + cash(toCents(input.amount) || 0) + ' as the bank balance. ' + cap(warnText(s.plan)) + '.'; });
      },
      page_add_cash_item: function (input, output, ctx) {
        return state(ctx).then(function (s) { return 'Added ' + input.name + ' to the plan. ' + cap(warnText(s.plan)) + '.'; });
      },
      page_settle_cash_item: function (input, output, ctx) {
        return state(ctx).then(function (s) { return 'Marked it done. Cash in the bank: ' + cash(s.plan.balanceCents) + '. ' + cap(warnText(s.plan)) + '.'; });
      },
      page_what_if: function (input, output, ctx) {
        return state(ctx).then(function (s) {
          var name = scenarioNames(s.records).filter(function (n) { return n.toLowerCase() === String(input.scenario || '').trim().toLowerCase(); })[0];
          if (!name) return 'Tried it. The plan itself is unchanged.';
          var alt = forecast(s.file, name, Date.now());
          return 'With “' + name + '”, ' + warnText(alt) + '. The plan itself is unchanged.';
        });
      },
    },
  };
})();

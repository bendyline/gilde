// The standalone demo's sample conversation. In Gezel, the office
// administrator's replies come from the model the person chooses; here they
// are scripted, and every change goes through the same tools the crew calls.
window.demoChat = (function () {
  'use strict';
  var DAY = 86400000;
  var WINDOW = 90;
  var MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];

  function pad(n) { return n < 10 ? '0' + n : String(n); }
  function iso(ms) { var d = new Date(ms); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function noon(day) { return new Date(String(day).slice(0, 10) + 'T12:00:00'); }
  function addDays(day, n) { var d = noon(day); d.setDate(d.getDate() + n); return iso(d.getTime()); }
  function addMonths(day, months) {
    var d = noon(day), date = d.getDate();
    d.setDate(1); d.setMonth(d.getMonth() + months);
    d.setDate(Math.min(date, new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()));
    return iso(d.getTime());
  }
  function daysLeft(day) { return Math.round((Date.parse(String(day).slice(0, 10) + 'T00:00:00') - Date.parse(iso(Date.now()) + 'T00:00:00')) / DAY); }
  function niceDate(day) { return noon(day).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }); }
  function shortDate(day) { return noon(day).toLocaleDateString('en-US', { month: 'long', day: 'numeric' }); }
  function money(cents) { return '$' + (Math.round(Number(cents) || 0) / 100).toLocaleString('en-US', { maximumFractionDigits: 2 }); }
  function inDays(n) { return n < 0 ? -n + (n === -1 ? ' day ago' : ' days ago') : n === 0 ? 'today' : 'in ' + n + (n === 1 ? ' day' : ' days'); }
  function yes(value) { return /^(yes|true)$/i.test(String(value == null ? '' : value)); }
  function months(f) { return Number(f.renewMonths) > 0 ? Math.round(Number(f.renewMonths)) : 12; }
  function term(f) { return months(f) === 1 ? 'for another month' : 'for another ' + months(f) + ' months'; }
  function view(r) {
    var f = r.fields || {}, first = f.endAt ? String(f.endAt).slice(0, 10) : null, end = first;
    if (end && yes(f.autoRenew) && r.status !== 'cancelling' && r.status !== 'ended') {
      for (var k = 1; k <= 600 && daysLeft(end) < 0; k++) end = addMonths(first, k * months(f));
    }
    var by = end ? addDays(end, -(f.noticeDays === undefined ? 30 : Number(f.noticeDays))) : null;
    return { end: end, noticeBy: by, auto: yes(f.autoRenew), toNotice: by ? daysLeft(by) : null, toEnd: end ? daysLeft(end) : null };
  }
  function stateOf(r, days) {
    var v = view(r);
    if (r.status === 'ended') return 'ended';
    if (!v.end) return 'undated';
    if (r.status === 'cancelling') return v.toEnd < 0 ? 'ended' : 'cancelling';
    if (v.auto) return v.toNotice < 0 ? 'locked' : v.toNotice <= days ? 'notice' : 'later';
    if (v.toEnd < 0) return 'expired';
    return v.toNotice <= days ? 'ending' : 'later';
  }

  function state(ctx) {
    return Promise.all([ctx.read('contracts.json'), ctx.read('vendors.json')]).then(function (v) {
      return { contracts: (v[0] && v[0].records) || [], vendors: (v[1] && v[1].records) || [] };
    });
  }
  function live(s) { return s.contracts.filter(function (r) { return stateOf(r, WINDOW) !== 'ended'; }); }
  // The contract the person means: the one whose name and vendor share the most words with what they wrote.
  function find(s, text) {
    var words = (text.toLowerCase().match(/[a-z]{3,}/g) || []).filter(function (w) { return ['the', 'our', 'and', 'for', 'with', 'contract', 'today', 'another', 'year', 'price', 'raised'].indexOf(w) < 0; });
    var best = null, score = 0;
    s.contracts.forEach(function (r) {
      if (stateOf(r, WINDOW) === 'ended') return;
      var hay = (r.fields.title + ' ' + (r.fields.vendor || '')).toLowerCase();
      var hits = words.filter(function (w) { return hay.indexOf(w.replace(/s$/, '')) >= 0; }).length;
      if (hits > score) { best = r; score = hits; }
    });
    return best;
  }
  function reference(text) {
    var m = text.match(/\b([A-Z]{1,4}-?\d[\w-]{2,})\b/);
    return m ? m[1] : '';
  }
  function amount(text) {
    var m = text.match(/\$\s?([\d,]+(?:\.\d{1,2})?)/);
    if (!m) return null;
    var value = Number(m[1].replace(/,/g, ''));
    var monthly = /\b(a|per|each)\s+month\b|\bmonthly\b|\/\s?mo\b/i.test(text.slice(m.index));
    return { value: value, monthly: monthly };
  }
  function dates(text) { return text.replace(/\b(\d{4}-\d{2}-\d{2})\b/g, function (d) { return niceDate(d); }); }

  function decisions(ctx, days) {
    return ctx.invoke('contracts_status', { withinDays: days }, 'Next ' + days + ' days').then(function () { return state(ctx); }).then(function (s) {
      var order = function (r) { var v = view(r), k = stateOf(r, days); return k === 'expired' ? -100000 + v.toEnd : k === 'locked' ? -50000 + v.toEnd : v.toNotice; };
      var due = s.contracts.filter(function (r) { return ['expired', 'locked', 'notice', 'ending'].indexOf(stateOf(r, days)) >= 0; }).sort(function (a, b) { return order(a) - order(b); });
      if (!due.length) {
        var next = live(s).filter(function (r) { return stateOf(r, days) === 'later'; }).sort(function (a, b) { return view(a).toNotice - view(b).toNotice; })[0];
        return 'Nothing needs a decision in the next ' + days + ' days.' + (next ? ' The next date is ' + niceDate(view(next).noticeBy) + ', the notice date for the ' + next.fields.title.toLowerCase() + '.' : '');
      }
      var actionable = due.filter(function (r) { return stateOf(r, days) !== 'locked'; })[0];
      // Kept short: a reply taller than the conversation stops it following later turns.
      return due.length + (due.length === 1 ? ' contract needs' : ' contracts need') + ' a decision in the next ' + days + ' days, most urgent first:\n' + due.map(function (r) {
        var v = view(r), k = stateOf(r, days), f = r.fields;
        var what = k === 'locked' ? 'notice date passed; renews on its own ' + shortDate(v.end)
          : k === 'notice' ? 'give notice by ' + shortDate(v.noticeBy) + ', or it renews ' + shortDate(v.end)
          : k === 'expired' ? 'ended ' + shortDate(v.end) + ' with no renewal on record'
          : 'ends ' + shortDate(v.end) + ' and doesn’t renew; decide by ' + shortDate(v.noticeBy);
        return '- **' + f.title + '**' + (r.status === 'reviewing' ? ' (under review)' : '') + ': ' + what + '.';
      }).join('\n') + (actionable ? '\n\nThe ' + actionable.fields.title.toLowerCase() + ' is the next date to act on, ' + inDays(view(actionable).toNotice) + '.' : '');
    });
  }

  function renewed(ctx, text) {
    return state(ctx).then(function (s) {
      var r = find(s, text);
      if (!r) return 'Which contract was renewed? Tell me its name, like “we renewed the linen service”.';
      var price = amount(text), before = r.fields.annualCents;
      var input = { id: r.id };
      if (price) input[price.monthly ? 'monthlyCost' : 'annualCost'] = price.value;
      var ref = reference(text);
      if (ref) input.note = 'Renewed; reference ' + ref + '.';
      return ctx.invoke('renew_contract', input, r.fields.title).then(function () { return state(ctx); }).then(function (after) {
        var now = after.contracts.find(function (x) { return x.id === r.id; }), v = view(now), cents = now.fields.annualCents;
        var change = cents !== before && before ? ' That’s ' + money(Math.abs(cents - before)) + (cents > before ? ' more' : ' less') + ' than last term, about ' + Math.round(Math.abs(cents - before) / before * 100) + '%.' : '';
        return 'Recorded: **' + now.fields.title + '** now runs through ' + niceDate(v.end) + ' at ' + money(cents) + ' a year.' + change +
          (v.auto ? ' The next notice date is ' + niceDate(v.noticeBy) + ', and I’ll remind you two weeks before it.' : '') +
          ' If ' + now.fields.vendor + ' sent a renewal letter, drop it into Contract files so it sits beside the record.';
      });
    });
  }

  function notice(ctx, text) {
    return state(ctx).then(function (s) {
      var r = find(s, text);
      if (!r) return 'Which contract did you give notice on? Name it, like “we gave notice on the water cooler rental”.';
      var ref = reference(text), v = view(r);
      var note = 'Notice given' + (ref ? ', reference ' + ref : '') + '.';
      return ctx.invoke('cancel_contract', { id: r.id, note: note }, r.fields.title).then(function () {
        return 'Recorded: notice is in for **' + r.fields.title + '**' + (ref ? ', reference ' + ref : '') + '. It ends ' + niceDate(v.end) + ', which takes ' + money(r.fields.annualCents) + ' a year off the desk.' +
          (v.auto && v.toNotice < 0 ? ' Its notice date had already passed, so ask ' + r.fields.vendor + ' in writing to confirm it won’t renew for one more term.' : ' Ask ' + r.fields.vendor + ' to confirm the end date in writing, and drop their reply into Contract files.');
      });
    });
  }

  function priceChange(ctx, text) {
    return state(ctx).then(function (s) {
      var r = find(s, text);
      if (!r) return 'Whose price changed? Name the vendor or the contract, like “Fogline raised the coffee price 6%”.';
      var pct = text.match(/(-?\d+(?:\.\d+)?)\s*%/), price = amount(text), down = /\b(cut|lowered|dropped|discount|less)\b/i.test(text);
      var input = { id: r.id };
      if (pct) input.percentChange = Number(pct[1]) * (down ? -1 : 1);
      else if (price && price.monthly) input.monthlyChange = price.value * (down ? -1 : 1);
      else if (price) input.annualCost = price.value;
      else return 'By how much? A percentage or a monthly amount is enough, like “6%” or “$40 a month more”.';
      var before = r.fields.annualCents;
      return ctx.invoke('add_contract', Object.assign({ title: r.fields.title }, input), r.fields.title + ': new price').then(function () { return state(ctx); }).then(function (after) {
        var now = after.contracts.find(function (x) { return x.id === r.id; }), v = view(now);
        return 'Updated **' + now.fields.title + '**: ' + money(before) + ' becomes ' + money(now.fields.annualCents) + ' a year, ' + money(Math.abs(now.fields.annualCents - before)) + (now.fields.annualCents >= before ? ' more.' : ' less.') +
          (v.auto && v.toNotice >= 0 ? ' Its notice date is ' + niceDate(v.noticeBy) + ', so there’s time to get a quote from another ' + (now.fields.category === 'food' ? 'supplier' : 'vendor') + ' first if you want one.' : '');
      });
    });
  }

  function added(ctx, text) {
    var lower = text.toLowerCase();
    var title = (text.match(/\badd\s+(?:our|the|a|an)?\s*(.+?)\s+(?:contract|agreement|plan)\b/i) || text.match(/\badd\s+(?:our|the|a|an)?\s*([^,]+?)(?:\s+with\b|,|$)/i) || [])[1];
    if (!title) return Promise.resolve('What should I add? Give me the contract, the vendor, the price and when it renews, like “add our pest control contract with Greenleaf, $95 a month, auto-renews June 30”.');
    title = title.trim().replace(/^./, function (c) { return c.toUpperCase(); });
    var vendor = (text.match(/\bwith\s+([^,.;]+)/i) || [])[1];
    var due = null, m = lower.match(new RegExp('\\b(' + MONTHS.join('|') + ')\\s+(\\d{1,2})'));
    if (m) {
      var year = new Date().getFullYear(), candidate = year + '-' + pad(MONTHS.indexOf(m[1]) + 1) + '-' + pad(Number(m[2]));
      due = daysLeft(candidate) < 0 ? year + 1 + candidate.slice(4) : candidate;
    }
    if (!due) return Promise.resolve('When does the current term of the ' + title.toLowerCase() + ' end? A date like “June 30” is enough.');
    var price = amount(text), noticeDays = (lower.match(/(\d{1,3})\s*days?['’]?\s*notice/) || [])[1];
    var category = /pest|clean|waste|repair|security|landscap|window/.test(lower) ? 'services' : /software|app\b|subscription/.test(lower) ? 'software' : /linen|towel|apron/.test(lower) ? 'linen' : /coffee|produce|food|bakery|milk|dairy|bread/.test(lower) ? 'food' : /lease|rent\b/.test(lower) ? 'premises' : /insur/.test(lower) ? 'insurance' : /power|electric|gas|internet|phone/.test(lower) ? 'utilities' : 'other';
    var input = { title: title, category: category, endAt: due, autoRenew: /auto-?renew|renews (on its own|automatically)/.test(lower) ? 'yes' : 'no' };
    if (vendor) input.vendor = vendor.trim();
    if (price) input[price.monthly ? 'monthlyCost' : 'annualCost'] = price.value;
    if (noticeDays) input.noticeDays = Number(noticeDays);
    return ctx.invoke('add_contract', input, title + (vendor ? ' with ' + vendor.trim() : '')).then(function () { return state(ctx); }).then(function (s) {
      var r = s.contracts.filter(function (x) { return x.fields.title === title; })[0];
      var v = r ? view(r) : null;
      return 'Added **' + title + '**' + (vendor ? ' with ' + vendor.trim() : '') + (r && r.fields.annualCents ? ': ' + money(r.fields.annualCents) + ' a year' : '') + '. ' +
        (v && v.auto ? 'It renews on its own on ' + niceDate(v.end) + ', so notice is due by ' + niceDate(v.noticeBy) + '; I’ll remind you two weeks before.' : 'It ends ' + niceDate(due) + '.') +
        ' Who looks after it? Tell me and I’ll put their name on it.';
    });
  }

  function spend(ctx) {
    return ctx.invoke('contracts_status', {}, 'Yearly spend').then(function () { return state(ctx); }).then(function (s) {
      var rows = live(s), total = rows.reduce(function (sum, r) { return sum + (Number(r.fields.annualCents) || 0); }, 0), by = {};
      rows.forEach(function (r) { by[r.fields.category || 'other'] = (by[r.fields.category || 'other'] || 0) + (Number(r.fields.annualCents) || 0); });
      var kinds = Object.keys(by).sort(function (a, b) { return by[b] - by[a]; });
      return 'The café spends ' + money(total) + ' a year across ' + rows.length + ' contracts. Biggest first:\n' + kinds.map(function (k) {
        return '- **' + k.charAt(0).toUpperCase() + k.slice(1) + '**: ' + money(by[k]) + ' (' + Math.round(by[k] / total * 100) + '%)';
      }).join('\n') + '\n\nThe lease is fixed, so food is where a price check pays off. In Gezel I can run the Subscription Audit plan to rank every contract by what it would save to switch or cancel.';
    });
  }

  function owner(ctx, text) {
    return state(ctx).then(function (s) {
      var r = find(s, text);
      if (!r) return 'Which contract? Name it and I’ll tell you who looks after it.';
      var vendor = s.vendors.find(function (v) { return v.id === r.fields.vendorId; });
      return '**' + r.fields.title + '** is ' + (r.fields.owner ? r.fields.owner + '’s' : 'nobody’s yet') + '. ' + r.fields.vendor + (vendor && vendor.fields.contact ? ': ' + vendor.fields.contact : '') + '.' + (r.fields.file ? ' The signed copy is in Contract files.' : '');
    });
  }

  return {
    name: 'Vera',
    role: 'Office Administrator',
    greeting: 'Hello, I’m Vera. I keep Harbor Street Café’s vendors and contracts in order. The linen service renews on its own unless you give notice in the next 12 days, and the waste pickup is already past its notice date.',
    suggestions: [
      'Which contracts need a decision in the next 90 days?',
      'We renewed the linen service for another year at $3,900',
      'We gave notice on the water cooler rental today, reference WC-5521',
      'Fogline Roasters raised the coffee price 6%',
      'Add our pest control contract with Greenleaf, $95 a month, auto-renews June 30, 30 days’ notice',
    ],
    respond: function (text, ctx) {
      var lower = text.toLowerCase();
      if (/\b(add|signed)\b/.test(lower)) return added(ctx, text);
      if (/\brenewed\b/.test(lower)) return renewed(ctx, text);
      if (/\b(gave|given|sent|served|put in)\b[^.]*\bnotice\b|\b(cancelled|canceled|terminated)\b/.test(lower)) return notice(ctx, text);
      if (/\b(raised|raising|increase|increased|went up|goes up|cut|lowered|dropped)\b|%/.test(lower)) return priceChange(ctx, text);
      if (/\b(decision|decide|due|coming up|renew|renews|renewal|notice|soon|next|deadline|expire|expiring|ending)\b/.test(lower)) {
        var days = Number((lower.match(/(\d{1,3})\s*days?/) || [])[1]) || WINDOW;
        return decisions(ctx, days);
      }
      if (/\b(spend|spent|money|cost|costs|budget|paying)\b/.test(lower)) return spend(ctx);
      if (/\b(who|owner|handles|contact|call)\b/.test(lower)) return owner(ctx, text);
      return null;
    },
    reactions: {
      page_renew_contract: function (input, output) {
        return output && output.summary ? dates(output.summary.split('. ')[0]) + '. I’ll remind you two weeks before the next notice date.' : 'Recorded.';
      },
      page_cancel_contract: function (input, output) {
        return output && output.summary ? dates(output.summary.split('. ')[0]) + '. It stays on the desk until then.' : 'Recorded.';
      },
      page_add_contract: function (input) {
        return 'On the desk: ' + input.title + ', current term ending ' + niceDate(input.endAt) + '.' + (yes(input.autoRenew) ? ' It renews on its own, so I’ll remind you two weeks before its notice date.' : '');
      },
      page_add_vendor: function (input) {
        return input.vendor + ' is on the vendor list. Tell me about any contract with them and I’ll add it.';
      },
    },
  };
})();

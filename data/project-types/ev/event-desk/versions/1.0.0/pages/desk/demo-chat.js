// The standalone demo's sample conversation. In Gezel, the event planner's
// replies come from the model the person chooses; here they are scripted, and
// every change goes through the same tools the crew calls.
window.demoChat = (function () {
  'use strict';
  var DAY = 86400000;
  var DIETS = ['vegetarian', 'vegan', 'pescatarian', 'gluten-free', 'dairy-free', 'nut allergy', 'shellfish allergy', 'halal', 'kosher'];
  var COUNTS = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5 };

  function pad(n) { return n < 10 ? '0' + n : String(n); }
  function iso(ms) { var d = new Date(ms); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function daysLeft(day) { return Math.round((Date.parse(String(day).slice(0, 10) + 'T00:00:00') - Date.parse(iso(Date.now()) + 'T00:00:00')) / DAY); }
  function niceDate(day) { return new Date(String(day).slice(0, 10) + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }); }
  function money(cents) { var c = Math.round(Number(cents) || 0); return (c < 0 ? '-$' : '$') + String(Math.floor(Math.abs(c) / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, ',') + (Math.abs(c) % 100 ? '.' + pad(Math.abs(c) % 100) : ''); }
  function clock(hhmm) { var p = String(hhmm || '').split(':'), h = Number(p[0]); return isFinite(h) && p.length === 2 ? ((h % 12) || 12) + (p[1] === '00' ? '' : ':' + p[1]) + (h < 12 ? ' am' : ' pm') : String(hhmm || ''); }
  function plain(text) { return String(text || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase(); }
  function people(g) { var n = Number(g.fields && g.fields.partySize); return n >= 1 ? Math.round(n) : 1; }
  function names(list) { return list.length < 2 ? list.join('') : list.slice(0, -1).join(', ') + ' and ' + list[list.length - 1]; }

  function state(ctx) {
    return Promise.all(['event.json', 'venues.json', 'vendors.json', 'guests.json', 'budget.json'].map(function (p) { return ctx.read(p); })).then(function (v) {
      return { event: v[0] || {}, venues: (v[1] && v[1].records) || [], vendors: (v[2] && v[2].records) || [], guests: (v[3] && v[3].records) || [], entries: (v[4] && v[4].entries) || [] };
    });
  }
  function paid(s, vendor) { return s.entries.filter(function (e) { return e.data && e.data.vendorId === vendor.id; }).reduce(function (sum, e) { return sum + e.amountCents; }, 0); }
  // The record the person means: the one whose name shares the most words with what they wrote.
  function find(records, text) {
    var words = plain(text).match(/[a-z]{3,}/g) || [];
    var best = null, score = 0;
    records.forEach(function (r) {
      var name = plain(r.fields.name);
      var hits = words.filter(function (w) { return ['the', 'and', 'from', 'with'].indexOf(w) < 0 && name.split(/[^a-z]+/).indexOf(w) >= 0; }).length;
      if (hits > score) { best = r; score = hits; }
    });
    return best;
  }
  function budgetLine(s) {
    var live = s.vendors.filter(function (v) { return v.status === 'booked' || v.status === 'paid'; });
    var signed = live.reduce(function (sum, v) { return sum + (Number(v.fields.contractCents) || 0); }, 0);
    var out = s.entries.reduce(function (sum, e) { return sum + e.amountCents; }, 0);
    var budget = Number(s.event.budgetCents) || 0;
    return { signed: signed, paid: out, budget: budget, left: budget - signed };
  }

  function compare(ctx, text) {
    var asked = Number((text.match(/\b(\d{2,4})\b/) || [])[1]) || 0;
    return state(ctx).then(function (s) {
      var count = asked || s.event.headcount || 80;
      return ctx.invoke('compare_venues', { guests: count }, 'For ' + count + ' guests').then(function () {
        var rows = s.venues.filter(function (v) { return v.status !== 'declined'; }).map(function (v) {
          var f = v.fields, cap = Number(f.capacity) || 0, per = Number(f.cateringPerHeadCents) || 0, fee = Number(f.feeCents) || 0;
          return { v: v, cap: cap, fits: cap >= count, per: per, fee: fee, total: fee + per * count };
        });
        rows.sort(function (a, b) { return b.fits - a.fits || a.fee - b.fee; });
        var caterer = s.vendors.find(function (v) { return v.fields.category === 'catering' && (v.status === 'booked' || v.status === 'paid'); });
        var lines = rows.map(function (r) {
          var f = r.v.fields;
          return '- **' + f.name + '** holds ' + r.cap + (r.fits ? '' : ', ' + (count - r.cap) + ' short for ' + count) + ': ' + money(r.fee) + ' hire' +
            (r.per ? ' plus in-house catering at ' + money(r.per) + ' a guest, ' + money(r.total) + ' all in (' + money(Math.round(r.total / count)) + ' a guest)' : ', bring your own caterer') +
            '; sound and screens ' + (f.av === 'included' ? 'included' : 'extra') + '.';
        });
        var fit = rows.filter(function (r) { return r.fits; });
        var own = fit.filter(function (r) { return !r.per; });
        var advice = !fit.length ? 'None of them holds ' + count + ', so we need another option.'
          : caterer && own.length ? 'With ' + caterer.fields.name + ' already signed for catering, **' + own[0].v.fields.name + '** is the one that fits without paying for food twice' + (own[0].v.fields.av === 'included' ? ', and it includes sound and screens.' : '.')
          : '**' + fit[0].v.fields.name + '** is the lowest hire fee that fits ' + count + '.';
        return 'For ' + count + ' guests:\n' + lines.join('\n') + '\n\n' + advice + ' Say the word and I’ll book it.';
      });
    });
  }

  function book(ctx, text) {
    return state(ctx).then(function (s) {
      var venue = find(s.venues, text);
      if (!venue) return 'Which venue should I book? The shortlist has ' + names(s.venues.map(function (v) { return v.fields.name; })) + '.';
      return ctx.invoke('book_venue', { id: venue.id }, venue.fields.name).then(function () { return state(ctx); }).then(function (after) {
        var b = budgetLine(after);
        var held = after.venues.filter(function (v) { return v.status === 'held'; });
        return 'Booked **' + venue.fields.name + '**. Its ' + money(venue.fields.feeCents) + ' hire fee is now with the signed contracts, which leaves ' + money(b.left) + ' of the ' + money(b.budget) + ' budget to commit.' +
          (held.length ? ' ' + names(held.map(function (v) { return v.fields.name; })) + ' is still on hold for us; tell me and I’ll release it.' : '');
      });
    });
  }

  function dietary(ctx) {
    return ctx.invoke('event_status', {}, 'Guests and dietary answers').then(function () { return state(ctx); }).then(function (s) {
      var yes = s.guests.filter(function (g) { return g.status === 'yes'; });
      var missing = yes.filter(function (g) { return !g.fields.dietary; });
      var waiting = s.guests.filter(function (g) { return g.status === 'invited'; });
      var tally = {};
      yes.forEach(function (g) { var d = g.fields.dietary; if (d && d !== 'none') tally[d] = (tally[d] || 0) + 1; });
      var counts = Object.keys(tally).sort().map(function (d) { return d + ' ' + tally[d]; });
      if (!missing.length) return 'Everyone who’s coming has answered. The caterer’s count so far: ' + (counts.join(', ') || 'no special needs') + '.';
      return (missing.length === 1 ? 'One person coming' : missing.length + ' people coming') + ' still owe a dietary answer:\n' +
        missing.map(function (g) { return '- **' + g.fields.name + '** (' + (g.fields.company || 'no company') + ')' + (people(g) > 1 ? ', party of ' + people(g) : ''); }).join('\n') +
        (waiting.length ? '\n\n' + names(waiting.map(function (g) { return g.fields.name; })) + ' haven’t replied at all yet, so their answers will come with the RSVP.' : '') +
        '\n\nSo far the caterer’s count is ' + (counts.join(', ') || 'no special needs') + '. Want me to draft a short note asking for the missing answers?';
    });
  }

  function rsvp(ctx, text) {
    var lower = plain(text);
    return state(ctx).then(function (s) {
      var guest = find(s.guests, text);
      if (!guest) return 'Who answered? Give me their name as it is on the list, like “Ben Adler is a yes”.';
      var response = /\b(is a no|said no|can'?t|cannot|won'?t|declined|not coming)\b/.test(lower) ? 'no' : 'yes';
      var diet = DIETS.find(function (d) { return lower.indexOf(d) >= 0 || lower.indexOf(d.replace('-', ' ')) >= 0; }) || (/\b(no dietary|eats anything|no restrictions)\b/.test(lower) ? 'none' : '');
      var m = lower.match(/bringing (a|an|one|two|three|four|five|\d+)\s+(colleague|guest|plus.?one|person|people|others?|teammates?|colleagues)/);
      var joining = m ? COUNTS[m[1]] || Number(m[1]) || 0 : 0;
      var input = { id: guest.id, response: response };
      if (diet) input.dietary = diet;
      if (joining && response === 'yes') input.joining = joining;
      return ctx.invoke('record_rsvp', input, guest.fields.name + ': ' + response).then(function () { return state(ctx); }).then(function (after) {
        var g = after.guests.find(function (x) { return x.id === guest.id; });
        var coming = after.guests.filter(function (x) { return x.status === 'yes'; }).reduce(function (sum, x) { return sum + people(x); }, 0);
        var owed = after.guests.filter(function (x) { return x.status === 'yes' && !x.fields.dietary; }).length;
        if (response === 'no') return 'Noted: **' + g.fields.name + '** can’t make it. ' + coming + ' people are coming so far.';
        return 'Got it: **' + g.fields.name + '** is coming' + (people(g) > 1 ? ' with ' + (people(g) - 1 === 1 ? 'one colleague' : people(g) - 1 + ' colleagues') + ', a party of ' + people(g) : '') +
          (g.fields.dietary ? ', and ' + (g.fields.dietary === 'none' ? 'has no dietary needs' : 'is ' + g.fields.dietary) : ', with no dietary answer yet') + '. That’s ' + coming + ' people coming of the ' + (after.event.headcount || coming) + ' planned' +
          (owed ? '; ' + owed + ' attending ' + (owed === 1 ? 'guest still owes' : 'guests still owe') + ' a dietary answer.' : '.') +
          (people(g) > 1 && !/colleague.*(vegetarian|vegan|gluten|nut)/.test(lower) ? ' I’ll ask what the colleague eats when we chase the others.' : '');
      });
    });
  }

  function pay(ctx, text) {
    return state(ctx).then(function (s) {
      var vendor = find(s.vendors, text);
      if (!vendor) return 'Which vendor did you pay? I have ' + names(s.vendors.map(function (v) { return v.fields.name; })) + '.';
      var m = text.replace(/,/g, '').match(/\$?\s?(\d+(?:\.\d{1,2})?)/);
      var amount = m ? Number(m[1]) : 0;
      if (!amount) return 'How much did you pay ' + vendor.fields.name + '? An amount like “$1,800” is enough.';
      var kind = /deposit/i.test(text) ? 'deposit' : /balance|final|rest/i.test(text) ? 'balance' : 'other';
      return ctx.invoke('record_payment', { id: vendor.id, amount: amount, kind: kind }, money(amount * 100) + ' to ' + vendor.fields.name).then(function () { return state(ctx); }).then(function (after) {
        var v = after.vendors.find(function (x) { return x.id === vendor.id; });
        var done = paid(after, v), contract = Number(v.fields.contractCents) || 0;
        var next = after.vendors.filter(function (x) { return x.status === 'booked' && (Number(x.fields.depositCents) || 0) > paid(after, x) && x.fields.depositDueAt; })
          .sort(function (a, b) { return String(a.fields.depositDueAt).localeCompare(String(b.fields.depositDueAt)); })[0];
        return 'Recorded: **' + money(amount * 100) + ' ' + kind + '** to ' + v.fields.name + '. ' +
          (contract > done ? money(contract - done) + ' is left on their ' + money(contract) + ' contract. ' : 'They’re paid in full. ') +
          (next ? 'Next deposit: ' + next.fields.name + ', ' + money((Number(next.fields.depositCents) || 0) - paid(after, next)) + (daysLeft(next.fields.depositDueAt) < 0 ? ', ' + -daysLeft(next.fields.depositDueAt) + ' days late.' : ' by ' + niceDate(next.fields.depositDueAt) + '.') : 'No other deposits are waiting.');
      });
    });
  }

  function deposits(ctx) {
    return ctx.invoke('event_status', {}, 'Deposits and budget').then(function () { return state(ctx); }).then(function (s) {
      var due = s.vendors.filter(function (v) { return v.status === 'booked' && (Number(v.fields.depositCents) || 0) > paid(s, v); });
      var owed = s.vendors.filter(function (v) { return v.status === 'booked' && (Number(v.fields.contractCents) || 0) > paid(s, v) && due.indexOf(v) < 0; });
      var balances = owed.length ? 'Balances still owed on signed contracts: ' + owed.map(function (v) { return v.fields.name + ' ' + money((Number(v.fields.contractCents) || 0) - paid(s, v)); }).join(', ') + '.' : '';
      if (!due.length) return 'No deposits are outstanding. ' + (balances || 'Every signed contract is paid in full.');
      return 'Deposits still to pay:\n' + due.map(function (v) {
        var d = v.fields.depositDueAt ? daysLeft(v.fields.depositDueAt) : null;
        return '- **' + v.fields.name + '**: ' + money((Number(v.fields.depositCents) || 0) - paid(s, v)) + (d === null ? ', no due date yet' : d < 0 ? ', ' + -d + ' days late' : ', due ' + niceDate(v.fields.depositDueAt));
      }).join('\n') + (balances ? '\n\n' + balances : '');
    });
  }

  function program(ctx, text) {
    var m = text.match(/(?:at\s+)?(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)\s+(.+?)\s+(?:to|on|in)\s+the\s+(?:run of show|program|agenda|schedule)/i) ||
      text.match(/(?:add|put)\s+(?:an?\s+|the\s+)?(.+?)\s+at\s+(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)/i);
    if (!m) return Promise.resolve('What should go on the run of show, and when? Something like “add a 5:15 pm client toast to the run of show”.');
    var time = /\d/.test(m[1]) ? m[1] : m[2], item = /\d/.test(m[1]) ? m[2] : m[1];
    if (!/am|pm/i.test(time) && Number(time.split(':')[0]) < 12) time += ' pm';
    item = item.replace(/^(?:add|put)\s+(?:an?\s+|the\s+)?/i, '').replace(/^./, function (c) { return c.toUpperCase(); });
    return ctx.invoke('set_program_item', { time: time, item: item }, time + ' ' + item).then(function () { return state(ctx); }).then(function (s) {
      var list = (s.event.program || []).slice().sort(function (a, b) { return a.time.localeCompare(b.time); });
      var at = list.findIndex(function (p) { return p.item === item; });
      return 'On the run of show: **' + item + '** at ' + clock(list[at].time) + (list[at + 1] ? ', just before ' + list[at + 1].item.toLowerCase() + ' at ' + clock(list[at + 1].time) : '') + '. Who should be on point for it?';
    });
  }

  function budget(ctx) {
    return ctx.invoke('event_status', {}, 'Budget').then(function () { return state(ctx); }).then(function (s) {
      var b = budgetLine(s);
      return 'Of the ' + money(b.budget) + ' budget, ' + money(b.signed) + ' is signed with booked vendors and ' + money(b.paid) + ' is paid. ' +
        (b.left >= 0 ? money(b.left) + ' is left to commit.' : 'We are ' + money(-b.left) + ' over.') + (s.event.venue ? '' : ' The venue isn’t booked yet, so its hire fee is still to come out of that.');
    });
  }

  function rsvps(ctx) {
    return ctx.invoke('event_status', {}, 'RSVPs').then(function () { return state(ctx); }).then(function (s) {
      var yes = s.guests.filter(function (g) { return g.status === 'yes'; });
      var coming = yes.reduce(function (sum, g) { return sum + people(g); }, 0);
      var waiting = s.guests.filter(function (g) { return g.status === 'invited'; });
      return coming + ' people are coming (' + yes.length + ' yes answers, some bringing a colleague), ' + s.guests.filter(function (g) { return g.status === 'no'; }).length + ' can’t make it, and ' + waiting.length + ' haven’t replied: ' + names(waiting.map(function (g) { return g.fields.name; })) + '.';
    });
  }

  return {
    name: 'Isa',
    role: 'Event Planner',
    greeting: 'Hello, I’m Isa. I’m planning Fernwood Studio’s Client Summit, 38 days out. The venue isn’t booked yet, three guests who are coming still owe a dietary answer, and Sorrel Kitchen’s $1,800 deposit is due in 9 days.',
    suggestions: [
      'Compare the three venues for 80 guests',
      'Book the Foundry',
      'Who still needs a dietary answer?',
      'Tomás Rivera from Brightline is a yes, vegetarian, bringing one colleague',
      'We paid Sorrel Kitchen’s $1,800 deposit',
    ],
    respond: function (text, ctx) {
      var lower = plain(text);
      if (/\bcompare\b|which venue|\bvenues\b/.test(lower)) return compare(ctx, text);
      if (/\bbook\b/.test(lower)) return book(ctx, text);
      if (/\b(paid|we paid|sent|transferred)\b/.test(lower) && /\d/.test(lower)) return pay(ctx, text);
      if (/\b(is a yes|is a no|said yes|said no|rsvp'?d|can'?t make|cannot make|is coming|declined|accepted|will be there)\b/.test(lower)) return rsvp(ctx, text);
      if (/dietary|\bdiet\b|allerg|caterer|what .* eat/.test(lower)) return dietary(ctx);
      if (/deposit|\bowe\b|payments? due/.test(lower)) return deposits(ctx);
      if (/run of show|agenda|program|schedule/.test(lower)) return program(ctx, text);
      if (/budget|spent|money|\bleft\b|cost/.test(lower)) return budget(ctx);
      if (/who'?s coming|who is coming|headcount|rsvps|how many/.test(lower)) return rsvps(ctx);
      return null;
    },
    reactions: {
      page_book_venue: function (input, output) {
        return output && output.summary ? output.summary.split('; ')[0] + '. Next to lock: the final catering count and the deposits.' : 'Booked.';
      },
      page_record_payment: function (input, output) {
        return output && output.summary ? output.summary.split('. ')[0] + '. I’ll keep the next deposit in view.' : 'Recorded.';
      },
      page_record_rsvp: function (input, output) {
        return output && output.summary ? output.summary.split('. ')[0] + '.' : 'Noted.';
      },
      page_set_program_item: function (input) {
        return 'On the run of show: ' + input.item + '. I’ll fit vendor arrivals around it.';
      },
    },
  };
})();

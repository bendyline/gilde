// The standalone demo's sample conversation. In Gezel, the event planner's
// replies come from the model the person chooses; here they are scripted, and
// every change goes through the same tools the real crew member calls.
window.demoChat = (function () {
  'use strict';
  var DAY = 86400000;
  var WORD = { yes: 'coming', no: 'declined', invited: 'awaiting a reply' };
  var CATEGORIES = [
    { match: /photo/i, name: 'photography' },
    { match: /\bcake|bak(er|ery)/i, name: 'cake' },
    { match: /\b(dj|band|music|musician|string|quartet)/i, name: 'music' },
    { match: /cater|food|dinner|lunch|brunch/i, name: 'food' },
    { match: /flor|flower|bouquet/i, name: 'flowers' },
    { match: /venue|\bhall\b|\bbarn\b|\broom\b/i, name: 'venue' },
    { match: /rental|chairs|tables|\btent\b|linens/i, name: 'rentals' },
    { match: /invitation|stationery|printing/i, name: 'invitations' },
    { match: /drink|\bbar\b|wine|beer/i, name: 'drinks' },
    { match: /decor|lights|candles/i, name: 'decor' },
  ];
  var ESSENTIALS = [
    { name: 'venue', why: 'everything else hangs off the place' },
    { name: 'food', why: 'caterers fill their calendars early' },
    { name: 'photography', why: 'good photographers book up weeks out' },
    { name: 'music', why: 'the evening needs its sound' },
    { name: 'cake', why: 'most bakers want a few weeks’ notice' },
  ];

  function plural(n, one, many) { return n + ' ' + (n === 1 ? one : many); }
  function capitalize(text) { return text.charAt(0).toUpperCase() + text.slice(1); }
  // "The Okafors", "Mara & Jo" take "are"; "Samir Patel" and "the De Vries family" take "is".
  function several(name) { name = String(name).trim(); return / & | and /i.test(name) || (/^the\s/i.test(name) && /s$/i.test(name)); }
  function count(n, one, many) { return (['no', 'one', 'two', 'three', 'four', 'five'][n] || String(n)) + ' ' + (n === 1 ? one : many); }
  function partyOf(r) { var p = r.fields && r.fields.party; return typeof p === 'number' && p >= 1 ? Math.floor(p) : 1; }
  function nameOf(r) { return String((r.fields && r.fields.name) || r.id); }
  function money(cents, currency) {
    var opts = { minimumFractionDigits: cents % 100 ? 2 : 0, maximumFractionDigits: 2 };
    try { return (cents / 100).toLocaleString('en-US', Object.assign({ style: 'currency', currency: currency || 'USD' }, opts)); } catch (e) { return (cents / 100).toLocaleString('en-US', opts); }
  }
  function list(items) {
    if (items.length < 2) return items.join('');
    return items.slice(0, -1).join(', ') + (items.length > 2 ? ',' : '') + ' and ' + items[items.length - 1];
  }
  function longDay(ms) { return new Date(ms).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' }); }
  function state(ctx) {
    return Promise.all([ctx.read('guests.json'), ctx.read('budget.json')]).then(function (v) {
      var guests = v[0] || {}, budget = v[1] || {};
      var s = { eventDate: guests.eventDate, records: guests.records || [], entries: budget.entries || [], currency: budget.currency || 'USD' };
      s.coming = 0; s.awaiting = 0; s.invited = 0; s.declined = 0; s.spent = 0; s.byCat = {};
      s.records.forEach(function (r) {
        var size = partyOf(r);
        s.invited += size;
        if (r.status === 'yes') s.coming += size;
        if (r.status === 'invited') s.awaiting += size;
        if (r.status === 'no') s.declined += size;
      });
      s.entries.forEach(function (e) {
        if (e.kind !== 'out') return;
        var key = String(e.category || 'other').toLowerCase();
        s.spent += e.amountCents;
        s.byCat[key] = (s.byCat[key] || 0) + e.amountCents;
      });
      s.days = s.eventDate ? Math.ceil((Date.parse(s.eventDate) - Date.now()) / DAY) : null;
      return s;
    });
  }
  function biggest(s) {
    var cats = Object.keys(s.byCat).sort(function (a, b) { return s.byCat[b] - s.byCat[a]; });
    return cats.length ? cats[0] + ' at ' + money(s.byCat[cats[0]], s.currency) : '';
  }
  function awaitingNames(s) {
    return s.records.filter(function (r) { return r.status === 'invited'; }).map(function (r) {
      return nameOf(r) + (partyOf(r) > 1 ? ' (party of ' + partyOf(r) + ')' : '');
    });
  }
  // A guest is found by the words of their name: "Samir", "the De Vries family", "Anika Bose".
  function findGuest(records, text) {
    var lower = text.toLowerCase(), best = null, score = 0;
    records.forEach(function (r) {
      var words = nameOf(r).toLowerCase().split(/[\s&,]+/).filter(function (w) { return w.length > 2 && ['the', 'and', 'family'].indexOf(w) < 0; });
      var hits = words.filter(function (w) { return new RegExp('\\b' + w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b').test(lower); }).length;
      if (hits > score) { best = r; score = hits; }
    });
    return best;
  }

  function rsvp(ctx, text, status) {
    return state(ctx).then(function (s) {
      var guest = findGuest(s.records, text);
      if (!guest) return 'I don’t see them on the guest list yet. Tell me their name and party size, and I’ll add them first.';
      if (guest.status === status) return nameOf(guest) + (several(nameOf(guest)) ? ' are' : ' is') + ' already marked ' + WORD[status] + '.';
      return ctx.invoke('guest_status', { id: guest.id, status: status }, nameOf(guest) + ': ' + WORD[status]).then(function () { return state(ctx); }).then(function (after) {
        var waiting = awaitingNames(after);
        var tail = waiting.length ? ' Still to answer: ' + list(waiting) + '.' : ' That’s every reply in.';
        if (status === 'yes') return 'Wonderful. **' + nameOf(guest) + '** ' + (several(nameOf(guest)) ? 'are' : 'is') + ' coming' + (partyOf(guest) > 1 ? ', party of ' + partyOf(guest) : '') + ', which makes ' + after.coming + '.' + tail;
        if (status === 'no') return 'Noted: ' + nameOf(guest) + ' can’t make it. ' + after.coming + ' coming now.' + tail + ' A short “we’ll miss you” note goes a long way.';
        return nameOf(guest) + ' is back to awaiting a reply.' + tail;
      });
    });
  }

  function addGuest(ctx, text) {
    var match = text.match(/\b(?:add|invite)\s+(?:my\s+|our\s+)?(?:(cousin|aunt|uncle|sister|brother|friend|neighbor|colleague|boss|niece|nephew|grandma|grandpa|grandmother|grandfather)\s+)?(.+?)(?=\s+(?:and|with|plus|\+)\s|\s*\(|[.,!?]|$)/i);
    if (!match) return 'Who should I add? Give me a name and how many are in their party.';
    var name = match[2].replace(/\s+to\s+the\s+(guest\s+)?list$/i, '').trim();
    name = name.split(/\s+/).map(function (w, i) { return i && /^(family|and|of)$/i.test(w) ? w.toLowerCase() : capitalize(w); }).join(' ');
    var party = 1, pronoun = ((text.match(/\b(?:and|with|plus)\s+(her|his|their)\s/i) || [])[1] || 'their').toLowerCase();
    if (/\b(and|with|plus)\s+(her|his|their)\s+(partner|husband|wife|boyfriend|girlfriend|date|fianc[eé]e?)\b|\bplus[- ]one\b|\+\s?1\b/i.test(text)) party = 2;
    var counted = text.match(/\b(?:family|party) of (\d{1,2})\b|\b(\d{1,2}) (?:people|guests)\b/i);
    if (counted) party = Number(counted[1] || counted[2]);
    var note = match[1] ? capitalize(match[1].toLowerCase()) : '';
    return state(ctx).then(function (s) {
      if (s.records.some(function (r) { return nameOf(r).toLowerCase() === name.toLowerCase(); })) return name + ' is already on the list.';
      var input = { name: name, party: party };
      if (note) input.note = note;
      return ctx.invoke('add_guest', input, name + (party > 1 ? ', party of ' + party : '')).then(function () {
        var headDay = s.eventDate ? Date.parse(s.eventDate) - 14 * DAY : null;
        return '**' + name + '**' + (party === 2 ? ' and ' + pronoun + ' partner are' : party > 2 ? ', party of ' + party + ', are' : ' is') +
          ' on the list, awaiting a reply. That’s ' + (s.invited + party) + ' invited across ' + plural(s.records.length + 1, 'invitation', 'invitations') + '.' +
          (headDay && headDay > Date.now() ? ' Send theirs this week, so the answer lands before the final headcount on ' + longDay(headDay) + '.' : '');
      });
    });
  }

  function spend(ctx, text) {
    var amount = text.match(/\$\s?([\d,]+(?:\.\d{1,2})?)|\b([\d,]+(?:\.\d{1,2})?)\s?(?:dollars|usd)\b/i);
    var category = CATEGORIES.find(function (c) { return c.match.test(text); });
    if (!amount) return 'How much was it? Tell me like “paid the florist $120”.';
    if (!category) return 'What was it for? Tell me the line, like venue, food, or photography, and I’ll record it.';
    var value = Number(String(amount[1] || amount[2]).replace(/,/g, ''));
    if (!(value > 0)) return 'That amount doesn’t look right. Try “paid the baker $85”.';
    var note = /deposit/i.test(text) ? 'Deposit' : /balance/i.test(text) ? 'Balance' : '';
    var input = { amount: value, category: category.name };
    if (note) input.note = note;
    return ctx.invoke('record_spend', input, money(Math.round(value * 100)) + ' · ' + category.name).then(function () { return state(ctx); }).then(function (s) {
      return 'Recorded: **' + money(Math.round(value * 100), s.currency) + '** to ' + category.name + (note ? ' (' + note.toLowerCase() + ')' : '') +
        ', the day it was committed. That brings the total to ' + money(s.spent, s.currency) + '; the biggest line is still ' + biggest(s) + '.';
    });
  }

  function thisWeek(ctx) {
    return ctx.invoke('event_status', {}, 'Countdown, headcount and budget').then(function () { return state(ctx); }).then(function (s) {
      var needs = [];
      var waiting = awaitingNames(s);
      if (waiting.length) needs.push('Chase the ' + count(waiting.length, 'reply', 'replies') + ' still out: ' + list(waiting) + '.');
      var event = Date.parse(s.eventDate);
      if (isFinite(event)) {
        var headDay = event - 14 * DAY;
        if (!s.byCat.food) needs.push('Book the caterer; nothing is committed for food yet.');
        else if (headDay > Date.now()) needs.push('Final headcount goes to the caterer by **' + longDay(headDay) + '**. It stands at ' + s.coming + ' now.');
        else if (s.days >= 0) needs.push('The caterer needs the final headcount now: ' + s.coming + ' coming.');
      }
      var gap = ESSENTIALS.find(function (e) { return !s.byCat[e.name]; });
      if (gap) needs.push('Nothing is committed for ' + gap.name + ' yet, and ' + gap.why + '.');
      else needs.push('The essentials are booked, so start the day-of runbook: who arrives when, and who holds the phone numbers.');
      var lead = s.days === null ? 'No date is set yet, so ' : s.days > 0 ? plural(s.days, 'day', 'days') + ' out, ' : s.days === 0 ? 'It’s today, so ' : 'The day has passed. ';
      var top = needs.slice(0, 3);
      return lead + 'this week needs ' + ['one thing', 'two things', 'three things'][top.length - 1] + ':\n\n' + top.map(function (n) { return '- ' + n; }).join('\n');
    });
  }

  function whoWaiting(ctx) {
    return ctx.invoke('guest_list', {}, 'Every guest and their reply').then(function () { return state(ctx); }).then(function (s) {
      var waiting = s.records.filter(function (r) { return r.status === 'invited'; });
      if (!waiting.length) return 'Everyone has answered: ' + s.coming + ' coming and ' + s.declined + ' declined.';
      return [
        'Still waiting on ' + count(waiting.length, 'invitation', 'invitations') + ':\n\n' + waiting.map(function (r) {
          return '- ' + nameOf(r) + (partyOf(r) > 1 ? ', party of ' + partyOf(r) : '') + ((r.fields && r.fields.note) ? ' (' + String(r.fields.note).toLowerCase() + ')' : '');
        }).join('\n'),
        'A short, warm nudge works: “We’d love to have you. Could you let us know by the end of the week?”',
      ];
    });
  }

  function headcount(ctx) {
    return state(ctx).then(function (s) {
      return s.coming + ' coming, ' + s.awaiting + ' still to answer, and ' + s.declined + ' declined, from ' + plural(s.records.length, 'invitation', 'invitations') + '. I count from the list, never from memory.';
    });
  }

  function budget(ctx) {
    return state(ctx).then(function (s) {
      var cats = Object.keys(s.byCat).sort(function (a, b) { return s.byCat[b] - s.byCat[a]; });
      if (!cats.length) return 'Nothing is committed yet.';
      return 'Committed so far: **' + money(s.spent, s.currency) + '**.\n\n' + cats.map(function (c) { return '- ' + capitalize(c) + ': ' + money(s.byCat[c], s.currency); }).join('\n');
    });
  }

  return {
    name: 'Femke',
    role: 'Event Planner',
    greeting: 'Hello, I’m Femke. Four weeks to go: 6 are coming, 3 still owe you an answer, and $3,670 is committed, most of it the venue.',
    suggestions: [
      'Samir said yes',
      'Add my cousin Ruth and her partner',
      'Book the photographer: $650 deposit',
      'What does this week need?',
      'Who hasn’t replied yet?',
    ],
    respond: function (text, ctx) {
      var lower = text.toLowerCase().replace(/’/g, '\'');
      if (/\b(add|invite)\b/.test(lower) && !/\$|\bdeposit\b/.test(lower)) return addGuest(ctx, text);
      if (/\$\s?\d|\b\d+\s?(dollars|usd)\b/.test(lower) || /\b(deposit|paid|spent|booked|book)\b.*\b\d/.test(lower)) return spend(ctx, text);
      if (/^\s*(how many|who('s| is) coming|what('s| is) the headcount)\b/.test(lower)) return headcount(ctx);
      if (/\b(said|says|replied|rsvp'?d|rsvped|answered)\s+(yes|no)\b/.test(lower)) return rsvp(ctx, text, /\s(yes)\b/.test(lower) ? 'yes' : 'no');
      if (/\b(can't|cannot|won't)\s+(come|make it)\b|\bdeclined\b|\bnot coming\b/.test(lower)) return rsvp(ctx, text, 'no');
      if (/\b(is|are)\s+coming\b|\bwill come\b|\bconfirmed\b|\baccepted\b/.test(lower)) return rsvp(ctx, text, 'yes');
      if (/\b(hasn't|haven't|not)\s+(replied|answered|responded)\b|\b(awaiting|waiting on|rsvps?)\b|\bwho('s| is)\s+(left|missing)\b/.test(lower)) return whoWaiting(ctx);
      if (/\b(this week|next|to do|need|priorit|what now)\b/.test(lower)) return thisWeek(ctx);
      if (/\b(how many|headcount|coming)\b/.test(lower)) return headcount(ctx);
      if (/\b(budget|spent|money|cost|committed)\b/.test(lower)) return budget(ctx);
      return null;
    },
    reactions: {
      page_guest_status: function (input, output, ctx) {
        return state(ctx).then(function (s) {
          return 'Recorded. ' + s.coming + ' coming now, ' + s.awaiting + ' still to answer.';
        });
      },
      page_add_guest: function (input, output, ctx) {
        return state(ctx).then(function (s) {
          return '**' + input.name + '** ' + (several(String(input.name)) ? 'are' : 'is') + ' on the list, awaiting a reply. ' + s.invited + ' invited in all.';
        });
      },
      page_record_spend: function (input, output, ctx) {
        return state(ctx).then(function (s) {
          return 'Recorded the day it was committed. The total is ' + money(s.spent, s.currency) + ' now.';
        });
      },
    },
  };
})();

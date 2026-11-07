// The standalone demo's sample conversation. In Gezel, the trip planner's
// replies come from the model the person chooses; here they are scripted, and
// every change goes through the same tools the real crew member calls.
window.demoChat = (function () {
  'use strict';
  var DAY = 86400000;
  var LISBON_DAYS = [
    {
      name: 'Belém', match: /bel[eé]m/i, key: 'belém',
      gist: 'the monastery in the morning, the river walk to the tower after, and a free afternoon',
      plan: 'Belém in the morning: Jerónimos Monastery, then along the river to the tower.\nPastéis de Belém for a late breakfast, or the MAAT if it rains.\nThe afternoon stays open; tram 15 brings you back.',
    },
    {
      name: 'Cascais', match: /cascais|coast|beach|sea/i, key: 'cascais',
      gist: 'the coast train out, the seafront walk, and nothing booked after four',
      plan: 'The coast train to Cascais, along the river and out to the sea.\nWalk the seafront to Boca do Inferno, or a long harbor lunch if the wind is up.\nNothing booked after four; dinner wherever you land.',
    },
    {
      name: 'a slow day', match: /slow|rest|easy|lazy|bookshop/i, key: 'ler devagar',
      gist: 'LX Factory and a bookshop in the morning, then whatever you feel like',
      plan: 'A slow morning at LX Factory and the Ler Devagar bookshop.\nThe Gulbenkian gardens or the Santa Justa lift, whichever you feel like.\nAn early night if a flight is coming.',
    },
  ];

  function isIso(key) { return /^\d{4}-\d{2}-\d{2}$/.test(String(key)); }
  function addDays(iso, n) { return new Date(Date.parse(iso + 'T12:00:00Z') + n * DAY).toISOString().slice(0, 10); }
  function label(key, long) {
    if (!isIso(key)) return key;
    return new Date(key + 'T12:00:00Z').toLocaleDateString('en-US', { weekday: long ? 'long' : 'short', month: 'short', day: 'numeric', timeZone: 'UTC' });
  }
  function sortedKeys(days) {
    return Object.keys(days).sort(function (a, b) {
      var na = /^Day (\d+)$/.exec(a), nb = /^Day (\d+)$/.exec(b);
      if (na && nb) return Number(na[1]) - Number(nb[1]);
      return a < b ? -1 : a > b ? 1 : 0;
    });
  }
  function plural(n, one, many) { return n + ' ' + (n === 1 ? one : many); }
  function capitalize(text) { return text.charAt(0).toUpperCase() + text.slice(1); }
  function list(items) {
    if (items.length < 2) return items.join('');
    return items.slice(0, -1).join(', ') + (items.length > 2 ? ',' : '') + ' and ' + items[items.length - 1];
  }
  function lowerFirst(text) { return text.charAt(0).toLowerCase() + text.slice(1); }
  function count(n, one, many) { return (['No', 'One', 'Two', 'Three', 'Four', 'Five'][n] || String(n)) + ' ' + (n === 1 ? one : many); }
  function itemName(r) { return String((r.fields && r.fields.name) || r.id); }
  function firstLine(plan) { return String(plan || '').split('\n')[0]; }
  function inLisbon(trip) { return /lisbon|lisboa/i.test(String(trip.destination || '')); }
  function countdown(trip) {
    var start = String(trip.startDate || '');
    if (!isIso(start.slice(0, 10))) return null;
    return Math.ceil((Date.parse(start) - Date.now()) / DAY);
  }
  function partySize(trip) { var t = String(trip.travellers || '').trim(); return /^\d+$/.test(t) ? Number(t) : null; }
  function state(ctx) {
    return Promise.all([ctx.read('trip.json'), ctx.read('packing.json'), ctx.read('journal.json')]).then(function (v) {
      var trip = v[0] || {};
      trip.days = trip.days || {};
      return { trip: trip, records: (v[1] && v[1].records) || [], events: (v[2] && v[2].events) || [] };
    });
  }
  function nextDay(trip) {
    var keys = sortedKeys(trip.days);
    var dates = keys.filter(isIso);
    if (dates.length) return addDays(dates[dates.length - 1], 1);
    var numbered = keys.map(function (k) { var m = /^Day (\d+)$/.exec(k); return m ? Number(m[1]) : 0; });
    if (numbered.length) return 'Day ' + (Math.max.apply(null, numbered) + 1);
    var start = String(trip.startDate || '').slice(0, 10);
    return isIso(start) ? start : 'Day 1';
  }

  function planDay(ctx, asked) {
    return state(ctx).then(function (s) {
      var trip = s.trip, key = nextDay(trip);
      var planned = Object.keys(trip.days).map(function (k) { return String(trip.days[k]).toLowerCase(); }).join('\n');
      var idea;
      if (inLisbon(trip)) {
        var fresh = LISBON_DAYS.filter(function (d) { return planned.indexOf(d.key) < 0; });
        idea = fresh.find(function (d) { return d.match.test(asked); }) || fresh[0];
      }
      var already = inLisbon(trip) && LISBON_DAYS.find(function (d) { return d.match.test(asked) && planned.indexOf(d.key) >= 0; });
      if (!idea) {
        var where = trip.destination || 'town';
        idea = {
          name: 'an open day',
          gist: 'one thing worth the morning, an easy afternoon, and an open evening',
          plan: 'One anchor for the morning: the sight in ' + where + ' you would be sorry to miss.\nA market or a museum after, whichever the weather favors.\nThe evening stays open.',
        };
      }
      return ctx.invoke('plan_day', { date: key, plan: idea.plan }, label(key) + ': ' + capitalize(idea.name)).then(function () {
        var count = Object.keys(trip.days).length + 1;
        return (already ? capitalize(already.name) + ' is already in the plan, so I took the next idea instead. ' : '') +
          '**' + label(key, true) + '** is ' + idea.name + ': ' + idea.gist + '. That makes ' + plural(count, 'day', 'days') + ' planned, each with one anchor and room to breathe.';
      });
    });
  }

  function packingCheck(ctx) {
    return state(ctx).then(function (s) {
      var trip = s.trip, lisbon = inLisbon(trip);
      var month = isIso(String(trip.startDate).slice(0, 10)) ? new Date(String(trip.startDate).slice(0, 10) + 'T12:00:00Z').getUTCMonth() : 10;
      var wet = month >= 9 || month <= 2;
      var wanted = [
        { name: lisbon ? 'Plug adapter (Type F)' : 'Plug adapter', match: /adapter/i, why: lisbon ? 'Portugal uses Type C and F sockets' : 'check the socket type before you go' },
        wet
          ? { name: 'Compact umbrella', match: /umbrella/i, why: 'rain is likely that time of year' }
          : { name: 'Sunscreen', match: /sunscreen|sun cream/i, why: 'the sun is strong even on a breezy day' },
        { name: 'Copies of passports', match: /cop(y|ies)/i, why: 'kept in a different bag from the originals' },
      ];
      var missing = wanted.filter(function (w) { return !s.records.some(function (r) { return w.match.test(itemName(r)); }); });
      var left = s.records.filter(function (r) { return r.status === 'unpacked'; }).map(function (r) { return lowerFirst(itemName(r)); });
      if (!missing.length) {
        return left.length
          ? 'The list already covers the usual misses. Still to pack: ' + list(left) + '.'
          : 'The list covers the usual misses, and everything on it is packed.';
      }
      return missing.reduce(function (chain, w) {
        return chain.then(function () { return ctx.invoke('pack_add', { item: w.name }, w.name); });
      }, Promise.resolve()).then(function () {
        var shoes = s.records.some(function (r) { return r.status === 'unpacked' && /shoe|boot/i.test(itemName(r)); });
        return [
          count(missing.length, 'thing', 'things') + ' trips like this tend to miss, now on the list:\n\n' +
            missing.map(function (w) { return '- **' + w.name + '**: ' + w.why; }).join('\n'),
          'That makes ' + plural(left.length + missing.length, 'item', 'items') + ' to pack.' +
            (shoes && lisbon ? ' Lisbon’s hills are cobbled, so wear the walking shoes in before you go.' : ''),
        ];
      });
    });
  }

  function markPacked(ctx, wanted) {
    return state(ctx).then(function (s) {
      var lower = wanted.toLowerCase();
      var item = s.records.find(function (r) { return itemName(r).toLowerCase() === lower; }) ||
        s.records.find(function (r) { var n = itemName(r).toLowerCase(); return n.indexOf(lower) >= 0 || lower.indexOf(n) >= 0; });
      if (!item) return 'I can’t find “' + wanted + '” on the packing list. Ask me to add it first.';
      if (item.status === 'packed') return itemName(item) + ' is already packed.';
      return ctx.invoke('pack_check', { id: item.id }, itemName(item)).then(function (out) {
        var left = out && typeof out.unpacked === 'number' ? out.unpacked : s.records.filter(function (r) { return r.status === 'unpacked'; }).length - 1;
        return 'Checked off: ' + lowerFirst(itemName(item)) + '. ' + (left ? plural(left, 'item', 'items') + ' to go.' : 'That’s everything packed.');
      });
    });
  }

  function addItem(ctx, wanted) {
    return state(ctx).then(function (s) {
      var name = capitalize(wanted);
      if (s.records.some(function (r) { return itemName(r).toLowerCase() === wanted.toLowerCase(); })) return name + ' is already on the list.';
      return ctx.invoke('pack_add', { item: name }, name).then(function () {
        var left = s.records.filter(function (r) { return r.status === 'unpacked'; }).length + 1;
        return 'Added ' + lowerFirst(name) + '. ' + plural(left, 'item', 'items') + ' still to pack.';
      });
    });
  }

  function ready(ctx) {
    return ctx.invoke('trip_status', {}, 'Countdown, days and packing').then(function () { return state(ctx); }).then(function (s) {
      var trip = s.trip, days = countdown(trip), keys = sortedKeys(trip.days);
      var left = s.records.filter(function (r) { return r.status === 'unpacked'; }).map(function (r) { return lowerFirst(itemName(r)); });
      var lead = days === null ? 'No departure date yet, ' : days > 0 ? plural(days, 'day', 'days') + ' to go, ' : days === 0 ? 'You leave today, ' : 'You’re on the road, ';
      var parts = [lead + (keys.length ? 'with ' + plural(keys.length, 'day', 'days') + ' planned:' : 'and no days planned yet.')];
      if (keys.length) parts.push(keys.slice(0, 6).map(function (k) { return '- ' + label(k) + ': ' + firstLine(trip.days[k]); }).join('\n'));
      var next = days === null ? 'Settle the departure date first; everything else hangs off it.'
        : days > 14 ? 'This week I’d book anything with a timed entry. The packing can wait for the night before.'
        : days > 2 ? 'This week: check passport expiry dates and sort the airport transfer for the first morning.'
        : 'Tonight is the five-minute sweep of what’s still unpacked.';
      parts.push((left.length ? 'Still to pack: ' + (left.length > 4 ? left.slice(0, 3).join(', ') + ', and ' + (left.length - 3) + ' more' : list(left)) + '. ' : 'Everything is packed. ') + next);
      return parts.join('\n\n');
    });
  }

  function itinerary(ctx) {
    return ctx.invoke('itinerary', {}, 'Day by day').then(function () { return state(ctx); }).then(function (s) {
      var keys = sortedKeys(s.trip.days);
      if (!keys.length) return 'Nothing is planned yet. Ask me to plan the first day.';
      return 'Here’s the spine so far:\n\n' + keys.map(function (k) { return '- **' + label(k) + '**: ' + firstLine(s.trip.days[k]); }).join('\n');
    });
  }

  function joining(ctx, text) {
    return state(ctx).then(function (s) {
      var trip = s.trip, size = partySize(trip);
      var exact = text.match(/\b(\d{1,2})\s*(?:of us|people|travell?ers|going)\b/i) || text.match(/\bwe(?:'re| are| will be|’re)\s+(\d{1,2})\b/i);
      var who = (text.match(/\b([A-Z][a-z]+)\s+(?:is|'s|’s)\s+(?:joining|coming)/) || [])[1];
      var next = exact ? String(Number(exact[1])) : size !== null ? String(size + 1) : (trip.travellers ? trip.travellers + ', plus ' + (who || 'one more') : '1');
      if (exact && size === Number(exact[1])) return 'The trip already counts ' + plural(size, 'traveler', 'travelers') + '.';
      var change = !exact && who ? { joining: who } : { travellers: next };
      return ctx.invoke('set_trip', change, /^\d+$/.test(next) ? plural(Number(next), 'traveler', 'travelers') : next).then(function () {
        var booked = s.events.slice().reverse().find(function (e) { return /reserv|book|ticket/i.test(String(e.note || '')); });
        return 'Done: ' + (/^\d+$/.test(next) ? plural(Number(next), 'traveler', 'travelers') : next) + ' now.' +
          (booked ? ' One thing to change with it: the journal says “' + booked.note + '” Those bookings need ' + (who ? who + '’s' : 'the extra') + ' seat too.' : ' Nothing is booked yet, so there’s nothing to change.');
      });
    });
  }

  function journal(ctx, note) {
    return state(ctx).then(function (s) {
      var text = capitalize(note.replace(/[.!\s]+$/, '')) + '.';
      return ctx.invoke('journal_entry', { note: text }, text).then(function () {
        var fado = /fado/i.test(text) && sortedKeys(s.trip.days).find(function (k) { return /fado/i.test(s.trip.days[k]) && !/booked/i.test(s.trip.days[k]); });
        if (!fado) return 'In the journal. When a confirmation or an address comes with it, tell me and I’ll note that too.';
        var plan = String(s.trip.days[fado]).split('\n').map(function (line) {
          return /fado/i.test(line) ? 'Fado dinner is booked for the evening, so keep the afternoon light.' : line;
        }).join('\n');
        return ctx.invoke('plan_day', { date: fado, plan: plan }, label(fado) + ': fado booked').then(function () {
          return 'In the journal, and **' + label(fado, true) + '** now has the fado dinner as its evening anchor. Send me the time and address when the confirmation arrives.';
        });
      });
    });
  }

  return {
    name: 'Joost',
    role: 'Trip Planner',
    greeting: 'Hi, I’m Joost. Lisbon is 18 days out for the four of you. Three days have a shape, Sintra is booked, and three things are still to pack.',
    suggestions: [
      'Add a Belém day after Sintra',
      'What am I forgetting to pack?',
      'Marta is joining us',
      'Log that we booked the fado dinner',
      'How ready are we?',
    ],
    respond: function (text, ctx) {
      var lower = text.toLowerCase();
      var adding = text.match(/\badd\s+(?:an?\s+|the\s+|my\s+|some\s+)?(.+?)\s+to\s+(?:the\s+)?(?:packing\s+)?list\b/i);
      if (adding) return addItem(ctx, adding[1]);
      if (/\b(forget|forgetting|forgot|missing)\b|what (else )?(should|do) (i|we) (pack|bring)/.test(lower)) return packingCheck(ctx);
      var packed = text.match(/\b(?:i|we)(?:'ve|’ve| have)?\s+packed\s+(?:the\s+|my\s+|our\s+)?(.+)/i) || text.match(/^(?:the\s+|my\s+)?(.+?)\s+(?:is|are)\s+packed\b/i);
      if (packed) return markPacked(ctx, packed[1].replace(/[.!?]+$/, '').trim());
      var logged = text.match(/^(?:please\s+)?(?:log|note|journal|remember|write down)\b[:\s]*(?:that\s+)?(.+)/i);
      if (logged) return journal(ctx, logged[1]);
      if (/\b(joining|coming with|coming too|tagging along)\b|\b\d{1,2}\s*(of us|people|travell?ers)\b|\bwe(?:'re| are|’re)\s+\d/.test(lower)) return joining(ctx, text);
      if (/\b(itinerary|schedule|what('s| is) (on|planned)|day by day)\b/.test(lower)) return itinerary(ctx);
      if (/\b(ready|status|countdown|how long|left to do|what('s| is) next|this week)\b/.test(lower)) return ready(ctx);
      if (/\b(plan|day trip|add a day|another day|bel[eé]m|cascais|sintra|slow day)\b/.test(lower)) return planDay(ctx, text);
      if (/\b(pack|packing|bring)\b/.test(lower)) return packingCheck(ctx);
      return null;
    },
    reactions: {
      page_plan_day: function (input) {
        var lines = String(input.plan || '').split('\n').filter(Boolean).length;
        var key = String(input.date || '').trim(), numbered = key.match(/^(?:day\s*)?(\d{1,3})$/i);
        key = /^\d{4}-\d{2}-\d{2}/.test(key) ? key.slice(0, 10) : numbered ? 'Day ' + Number(numbered[1]) : key;
        return '**' + label(key) + '** is in the itinerary. ' +
          (lines > 1 ? 'It has an anchor and room to breathe.' : 'Add a second line with a backup plan, and a rainy morning won’t sink it.');
      },
      page_pack_add: function (input, output, ctx) {
        return ctx.read('packing.json').then(function (doc) {
          var left = ((doc && doc.records) || []).filter(function (r) { return r.status === 'unpacked'; }).length;
          return 'Added. ' + plural(left, 'item', 'items') + ' to pack now.';
        });
      },
      mark_packed: function (input, output, ctx) {
        return ctx.read('packing.json').then(function (doc) {
          var left = ((doc && doc.records) || []).filter(function (r) { return r.status === 'unpacked'; }).length;
          return left ? null : 'That’s everything packed. The night before is yours.';
        });
      },
      page_journal_entry: function () {
        return 'Saved. A line a day is plenty; the trip ends, the record stays.';
      },
    },
  };
})();

// The standalone demo's sample conversation. In Gezel, the fundraiser's
// replies come from the model the person chooses; here they are scripted, and
// every change goes through the same tools the real crew member calls.
window.demoChat = (function () {
  'use strict';
  var MILESTONES = [25, 50, 75, 100];

  function plural(n, one, many) { return n + ' ' + (n === 1 ? one : many); }
  function list(items) {
    if (items.length < 2) return items.join('');
    return items.slice(0, -1).join(', ') + (items.length > 2 ? ',' : '') + ' and ' + items[items.length - 1];
  }
  function money(cents, currency) {
    var opts = { minimumFractionDigits: cents % 100 ? 2 : 0, maximumFractionDigits: 2 };
    try { return (cents / 100).toLocaleString('en-US', Object.assign({ style: 'currency', currency: currency || 'USD' }, opts)); } catch (e) { return (cents / 100).toLocaleString('en-US', opts); }
  }
  function count(n, one, many) { return (['No', 'One', 'Two', 'Three', 'Four', 'Five', 'Six'][n] || String(n)) + ' ' + (n === 1 ? one : many); }
  function donorOf(e) { return String((e.data && e.data.donor) || 'anonymous'); }
  // A donor named mid-sentence: "the De Vries family", "an anonymous giver".
  function donorText(e) { return anonymous(e) ? 'an anonymous giver' : donorOf(e).replace(/^The\s+/, 'the '); }
  function capitalize(text) { return text.charAt(0).toUpperCase() + text.slice(1); }
  function possessive(name) { return /s$/i.test(name) ? name + '’' : name + '’s'; }
  function anonymous(e) { return /^anon/i.test(donorOf(e)); }
  function state(ctx) {
    return ctx.read('donations.json').then(function (doc) {
      doc = doc || {};
      var s = { entries: doc.entries || [], goal: Number(doc.goalCents) > 0 ? Number(doc.goalCents) : 0, cause: String(doc.cause || 'the drive'), currency: doc.currency || 'USD', raised: 0 };
      s.entries.forEach(function (e) { s.raised += e.amountCents; });
      s.owed = s.entries.filter(function (e) { return !e.data || e.data.thanked !== true; });
      s.pct = s.goal ? Math.min(100, Math.round((s.raised / s.goal) * 100)) : null;
      return s;
    });
  }
  function causeName(s) { return s.cause.charAt(0).toLowerCase() + s.cause.slice(1); }
  // "The De Vries family" -> "De Vries family"; "Canal Street Books" -> "friends at Canal Street Books"; "Lotte Jansen" -> "Lotte".
  function salutation(donor) {
    if (/^the\s+/i.test(donor)) return donor.replace(/^the\s+/i, '');
    if (/\b(books|works|co\.?|inc\.?|llc|shop|cafe|café|bakery|studio|bank|club|church|school|market)\b/i.test(donor)) return 'friends at ' + donor;
    return donor.split(/\s+/)[0];
  }
  function findDonor(entries, text) {
    var lower = text.toLowerCase();
    return entries.find(function (e) {
      return donorOf(e).toLowerCase().split(/\s+/).filter(function (w) { return w.length > 2 && ['the', 'and', 'family'].indexOf(w) < 0; })
        .some(function (w) { return lower.indexOf(w) >= 0; });
    }) || null;
  }

  function record(ctx, donor, amount) {
    if (!(amount > 0)) return 'How much was the gift? Tell me like “Ana gave $40”.';
    var name = donor ? donor.replace(/^(a|an)\s+/i, '').trim() : 'Anonymous';
    name = name.charAt(0).toUpperCase() + name.slice(1);
    return state(ctx).then(function (before) {
      return ctx.invoke('record_donation', { donor: name, amount: amount }, money(Math.round(amount * 100), before.currency) + ' from ' + name).then(function () { return state(ctx); }).then(function (s) {
        var crossed = s.goal && MILESTONES.filter(function (m) { return before.raised * 100 < m * s.goal && s.raised * 100 >= m * s.goal; }).pop();
        var who = anonymous({ data: { donor: name } }) ? 'the gift' : /^friends at /.test(salutation(name)) ? name : /^the\s/i.test(name) ? name.replace(/^The\s+/, 'the ') : name.split(/\s+/)[0];
        return 'Recorded: **' + money(Math.round(amount * 100), s.currency) + '** from ' + name + '. That puts ' + causeName(s) + ' at ' + money(s.raised, s.currency) +
          (s.goal ? ', ' + s.pct + '% of the goal' : '') + ', and ' + who + ' is on the thank-you list.' +
          (crossed ? (crossed === 100 ? ' And that’s the goal reached. Time for the wrap-up and a big thank-you post.' : ' That crossed ' + (crossed === 50 ? 'halfway' : crossed + '%') + ', which is worth a short progress post.') : '');
      });
    });
  }

  function status(ctx) {
    return ctx.invoke('drive_status', {}, 'Thermometer and thank-yous').then(function () { return state(ctx); }).then(function (s) {
      if (!s.entries.length) return 'No gifts yet. The first one starts the story, so let’s line up who to ask first.';
      var parts = ['We’re at **' + money(s.raised, s.currency) + (s.goal ? ' of ' + money(s.goal, s.currency) + '**, ' + s.pct + '% there,' : '**') + ' across ' + plural(s.entries.length, 'gift', 'gifts') + '.'];
      if (s.goal && s.raised < s.goal) {
        var left = s.goal - s.raised, average = Math.max(100, Math.round(s.raised / s.entries.length / 100) * 100);
        var top = s.entries.slice().sort(function (a, b) { return b.amountCents - a.amountCents; })[0];
        parts.push(money(left, s.currency) + ' to go. At the average gift so far (about ' + money(average, s.currency) + '), that’s roughly ' + Math.ceil(left / average) + ' more.' +
          (top.amountCents >= 2 * average ? ' ' + possessive(donorOf(top).replace(/^The\s+/, 'the ')) + ' ' + money(top.amountCents, s.currency) + ' moved it most, so a few more asks of that size would close the gap fastest.' : ''));
      } else if (s.goal) {
        parts.push('The goal is reached. The wrap-up report is next: the total, what it pays for, and every name.');
      }
      parts.push(s.owed.length ? count(s.owed.length, 'thank-you is', 'thank-yous are') + ' still owed.' : 'Everyone who gave has been thanked.');
      return parts.join(' ');
    });
  }

  function drafts(ctx) {
    return ctx.invoke('donor_list', {}, 'Every gift and its thank-you').then(function () { return state(ctx); }).then(function (s) {
      if (!s.owed.length) return 'No thank-yous are owed. Everyone who gave has heard from you.';
      var lines = s.owed.map(function (e) {
        var amount = money(e.amountCents, s.currency);
        if (anonymous(e)) return '**The anonymous gift** (' + amount + '): there’s no name to write to. If it came with an email address, a two-line note is enough; otherwise it’s thanked in the next progress post.';
        return '**To ' + donorText(e) + '** (' + amount + '): Dear ' + salutation(donorOf(e)) + ', thank you for your ' + amount + ' gift to ' + causeName(s) + '. ' +
          (s.goal ? 'We’re at ' + money(s.raised, s.currency) + ' of ' + money(s.goal, s.currency) + ' now, and gifts like yours are why. ' : '') + (/garden|roof|playground|park|build|library|court|center|shelter/i.test(s.cause) ? 'We’ll send photos when it’s built.' : 'We’ll share how it turns out.');
      });
      return lines.concat('Tell me once they’ve gone out, and I’ll mark them thanked.');
    });
  }

  function markAll(ctx) {
    return state(ctx).then(function (s) {
      if (!s.owed.length) return 'Nothing is owed. Everyone who gave has been thanked.';
      return s.owed.reduce(function (chain, e) {
        return chain.then(function () { return ctx.invoke('mark_thanked', { id: e.id }, donorOf(e)); });
      }, Promise.resolve()).then(function () {
        return 'Marked ' + plural(s.owed.length, 'gift', 'gifts') + ' thanked: ' + list(s.owed.map(donorText)) + '. The thank-you list is empty, which is exactly how it should end every week.';
      });
    });
  }

  function markOne(ctx, text) {
    return state(ctx).then(function (s) {
      var gift = findDonor(s.owed, text);
      if (!gift) {
        var done = findDonor(s.entries, text);
        return done ? capitalize(donorText(done)) + ' is already marked thanked.' : 'I don’t see that name among the gifts. Who was it from?';
      }
      return ctx.invoke('mark_thanked', { id: gift.id }, donorOf(gift)).then(function () {
        var left = s.owed.length - 1;
        return 'Marked ' + donorText(gift) + ' thanked. ' + (left ? count(left, 'thank-you is', 'thank-yous are') + ' still owed.' : 'Everyone who gave has been thanked.');
      });
    });
  }

  function post(ctx) {
    return state(ctx).then(function (s) {
      var people = s.entries.map(function (e) { return anonymous(e) ? e.id : donorOf(e).toLowerCase(); })
        .filter(function (key, i, all) { return all.indexOf(key) === i; }).length;
      return [
        'Here’s a draft for the progress post:',
        (s.goal ? 'We’re ' + s.pct + '% of the way to ' + causeName(s) + ': ' + money(s.raised, s.currency) + ' of ' + money(s.goal, s.currency) : money(s.raised, s.currency) + ' raised for ' + causeName(s)) +
          ', from ' + plural(people, 'neighbor and friend', 'neighbors, friends, and local businesses') + '. Thank you, every one of you. ' +
          (s.goal && s.raised < s.goal ? money(s.goal - s.raised, s.currency) + ' to go. If you’ve been meaning to give, this week is a great time.' : 'We made it. Photos soon.'),
        'Celebration pulls better than pressure, so I kept it to thanks and one clear ask.',
      ];
    });
  }

  return {
    name: 'Daan',
    role: 'Fundraiser',
    greeting: 'Hi, I’m Daan. The reading garden is at $1,950 of $10,000, a fifth of the way there. Two thank-yous are still owed: the De Vries family and an anonymous giver.',
    suggestions: [
      'Lotte Jansen just gave $200',
      'How close are we to the goal?',
      'Draft the thank-yous we owe',
      'I sent the thank-you notes',
    ],
    respond: function (text, ctx) {
      var lower = text.toLowerCase();
      var gave = text.match(/^(.+?)\s+(?:just\s+)?(?:gave|donated|sent in|pledged|chipped in|contributed)\s+(?:us\s+)?(?:another\s+|an extra\s+|a further\s+)?\$?\s?([\d,]+(?:\.\d{1,2})?)/i);
      if (gave && !/\bthank/i.test(text)) return record(ctx, gave[1], Number(gave[2].replace(/,/g, '')));
      var from = text.match(/\$\s?([\d,]+(?:\.\d{1,2})?)\s+(?:gift\s+|donation\s+)?(?:from|by)\s+(.+?)[.!]?$/i);
      if (from) return record(ctx, from[2], Number(from[1].replace(/,/g, '')));
      if (/\b(sent|mailed|wrote|emailed|posted|delivered)\b.*\bthank|\bthanked\b/.test(lower)) {
        return /\b(all|notes|them|everyone|everybody|the thank-yous|cards)\b/.test(lower) ? markAll(ctx) : markOne(ctx, text);
      }
      if (/\b(draft|write)\b.*\bthank|\bthank[- ]?yous?\b.*\b(owe|owed)\b|\bwho\b.*\bthank/.test(lower)) return drafts(ctx);
      if (/\b(post|social|announce|newsletter|share)\b/.test(lower)) return post(ctx);
      if (/\b(goal|close|raised|how much|thermometer|status|where|progress|total|left|to go)\b/.test(lower)) return status(ctx);
      return null;
    },
    reactions: {
      page_record_donation: function (input, output, ctx) {
        return state(ctx).then(function (s) {
          return 'Recorded. That’s ' + money(s.raised, s.currency) + (s.goal ? ', ' + s.pct + '% of the goal' : '') + '. ' +
            (input.donor && !/^anon/i.test(input.donor) ? input.donor + ' is on the thank-you list.' : 'It’s on the thank-you list.');
        });
      },
      page_mark_thanked: function (input, output, ctx) {
        return state(ctx).then(function (s) {
          return s.owed.length ? 'Done. ' + plural(s.owed.length, 'thank-you', 'thank-yous') + ' still owed.' : 'Done. Everyone who gave has been thanked.';
        });
      },
    },
  };
})();

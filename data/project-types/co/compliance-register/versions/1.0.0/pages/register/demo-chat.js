// The standalone demo's sample conversation. In Gezel, the compliance
// officer's replies come from the model the person chooses; here they are
// scripted, and every change goes through the same tools the crew calls.
window.demoChat = (function () {
  'use strict';
  var DAY = 86400000;
  var MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];

  function pad(n) { return n < 10 ? '0' + n : String(n); }
  function iso(ms) { var d = new Date(ms); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function daysLeft(dueAt) { return Math.round((Date.parse(String(dueAt).slice(0, 10) + 'T00:00:00') - Date.parse(iso(Date.now()) + 'T00:00:00')) / DAY); }
  function when(days) { return days < 0 ? -days + (days === -1 ? ' day late' : ' days late') : days === 0 ? 'due today' : 'in ' + days + (days === 1 ? ' day' : ' days'); }
  function niceDate(day) { return new Date(String(day).slice(0, 10) + 'T12:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }); }

  function state(ctx) {
    return Promise.all([ctx.read('obligations.json'), ctx.read('evidence.json')]).then(function (v) {
      return { records: (v[0] && v[0].records) || [], events: (v[1] && v[1].events) || [] };
    });
  }
  function proofFor(s, r) { return s.events.filter(function (e) { return e.data && e.data.obligationId === r.id; }); }
  function open(s) {
    return s.records.filter(function (r) { return r.status !== 'done'; }).sort(function (a, b) { return String(a.fields.dueAt).localeCompare(String(b.fields.dueAt)); });
  }
  // The obligation the person means: the one whose title shares the most words with what they wrote.
  function find(s, text) {
    var words = text.toLowerCase().match(/[a-z]{4,}/g) || [];
    var best = null, score = 0;
    s.records.forEach(function (r) {
      var title = r.fields.title.toLowerCase();
      var hits = words.filter(function (w) { return title.indexOf(w) >= 0 || title.indexOf(w.replace(/s$/, '')) >= 0; }).length;
      if (hits > score) { best = r; score = hits; }
    });
    return best;
  }
  function reference(text) {
    var m = text.match(/\b([A-Z]{1,4}-?\d[\w-]{2,})\b/);
    return m ? m[1] : '';
  }

  function dueReport(ctx, days) {
    return ctx.invoke('register_status', { withinDays: days }, 'Next ' + days + ' days').then(function () { return state(ctx); }).then(function (s) {
      var items = open(s).filter(function (r) { return daysLeft(r.fields.dueAt) <= days; });
      if (!items.length) return 'Nothing is due in the next ' + days + ' days. The next item is ' + open(s)[0].fields.title + ' on ' + niceDate(open(s)[0].fields.dueAt) + '.';
      return 'Here are the next ' + days + ' days, soonest first:\n' + items.map(function (r) {
        var proof = proofFor(s, r);
        return '- **' + r.fields.title + '** ' + when(daysLeft(r.fields.dueAt)) + ' (' + (r.fields.owner || 'no owner') + ')' + (r.status === 'in-progress' ? ', in progress' : '') + (proof.length ? '' : ', no proof on file yet');
      }).join('\n') + '\n\n' + (items[0] && daysLeft(items[0].fields.dueAt) < 0 ? 'The ' + items[0].fields.title.toLowerCase() + ' is the one to book today.' : 'Nothing is late, so this is just the plan.');
    });
  }

  function completed(ctx, text) {
    return state(ctx).then(function (s) {
      var r = find(s, text);
      if (!r) return 'Which obligation was that? Tell me its name, like “we renewed the food service permit”.';
      var ref = reference(text);
      var note = ref ? 'Renewed; reference ' + ref + '.' : 'Completed, as reported in chat.';
      return ctx.invoke('complete_obligation', { id: r.id, note: note }, r.fields.title).then(function () { return state(ctx); }).then(function (after) {
        var now = after.records.find(function (x) { return x.id === r.id; });
        var next = open(after).filter(function (x) { return x.id !== r.id; })[0];
        return 'Recorded: **' + r.fields.title + '** is done' + (ref ? ', with reference ' + ref + ' on file' : '') + '. ' +
          (now && now.status !== 'done' ? 'It repeats ' + now.fields.recurs + ', so the next one is due ' + niceDate(now.fields.dueAt) + '. ' : '') +
          (ref ? '' : 'When the certificate arrives, drop it into Evidence so the proof sits beside it. ') +
          (next ? 'Next up: ' + next.fields.title + ', ' + when(daysLeft(next.fields.dueAt)) + '.' : '');
      });
    });
  }

  function started(ctx, text) {
    return state(ctx).then(function (s) {
      var r = find(s, text);
      if (!r) return 'Which obligation is underway? Name it and I’ll mark it in progress.';
      return ctx.invoke('set_obligation_status', { id: r.id, status: 'in-progress', note: text.replace(/\s+/g, ' ').trim() }, r.fields.title + ': in progress').then(function () {
        return 'Marked **' + r.fields.title + '** in progress and noted it on the register. ' +
          (daysLeft(r.fields.dueAt) < 0 ? 'It stays on the overdue list until it’s done; tell me when the inspector signs it off.' : 'I’ll keep it on the list until it’s done.');
      });
    });
  }

  function added(ctx, text) {
    var lower = text.toLowerCase();
    var title = (text.match(/(?:add|track)\s+(?:our|the|a|an)?\s*([^,.;]+?)(?:,|\s+(?:due|renews|every|which|that)\b|$)/i) || [])[1];
    if (!title) return Promise.resolve('What should I add? Give me the name and when it’s due, like “add our liquor license, renews every year on June 30”.');
    title = title.trim().replace(/^./, function (c) { return c.toUpperCase(); });
    var recurs = /\b(every year|yearly|annual|annually)\b/.test(lower) ? 'yearly' : /\bquarter/.test(lower) ? 'quarterly' : /\b(every month|monthly)\b/.test(lower) ? 'monthly' : 'none';
    var due = null;
    var m = lower.match(new RegExp('\\b(' + MONTHS.join('|') + ')\\s+(\\d{1,2})'));
    if (m) {
      var year = new Date().getFullYear();
      var candidate = year + '-' + pad(MONTHS.indexOf(m[1]) + 1) + '-' + pad(Number(m[2]));
      due = daysLeft(candidate) < 0 ? (year + 1) + candidate.slice(4) : candidate;
    }
    if (!due) return Promise.resolve('When is ' + title.toLowerCase() + ' next due? A date like “June 30” is enough.');
    var category = /licen/.test(lower) ? 'license' : /permit/.test(lower) ? 'permit' : /insur/.test(lower) ? 'insurance' : /inspect|service/.test(lower) ? 'inspection' : /tax|return|filing|report/.test(lower) ? 'filing' : /certif|card/.test(lower) ? 'certification' : /policy/.test(lower) ? 'policy' : 'other';
    return ctx.invoke('add_obligation', { title: title, category: category, dueAt: due, recurs: recurs }, title + ', due ' + niceDate(due)).then(function () {
      return 'Added **' + title + '** as a ' + category + ', due ' + niceDate(due) + (recurs !== 'none' ? ' and repeating ' + recurs : '') + '. Who owns it? Tell me and I’ll put their name on it.';
    });
  }

  function inspection(ctx) {
    return ctx.invoke('list_obligations', {}, 'Whole register').then(function () { return state(ctx); }).then(function (s) {
      var health = s.records.filter(function (r) { return /food|allergen|grease|permit|handler/i.test(r.fields.title); });
      var ready = [], gaps = [];
      health.forEach(function (r) {
        var proof = proofFor(s, r), d = daysLeft(r.fields.dueAt);
        if (d < 0 || !proof.length || r.status === 'in-progress') gaps.push('- **' + r.fields.title + '**: ' + (d < 0 ? when(d) : !proof.length ? 'no proof on file' : 'still in progress') + '; ' + (r.fields.owner || 'someone') + ' to close it');
        else ready.push('- ' + r.fields.title + ': last proof ' + niceDate(proof[proof.length - 1].at));
      });
      return 'For a health inspection, ' + health.length + ' items matter.\n\nReady:\n' + (ready.join('\n') || '- none yet') + '\n\nGaps, soonest first:\n' + (gaps.join('\n') || '- none') +
        '\n\nIn Gezel I would run the Audit Evidence Pack plan next, which writes one page an inspector can read, with every certificate number quoted.';
    });
  }

  function owner(ctx, text) {
    return state(ctx).then(function (s) {
      var r = find(s, text) || open(s)[0];
      return r ? '**' + r.fields.title + '** belongs to ' + (r.fields.owner || 'nobody yet') + (r.fields.authority ? ', and ' + r.fields.authority + ' issues it' : '') + '. It is due ' + niceDate(r.fields.dueAt) + '.' : 'The register is empty.';
    });
  }

  return {
    name: 'Hanna',
    role: 'Compliance Officer',
    greeting: 'Hello, I’m Hanna. I keep Harbor Street Café’s register in good standing. The fire extinguisher inspection is 5 days late, and the food service permit is due in 12 days.',
    suggestions: [
      'What’s due in the next 60 days?',
      'We renewed the food service permit, certificate FSP-23107',
      'The extinguisher inspection is booked for Friday',
      'Add our liquor license, renews every year on June 30',
      'Get us ready for the health inspection',
    ],
    respond: function (text, ctx) {
      var lower = text.toLowerCase();
      if (/\b(add|track)\b/.test(lower)) return added(ctx, text);
      if (/\b(renewed|renew(ed)? it|done|finished|completed|passed|filed|paid)\b/.test(lower)) return completed(ctx, text);
      if (/\b(booked|scheduled|started|working on|underway|in progress)\b/.test(lower)) return started(ctx, text);
      if (/\b(inspection|audit|inspector|ready)\b/.test(lower)) return inspection(ctx);
      if (/\b(who|owner|owns|responsible)\b/.test(lower)) return owner(ctx, text);
      if (/\b(due|coming up|overdue|late|next|soon|deadline)\b/.test(lower)) {
        var days = Number((lower.match(/(\d{1,3})\s*days?/) || [])[1]) || 60;
        return dueReport(ctx, days);
      }
      return null;
    },
    reactions: {
      page_complete_obligation: function (input, output) {
        return output && output.summary ? output.summary.split('. ')[0] + '. I’ll keep the next one on the list.' : 'Recorded.';
      },
      page_add_obligation: function (input) {
        return 'On the register: ' + input.title + ', due ' + niceDate(input.dueAt) + '. I’ll remind you two weeks ahead.';
      },
      page_log_evidence: function () {
        return 'Filed. That proof now sits beside the obligation for the next inspection.';
      },
    },
  };
})();

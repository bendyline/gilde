// The standalone demo's sample conversation. In Gezel, the home keeper's
// replies come from the model the person chooses; here they are scripted, and
// every change goes through the same tools the real crew member calls.
window.demoChat = (function () {
  'use strict';
  var DAY = 24 * 60 * 60 * 1000;
  var CARE_VERBS = /\b(replaced|changed|cleaned|washed|tested|flushed|serviced|cleared|swapped|checked|inspected|fixed|repaired|emptied|vacuumed|lubricated|oiled|did)\b/;
  var TROUBLE = /\b(leak|leaking|drip|dripping|noise|noisy|making a|banging|rattl|squeal|beep|chirp|trips|tripped|tripping|broken|not working|won't|wont|doesn't|does not|stuck|smell|smells|out again|went out|slow|takes two|takes forever|clogged|overflow)/;

  function name(r) { return (r.fields && r.fields.name) || r.id; }
  function lower(r) { return name(r).toLowerCase(); }
  function lastDone(r) { var f = r.fields || {}; return Date.parse(typeof f.lastDoneAt === 'string' ? f.lastDoneAt : r.createdAt); }
  function dueAt(r) { var f = r.fields || {}; return f.intervalDays > 0 ? lastDone(r) + f.intervalDays * DAY : NaN; }
  function isDue(r, now) { var at = dueAt(r); return isFinite(at) && now >= at; }
  function date(ms) { return new Date(ms).toLocaleDateString('en-US', { month: 'long', day: 'numeric' }); }
  function days(n) { return n + (n === 1 ? ' day' : ' days'); }
  function issue(r) {
    var found = (r.history || []).slice().reverse().find(function (h) { return h.to === 'attention' && h.note; });
    return found ? found.note : '';
  }
  // Gas, mains electricity and structure get the honest professional line.
  function safetyLine(r, note) {
    var text = (name(r) + ' ' + (note || '') + ' ' + ((r.fields && r.fields.care) || '')).toLowerCase();
    if (/water heater|furnace|boiler|pilot|gas|stove|range\b/.test(text)) {
      return 'That’s a gas appliance, so this one is for a licensed plumber or the gas company rather than relighting it again and again. If you ever smell gas, leave the house and call from outside.';
    }
    if (/breaker|panel|outlet|wiring|electric/.test(text)) return 'Anything inside the electrical panel is a job for a licensed electrician.';
    if (/foundation|crack|roof|beam|sag/.test(text)) return 'If it’s structural, have a professional look before it grows.';
    return '';
  }
  function records(ctx) {
    return ctx.read('systems.json').then(function (doc) { return (doc && doc.records) || []; });
  }
  // The card whose name shares the most words with what the person said.
  function match(list, text) {
    var said = text.toLowerCase();
    var best = null, score = 0;
    list.forEach(function (r) {
      var words = lower(r).split(/\s+/).filter(function (w) { return w.length > 2; });
      var hits = words.filter(function (w) { return said.indexOf(w.replace(/s$/, '')) >= 0; }).length;
      var value = said.indexOf(lower(r)) >= 0 ? 100 : hits / Math.max(1, words.length) + hits * 0.01;
      if (hits && value > score) { best = r; score = value; }
    });
    return best;
  }

  function status(ctx) {
    return ctx.invoke('house_status', {}, 'Care due and flagged').then(function () { return records(ctx); }).then(function (list) {
      var now = Date.now();
      var flagged = list.filter(function (r) { return r.status === 'attention'; });
      var due = list.filter(function (r) { return isDue(r, now); });
      var soon = list.filter(function (r) { var at = dueAt(r); return isFinite(at) && at > now && at - now <= 30 * DAY; })
        .sort(function (a, b) { return dueAt(a) - dueAt(b); });
      if (!flagged.length && !due.length) {
        return 'Nothing is due and nothing is flagged. The house is quiet.' +
          (soon.length ? ' Next up: ' + lower(soon[0]) + ' around ' + date(dueAt(soon[0])) + '.' : '');
      }
      var lines = [];
      flagged.forEach(function (r) { lines.push('- **' + name(r) + '**, flagged' + (issue(r) ? ': ' + issue(r).replace(/\.$/, '').toLowerCase() : '') + '.'); });
      due.forEach(function (r) {
        var over = Math.floor((now - dueAt(r)) / DAY);
        lines.push('- **' + name(r) + '**: ' + ((r.fields && r.fields.care) || 'care').toLowerCase() + (over > 0 ? ', ' + days(over) + ' overdue' : ', due today') + '.');
      });
      var safety = flagged.map(function (r) { return safetyLine(r, issue(r)); }).filter(Boolean)[0];
      return [
        'Here’s what the house needs:',
        lines.join('\n'),
        safety || '',
        soon.length ? 'Coming up: ' + lower(soon[0]) + ' around ' + date(dueAt(soon[0])) + '.' : '',
      ].filter(Boolean).join('\n\n');
    });
  }

  function logCare(ctx, text) {
    return records(ctx).then(function (list) {
      var r = match(list, text);
      if (!r) return 'Which system was that? Name it, like “I just replaced the furnace filter”.';
      var note = capitalize(text.replace(/^(i|we)\s+(just\s+)?/i, '').replace(/[.!]+$/, '')) + '.';
      return ctx.invoke('log_maintenance', { id: r.id, note: note }, name(r)).then(function () { return records(ctx); }).then(function (after) {
        var fresh = after.find(function (x) { return x.id === r.id; }) || r;
        var next = dueAt(fresh);
        return 'Logged on the ' + lower(fresh) + ' card' + (r.status === 'attention' ? ', and the flag is cleared' : '') + '. ' +
          (isFinite(next) ? 'The next one is due around **' + date(next) + '**.' : 'It has no set interval, so nothing new is scheduled.');
      });
    });
  }

  function flag(ctx, text) {
    return records(ctx).then(function (list) {
      var r = match(list, text);
      if (!r) return 'I don’t have a card for that yet. Tell me what it is and where it lives, like “add the kitchen faucet, kitchen sink”, and I’ll flag it there.';
      var note = capitalize(text.replace(/^(the|our|my)\s+/i, '').replace(/[.!]+$/, '')) + '.';
      return ctx.invoke('flag_attention', { id: r.id, note: note }, name(r)).then(function () {
        var advice = /smoke/.test(lower(r)) && /beep|chirp/i.test(text)
          ? 'A chirp almost always means a low battery. Swap it, press the test button, and tell me when it’s done so I can log it.'
          : /dryer/.test(lower(r))
          ? 'The likely cause is lint built up in the vent. Safe first check: clean the lint screen, then run the dryer and make sure the flap outside opens with a strong breeze. If the airflow is weak, book a vent cleaning soon; packed lint is a fire risk.'
          : safetyLine(r, note) || 'Note when it happens and for how long; that history is what a repair person will ask for first.';
        return 'Flagged on the ' + lower(r) + ' card. ' + advice;
      });
    });
  }

  function addSystem(ctx, text) {
    var body = text.replace(/^(please\s+)?(add|record|track|start a card for)\s+(the\s+|our\s+|a\s+|an\s+)?/i, '').replace(/[.!]+$/, '');
    var parts = body.split(/\s*[:,;]\s*|\s+-\s+/);
    var label = capitalize(parts.shift().trim());
    if (!label) return 'What should I add? Something like “add the garage door opener: lubricate it every 6 months”.';
    var rest = parts.join(', ');
    var every = rest.match(/every\s+(\d+)?\s*(day|week|month|year)s?/i) || text.match(/every\s+(\d+)?\s*(day|week|month|year)s?/i);
    var interval = every ? (Number(every[1]) || 1) * { day: 1, week: 7, month: 30, year: 365 }[every[2].toLowerCase()] : 0;
    var care = rest.replace(/\s*every\s+(\d+)?\s*(day|week|month|year)s?/i, '').replace(/^(and\s+)?/, '').trim();
    var input = { name: label };
    if (care) input.care = capitalize(care);
    if (interval) input.intervalDays = interval;
    var where = /garage/i.test(label) ? 'Garage' : /kitchen|faucet|dishwasher|disposal/i.test(label) ? 'Kitchen' : '';
    if (where) input.location = where;
    return ctx.invoke('record_system', input, label).then(function () {
      return label + ' has a card now' + (care ? ': ' + care.toLowerCase() : '') +
        (interval ? '. The first reminder lands around **' + date(Date.now() + interval * DAY) + '**.' : '. Tell me how often it needs care and I’ll set the clock.');
    });
  }

  function where(ctx, text) {
    return records(ctx).then(function (list) {
      var r = match(list, text);
      if (!r) return null;
      var f = r.fields || {};
      return f.location
        ? 'The ' + lower(r) + ' is in the **' + f.location.charAt(0).toLowerCase() + f.location.slice(1) + '**.' + (f.care ? ' Its card says: ' + f.care.charAt(0).toLowerCase() + f.care.slice(1) + '.' : '')
        : 'The ' + lower(r) + ' card has no location yet. Tell me where it lives and I’ll add it.';
    });
  }
  function capitalize(text) { return text.charAt(0).toUpperCase() + text.slice(1); }

  return {
    name: 'Wim',
    role: 'Home Keeper',
    greeting: 'Hello, I’m Wim. I keep the house’s care on a schedule so nobody has to remember it. Two jobs are overdue, and the water heater was flagged this week.',
    suggestions: [
      'What does the house need this week?',
      'I just replaced the furnace filter',
      'The dryer takes two cycles to dry a load',
      'Add the garage door opener: lubricate the rollers every 6 months',
      'Where is the water shutoff?',
    ],
    respond: function (text, ctx) {
      var said = text.toLowerCase();
      if (/\bwhere\b/.test(said)) return where(ctx, text);
      if (/^(please\s+)?(add|record|track|start a card)\b/.test(said)) return addSystem(ctx, text);
      if (CARE_VERBS.test(said) && /\b(i|we|just|today|yesterday)\b/.test(said)) return logCare(ctx, text);
      if (TROUBLE.test(said)) return flag(ctx, text);
      if (/\b(need|due|overdue|status|to do|todo|schedule|this week|this month|what's up|anything)\b/.test(said)) return status(ctx);
      return null;
    },
    reactions: {
      page_log_maintenance: function (input, output, ctx) {
        return records(ctx).then(function (list) {
          var r = list.find(function (x) { return x.id === input.id; });
          if (!r) return null;
          var next = dueAt(r);
          return 'Logged. ' + (isFinite(next) ? 'Next ' + lower(r) + ' care is due around ' + date(next) + '.' : 'The ' + lower(r) + ' card is up to date.');
        });
      },
      page_flag_attention: function (input, output, ctx) {
        return records(ctx).then(function (list) {
          var r = list.find(function (x) { return x.id === input.id; });
          if (!r) return null;
          return 'Flagged on the ' + lower(r) + ' card, so the repair starts from the history. ' + (safetyLine(r, input.note) || 'Tell me if it changes or gets worse.');
        });
      },
      page_record_system: function (input) {
        var interval = Number(input.intervalDays);
        return String(input.name) + ' has a card now.' + (interval > 0 ? ' First care is due around ' + date(Date.now() + interval * DAY) + '.' : ' Tell me how often it needs care and I’ll set the clock.');
      },
    },
  };
})();

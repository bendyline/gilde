// The standalone demo's sample conversation. In Gezel, the meal planner's
// replies come from the model the person chooses; here they are scripted, and
// every change goes through the same tools the real crew member calls.
window.demoChat = (function () {
  'use strict';
  var DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
  var IDEAS = [
    { meal: 'Shakshuka with spinach and feta', uses: ['eggs', 'canned tomatoes', 'spinach', 'feta'] },
    { meal: 'Black bean quesadillas', uses: ['black beans', 'tortillas', 'cheddar'] },
    { meal: 'Chickpea and spinach curry', uses: ['chickpeas', 'spinach', 'coconut milk'] },
    { meal: 'Egg fried rice', uses: ['eggs', 'brown rice', 'frozen peas'] },
  ];

  function title(day) { return day.charAt(0).toUpperCase() + day.slice(1); }
  function itemName(record) { return (record.fields && record.fields.name) || record.id; }
  function dayIn(text) {
    var lower = text.toLowerCase();
    return DAYS.find(function (day) { return lower.indexOf(day) >= 0; }) || null;
  }
  function state(ctx) {
    return Promise.all([ctx.read('menu.json'), ctx.read('pantry.json')]).then(function (values) {
      return { days: (values[0] && values[0].days) || {}, records: (values[1] && values[1].records) || [] };
    });
  }
  function stocked(records, wanted) {
    return records.some(function (r) { return r.status === 'stocked' && itemName(r).toLowerCase() === wanted; });
  }
  function bestIdea(s) {
    var planned = Object.keys(s.days).map(function (day) { return String(s.days[day]).toLowerCase(); });
    var fresh = IDEAS.filter(function (idea) { return planned.indexOf(idea.meal.toLowerCase()) < 0; });
    fresh.sort(function (a, b) {
      var have = function (idea) { return idea.uses.filter(function (u) { return stocked(s.records, u); }).length / idea.uses.length; };
      return have(b) - have(a);
    });
    return fresh[0] || IDEAS[0];
  }
  function itemAfter(text, pattern) {
    var match = text.match(pattern);
    if (!match) return '';
    return match[1].replace(/[.!?]+$/, '').replace(/^(the|some|our|my|more)\s+/i, '').trim();
  }
  function findItem(records, wanted) {
    var lower = wanted.toLowerCase();
    return records.find(function (r) { return itemName(r).toLowerCase() === lower; }) ||
      records.find(function (r) { return itemName(r).toLowerCase().indexOf(lower) >= 0 || lower.indexOf(itemName(r).toLowerCase()) >= 0; });
  }
  function capitalize(text) { return text.charAt(0).toUpperCase() + text.slice(1); }

  function planDay(ctx, asked) {
    return state(ctx).then(function (s) {
      var day = dayIn(asked) || DAYS.find(function (d) { return !s.days[d]; }) || 'sunday';
      var idea = bestIdea(s);
      var missing = idea.uses.filter(function (u) { return !stocked(s.records, u); });
      return ctx.invoke('set_menu', { day: day, meal: idea.meal }, title(day) + ': ' + idea.meal).then(function () {
        var planned = DAYS.filter(function (d) { return d === day || s.days[d]; }).length;
        var was = s.days[day] ? ' instead of ' + String(s.days[day]).toLowerCase() : '';
        return title(day) + ' is **' + idea.meal.toLowerCase() + '**' + was + '. ' +
          (missing.length
            ? 'Most of it is on the shelf; only ' + missing.join(' and ') + ' would need buying.'
            : 'Everything it needs is already stocked, so nothing new goes on the list.') +
          (was ? '' : ' That makes ' + planned + ' of 7 dinners planned.');
      });
    });
  }

  function groceries(ctx) {
    return ctx.invoke('grocery_list', {}, 'Low and out items').then(function () {
      return state(ctx);
    }).then(function (s) {
      var gap = s.records.filter(function (r) { return r.status === 'low' || r.status === 'out'; });
      if (!gap.length) return 'Nothing is low or out, so you can skip the store this week.';
      return 'One run covers it:\n\n' + gap.map(function (r) { return '- ' + itemName(r) + ' (' + r.status + ')'; }).join('\n') +
        '\n\nThe week’s dinners lean on what’s stocked, so that’s the whole list.';
    });
  }

  function setLevel(ctx, wanted, level) {
    return state(ctx).then(function (s) {
      if (!wanted) return 'Which item? Tell me its name, like “we’re out of limes”.';
      var found = findItem(s.records, wanted);
      var change = found
        ? ctx.invoke('pantry_level', { id: found.id, level: level }, itemName(found) + ': ' + level)
        : ctx.invoke('pantry_add', { name: capitalize(wanted), level: level }, capitalize(wanted) + ': ' + level);
      return change.then(function () {
        var label = found ? itemName(found) : capitalize(wanted);
        if (level === 'stocked') return 'Done: ' + label.toLowerCase() + ' came off the grocery list.';
        return 'Done: ' + label.toLowerCase() + ' went on the grocery list, marked ' + level + '.' +
          (level === 'out' ? ' I’ll plan around it until the next run.' : '');
      });
    });
  }

  function tonight(ctx) {
    return state(ctx).then(function (s) {
      var today = DAYS[(new Date().getUTCDay() + 6) % 7];
      var meal = s.days[today];
      return meal
        ? 'Tonight is ' + meal.toLowerCase() + '. Want me to swap it for something quicker?'
        : 'Nothing is planned for tonight yet. Ask me to plan ' + title(today) + ' and I’ll pick something from the pantry.';
    });
  }

  return {
    name: 'Mila',
    role: 'Meal Planner',
    greeting: 'Hello, I’m Mila. I plan the week around what’s already in your pantry, so one grocery run covers it. Sunday is still open, and you’re out of limes.',
    suggestions: [
      'Plan Sunday around what we have',
      'What do I need from the store?',
      'We just ran out of olive oil',
      'Swap Thursday for something quick',
    ],
    respond: function (text, ctx) {
      var lower = text.toLowerCase();
      if (/\b(ran out of|run out of|out of|used up|finished)\b/.test(lower)) {
        return setLevel(ctx, itemAfter(text, /(?:ran out of|run out of|out of|used up|finished)\s+(.+)/i), 'out');
      }
      if (/\b(low on|running low|almost out)\b/.test(lower)) {
        return setLevel(ctx, itemAfter(text, /(?:low on|running low on|almost out of)\s+(.+)/i), 'low');
      }
      if (/\b(bought|restocked|picked up|got more)\b/.test(lower)) {
        return setLevel(ctx, itemAfter(text, /(?:bought|restocked|picked up|got more)\s+(.+)/i), 'stocked');
      }
      if (/\b(grocer|store|shop|buy|shopping)/.test(lower)) return groceries(ctx);
      var changing = /\b(swap|change|replace|instead|plan)\b/.test(lower);
      if (/\b(tonight|today)\b/.test(lower) && !changing) return tonight(ctx);
      if (changing || /\b(dinner|cook|make)\b/.test(lower) || dayIn(lower)) return planDay(ctx, text);
      return null;
    },
    reactions: {
      page_set_menu: function (input) {
        return title(String(input.day)) + ' is set: ' + String(input.meal).toLowerCase() + '. I’ll check the pantry for it before the next grocery run.';
      },
      page_pantry_level: function (input) {
        return input.level === 'stocked' ? null : 'Got it. It’s on the grocery list now.';
      },
    },
  };
})();

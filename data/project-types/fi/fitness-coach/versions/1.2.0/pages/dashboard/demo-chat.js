// The standalone demo's sample conversation. In Gezel, the coach's replies
// come from the model the person chooses; here they are scripted, and every
// change goes through the same tools the real crew member calls.
window.demoChat = (function () {
  'use strict';
  var DAY = 86400000;
  var WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  var WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];
  var NUMBER_WORDS = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7 };
  var KINDS = [
    [/\blong run\b/, 'Long run'], [/\beasy run\b/, 'Easy run'], [/\b(tempo|intervals?)\b/, 'Tempo intervals'],
    [/\blong walk\b/, 'Long walk'], [/\b(run|ran|running|jog|jogged|jogging)\b/, 'Run'],
    [/\b(hike|hiked|hiking)\b/, 'Hike'], [/\b(walk|walked|walking)\b/, 'Walk'],
    [/\b(swim|swam|swimming)\b/, 'Swim'], [/\b(cycle|cycled|cycling|bike|biked|biking|ride|rode)\b/, 'Ride'],
    [/\b(strength|weights|lifted|lifting|gym)\b/, 'Strength'], [/\byoga\b/, 'Yoga'], [/\bpilates\b/, 'Pilates'],
    [/\b(mobility|stretch|stretched|stretching)\b/, 'Mobility'], [/\b(row|rowed|rowing)\b/, 'Row'],
    [/\b(climb|climbed|climbing|bouldering)\b/, 'Climbing'],
  ];

  function word(n) { return n >= 0 && n < WORDS.length ? WORDS[n] : String(n); }
  function plural(n, one) { return word(n) + ' ' + (n === 1 ? one : one + 's'); }
  function minutesOf(e) { var m = e && e.data && Number(e.data.minutes); return isFinite(m) && m > 0 ? m : 0; }
  function activityOf(e) { return String((e && e.data && e.data.activity) || 'session'); }
  // Local days and weeks, as the page shows them.
  function dayIndex(ms) { return (new Date(ms).getDay() + 6) % 7; }
  function weekStart(ms) { var d = new Date(ms); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - dayIndex(ms)); return d.getTime(); }
  function localDay(value) { var d = new Date(value); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }

  function state(ctx) {
    return ctx.read('training.json').then(function (doc) {
      doc = doc || {};
      var events = Array.isArray(doc.events) ? doc.events.slice() : [];
      events.sort(function (a, b) { return a.at < b.at ? -1 : a.at > b.at ? 1 : 0; });
      var now = Date.now(), start = weekStart(now);
      var target = Number(doc.weeklyTarget) > 0 ? Math.round(Number(doc.weeklyTarget)) : 0;
      return {
        goal: doc.goal || 'your goal',
        target: target,
        events: events,
        week: events.filter(function (e) { return Date.parse(e.at) >= start; }),
        lastWeek: events.filter(function (e) { var t = Date.parse(e.at); return t >= start - 7 * DAY && t < start; }),
        daysLeft: 6 - dayIndex(now),
        streak: streak(events),
      };
    });
  }
  function streak(events) {
    if (!events.length) return 0;
    var days = {};
    events.forEach(function (e) { days[localDay(e.at)] = true; });
    var cursor = new Date(events[events.length - 1].at), n = 0;
    cursor.setHours(12, 0, 0, 0);
    while (days[localDay(cursor)]) { n += 1; cursor.setDate(cursor.getDate() - 1); }
    return n;
  }
  // Spread the sessions still owed across the days left in the week.
  function spreadDays(count, daysLeft) {
    var today = dayIndex(Date.now()), left = [];
    for (var i = today + 1; i <= 6; i++) left.push(WEEKDAYS[i]);
    if (!count || count > left.length) return [];
    var step = left.length / count, picked = [];
    for (var k = 0; k < count; k++) picked.push(left[Math.floor(k * step + step / 2)]);
    return picked;
  }
  function joinAnd(items) { return items.length < 2 ? items.join('') : items.slice(0, -1).join(', ') + ' and ' + items[items.length - 1]; }
  // "That’s 2 of 4 this week" after a change; "This week stands at 2 of 4" when asked.
  function weekLine(s, asked) {
    var done = s.week.length, owed = s.target - done;
    var lead = asked ? 'This week stands at ' + done + (s.target ? ' of ' + s.target : '') : 'That’s ' + done + (s.target ? ' of ' + s.target : '') + ' this week';
    if (!s.target) return lead + '.';
    if (owed <= 0) return lead + ': target met. Anything more is a bonus, so keep it easy.';
    var days = spreadDays(owed, s.daysLeft);
    if (!days.length) return lead + '. Count what fits; the target is a floor to stand on, not a stick.';
    return lead + (asked ? ', with ' + plural(s.daysLeft, 'day') + ' left' : '') + '. ' + capitalize(word(owed)) + ' more to go: ' +
      joinAnd(days) + ' would spread ' + (owed === 1 ? 'it' : 'them') + ' out.';
  }
  function capitalize(text) { return text.charAt(0).toUpperCase() + text.slice(1); }

  function minutesIn(text) {
    var lower = text.toLowerCase();
    var m = lower.match(/(\d+(?:\.\d+)?)\s*-?\s*(?:minutes?|mins?|m)\b/);
    if (m) return Math.round(Number(m[1]));
    var h = lower.match(/(\d+(?:\.\d+)?)\s*-?\s*(?:hours?|hrs?|h)\b/);
    if (h) return Math.round(Number(h[1]) * 60);
    if (/\bhalf an hour\b/.test(lower)) return 30;
    if (/\b(an|one) hour\b/.test(lower)) return 60;
    return 0;
  }
  function activityIn(text) {
    var lower = text.toLowerCase();
    var hit = KINDS.find(function (k) { return k[0].test(lower); });
    return hit ? hit[1] : '';
  }
  function targetIn(text) {
    var lower = text.toLowerCase();
    var digit = lower.match(/\b(\d{1,2})\b/);
    if (digit) return Number(digit[1]);
    var named = Object.keys(NUMBER_WORDS).find(function (w) { return new RegExp('\\b' + w + '\\b').test(lower); });
    return named ? NUMBER_WORDS[named] : 0;
  }

  function logSession(ctx, text) {
    var activity = activityIn(text), minutes = minutesIn(text);
    var input = { activity: activity };
    if (minutes) input.minutes = minutes;
    var distance = text.match(/(\d+(?:\.\d+)?)\s*(k|km|mi|miles?)\b/i);
    if (distance) input.note = distance[1] + (/^k/i.test(distance[2]) ? 'k' : ' mi');
    var before;
    return state(ctx).then(function (s) {
      before = s;
      return ctx.invoke('log_workout', input, activity + (minutes ? ', ' + minutes + ' min' : ''));
    }).then(function (out) {
      return state(ctx).then(function (s) {
        var longestBefore = before.events.reduce(function (best, e) { return minutesOf(e) > minutesOf(best) ? e : best; }, null);
        var first = out && out.personalBest
          ? 'Logged, and that’s your longest session on record: ' + minutes + ' minutes, past the ' + minutesOf(longestBefore) + '-minute ' + activityOf(longestBefore).toLowerCase() + '. Well earned.'
          : 'Logged: ' + (minutes ? 'a ' + minutes + '-minute ' : '') + activity.toLowerCase() + (input.note ? ', ' + input.note : '') + '. Every one of these counts.';
        var streakLine = s.streak > before.streak ? ' That also stretches the streak to ' + plural(s.streak, 'day') + '.' : '';
        return first + streakLine + '\n\n' + weekLine(s) + (minutes ? '' : ' Next time, tell me how long it ran and I’ll log the minutes too.');
      });
    });
  }

  function weekStatus(ctx) {
    return ctx.invoke('training_status', {}, 'Streak and this week').then(function () { return state(ctx); }).then(function (s) {
      if (!s.events.length) return 'Nothing is logged yet. Tell me about your first session and the record starts there.';
      var parts = ['You’re on a ' + s.streak + '-day streak, ' + plural(s.events.length, 'session') + ' toward ' + s.goal + '.'];
      parts.push(weekLine(s, true));
      if (s.lastWeek.length && s.target) {
        parts.push(s.lastWeek.length >= s.target
          ? 'Last week you made ' + s.lastWeek.length + ' of ' + s.target + ', so the rhythm is already there.'
          : 'Last week landed at ' + s.lastWeek.length + ' of ' + s.target + '. If that keeps happening, we can shrink the target until it fits.');
      }
      return parts.join(' ');
    });
  }

  function nextSession(ctx) {
    return state(ctx).then(function (s) {
      if (!s.events.length) return 'Start small: a 20-minute walk or easy run, any day this week. Tell me when it’s done and I’ll log it.';
      var last = s.events[s.events.length - 1];
      var recent = s.events.filter(function (e) { return Date.parse(e.at) >= Date.now() - 7 * DAY; });
      var strength = recent.some(function (e) { return /strength|gym|weights|mobility|yoga|pilates/i.test(activityOf(e)); });
      var hard = /tempo|interval|long|hill|race/i.test(activityOf(last)) || minutesOf(last) >= 45;
      if (s.streak >= 3) {
        return 'You’ve trained ' + word(s.streak) + ' days running, ending with the ' + activityOf(last).toLowerCase() +
          '. Make tomorrow a rest day or 20 easy minutes of mobility, then an easy 30-minute run the day after. Rest is part of the plan, not a gap in it.';
      }
      if (hard) return 'The ' + activityOf(last).toLowerCase() + ' was the hard one, so next is an easy 30-minute run at a pace you could talk through.';
      if (!strength) return 'No strength work in the last week. Twenty-five minutes of mobility and strength would round it out and keep your legs happy on the runs.';
      return 'An easy 30-minute run. Most of ' + s.goal + ' gets built on sessions like that one.';
    });
  }

  function suggestionFor(r) {
    var target = r.target || 0;
    if (target && r.sessions < target) {
      var gap = target - r.sessions;
      return 'Pick ' + word(target) + ' fixed days and make ' + (gap > 1 ? 'two of them 20-minute easy runs' : 'one of them a 20-minute easy run') + ', so a busy evening still counts.';
    }
    if (r.minutesChange < 0) return 'Keep ' + word(r.sessions) + ' sessions and add 10 minutes to the easy runs to win back the ' + Math.abs(r.minutesChange) + ' minutes.';
    if (r.longest) return 'Hold the same rhythm and stretch the ' + r.longest.activity.toLowerCase() + ' from ' + r.longest.minutes + ' to ' + (r.longest.minutes + 10) + ' minutes.';
    return 'Keep the same rhythm and add one easy 20-minute session.';
  }

  function writeRecap(ctx) {
    var numbers;
    return ctx.invoke('training_recap', {}, 'This week against last').then(function (out) {
      numbers = out.recap;
      return ctx.invoke('save_recap', { suggestion: suggestionFor(numbers) }, 'Week of ' + numbers.weekOf);
    }).then(function () {
      var r = numbers, owed = r.target - r.sessions;
      var early = dayIndex(Date.now()) < 4 && owed > 0;
      var change = r.minutesChange === 0 ? 'level with last week' : Math.abs(r.minutesChange) + ' minutes ' + (r.minutesChange > 0 ? 'more' : 'fewer') + ' than last week';
      return 'Saved to the recap panel. So far: ' + r.sessions + ' of ' + r.target + ' sessions and ' + r.minutes + ' minutes, ' + change + '.' +
        (early ? ' It’s early in the week, so read that as a start, not a verdict.' : '') +
        '\n\nOne thing for next week: ' + suggestionFor(r).charAt(0).toLowerCase() + suggestionFor(r).slice(1);
    });
  }

  function setTarget(ctx, text) {
    return state(ctx).then(function (s) {
      var lower = text.toLowerCase(), wanted = targetIn(text);
      if (!wanted && /\b(drop|lower|reduce|cut|fewer|less)\b/.test(lower)) wanted = Math.max(1, s.target - 1);
      if (!wanted && /\b(raise|bump|increase|more)\b/.test(lower)) wanted = s.target + 1;
      if (!wanted) return 'How many sessions a week feels right? Tell me a number and I’ll set it.';
      if (wanted > 14) return 'That’s more than two a day. Let’s keep the target to something a week can actually hold.';
      if (wanted === s.target) return 'It’s already ' + plural(wanted, 'session') + ' a week, so nothing changes.';
      return ctx.invoke('set_target', { weeklyTarget: wanted }, plural(wanted, 'session') + ' a week').then(function () {
        return state(ctx);
      }).then(function (after) {
        var lead = wanted < s.target
          ? 'Done: ' + plural(wanted, 'session') + ' a week. A plan that fits a packed week beats one that breaks in it, and we can grow it back later.'
          : 'Done: ' + plural(wanted, 'session') + ' a week. Grow it slowly; if it starts to pinch, we’ll shrink it again.';
        return lead + '\n\n' + weekLine(after);
      });
    });
  }

  function careful() {
    return 'I can’t tell what’s going on with pain, so I won’t guess. If it’s sharp, swollen, or still there in a few days, have a doctor or physical therapist look at it.\n\n' +
      'Meanwhile, rest counts. If you want, I can lower this week’s target so a few easy days don’t feel like falling behind.';
  }

  return {
    name: 'Tess',
    role: 'Coach',
    greeting: 'Hello, I’m Tess, your coach. Today’s recovery walk makes it three days in a row. Tell me about a session and I’ll log it, or ask how the week is shaping up.',
    suggestions: [
      'I just did a 55-minute long run',
      'How is my week going?',
      'This week is packed. Can we drop to 3?',
      'What should my next session be?',
      'Write this week’s recap',
    ],
    respond: function (text, ctx) {
      var lower = text.toLowerCase();
      if (/\b(hurts?|hurting|pain|painful|injur\w*|sprain\w*|knee|ankle|shins?|dizzy|chest)\b/.test(lower)) return careful();
      if (/\b(recap|wrap.?up|summar)/.test(lower)) return writeRecap(ctx);
      if (/\b(target|goal of|drop|lower|reduce|cut back|raise|bump|increase)\b/.test(lower) ||
        /\b(\d+|one|two|three|four|five|six|seven)\s+(sessions?|times|days)\s+(a|per)\s+week\b/.test(lower)) return setTarget(ctx, text);
      if (/\b(next|tomorrow|what should i|what do i do)\b/.test(lower)) return nextSession(ctx);
      var activity = activityIn(text);
      if (activity && (minutesIn(text) > 0 || /\b(just|did|went|finished|done|got in|log|ran|walked|swam|cycled|biked|rode|lifted|hiked|rowed|climbed)\b/.test(lower))) {
        return logSession(ctx, text);
      }
      if (/\b(how am i|how is|how's|hows|going|on track|streak|progress|status|this week)\b/.test(lower)) return weekStatus(ctx);
      if (/\b(thanks|thank you|cheers)\b/.test(lower)) return 'Anytime. Tell me about the next session when it’s done.';
      return null;
    },
    reactions: {
      page_log_workout: function (input, output) {
        var minutes = Number(input.minutes) || 0;
        if (output && output.personalBest) return 'Your longest session yet: ' + minutes + ' minutes. That’s a real milestone.';
        if (!output || !output.weeklyTarget) return 'Logged. Nice work.';
        var owed = output.weeklyTarget - output.thisWeek;
        return 'Logged. ' + (owed > 0
          ? output.thisWeek + ' of ' + output.weeklyTarget + ' this week, ' + word(owed) + ' to go.'
          : 'That’s ' + output.thisWeek + ' of ' + output.weeklyTarget + ': target met for the week.');
      },
      page_set_target: function (input) {
        var n = Math.round(Number(input.weeklyTarget));
        return n > 0 ? capitalize(plural(n, 'session')) + ' a week it is. I’ll count against that from now on.' : null;
      },
      // As in Gezel: the recap button summons the coach, who saves the recap with one suggestion.
      request_recap: function (input, output, ctx) {
        if (!output || output.status !== 'recap_wanted' || !output.recap) return null;
        return ctx.invoke('save_recap', { suggestion: suggestionFor(output.recap) }, 'Week of ' + output.recap.weekOf)
          .then(function (saved) { return saved.display; });
      },
    },
  };
})();

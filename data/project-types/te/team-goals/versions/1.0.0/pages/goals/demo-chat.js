// The standalone demo's sample conversation. In Gezel, the planner's replies
// come from the model the person chooses; here they are scripted, and every
// change goes through the same tools the crew calls.
window.demoChat = (function () {
  'use strict';
  var DAY = 86400000;
  var NUMBERS = { a: 1, an: 1, one: 1, another: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };
  var WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

  function pad(n) { return n < 10 ? '0' + n : String(n); }
  function iso(ms) { var d = new Date(ms); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function dayMs(day) { return Date.parse(String(day).slice(0, 10) + 'T00:00:00'); }
  function daysLeft(day) { return Math.round((dayMs(day) - dayMs(iso(Date.now()))) / DAY); }
  function niceDate(day) { return new Date(String(day).slice(0, 10) + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }); }
  function pct(p) { return Math.round(p * 100) + '%'; }
  function late(days) { return -days + (days === -1 ? ' day late' : ' days late'); }

  function state(ctx) {
    return Promise.all([ctx.read('goals.json'), ctx.read('keyresults.json'), ctx.read('checkins.json'), ctx.read('actions.json')]).then(function (v) {
      return { goals: (v[0] && v[0].records) || [], krs: (v[1] && v[1].records) || [], events: (v[2] && v[2].events) || [], actions: (v[3] && v[3].records) || [] };
    });
  }
  function krProgress(f) {
    var start = Number(f.start) || 0, target = Number(f.target), current = Number(f.current) || 0;
    if (target === start) return current >= target ? 1 : 0;
    return Math.max(0, Math.min(1, (current - start) / (target - start)));
  }
  function timeGone(f) {
    var due = dayMs(f.dueAt || ''), start = dayMs(f.startAt || ''), today = dayMs(iso(Date.now()));
    if (!isFinite(due)) return null;
    if (!isFinite(start) || due <= start) return today >= due ? 1 : 0;
    return Math.max(0, Math.min(1, (today - start) / (due - start)));
  }
  function krsOf(s, goal) { return s.krs.filter(function (k) { return k.fields.goalId === goal.id && k.status !== 'closed'; }); }
  function progress(s, goal) { var mine = krsOf(s, goal); return mine.length ? mine.reduce(function (t, k) { return t + krProgress(k.fields); }, 0) / mine.length : null; }
  function pace(p, gone) { return p === null ? 'no key results yet' : p >= 1 ? 'target met' : gone === null ? 'no due date' : gone >= 1 ? 'past due' : p >= gone - 0.1 ? 'on track' : p >= gone - 0.25 ? 'at risk' : 'behind'; }
  function active(s) {
    return s.goals.filter(function (g) { return g.status === 'active'; }).map(function (g) {
      var p = progress(s, g), gone = timeGone(g.fields);
      return { goal: g, p: p, gone: gone, pace: pace(p, gone), lag: p === null ? -2 : gone === null ? -1 : gone - p };
    }).sort(function (a, b) { return b.lag - a.lag; });
  }
  function openActions(s) {
    return s.actions.filter(function (a) { return a.status !== 'done'; }).sort(function (a, b) { return String(a.fields.dueAt || '9999').localeCompare(String(b.fields.dueAt || '9999')); });
  }
  // The record whose title shares the most words with what the person wrote.
  function best(records, text) {
    var words = text.toLowerCase().match(/[a-z]{4,}/g) || [];
    var top = null, score = 0;
    records.forEach(function (r) {
      var title = r.fields.title.toLowerCase();
      var hits = words.filter(function (w) { return title.indexOf(w) >= 0 || title.indexOf(w.replace(/ies$/, 'y').replace(/s$/, '')) >= 0; }).length;
      if (hits > score) { top = r; score = hits; }
    });
    return top;
  }
  function amountOf(text) {
    var m = text.toLowerCase().match(/\b(\d+(?:\.\d+)?|an?|one|another|two|three|four|five|six|seven|eight|nine|ten)\s+(?:more|new|extra)\b/) || text.toLowerCase().match(/\b(?:up|grew|rose|added)\s+(?:by\s+)?(\d+(?:\.\d+)?)/);
    if (!m) return null;
    return NUMBERS[m[1]] || Number(m[1]);
  }
  function nextWeekday(name) {
    var target = WEEKDAYS.indexOf(name), today = new Date().getDay();
    var ahead = (target - today + 7) % 7 || 7;
    return iso(Date.now() + ahead * DAY);
  }

  function status(ctx) {
    return ctx.invoke('goals_status', {}, 'All goals').then(function () { return state(ctx); }).then(function (s) {
      var rows = active(s);
      if (!rows.length) return 'There are no active goals yet. Tell me what the team wants to reach this quarter.';
      var overdue = openActions(s).filter(function (a) { return a.fields.dueAt && daysLeft(a.fields.dueAt) < 0; });
      return 'Furthest behind first:\n' + rows.map(function (r) {
        return '- **' + r.goal.fields.title + '** is ' + r.pace + (r.p === null ? '' : ': ' + pct(r.p) + ' done' + (r.gone === null ? '' : ' with ' + pct(r.gone) + ' of the time gone')) + ' (' + (r.goal.fields.owner || 'no owner') + ')';
      }).join('\n') + '\n\n' +
        (overdue.length ? 'Overdue from the last meeting: **' + overdue[0].fields.title + '** (' + (overdue[0].fields.owner || 'no owner') + ', ' + late(daysLeft(overdue[0].fields.dueAt)) + '). Clearing that is the quickest help.' : 'No meeting action is overdue.');
    });
  }

  function moved(ctx, text) {
    var change = amountOf(text);
    return state(ctx).then(function (s) {
      var kr = best(s.krs.filter(function (k) { return k.status !== 'closed'; }), text);
      if (!kr || change === null) return 'Which key result moved, and by how much? Something like “we signed two more retainer clients” is enough.';
      if (/\b(lost|fewer|down|dropped)\b/i.test(text)) change = -change;
      return ctx.invoke('update_key_result', { keyResult: kr.id, change: change, note: text.replace(/\s+/g, ' ').trim() }, kr.fields.title + (change < 0 ? ' ' : ' +') + change).then(function () { return state(ctx); }).then(function (after) {
        var now = after.krs.find(function (k) { return k.id === kr.id; });
        var goal = after.goals.find(function (g) { return g.id === now.fields.goalId; });
        var p = progress(after, goal), gone = timeGone(goal.fields);
        var next = openActions(after).filter(function (a) { return a.fields.goalId === goal.id; })[0];
        return 'Recorded: **' + now.fields.title + '** moved from ' + kr.fields.current + ' to ' + now.fields.current + ' of ' + now.fields.target + '. ' +
          goal.fields.title + ' is now ' + pct(p) + ' done with ' + pct(gone) + ' of the time gone, ' + pace(p, gone) + '.' +
          (next ? ' Next on it: ' + next.fields.title.replace(/^./, function (c) { return c.toLowerCase(); }) + ' (' + (next.fields.owner || 'no owner') + (next.fields.dueAt ? ', ' + niceDate(next.fields.dueAt) : '') + ').' : '');
      });
    });
  }

  function checkedIn(ctx, text) {
    var who = (text.match(/^\s*([A-Z][a-z]+)\s+checked in/) || [])[1] || '';
    var said = (text.split(/:\s*/)[1] || '').trim();
    var confidence = /\bat risk\b/i.test(text) ? 'at-risk' : /\b(off track|behind|blocked|stuck|slipp)/i.test(text) ? 'off-track' : /\bon track\b/i.test(text) ? 'on-track' : '';
    return state(ctx).then(function (s) {
      var goal = best(s.goals.filter(function (g) { return g.status === 'active'; }), said || text) ||
        s.goals.find(function (g) { return g.status === 'active' && who && String(g.fields.owner).toLowerCase() === who.toLowerCase(); });
      if (!goal) return 'Which goal was the check-in about? Name it and I’ll log it.';
      var input = { goal: goal.id, who: who || goal.fields.owner, note: said ? said.replace(/^./, function (c) { return c.toUpperCase(); }) : text.trim() };
      if (confidence) input.confidence = confidence;
      return ctx.invoke('log_checkin', input, (who || goal.fields.owner) + ' on ' + goal.fields.title).then(function () { return state(ctx); }).then(function (after) {
        var block = openActions(after).filter(function (a) { return a.fields.goalId === goal.id; })[0];
        return 'Logged ' + (who || goal.fields.owner) + '’s check-in on **' + goal.fields.title + '**' + (confidence ? ', ' + confidence.replace('-', ' ') : '') + '. ' +
          (block && daysLeft(block.fields.dueAt) < 0
            ? 'The action that unblocks it is overdue: ' + block.fields.title.replace(/^./, function (c) { return c.toLowerCase(); }) + ', ' + late(daysLeft(block.fields.dueAt)) + '. Should I add a follow-up for Monday’s meeting?'
            : block ? 'Next on it: ' + block.fields.title.replace(/^./, function (c) { return c.toLowerCase(); }) + '.' : 'There is no open action on it yet; tell me what the team agrees and I’ll add it.');
      });
    });
  }

  function agreed(ctx, text) {
    var body = (text.split(/:\s*/)[1] || text).trim();
    var m = body.match(/^([A-Z][a-z]+)\s+(\w+)\s+(.+?)(?:\s+by\s+(\w+))?[.!]?$/);
    if (!m) return Promise.resolve('Who does what, and by when? Something like “Lea drafts the website copy by Friday” is enough.');
    var verb = m[2].replace(/(sh|ch|x|ss)es$/, '$1').replace(/([^s])s$/, '$1');
    var title = verb.replace(/^./, function (c) { return c.toUpperCase(); }) + ' ' + m[3];
    var by = (m[4] || '').toLowerCase();
    var dueAt = WEEKDAYS.indexOf(by) >= 0 ? nextWeekday(by) : by === 'tomorrow' ? iso(Date.now() + DAY) : '';
    return state(ctx).then(function (s) {
      var goal = best(s.goals.filter(function (g) { return g.status === 'active'; }), m[3]);
      var input = { title: title, owner: m[1], from: 'Today’s meeting' };
      if (dueAt) input.dueAt = dueAt;
      if (goal) input.goal = goal.id;
      return ctx.invoke('add_action', input, title + ' (' + m[1] + ')').then(function () {
        return 'Added: **' + title + '**, owned by ' + m[1] + (dueAt ? ', due ' + niceDate(dueAt) : '') + (goal ? ', for ' + goal.fields.title : '') + '. Any other actions from the meeting? Send them one at a time and I’ll add each.';
      });
    });
  }

  function finished(ctx, text) {
    return state(ctx).then(function (s) {
      var a = best(openActions(s), text);
      if (!a) return null;
      return ctx.invoke('complete_action', { id: a.id }, a.fields.title).then(function () { return state(ctx); }).then(function (after) {
        var left = openActions(after);
        return 'Marked done: **' + a.fields.title + '**. ' + (left.length ? left.length + (left.length === 1 ? ' action is' : ' actions are') + ' still open; the soonest is ' + left[0].fields.title.replace(/^./, function (c) { return c.toLowerCase(); }) + ' (' + left[0].fields.owner + ').' : 'Every meeting action is done.');
      });
    });
  }

  function quiet(ctx) {
    return state(ctx).then(function (s) {
      var since = dayMs(iso(Date.now())) - 6 * DAY;
      var rows = active(s);
      var missing = [], done = [];
      rows.forEach(function (r) {
        var events = s.events.filter(function (e) { return e.kind === 'checkin' && e.data && e.data.goalId === r.goal.id; });
        var last = events[events.length - 1];
        if (last && Date.parse(last.at) >= since) done.push(r.goal.fields.owner);
        else missing.push('- **' + (r.goal.fields.owner || 'No owner') + '** on ' + r.goal.fields.title + (last ? ': last check-in ' + niceDate(last.at) + (last.data.confidence ? ', ' + last.data.confidence.replace('-', ' ') : '') : ': no check-in yet'));
      });
      if (!missing.length) return 'Everyone has checked in this week: ' + done.join(', ') + '.';
      return 'Not checked in this week:\n' + missing.join('\n') + (done.length ? '\n\nEveryone else has: ' + done.join(', ') + '.' : '');
    });
  }

  return {
    name: 'Max',
    role: 'Planner',
    greeting: 'Hello, I’m Max. I keep Fernwood Studio’s goals honest. The new website is behind, the case studies are at risk, and one meeting action is overdue.',
    suggestions: [
      'How are we doing on our goals?',
      'We signed two more retainer clients',
      'Who hasn’t checked in this week?',
      'Mara checked in: the case studies are at risk, two sign-offs still out',
      'From today’s meeting: Lea drafts the website copy by Friday',
    ],
    respond: function (text, ctx) {
      var lower = text.toLowerCase();
      if (/checked in\s*:/.test(lower) || /^\s*[a-z]+ checked in\b/.test(lower) && !/\b(who|hasn|haven|not)\b/.test(lower)) return checkedIn(ctx, text);
      if (/\b(who|hasn.?t|haven.?t|not yet|missing)\b/.test(lower) && /check/.test(lower)) return quiet(ctx);
      if (/\bmeeting\b|\baction:/.test(lower)) return agreed(ctx, text);
      if (amountOf(text) !== null) return moved(ctx, text);
      if (/\b(sent|done|finished|booked|shared|completed|did)\b/.test(lower)) return finished(ctx, text);
      if (/\b(how|doing|status|progress|behind|track|goals?|update)\b/.test(lower)) return status(ctx);
      return null;
    },
    reactions: {
      page_update_key_result: function (input, output) {
        return output && output.summary ? output.summary.split(' (target')[0] + '. I’ll keep the pace line honest.' : 'Recorded.';
      },
      page_log_checkin: function (input) {
        return 'Logged' + (input.who ? ' ' + input.who + '’s' : ' the') + ' check-in' + (input.confidence && input.confidence !== 'on-track' ? '. Since it is ' + input.confidence.replace('-', ' ') + ', want me to add an action for the next meeting?' : '. Thanks for keeping the week current.');
      },
      page_add_goal: function (input) {
        return 'On the board: ' + input.title + '. What numbers will show it moving? Add a key result or tell me.';
      },
      page_add_key_result: function (input) {
        return 'Added ' + input.title + '. I’ll track it from ' + input.current + ' toward ' + input.target + '.';
      },
      page_add_action: function (input) {
        return 'Added: ' + input.title + (input.owner ? ' for ' + input.owner : '') + '.';
      },
      page_complete_action: function () {
        return 'Done and off the list.';
      },
    },
  };
})();

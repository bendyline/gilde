// The standalone demo's sample conversation. In Gezel, the training
// coordinator's replies come from the model the person chooses; here they are
// scripted, and every change goes through the same tools the crew calls.
window.demoChat = (function () {
  'use strict';
  var DAY = 86400000;
  var WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  var PHASES = ['before day one', 'day one', 'first week', '30 days', '60 days', '90 days'];

  function pad(n) { return n < 10 ? '0' + n : String(n); }
  function iso(ms) { var d = new Date(ms); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function daysLeft(day) { return Math.round((Date.parse(String(day).slice(0, 10) + 'T00:00:00') - Date.parse(iso(Date.now()) + 'T00:00:00')) / DAY); }
  function niceDate(day) { return new Date(String(day).slice(0, 10) + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }); }
  function list(items) { return items.length < 2 ? items.join('') : items.slice(0, -1).join(', ') + ' and ' + items[items.length - 1]; }
  function lower1(s) { return s.charAt(0).toLowerCase() + s.slice(1); }
  function first(h) { return h.fields.name.split(' ')[0]; }
  function when(day) { var d = daysLeft(day); return d < 0 ? -d + (d === -1 ? ' day late' : ' days late') : d === 0 ? 'today' : d === 1 ? 'tomorrow' : niceDate(day); }

  function state(ctx) {
    return Promise.all([ctx.read('hires.json'), ctx.read('tasks.json')]).then(function (v) {
      var hires = (v[0] && v[0].records) || [];
      return { hires: hires, active: hires.filter(function (h) { return h.status !== 'done'; }), tasks: (v[1] && v[1].records) || [] };
    });
  }
  function stepsOf(s, h) { return s.tasks.filter(function (t) { return t.fields.hireId === h.id; }).sort(function (a, b) { return a.fields.dueAt.localeCompare(b.fields.dueAt); }); }
  function openOf(s, h) { return stepsOf(s, h).filter(function (t) { return t.status !== 'done'; }); }
  function findHire(s, text) {
    var lowered = text.toLowerCase();
    return s.active.find(function (h) { return lowered.indexOf(h.fields.name.toLowerCase()) >= 0; }) ||
      s.active.find(function (h) { return new RegExp('\\b' + first(h).toLowerCase() + '\\b').test(lowered); }) || null;
  }
  // The step the person means: the open one whose title shares the most words with what they wrote.
  function findStep(s, h, text) {
    var words = (text.toLowerCase().replace(/-/g, ' ').match(/[a-z]{4,}/g) || []).map(function (w) { return w.replace(/s$/, ''); })
      .filter(function (w) { return ['with', 'have', 'been', 'done', 'today', 'happened', 'went', 'well', 'into', first(h).toLowerCase()].indexOf(w) < 0; });
    var best = null, score = 0;
    openOf(s, h).forEach(function (t) {
      var title = t.fields.title.toLowerCase().replace(/-/g, ' ');
      var hits = words.filter(function (w) { return title.indexOf(w) >= 0; }).length;
      if (hits > score) { best = t; score = hits; }
    });
    return best;
  }
  function stepLine(t) { return '- **' + t.fields.title + '**: ' + (t.fields.owner || 'no owner') + ', ' + (daysLeft(t.fields.dueAt) < 0 ? when(t.fields.dueAt) : 'due ' + when(t.fields.dueAt)); }

  function beforeStart(ctx, text) {
    return ctx.invoke('onboarding_status', {}, 'Plans this week').then(function () { return state(ctx); }).then(function (s) {
      var h = findHire(s, text) || s.active.filter(function (x) { return daysLeft(x.fields.startOn) > 0; })[0];
      if (!h) return 'Nobody is waiting to start right now.';
      var d = daysLeft(h.fields.startOn);
      var steps = openOf(s, h).filter(function (t) { return t.fields.phase === 'before day one' || (d > 0 && t.fields.phase === 'day one'); });
      var before = steps.filter(function (t) { return t.fields.phase === 'before day one'; });
      if (!steps.length) return first(h) + ' is all set for day one.';
      return (d > 0 ? first(h) + ' starts ' + niceDate(h.fields.startOn) + '. ' : '') + (before.length ? 'Still to do before day one:\n' + before.map(stepLine).join('\n') : 'Everything before day one is done.') +
        (steps.length > before.length ? '\n\nOn the day itself: ' + list(steps.filter(function (t) { return t.fields.phase === 'day one'; }).map(function (t) { return lower1(t.fields.title); })) + ', with ' + (h.fields.manager || 'the manager') + '.' : '') +
        (before.some(function (t) { return t.fields.owner === 'Office'; }) ? '\n\nThe office steps are the office administrator’s; tell me as each one is done.' : '');
    });
  }

  function overdue(ctx) {
    return ctx.invoke('onboarding_status', {}, 'Overdue steps').then(function () { return state(ctx); }).then(function (s) {
      var late = [];
      s.active.forEach(function (h) { openOf(s, h).forEach(function (t) { if (daysLeft(t.fields.dueAt) < 0) late.push(t); }); });
      if (!late.length) return 'Nothing is overdue. The next step due is ' + (function () {
        var next = s.tasks.filter(function (t) { return t.status !== 'done' && s.active.some(function (h) { return h.id === t.fields.hireId; }); }).sort(function (a, b) { return a.fields.dueAt.localeCompare(b.fields.dueAt); })[0];
        return next ? lower1(next.fields.title) + ' for ' + next.fields.hireName + ', ' + when(next.fields.dueAt) : 'nothing at all';
      })() + '.';
      return 'Overdue:\n' + late.map(function (t) { return '- **' + t.fields.hireName + '**: ' + t.fields.title + ' (' + t.fields.owner + ', ' + when(t.fields.dueAt) + ')'; }).join('\n');
    });
  }

  function checkOff(ctx, text) {
    return state(ctx).then(function (s) {
      var h = findHire(s, text);
      if (!h) return 'Whose plan is that for? Tell me like “Mira’s email and scheduling accounts are set up”.';
      var lowered = text.toLowerCase();
      var phase = PHASES.find(function (p) { return lowered.indexOf(p) >= 0; });
      if (phase && /\b(everything|all)\b/.test(lowered)) {
        var batch = openOf(s, h).filter(function (x) { return x.fields.phase === phase; });
        if (!batch.length) return 'Everything in ' + phase + ' was already done for ' + first(h) + '.';
        return ctx.invoke('complete_task', { hire: h.id, phase: phase }, h.fields.name + ': ' + phase).then(function () { return state(ctx); }).then(function (after) {
          var mine = stepsOf(after, h), left = openOf(after, h);
          return 'Checked off all ' + batch.length + ' ' + phase + ' steps for ' + first(h) + ': ' + list(batch.map(function (x) { return lower1(x.fields.title); })) + '. ' +
            (mine.length - left.length) + ' of ' + mine.length + ' steps done' + (left.length ? '; next: ' + lower1(left[0].fields.title) + ', due ' + when(left[0].fields.dueAt) + '.' : '.');
        });
      }
      var t = findStep(s, h, text);
      if (!t) return 'Which of ' + first(h) + '’s steps is done? The open ones start with ' + lower1(openOf(s, h)[0].fields.title) + '.';
      var note = /settling in well/i.test(text) ? 'Settling in well.' : '';
      var input = { hire: h.id, task: t.id };
      if (note) input.note = note;
      return ctx.invoke('complete_task', input, h.fields.name + ': ' + t.fields.title).then(function () { return state(ctx); }).then(function (after) {
        var mine = stepsOf(after, h), left = openOf(after, h);
        var phaseLeft = left.filter(function (x) { return x.fields.phase === t.fields.phase; });
        var lateLeft = after.active.reduce(function (n, x) { return n + openOf(after, x).filter(function (y) { return daysLeft(y.fields.dueAt) < 0; }).length; }, 0);
        return 'Checked off **' + t.fields.title + '** for ' + first(h) + '. ' + (mine.length - left.length) + ' of ' + mine.length + ' steps done. ' +
          (phaseLeft.length ? 'Still open in ' + t.fields.phase + ': ' + list(phaseLeft.map(function (x) { return lower1(x.fields.title); })) + '. ' : 'That finishes ' + t.fields.phase + '. ') +
          (daysLeft(t.fields.dueAt) < 0 && !lateLeft ? 'Nothing is overdue now. ' : '') +
          (left.length ? 'Next: ' + lower1(left[0].fields.title) + ', ' + (daysLeft(left[0].fields.dueAt) < 0 ? when(left[0].fields.dueAt) : 'due ' + when(left[0].fields.dueAt)) + '.' : first(h) + '’s plan is complete.');
      });
    });
  }

  function addStep(ctx, text) {
    return state(ctx).then(function (s) {
      var h = findHire(s, text);
      if (!h) return 'Whose plan should it go on?';
      var what = (text.match(/\badd (?:a |an )?(.+?) to [A-Z][a-z]+(?:['’]s)? /i) || [])[1];
      if (!what) return 'What should I add to ' + first(h) + '’s plan, and when? For example “add a latte art session with Hana to Mira’s first week”.';
      var lowered = text.toLowerCase();
      var phase = PHASES.find(function (p) { return lowered.indexOf(p) >= 0; }) || (/\bweek\b/.test(lowered) ? 'first week' : /\bday one|first day\b/.test(lowered) ? 'day one' : 'first week');
      var withWho = (what.match(/\bwith ([A-Z][a-z]+)/) || [])[1];
      var title = what.charAt(0).toUpperCase() + what.slice(1);
      var input = { hire: h.id, title: title, phase: phase };
      if (withWho) input.owner = withWho;
      return ctx.invoke('add_task', input, h.fields.name + ': ' + title).then(function () { return state(ctx); }).then(function (after) {
        var t = stepsOf(after, h).find(function (x) { return x.fields.title === title; });
        return 'Added **' + title + '** to ' + first(h) + '’s ' + phase + (withWho ? ', with ' + withWho + ' as the owner' : '') + ', due ' + when(t.fields.dueAt) + '. It sits beside shadowing ' + (h.fields.buddy ? first({ fields: { name: h.fields.buddy } }) : 'the buddy') + ' in the plan.';
      });
    });
  }

  function addHire(ctx, text) {
    var name = (text.match(/\b[Aa]dd\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)/) || [])[1];
    if (!name) return Promise.resolve('Who is starting? Give me their full name, role and first day, like “add Lena Vos, barista, starting next Monday with Dana”.');
    var lowered = text.toLowerCase();
    var role = (text.match(/,\s*(?:an? )?([a-z]+(?: [a-z]+)?)\s*,/i) || text.match(/\bas an? ([a-z]+(?: [a-z]+)?)/i) || [])[1] || '';
    var day = (lowered.match(new RegExp('\\b(?:starting|starts|from)\\s+((?:next |this )?(?:' + WEEKDAYS.join('|') + '|tomorrow))\\b')) || [])[1];
    if (!day) return Promise.resolve('When is ' + name.split(' ')[0] + '’s first day? A weekday like “next Monday” is enough.');
    var manager = (text.match(/\bwith ([A-Z][a-z]+)/) || [])[1];
    var input = { name: name, role: role ? role.charAt(0).toUpperCase() + role.slice(1) : '', startOn: day };
    if (manager) input.manager = manager;
    var spoken = day.replace(new RegExp(WEEKDAYS.join('|')), function (w) { return w.charAt(0).toUpperCase() + w.slice(1); });
    return ctx.invoke('add_hire', input, name + ', starts ' + spoken).then(function () { return state(ctx); }).then(function (s) {
      var h = s.active.find(function (x) { return x.fields.name === name; });
      var before = openOf(s, h).filter(function (t) { return t.fields.phase === 'before day one'; });
      return 'Added **' + name + '**' + (role ? ', ' + role.toLowerCase() : '') + ', starting ' + niceDate(h.fields.startOn) + ', with the standard 13-step plan. Before day one: ' +
        list(before.map(function (t) { return lower1(t.fields.title) + ' (' + t.fields.owner + ', ' + when(t.fields.dueAt) + ')'; })) + '. Who should be ' + first(h) + '’s first-week buddy?';
    });
  }

  function progress(ctx, text) {
    return state(ctx).then(function (s) {
      var h = findHire(s, text);
      if (!h) return null;
      return ctx.invoke('list_plan', { hire: h.id }, h.fields.name + '’s plan').then(function () {
        var mine = stepsOf(s, h), left = openOf(s, h);
        var d = daysLeft(h.fields.startOn);
        return '**' + h.fields.name + '** is ' + (d > 0 ? 'starting ' + niceDate(h.fields.startOn) : 'on day ' + (1 - d)) + ', with ' + (mine.length - left.length) + ' of ' + mine.length + ' steps done.' +
          (left.length ? ' Next up:\n' + left.slice(0, 3).map(stepLine).join('\n') : ' The plan is complete.');
      });
    });
  }

  return {
    name: 'Bas',
    role: 'Training Coordinator',
    greeting: 'Hello, I’m Bas. I look after Harbor Street Café’s new hires. Mira starts in four days and her accounts, uniform and forms are still to do; Jamal’s first-week check-in is a week late.',
    suggestions: [
      'What’s due before Mira starts?',
      'Mira’s email and scheduling accounts are set up',
      'Jamal’s first-week check-in happened today; he’s settling in well',
      'Add a latte art session with Hana to Mira’s first week',
      'Add Lena Vos, barista, starting next Monday with Dana',
    ],
    respond: function (text, ctx) {
      var lowered = text.toLowerCase();
      if (/\badd\b/.test(lowered) && /\bto [A-Z][a-z]+(?:['’]s)? /.test(text)) return addStep(ctx, text);
      if (/\badd\b/.test(lowered)) return addHire(ctx, text);
      if (/\b(overdue|late|behind|missed)\b/.test(lowered)) return overdue(ctx);
      if (/\b(set up|done|finished|happened|ready|sent|collected|signed|returned|complete[d]?)\b/.test(lowered) && !/\?\s*$/.test(text)) return checkOff(ctx, text);
      if (/\b(before|starts?|due|this week|coming up|first day)\b/.test(lowered)) return beforeStart(ctx, text);
      if (/\b(how is|how’s|how's|going|progress|far along|plan)\b/.test(lowered)) return progress(ctx, text);
      return null;
    },
    reactions: {
      page_complete_task: function (input, output) {
        return output && output.summary ? output.summary.split(/\.\s/)[0] + '.' : 'Saved.';
      },
      page_add_hire: function (input) {
        return 'Added ' + input.name + ' with the standard plan. The first steps are the welcome note and their accounts; I’ll keep both in Coming up.';
      },
      page_add_task: function (input) {
        return 'Added “' + input.title + '” to the ' + input.phase + ' part of the plan.';
      },
    },
  };
})();

// The standalone demo's sample conversation. In Gezel, the training
// coordinator's replies come from the model the person chooses; here they are
// scripted, and every change goes through the same tools the crew calls.
window.demoChat = (function () {
  'use strict';
  var DAY = 86400000;
  var WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  // A sample quiz written from the café's own opening checklist (docs/opening-checklist.md).
  var OPENING_QUIZ = [
    'What should the fridges read before we open? | 41°F or below | 50°F or below | Room temperature is fine',
    'How long do we flush each espresso group head before the first shot? | 5 seconds | 30 seconds | We skip it',
    'When is the first test shot pulled? | After the grinder is dialed in | Before the machine is warm | When the first order comes in',
    'Where do the pastry allergen labels go? | On the case, beside each item | In the office drawer | Only on request',
    'What gets sanitized before the doors open? | Counters, door handles and the pastry case glass | Just the floor | Nothing until the lunch rush',
    'How much float goes in the register drawer? | $150 | $50 | $500',
    'What happens to milk past its date? | It is thrown out and written in the waste log | It is used first | It moves to the back',
    'When do the front doors unlock? | 6:30 am, once the checklist is signed | Whenever the first barista arrives | 7:30 am',
    'Who signs the opening checklist? | The opening shift lead | The owner | Nobody signs it',
    'What is the last step before unlocking? | Walk the floor for hazards and check the restrooms are stocked | Count the tips | Turn the music up',
  ];

  function pad(n) { return n < 10 ? '0' + n : String(n); }
  function iso(ms) { var d = new Date(ms); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function daysLeft(day) { return Math.round((Date.parse(String(day).slice(0, 10) + 'T00:00:00') - Date.parse(iso(Date.now()) + 'T00:00:00')) / DAY); }
  function niceDate(day) { return new Date(String(day).slice(0, 10) + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }); }
  function longDate(day) { return new Date(String(day).slice(0, 10) + 'T12:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }); }
  function list(items) { return items.length < 2 ? items.join('') : items.slice(0, -1).join(', ') + ' and ' + items[items.length - 1]; }
  function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }
  function first(p) { return p.fields.name.split(' ')[0]; }

  function state(ctx) {
    return Promise.all([ctx.read('people.json'), ctx.read('courses.json'), ctx.read('completions.json')]).then(function (v) {
      return {
        people: ((v[0] && v[0].records) || []).filter(function (p) { return p.status !== 'left'; }),
        courses: ((v[1] && v[1].records) || []).filter(function (c) { return c.status !== 'retired'; }),
        events: (v[2] && v[2].events) || [],
      };
    });
  }
  function roleKey(text) { return String(text || '').trim().toLowerCase().replace(/([a-z]{3,}[^s])s$/, '$1'); }
  function requires(course, person) {
    var rf = String(course.fields.requiredFor || 'everyone').toLowerCase(), mine = roleKey(person.fields.role);
    if (/\b(everyone|everybody|all)\b/.test(rf)) return true;
    return !!mine && rf.split(/\s*,\s*/).map(roleKey).some(function (r) { return r === mine || mine.indexOf(r) >= 0 || r.indexOf(mine) >= 0; });
  }
  function cell(s, p, c) {
    var done = s.events.filter(function (e) { return e.kind === 'completed' && e.data.personId === p.id && e.data.courseId === c.id; })
      .sort(function (a, b) { return String(a.data.completedAt).localeCompare(String(b.data.completedAt)); });
    var last = done[done.length - 1] || null, since = last ? String(last.at) : '';
    var booking = s.events.filter(function (e) { return e.kind === 'booked' && e.data.personId === p.id && e.data.courseId === c.id && daysLeft(e.data.on) >= 0 && String(e.at) > since; })
      .sort(function (a, b) { return a.data.on.localeCompare(b.data.on); })[0] || null;
    var days = last && last.data.expiresAt ? daysLeft(last.data.expiresAt) : null;
    var required = requires(c, p);
    var st = last ? (!last.data.expiresAt ? 'done' : days < 0 ? 'expired' : days <= 30 ? 'expiring' : 'current') : required ? 'missing' : 'optional';
    return { state: required ? st : 'optional', last: last, days: days, booking: booking };
  }
  // The course the person means: the one whose title shares the most words with what they wrote.
  function findCourse(s, text) {
    var words = (text.toLowerCase().replace(/-/g, ' ').match(/[a-z]{4,}/g) || []).map(function (w) { return w.replace(/s$/, ''); });
    var best = null, score = 0;
    s.courses.forEach(function (c) {
      var title = c.fields.title.toLowerCase();
      var hits = words.filter(function (w) { return title.indexOf(w) >= 0; }).length;
      if (hits > score) { best = c; score = hits; }
    });
    return best;
  }
  function findPerson(s, text) {
    var lower = text.toLowerCase();
    return s.people.find(function (p) { return lower.indexOf(p.fields.name.toLowerCase()) >= 0; }) ||
      s.people.find(function (p) { return new RegExp('\\b' + first(p).toLowerCase() + '\\b').test(lower); }) || null;
  }
  function needsFor(s, c) {
    var rank = { expired: 0, missing: 1, expiring: 2 };
    return s.people.map(function (p) { return { p: p, x: cell(s, p, c) }; })
      .filter(function (n) { return rank[n.x.state] !== undefined; })
      .sort(function (a, b) { return rank[a.x.state] - rank[b.x.state] || (a.x.days || 0) - (b.x.days || 0); });
  }
  function needLine(n) {
    var when = n.x.state === 'expired' ? 'lapsed ' + -n.x.days + (n.x.days === -1 ? ' day ago' : ' days ago') : n.x.state === 'expiring' ? 'runs out in ' + n.x.days + (n.x.days === 1 ? ' day' : ' days') : 'hasn’t done it yet';
    return '- **' + n.p.fields.name + '** ' + when + (n.x.booking ? ', booked ' + niceDate(n.x.booking.data.on) : '');
  }

  function whoNeeds(ctx, text) {
    return ctx.invoke('training_status', { withinDays: 30 }, 'Next 30 days').then(function () { return state(ctx); }).then(function (s) {
      var c = findCourse(s, text);
      var courses = c ? [c] : s.courses;
      // "What's expiring" asks about certificates that run out, not courses never taken.
      var expiryOnly = !c && /expir|run(?:s|ning)? out|lapsed/i.test(text);
      var blocks = courses.map(function (course) {
        var n = needsFor(s, course).filter(function (x) { return !expiryOnly || x.x.state !== 'missing'; });
        return n.length ? (c ? '' : '**' + course.fields.title + '**\n') + n.map(needLine).join('\n') : '';
      }).filter(Boolean);
      if (!blocks.length) return c ? 'Everyone is current on ' + c.fields.title.toLowerCase() + ' for the next 30 days.' : 'Nothing lapses or runs out in the next 30 days.';
      var open = c ? needsFor(s, c).filter(function (n) { return !n.x.booking; }).length : 0;
      return (c ? 'For the ' + c.fields.title.toLowerCase() + ', this month:\n' : expiryOnly ? 'Lapsed or running out in the next 30 days:\n' : 'Here is what needs doing in the next 30 days, lapsed first:\n') + blocks.join('\n\n') +
        (c && open ? '\n\n' + open + (open === 1 ? ' person isn’t' : ' people aren’t') + ' booked yet. Want me to put them all in one session?' : '');
    });
  }

  function book(ctx, text) {
    return state(ctx).then(function (s) {
      var c = findCourse(s, text) || s.courses.find(function (x) { return /refresher/i.test(x.fields.title); });
      if (!c) return 'Which course should I book?';
      var lower = text.toLowerCase();
      var day = (lower.match(new RegExp('\\b(' + WEEKDAYS.join('|') + '|tomorrow)\\b')) || [])[1];
      if (!day) return 'Which day works for the ' + c.fields.title.toLowerCase() + '? A weekday like “Thursday” is enough.';
      var person = findPerson(s, text);
      var input = { course: c.id, on: day };
      if (person) input.person = person.id;
      else input.everyoneDue = true;
      var before = needsFor(s, c).filter(function (n) { return !n.x.booking; }).map(function (n) { return n.p.id; });
      return ctx.invoke('book_training', input, c.fields.title + ', ' + cap(day)).then(function () { return state(ctx); }).then(function (after) {
        var booked = s.people.filter(function (p) { return (person ? p.id === person.id : before.indexOf(p.id) >= 0) && cell(after, p, c).booking; });
        if (!booked.length) return 'Everyone who needs the ' + c.fields.title.toLowerCase() + ' is already booked.';
        var on = cell(after, booked[0], c).booking.data.on;
        var already = needsFor(after, c).filter(function (n) { return n.x.booking && n.x.booking.data.on !== on; });
        return 'Booked the ' + c.fields.title.toLowerCase() + ' for ' + niceDate(on) + ': ' + list(booked.map(function (p) { return p.fields.name; })) + '. ' +
          (already.length ? list(already.map(function (n) { return first(n.p); })) + ' stays on ' + niceDate(already[0].x.booking.data.on) + '. ' : '') +
          'Record each certificate when it comes in and the expiry dates move on their own.';
      });
    });
  }

  function completed(ctx, text) {
    return state(ctx).then(function (s) {
      var p = findPerson(s, text);
      var c = findCourse(s, text);
      if (!p || !c) return 'Who finished which course? Tell me like “Mira passed her food handler card today, certificate FH-48213”.';
      var cert = (text.match(/\b([A-Z]{1,4}-?\d{3,}[\w-]*)\b/) || [])[1];
      var input = { person: p.id, course: c.id, completedAt: /\byesterday\b/i.test(text) ? 'yesterday' : 'today' };
      if (cert) input.certificate = cert;
      return ctx.invoke('record_completion', input, p.fields.name + ': ' + c.fields.title).then(function () { return state(ctx); }).then(function (after) {
        var x = cell(after, p, c);
        var still = after.courses.filter(function (other) { return cell(after, p, other).state === 'missing'; });
        var starts = p.fields.startedAt && daysLeft(p.fields.startedAt) > 0;
        return 'Recorded: **' + p.fields.name + '** finished the ' + c.fields.title.toLowerCase() + (cert ? ', certificate ' + cert : '') + '. ' +
          (x.last.data.expiresAt ? 'It’s good until ' + longDate(x.last.data.expiresAt) + ', and I’ll remind you two weeks before. ' : 'It doesn’t expire. ') +
          (still.length ? first(p) + ' still needs ' + list(still.map(function (o) { return o.fields.title.toLowerCase(); })) + (starts ? ' before or soon after starting on ' + niceDate(p.fields.startedAt) : '') + '.' : first(p) + ' is fully current now.');
      });
    });
  }

  function quiz(ctx, text) {
    return state(ctx).then(function (s) {
      if (!/opening/i.test(text)) return 'Which document should the quiz come from? The opening checklist, the allergen guide and the closing checklist are in Your documents.';
      var c = s.courses.find(function (x) { return /opening/i.test(x.fields.title); });
      var input = { title: 'Opening checklist quiz', source: 'docs/opening-checklist.md', questions: OPENING_QUIZ.join('\n') };
      if (c) input.course = c.id;
      return ctx.invoke('save_quiz', input, 'Opening checklist quiz').then(function () {
        return 'Saved a 10-question quiz from **docs/opening-checklist.md**' + (c ? ' under ' + c.fields.title : '') + '. It covers fridge temperatures, flushing the group heads, the register float, the waste log and who signs the checklist. ' +
          'It’s under Quizzes, where anyone can tap an answer and see if it’s right. Mira could take it before her first opening shift.';
      });
    });
  }

  function addPerson(ctx, text) {
    return state(ctx).then(function (s) {
      var name = (text.match(/\b[Aa]dd\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)/) || [])[1];
      if (!name) return 'Who should I add? Give me their full name and role, like “add Lena Vos as a barista starting Monday”.';
      var role = (text.match(/\bas an? ([a-z]+(?: lead)?)\b/i) || [])[1] || '';
      var day = (text.toLowerCase().match(new RegExp('\\b(?:starting|starts|from)\\s+((?:next |this )?(?:' + WEEKDAYS.join('|') + '|tomorrow))\\b')) || [])[1];
      var input = { name: name, role: cap(role) };
      if (day) input.startedAt = day;
      return ctx.invoke('add_person', input, name + (role ? ', ' + role : '')).then(function () { return state(ctx); }).then(function (after) {
        var p = after.people.find(function (x) { return x.fields.name === name; });
        var needed = after.courses.filter(function (c) { return requires(c, p); });
        return 'Added **' + name + '**' + (role ? ' as a ' + role.toLowerCase() : '') + (p.fields.startedAt ? ', starting ' + niceDate(p.fields.startedAt) : '') + '. ' +
          (needed.length ? 'Their row shows ' + needed.length + ' courses to do: ' + list(needed.map(function (c) { return c.fields.title.toLowerCase(); })) + '. The food handler card comes first, since it takes a week to arrive.' : 'No courses apply to that role yet.');
      });
    });
  }

  function standing(ctx, text) {
    return state(ctx).then(function (s) {
      var p = findPerson(s, text);
      if (!p) return null;
      return ctx.invoke('list_training', { person: p.id }, p.fields.name).then(function () {
        var lines = s.courses.map(function (c) {
          var x = cell(s, p, c);
          if (x.state === 'optional') return '';
          return '- ' + c.fields.title + ': ' + (x.state === 'missing' ? 'not done yet' : x.state === 'done' ? 'done' : x.state === 'expired' ? 'lapsed ' + -x.days + ' days ago' : 'good until ' + longDate(x.last.data.expiresAt)) + (x.booking ? ', booked ' + niceDate(x.booking.data.on) : '');
        }).filter(Boolean);
        return '**' + p.fields.name + '** (' + (p.fields.role || 'no role') + '):\n' + lines.join('\n');
      });
    });
  }

  return {
    name: 'Jens',
    role: 'Training Coordinator',
    greeting: 'Hello, I’m Jens. I keep Harbor Street Café’s training current. Marco’s food safety refresher has lapsed, though he’s booked in three days; four more refreshers run out this month; and Mira starts in four days with her food handler card still to do.',
    suggestions: [
      'Who needs food-safety refreshers this month?',
      'Book the refreshers for Thursday',
      'Mira passed her food handler card today, certificate FH-48213',
      'Make a 10-question quiz from the opening checklist',
      'Add Lena Vos as a barista starting next Monday',
    ],
    respond: function (text, ctx) {
      var lower = text.toLowerCase();
      if (/\bquiz\b/.test(lower)) return quiz(ctx, text);
      if (/\badd\b/.test(lower) && /\b[Aa]dd\s+[A-Z][a-z]+\s+[A-Z]/.test(text)) return addPerson(ctx, text);
      if (/\b(book|schedule)\b/.test(lower)) return book(ctx, text);
      if (/\b(passed|finished|completed|did|done|got|earned)\b/.test(lower)) return completed(ctx, text);
      if (/\b(who needs|needs?|due|expir\w*|lapsed|runs? out|running out|this month|refreshers?)\b/.test(lower)) return whoNeeds(ctx, text);
      if (/\b(where|stand|status|how is|what does|missing)\b/.test(lower)) return standing(ctx, text);
      return null;
    },
    reactions: {
      page_record_completion: function (input, output) {
        return output && output.summary ? output.summary.split(/;|\.\s/)[0] + '. I’ll keep the next expiry on the reminder.' : 'Recorded.';
      },
      page_add_person: function (input) {
        return 'Added ' + input.name + '. Their row shows every course their role needs; book the first one when you’re ready.';
      },
      page_add_course: function (input) {
        return 'Added ' + input.title + (Number(input.validMonths) ? ', good for ' + input.validMonths + ' months' : ', a one-time course') + '. It’s a new column in the matrix.';
      },
      page_book_training: function (input) {
        return 'Booked for ' + niceDate(input.on) + '. It shows on their row until the certificate comes in.';
      },
    },
  };
})();

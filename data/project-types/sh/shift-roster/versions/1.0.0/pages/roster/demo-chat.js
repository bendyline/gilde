// The standalone demo's sample conversation. In Gezel, the shift scheduler's
// replies come from the model the person chooses; here they are scripted, and
// every change goes through the same tools (and the same roster rules) the crew uses.
window.demoChat = (function () {
  'use strict';
  var rules = window.rosterRules;
  var WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  var today = rules.localDay(Date.now());
  // The sample week is this week until Wednesday, then next week (the page builds the same one).
  var sampleMonday = rules.addDays(rules.mondayOf(today), (new Date().getDay() + 6) % 7 >= 3 ? 7 : 0);
  var weekWord = sampleMonday === rules.mondayOf(today) ? 'this week' : 'next week';
  var proposal = null;
  // The suggestions still worth offering once a swap question has taken their place.
  var LATER = ['Copy this roster into the following week', 'Who’s closest to their hours limit?'];

  function state(ctx) {
    return Promise.all(['staff.json', 'shifts.json', 'availability.json', 'rules.json'].map(function (p) { return ctx.read(p); })).then(function (v) {
      return { staff: (v[0] && v[0].records) || [], shifts: (v[1] && v[1].records) || [], availability: (v[2] && v[2].records) || [], rules: v[3] || { version: 1, notes: [] } };
    });
  }
  function dayName(date) { return new Date(date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long' }); }
  function niceDate(date) { return new Date(date + 'T12:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric' }); }
  function shiftName(s) {
    var f = s.fields;
    var kind = f.role === 'kitchen' ? 'kitchen shift' : f.start < '10:00' ? (f.role || '') + ' open' : f.start >= '13:00' ? (f.role || '') + ' close' : (f.role || '') + ' shift';
    return dayName(f.date) + '’s ' + kind.trim() + ' (' + f.start + '–' + f.end + ')';
  }
  function nameOf(s, id) { var p = s.staff.filter(function (x) { return x.id === id; })[0]; return p ? p.fields.name : id; }
  function findPerson(s, text) {
    var words = text.toLowerCase().match(/[a-z]+/g) || [];
    return s.staff.filter(function (p) { return words.indexOf(p.fields.name.toLowerCase()) >= 0; })[0] || null;
  }
  function upcomingGaps(s) {
    var gaps = [];
    [sampleMonday, rules.addDays(sampleMonday, 7)].forEach(function (m) {
      rules.weekView(s, m, Date.now()).gaps.forEach(function (g) { if (!g.past) gaps.push(g); });
    });
    return gaps;
  }

  function short(ctx) {
    return ctx.invoke('roster_status', {}, 'Open spots').then(function () { return state(ctx); }).then(function (s) {
      var gaps = upcomingGaps(s);
      if (!gaps.length) return 'Every upcoming shift is covered. Nothing to fill.';
      return 'Here’s where we’re short, soonest first:\n' + gaps.map(function (g) {
        var free = rules.freeFor(g.shift, s);
        return '- **' + shiftName(g.shift) + '**: ' + g.open + ' open' + (rules.staffOn(g.shift).length ? ' (' + rules.staffOn(g.shift).map(function (id) { return nameOf(s, id); }).join(', ') + ' on it)' : '') + '; free: ' + (free.length ? free.slice(0, 3).map(function (x) { return x.name + ' (' + x.hours + ' h)'; }).join(', ') : 'nobody who fits every rule');
      }).join('\n') + '\n\nWant me to fill them with whoever has the fewest hours?';
    });
  }

  function fill(ctx) {
    return state(ctx).then(function (s) {
      var gaps = upcomingGaps(s);
      if (!gaps.length) return 'Nothing is open, so there’s nothing to fill.';
      var placed = [], stuck = [];
      return gaps.reduce(function (chain, g) {
        return chain.then(function () {
          return state(ctx).then(function (now) {
            var shift = now.shifts.filter(function (x) { return x.id === g.shift.id; })[0];
            var open = rules.neededOf(shift) - rules.staffOn(shift).length, steps = Promise.resolve();
            for (var i = 0; i < open; i++) {
              steps = steps.then(function () {
                return state(ctx).then(function (latest) {
                  var current = latest.shifts.filter(function (x) { return x.id === shift.id; })[0];
                  var free = rules.freeFor(current, latest);
                  if (!free.length) { stuck.push(shiftName(current)); return; }
                  return ctx.invoke('assign_shift', { id: current.id, staff: free[0].id }, free[0].name + ' → ' + current.fields.date.slice(5) + ' ' + current.fields.start).then(function () {
                    placed.push(free[0].name + ' on ' + shiftName(current) + ', ' + free[0].hours + ' hours so far');
                  });
                });
              });
            }
            return steps;
          });
        });
      }, Promise.resolve()).then(function () {
        return (placed.length ? 'Proposed:\n' + placed.map(function (p) { return '- ' + p; }).join('\n') + '\n\nEach one passed availability, rest and hours. Those shifts are back with you: approve the week when you’re happy with it.' : '') +
          (stuck.length ? '\n\nNobody fits every rule for ' + stuck.join(' and ') + '; that one needs your call.' : '');
      });
    });
  }

  // After an availability change: the first upcoming shift it clashes with, and who could swap in.
  function offerSwap(s, personId, lead) {
    var me = s.staff.filter(function (x) { return x.id === personId; })[0];
    var clash = me && s.shifts.filter(function (sh) {
      return rules.staffOn(sh).indexOf(personId) >= 0 && rules.span(sh.fields).endAt > Date.now() && rules.problems(me, sh, s, { hours: false }).some(function (t) { return /unavailable/.test(t); });
    }).sort(function (a, b) { return (a.fields.date + a.fields.start).localeCompare(b.fields.date + b.fields.start); })[0];
    if (!clash) return lead + ' Nothing on the roster clashes with that.';
    var without = { id: clash.id, status: clash.status, fields: Object.assign({}, clash.fields, { staff: rules.staffOn(clash).filter(function (id) { return id !== personId; }) }) };
    var free = rules.freeFor(without, s).filter(function (x) { return x.id !== personId; });
    if (!free.length) return lead + ' That clashes with ' + shiftName(clash) + ', and nobody else fits every rule for it. That one needs your call.';
    proposal = { shift: clash.id, out: personId, outName: me.fields.name, inId: free[0].id, inName: free[0].name, label: shiftName(clash) };
    return { reply: lead + ' That clashes with ' + shiftName(clash) + ', where ' + me.fields.name + ' is on. ' + free[0].name + ' is free and has the fewest hours (' + free[0].hours + '). Want me to swap them?', suggestions: ['Yes, swap them'].concat(LATER) };
  }

  function unavailable(ctx, text) {
    return state(ctx).then(function (s) {
      var p = findPerson(s, text);
      if (!p) return 'Who is that for? Use their name, like “Cleo can’t work Saturdays”.';
      var lower = text.toLowerCase();
      var named = (lower.match(/\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday)s?\b/) || [])[1];
      var day = named || (/\bweekends?\b/.test(lower) ? 'weekends' : /\bweekdays?\b/.test(lower) ? 'weekdays' : '');
      if (!day) return 'Which day can’t ' + p.fields.name + ' work? A weekday like “Saturdays” is enough.';
      // “this Saturday” is one date in the sample week; “Saturdays” is every week.
      var once = named && new RegExp('\\bthis ' + named + '\\b').test(lower);
      if (once) day = [0, 1, 2, 3, 4, 5, 6].map(function (i) { return rules.addDays(sampleMonday, i); }).filter(function (d) { return WEEKDAYS[new Date(d + 'T12:00:00').getDay()] === named; })[0];
      var part = /\bmornings?\b/.test(lower) ? 'morning' : /\bevenings?\b|\bnights?\b/.test(lower) ? 'evening' : /\bafternoons?\b/.test(lower) ? 'afternoon' : 'all day';
      return ctx.invoke('set_availability', { staff: p.fields.name, day: day, part: part }, p.fields.name + ': not ' + (once ? dayName(day) + ' ' + niceDate(day) : day) + (part === 'all day' ? '' : ', ' + part)).then(function () { return state(ctx); }).then(function (after) {
        var when = once ? 'on ' + dayName(day) + ', ' + niceDate(day) : (day === 'weekends' || day === 'weekdays' ? day : day.charAt(0).toUpperCase() + day.slice(1) + 's') + ' from now on';
        return offerSwap(after, p.id, 'Noted: ' + p.fields.name + ' can’t work ' + (part === 'all day' ? '' : part + 's ') + when + '.');
      });
    });
  }

  function swap(ctx) {
    if (!proposal) return Promise.resolve('There’s no swap waiting. Tell me who can’t work, or which shift to fill.');
    var p = proposal;
    proposal = null;
    return ctx.invoke('assign_shift', { id: p.shift, remove: p.out, staff: p.inId }, p.outName + ' → ' + p.inName).then(function () {
      return { reply: 'Swapped: ' + p.inName + ' takes ' + p.label + ' instead of ' + p.outName + '. It’s a proposal until you approve the week.', suggestions: LATER };
    });
  }

  function copy(ctx) {
    var target = rules.addDays(sampleMonday, 7);
    return ctx.invoke('copy_week', { week: target, fromWeek: sampleMonday }, 'Week of ' + niceDate(target)).then(function (output) {
      if (window.showRosterWeek) window.showRosterWeek(target);
      return state(ctx).then(function (s) {
        var view = rules.weekView(s, target, Date.now());
        var open = view.gaps.reduce(function (sum, g) { return sum + g.open; }, 0);
        var kept = view.shifts.reduce(function (sum, sh) { return sum + rules.staffOn(sh).length; }, 0);
        var lead = /no shifts to copy/.test(output.summary || '') ? 'There was nothing to copy.' : 'Copied ' + view.shifts.length + ' shifts into the week of ' + niceDate(target) + ', keeping ' + kept + ' assignments: everyone who still fits their availability and your rules.';
        return lead + '\n\n' + (open ? open + (open === 1 ? ' spot is' : ' spots are') + ' open there, mostly where a rule or someone’s availability says no. Say “fill the open shifts” and I’ll propose people.' : 'Every shift there is covered.') + ' The whole week is a draft until you approve it.';
      });
    });
  }

  function hours(ctx) {
    return ctx.invoke('roster_status', {}, 'Hours').then(function () { return state(ctx); }).then(function (s) {
      var view = rules.weekView(s, sampleMonday, Date.now());
      var list = s.staff.filter(function (p) { return p.status === 'active'; }).map(function (p) {
        var limit = rules.limitFor(p, s.rules || {}), used = view.hours[p.id] || 0;
        return { name: p.fields.name, used: Math.round(used * 10) / 10, limit: limit, room: limit === null ? 999 : limit - used };
      }).sort(function (a, b) { return a.room - b.room; });
      return 'Closest to their limit for ' + weekWord + ':\n' + list.slice(0, 4).map(function (x) {
        return '- **' + x.name + '**: ' + x.used + (x.limit !== null ? ' of ' + x.limit + ' hours' : ' hours') + (x.room <= 0 ? ', at the limit' : x.room < 999 ? ', ' + Math.round(x.room * 10) / 10 + ' left' : '');
      }).join('\n') + '\n\nThe limits are the ones you set; I don’t add any of my own.';
    });
  }

  function put(ctx, text) {
    return state(ctx).then(function (s) {
      var p = findPerson(s, text);
      var lower = text.toLowerCase();
      var day = (lower.match(/\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/) || [])[1];
      if (!p || !day) return 'Who, and which shift? Like “put Hana on Saturday’s close”.';
      var date = [0, 1, 2, 3, 4, 5, 6].map(function (i) { return rules.addDays(sampleMonday, i); }).filter(function (d) { return WEEKDAYS[new Date(d + 'T12:00:00').getDay()] === day; })[0];
      var kind = /kitchen/.test(lower) ? 'kitchen' : /\bclos/.test(lower) ? 'close' : 'open';
      var shift = s.shifts.filter(function (sh) {
        return sh.fields.date === date && (kind === 'kitchen' ? sh.fields.role === 'kitchen' : sh.fields.role !== 'kitchen' && (kind === 'close' ? sh.fields.start >= '13:00' : sh.fields.start < '10:00'));
      })[0];
      if (!shift) return 'I can’t find that shift on ' + dayName(date) + '.';
      // Check first, as assign_shift would, and explain rather than force it.
      var on = rules.staffOn(shift);
      if (on.indexOf(p.id) >= 0) return p.fields.name + ' is already on ' + shiftName(shift) + '.';
      if (on.length >= rules.neededOf(shift)) return shiftName(shift) + ' already has its ' + rules.neededOf(shift) + ': ' + on.map(function (id) { return nameOf(s, id); }).join(' and ') + '. Tell me who to take off and I’ll swap ' + p.fields.name + ' in.';
      var why = rules.problems(p, shift, s, { hours: true });
      if (why.length) {
        var free = rules.freeFor(shift, s);
        return 'I can’t put ' + p.fields.name + ' there: ' + why.join('; ') + '.' + (free.length ? ' ' + free.slice(0, 3).map(function (x) { return x.name; }).join(', ') + (free.length === 1 ? ' is' : ' are') + ' free for it.' : '');
      }
      return ctx.invoke('assign_shift', { id: shift.id, staff: p.fields.name }, p.fields.name + ' → ' + shiftName(shift)).then(function () {
        return 'Put ' + p.fields.name + ' on ' + shiftName(shift) + '. It passed availability, rest and hours, and it’s a proposal until you approve the week.';
      });
    });
  }

  return {
    name: 'Nina',
    role: 'Shift Scheduler',
    greeting: 'Hello, I’m Nina. I keep Harbor Street Café’s roster covered. Two spots are still open ' + weekWord + ': Thursday’s kitchen shift and one barista on Saturday’s close.',
    suggestions: [
      'Where are we short?',
      'Fill the open shifts',
      'Cleo can’t work Saturdays from now on',
      'Copy this roster into the following week',
      'Who’s closest to their hours limit?',
    ],
    respond: function (text, ctx) {
      var lower = text.toLowerCase();
      if (/\bapprov/.test(lower)) return 'Only you can approve the roster: press Approve this week above the grid. I propose, you decide.';
      if (/^(yes|yep|sure|ok|okay|do it|please)\b|\bswap them\b/.test(lower)) return swap(ctx);
      if (/\b(can['’]?t|cannot|can not|unavailable|isn['’]?t available|off on|is off)\b/.test(lower)) return unavailable(ctx, text);
      if (/\b(copy|following week|draft next week|next week from)\b/.test(lower)) return copy(ctx);
      if (/\b(fill|cover)\b/.test(lower)) return fill(ctx);
      if (/\b(put|schedule|assign|give)\b/.test(lower) && /\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/.test(lower)) return put(ctx, text);
      if (/\b(law|legal|required|allowed)\b/.test(lower)) return 'I follow only the rules you set here, and I can’t tell you what labor law requires. Your state or local labor office, or an employment lawyer, can.';
      if (/\b(hours?|limit|overtime|most)\b/.test(lower)) return hours(ctx);
      if (/\b(short|open|gaps?|uncovered|need|who.?s working|schedule)\b/.test(lower)) return short(ctx);
      return null;
    },
    reactions: {
      page_add_staff: function (input, output) { return String(output && output.summary || '').split(/ (?=This week|Next week|The week of)/)[0] || 'On the roster.'; },
      page_add_shift: function (input, output) { return String(output && output.summary || '').split(/ (?=This week|Next week|The week of)/)[0] || 'Added.'; },
      page_assign_shift: function (input, output) { return String(output && output.summary || '').split(/ (?=This week|Next week|The week of)/)[0] || 'Updated.'; },
      page_set_availability: function (input, output, ctx) {
        return state(ctx).then(function (s) {
          var p = s.staff.filter(function (x) { return x.id === input.staff || x.fields.name === input.staff; })[0];
          return p ? offerSwap(s, p.id, 'Noted: ' + p.fields.name + ' is unavailable then.') : 'Noted.';
        });
      },
      page_set_rules: function () { return 'Saved. I check every proposal against your rules, and only yours.'; },
      page_approve_week: function (input, output) { return String(output && output.summary || '').split(/ (?=This week|Next week|The week of)/)[0] + ' I’ll keep any changes coming back to you.'; },
    },
  };
})();

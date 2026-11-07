// The standalone demo's sample conversation. In Gezel, the recruiter's
// replies come from the model the person chooses; here they are scripted,
// and every change goes through the same tools the crew calls.
window.demoChat = (function () {
  'use strict';
  var DAY = 86400000;
  var WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  var PROTECTED_ASK = /\b(age|how old|too old|too young|young|pregnan\w*|religio\w*|church|married|marital|kids|children|family plans|accent|where (?:is|was|are) (?:she|he|they) from|nationality|disab\w*|race|gender|sex)\b/i;

  function pad(n) { return n < 10 ? '0' + n : String(n); }
  function iso(ms) { var d = new Date(ms); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function daysLeft(day) { return Math.round((Date.parse(String(day).slice(0, 10) + 'T00:00:00') - Date.parse(iso(Date.now()) + 'T00:00:00')) / DAY); }
  function niceDate(day) { return new Date(String(day).slice(0, 10) + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }); }
  function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }
  function list(items) { return items.length < 2 ? items.join('') : items.slice(0, -1).join(', ') + ' and ' + items[items.length - 1]; }

  function state(ctx) {
    return Promise.all([ctx.read('roles.json'), ctx.read('candidates.json'), ctx.read('feedback.json')]).then(function (v) {
      return { roles: (v[0] && v[0].records) || [], cands: (v[1] && v[1].records) || [], events: (v[2] && v[2].events) || [] };
    });
  }
  function active(s) { return s.cands.filter(function (c) { return c.status !== 'hired' && c.status !== 'closed'; }); }
  function cardsFor(s, c) { return s.events.filter(function (e) { return e.kind === 'scorecard' && e.data && e.data.candidateId === c.id; }); }
  function roleOf(s, c) { return s.roles.find(function (r) { return r.id === c.fields.roleId; }); }
  // The candidate the person means: a full or first name that appears in what they wrote.
  function findCandidate(s, text) {
    var lower = text.toLowerCase();
    var pool = active(s).concat(s.cands.filter(function (c) { return c.status === 'hired' || c.status === 'closed'; }));
    return pool.find(function (c) { return lower.indexOf(c.fields.name.toLowerCase()) >= 0; }) ||
      pool.find(function (c) { return new RegExp('\\b' + c.fields.name.split(' ')[0].toLowerCase() + '\\b').test(lower); }) || null;
  }
  function findRole(s, text) {
    var lower = text.toLowerCase();
    var live = s.roles.filter(function (r) { return r.status === 'open' || r.status === 'paused'; });
    return live.find(function (r) { return lower.indexOf(r.fields.title.toLowerCase()) >= 0; }) || live[0] || null;
  }
  function avg(s, c, req) {
    var vals = cardsFor(s, c).map(function (e) { return e.data.ratings && e.data.ratings[req]; }).filter(function (v) { return typeof v === 'number'; });
    return vals.length ? Math.round((vals.reduce(function (a, b) { return a + b; }, 0) / vals.length) * 10) / 10 : null;
  }
  function she(c) { return c.fields.name.split(' ')[0]; }

  function interviews(ctx) {
    return ctx.invoke('hiring_status', { withinDays: 7 }, 'Next 7 days').then(function () { return state(ctx); }).then(function (s) {
      var soon = active(s).filter(function (c) { return c.status === 'interview' && c.fields.interviewAt && daysLeft(c.fields.interviewAt) >= 0 && daysLeft(c.fields.interviewAt) <= 7; })
        .sort(function (a, b) { return a.fields.interviewAt.localeCompare(b.fields.interviewAt); });
      var waiting = active(s).filter(function (c) { return c.status === 'interview' && c.fields.interviewAt && daysLeft(c.fields.interviewAt) < 0 && !cardsFor(s, c).length; });
      var lines = soon.map(function (c) {
        return '- **' + c.fields.name + '** (' + roleOf(s, c).fields.title + ') ' + niceDate(c.fields.interviewAt) + (c.fields.interviewTime ? ' at ' + c.fields.interviewTime : '') + (c.fields.interviewer ? ' with ' + c.fields.interviewer : ', interviewer still to pick');
      });
      return (soon.length ? 'Interviews in the next 7 days:\n' + lines.join('\n') : 'Nothing is booked in the next 7 days.') +
        (waiting.length ? '\n\n' + list(waiting.map(function (c) { return c.fields.name; })) + (waiting.length === 1 ? ' was' : ' were') + ' interviewed already and still need' + (waiting.length === 1 ? 's' : '') + ' a scorecard. Tell me how it went and I’ll record it.' : '');
    });
  }

  function moved(ctx, text) {
    return state(ctx).then(function (s) {
      var c = findCandidate(s, text);
      if (!c) return 'Who should I move? Give me their name, like “move Ana to interview”.';
      var lower = text.toLowerCase();
      var status = /\binterview/.test(lower) || /\bbook\b/.test(lower) ? 'interview' : /\boffer\b/.test(lower) ? 'offer' : /\bhired?\b/.test(lower) ? 'hired' : /\b(reject|close|not moving|decline|pass on)\w*/.test(lower) ? 'closed' : /\bscreen/.test(lower) ? 'screen' : '';
      if (!status) return 'Which stage should ' + she(c) + ' move to: screen, interview, offer, hired or closed?';
      var day = (lower.match(new RegExp('\\b(' + WEEKDAYS.join('|') + '|tomorrow)\\b')) || [])[1];
      var time = (text.match(/\b(\d{1,2}(?::\d{2})?\s*(?:am|pm))\b/i) || [])[1];
      var who = (text.match(/\bwith ([A-Z][a-z]+)/) || [])[1];
      var input = { candidate: c.id, status: status };
      if (day) input.interviewOn = day;
      if (time) input.interviewTime = time;
      if (who) input.interviewer = who;
      return ctx.invoke('move_candidate', input, c.fields.name + ' → ' + status + (day ? ', ' + cap(day) : '')).then(function () { return state(ctx); }).then(function (after) {
        var now = after.cands.find(function (x) { return x.id === c.id; });
        var role = roleOf(after, now);
        if (status === 'interview') {
          return 'Moved **' + now.fields.name + '** to interview' + (now.fields.interviewAt ? ' and booked ' + niceDate(now.fields.interviewAt) + (now.fields.interviewTime ? ' at ' + now.fields.interviewTime : '') : '') + '. ' +
            (now.fields.interviewer ? '' : 'Who will interview ' + she(now) + '? ' + (role.fields.manager ? role.fields.manager + ' ran the last ' + role.fields.title.toLowerCase() + ' interviews. ' : '')) +
            'The kit rates the same ' + (role.fields.requirements || []).length + ' requirements as everyone else’s, so the scorecards will line up.';
        }
        if (status === 'offer') return 'Moved **' + now.fields.name + '** to offer. I can draft the offer letter for you to review; you send it and set the terms.';
        if (status === 'hired') return 'Marked **' + now.fields.name + '** hired. ' + (role.status === 'filled' ? role.fields.title + ' is now filled. ' : '') + 'New Hire Onboarding can take it from here.';
        if (status === 'closed') return 'Closed **' + now.fields.name + '** out of ' + role.fields.title + '. A short, kind note to let them know is worth sending this week.';
        return 'Moved **' + now.fields.name + '** to ' + status + '.';
      });
    });
  }

  function feedback(ctx, text) {
    return state(ctx).then(function (s) {
      var c = findCandidate(s, text);
      if (!c) return 'Whose interview was it? Tell me their name and a rating for each requirement, like “Theo: coffee 3, customer service 4”.';
      var role = roleOf(s, c);
      var ratings = text.indexOf(':') >= 0 ? text.slice(text.indexOf(':') + 1) : text;
      var by = (text.match(/\b(?:from|by) ([A-Z][a-z]+)/) || [])[1] || (c.fields.interviewer && c.fields.interviewer.split(' ')[0]) || role.fields.manager || 'an interviewer';
      var note = /went well/i.test(text) ? 'Went well, as reported in chat.' : /rough|didn.t go/i.test(text) ? 'Did not go well, as reported in chat.' : 'Reported in chat.';
      return ctx.invoke('log_feedback', { candidate: c.id, by: by, ratings: ratings.trim(), note: note }, 'Scorecard: ' + c.fields.name).then(function () { return state(ctx); }).then(function (after) {
        var reqs = role.fields.requirements || [];
        var scored = reqs.filter(function (q) { return avg(after, c, q) !== null; });
        var others = active(after).filter(function (x) { return x.id !== c.id && x.fields.roleId === role.id && cardsFor(after, x).length; });
        return 'Recorded ' + by + '’s scorecard for **' + c.fields.name + '**: ' + scored.map(function (q) { return q + ' ' + avg(after, c, q); }).join(', ') + '. ' +
          (scored.length < reqs.length ? 'Still unrated: ' + list(reqs.filter(function (q) { return scored.indexOf(q) < 0; })) + '. ' : '') +
          (others.length ? 'Those now sit beside ' + list(others.map(she)) + '’s in Scorecards; ask me to compare the finalists when you’re ready.' : '');
      });
    });
  }

  function compare(ctx, text) {
    return ctx.invoke('hiring_status', {}, 'Desk picture').then(function () { return state(ctx); }).then(function (s) {
      var role = findRole(s, text);
      if (!role) return 'There are no open roles to compare.';
      var finalists = active(s).filter(function (c) { return c.fields.roleId === role.id && (c.status === 'interview' || c.status === 'offer') && cardsFor(s, c).length; });
      var pending = active(s).filter(function (c) { return c.fields.roleId === role.id && c.status === 'interview' && !cardsFor(s, c).length; });
      if (!finalists.length) return 'No ' + role.fields.title.toLowerCase() + ' candidate has a scorecard yet. Once interviewers rate them, I’ll lay the evidence side by side.';
      var reqs = role.fields.requirements || [];
      var rows = finalists.map(function (c) {
        var last = cardsFor(s, c).filter(function (e) { return e.note && !/reported in chat/i.test(e.note); }).pop();
        return '- **' + c.fields.name + '** (' + cardsFor(s, c).length + ' scorecard' + (cardsFor(s, c).length === 1 ? '' : 's') + '): ' +
          reqs.map(function (q) { var a = avg(s, c, q); return q + ' ' + (a === null ? 'not rated' : a); }).join(', ') + (last ? '. “' + last.note + '”' : '');
      });
      return 'Here is the ' + role.fields.title.toLowerCase() + ' evidence side by side, on the role’s ' + reqs.length + ' requirements (1 to 4, averaged across interviewers):\n' + rows.join('\n') +
        (pending.length ? '\n\n' + list(pending.map(function (c) { return c.fields.name; })) + ' still ' + (pending.length === 1 ? 'has' : 'have') + ' an interview to go, so the picture may change.' : '') +
        '\n\nThe decision is yours. Tell me who moves to offer and I’ll update the desk and draft the letter for you to review.';
    });
  }

  function kit(ctx, text) {
    return ctx.invoke('hiring_status', {}, 'Role requirements').then(function () { return state(ctx); }).then(function (s) {
      var role = findRole(s, text);
      if (!role) return 'Which role is the kit for? Open it with its requirements first.';
      var reqs = role.fields.requirements || [];
      if (!reqs.length) return role.fields.title + ' has no requirements yet. Tell me what the job needs and I’ll build the kit on that.';
      var bank = [
        [/coffee|milk|espresso/i, 'Walk me through steaming milk for a cappuccino and then a flat white. What changes?'],
        [/customer|service|guest/i, 'Tell me about a time a customer was unhappy with their order. What did you do?'],
        [/reliab|team/i, 'Tell me about a time you covered a shift or stayed to help a teammate close. What happened?'],
        [/weekend|availab|schedule|shift/i, 'Our busiest shifts are Saturday and Sunday mornings. Which of those can you commit to?'],
        [/knife|prep/i, 'Show me how you would dice an onion for the line, and talk me through keeping your station safe.'],
        [/food safety|handler|hygiene/i, 'What do you check before you start a shift, and what makes you throw something out?'],
        [/speed|rush|pace/i, 'Tell me about your busiest service. How did you keep up when tickets stacked?'],
      ];
      var lines = reqs.map(function (q) {
        var hit = bank.find(function (b) { return b[0].test(q); });
        return '- **' + q + '**: “' + (hit ? hit[1] : 'Tell me about a time you used ' + q.toLowerCase() + ' at work. What did you do yourself?') + '”';
      });
      return 'Here is the outline of the ' + role.fields.title.toLowerCase() + ' kit, one question per requirement:\n' + lines.join('\n') +
        '\n\nScorecard: each requirement rated 1 (no evidence) to 4 (strong, specific example), with what they said. No overall score.\n\nLeave out anything about age, family plans, religion, health or where someone is from; ask whether they can work the shifts instead.' +
        '\n\nIn Gezel I would run the Structured Interview Kit plan next: it writes the job description and the full kit, with follow-ups and what each score looks like, to the artifacts drawer.';
    });
  }

  function addRole(ctx, text) {
    var title = (text.match(/\b(?:open|add|new)\s+(?:a|an|the)?\s*([a-z][a-z -]*?)\s+(?:role|position|job)\b/i) || [])[1];
    if (!title) return Promise.resolve('Which role should I open? Tell me the title and what the job needs, like “open a dishwasher role: one opening, needs reliability and pace”.');
    title = cap(title.trim());
    var words = { one: 1, two: 2, three: 3, four: 4, five: 5 };
    var count = (text.match(/\b(one|two|three|four|five|\d+)\s+openings?\b/i) || [])[1];
    var openings = count ? words[count.toLowerCase()] || Number(count) : 1;
    var needs = (text.match(/\bneeds?\s+(.+)$/i) || [])[1] || '';
    var reqs = needs.replace(/[.]+$/, '').split(/\s*,\s*|\s+and\s+/).map(function (q) { return q.trim(); }).filter(Boolean).map(cap);
    return ctx.invoke('add_role', { title: title, requirements: reqs.join(', '), openings: openings }, 'Open ' + title).then(function () {
      return 'Opened **' + title + '** with ' + openings + (openings === 1 ? ' opening' : ' openings') + (reqs.length ? ' and ' + reqs.length + ' requirements to rate: ' + list(reqs) + '.' : '. What does the job need? Those become the requirements every interviewer rates.') +
        ' Who is the hiring manager? I can draft the interview kit next.';
    });
  }

  function addCandidate(ctx, text) {
    return state(ctx).then(function (s) {
      var name = (text.match(/\b[Aa]dd\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)/) || [])[1];
      if (!name) return 'Who should I add? Give me their full name and the role, like “add Jordan Lee for line cook, a referral from Luis”.';
      var role = findRole(s, text);
      if (!role) return 'Which role are they for? Open it first and I’ll start the pipeline.';
      var source = /referr/i.test(text) ? 'Referral' : /walk/i.test(text) ? 'Walk-in' : /board|indeed|posting/i.test(text) ? 'Job board' : /instagram|social/i.test(text) ? 'Social media' : 'Other';
      return ctx.invoke('add_candidate', { name: name, role: role.id, source: source }, name + ' → ' + role.fields.title).then(function () {
        return 'Added **' + name + '** to ' + role.fields.title + ' at sourced (' + source.toLowerCase() + '). Want me to move them to screen?';
      });
    });
  }

  function standing(ctx, text) {
    return ctx.invoke('hiring_status', {}, 'Desk picture').then(function () { return state(ctx); }).then(function (s) {
      var role = findRole(s, text);
      if (!role) return 'There are no open roles right now.';
      var mine = s.cands.filter(function (c) { return c.fields.roleId === role.id; });
      var at = function (st) { return mine.filter(function (c) { return c.status === st; }); };
      var hired = at('hired').length;
      return '**' + role.fields.title + '**: ' + hired + ' of ' + (role.fields.openings || 1) + ' hired. ' +
        ['sourced', 'screen', 'interview', 'offer'].map(function (st) { var p = at(st); return cap(st) + ': ' + (p.length ? list(p.map(function (c) { return c.fields.name; })) : 'nobody'); }).join('. ') + '.' +
        (at('screen').length ? '\n\nNext step: a quick screen call with ' + list(at('screen').map(she)) + '.' : '');
    });
  }

  return {
    name: 'Sem',
    role: 'Recruiter',
    greeting: 'Hello, I’m Sem. I keep Harbor Street Café’s hiring desk moving. Two interviews are booked in the next few days, and Theo Brandt’s barista interview is still waiting on a scorecard.',
    suggestions: [
      'Move Ana to interview; book Thursday',
      'Draft the interview kit for the Barista role',
      'Theo’s interview went well: coffee 3, customer service 4, reliability 4, weekends 4',
      'Compare the barista finalists',
      'Open a dishwasher role: one opening, needs reliability, pace and weekend availability',
    ],
    respond: function (text, ctx) {
      var lower = text.toLowerCase();
      if (PROTECTED_ASK.test(lower) && !/\b(role|kit)\b/.test(lower)) {
        return 'I can’t rate, screen or note anyone on that. The desk only records evidence about the job: skills, experience, availability and how someone works. If it matters for the schedule, ask every candidate the same question, like “can you work Saturday mornings?”';
      }
      if (/\b(open|new)\b.*\b(role|position|job)\b/.test(lower) && !/\b(kit|questions)\b/.test(lower)) return addRole(ctx, text);
      if (/\b(kit|interview questions|job description|what should (?:we|i) ask)\b/.test(lower)) return kit(ctx, text);
      if (/\b(compare|finalists|who should|should we hire|best candidate|side by side|decide)\b/.test(lower)) return compare(ctx, text);
      if (/\d/.test(text) && /\b(went|rated?|scores?|scorecard|feedback|gave)\b/.test(lower)) return feedback(ctx, text);
      if (/\b(move|book|schedule|offer|hired?|reject|close|advance|screen)\b/.test(lower) && /\b[a-z]+\b/.test(lower)) return state(ctx).then(function (s) { return findCandidate(s, text) ? moved(ctx, text) : interviews(ctx); });
      if (/\badd\b/.test(lower)) return addCandidate(ctx, text);
      if (/\b(interview|interviewing|this week|calendar|booked)\b/.test(lower)) return interviews(ctx);
      if (/\b(where|stand|pipeline|status|how many|search)\b/.test(lower)) return standing(ctx, text);
      return null;
    },
    reactions: {
      page_move_candidate: function (input, output) {
        return output && output.summary ? output.summary.split(/\.\s/)[0] + '. I’ll keep the next step on the desk.' : 'Moved.';
      },
      page_add_role: function (input) {
        return 'Opened ' + input.title + '. Its requirements are what every interviewer will rate; I can draft the interview kit when you’re ready.';
      },
      page_add_candidate: function (input) {
        return 'Added ' + input.name + ' to the pipeline. Tell me when they’re ready for a screen.';
      },
      page_log_feedback: function () {
        return 'Scorecard saved. It sits beside the others under Scorecards, rated on the same requirements.';
      },
    },
  };
})();

// The standalone demo's sample conversation. In Gezel, the career coach's
// replies come from the model the person chooses; here they are scripted, and
// every change goes through the same tools the real crew member calls.
window.demoChat = (function () {
  'use strict';
  var DAY = 86400000;
  var STAGES = ['applied', 'screening', 'interview', 'offer', 'closed'];
  var STAGE_WORD = { applied: 'Applied', screening: 'Screening', interview: 'Interview', offer: 'Offer', closed: 'Closed' };
  var IN_STAGE = { applied: 'applied', screening: 'in screening', interview: 'interviewing', offer: 'at offer' };

  function plural(n, one, many) { return n + ' ' + (n === 1 ? one : many); }
  function list(items) {
    if (items.length < 2) return items.join('');
    return items.slice(0, -1).join(', ') + (items.length > 2 ? ',' : '') + ' and ' + items[items.length - 1];
  }
  function shortDay(ms) { return new Date(ms).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }); }
  function daysSince(iso) { return Math.max(0, Math.floor((Date.now() - Date.parse(iso)) / DAY)); }
  function company(r) { return String((r.fields && r.fields.company) || r.id); }
  function state(ctx) {
    return Promise.all([ctx.read('pipeline.json'), ctx.read('activity.json')]).then(function (v) {
      var pipeline = v[0] || {}, activity = v[1] || {};
      var s = { role: pipeline.role || '', records: pipeline.records || [], events: activity.events || [] };
      s.inPlay = s.records.filter(function (r) { return r.status !== 'closed'; });
      s.stale = s.inPlay.filter(function (r) { return daysSince(r.updatedAt) > 7; });
      s.followUps = s.events.filter(function (e) {
        return e.kind === 'follow-up' && e.data && e.data.dueAt && Date.parse(e.data.dueAt) <= Date.now() + 7 * DAY;
      }).sort(function (a, b) { return Date.parse(a.data.dueAt) - Date.parse(b.data.dueAt); });
      return s;
    });
  }
  // The company a message is about: the longest company name it mentions.
  function findApp(records, text) {
    var lower = text.toLowerCase();
    return records.filter(function (r) { return lower.indexOf(company(r).toLowerCase()) >= 0; })
      .sort(function (a, b) { return company(b).length - company(a).length || (a.status === 'closed') - (b.status === 'closed'); })[0] || null;
  }
  function newest(records, name) {
    return records.filter(function (r) { return company(r).toLowerCase() === name.toLowerCase(); })
      .sort(function (a, b) { return Date.parse(b.updatedAt) - Date.parse(a.updatedAt); })[0] || null;
  }
  function checkIn(ctx, app) {
    var due = Date.now() + 7 * DAY;
    return ctx.invoke('log_activity', {
      id: app.id, kind: 'follow-up', note: 'Check in with ' + company(app) + ' if there’s no reply', due: new Date(due).toISOString(),
    }, 'Check-in on ' + shortDay(due)).then(function () { return due; });
  }

  function apply(ctx, name, role) {
    name = name.replace(/[.!?]+$/, '').trim();
    return state(ctx).then(function (s) {
      var open = s.inPlay.find(function (r) { return company(r).toLowerCase() === name.toLowerCase(); });
      if (open) return company(open) + ' is already on the board, in ' + STAGE_WORD[open.status] + '. Want me to move it along instead?';
      var title = role || s.role;
      var input = { company: name };
      if (title) input.role = title;
      return ctx.invoke('record_application', input, name + (title ? ' · ' + title : '')).then(function () { return state(ctx); }).then(function (after) {
        var app = newest(after.records, name);
        return checkIn(ctx, app).then(function (due) {
          return 'Tracked: **' + name + '**' + (title ? ', ' + title + ',' : '') + ' in Applied. I put a check-in on This week for **' + shortDay(due) +
            '**, so it can’t go quiet without us noticing. If this one is serious, a tailored resume variant and a short company brief are worth the hour.';
        });
      });
    });
  }

  function advance(ctx, text, stage, outcome) {
    return state(ctx).then(function (s) {
      var app = findApp(s.records, text);
      if (!app) return 'Which company is that? I don’t see it on the board yet. Tell me where you applied and I’ll track it first.';
      if (app.status === 'closed' && stage !== 'closed') return company(app) + ' is closed' + (app.fields.outcome ? ' (' + app.fields.outcome + ')' : '') + '. If it’s back on, add it again and I’ll track it fresh.';
      if (app.status === stage && !outcome) return company(app) + ' is already at ' + STAGE_WORD[stage] + '.';
      if (app.status === 'closed') return company(app) + ' is already closed.';
      var was = app.status, input = { id: app.id, stage: stage };
      if (outcome) input.outcome = outcome;
      var started = app.history && app.history[0] ? app.history[0].at : app.updatedAt;
      return ctx.invoke('advance_stage', input, company(app) + ': ' + STAGE_WORD[stage] + (outcome ? ' (' + outcome + ')' : '')).then(function () { return state(ctx); }).then(function (after) {
        var still = after.inPlay.map(company);
        var others = after.records.filter(function (r) { return r.status === 'offer' && r.id !== app.id; }).map(company);
        if (stage === 'interview') {
          return '**' + company(app) + '** moved to Interview' + (s.stale.indexOf(app) >= 0 || daysSince(app.updatedAt) > 7 ? ', and it’s off the quiet list' : '') +
            '. Before the real one, a practice round with the mock interviewer on your crew is worth an hour, and I’d put together a short ' + company(app) + ' brief to prep from.';
        }
        if (stage === 'screening') return '**' + company(app) + '** moved to Screening. A recruiter screen is mostly fit and logistics: have your range and your two strongest project stories ready.';
        if (stage === 'offer') {
          return 'An offer from **' + company(app) + '**. Congratulations, properly. Get it in writing with a decision date' +
            (others.length ? ', then we’ll weigh it side by side with ' + list(others) + '.' : '.');
        }
        if (outcome === 'signed') return 'Signed with **' + company(app) + '**. You ran a campaign and won it. Celebrate first; then we close the rest of the board kindly.';
        if (outcome === 'withdrawn') return 'Closed ' + company(app) + ' as withdrawn. ' + (still.length ? plural(still.length, 'application stays', 'applications stay') + ' in play.' : '');
        var days = daysSince(started);
        return 'Logged and closed. Rejection is data, not a verdict: it took ' + plural(days, 'day', 'days') + ', and ' +
          (was === 'applied' ? 'it ended before a screen, so the question is whether the portfolio led with what the posting asked for.' : 'it got to ' + was + ', so a short, gracious note asking for feedback often gets an answer.') +
          (still.length ? ' Still in play: ' + list(still) + '.' : '');
      });
    });
  }

  function standing(ctx) {
    return ctx.invoke('pipeline_status', {}, 'Stages, quiet ones and follow-ups').then(function () { return state(ctx); }).then(function (s) {
      if (!s.records.length) return 'Nothing is tracked yet. Tell me about the first application and we’ll build from there.';
      var counts = STAGES.filter(function (st) { return st !== 'closed'; }).map(function (st) {
        var n = s.records.filter(function (r) { return r.status === st; }).length;
        return n ? n + ' ' + IN_STAGE[st] : '';
      }).filter(Boolean);
      var offers = s.records.filter(function (r) { return r.status === 'offer'; });
      var interviews = s.records.filter(function (r) { return r.status === 'interview'; });
      var actions = [];
      offers.forEach(function (r) { actions.push('Get ' + company(r) + '’s offer in writing with a decision date, so it can be weighed properly.'); });
      s.followUps.forEach(function (e) {
        var due = Date.parse(e.data.dueAt);
        // A check-in on an application that has moved since it was set is already answered.
        var app = s.records.find(function (r) { return r.id === e.data.applicationId; });
        if (app && (app.status === 'closed' || (app.history || []).some(function (h) { return Date.parse(h.at) > Date.parse(e.at); }))) return;
        actions.push((due < Date.now() ? 'Overdue: ' : '') + e.note.replace(/[.]+$/, '') + ' by ' + shortDay(due) + '.');
      });
      s.stale.forEach(function (r) { actions.push('Chase ' + company(r) + ': ' + daysSince(r.updatedAt) + ' days quiet. Two friendly lines are enough.'); });
      interviews.forEach(function (r) { actions.push('Book a mock round before the ' + company(r) + ' interview.'); });
      actions.push('Apply to two more roles this week; a pipeline stays healthy when the top keeps filling.');
      return [
        '**' + plural(s.inPlay.length, 'application', 'applications') + ' in play**' + (counts.length ? ': ' + list(counts) + '.' : '.') +
          (offers.length ? ' ' + list(offers.map(company)) + (offers.length === 1 ? ' has' : ' have') + ' made an offer.' : ''),
        'The next three actions:\n\n' + actions.slice(0, 3).map(function (a) { return '- ' + a; }).join('\n'),
      ];
    });
  }

  return {
    name: 'Sanne',
    role: 'Career Coach',
    greeting: 'Hi, I’m Sanne. Four applications are in play, and Juniper Press has made an offer. Northwind has gone quiet for nine days; that’s the one to chase.',
    suggestions: [
      'I just applied to Harbor & Co',
      'Northwind invited me to interview',
      'Where does the search stand?',
      'Canal Labs turned me down',
    ],
    respond: function (text, ctx) {
      var lower = text.toLowerCase().replace(/’/g, '\'');
      var applied = text.match(/\bappl(?:y|ied)\s+(?:to|at|with)\s+(.+?)(?:\s+(?:for|as)\s+(?:a\s+|an\s+|the\s+)?(.+?))?[.!?]*$/i);
      if (applied) return apply(ctx, applied[1], applied[2] && applied[2].replace(/\s+(role|position|job|opening)$/i, '').replace(/\b\w/g, function (c) { return c.toUpperCase(); }));
      if (/\b(turned me down|rejected|said no|passed on me|not moving forward|declined me|no longer considering)\b/.test(lower)) return advance(ctx, text, 'closed', 'rejected');
      if (/\bwithdr(aw|ew)\b|\bpulled out\b/.test(lower)) return advance(ctx, text, 'closed', 'withdrawn');
      if (/\b(accepted|signed)\b/.test(lower)) return advance(ctx, text, 'closed', 'signed');
      if (/\boffer\b/.test(lower) && /\b(made|sent|got|received|extended|gave)\b/.test(lower)) return advance(ctx, text, 'offer');
      if (/\b(interview|onsite|final round|panel)\b/.test(lower) && /\b(invited|booked|scheduled|got|have|landed|asked)\b/.test(lower)) return advance(ctx, text, 'interview');
      if (/\b(screen|screening|recruiter call|phone call|intro call)\b/.test(lower)) return advance(ctx, text, 'screening');
      if (/\b(stand|status|pipeline|where am i|what's next|this week|chase|quiet|stale|follow[- ]?ups?|next steps?|priorit)\b/.test(lower)) return standing(ctx);
      return null;
    },
    reactions: {
      page_record_application: function (input, output, ctx) {
        return state(ctx).then(function (s) {
          var app = input.company ? newest(s.records, String(input.company)) : null;
          if (!app) return null;
          return checkIn(ctx, app).then(function (due) {
            return 'Tracked. I put a check-in for ' + shortDay(due) + ' on This week, so ' + company(app) + ' can’t go quiet without us noticing.';
          });
        });
      },
      page_advance_stage: function (input, output, ctx) {
        return state(ctx).then(function (s) {
          var app = s.records.find(function (r) { return r.id === input.id; });
          var name = app ? company(app) : 'It';
          if (input.stage === 'interview') return name + ' is at Interview. A practice round with the mock interviewer first is worth it.';
          if (input.stage === 'offer') return 'An offer from ' + name + '. Congratulations! Get it in writing with a decision date.';
          if (input.stage === 'closed') {
            return input.outcome === 'signed' ? 'Signed. That’s the campaign won; celebrate it properly.'
              : input.outcome === 'rejected' ? 'Logged. Rejection is data, not a verdict, and the cadence keeps going.'
              : 'Closed ' + name + '.';
          }
          return 'Moved ' + name + ' to ' + STAGE_WORD[input.stage] + '.';
        });
      },
    },
  };
})();

// The standalone demo's sample conversation. In Gezel, the planner's replies
// come from the model the person chooses; here they are scripted, and every
// change goes through the same tools the crew calls.
window.demoChat = (function () {
  'use strict';
  var DAY = 86400000;
  var NUMBERS = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, ten: 10 };

  function pad(n) { return n < 10 ? '0' + n : String(n); }
  function iso(ms) { var d = new Date(ms); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function daysLeft(day) { return Math.round((Date.parse(String(day).slice(0, 10) + 'T00:00:00') - Date.parse(iso(Date.now()) + 'T00:00:00')) / DAY); }
  function niceDate(day) { return new Date(String(day).slice(0, 10) + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }); }
  function plain(text) { return String(text || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase(); }
  function waited(m) { return m.fields.sentAt ? Math.max(0, -daysLeft(m.fields.sentAt)) : 0; }
  function days(n) { return n + (n === 1 ? ' day' : ' days'); }

  function state(ctx) {
    return Promise.all([ctx.read('projects.json'), ctx.read('milestones.json')]).then(function (v) {
      var projects = (v[0] && v[0].records) || [];
      var byId = {};
      projects.forEach(function (p) { byId[p.id] = p; });
      return { projects: projects, milestones: (v[1] && v[1].records) || [], byId: byId };
    });
  }
  function open(s) {
    return s.milestones.filter(function (m) { var p = s.byId[m.fields.projectId]; return p && p.status === 'active' && m.status !== 'approved'; });
  }
  // The milestone the person means: the one whose title and project share the most words with what they wrote.
  function find(s, text, filter) {
    var words = (plain(text).match(/[a-z]{4,}/g) || []).filter(function (w) { return ['approved', 'push', 'back', 'week', 'sent', 'with', 'from', 'that', 'this', 'them', 'proofs'].indexOf(w) < 0; });
    var best = null, score = 0;
    s.milestones.filter(filter || function () { return true; }).forEach(function (m) {
      var p = s.byId[m.fields.projectId];
      var title = plain(m.fields.title), about = plain(p ? p.fields.title + ' ' + p.fields.client + ' ' + (p.fields.contact || '') : '');
      var hits = words.reduce(function (n, w) { return n + (title.indexOf(w.replace(/s$/, '')) >= 0 ? 2 : about.indexOf(w) >= 0 ? 1 : 0); }, 0);
      if (hits > score) { best = m; score = hits; }
    });
    return best;
  }
  function project(s, text) {
    var lower = plain(text);
    return s.projects.filter(function (p) { return p.status === 'active'; }).find(function (p) {
      return plain(p.fields.client).split(/\s+/).some(function (w) { return w.length > 3 && lower.indexOf(w) >= 0; });
    });
  }

  function waitingReport(ctx) {
    return ctx.invoke('delivery_status', {}, 'Waiting on clients').then(function () { return state(ctx); }).then(function (s) {
      var list = open(s).filter(function (m) { return m.status === 'waiting'; }).sort(function (a, b) { return waited(b) - waited(a); });
      if (!list.length) return 'Nothing is out with a client right now.';
      var first = list[0], p = s.byId[first.fields.projectId];
      return (list.length === 1 ? 'One approval is' : list.length + ' approvals are') + ' out with clients, longest first:\n' + list.map(function (m) {
        var proj = s.byId[m.fields.projectId];
        return '- **' + m.fields.title + '** (' + proj.fields.client + '): with ' + (m.fields.approver || proj.fields.contact) + ' for ' + days(waited(m)) + ', round ' + (m.fields.rounds || 1) + (m.fields.dueAt ? ', due ' + niceDate(m.fields.dueAt) : '');
      }).join('\n') + '\n\n' + (waited(first) >= 5 ? first.fields.title + ' has waited ' + days(waited(first)) + '. Want me to draft a friendly nudge to ' + (first.fields.approver || p.fields.contact) + '?' : 'Nothing has waited long enough to chase yet.');
    });
  }

  function approve(ctx, text) {
    return state(ctx).then(function (s) {
      var m = find(s, text, function (x) { return x.status !== 'approved'; });
      if (!m) return 'Which milestone was approved? Name it, like “Juniper approved the homepage design”.';
      return ctx.invoke('set_milestone_status', { id: m.id, status: 'approved' }, m.fields.title + ': approved').then(function () { return state(ctx); }).then(function (after) {
        var p = after.byId[m.fields.projectId];
        var next = after.milestones.filter(function (x) { return x.fields.projectId === p.id && x.status !== 'approved'; }).sort(function (a, b) { return String(a.fields.dueAt).localeCompare(String(b.fields.dueAt)); })[0];
        return 'Recorded: **' + m.fields.title + '** is approved' + (m.fields.rounds > 1 ? ' after ' + m.fields.rounds + ' rounds' : ' in round ' + (m.fields.rounds || 1)) + '. ' +
          (next ? 'Next on ' + p.fields.title + ': ' + next.fields.title + ' (' + (next.status === 'in-progress' ? 'in progress' : next.status) + ', due ' + niceDate(next.fields.dueAt) + (next.fields.owner ? ', ' + next.fields.owner : '') + ').' : 'Every milestone on ' + p.fields.title + ' is approved.');
      });
    });
  }

  function slip(ctx, text) {
    var lower = plain(text);
    var m = lower.match(/\b(a|an|one|two|three|four|five|six|ten|\d+)\s+(day|days|week|weeks)\b/);
    var count = m ? (NUMBERS[m[1]] || Number(m[1]) || 1) * (/week/.test(m[2]) ? 7 : 1) : 7;
    var direction = /\b(pull|bring|earlier|forward|sooner)\b/.test(lower) ? -1 : 1;
    return state(ctx).then(function (s) {
      var ms = find(s, text, function (x) { return x.status !== 'approved'; });
      if (!ms) return 'Which milestone should move? Name it, like “push the wrap concepts back a week”.';
      var before = ms.fields.dueAt;
      return ctx.invoke('add_milestone', { id: ms.id, shiftDays: direction * count }, ms.fields.title + ': ' + (direction > 0 ? '+' : '-') + days(count)).then(function () { return state(ctx); }).then(function (after) {
        var now = after.milestones.find(function (x) { return x.id === ms.id; });
        var p = after.byId[now.fields.projectId];
        var lateNow = daysLeft(now.fields.dueAt) < 0;
        return 'Moved **' + now.fields.title + '** from ' + niceDate(before) + ' to ' + niceDate(now.fields.dueAt) + '. ' +
          (daysLeft(before) < 0 && !lateNow ? 'It’s no longer late, so ' + p.fields.title + ' is back on track. ' : '') +
          'Worth telling ' + (p.fields.contact || p.fields.client) + ' in this week’s status; the project is still due ' + niceDate(p.fields.dueAt) + '.';
      });
    });
  }

  function sent(ctx, text) {
    return state(ctx).then(function (s) {
      var m = find(s, text, function (x) { return x.status !== 'approved' && x.status !== 'waiting'; });
      if (!m) return 'Which milestone went to the client? Name it, like “sent the window signage to Dana”.';
      return ctx.invoke('set_milestone_status', { id: m.id, status: 'waiting' }, m.fields.title + ': with the client').then(function () { return state(ctx); }).then(function (after) {
        var now = after.milestones.find(function (x) { return x.id === m.id; });
        var count = open(after).filter(function (x) { return x.status === 'waiting'; }).length;
        return 'Logged: **' + now.fields.title + '** is with ' + (now.fields.approver || 'the client') + ' for approval, round ' + now.fields.rounds + '. That makes ' + count + ' approvals out. I’ll flag it if it waits more than five days.';
      });
    });
  }

  function report(ctx, text) {
    return state(ctx).then(function (s) {
      var p = project(s, text);
      return ctx.invoke('weekly_report', p ? { project: p.id } : {}, p ? p.fields.title : 'Every active project').then(function () { return state(ctx); }).then(function (after) {
        var targets = p ? [after.byId[p.id]] : after.projects.filter(function (x) { return x.status === 'active'; });
        var weekAgo = iso(Date.now() - 7 * DAY);
        return targets.map(function (proj) {
          var mine = after.milestones.filter(function (m) { return m.fields.projectId === proj.id; }).sort(function (a, b) { return String(a.fields.dueAt).localeCompare(String(b.fields.dueAt)); });
          var done = mine.filter(function (m) { return m.status === 'approved' && String(m.fields.approvedAt) >= weekAgo; });
          var out = mine.filter(function (m) { return m.status === 'waiting'; });
          var doing = mine.filter(function (m) { return m.status === 'in-progress'; });
          var next = mine.filter(function (m) { return m.status === 'planned'; })[0];
          return 'Here’s a draft for ' + (proj.fields.contact || proj.fields.client) + ':\n\n**' + proj.fields.title + ', this week**\n' +
            '- Done: ' + (done.length ? done.map(function (m) { return m.fields.title; }).join(', ') + ', approved — thank you.' : 'nothing signed off this week.') + '\n' +
            '- With you: ' + (out.length ? out.map(function (m) { return m.fields.title + ' (round ' + (m.fields.rounds || 1) + ')'; }).join(', ') + '. A yes or your notes by ' + niceDate(out[0].fields.dueAt) + ' keeps us on schedule.' : 'nothing waiting on you.') + '\n' +
            '- We’re working on: ' + (doing.length ? doing.map(function (m) { return m.fields.title + (daysLeft(m.fields.dueAt) < 0 ? ', running ' + days(-daysLeft(m.fields.dueAt)) + ' behind' : ', ready ' + niceDate(m.fields.dueAt)); }).join('; ') : 'the next milestone, once you reply') + '.\n' +
            (next ? '- Then: ' + next.fields.title + ', ' + niceDate(next.fields.dueAt) + '.\n' : '') +
            '- Overall: ' + (doing.some(function (m) { return daysLeft(m.fields.dueAt) < 0; }) ? 'one piece is behind, and the project is still aiming for ' : 'on schedule for ') + niceDate(proj.fields.dueAt) + '.';
        }).join('\n\n') + '\n\nWant me to tighten it, or send the same shape to the other clients?';
      });
    });
  }

  function late(ctx) {
    return ctx.invoke('delivery_status', {}, 'Due in the next 14 days').then(function () { return state(ctx); }).then(function (s) {
      var list = open(s).filter(function (m) { return m.fields.dueAt && daysLeft(m.fields.dueAt) <= 14; }).sort(function (a, b) { return String(a.fields.dueAt).localeCompare(String(b.fields.dueAt)); });
      if (!list.length) return 'Nothing is due in the next two weeks.';
      var behind = list.filter(function (m) { return m.status !== 'waiting' && daysLeft(m.fields.dueAt) < 0; }).length;
      return (behind ? behind + (behind === 1 ? ' milestone is' : ' milestones are') + ' late on our side. ' : 'Nothing is late on our side. ') + 'Due in the next two weeks, late first:\n' + list.map(function (m) {
        var d = daysLeft(m.fields.dueAt), p = s.byId[m.fields.projectId];
        return '- **' + m.fields.title + '** (' + p.fields.client + ') ' + (m.status === 'waiting' ? 'with the client, ' : '') + (d < 0 ? days(-d) + ' late' : d === 0 ? 'due today' : 'due ' + niceDate(m.fields.dueAt)) + (m.fields.owner && m.status !== 'waiting' ? ', ' + m.fields.owner : '');
      }).join('\n');
    });
  }

  function changes(ctx, text) {
    return state(ctx).then(function (s) {
      var m = find(s, text, function (x) { return x.status !== 'approved'; });
      if (!m) return 'Which milestone came back with changes? Name it, like “Dana wants changes to the menu layout”.';
      var feedback = text.replace(/\s+/g, ' ').trim();
      return ctx.invoke('set_milestone_status', { id: m.id, status: 'in-progress', note: feedback }, m.fields.title + ': changes requested').then(function () { return state(ctx); }).then(function (after) {
        var now = after.milestones.find(function (x) { return x.id === m.id; });
        return 'Noted the changes on **' + now.fields.title + '**, and it’s back in progress' + (m.status === 'waiting' ? ' after round ' + (now.fields.rounds || 1) : '') + '. It’s still due ' + niceDate(now.fields.dueAt) + '; if the changes need more time, tell me how many days and I’ll move it.';
      });
    });
  }

  return {
    name: 'Koen',
    role: 'Planner',
    greeting: 'Hello, I’m Koen. I keep Fernwood Studio’s client work moving. Two approvals are out with clients, the longest for 6 days, and Brightline’s wrap concepts are 2 days late.',
    suggestions: [
      'What’s waiting on clients?',
      'Juniper approved the homepage design',
      'Push the Brightline wrap concepts back a week',
      'Sent the window signage proofs to Dana for approval',
      'Draft this week’s status for Harbor Street Café',
    ],
    respond: function (text, ctx) {
      var lower = plain(text);
      if (/\b(push|move|slide|slip|delay|pull|bring)\b/.test(lower) && /\b(back|out|in|forward|earlier|later|week|weeks|days?)\b/.test(lower)) return slip(ctx, text);
      if (/\b(approved|signed off|sign-off|loved it|said yes)\b/.test(lower)) return approve(ctx, text);
      if (/\b(sent|sending|shared|went out)\b/.test(lower)) return sent(ctx, text);
      if (/\b(changes|revisions|tweaks|feedback|asked for)\b/.test(lower)) return changes(ctx, text);
      if (/\b(status|report|update)\b/.test(lower)) return report(ctx, text);
      if (/\b(waiting|approval|approvals|chase|nudge|out with)\b/.test(lower)) return waitingReport(ctx);
      if (/\b(late|overdue|behind|due|coming up|next|this week)\b/.test(lower)) return late(ctx);
      return null;
    },
    reactions: {
      page_set_milestone_status: function (input, output) {
        return output && output.summary ? output.summary.split('. ')[0] + '. I’ll keep the next one moving.' : 'Updated.';
      },
      page_add_milestone: function (input) {
        return 'On the board: ' + input.title + (input.dueAt ? ', due ' + niceDate(input.dueAt) : '') + '.';
      },
      page_add_project: function (input) {
        return 'Added ' + input.title + '. Tell me its milestones and I’ll lay them out.';
      },
    },
  };
})();

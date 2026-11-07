// The standalone demo's sample conversation. In Gezel, the account manager's
// replies come from the model the person chooses; here they are scripted,
// and every change goes through the same tools the crew calls.
window.demoChat = (function () {
  'use strict';
  var DAY = 86400000;
  var WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  var CHANCE = { lead: 10, qualified: 25, proposal: 50, negotiation: 75, won: 100, lost: 0 };
  var OPEN = ['lead', 'qualified', 'proposal', 'negotiation'];

  function pad(n) { return n < 10 ? '0' + n : String(n); }
  function iso(ms) { var d = new Date(ms); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function daysLeft(day) { return Math.round((Date.parse(String(day).slice(0, 10) + 'T00:00:00') - Date.parse(iso(Date.now()) + 'T00:00:00')) / DAY); }
  function when(days) { return days < 0 ? -days + (days === -1 ? ' day late' : ' days late') : days === 0 ? 'today' : days === 1 ? 'tomorrow' : 'in ' + days + ' days'; }
  function niceDate(day) { return new Date(String(day).slice(0, 10) + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }); }
  function money(cents) {
    var n = Math.round(Number(cents) || 0), abs = Math.abs(n);
    return (n < 0 ? '-$' : '$') + String(Math.floor(abs / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, ',') + (abs % 100 ? '.' + pad(abs % 100) : '');
  }
  function fold(text) { return String(text || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase(); }
  function value(r) { return Number(r.fields.valueCents) || 0; }
  function chance(r) { var p = r.fields.probability; return typeof p === 'number' ? p : CHANCE[r.status] || 0; }
  function weighted(r) { return Math.floor((value(r) * chance(r) + 50) / 100); }
  function isOpen(r) { return OPEN.indexOf(r.status) >= 0; }

  function state(ctx) {
    return Promise.all([ctx.read('deals.json'), ctx.read('activity.json')]).then(function (v) {
      return { records: (v[0] && v[0].records) || [], events: (v[1] && v[1].events) || [] };
    });
  }
  function open(s) { return s.records.filter(isOpen); }
  // The deal the person means: the one whose title and company share the most words with what they wrote.
  function find(s, text, onlyOpen) {
    var words = fold(text).match(/[a-z]{4,}/g) || [];
    var best = null, score = 0;
    s.records.forEach(function (r) {
      if (onlyOpen && !isOpen(r)) return;
      var name = fold(r.fields.title + ' ' + (r.fields.company || ''));
      var hits = words.filter(function (w) { return name.indexOf(w) >= 0 || name.indexOf(w.replace(/s$/, '')) >= 0; }).length;
      if (hits > score) { best = r; score = hits; }
    });
    return best;
  }
  function amount(text) {
    var m = text.match(/\$\s?([\d,]+(?:\.\d{1,2})?)/) || text.match(/\b(\d[\d,]{2,}(?:\.\d{1,2})?)\b/);
    return m ? Number(m[1].replace(/,/g, '')) : null;
  }
  function dateIn(text) {
    var lower = text.toLowerCase(), m = lower.match(/\b(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/);
    if (m) { var d = new Date(); d.setHours(12, 0, 0, 0); d.setDate(d.getDate() + (((WEEKDAYS.indexOf(m[1]) - d.getDay() + 7) % 7) || 7)); return iso(d.getTime()); }
    if (/\btomorrow\b/.test(lower)) return iso(Date.now() + DAY);
    if (/\bnext week\b/.test(lower)) return iso(Date.now() + 7 * DAY);
    var n = lower.match(/\bin (\d{1,2}) days?\b/);
    return n ? iso(Date.now() + Number(n[1]) * DAY) : null;
  }

  function followUps(ctx) {
    return ctx.invoke('pipeline_status', {}, 'Follow-ups and open deals').then(function () { return state(ctx); }).then(function (s) {
      var dated = open(s).filter(function (r) { return r.fields.followUpAt; }).sort(function (a, b) { return String(a.fields.followUpAt).localeCompare(String(b.fields.followUpAt)); });
      var now = dated.filter(function (r) { return daysLeft(r.fields.followUpAt) <= 0; });
      var week = dated.filter(function (r) { var d = daysLeft(r.fields.followUpAt); return d > 0 && d <= 7; });
      var unset = open(s).filter(function (r) { return !r.fields.followUpAt; });
      var lines = now.map(function (r) {
        return '- **' + r.fields.title + '**, ' + when(daysLeft(r.fields.followUpAt)) + (r.fields.contact ? ' (' + r.fields.contact + ')' : '') + (r.fields.nextStep ? ': ' + r.fields.nextStep.charAt(0).toLowerCase() + r.fields.nextStep.slice(1) : '');
      });
      return (now.length ? 'Here’s who to call today, the late one first:\n' + lines.join('\n') : 'Nobody is due today.') +
        (week.length ? '\n\nLater this week: ' + week.map(function (r) { return r.fields.title + ' ' + when(daysLeft(r.fields.followUpAt)); }).join(', ') + '.' : '') +
        (unset.length ? '\n\n' + unset.map(function (r) { return r.fields.title; }).join(' and ') + (unset.length === 1 ? ' has' : ' have') + ' no follow-up yet. Say when, and I’ll set it.' : '');
    });
  }

  function touched(ctx, text) {
    return state(ctx).then(function (s) {
      var r = find(s, text, true);
      if (!r) return 'Which deal was that about? Name the company, like “called Mei at Fernwood”.';
      var lower = text.toLowerCase();
      var kind = /\b(emailed|email|wrote)\b/.test(lower) ? 'email' : /\b(met|meeting|walked|visit)\b/.test(lower) ? 'meeting' : 'call';
      var next = dateIn(text);
      var wants = text.match(/wants (?:the |a |our )?(.+?)(?: by| on| before|[,.;]|$)/i);
      var step = wants ? 'Send the ' + wants[1].trim() : 'Check in';
      var was = r.fields.followUpAt ? daysLeft(r.fields.followUpAt) : null;
      var input = { id: r.id, kind: kind, note: text.replace(/\s+/g, ' ').trim() };
      if (next) { input.followUpAt = next; input.nextStep = step; }
      return ctx.invoke('log_activity', input, r.fields.title + ': ' + kind).then(function () {
        return 'Logged the ' + kind + ' on **' + r.fields.title + '**.' +
          (next ? ' ' + (was !== null && was < 0 ? 'The follow-up that was ' + when(was) + ' now points to ' : 'Next follow-up: ') + niceDate(next) + ', ' + step.toLowerCase() + '.' : was !== null && was <= 0 ? ' That was the follow-up that was due, so this deal has no next date. When should we check back?' : '') +
          (/proposal/i.test(text) ? ' In Gezel I can draft the revised proposal with the Proposal plan, ready for you to check.' : '');
      });
    });
  }

  function grew(ctx, text) {
    return state(ctx).then(function (s) {
      var r = find(s, text, true), dollars = amount(text);
      if (!r) return 'Which deal changed? Name the company and the amount, like “Juniper Press added $3,400”.';
      if (dollars === null) return 'How much did ' + r.fields.title + ' change by? A figure like “another $3,400” is enough.';
      var change = /\b(less|minus|dropped|cut|took off|removed|lower)\b/i.test(text) ? -dollars : dollars;
      var before = value(r), beforeWeighted = weighted(r);
      return ctx.invoke('add_deal', { title: r.fields.title, valueChange: change, note: text.replace(/\s+/g, ' ').trim() }, r.fields.title + (change < 0 ? ' − ' : ' + ') + money(Math.abs(change) * 100)).then(function (out) {
        return state(ctx).then(function (after) {
          var now = after.records.find(function (x) { return x.id === r.id; });
          return '**' + now.fields.title + '** is now ' + money(value(now)) + ' (' + money(before) + (change < 0 ? ' − ' : ' + ') + money(Math.abs(change) * 100) + '). ' +
            'At ' + now.status + ' (' + chance(now) + '%), that moves the weighted forecast by ' + money(weighted(now) - beforeWeighted) + ', to ' + money(Math.round(out.weightedForecast * 100)) + '.';
        });
      });
    });
  }

  function decided(ctx, text) {
    return state(ctx).then(function (s) {
      var r = find(s, text, true);
      if (!r) return 'Which deal was that? Name it, like “we won the café kitchen rewire”.';
      var lost = /\b(lost|went with|chose|said no|turned us down|passed)\b/i.test(text);
      var reason = lost ? ((text.match(/\b((?:went with|because|chose) .+)$/i) || [])[1] || '') : '';
      var input = { id: r.id, status: lost ? 'lost' : 'won' };
      if (lost && reason) input.note = reason.charAt(0).toUpperCase() + reason.slice(1).replace(/[.\s]+$/, '');
      return ctx.invoke('move_deal', input, r.fields.title + ': ' + input.status).then(function (out) {
        return state(ctx).then(function (after) {
          var wonRecent = after.records.filter(function (x) { return x.status === 'won' && x.fields.closedAt && daysLeft(x.fields.closedAt) >= -30; });
          var next = open(after).filter(function (x) { return x.fields.followUpAt; }).sort(function (a, b) { return String(a.fields.followUpAt).localeCompare(String(b.fields.followUpAt)); })[0];
          return (lost
            ? 'Marked **' + r.fields.title + '** lost' + (input.note ? ' (' + input.note.toLowerCase() + ')' : '') + '. Losses are worth a reason; it helps price the next one.'
            : 'Congratulations: **' + r.fields.title + '** is won, ' + money(value(r)) + '. That makes ' + money(wonRecent.reduce(function (t, x) { return t + value(x); }, 0)) + ' won in the last 30 days, and its follow-up is cleared.') +
            ' The weighted forecast for what’s still open is ' + money(Math.round(out.weightedForecast * 100)) + '.' +
            (next ? ' Next call: ' + next.fields.title + ', ' + when(daysLeft(next.fields.followUpAt)) + '.' : '');
        });
      });
    });
  }

  function newLead(ctx, text) {
    var m = text.match(/lead:?\s*(.+?)\s+(?:wants|needs|asked for|is asking for)\s+(?:a |an |the |some )?(.+?)(?:,|\.|\s+about|\s+around|$)/i);
    if (!m) return Promise.resolve('Tell me who and what, like “new lead: Pinecrest Apartments wants hallway lighting, about $7,500”.');
    var company = m[1].trim(), job = m[2].trim().replace(/^(?:quote for |price for )/i, ''), dollars = amount(text);
    var title = company + ' ' + job;
    var input = { title: title, company: company, status: 'lead', inDays: 2, nextStep: 'Call to scope the job' };
    if (dollars !== null) input.value = dollars;
    return ctx.invoke('add_deal', input, title + (dollars !== null ? ', ' + money(dollars * 100) : '')).then(function () {
      return 'Added **' + title + '** as a lead' + (dollars !== null ? ' at ' + money(dollars * 100) + ' (10% weighted, ' + money(Math.floor((Math.round(dollars * 100) * 10 + 50) / 100)) + ')' : ', with no value yet') +
        '. I set a follow-up for ' + niceDate(iso(Date.now() + 2 * DAY)) + ': call to scope the job.';
    });
  }

  function forecast(ctx) {
    return ctx.invoke('pipeline_status', {}, 'Weighted forecast').then(function (out) {
      return state(ctx).then(function (s) {
        var deals = open(s).sort(function (a, b) { return weighted(b) - weighted(a); });
        var month = iso(Date.now()).slice(0, 7);
        var closing = deals.filter(function (r) { return String(r.fields.closeAt || '').slice(0, 7) === month; });
        return 'The weighted forecast is **' + money(Math.round(out.weightedForecast * 100)) + '**, from ' + deals.length + ' open deals worth ' + money(Math.round(out.openValue * 100)) + ':\n' +
          deals.map(function (r) { return '- ' + r.fields.title + ': ' + money(value(r)) + ' at ' + chance(r) + '% = ' + money(weighted(r)); }).join('\n') +
          '\n\n' + (closing.length ? 'Expected to close this month: ' + closing.map(function (r) { return r.fields.title; }).join(' and ') + ', ' + money(closing.reduce(function (t, r) { return t + weighted(r); }, 0)) + ' weighted. ' : '') +
          (deals[0] ? 'The biggest lever is ' + deals[0].fields.title + ': a yes there adds ' + money(value(deals[0]) - weighted(deals[0])) + ' to what you can count on.' : '');
      });
    });
  }

  function moved(ctx, text) {
    return state(ctx).then(function (s) {
      var r = find(s, text, true), lower = text.toLowerCase();
      if (!r) return 'Which deal moved? Name the company, like “sent the Juniper proposal”.';
      var to = /negotiat/.test(lower) ? 'negotiation' : /qualif/.test(lower) ? 'qualified' : 'proposal';
      if (OPEN.indexOf(r.status) >= OPEN.indexOf(to)) return '**' + r.fields.title + '** is already at ' + r.status + '. Tell me what happened and I’ll log it.';
      return ctx.invoke('move_deal', { id: r.id, status: to }, r.fields.title + ': ' + to).then(function (out) {
        if (to !== 'proposal') return 'Moved **' + r.fields.title + '** to ' + to + '. The weighted forecast is now ' + money(Math.round(out.weightedForecast * 100)) + '.';
        return ctx.invoke('schedule_follow_up', { id: r.id, inDays: 3, nextStep: 'Ask whether they have questions about the proposal' }, 'Follow up in 3 days').then(function () {
          return 'Moved **' + r.fields.title + '** to proposal, so it now counts at 50% and the weighted forecast is ' + money(Math.round(out.weightedForecast * 100)) + '. ' +
            'I set a follow-up for ' + niceDate(iso(Date.now() + 3 * DAY)) + ': ask whether they have questions.';
        });
      });
    });
  }

  function overview(ctx) {
    return ctx.invoke('pipeline_status', {}, 'Deals by stage').then(function () { return state(ctx); }).then(function (s) {
      return 'By stage:\n' + OPEN.map(function (stage) {
        var here = open(s).filter(function (r) { return r.status === stage; });
        return '- **' + stage.charAt(0).toUpperCase() + stage.slice(1) + '**: ' + (here.length ? here.map(function (r) { return r.fields.title + ' (' + money(value(r)) + ')'; }).join(', ') : 'none');
      }).join('\n');
    });
  }

  return {
    name: 'Luuk',
    role: 'Account Manager',
    greeting: 'Hello, I’m Luuk. I keep Brightline Electric’s pipeline current. Fernwood’s follow-up is 2 days late, and the café kitchen rewire is waiting on a yes today.',
    suggestions: [
      'Who should I follow up with today?',
      'Called Mei at Fernwood; she wants the revised proposal by Friday',
      'Juniper Press added the loading dock lights, another $3,400',
      'We won the café kitchen rewire',
      'What’s our weighted forecast?',
    ],
    respond: function (text, ctx) {
      var lower = text.toLowerCase();
      if (/\bnew (?:lead|deal)\b|\blead:/.test(lower)) return newLead(ctx, text);
      if (/\b(we won|won the|signed|we lost|lost the|went with|turned us down)\b/.test(lower)) return decided(ctx, text);
      if (/\b(added|another|extra|more|less|dropped|cut)\b/.test(lower) && amount(text) !== null) return grew(ctx, text);
      if (/\b(sent|emailed|moved?)\b.*\b(proposal|quote|estimate|negotiation|qualified)\b/.test(lower)) return moved(ctx, text);
      if (/\b(called|emailed|met with|spoke|talked|voicemail|wrote to)\b/.test(lower)) return touched(ctx, text);
      if (/\b(follow|call today|who should|chase|today)\b/.test(lower)) return followUps(ctx);
      if (/\b(forecast|worth|expect|this month|weighted)\b/.test(lower)) return forecast(ctx);
      if (/\b(stage|stages|pipeline|deals|board)\b/.test(lower)) return overview(ctx);
      return null;
    },
    reactions: {
      page_move_deal: function (input, output) {
        return output && output.summary ? output.summary.split('. ')[0] + '. The weighted forecast is now ' + money(Math.round(output.weightedForecast * 100)) + '.' : 'Moved.';
      },
      page_add_deal: function (input) {
        return 'On the pipeline: ' + input.title + (input.value ? ', ' + money(Math.round(input.value * 100)) : '') + '. ' +
          (input.followUpAt ? 'I’ll keep the follow-up on ' + niceDate(input.followUpAt) + '.' : 'When should we follow up? A deal without a date goes cold.');
      },
      page_log_activity: function (input) {
        return 'Logged.' + (input.followUpAt ? ' Next follow-up: ' + niceDate(input.followUpAt) + '.' : '');
      },
    },
  };
})();

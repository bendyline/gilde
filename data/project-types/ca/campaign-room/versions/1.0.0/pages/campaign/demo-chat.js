// The standalone demo's sample conversation. In Gezel, the campaign
// manager's replies come from the model the person chooses; here they are
// scripted, and every change goes through the same tools the crew calls.
window.demoChat = (function () {
  'use strict';
  var DAY = 86400000;
  var WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  var CHANNELS = ['email', 'instagram', 'facebook', 'linkedin', 'bluesky', 'tiktok', 'youtube', 'website', 'print', 'press', 'event'];

  function pad(n) { return n < 10 ? '0' + n : String(n); }
  function iso(ms) { var d = new Date(ms); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function today() { return iso(Date.now()); }
  function addDays(day, n) { var d = new Date(String(day).slice(0, 10) + 'T12:00:00'); d.setDate(d.getDate() + n); return iso(d.getTime()); }
  function daysLeft(day) { return Math.round((Date.parse(String(day).slice(0, 10) + 'T00:00:00') - Date.parse(today() + 'T00:00:00')) / DAY); }
  function nice(day) { return new Date(String(day).slice(0, 10) + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }); }
  function count(n) { return String(Math.round(n || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, ','); }
  function money(cents) { var abs = Math.abs(Math.round(cents)); return (cents < 0 ? '-' : '') + '$' + String(Math.floor(abs / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, ',') + '.' + pad(abs % 100); }

  function state(ctx) {
    return Promise.all([ctx.read('campaign.json'), ctx.read('assets.json'), ctx.read('results.json')]).then(function (v) {
      return { campaign: v[0] || {}, records: (v[1] && v[1].records) || [], events: (v[2] && v[2].events) || [] };
    });
  }
  function metric(s) { return s.campaign.goalMetric || 'conversions'; }
  function results(s) {
    var byKey = {}, order = [];
    s.events.forEach(function (e) { if (e.kind !== 'result' || !e.data) return; var key = e.data.assetId + '@' + e.data.day; if (!(key in byKey)) order.push(key); byKey[key] = e; });
    return order.map(function (k) { return byKey[k]; });
  }
  function conversions(list) { return list.reduce(function (sum, e) { return sum + (Number(e.data.conversions) || 0); }, 0); }
  function spent(s) { return s.events.filter(function (e) { return e.kind === 'spend' && e.data; }).reduce(function (sum, e) { return sum + (Number(e.data.amountCents) || 0); }, 0); }
  function titleOf(s, id) { var r = s.records.find(function (x) { return x.id === id; }); return r ? r.fields.title : id; }
  // The asset the person means: the one whose title shares the most words with what they wrote.
  function find(s, text) {
    var words = (text.toLowerCase().match(/[a-z]{3,}/g) || []).filter(function (w) { return ['the', 'and', 'our', 'for', 'with', 'went', 'out', 'live', 'approve', 'approved', 'move', 'schedule', 'scheduled', 'ready'].indexOf(w) < 0; });
    var best = null, score = 0;
    s.records.forEach(function (r) {
      var title = r.fields.title.toLowerCase();
      var hits = words.filter(function (w) { return title.indexOf(w) >= 0 || title.indexOf(w.replace(/s$/, '')) >= 0; }).length;
      if (hits > score) { best = r; score = hits; }
    });
    return best;
  }
  function amountIn(text) {
    var m = text.match(/\$\s?([\d,]+(?:\.\d{1,2})?)/) || text.match(/([\d,]+(?:\.\d{1,2})?)\s*(?:dollars|usd)\b/i);
    return m ? Number(m[1].replace(/,/g, '')) : null;
  }
  function channelIn(text) {
    var lower = text.toLowerCase();
    if (/\b(ads?|boost(ed)?|paid)\b/.test(lower)) return 'ads';
    if (/\bnewsletter\b/.test(lower)) return 'email';
    if (/\b(poster|flyer|printing)\b/.test(lower)) return 'print';
    if (/\b(landing page|website|site)\b/.test(lower)) return 'website';
    if (/\btwitter\b/.test(lower)) return 'x';
    return CHANNELS.find(function (c) { return lower.indexOf(c) >= 0; }) || null;
  }
  // 'Tuesday' is the most recent Tuesday before today; 'yesterday' and 'today' are what they say.
  function dayIn(text) {
    var lower = text.toLowerCase();
    if (/\byesterday\b/.test(lower)) return addDays(today(), -1);
    if (/\btoday\b/.test(lower)) return today();
    var hit = WEEKDAYS.find(function (w) { return lower.indexOf(w) >= 0; });
    if (!hit) return null;
    var dow = new Date(today() + 'T12:00:00').getDay();
    return addDays(today(), -(((dow - WEEKDAYS.indexOf(hit) + 7) % 7) || 7));
  }

  function planLaunchWeek(ctx) {
    return state(ctx).then(function (s) {
      var launch = s.campaign.launchAt;
      if (!launch) return 'When is launch day? Tell me the date and I’ll plan the week around it.';
      var plan = [
        { title: 'Launch-day email', channel: 'email', kind: 'email', at: 0, owner: 'Ines', status: 'draft' },
        { title: 'Instagram launch reel', channel: 'instagram', kind: 'video', at: 0, owner: 'Theo', status: 'draft' },
        { title: 'Bluesky launch-day thread', channel: 'bluesky', kind: 'post', at: 0, owner: 'Ines', status: 'idea' },
        { title: 'Launch reading at Fernhill Books', channel: 'event', kind: 'event', at: 1, owner: 'Ruth', status: 'approved' },
        { title: 'LinkedIn note from the publisher', channel: 'linkedin', kind: 'post', at: 2, owner: 'Ruth', status: 'idea' },
        { title: 'First reader reviews roundup', channel: 'instagram', kind: 'graphic', at: 4, owner: 'Theo', status: 'idea' },
        { title: 'Thank-you email to preorder readers', channel: 'email', kind: 'email', at: 6, owner: 'Ines', status: 'idea' },
      ];
      return plan.reduce(function (chain, a) {
        return chain.then(function () {
          var day = addDays(launch, a.at);
          return ctx.invoke('add_asset', { title: a.title, channel: a.channel, kind: a.kind, goesOutAt: day, owner: a.owner, status: a.status }, a.title + ', ' + nice(day));
        });
      }, Promise.resolve()).then(function () { return state(ctx); }).then(function (after) {
        var days = {};
        plan.forEach(function (a) { var day = addDays(launch, a.at); (days[day] = days[day] || []).push(a.title + ' (' + a.owner + ')'); });
        var lines = Object.keys(days).sort().map(function (day) { return '- **' + nice(day) + '**' + (day === launch ? ', launch day' : '') + ': ' + days[day].join(', '); });
        var page = after.records.find(function (r) { return /landing page/i.test(r.fields.title) && r.status !== 'approved' && r.status !== 'scheduled' && r.status !== 'live'; });
        return 'Launch week is on the calendar, seven assets from launch day on:\n' + lines.join('\n') +
          '\n\n' + (page ? 'One thing first: the launch landing page is still a ' + page.status + ', and the launch-day email links to it, so it’s the asset to approve next. ' : '') +
          'The reviews roundup will quote only reviews readers actually posted, with their permission.';
      });
    });
  }

  function dayReport(ctx, day) {
    return ctx.invoke('campaign_status', { day: day }, nice(day)).then(function () { return state(ctx); }).then(function (s) {
      var all = results(s), mine = all.filter(function (e) { return e.data.day === day; });
      if (!mine.length) return 'Nothing was logged for ' + nice(day) + '. If something went out that day, tell me its numbers and I’ll add them.';
      var conv = conversions(mine);
      var reach = mine.reduce(function (n, e) { return n + (Number(e.data.reach) || 0); }, 0), clicks = mine.reduce(function (n, e) { return n + (Number(e.data.clicks) || 0); }, 0);
      var byDay = {};
      all.forEach(function (e) { byDay[e.data.day] = (byDay[e.data.day] || 0) + (Number(e.data.conversions) || 0); });
      var ranked = Object.keys(byDay).sort(function (a, b) { return byDay[b] - byDay[a]; });
      var place = ranked.indexOf(day);
      var places = ['the best day', 'the second-best day', 'the third-best day'];
      return '**' + nice(day) + '** brought **' + count(conv) + ' ' + metric(s) + '** from ' + count(reach) + ' reach and ' + count(clicks) + ' clicks (' + (reach ? Math.round((clicks / reach) * 1000) / 10 : 0) + '% clicked through):\n' +
        mine.map(function (e) { return '- ' + titleOf(s, e.data.assetId) + ': ' + count(e.data.conversions) + ' ' + metric(s) + ', ' + count(e.data.clicks) + ' clicks'; }).join('\n') +
        '\n\nThat makes it ' + (places[place] || 'day ' + (place + 1) + ' of ' + ranked.length) + ' of the campaign' +
        (place > 0 ? '; ' + nice(ranked[0]) + ' is still ahead with ' + count(byDay[ranked[0]]) + '.' : '.');
    });
  }

  function onTrack(ctx) {
    return ctx.invoke('campaign_status', {}, 'Pace toward the goal').then(function () { return state(ctx); }).then(function (s) {
      var c = s.campaign, target = Number(c.goalTarget) || 0, all = results(s), conv = conversions(all);
      if (!target) return 'There’s no goal number yet. Tell me what to count and how many, like “600 preorders by launch day”.';
      var by = c.goalBy || c.launchAt || c.endAt, left = by ? daysLeft(by) : null, toGo = target - conv;
      if (toGo <= 0) return 'Yes: ' + count(conv) + ' ' + metric(s) + ' is past the goal of ' + count(target) + '.';
      var start = c.startAt && daysLeft(c.startAt) <= 0 ? c.startAt : null, elapsed = start ? -daysLeft(start) + 1 : 1;
      var pace = Math.round(conv / elapsed), need = left > 0 ? Math.ceil(toGo / left) : toGo;
      var byAsset = {};
      all.forEach(function (e) { byAsset[e.data.assetId] = (byAsset[e.data.assetId] || 0) + (Number(e.data.conversions) || 0); });
      var bestId = Object.keys(byAsset).sort(function (a, b) { return byAsset[b] - byAsset[a]; })[0];
      if (left === null || left <= 0) return 'The goal date has passed with ' + count(conv) + ' of ' + count(target) + ' ' + metric(s) + '. Tell me if the goal moves and I’ll measure against the new date.';
      var onPace = pace >= need;
      return (onPace ? 'Yes, at this pace. ' : 'Not at this pace. ') + 'You have **' + count(conv) + ' of ' + count(target) + ' ' + metric(s) + '** (' + Math.round((conv / target) * 100) + '%) after ' + elapsed + ' days, about ' + pace + ' a day. ' +
        'Reaching ' + count(target) + ' by ' + nice(by) + ' needs ' + count(need) + ' a day for the next ' + left + ' days.' +
        (onPace ? '' : '\n\n' + (bestId ? 'The strongest lever so far is **' + titleOf(s, bestId) + '**, with ' + count(byAsset[bestId]) + ' ' + metric(s) + ' on its own. ' : '') +
          'A second email to the list a few days before launch is the most likely way to close part of the gap. Say the word and I’ll put it on the calendar.');
    });
  }

  function spend(ctx, text) {
    var amount = amountIn(text);
    if (!amount) return Promise.resolve('How much was it? A figure like “$250 on ads” is enough.');
    return state(ctx).then(function (s) {
      var asset = find(s, text);
      var channel = channelIn(text) || (asset ? asset.fields.channel : 'other');
      if (asset && asset.fields.channel !== channel) asset = null;
      var input = { amount: amount, channel: channel, note: text.replace(/\s+/g, ' ').trim() };
      if (asset) input.id = asset.id;
      return ctx.invoke('log_spend', input, money(amount * 100) + ' on ' + channel).then(function () { return state(ctx); }).then(function (after) {
        var total = spent(after), budget = Number(after.campaign.budgetCents) || 0;
        var onChannel = after.events.filter(function (e) { return e.kind === 'spend' && e.data.channel === channel; }).reduce(function (n, e) { return n + e.data.amountCents; }, 0);
        return 'Logged ' + money(amount * 100) + ' on ' + channel + (asset ? ' against ' + asset.fields.title : '') + '. ' +
          (budget ? 'That’s ' + money(total) + ' of ' + money(budget) + ' spent, with **' + money(budget - total) + ' left**' : 'That’s ' + money(total) + ' spent so far') +
          '; ' + channel + ' is ' + money(onChannel) + ' of it.';
      });
    });
  }

  function budgetChange(ctx, text) {
    var amount = amountIn(text);
    if (!amount) return Promise.resolve('By how much? “Add $500 to the budget” is enough.');
    var change = /\b(cut|reduce|lower|less|take)\b/i.test(text) ? -amount : amount;
    return ctx.invoke('set_campaign', { budgetChange: change }, (change > 0 ? '+' : '-') + money(Math.abs(change) * 100) + ' budget').then(function () { return state(ctx); }).then(function (s) {
      var budget = Number(s.campaign.budgetCents) || 0, total = spent(s);
      return 'The budget is now **' + money(budget) + '** (' + (change > 0 ? money(change * 100) + ' more' : money(-change * 100) + ' less') + '). With ' + money(total) + ' spent, ' + money(budget - total) + ' is left for launch week' +
        (/launch.day ads|ads/i.test(text) && change > 0 ? '. I’ve noted it’s meant for launch-day ads; log the spend when it goes out and I’ll keep the count.' : '.');
    });
  }

  function logResult(ctx, text) {
    return state(ctx).then(function (s) {
      var asset = find(s, text);
      if (!asset) return 'Which asset are those numbers for? Name it, like “the preorder email got 46 preorders”.';
      var num = function (re) { var m = text.match(re); return m ? Number(m[1].replace(/,/g, '')) : undefined; };
      var input = { id: asset.id, day: dayIn(text) || today() };
      var conv = num(/([\d,]+)\s*(?:pre-?orders?|orders?|sign-?ups?|sales|bookings?)\b/i), clicks = num(/([\d,]+)\s*clicks?\b/i), reach = num(/([\d,]+)\s*(?:opens|views|reach|impressions)\b/i);
      if (conv !== undefined) input.conversions = conv;
      if (clicks !== undefined) input.clicks = clicks;
      if (reach !== undefined) input.reach = reach;
      return ctx.invoke('log_result', input, asset.fields.title + ', ' + nice(input.day)).then(function () { return state(ctx); }).then(function (after) {
        var total = conversions(results(after)), target = Number(after.campaign.goalTarget) || 0;
        return 'Logged for **' + asset.fields.title + '** on ' + nice(input.day) + (conv !== undefined ? ': ' + count(conv) + ' ' + metric(after) : '') + '. ' +
          (target ? 'The campaign now has ' + count(total) + ' of ' + count(target) + ' ' + metric(after) + '.' : '');
      });
    });
  }

  function move(ctx, text) {
    var lower = text.toLowerCase();
    var status = /\b(went out|is out|is live|went live|live)\b/.test(lower) ? 'live' : /\bschedul/.test(lower) ? 'scheduled' : /\b(approved?|ready|signed off)\b/.test(lower) ? 'approved' : /\bdraft/.test(lower) ? 'draft' : null;
    return state(ctx).then(function (s) {
      var asset = find(s, text);
      if (!asset) return 'Which asset is that? Name it and I’ll move it.';
      if (!status) return 'Where should ' + asset.fields.title + ' go: draft, approved, scheduled or live?';
      return ctx.invoke('move_asset', { id: asset.id, status: status }, asset.fields.title + ': ' + status).then(function () {
        return 'Moved **' + asset.fields.title + '** to ' + status + '.' + (asset.fields.goesOutAt ? ' It goes out ' + nice(asset.fields.goesOutAt) + (asset.fields.owner ? ', with ' + asset.fields.owner : '') + '.' : '');
      });
    });
  }

  function addAsset(ctx, text) {
    var m = text.match(/\b(?:add|plan|put)\s+(?:an?\s+|the\s+|another\s+|one more\s+)?([^,.;]+?)(?=\s+(?:on|for|to go out|going out|next|this|one|two|three|four|five|\d+)\b|,|\.|;|$)/i);
    var title = m ? m[1].trim().replace(/^./, function (c) { return c.toUpperCase(); }) : '';
    if (!title || title.length < 3) return Promise.resolve('What should I add? Name the asset and when it goes out, like “add a reminder email three days before launch”.');
    var numbers = { one: 1, two: 2, three: 3, four: 4, five: 5 };
    return state(ctx).then(function (s) {
      var before = text.toLowerCase().match(/\b(\d+|one|two|three|four|five) days? before (?:the )?launch/);
      var weekday = text.toLowerCase().match(/\bon (monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/);
      var day = null;
      if (before && s.campaign.launchAt) day = addDays(s.campaign.launchAt, -(numbers[before[1]] || Number(before[1])));
      else if (weekday) { var dow = new Date(today() + 'T12:00:00').getDay(); day = addDays(today(), ((WEEKDAYS.indexOf(weekday[1]) - dow + 6) % 7) + 1); }
      var input = { title: title, channel: channelIn(text) || 'other', status: 'idea' };
      if (day) input.goesOutAt = day;
      return ctx.invoke('add_asset', input, title + (day ? ', ' + nice(day) : '')).then(function () {
        return 'Added **' + title + '** as an idea' + (input.channel !== 'other' ? ' for ' + input.channel : '') + (day ? ', going out ' + nice(day) : '') + '. Who should own it? Tell me and I’ll put their name on it.';
      });
    });
  }

  function budgetReport(ctx) {
    return ctx.invoke('campaign_status', {}, 'Budget').then(function () { return state(ctx); }).then(function (s) {
      var budget = Number(s.campaign.budgetCents) || 0, total = spent(s);
      return budget ? money(total) + ' of ' + money(budget) + ' is spent, so **' + money(budget - total) + '** is left.' : 'No budget is set yet; ' + money(total) + ' is logged as spent.';
    });
  }

  function calendar(ctx, text) {
    var span = /this week|next 7|next seven/i.test(text) ? 7 : 14;
    var label = span === 7 ? 'the next 7 days' : 'the next two weeks';
    return ctx.invoke('campaign_status', { withinDays: span }, 'Next ' + span + ' days').then(function () { return state(ctx); }).then(function (s) {
      var soon = s.records.filter(function (r) { var d = r.fields.goesOutAt ? daysLeft(r.fields.goesOutAt) : -1; return d >= 0 && d <= span; }).sort(function (a, b) { return a.fields.goesOutAt.localeCompare(b.fields.goesOutAt); });
      if (!soon.length) return 'Nothing is dated for ' + label + ' yet. “Plan launch week” fills it in.';
      return 'Going out in ' + label + ':\n' + soon.map(function (r) { return '- **' + nice(r.fields.goesOutAt) + '**: ' + r.fields.title + ' (' + r.fields.channel + ', ' + r.status + (r.fields.owner ? ', ' + r.fields.owner : '') + ')'; }).join('\n');
    });
  }

  return {
    name: 'Floor',
    role: 'Campaign Manager',
    greeting: 'Hello, I’m Floor. The Salt Road launches in 6 days, and Juniper Press has 206 of its 600 preorders. Launch week is still empty on the calendar, so that’s where I’d start.',
    suggestions: [
      'Plan launch week',
      'How did Tuesday do?',
      'We spent $250 on another round of preorder ads',
      'Add $500 to the budget for launch-day ads',
      'Are we on track for 600 preorders?',
    ],
    respond: function (text, ctx) {
      var lower = text.toLowerCase();
      if (/launch week/.test(lower)) return planLaunchWeek(ctx);
      if (/\bspent\b/.test(lower) || (/\bspend\b/.test(lower) && amountIn(text))) return spend(ctx, text);
      if (/budget/.test(lower) && /\b(add|raise|increase|more|extra|cut|reduce|lower|less)\b/.test(lower) && amountIn(text)) return budgetChange(ctx, text);
      if (/\b(on track|pace|hit (the|our) goal|make (it|the goal))\b/.test(lower)) return onTrack(ctx);
      var day = dayIn(text);
      if (day && /\b(how|did|do|go|went)\b/.test(lower) && !/\d/.test(lower)) return dayReport(ctx, day);
      if (/\d[\d,]*\s*(pre-?orders?|orders?|sign-?ups?|sales|bookings?|clicks?|opens|views)\b/.test(lower)) return logResult(ctx, text);
      if (/\b(approve|approved|ready|schedule|scheduled|went out|is out|went live|is live)\b/.test(lower)) return move(ctx, text);
      if (/\b(add|plan|put)\b/.test(lower) && !/budget/.test(lower)) return addAsset(ctx, text);
      if (/\b(budget|left to spend|how much)\b/.test(lower)) return budgetReport(ctx);
      if (/\b(calendar|going out|coming up|this week|next week)\b/.test(lower)) return calendar(ctx, text);
      return null;
    },
    reactions: {
      page_log_result: function (input, output, ctx) {
        return state(ctx).then(function (s) {
          var all = results(s), byDay = {};
          all.forEach(function (e) { byDay[e.data.day] = (byDay[e.data.day] || 0) + (Number(e.data.conversions) || 0); });
          var best = Object.keys(byDay).sort(function (a, b) { return byDay[b] - byDay[a]; })[0];
          var day = String(input.day || today()).slice(0, 10);
          return 'Logged. ' + nice(day) + ' now stands at ' + count(byDay[day] || 0) + ' ' + metric(s) + (best && best !== day ? '; the best day is still ' + nice(best) + ' with ' + count(byDay[best]) + '.' : ', the best day of the campaign so far.');
        });
      },
      page_log_spend: function (input, output) {
        var left = output && typeof output.budget === 'number' ? Math.round((output.budget - output.spent) * 100) : null;
        return 'Logged ' + money(Math.round(Number(input.amount) * 100)) + '.' + (left !== null && output.budget ? ' ' + money(left) + ' of the budget is left.' : '');
      },
      page_add_asset: function (input) {
        return 'On the plan: ' + input.title + (input.goesOutAt ? ', going out ' + nice(input.goesOutAt) : '') + '. I’ll keep it on the calendar.';
      },
      page_move_asset: function (input, output, ctx) {
        return state(ctx).then(function (s) {
          var moved = s.records.find(function (r) { return r.id === input.id; });
          var next = s.records.filter(function (r) { return r.id !== input.id && ['idea', 'draft', 'approved'].indexOf(r.status) >= 0 && r.fields.goesOutAt; })
            .sort(function (a, b) { return a.fields.goesOutAt.localeCompare(b.fields.goesOutAt); })[0];
          return (moved ? 'Moved ' + moved.fields.title + ' to ' + moved.status + '. ' : 'Moved. ') +
            (next ? 'Next to finish: ' + next.fields.title + ', still ' + next.status + ', going out ' + nice(next.fields.goesOutAt) + (daysLeft(next.fields.goesOutAt) < 0 ? ', which is already late.' : '.') : 'Nothing else on the calendar is waiting on work.');
        });
      },
      page_set_campaign: function () {
        return 'Saved the campaign details. Everything on the board now measures against them.';
      },
    },
  };
})();

// The standalone demo's sample conversation. In Gezel, the librarian's
// replies come from the model the person chooses; here they are scripted,
// and every change goes through the same tools the crew calls.
window.demoChat = (function () {
  'use strict';
  var DAY = 86400000;
  var DOUBLED = ['set', 'run', 'shut', 'put', 'get', 'cut', 'stop', 'plan', 'ship', 'drop', 'chop', 'mop', 'prep', 'swap', 'wrap'];

  function pad(n) { return n < 10 ? '0' + n : String(n); }
  function iso(ms) { var d = new Date(ms); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function noon(day) { return new Date(String(day).slice(0, 10) + 'T12:00:00'); }
  function addDays(day, n) { var d = noon(day); d.setDate(d.getDate() + n); return iso(d.getTime()); }
  function daysLeft(day) { return Math.round((Date.parse(String(day).slice(0, 10) + 'T00:00:00') - Date.parse(iso(Date.now()) + 'T00:00:00')) / DAY); }
  function niceDate(day) { return noon(day).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }); }
  function cap(text) { return text.charAt(0).toUpperCase() + text.slice(1); }
  function reviewDays(f) { return Number(f.reviewEveryDays) > 0 ? Math.round(Number(f.reviewEveryDays)) : 180; }
  function nextReview(f) { return f.lastReviewedAt ? addDays(f.lastReviewedAt, reviewDays(f)) : null; }
  function reviewState(r) {
    if (r.status === 'retired') return 'retired';
    if (r.status === 'needs-update') return 'flagged';
    if (r.status === 'draft') return 'draft';
    if (!r.fields.lastReviewedAt) return 'unreviewed';
    var d = daysLeft(nextReview(r.fields));
    return d < 0 ? 'stale' : d <= 30 ? 'soon' : 'ok';
  }
  function flagNote(r) { var h = r.history || []; for (var i = h.length - 1; i >= 0; i--) if (h[i].to === 'needs-update' && h[i].note) return h[i].note; return ''; }
  function dates(text) { return text.replace(/\b(\d{4}-\d{2}-\d{2})\b/g, function (d) { return niceDate(d); }); }

  function state(ctx) {
    return ctx.read('sops/index.json').then(function (doc) {
      return ((doc && doc.records) || []).filter(function (r) { return r.status !== 'retired'; });
    });
  }
  // The procedure the person means: the one whose title shares the most words with what they wrote.
  function find(list, text) {
    var words = (text.toLowerCase().match(/[a-z]{4,}/g) || []).filter(function (w) { return ['still', 'right', 'went', 'through', 'changed', 'checked', 'reviewed', 'with', 'what', 'that', 'this', 'procedure', 'steps', 'owns', 'does'].indexOf(w) < 0; });
    var best = null, score = 0;
    list.forEach(function (r) {
      var title = r.fields.title.toLowerCase();
      var hits = words.filter(function (w) { return title.indexOf(w.replace(/(ing|es|s)$/, '')) >= 0; }).length;
      if (hits > score) { best = r; score = hits; }
    });
    return best;
  }
  function stepsOf(text) {
    return String(text || '').split('\n').filter(function (line) { return line.trim() && !/^#\s/.test(line); });
  }

  function howTo(ctx, text) {
    return ctx.invoke('find_procedure', { query: text }, 'How do I…').then(function (out) {
      return state(ctx).then(function (list) {
        var best = /^Best match/.test((out && out.summary) || '') && out.summary.match(/\((sop-\d+)[,)]/);
        var r = best && list.find(function (x) { return x.id === best[1]; });
        if (!r) return 'Nothing in the library covers that yet. Tell me how it’s done, or who does it, and I’ll write it down.';
        return ctx.read(r.fields.file).then(function (body) {
          var s = reviewState(r);
          return 'Here’s **' + r.fields.title + '**, as ' + (r.fields.owner || 'the team') + ' wrote it' + (r.fields.lastReviewedAt ? ' (last checked ' + niceDate(r.fields.lastReviewedAt) + ')' : '') + ':\n\n' + stepsOf(body).join('\n') +
            (s === 'stale' ? '\n\nIt’s past its review date, so ask ' + (r.fields.owner || 'its owner') + ' to look it over.' : s === 'flagged' ? '\n\nHeads up: it’s flagged for an update: “' + flagNote(r) + '”' : s === 'draft' ? '\n\nThis one is still a draft with no steps. Tell me how it’s done and I’ll write it down.' : '');
        });
      });
    });
  }

  function outOfDate(ctx) {
    return ctx.invoke('library_status', {}, 'Out of date').then(function () { return state(ctx); }).then(function (list) {
      var order = function (r) { var s = reviewState(r); return s === 'flagged' ? -1e6 : s === 'unreviewed' ? -5e5 : daysLeft(nextReview(r.fields)); };
      var late = list.filter(function (r) { return ['flagged', 'stale', 'unreviewed'].indexOf(reviewState(r)) >= 0; }).sort(function (a, b) { return order(a) - order(b); });
      var soon = list.filter(function (r) { return reviewState(r) === 'soon'; }).sort(function (a, b) { return order(a) - order(b); });
      if (!late.length && !soon.length) return 'Every procedure is current. The next review is ' + niceDate(list.map(function (r) { return nextReview(r.fields); }).filter(Boolean).sort()[0]) + '.';
      var line = function (r) {
        var s = reviewState(r), next = nextReview(r.fields);
        return '- **' + r.fields.title + '** (' + (r.fields.owner || 'no owner') + '): ' +
          (s === 'flagged' ? 'flagged, “' + flagNote(r).replace(/[.\s]+$/, '') + '”' : s === 'stale' ? -daysLeft(next) + ' days past its review' : 'never reviewed') + '.';
      };
      // Kept short: a reply taller than the conversation stops it following later turns.
      return (late.length ? late.length + (late.length === 1 ? ' procedure is' : ' procedures are') + ' out of date, most urgent first:\n' + late.map(line).join('\n') : 'Nothing is out of date.') +
        (soon.length ? '\n\nDue for review within 30 days: ' + soon.map(function (r) { return r.fields.title.toLowerCase() + ' (' + niceDate(nextReview(r.fields)).replace(/, \d{4}$/, '') + ')'; }).join(' and ') + '.' : '') +
        (late[0] && reviewState(late[0]) === 'flagged' ? ' I’d start with the ' + late[0].fields.title.toLowerCase() + '; in Gezel the copywriter can redraft its steps for ' + (late[0].fields.owner || 'its owner') + ' to check.' : '');
    });
  }

  function reviewed(ctx, text) {
    return state(ctx).then(function (list) {
      var r = find(list, text);
      if (!r) return 'Which procedure was checked? Name it, like “Luis went through the grinder deep clean”.';
      var who = (text.match(/^([A-Z][a-z]+)\b/) || [])[1];
      return ctx.invoke('mark_reviewed', { id: r.id, note: (who ? who + ' checked it' : 'Checked') + '; still right.' }, r.fields.title).then(function () { return state(ctx); }).then(function (after) {
        var now = after.find(function (x) { return x.id === r.id; });
        var left = after.filter(function (x) { return ['flagged', 'stale', 'unreviewed'].indexOf(reviewState(x)) >= 0; });
        return 'Marked **' + r.fields.title + '** reviewed today' + (who ? ', checked by ' + who : '') + '. Its next review is ' + niceDate(nextReview(now.fields)) + '. ' +
          (left.length ? 'That leaves ' + left.length + ' out of date: ' + left.map(function (x) { return x.fields.title.toLowerCase(); }).join(' and ') + '.' : 'Nothing else is out of date.');
      });
    });
  }

  function changed(ctx, text) {
    return state(ctx).then(function (list) {
      var r = find(list, text);
      if (!r) return 'Which procedure changed? Name it, like “the cash drop changed”.';
      var note = text.replace(/^[^:]*:\s*/, '').trim();
      note = cap(note).replace(/[.\s]*$/, '.');
      return ctx.invoke('flag_procedure', { id: r.id, note: note }, r.fields.title + ': needs update').then(function () { return ctx.read(r.fields.file); }).then(function (body) {
        var old = (note.match(/\bnot\s+([^,.;]+)/i) || [])[1];
        var lines = stepsOf(body), hit = old ? lines.find(function (l) { return l.toLowerCase().indexOf(old.trim().toLowerCase()) >= 0; }) : null;
        return 'Flagged **' + r.fields.title + '** for an update: “' + note.replace(/\.$/, '') + '.”' +
          (hit ? ' Step ' + (hit.match(/^(\d+)/) || [])[1] + ' still says “' + hit.replace(/^\d+[.)]\s*/, '').replace(/[.\s]+$/, '') + '”, so anyone reading it today would get it wrong.' : '') +
          ' Want me to rewrite it? In Gezel I’d save the new steps and ' + (r.fields.owner || 'its owner') + ' could check them.';
      });
    });
  }

  function gerund(phrase) {
    var words = phrase.trim().split(/\s+/), verb = words[0].toLowerCase();
    if (/ing$/.test(verb)) return cap(phrase.trim());
    verb = DOUBLED.indexOf(verb) >= 0 ? verb + verb.slice(-1) + 'ing' : /[^e]e$/.test(verb) ? verb.slice(0, -1) + 'ing' : verb + 'ing';
    return cap([verb].concat(words.slice(1)).join(' '));
  }
  function written(ctx, text) {
    var m = text.match(/\b(?:write down|write up|document)\s+(?:how\s+(?:we|to|you)\s+)?([^:]+):\s*(.+)$/i);
    if (!m) return Promise.resolve('Tell me the job and its steps, like “write down how we take a catering order: get the date and headcount, check the allergen binder, take a deposit”.');
    var title = gerund(m[1]);
    var steps = m[2].split(/\s*(?:,|;|\bthen\b)\s*/i).map(function (s) { return s.replace(/^(and|then)\s+/i, '').trim(); }).filter(Boolean);
    var lower = text.toLowerCase();
    var area = /order|customer|phone|catering|complaint|refund/.test(lower) ? 'customers' : /clean|wipe|wash|sanitiz/.test(lower) ? 'cleaning' : /open/.test(lower) ? 'opening' : /clos/.test(lower) ? 'closing' : /cash|till|safe|money/.test(lower) ? 'money' : /deliver|stock|supplies/.test(lower) ? 'stock' : /allerg|burn|first aid|safety|fire/.test(lower) ? 'safety' : /staff|hire|starter|shift/.test(lower) ? 'people' : 'other';
    var body = steps.map(function (s, i) { return (i + 1) + '. ' + cap(s).replace(/[.\s]*$/, '.'); }).join('\n');
    return ctx.invoke('save_procedure', { title: title, area: area, steps: body }, title).then(function () { return state(ctx); }).then(function (list) {
      var r = list.find(function (x) { return x.fields.title === title; });
      return 'Filed **' + title + '** under ' + cap(area) + ' as ' + steps.length + ' numbered steps' + (r ? ', in ' + r.fields.file : '') + '. It counts as reviewed today, so it’s due for its first check in six months. Who owns it? Tell me and I’ll put their name on it.';
    });
  }

  function owner(ctx, text) {
    return state(ctx).then(function (list) {
      var r = find(list, text);
      if (!r) return 'Which procedure? Name it and I’ll tell you who keeps it right.';
      return '**' + r.fields.title + '** belongs to ' + (r.fields.owner || 'nobody yet') + (r.fields.lastReviewedAt ? '; it was last checked ' + niceDate(r.fields.lastReviewedAt) + '.' : '.');
    });
  }

  function shelf(ctx) {
    return ctx.invoke('list_procedures', {}, 'Whole library').then(function () { return state(ctx); }).then(function (list) {
      var areas = [];
      list.forEach(function (r) { if (areas.indexOf(r.fields.area) < 0) areas.push(r.fields.area); });
      return 'The library holds ' + list.length + ' procedures in ' + areas.length + ' areas:\n' + areas.map(function (a) {
        return '- **' + cap(a || 'other') + '**: ' + list.filter(function (r) { return r.fields.area === a; }).map(function (r) { return r.fields.title; }).join(', ');
      }).join('\n');
    });
  }

  return {
    name: 'Eva',
    role: 'Librarian',
    greeting: 'Hello, I’m Eva. I keep Harbor Street Café’s procedures filed and current. The first-aid steps are flagged for an update, and the cash drop and the grinder deep clean are past their review dates.',
    suggestions: [
      'How do I close the espresso machine?',
      'Which procedures are out of date?',
      'Luis went through the grinder deep clean, it’s still right',
      'The cash drop changed: Priya counts the safe at 3 pm now, not 5 pm',
      'Write down how we take a catering order: get the date and headcount, check the allergen binder, take a 50% deposit, confirm by email',
    ],
    respond: function (text, ctx) {
      var lower = text.toLowerCase();
      if (/\b(write down|write up|document)\b/.test(lower)) return written(ctx, text);
      if (/\b(changed|no longer|moved|is wrong|isn’t right|isn't right)\b/.test(lower)) return changed(ctx, text);
      if (/\b(went through|checked|reviewed|still right|still accurate|looked over)\b/.test(lower)) return reviewed(ctx, text);
      if (/\b(out of date|stale|overdue|review|reviews|attention|flagged)\b/.test(lower)) return outOfDate(ctx);
      if (/\b(who|owner|owns)\b/.test(lower)) return owner(ctx, text);
      if (/\b(how do|how to|how should|how does|what do i do|where is|what's the procedure|what is the procedure)\b/.test(lower)) return howTo(ctx, text);
      if (/\b(what procedures|which procedures|list|areas|library)\b/.test(lower)) return shelf(ctx);
      return null;
    },
    reactions: {
      page_mark_reviewed: function (input, output) {
        return output && output.summary ? dates(output.summary.split('. ')[0]) + '. I’ll flag it again when that comes around.' : 'Marked reviewed.';
      },
      page_flag_procedure: function (input, output) {
        return output && output.summary ? dates(output.summary.split('. ')[0]) + '. Want me to redraft its steps with the person who does the job?' : 'Flagged.';
      },
      page_save_procedure: function (input) {
        return 'Filed ' + input.title + ' under ' + cap(String(input.area || 'other')) + '. Anyone can find it from How do I… now.';
      },
    },
  };
})();

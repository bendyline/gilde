// The standalone demo's sample conversation. In Gezel, the archivist's replies
// come from the model the person chooses; here they are scripted, and every
// change goes through the same tools the real crew member calls.
window.demoChat = (function () {
  'use strict';
  var YEAR = 365 * 24 * 60 * 60 * 1000;
  // Hardest first: these are the gaps worth raising gently, once.
  var WEIGHT = [/medical|directive|living will|proxy/, /\bwill\b/, /insurance/, /emergency/, /account/, /password/, /deed|title/];
  var HOW = {
    'medical directives': 'that usually means a living will and a healthcare proxy. Your doctor’s office or an estate attorney can point you to the forms your state uses.',
    'will': 'that starts with a conversation with an estate attorney, or a state-approved form for a simple one.',
    'emergency contacts': 'one page is enough: family first, then your doctor, your lawyer, and a neighbor with a key.',
    'pet care instructions': 'a short page covers it: food and amounts, the vet’s number, and who has agreed to take the pets.',
  };

  function name(r) { return (r.fields && r.fields.name) || r.id; }
  function lower(r) { return name(r).toLowerCase(); }
  function reviewedAt(r) { var f = r.fields || {}; return Date.parse(typeof f.reviewedAt === 'string' ? f.reviewedAt : r.updatedAt); }
  function isStale(r, now) { return r.status === 'present' && isFinite(reviewedAt(r)) && now - reviewedAt(r) > YEAR; }
  function date(ms) { return new Date(ms).toLocaleDateString('en-US', { month: 'long', year: 'numeric' }); }
  function list(names) {
    if (names.length < 2) return names.join('');
    return names.slice(0, -1).join(', ') + (names.length > 2 ? ',' : '') + ' and ' + names[names.length - 1];
  }
  function whenFound(r) { return /s$/.test(lower(r)) ? 'When they turn up, tell me where they live.' : 'When it turns up, tell me where it lives.'; }
  function capitalize(text) { return text.charAt(0).toUpperCase() + text.slice(1); }
  function lowerFirst(text) { return text.charAt(0).toLowerCase() + text.slice(1); }
  function records(ctx) {
    return ctx.read('documents.json').then(function (doc) { return (doc && doc.records) || []; });
  }
  function shape(all) {
    var now = Date.now();
    return {
      all: all,
      present: all.filter(function (r) { return r.status === 'present'; }),
      missing: all.filter(function (r) { return r.status !== 'present'; }),
      stale: all.filter(function (r) { return isStale(r, now); }),
    };
  }
  function weight(r) {
    var at = WEIGHT.findIndex(function (re) { return re.test(lower(r)); });
    return at < 0 ? WEIGHT.length : at;
  }
  // The document whose name shares the most words with what the person said.
  function match(all, text) {
    var said = text.toLowerCase();
    var best = null, score = 0;
    all.forEach(function (r) {
      var words = lower(r).split(/\s+/).filter(function (w) { return w.length > 2 && w !== 'and'; });
      var hits = words.filter(function (w) { return said.indexOf(w.replace(/s$/, '')) >= 0; }).length;
      var value = said.indexOf(lower(r)) >= 0 ? 100 : hits / Math.max(1, words.length);
      if (hits && value >= 0.5 && value > score) { best = r; score = value; }
    });
    return best;
  }

  function stand(ctx) {
    return ctx.invoke('binder_status', {}, 'Completeness check').then(function () { return records(ctx); }).then(function (all) {
      var s = shape(all);
      if (!all.length) return 'The checklist is empty. Tell me about one document you know exists, and where the original lives.';
      var findable = s.present.filter(function (r) { return !isStale(r, Date.now()); }).map(lower);
      return [
        '**' + s.present.length + ' of ' + all.length + ' are in place.**',
        s.missing.length ? 'Missing: ' + list(s.missing.map(lower)) + '.' : 'Nothing is missing.',
        s.stale.length ? 'Due a review: ' + list(s.stale.map(lower)) + ', each last confirmed over a year ago.' : '',
        'Against the one-page test: a trusted person could find ' + (findable.length ? 'the ' + list(findable.slice(0, 3)) : 'very little') +
          ' today' + (s.missing.length ? ', but not the ' + lower(s.missing.slice().sort(function (a, b) { return weight(a) - weight(b); })[0]) + '.' : '.'),
      ].filter(Boolean).join('\n\n');
    });
  }

  function next(ctx) {
    return records(ctx).then(function (all) {
      var s = shape(all);
      if (!s.missing.length && !s.stale.length) return 'Nothing is missing and nothing is stale. The binder passes the one-page test. Next year’s review is the only thing on the list.';
      if (!s.missing.length) return 'Nothing is missing. The ' + lower(s.stale[0]) + ' is due a review; when you’ve looked it over, tell me and I’ll mark it current.';
      var gap = s.missing.slice().sort(function (a, b) { return weight(a) - weight(b); })[0];
      var how = HOW[lower(gap)] || 'tell me where the original will live once you have it, and I’ll record it.';
      return 'The binder has no ' + lower(gap) + ' recorded. When you’re ready, ' + how + '\n\nNo rush from me. Once it exists, just tell me where it’s kept.';
    });
  }

  function placeIn(text) {
    var match = text.match(/\b(?:is|are|lives|live|sits|sit|stays|stay|kept|stored|goes|go)\s+((?:kept\s+|stored\s+|now\s+)?(?:in|at|on|inside|under|with|taped|behind|in the|by)\b.+)$/i);
    return match ? capitalize(match[1].replace(/^(kept|stored|now)\s+/i, '').replace(/[.!]+$/, '').trim()) : '';
  }

  function record(ctx, text) {
    return records(ctx).then(function (all) {
      var colon = text.match(/^(?:please\s+)?(?:add|record)\s+(?:the\s+|our\s+|my\s+)?(.+?)\s*[:\-–]\s*(.+)$/i);
      var found = match(all, colon ? colon[1] : text);
      var location = colon ? capitalize(colon[2].replace(/[.!]+$/, '').trim()) : placeIn(text);
      var label = found ? name(found)
        : capitalize((colon ? colon[1] : text.split(/\s+(?:is|are|lives|sits|stays)\s+/i)[0]).replace(/^(the|our|my|a|an)\s+/i, '').replace(/[.!?]+$/, '').trim());
      if (!label) return null;
      if (!location) return 'Where does the original of the ' + label.toLowerCase() + ' live? A drawer, a box, a person: that’s all I record.';
      var wasMissing = found && found.status !== 'present';
      return ctx.invoke('record_document', { name: label, location: location }, label + ': ' + lowerFirst(location)).then(function () {
        return records(ctx);
      }).then(function (after) {
        var s = shape(after);
        return 'Recorded the ' + label.toLowerCase() + ': ' + lowerFirst(location) + '. ' +
          (wasMissing ? 'That closes a gap. ' : found ? '' : 'It’s a new line on the checklist. ') +
          '**' + s.present.length + ' of ' + after.length + '** are in place now.';
      });
    });
  }

  function reviewed(ctx, text) {
    return records(ctx).then(function (all) {
      var r = match(all, text);
      if (!r) return 'Which document did you look over? Name it, like “I reviewed the home insurance”.';
      if (r.status !== 'present') return 'The binder lists the ' + lower(r) + ' as missing. Tell me where the original lives and I’ll record it as in place.';
      return ctx.invoke('mark_reviewed', { id: r.id }, name(r)).then(function () {
        return 'Marked the ' + lower(r) + ' current. I’ll suggest the next look around **' + date(Date.now() + YEAR) + '**.';
      });
    });
  }

  function missing(ctx, text) {
    return records(ctx).then(function (all) {
      var r = match(all, text);
      if (!r) return null;
      if (r.status !== 'present') return 'The ' + lower(r) + ' ' + (/s$/.test(lower(r)) ? 'are' : 'is') + ' already marked as a gap. ' + whenFound(r);
      return ctx.invoke('mark_missing', { id: r.id }, name(r)).then(function () {
        return 'Marked the ' + lower(r) + ' as a gap, so nobody goes looking in the wrong place. ' + whenFound(r);
      });
    });
  }

  function where(ctx, text) {
    return records(ctx).then(function (all) {
      var r = match(all, text);
      if (!r) return null;
      var f = r.fields || {};
      if (r.status !== 'present' || !f.location) return 'The binder has no location for the ' + lower(r) + ' yet. When you know, tell me and I’ll record it.';
      return 'The ' + lower(r) + ': **' + lowerFirst(f.location) + '**.' + (f.note ? ' ' + f.note : '');
    });
  }

  return {
    name: 'Lotte',
    role: 'Archivist',
    greeting: 'Hello, I’m Lotte. I keep track of which papers exist and where the originals live, never what they say. Three gaps are open, and two policies are due a look.',
    suggestions: [
      'How does the binder stand?',
      'The emergency contacts list is taped inside the pantry door',
      'I reviewed the home insurance today',
      'Add the kids’ birth certificates: filing cabinet, bottom drawer',
      'What should we tackle next?',
    ],
    respond: function (text, ctx) {
      var said = text.toLowerCase();
      if (/\bwhere\b/.test(said) && /\?$|^where/.test(said.trim())) return where(ctx, text);
      if (/\b(reviewed|looked over|checked|confirmed|went through|re-read|reread)\b/.test(said)) return reviewed(ctx, text);
      if (/\b(lost|can't find|cannot find|can’t find|threw out|shredded|don't have|don’t have)\b/.test(said)) return missing(ctx, text);
      if (/^(please\s+)?(add|record)\b/.test(said) || /\b(is|are|lives|sits|stays)\s+((kept|stored|now)\s+)?(in|at|on|inside|under|with|taped|behind)\b/.test(said)) return record(ctx, text);
      if (/\b(next|tackle|start|first|priority|missing|gaps?)\b/.test(said)) return next(ctx);
      if (/\b(stand|status|complete|how are we|how's the binder|how is the binder|one-page|overview|in place|stale)\b/.test(said)) return stand(ctx);
      return null;
    },
    reactions: {
      page_record_document: function (input, output, ctx) {
        return records(ctx).then(function (all) {
          var s = shape(all);
          return 'Recorded the ' + String(input.name).toLowerCase() + (input.location ? ': ' + lowerFirst(String(input.location)) : '') + '. ' +
            s.present.length + ' of ' + all.length + ' are in place.';
        });
      },
      page_mark_reviewed: function (input, output, ctx) {
        return records(ctx).then(function (all) {
          var r = all.find(function (x) { return x.id === input.id; });
          return r ? 'Marked the ' + lower(r) + ' current. Next look around ' + date(Date.now() + YEAR) + '.' : null;
        });
      },
      page_mark_missing: function (input, output, ctx) {
        return records(ctx).then(function (all) {
          var r = all.find(function (x) { return x.id === input.id; });
          return r ? 'Marked the ' + lower(r) + ' as a gap. No rush. ' + whenFound(r) : null;
        });
      },
    },
  };
})();

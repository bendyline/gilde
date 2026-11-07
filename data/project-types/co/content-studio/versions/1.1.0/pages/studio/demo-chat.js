// The standalone demo's sample conversation. In Gezel, the managing
// editor's replies come from the model the person chooses; here they are
// scripted, and every change goes through the same tools the crew calls.
window.demoChat = (function () {
  'use strict';
  var DAY = 86400000;
  var WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  var NUMBERS = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6 };
  // Angles for the sample's pricing post; in Gezel the copywriter drafts them from the post itself.
  var ANGLES = {
    'how we price brand projects': 'Why we quote a fixed fee, not hours | What a day rate hides from clients | The one question we ask before we price',
  };

  function pad(n) { return n < 10 ? '0' + n : String(n); }
  function iso(ms) { var d = new Date(ms); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function today() { return iso(Date.now()); }
  function addDays(day, n) { var d = new Date(String(day).slice(0, 10) + 'T12:00:00'); d.setDate(d.getDate() + n); return iso(d.getTime()); }
  function daysLeft(day) { return Math.round((Date.parse(String(day).slice(0, 10) + 'T00:00:00') - Date.parse(today() + 'T00:00:00')) / DAY); }
  function nice(day) { return new Date(String(day).slice(0, 10) + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }); }
  function when(d) { return d < 0 ? -d + (d === -1 ? ' day late' : ' days late') : d === 0 ? 'today' : d === 1 ? 'tomorrow' : 'in ' + d + ' days'; }
  function label(format) { return String(format || 'article').replace(/-/g, ' '); }

  function state(ctx) {
    return Promise.all([ctx.read('pieces.json'), ctx.read('calendar.json')]).then(function (v) {
      return { pieces: (v[0] && v[0].records) || [], spinoffs: (v[1] && v[1].records) || [] };
    });
  }
  // The piece the person means: the one whose title shares the most words with what they wrote.
  function find(s, text) {
    var stop = ['the', 'and', 'our', 'for', 'with', 'into', 'post', 'posts', 'piece', 'turn', 'push', 'ready', 'design', 'newsletter', 'three', 'friday', 'monday', 'tuesday', 'wednesday', 'thursday', 'saturday', 'sunday', 'published', 'assign', 'give'];
    var words = (text.toLowerCase().match(/[a-zé]{3,}/g) || []).filter(function (w) { return stop.indexOf(w) < 0; });
    var best = null, score = 0;
    s.pieces.forEach(function (p) {
      var title = p.fields.title.toLowerCase();
      var hits = words.filter(function (w) { var root = w.replace(/(ing|es|s)$/, ''); return title.indexOf(w) >= 0 || (root.length > 3 && title.indexOf(root) >= 0); }).length;
      if (hits > score) { best = p; score = hits; }
    });
    return best;
  }
  function spinOf(s, p) { return s.spinoffs.filter(function (x) { return x.fields.pieceId === p.id; }); }

  function repurpose(ctx, text) {
    var lower = text.toLowerCase();
    var asks = [];
    if (/newsletter/.test(lower)) asks.push({ format: 'newsletter', count: 1, channel: 'Studio newsletter' });
    var posts = lower.match(/\b(\d+|one|two|three|four|five|six|a)\s+(?:social\s+|linkedin\s+)?posts?\b/);
    if (posts || /social/.test(lower)) asks.push({ format: 'social-post', count: posts ? NUMBERS[posts[1]] || Number(posts[1]) || 1 : 3, channel: /instagram/.test(lower) ? 'Instagram' : 'LinkedIn' });
    if (/chapters/.test(lower)) asks.push({ format: 'video-chapters', count: 1, channel: 'YouTube' });
    if (/\b(reels?|shorts?|short videos?|clips?)\b/.test(lower)) asks.push({ format: 'short-video', count: 1, channel: 'Instagram' });
    if (/quote cards?/.test(lower)) asks.push({ format: 'quote-card', count: 1, channel: 'Instagram' });
    return state(ctx).then(function (s) {
      var piece = find(s, text);
      if (!piece) return 'Which piece should I repurpose? Name it, like “turn the pricing post into a newsletter”.';
      if (!asks.length) return 'Into what? A newsletter, social posts, video chapters or a short video are all on the menu.';
      return asks.reduce(function (chain, a) {
        return chain.then(function () {
          var input = { id: piece.id, format: a.format, count: a.count, channel: a.channel };
          if (a.format === 'social-post' && ANGLES[piece.fields.title.toLowerCase()]) input.angle = ANGLES[piece.fields.title.toLowerCase()];
          return ctx.invoke('repurpose_piece', input, label(a.format) + (a.count > 1 ? ' × ' + a.count : ''));
        });
      }, Promise.resolve()).then(function () { return state(ctx); }).then(function (after) {
        var mine = spinOf(after, piece).filter(function (x) { return x.status !== 'published'; }).sort(function (a, b) { return a.fields.publishAt.localeCompare(b.fields.publishAt); });
        return 'Planned for **' + piece.fields.title + '**, dated after it went out:\n' +
          mine.map(function (x) { return '- **' + nice(x.fields.publishAt) + '**: ' + x.fields.title.split(':')[0] + (x.fields.channel ? ' on ' + x.fields.channel : '') + (x.fields.angle ? ', “' + x.fields.angle + '”' : '') + (x.fields.assignee ? ' (' + x.fields.assignee + ')' : ''); }).join('\n') +
          '\n\n' + (piece.fields.assignee ? 'They’re with ' + piece.fields.assignee + ', who made the piece, for now. ' : '') +
          'In Gezel the copywriter drafts each one from the published piece, so every figure matches what the piece actually says.';
      });
    });
  }

  function spinFormatIn(text) {
    var lower = text.toLowerCase();
    if (/newsletter/.test(lower)) return 'newsletter';
    if (/quote cards?/.test(lower)) return 'quote-card';
    if (/chapters/.test(lower)) return 'video-chapters';
    if (/\b(reels?|shorts?|short videos?)\b/.test(lower)) return 'short-video';
    if (/\bposts?\b/.test(lower)) return 'social-post';
    return null;
  }
  function spinStageIn(text) {
    var lower = text.toLowerCase();
    if (/\b(drafted|written)\b/.test(lower)) return 'drafted';
    if (/\bscheduled\b/.test(lower)) return 'scheduled';
    if (/\b(published|posted|sent|went out|is out|went live|is live)\b/.test(lower)) return 'published';
    return null;
  }

  function spinoffUpdate(ctx, text) {
    var format = spinFormatIn(text), status = spinStageIn(text);
    return state(ctx).then(function (s) {
      var piece = find(s, text);
      var mine = s.spinoffs.filter(function (x) { return x.fields.format === format && (!piece || x.fields.pieceId === piece.id); });
      var number = (text.match(/\b(?:post|card|video)\s*(\d)\b/i) || [])[1];
      var pick = number ? mine.find(function (x) { return new RegExp('\\b' + number + ':').test(x.fields.title); }) : mine.filter(function (x) { return x.status !== status && x.status !== 'published'; })[0];
      if (!pick) return 'I couldn’t find that ' + label(format) + (piece ? ' for ' + piece.fields.title : '') + '. Name the piece it belongs to, like “the pricing newsletter is drafted”.';
      return ctx.invoke('update_spinoff', { id: pick.id, status: status }, pick.fields.title.split(':')[0] + ': ' + status).then(function () {
        return 'Marked the ' + pick.fields.title.split(':')[0].toLowerCase() + ' for ' + pick.fields.title.split(': ').slice(1).join(': ') + ' as ' + status + '.' +
          (status !== 'published' && pick.fields.publishAt ? ' It goes out ' + nice(pick.fields.publishAt) + ', ' + when(daysLeft(pick.fields.publishAt)) + '.' : '');
      });
    });
  }

  function publishing(ctx, days) {
    return ctx.invoke('studio_status', { withinDays: days }, 'Next ' + days + ' days').then(function () { return state(ctx); }).then(function (s) {
      var items = [];
      s.pieces.forEach(function (p) { if (p.status !== 'published' && p.fields.publishAt) items.push({ day: p.fields.publishAt, text: '**' + p.fields.title + '** publishes (' + p.status + ', ' + (p.fields.assignee || 'unassigned') + ')' }); });
      s.spinoffs.forEach(function (x) { if (x.status !== 'published' && x.fields.publishAt) items.push({ day: x.fields.publishAt, text: x.fields.title.split(':')[0] + ' for ' + (s.pieces.find(function (p) { return p.id === x.fields.pieceId; }) || { fields: { title: 'a piece' } }).fields.title + (x.fields.channel ? ' on ' + x.fields.channel : '') + ' (' + x.status + ')' }); });
      items = items.filter(function (i) { return daysLeft(i.day) <= days; }).sort(function (a, b) { return a.day.localeCompare(b.day); });
      if (!items.length) return 'Nothing is dated in the next ' + days + ' days.';
      var late = items.filter(function (i) { return daysLeft(i.day) < 0; });
      return 'Late first, then the next ' + days + ' days:\n' + items.map(function (i) { var d = daysLeft(i.day); return '- ' + (d < 0 ? '**' + when(d) + '**' : nice(i.day)) + ': ' + i.text; }).join('\n') +
        (late.length ? '\n\nThe late item is the one to unblock today; tell me its new date and I’ll move it.' : '');
    });
  }

  function stageIn(text) {
    var lower = text.toLowerCase();
    if (/\b(published|is live|went live|went out|is out)\b/.test(lower)) return 'published';
    if (/\bdesign\b/.test(lower)) return 'design';
    if (/\b(edit|editing|review)\b/.test(lower)) return 'edit';
    if (/\bdraft(ed|ing)?\b/.test(lower)) return 'draft';
    if (/\bbrief\b/.test(lower)) return 'brief';
    return null;
  }

  function move(ctx, text) {
    var status = stageIn(text);
    return state(ctx).then(function (s) {
      var piece = find(s, text);
      if (!piece) return 'Which piece moved? Name it and I’ll move it on the board.';
      if (!status) return 'Where is ' + piece.fields.title + ' now: brief, draft, edit, design or published?';
      var was = piece.status;
      return ctx.invoke('update_piece', { id: piece.id, status: status }, piece.fields.title + ': ' + status).then(function () { return state(ctx); }).then(function (after) {
        var p = after.pieces.find(function (x) { return x.id === piece.id; });
        if (status === 'published') {
          return 'Moved **' + p.fields.title + '** to published. It has ' + (spinOf(after, p).length ? spinOf(after, p).length + ' spin-offs planned' : 'nothing repurposed yet') + '; say “' + (/video|podcast/.test(p.fields.format) ? 'turn it into video chapters and a short video' : 'turn it into a newsletter and three posts') + '” and I’ll put them on the calendar.';
        }
        var d = p.fields.publishAt ? daysLeft(p.fields.publishAt) : null;
        return 'Moved **' + p.fields.title + '** from ' + was + ' to ' + status + '. ' + (d === null ? 'It has no publish date yet.' : 'It still publishes ' + nice(p.fields.publishAt) + ', ' + when(d) + ', so ' + status + ' has ' + Math.max(0, d) + (d === 1 ? ' day.' : ' days.'));
      });
    });
  }

  function push(ctx, text) {
    var lower = text.toLowerCase();
    return state(ctx).then(function (s) {
      var piece = find(s, text);
      if (!piece) return 'Which piece should move? Name it and the new day.';
      var input = { id: piece.id };
      var weekday = WEEKDAYS.find(function (w) { return lower.indexOf(w) >= 0; });
      var shift = lower.match(/\b(?:by|back|out)?\s*(\d+|a|one|two|three)\s+(day|week)s?\b/);
      if (weekday) { var dow = new Date(today() + 'T12:00:00').getDay(); input.publishAt = addDays(today(), ((WEEKDAYS.indexOf(weekday) - dow + 6) % 7) + 1); }
      else if (shift) input.shiftDays = (shift[1] === 'a' ? 1 : NUMBERS[shift[1]] || Number(shift[1])) * (shift[2] === 'week' ? 7 : 1);
      else return 'To when? A day like “Friday” or “a week later” is enough.';
      var before = piece.fields.publishAt;
      return ctx.invoke('update_piece', input, piece.fields.title + ': new date').then(function () { return state(ctx); }).then(function (after) {
        var p = after.pieces.find(function (x) { return x.id === piece.id; }), day = p.fields.publishAt;
        var same = after.pieces.filter(function (x) { return x.id !== p.id && x.status !== 'published' && x.fields.publishAt === day; });
        return 'Moved **' + p.fields.title + '** to ' + nice(day) + ', ' + when(daysLeft(day)) + (before && daysLeft(before) < 0 ? '; it’s no longer late' : '') + '. ' +
          (same.length ? same[0].fields.title + ' also publishes that day, so one of them may want to slide.' : 'Nothing else publishes that day.');
      });
    });
  }

  function people(ctx) {
    return ctx.invoke('studio_status', {}, 'Who has what').then(function () { return state(ctx); }).then(function (s) {
      var load = {};
      s.pieces.forEach(function (p) { if (p.status !== 'published') (load[p.fields.assignee || 'Unassigned'] = load[p.fields.assignee || 'Unassigned'] || []).push(p.fields.title + ' (' + p.status + ')'); });
      s.spinoffs.forEach(function (x) { if (x.status !== 'published' && x.fields.assignee) (load[x.fields.assignee] = load[x.fields.assignee] || []).push(x.fields.title.split(':')[0].toLowerCase() + ' (' + x.status + ')'); });
      var names = Object.keys(load).filter(function (n) { return n !== 'Unassigned'; }).sort(function (a, b) { return load[b].length - load[a].length; });
      if (!names.length) return 'Nobody has open work right now.';
      var lightest = names[names.length - 1];
      return names.map(function (n) { return '- **' + n + '**, ' + load[n].length + ': ' + load[n].join(', '); }).join('\n') +
        (load.Unassigned ? '\n- Unassigned: ' + load.Unassigned.join(', ') : '') +
        '\n\n' + (names.length > 1 && load[names[0]].length > load[lightest].length ? names[0] + ' is carrying the most. ' + lightest + ' has the most room' + (load.Unassigned ? ', so the unassigned piece could go there.' : '.') : 'The load is even.');
    });
  }

  function addPiece(ctx, text) {
    var m = text.match(/\b(?:on|about)\s+(.+?)(?=\s+for\s+(?:next|this)\b|\s+(?:next|this)\s+(?:week|month)\b|[,.;]|$)/i);
    var title = m ? m[1].trim().replace(/^./, function (c) { return c.toUpperCase(); }) : '';
    if (!title) return Promise.resolve('What’s the piece about? “Add a piece on onboarding new clients” is enough.');
    var lower = text.toLowerCase();
    var format = /case study/.test(lower) ? 'case-study' : /\bguide\b/.test(lower) ? 'guide' : /interview/.test(lower) ? 'interview' : /video/.test(lower) ? 'video' : /essay/.test(lower) ? 'essay' : 'article';
    var input = { title: title, format: format, status: 'idea' };
    if (/next month/.test(lower)) input.publishAt = addDays(today(), 30);
    else if (/next week/.test(lower)) input.publishAt = addDays(today(), 7);
    return ctx.invoke('add_piece', input, title).then(function () {
      return 'Added **' + title + '** as an ' + label(format) + ' idea' + (input.publishAt ? ', aiming for ' + nice(input.publishAt) : '') + '. Who should write it? Tell me and I’ll put their name on it.';
    });
  }

  function assign(ctx, text) {
    var who = (text.match(/\bto\s+([A-Z][a-z]+)\b/) || [])[1];
    return state(ctx).then(function (s) {
      var piece = find(s, text);
      if (!piece || !who) return 'Who should take which piece? “Give the spec-work essay to Maya” is enough.';
      return ctx.invoke('update_piece', { id: piece.id, assignee: who }, piece.fields.title + ': ' + who).then(function () {
        return '**' + piece.fields.title + '** is with ' + who + ' now' + (piece.fields.assignee && piece.fields.assignee !== who ? ', instead of ' + piece.fields.assignee : '') + '.';
      });
    });
  }

  return {
    name: 'Fleur',
    role: 'Managing Editor',
    greeting: 'Hello, I’m Fleur. The studio tour video is a day late in design, and the Harbor Street Café case study publishes in 5 days. The pricing post went out last week and hasn’t been repurposed yet.',
    suggestions: [
      'Turn the pricing post into a newsletter and three posts',
      'What’s publishing in the next two weeks?',
      'The café case study is ready for design',
      'Push the studio tour video to Friday',
      'Who’s carrying the most right now?',
    ],
    respond: function (text, ctx) {
      var lower = text.toLowerCase();
      if (/\b(turn|repurpose|spin|cut)\b/.test(lower) && /\b(newsletter|posts?|social|chapters|reels?|shorts?|quote)\b/.test(lower)) return repurpose(ctx, text);
      if (/\b(push|move|slide|delay|bring forward)\b/.test(lower) && (WEEKDAYS.some(function (w) { return lower.indexOf(w) >= 0; }) || /\b(day|week)s?\b/.test(lower))) return push(ctx, text);
      if (/\b(assign|give|hand)\b/.test(lower) && /\bto\s+[a-z]+/i.test(text)) return assign(ctx, text);
      if (/\b(pitch|add|new piece)\b/.test(lower) && /\b(on|about)\b/.test(lower)) return addPiece(ctx, text);
      if (/\b(who|carrying|load|busiest|assignments?)\b/.test(lower)) return people(ctx);
      if (/\b(publishing|coming up|due|calendar|next (two )?weeks?|late)\b/.test(lower) && !stageIn(text)) return publishing(ctx, /\bweek\b/.test(lower) && !/two weeks/.test(lower) ? 7 : 14);
      if (spinFormatIn(text) && spinStageIn(text)) return spinoffUpdate(ctx, text);
      if (stageIn(text) && /\b(ready|moved?|is|went|now|in|to|published)\b/.test(lower)) return move(ctx, text);
      return null;
    },
    reactions: {
      page_update_piece: function (input, output, ctx) {
        return state(ctx).then(function (s) {
          var p = s.pieces.find(function (x) { return x.id === input.id; });
          if (!p) return 'Moved.';
          if (p.status === 'published') return 'Published: ' + p.fields.title + '. ' + (spinOf(s, p).length ? 'Its spin-offs are on the calendar.' : 'Next it needs its newsletter and social posts; ask me and I’ll plan them.');
          return 'Moved ' + p.fields.title + ' to ' + p.status + (p.fields.publishAt ? '; it publishes ' + nice(p.fields.publishAt) + '.' : '.');
        });
      },
      page_add_piece: function (input) {
        return 'On the board: ' + input.title + (input.publishAt ? ', publishing ' + nice(input.publishAt) : '') + '.' + (input.assignee ? '' : ' Who should write it?');
      },
      page_repurpose_piece: function (input, output) {
        return output && output.summary ? output.summary.split('. ')[0] + '. They’re on the calendar.' : 'Planned.';
      },
      page_update_spinoff: function (input, output) {
        return output && output.summary ? output.summary.split('. ')[0] + '.' : 'Moved.';
      },
    },
  };
})();

// The standalone demo's sample conversation. In Gezel, the social media
// writer's replies come from the model the person chooses; here they are
// scripted, and every change goes through the same post tools the real crew
// member calls.
window.demoChat = (function () {
  'use strict';
  var DAY = 24 * 60 * 60 * 1000;
  var LIMITS = { bluesky: 300, x: 280, instagram: 2200, linkedin: 3000 };
  var NAMES = { instagram: 'Instagram', bluesky: 'Bluesky', x: 'X', linkedin: 'LinkedIn' };
  var WORDS = ['No', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven'];
  // Captions the writer would draft for the sample posts, in the feed's voice.
  var CAPTIONS = {
    'glaze-tests-week-33': {
      instagram: 'This week’s glaze tests, the misses included. The streaky one on the left was meant to be blue. We like it anyway.',
    },
    'the-saltpan-series': {
      bluesky: 'Six vessels, one bucket of coastal slip. The saltpan series is out of the kiln, and the whole set is sitting in the morning light.',
    },
  };

  var offered = null;

  function platform(name) { return NAMES[name] || name; }
  function stage(status) { return String(status).replace('-', ' '); }
  function count(n) { return WORDS[n] || String(n); }
  function today() { return new Date(Date.now()).toISOString().slice(0, 10); }
  function addDays(date, days) { return new Date(Date.parse(date + 'T12:00:00Z') + days * DAY).toISOString().slice(0, 10); }
  function dayName(date) {
    return new Date(String(date).slice(0, 10) + 'T12:00:00Z').toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric', timeZone: 'UTC' });
  }
  function perWeek(ctx) {
    var match = String((ctx.page.params || {}).cadence || '').match(/(\d+)/);
    return match ? Math.max(1, Number(match[1])) : 4;
  }
  function cadence(ctx) { return String((ctx.page.params || {}).cadence || '4 images a week'); }
  function and(items) { return items.length < 2 ? items.join('') : items.slice(0, -1).join(', ') + ' and ' + items[items.length - 1]; }
  function slugOf(id) { return String(id).replace(/^\d{4}-\d{2}-\d{2}-/, ''); }

  function posts(ctx) {
    return ctx.read('posts/index.json').then(function (index) { return (index && index.posts) || []; });
  }
  // A post the person named, by its title or a distinctive word from it; "it" means the last one we discussed.
  var last = null;
  function remember(post) { if (post && post.id) last = post.id; }
  function find(list, text) {
    var lower = String(text || '').toLowerCase();
    var exact = list.find(function (post) { return lower.indexOf(String(post.title || '').toLowerCase()) >= 0; });
    if (exact) return exact;
    var scored = list.map(function (post) {
      var words = String(post.title || '').toLowerCase().split(/[^a-z0-9]+/).filter(function (w) { return w.length > 3 && ['series', 'week', 'first', 'before', 'with'].indexOf(w) < 0; });
      return { post: post, hits: words.filter(function (w) { return lower.indexOf(w) >= 0; }).length };
    }).filter(function (s) { return s.hits; }).sort(function (a, b) { return b.hits - a.hits; });
    if (scored.length) return scored[0].post;
    if (last && /\b(it|this|that)\b/.test(lower)) return list.find(function (post) { return post.id === last; }) || null;
    return null;
  }
  // What a post still needs before it moves on: a picture, and a caption for each platform within its limit.
  function gaps(post) {
    var parts = [];
    var missing = (post.platforms || []).filter(function (p) { return !(post.variants || {})[p]; });
    var long = Object.keys(post.variants || {}).filter(function (p) { return LIMITS[p] && post.variants[p].charCount > LIMITS[p]; });
    if (!(post.media || []).length) parts.push('it has no picture yet');
    if (missing.length) parts.push('it targets ' + and(missing.map(platform)) + ' with no caption there yet');
    if (long.length) parts.push('its ' + and(long.map(platform)) + ' caption runs over the limit');
    return parts;
  }
  function details(ctx, list) {
    return list.reduce(function (chain, entry) {
      return chain.then(function (done) {
        return ctx.invoke('get_post', { id: entry.id }, entry.title).then(function (out) { return done.concat([out.post]); });
      });
    }, Promise.resolve([]));
  }

  function review(ctx) {
    return ctx.invoke('list_posts', {}, 'Whole pipeline').then(function () { return posts(ctx); }).then(function (list) {
      var waiting = list.filter(function (p) { return p.status === 'draft' || p.status === 'in-review'; });
      if (!waiting.length) return 'Nothing is in draft or review right now. The next move is turning an idea into a draft.';
      return details(ctx, waiting).then(function (full) {
        var lines = full.map(function (post) {
          var parts = gaps(post);
          var captions = Object.keys(post.variants || {}).map(function (p) { return platform(p) + ' ' + post.variants[p].charCount + ' characters'; });
          return '- **' + post.title + '** (' + stage(post.status) + '): ' + (parts.length
            ? parts.join(', and ') + '.'
            : 'picture in place, captions ready (' + and(captions) + '). ' + (post.status === 'in-review' ? 'Ready for you to approve.' : 'Ready to go to review.'));
        });
        return count(waiting.length) + (waiting.length === 1 ? ' post is' : ' posts are') + ' waiting on you:\n\n' + lines.join('\n');
      });
    });
  }

  function approve(ctx, text) {
    return posts(ctx).then(function (list) {
      var named = find(list, text);
      remember(named);
      if (named && named.status !== 'in-review') {
        if (named.status === 'draft' || named.status === 'idea') return '**' + named.title + '** is still ' + (named.status === 'idea' ? 'an idea' : 'a draft') + '. It goes to review before anyone approves it; ask me to send it to review once its captions and picture are in.';
        return '**' + named.title + '** is already ' + stage(named.status) + '.';
      }
      var inReview = named ? [named] : list.filter(function (p) { return p.status === 'in-review'; });
      if (!inReview.length) return 'Nothing is in review right now, so there’s nothing to approve. Drafts go to review first.';
      return details(ctx, inReview).then(function (full) {
        var ready = full.filter(function (post) { return !gaps(post).length; });
        if (!ready.length) return '**' + full[0].title + '** isn’t ready: ' + gaps(full[0]).join(', and ') + '. I’d rather hold it than approve something unfinished.';
        return ready.reduce(function (chain, post) {
          return chain.then(function () { return ctx.invoke('update_post', { id: post.id, status: 'approved' }, post.title + ': approved'); });
        }, Promise.resolve()).then(function () {
          remember(ready[ready.length - 1]);
          return 'Approved **' + and(ready.map(function (p) { return p.title; })) + '**. ' + (ready.length === 1 ? 'It waits' : 'They wait') + ' for a slot; ask me to schedule what’s approved when you’re ready.';
        });
      });
    });
  }

  function toReview(ctx, text) {
    return posts(ctx).then(function (list) {
      var drafts = list.filter(function (p) { return p.status === 'draft'; });
      var post = find(drafts, text) || drafts[0];
      if (!post) return 'There are no drafts to send to review right now.';
      remember(post);
      return details(ctx, [post]).then(function (full) {
        var parts = gaps(full[0]);
        var missingCaption = (full[0].platforms || []).some(function (p) { return !(full[0].variants || {})[p]; });
        if (parts.length) return '**' + post.title + '** isn’t ready for review: ' + parts.join(', and ') + '. ' +
          (missingCaption ? 'Ask me to write the missing caption first.' : 'In Gezel, the image maker on the crew makes the picture in the feed’s style.');
        return ctx.invoke('update_post', { id: post.id, status: 'in-review' }, post.title + ': in review').then(function () {
          return '**' + post.title + '** is in review. Its picture and captions are in, so it’s yours to approve.';
        });
      });
    });
  }

  function schedule(ctx) {
    return posts(ctx).then(function (list) {
      // Approved posts get a slot, and so does anything moved to scheduled without a date.
      var approved = list.filter(function (p) { return p.status === 'approved' || (p.status === 'scheduled' && !p.scheduledFor); });
      if (!approved.length) return 'Nothing is approved yet, so there’s nothing to schedule.' + (list.some(function (p) { return p.status === 'in-review'; }) ? ' One step back, something is waiting in review.' : '');
      var spacing = Math.max(1, Math.floor(7 / perWeek(ctx)));
      var taken = list.filter(function (p) { return p.status === 'scheduled' && p.scheduledFor; }).map(function (p) { return String(p.scheduledFor).slice(0, 10); }).sort();
      var last = taken.length ? taken[taken.length - 1] : '';
      var start = last && last >= today() ? addDays(last, spacing) : addDays(today(), 1);
      var plan = approved.map(function (post, i) { return { post: post, date: addDays(start, i * spacing) }; });
      return plan.reduce(function (chain, item) {
        return chain.then(function () {
          var input = { id: item.post.id, fields: { scheduledFor: item.date } };
          if (item.post.status === 'approved') input.status = 'scheduled';
          return ctx.invoke('update_post', input, item.post.title + ': ' + dayName(item.date));
        });
      }, Promise.resolve()).then(function () {
        return plan.map(function (item) { return '**' + item.post.title + '** goes out ' + dayName(item.date) + '.'; }).join(' ') +
          ' Spaced like that, the feed holds ' + cadence(ctx) + ' without bunching up. A date only plans a post; publishing still goes through your outbox.';
      });
    });
  }

  function caption(post, name) {
    var bank = CAPTIONS[slugOf(post.id)] || {};
    if (bank[name]) return bank[name];
    var base = (post.variants && Object.keys(post.variants).map(function (p) { return post.variants[p].body; })[0]) ||
      String(post.body || post.title).replace(/^Notion:\s*/i, '');
    var limit = LIMITS[name] || 300;
    return base.length <= limit ? base : base.slice(0, base.lastIndexOf(' ', limit - 1)) + '.';
  }

  function write(ctx, text) {
    return posts(ctx).then(function (list) {
      var open = list.filter(function (p) { return ['idea', 'draft', 'in-review'].indexOf(p.status) >= 0; });
      var post = find(open, text) || open.find(function (p) { return p.status === 'idea'; }) || open.find(function (p) { return p.status === 'draft'; });
      if (!post) return 'Nothing in the pipeline needs words right now. Tell me what you’d like to post and I’ll start one.';
      remember(post);
      return ctx.invoke('get_post', { id: post.id }, post.title).then(function (out) {
        var full = out.post, wasIdea = full.status === 'idea';
        var targets = (full.platforms || ['instagram']).filter(function (p) { return !(full.variants || {})[p]; });
        if (!targets.length) return 'Every platform on **' + full.title + '** already has its caption. Tell me which one to rework and how.';
        var written = targets.map(function (p) { return { platform: p, text: caption(full, p) }; });
        return written.reduce(function (chain, w) {
          return chain.then(function () {
            return ctx.invoke('write_file', { path: 'posts/' + full.id + '/variants/' + w.platform + '.md', content: w.text + '\n' }, 'variants/' + w.platform + '.md');
          });
        }, Promise.resolve()).then(function () {
          return wasIdea ? ctx.invoke('update_post', { id: full.id, status: 'draft' }, full.title + ': draft') : null;
        }).then(function () {
          var lead = wasIdea ? '**' + full.title + '** is a draft now. ' : 'Wrote the missing ' + (written.length === 1 ? 'caption' : 'captions') + ' for **' + full.title + '**. ';
          var lines = [lead + 'The ' + platform(written[0].platform) + ' caption, ' + written[0].text.length + ' of ' + LIMITS[written[0].platform] + ' characters:', '“' + written[0].text + '”'];
          lines.push((full.media || []).length
            ? 'Its picture is already in, so it can go to review once you like the words.'
            : 'It still needs its picture before it can leave review. In Gezel, the image maker on the crew makes it in the feed’s style.');
          return lines;
        });
      });
    });
  }

  function pace(ctx) {
    return ctx.invoke('list_posts', {}, 'Whole pipeline').then(function () { return posts(ctx); }).then(function (list) {
      var now = today(), weekOut = addDays(now, 7);
      var coming = list.filter(function (p) { var d = String(p.scheduledFor || '').slice(0, 10); return p.status === 'scheduled' && d >= now && d <= weekOut; })
        .sort(function (a, b) { return String(a.scheduledFor).localeCompare(String(b.scheduledFor)); });
      var approved = list.filter(function (p) { return p.status === 'approved'; });
      var target = perWeek(ctx), have = coming.length;
      var word = function (n) { return count(n).toLowerCase(); };
      var lines = [count(have) + ' of ' + word(target) + ' ' + (have === 1 ? 'is' : 'are') + ' scheduled for the next seven days' + (have ? ': ' + and(coming.map(function (p) { return p.title + ' (' + dayName(p.scheduledFor) + ')'; })) : '') + '.'];
      if (have >= target) lines.push('That covers the week.');
      else {
        if (approved.length) lines.push(count(approved.length) + ' approved post' + (approved.length === 1 ? ' is' : 's are') + ' ready for a slot, which would make ' + word(Math.min(target, have + approved.length)) + '.');
        var short = target - have - approved.length;
        if (short > 0) lines.push('To reach ' + word(target) + ', ' + word(short) + ' more ' + (short === 1 ? 'needs' : 'need') + ' to come through review. A steady week beats a busy one, so I’d rather post ' + word(have + approved.length) + ' good ones than rush the rest.');
      }
      return lines.join(' ');
    });
  }

  function archive(ctx, text) {
    return posts(ctx).then(function (list) {
      var post = find(list, text);
      if (!post) return 'Which post should I archive? Use its title, like “archive the glaze tests”.';
      if (post.status === 'archived') return '**' + post.title + '** is already archived. Show archived brings it into view.';
      remember(post);
      return ctx.invoke('update_post', { id: post.id, status: 'archived' }, post.title + ': archived').then(function () {
        return 'Archived **' + post.title + '**. It stays in the record; Show archived brings it back into view.';
      });
    });
  }

  return {
    name: 'Lieke',
    role: 'Social Media Writer',
    greeting: 'Hi, I’m Lieke. I keep Veld Ceramics posting at a steady four images a week, and nothing goes out without your say-so. Two posts are waiting on you, and the mugs are approved but have no slot yet.',
    suggestions: [
      'What needs my review?',
      'Approve whatever is ready',
      'Schedule what’s approved',
      'Draft a caption for the newest idea',
      'Are we on pace this week?',
    ],
    respond: function (text, ctx) {
      var lower = text.toLowerCase();
      if (offered && /^(yes|yeah|sure|ok|okay|go ahead|please|do it)\b/.test(lower)) { var title = offered; offered = null; return write(ctx, title); }
      offered = null;
      if (/\b(what can you|help|what do you do|how does this work)\b/.test(lower)) {
        return 'I run the posting pipeline: idea, draft, review, approved, scheduled, published. Ask me what needs your review, to write a missing caption, to approve or schedule what’s ready, to archive a post, or whether we’re on pace. When you move a post on the gallery, I pick it up from there.';
      }
      if (/\barchive\b/.test(lower)) return archive(ctx, text);
      if (/\b(send|move|put|submit)\b.*\breview\b/.test(lower)) return toReview(ctx, text);
      if (/\b(approve|sign off|good to go)\b/.test(lower)) return approve(ctx, text);
      if (/\b(schedule|slot|calendar)\b/.test(lower)) return schedule(ctx);
      if (/\b(caption|draft|write|words)\b/.test(lower) && !/\b(review|waiting)\b/.test(lower)) return write(ctx, text);
      if (/\b(review|waiting|pending|blocked|ready|check)\b/.test(lower)) return review(ctx);
      if (/\b(pace|cadence|on track|this week|how many|rhythm)\b/.test(lower)) return pace(ctx);
      return null;
    },
    reactions: {
      page_set_status: function (input, output, ctx) {
        return posts(ctx).then(function (list) {
          var post = list.find(function (p) { return p.id === output.id; }) || { title: output.id };
          var status = output.status;
          remember(post);
          if (status === 'draft') { offered = post.title; return '**' + post.title + '** is a draft. Want me to run Draft a Social Post on it?'; }
          if (status === 'in-review') return '**' + post.title + '** is in review. Approve it when the picture and captions look right.';
          if (status === 'approved') return 'Approved. Ask me to schedule it and I’ll find it a slot that keeps the rhythm.';
          if (status === 'scheduled') return post.scheduledFor ? 'Scheduled for ' + dayName(post.scheduledFor) + '.' : 'Scheduled. It still needs a date; ask me to schedule it and I’ll pick one.';
          if (status === 'published') return 'Marked published. Once it’s live I record its permalink, so the gallery never lies.';
          if (status === 'archived') return '**' + post.title + '** is archived. Show archived brings it back into view.';
          return null;
        });
      },
    },
  };
})();

// The standalone demo's sample conversation. In Gezel, the social media
// writer's replies come from the model the person chooses; here they are
// scripted, and every change goes through the same post tools the real crew
// member calls.
window.demoChat = (function () {
  'use strict';
  var DAY = 24 * 60 * 60 * 1000;
  var NAMES = { instagram: 'Instagram', bluesky: 'Bluesky', x: 'X', linkedin: 'LinkedIn' };
  var WORDS = ['No', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven'];
  var BAIT = /\b(don['’]t miss|last chance|act now|hurry|limited time|smash that|like and share|link in bio|you won['’]t believe)\b/i;
  // Words the writer would draft for the sample posts, in the press's voice.
  var CAPTIONS = {
    'field-notes-from-the-bindery': {
      bluesky: 'Tuesday at the bindery bench: two bone folders, a pot of wheat paste, and a stack of signatures waiting to be sewn. Honest tools, honest mess. A short thread on how a book comes together.',
      x: 'Tuesday at the bench: bone folders, wheat paste, and signatures waiting to be sewn. Honest tools, honest mess.',
    },
    'introducing-the-autumn-catalog': {
      x: 'The autumn catalog is at the bench: three new editions and one stubborn marbled endpaper. First look Thursday.',
    },
    'the-marbled-endpapers': {
      bluesky: 'Every endpaper in the autumn catalog is marbled by hand, one sheet at a time. No two match, which is the point. Here’s how a pattern gets from the bath to the book.',
      x: 'Every autumn endpaper is marbled by hand. No two match, which is the point.',
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
    return match ? Math.max(1, Number(match[1])) : 3;
  }
  function cadence(ctx) { return String((ctx.page.params || {}).cadence || '3 posts a week'); }
  function and(items) { return items.length < 2 ? items.join('') : items.slice(0, -1).join(', ') + ' and ' + items[items.length - 1]; }
  function slugOf(id) { return String(id).replace(/^\d{4}-\d{2}-\d{2}-/, ''); }

  function posts(ctx) {
    return ctx.read('posts/index.json').then(function (index) { return (index && index.posts) || []; });
  }
  // The voice guide is law: its per-platform character limits come from the file itself.
  function limits(ctx) {
    return ctx.read('voice-guide.md').catch(function () { return ''; }).then(function (text) {
      var found = { bluesky: 300, x: 280 }, re = /\*\*([A-Za-z]+)\*\*[^\n]*?(\d+) characters/g, m;
      while ((m = re.exec(String(text || '')))) found[m[1].toLowerCase()] = Number(m[2]);
      return found;
    });
  }
  // A post the person named, by its title or a distinctive word from it; "it" means the last one we discussed.
  var last = null;
  function remember(post) { if (post && post.id) last = post.id; }
  function find(list, text) {
    var lower = String(text || '').toLowerCase();
    var exact = list.find(function (post) { return lower.indexOf(String(post.title || '').toLowerCase()) >= 0; });
    if (exact) return exact;
    var scored = list.map(function (post) {
      var words = String(post.title || '').toLowerCase().split(/[^a-z0-9]+/).filter(function (w) { return w.length > 3 && ['first', 'look', 'from', 'with', 'update'].indexOf(w) < 0; });
      return { post: post, hits: words.filter(function (w) { return lower.indexOf(w) >= 0; }).length };
    }).filter(function (s) { return s.hits; }).sort(function (a, b) { return b.hits - a.hits; });
    if (scored.length) return scored[0].post;
    if (last && /\b(it|this|that)\b/.test(lower)) return list.find(function (post) { return post.id === last; }) || null;
    return null;
  }
  // What stands between a post and approval: a variant per platform, inside its limit, in the house voice.
  function gaps(post, max) {
    var parts = [];
    var missing = (post.platforms || []).filter(function (p) { return !(post.variants || {})[p]; });
    if (missing.length) parts.push('it targets ' + and(missing.map(platform)) + ' with no variant there yet');
    Object.keys(post.variants || {}).forEach(function (p) {
      var v = post.variants[p], body = String(v.body || '');
      if (max[p] && v.charCount > max[p]) parts.push('the ' + platform(p) + ' variant runs ' + (v.charCount - max[p]) + ' characters over');
      if ((body.match(/#\w/g) || []).length > 2) parts.push('the ' + platform(p) + ' variant piles up hashtags');
      if (BAIT.test(body) || /!{2,}/.test(body)) parts.push('the ' + platform(p) + ' variant leans on urgency the guide rules out');
    });
    return parts;
  }
  function details(ctx, list) {
    return list.reduce(function (chain, entry) {
      return chain.then(function (done) {
        return ctx.invoke('get_post', { id: entry.id }, entry.title).then(function (out) { return done.concat([out.post]); });
      });
    }, Promise.resolve([]));
  }

  function checkReview(ctx, text) {
    return Promise.all([posts(ctx), limits(ctx)]).then(function (got) {
      var list = got[0], max = got[1];
      var named = find(list, text);
      var targets = named ? [named] : list.filter(function (p) { return p.status === 'in-review'; });
      if (!targets.length) return 'Nothing is in review right now. The draft column is where the next post is coming from.';
      remember(targets[targets.length - 1]);
      return details(ctx, targets).then(function (full) {
        return full.map(function (post) {
          var parts = gaps(post, max);
          var sizes = Object.keys(post.variants || {}).map(function (p) { return platform(p) + ' ' + post.variants[p].charCount + ' of ' + (max[p] || '?') + ' characters'; });
          if (parts.length) return '**' + post.title + '** (' + stage(post.status) + ') isn’t ready: ' + parts.join(', and ') + '.';
          return '**' + post.title + '** (' + stage(post.status) + ') checks out against the voice guide: ' + and(sizes) + ', short sentences, no hashtags piled up, no urgency. ' +
            (post.status === 'in-review' ? 'It reads like you. Say approve and I’ll move it.' : '');
        }).join('\n\n');
      });
    });
  }

  function approve(ctx, text) {
    return Promise.all([posts(ctx), limits(ctx)]).then(function (got) {
      var list = got[0], max = got[1];
      var named = find(list, text);
      remember(named);
      if (named && named.status !== 'in-review') {
        if (named.status === 'draft' || named.status === 'idea') return '**' + named.title + '** is still ' + (named.status === 'idea' ? 'an idea' : 'a draft') + '. It goes to review before anyone approves it; ask me to send it to review once its variants are written.';
        return '**' + named.title + '** is already ' + stage(named.status) + '.';
      }
      var inReview = named ? [named] : list.filter(function (p) { return p.status === 'in-review'; });
      if (!inReview.length) return 'Nothing is in review right now, so there’s nothing to approve. Drafts go to review first.';
      return details(ctx, inReview).then(function (full) {
        var ready = full.filter(function (post) { return !gaps(post, max).length; });
        if (!ready.length) return '**' + full[0].title + '** isn’t ready: ' + gaps(full[0], max).join(', and ') + '. I’d rather hold it than approve something unfinished.';
        return ready.reduce(function (chain, post) {
          return chain.then(function () { return ctx.invoke('update_post', { id: post.id, status: 'approved' }, post.title + ': approved'); });
        }, Promise.resolve()).then(function () {
          return 'Approved **' + and(ready.map(function (p) { return p.title; })) + '**. ' + (ready.length === 1 ? 'It waits' : 'They wait') + ' for a date; ask me to schedule what’s approved.';
        });
      });
    });
  }

  function toReview(ctx, text) {
    return Promise.all([posts(ctx), limits(ctx)]).then(function (got) {
      var drafts = got[0].filter(function (p) { return p.status === 'draft'; });
      var post = find(drafts, text) || drafts[0];
      if (!post) return 'There are no drafts to send to review right now.';
      remember(post);
      return details(ctx, [post]).then(function (full) {
        var parts = gaps(full[0], got[1]);
        if (parts.length) return '**' + post.title + '** isn’t ready for review: ' + parts.join(', and ') + '. Ask me to write the missing variant first.';
        return ctx.invoke('update_post', { id: post.id, status: 'in-review' }, post.title + ': in review').then(function () {
          return '**' + post.title + '** is in review. Every platform has its variant, so it’s yours to approve.';
        });
      });
    });
  }

  function schedule(ctx) {
    return posts(ctx).then(function (list) {
      // Approved posts get a date, and so does anything moved to scheduled without one.
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
          (taken.length ? ' That leaves ' + (spacing === 1 ? 'a day' : count(spacing).toLowerCase() + ' days') + ' after the last scheduled post, which keeps ' + cadence(ctx) + ' steady instead of bunched.' : '') +
          ' A date only plans a post; publishing still goes through your outbox.';
      });
    });
  }

  function variantFor(post, name, max) {
    var bank = CAPTIONS[slugOf(post.id)] || {};
    if (bank[name]) return bank[name];
    var base = (post.variants && Object.keys(post.variants).map(function (p) { return post.variants[p].body; })[0]) ||
      String(post.body || post.title).replace(/^Rough notion:\s*/i, '');
    var limit = max[name] || 280;
    return base.length <= limit ? base : base.slice(0, base.lastIndexOf(' ', limit - 1)) + '.';
  }

  function writeVariants(ctx, full, max) {
    var targets = (full.platforms || ['bluesky']).filter(function (p) { return !(full.variants || {})[p]; });
    var written = targets.map(function (p) { return { platform: p, text: variantFor(full, p, max) }; });
    return written.reduce(function (chain, w) {
      return chain.then(function () {
        return ctx.invoke('write_file', { path: 'posts/' + full.id + '/variants/' + w.platform + '.md', content: w.text + '\n' }, 'variants/' + w.platform + '.md');
      });
    }, Promise.resolve()).then(function () { return written; });
  }
  function quote(written, max) {
    return written.map(function (w) { return '**' + platform(w.platform) + '** (' + w.text.length + ' of ' + (max[w.platform] || '?') + '): ' + w.text; }).join('\n\n');
  }

  function draftIdea(ctx, text) {
    return Promise.all([posts(ctx), limits(ctx)]).then(function (got) {
      var list = got[0], max = got[1];
      var open = list.filter(function (p) { return ['idea', 'draft', 'in-review'].indexOf(p.status) >= 0; });
      var post = find(open, text) || open.find(function (p) { return p.status === 'idea'; }) || open.find(function (p) { return p.status === 'draft'; });
      if (!post) return 'Nothing on the board needs words right now. Tell me what you’d like to post about and I’ll draft it.';
      remember(post);
      return ctx.invoke('get_post', { id: post.id }, post.title).then(function (out) {
        var full = out.post, wasIdea = full.status === 'idea';
        if (!(full.platforms || []).some(function (p) { return !(full.variants || {})[p]; })) return 'Every platform on **' + full.title + '** already has its variant. Tell me which one to rework and how.';
        return writeVariants(ctx, full, max).then(function (written) {
          return (wasIdea ? ctx.invoke('update_post', { id: full.id, status: 'draft' }, full.title + ': draft') : Promise.resolve()).then(function () {
            return [(wasIdea ? '**' + full.title + '** is a draft now.' : 'Wrote the missing ' + (written.length === 1 ? 'variant' : 'variants') + ' for **' + full.title + '**.') + ' Short sentences, concrete nouns, no hashtags:', quote(written, max),
              'When you like the words, ask me to send it to review.'];
          });
        });
      });
    });
  }

  function newPost(ctx, topic) {
    var clean = String(topic || '').replace(/^(our|the|a|an)\s+/i, '').replace(/[.!?]+$/, '').trim() || 'the marbled endpapers';
    var title = /endpaper/i.test(clean) ? 'The marbled endpapers' : clean.charAt(0).toUpperCase() + clean.slice(1);
    return Promise.all([posts(ctx), limits(ctx)]).then(function (got) {
      var list = got[0], max = got[1];
      var existing = list.find(function (p) { return String(p.title).toLowerCase() === title.toLowerCase(); });
      if (existing) return '**' + existing.title + '** is already on the board, in ' + stage(existing.status) + '.';
      var body = /endpaper/i.test(title)
        ? 'How the autumn catalog’s endpapers are marbled by hand, one sheet at a time.'
        : 'A short post about ' + clean + ', from the bench.';
      return ctx.invoke('create_post', { title: title, body: body, platforms: 'bluesky,x', status: 'draft' }, title + ': draft').then(function (out) {
        return ctx.invoke('get_post', { id: out.id }, title);
      }).then(function (out) {
        remember(out.post);
        if (!CAPTIONS[slugOf(out.post.id)]) {
          CAPTIONS[slugOf(out.post.id)] = {
            bluesky: 'From the bench this week: ' + clean + '. A short note on how it comes together, in our own words.',
            x: 'From the bench: ' + clean + '.',
          };
        }
        return writeVariants(ctx, out.post, max);
      }).then(function (written) {
        return ['**' + title + '** is on the board as a draft, with a variant for each platform:', quote(written, max), 'Nothing goes further until you’ve read it.'];
      });
    });
  }

  function pace(ctx) {
    return ctx.invoke('list_posts', {}, 'Whole pipeline').then(function () { return posts(ctx); }).then(function (list) {
      var now = today(), weekOut = addDays(now, 7);
      var coming = list.filter(function (p) { var d = String(p.scheduledFor || '').slice(0, 10); return p.status === 'scheduled' && d >= now && d <= weekOut; })
        .sort(function (a, b) { return String(a.scheduledFor).localeCompare(String(b.scheduledFor)); });
      var approved = list.filter(function (p) { return p.status === 'approved'; });
      var inReview = list.filter(function (p) { return p.status === 'in-review'; });
      var target = perWeek(ctx), have = coming.length;
      var word = function (n) { return count(n).toLowerCase(); };
      var lines = [count(have) + ' of ' + word(target) + ' ' + (have === 1 ? 'is' : 'are') + ' scheduled for the next seven days' + (have ? ': ' + and(coming.map(function (p) { return p.title + ' (' + dayName(p.scheduledFor) + ')'; })) : '') + '.'];
      if (have >= target) lines.push('That covers the week.');
      else {
        if (approved.length) lines.push(count(approved.length) + ' approved post' + (approved.length === 1 ? ' is' : 's are') + ' ready for a date, which would make ' + word(Math.min(target, have + approved.length)) + '.');
        var short = target - have - approved.length;
        var waiting = inReview.slice(0, short);
        if (short > 0) lines.push(waiting.length ? 'The last ' + (short === 1 ? 'slot' : word(short) + ' slots') + ' can come from review: ' + and(waiting.map(function (p) { return '**' + p.title + '**'; })) + (waiting.length === 1 ? ' is' : ' are') + ' waiting on you.'
          : 'To reach ' + word(target) + ', ' + word(short) + ' more ' + (short === 1 ? 'needs' : 'need') + ' to come through review.');
      }
      return lines.join(' ');
    });
  }

  function archive(ctx, text) {
    return posts(ctx).then(function (list) {
      var post = find(list, text);
      if (!post) return 'Which post should I archive? Use its title, like “archive the bindery notes”.';
      if (post.status === 'archived') return '**' + post.title + '** is already archived. Show archived brings it into view.';
      remember(post);
      return ctx.invoke('update_post', { id: post.id, status: 'archived' }, post.title + ': archived').then(function () {
        return 'Archived **' + post.title + '**. It stays in the record; Show archived brings it back into view.';
      });
    });
  }

  return {
    name: 'Maud',
    role: 'Social Media Writer',
    greeting: 'Hi, I’m Maud. I keep Juniper Press posting three times a week in its own inky voice, and nothing goes out without your say-so. One post is waiting for your review, and the press portrait is approved but has no date yet.',
    suggestions: [
      'What goes out this week?',
      'Is the post in review ready?',
      'Schedule what’s approved',
      'Turn the newest idea into a draft',
      'Draft a post about our marbled endpapers',
    ],
    respond: function (text, ctx) {
      var lower = text.toLowerCase();
      if (offered && /^(yes|yeah|sure|ok|okay|go ahead|please|do it)\b/.test(lower)) { var title = offered; offered = null; return draftIdea(ctx, title); }
      offered = null;
      if (/\b(what can you|help|what do you do|how does this work)\b/.test(lower)) {
        return 'I run the posting pipeline: idea, draft, review, approved, scheduled, published. Ask me what goes out this week, to check a post against the voice guide, to write a missing variant or draft a new post about something, or to approve, schedule or archive. When you move a post on the board, I pick it up from there.';
      }
      var about = text.match(/\b(?:post|thread|something)\s+(?:about|on)\s+(.+)/i);
      if (about && /\b(draft|write|new|make|start)\b/.test(lower)) return newPost(ctx, about[1]);
      if (/\barchive\b/.test(lower)) return archive(ctx, text);
      if (/\b(send|move|put|submit)\b.*\breview\b/.test(lower)) return toReview(ctx, text);
      if (/\b(approve|sign off|good to go)\b/.test(lower)) return approve(ctx, text);
      if (/\b(schedule|date|calendar)\b/.test(lower)) return schedule(ctx);
      if (/\b(voice|ready|check|review)\b/.test(lower)) return checkReview(ctx, text);
      if (/\b(draft|write|variant|caption|words)\b/.test(lower)) return draftIdea(ctx, text);
      if (/\b(this week|goes out|going out|pace|cadence|on track|how many|rhythm)\b/.test(lower)) return pace(ctx);
      return null;
    },
    reactions: {
      page_set_status: function (input, output, ctx) {
        return posts(ctx).then(function (list) {
          var post = list.find(function (p) { return p.id === output.id; }) || { title: output.id };
          var status = output.status;
          remember(post);
          if (status === 'draft') { offered = post.title; return '**' + post.title + '** is a draft. Want me to run Draft a Social Post on it?'; }
          if (status === 'in-review') return '**' + post.title + '** is in review. Ask me to check it against the voice guide before you approve.';
          if (status === 'approved') return 'Approved. Ask me to schedule it and I’ll give it a date that keeps the rhythm.';
          if (status === 'scheduled') return post.scheduledFor ? 'Scheduled for ' + dayName(post.scheduledFor) + '.' : 'Scheduled. It still needs a date; ask me to schedule it and I’ll pick one.';
          if (status === 'published') return 'Marked published. Once it’s live I record its permalink, so the board never lies.';
          if (status === 'archived') return '**' + post.title + '** is archived. Show archived brings it back into view.';
          return null;
        });
      },
    },
  };
})();

// The standalone demo's sample conversation. In Gezel, the support lead's
// replies come from the model the person chooses; here they are scripted,
// and every change goes through the same tools the crew calls.
window.demoChat = (function () {
  'use strict';
  var DAY = 86400000;

  function pad(n) { return n < 10 ? '0' + n : String(n); }
  function iso(ms) { var d = new Date(ms); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function ageDays(day) { return Math.max(0, Math.round((Date.parse(iso(Date.now()) + 'T00:00:00') - Date.parse(String(day).slice(0, 10) + 'T00:00:00')) / DAY)); }
  function age(days) { return days === 0 ? 'came in today' : days === 1 ? '1 day old' : days + ' days old'; }
  function firstName(name) { var n = String(name || '').trim(); return /\b(books|press|shop|ltd|inc|co)\b/i.test(n) || !n ? 'there' : n.split(/\s+/)[0]; }
  function topicKey(text) { return String(text || '').trim().toLowerCase().replace(/\s+/g, ' '); }

  function state(ctx) {
    return Promise.all([ctx.read('tickets.json'), ctx.read('kb')]).then(function (v) {
      return { records: (v[0] && v[0].records) || [], articles: (v[1] || []).map(function (f) { return 'kb/' + f.name; }) };
    });
  }
  function queue(s) {
    var rank = function (r) { return r.fields.priority === 'urgent' ? 0 : r.fields.priority === 'low' ? 2 : 1; };
    return s.records.filter(function (r) { return r.status === 'new' || r.status === 'open'; }).sort(function (a, b) {
      return rank(a) - rank(b) || String(a.fields.receivedAt).localeCompare(String(b.fields.receivedAt));
    });
  }
  function gaps(s) {
    var groups = [];
    s.records.forEach(function (r) {
      if (!r.fields.kbGap || r.fields.kbArticle) return;
      var g = groups.find(function (x) { return topicKey(x.topic) === topicKey(r.fields.kbGap); });
      if (!g) { g = { topic: r.fields.kbGap, tickets: [] }; groups.push(g); }
      g.tickets.push(r);
    });
    return groups.sort(function (a, b) { return b.tickets.length - a.tickets.length; });
  }
  // The ticket the person means: the one whose subject and customer share the most words with what they wrote.
  function find(s, text, onlyActive) {
    var words = text.toLowerCase().match(/[a-z]{4,}/g) || [];
    var best = null, score = 0;
    s.records.forEach(function (r) {
      if (onlyActive && r.status === 'resolved') return;
      var hay = (r.fields.subject + ' ' + (r.fields.customer || '')).toLowerCase();
      var hits = words.filter(function (w) { return hay.indexOf(w) >= 0 || hay.indexOf(w.replace(/s$/, '')) >= 0; }).length;
      if (hits > score) { best = r; score = hits; }
    });
    return best;
  }
  // Which of the business's help articles answers a ticket, by what it is about.
  function articleFor(s, r) {
    var text = (r.fields.subject + ' ' + (r.fields.message || '') + ' ' + r.fields.category).toLowerCase();
    var pick = /torn|damag|broken|missing item|arrived/.test(text) ? 'damaged' : /ebook|download|link/.test(text) ? 'ebook' : /charge|refund|billing|return/.test(text) ? 'refund' : /shipping|deliver|when will|late/.test(text) ? 'shipping' : '';
    return pick ? s.articles.find(function (a) { return a.indexOf(pick) >= 0; }) || '' : '';
  }
  function reference(text) { var m = String(text || '').match(/\b([A-Z]{2,4}-\d{3,})\b/); return m ? m[1] : ''; }

  function draftFor(s, r) {
    var article = articleFor(s, r), hi = 'Hi ' + firstName(r.fields.customer) + ', ', ref = reference(r.fields.message);
    var body;
    if (/damaged|torn|broken/.test(article + ' ' + r.fields.subject.toLowerCase())) body = 'I’m sorry your book reached you damaged. We’re sending a fresh copy today at no cost, and there’s no need to return the first one' + (ref ? '; I’ve noted it against order ' + ref : '') + '.';
    else if (/ebook/.test(article)) body = 'download links last 30 days, so yours has simply run out. I’ve sent a new link to this address; it works on any device. Reply here if it gives you any trouble.'.replace(/^./, function (c) { return c.toUpperCase(); });
    else if (/refund/.test(article)) body = 'I’m sorry about that. I can see the duplicate charge and have refunded it; it should show within five business days.';
    else if (/shipping/.test(article)) body = 'I’m sorry your order is taking longer than it should. Orders leave us within two business days, so I’m checking where yours is now and will send you its tracking link today.';
    else body = 'thank you for writing. I’m checking the details and will come back to you by [day] with a full answer.'.replace(/^./, function (c) { return c.toUpperCase(); });
    return { text: hi + body + '\n\nWarm wishes,\nJuniper Press', article: article };
  }

  function status(ctx) {
    return ctx.invoke('desk_status', {}, 'Read the desk').then(function () { return state(ctx); }).then(function (s) {
      var q = queue(s);
      if (!q.length) return 'Nothing needs a reply right now. Every customer has an answer.';
      var lines = q.map(function (r) {
        return '- **' + r.fields.subject + '** (' + (r.fields.customer || 'no name') + ', ' + age(ageDays(r.fields.receivedAt)) + ')' +
          (r.fields.priority === 'urgent' ? ', urgent' : '') + (r.fields.suggestedReply ? ', reply drafted and ready to send' : ', no reply yet');
      });
      var undrafted = q.filter(function (r) { return !r.fields.suggestedReply; });
      return q.length + (q.length === 1 ? ' ticket needs' : ' tickets need') + ' a reply, urgent first, then oldest:\n' + lines.join('\n') +
        (undrafted.length ? '\n\nI’d start with “' + undrafted.sort(function (a, b) { return String(a.fields.receivedAt).localeCompare(String(b.fields.receivedAt)); })[0].fields.subject + '”; it has waited longest without a draft.' : '\n\nEvery one has a draft; they just need sending.');
    });
  }

  function draft(ctx, text) {
    return state(ctx).then(function (s) {
      var r = find(s, text, true);
      if (!r) return 'Which ticket should I answer? Name it, like “draft a reply to the torn cover”.';
      var d = draftFor(s, r);
      var input = { id: r.id, reply: d.text };
      if (d.article) input.article = d.article;
      return ctx.invoke('suggest_reply', input, r.fields.subject).then(function () {
        return 'Drafted a reply to ' + (r.fields.customer || 'the customer') + ' about **' + r.fields.subject + '**' + (d.article ? ', based on ' + d.article : '') + ':\n\n' + d.text +
          '\n\nIt’s on the ticket, ready for you to send. ' + (d.article ? '' : 'No help article covers this yet, so I kept the promise open-ended.');
      });
    });
  }

  function logged(ctx, text) {
    var lower = text.toLowerCase();
    var who = (text.match(/^\s*(.+?)\s+(?:emailed|called|wrote|messaged|asked|phoned)\b/i) || [])[1];
    var topic = (text.match(/\b(?:asking|asked|wants to know|wondering)\s+(?:about|for|if|whether)?\s*([^.?!]+)/i) || [])[1];
    if (!topic) return Promise.resolve('What did they ask? Tell me who wrote in and what about, like “a bookshop in Leeds emailed asking for wholesale terms”.');
    topic = topic.trim().replace(/^(our|your|the|a|an)\s+/i, '');
    var subject = topic.charAt(0).toUpperCase() + topic.slice(1) + (who ? ' (' + who.trim().replace(/^(a|an|the)\s+/i, '') + ')' : '');
    var channel = /email|wrote/.test(lower) ? 'email' : /call|phone/.test(lower) ? 'phone' : /message|dm|instagram/.test(lower) ? 'social' : /chat/.test(lower) ? 'chat' : 'other';
    var category = /wholesale|trade|bookshop|stockist|partner|event/.test(lower) ? 'business' : /refund|charge|invoice|paid/.test(lower) ? 'billing' : /deliver|arrived|shipping|damaged|torn/.test(lower) ? 'delivery' : /download|ebook|login|account/.test(lower) ? 'account' : /order/.test(lower) ? 'order' : 'product';
    return state(ctx).then(function (s) {
      var known = gaps(s).find(function (g) { return topic.toLowerCase().indexOf(topicKey(g.topic).split(' ')[0]) >= 0; });
      var gap = known ? known.topic : topic.toLowerCase();
      return ctx.invoke('add_ticket', { subject: subject, customer: who ? who.trim().replace(/^./, function (c) { return c.toUpperCase(); }) : undefined, channel: channel, category: category, message: text.trim() }, 'Logged: ' + subject).then(function (out) {
        var id = ((out && out.summary || '').match(/\b(tk-\d+)/) || [])[1];
        var covered = articleFor(s, { fields: { subject: subject, message: text, category: category, customer: who } });
        if (covered) {
          var d = draftFor(s, { fields: { subject: subject, message: text, category: category, customer: who && /^[A-Z]/.test(who.trim()) ? who.trim() : '' } });
          return ctx.invoke('suggest_reply', { id: id, reply: d.text, article: covered }, 'Reply from ' + covered).then(function () {
            return 'Logged it as a ' + category + ' ticket' + (id ? ' (' + id + ')' : '') + ' and drafted a reply from ' + covered + ':\n\n' + d.text + '\n\nIt’s saved on the ticket for you to send.';
          });
        }
        var reply = 'Hello, and thank you for getting in touch. I’m pulling together our ' + gap + ' and will send them by [day]. If you can tell me roughly what you have in mind, I’ll make sure the answer fits.\n\nWarm wishes,\nJuniper Press';
        return ctx.invoke('suggest_reply', { id: id, reply: reply, gap: gap }, 'Holding reply, gap: ' + gap).then(function () { return state(ctx); }).then(function (after) {
          var g = gaps(after).find(function (x) { return topicKey(x.topic) === topicKey(gap); });
          return 'Logged it as a ' + category + ' ticket' + (id ? ' (' + id + ')' : '') + ' and drafted a holding reply, with [day] left for you to fill in. No help article covers ' + gap + ' yet' +
            (g && g.tickets.length > 1 ? ', and that makes ' + g.tickets.length + ' tickets asking. Want me to write the article?' : '. If it comes up again, it’s worth an article.');
        });
      });
    });
  }

  var ARTICLES = {
    wholesale: { title: 'Wholesale and trade orders', body: 'Bookshops, libraries and event organizers can order Juniper Press titles at trade terms.\n\n## Terms\n\n- **Discount:** [trade discount] off the cover price.\n- **Minimum order:** [minimum order] copies, mixed titles welcome.\n- **Payment:** invoice, due in [payment terms] days.\n- **Returns:** [returns policy].\n\n## How to order\n\n1. Email the titles and quantities, your shop name and delivery address.\n2. We confirm stock and send an invoice within two business days.\n3. Orders ship when the invoice is confirmed.\n\nAuthor events: tell us the date and we will make sure the books arrive a week ahead.' },
    submissions: { title: 'Sending us your manuscript', body: 'We read unagented poetry submissions twice a year.\n\n## When\n\n[submission windows]\n\n## How\n\n1. Send 10 to 15 poems as one PDF.\n2. Add a short cover letter: who you are and what the collection is about.\n3. Expect an answer within [response time].\n\nWe are sorry we cannot give individual feedback on every submission.' },
    permission: { title: 'Permission to quote our books', body: 'You are welcome to ask to quote from a Juniper Press book.\n\n## What to send\n\n- The title and the exact lines you want to use.\n- Where they will appear and how many people will see it.\n\n## Our answer\n\nShort quotations for reviews and teaching usually need only a credit line: [credit line]. For anything longer, we confirm with the author first and reply within [response time].' },
  };
  function article(ctx, text) {
    return state(ctx).then(function (s) {
      var open = gaps(s);
      var lower = text.toLowerCase();
      var g = open.find(function (x) { return topicKey(x.topic).split(' ').some(function (w) { return w.length > 3 && lower.indexOf(w.replace(/s$/, '')) >= 0; }); }) || open[0];
      if (!g) return 'Every question so far has a help article. Tell me a topic and I’ll write one anyway.';
      var key = /wholesale|trade/.test(g.topic) ? 'wholesale' : /submission/.test(g.topic) ? 'submissions' : /permission|quote/.test(g.topic) ? 'permission' : '';
      var a = key ? ARTICLES[key] : { title: g.topic.charAt(0).toUpperCase() + g.topic.slice(1), body: 'What customers ask about ' + g.topic + ', answered.\n\n## The short answer\n\n[Your answer here.]\n\n## Details\n\n[Steps, times and prices.]' };
      return ctx.invoke('save_kb_article', { title: a.title, body: a.body, topic: g.topic }, 'kb: ' + a.title).then(function (out) {
        var path = ((out && out.summary || '').match(/kb\/[\w.-]+/) || [])[0] || 'kb/';
        return 'Saved **' + a.title + '** as ' + path + '. It answers the “' + g.topic + '” question on ' + g.tickets.length + (g.tickets.length === 1 ? ' ticket' : ' tickets') + ', so that gap is closed.' +
          (/\[/.test(a.body) ? ' I left the numbers in brackets, like the discount and minimum order: those are yours to set, and I won’t guess them.' : '');
      });
    });
  }

  function moved(ctx, text, status) {
    return state(ctx).then(function (s) {
      var r = find(s, text, true);
      if (!r) return 'Which ticket? Name it, like “Maya’s ebook link is sorted”.';
      return ctx.invoke('set_ticket_status', { id: r.id, status: status, note: text.trim() }, r.fields.subject + ': ' + status).then(function () { return state(ctx); }).then(function (after) {
        var next = queue(after)[0];
        return (status === 'resolved' ? 'Marked **' + r.fields.subject + '** resolved.' : 'Moved **' + r.fields.subject + '** to waiting on the customer.') +
          (next ? ' Next in the queue: “' + next.fields.subject + '” from ' + (next.fields.customer || 'a customer') + (next.fields.suggestedReply ? ', draft ready.' : '.') : ' The queue is clear.');
      });
    });
  }

  function gapReport(ctx) {
    return ctx.invoke('desk_status', {}, 'Read the desk').then(function () { return state(ctx); }).then(function (s) {
      var open = gaps(s);
      if (!open.length) return 'No gaps: every question so far has a help article.';
      return 'These questions have no help article yet, most asked first:\n' + open.map(function (g) {
        return '- **' + g.topic + '**: ' + g.tickets.length + (g.tickets.length === 1 ? ' ticket' : ' tickets') + ' (' + g.tickets.map(function (r) { return r.fields.customer || r.id; }).join(', ') + ')';
      }).join('\n') + '\n\nThe first one is worth an article this week.';
    });
  }

  return {
    name: 'Roos',
    role: 'Support Lead',
    greeting: 'Hello, I’m Roos. I keep Juniper Press’s customer questions moving. Five tickets need a reply, one of them an urgent double charge, and wholesale terms keep coming up without a help article.',
    suggestions: [
      'What needs a reply today?',
      'Draft a reply to the torn cover',
      'A bookshop in Leeds emailed asking for wholesale terms',
      'Write a help article for the wholesale terms gap',
      'Maya’s ebook link is sorted, mark it resolved',
    ],
    respond: function (text, ctx) {
      var lower = text.toLowerCase();
      if (/\b(article|help page|faq|knowledge)\b/.test(lower) && /\b(write|draft|make|add|create)\b/.test(lower)) return article(ctx, text);
      if (/\b(resolved|sorted|closed|done|fixed|answered)\b/.test(lower)) return moved(ctx, text, 'resolved');
      if (/\b(waiting on|waiting for|asked (him|her|them))\b/.test(lower)) return moved(ctx, text, 'waiting');
      if (/\b(emailed|called|phoned|wrote|messaged|new ticket)\b/.test(lower) || (/\basking\b/.test(lower) && !/\b(draft|reply to)\b/.test(lower))) return logged(ctx, text);
      if (/\b(draft|reply to|respond to|answer)\b/.test(lower)) return draft(ctx, text);
      if (/\b(gap|gaps|keep asking|keeps? coming|coming up|comes? up|most asked|common questions|not covered)\b/.test(lower)) return gapReport(ctx);
      if (/\b(needs?|today|queue|waiting|status|open|reply|what)\b/.test(lower)) return status(ctx);
      return null;
    },
    reactions: {
      page_set_ticket_status: function (input, output, ctx) {
        return state(ctx).then(function (s) {
          var next = queue(s)[0];
          return (output && output.summary ? output.summary.split('. ')[0] + '. ' : 'Moved. ') + (next ? 'Next up: “' + next.fields.subject + '”' + (next.fields.suggestedReply ? ', reply drafted.' : '.') : 'Nothing else needs a reply.');
        });
      },
      page_add_ticket: function (input) {
        return 'Logged “' + input.subject + '”. Ask me for a reply when you’re ready, and I’ll check the help articles first.';
      },
      page_suggest_reply: function () {
        return 'Saved on the ticket. Send it when it reads right to you.';
      },
    },
  };
})();

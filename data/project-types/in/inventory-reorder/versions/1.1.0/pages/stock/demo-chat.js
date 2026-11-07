// The standalone demo's sample conversation. In Gezel, the stock keeper's
// replies come from the model the person chooses; here they are scripted, and
// every change goes through the same tools (and the same stock rules) the crew uses.
window.demoChat = (function () {
  'use strict';
  var rules = window.stockRules;
  var OPEN = ['draft', 'sent'];

  function niceDate(day) { return new Date(String(day).slice(0, 10) + 'T12:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric' }); }
  function n(value) { var v = rules.num(value); return v === null ? 0 : v; }
  function state(ctx) {
    return Promise.all([ctx.read('items.json'), ctx.read('orders.json')]).then(function (v) {
      return { items: (v[0] && v[0].records) || [], orders: (v[1] && v[1].records) || [] };
    });
  }
  function status(r) { return rules.stockStatus(r.fields); }
  function needs(s) {
    return s.items.filter(function (r) { return status(r) !== 'ok'; }).sort(function (a, b) {
      var sa = status(a), sb = status(b);
      if (sa !== sb) return sa === 'out' ? -1 : 1;
      return n(a.fields.onHand) / Math.max(1, n(a.fields.reorderPoint)) - n(b.fields.onHand) / Math.max(1, n(b.fields.reorderPoint));
    });
  }
  function openOrder(s, r) {
    return s.orders.filter(function (o) { return OPEN.indexOf(o.status) >= 0 && (o.fields.lines || []).some(function (l) { return l.itemId === r.id; }); })[0];
  }
  function lc(name) { return /^[A-Z][a-z]/.test(name) ? name.charAt(0).toLowerCase() + name.slice(1) : name; }
  // The item the person means: the one whose name shares the most words with what they wrote.
  function findItem(s, text) {
    var words = text.toLowerCase().match(/[a-z]{3,}/g) || [];
    var best = null, score = 0;
    s.items.forEach(function (r) {
      var name = r.fields.name.toLowerCase();
      var hits = words.filter(function (w) { return name.indexOf(w.replace(/s$/, '')) >= 0 && ['bag', 'bags', 'the', 'and', 'got', 'used', 'today', 'case', 'cases'].indexOf(w) < 0; }).length;
      if (hits > score) { best = r; score = hits; }
    });
    return best;
  }
  function findOpenOrder(s, text) {
    var lowerText = text.toLowerCase();
    var open = s.orders.filter(function (o) { return OPEN.indexOf(o.status) >= 0; });
    var bySupplier = open.filter(function (o) { return o.fields.supplier.toLowerCase().split(/\s+/).some(function (w) { return w.length > 3 && lowerText.indexOf(w.replace(/\.$/, '')) >= 0; }); });
    if (bySupplier.length) return bySupplier[0];
    var item = findItem(s, text);
    return item ? openOrder(s, item) : null;
  }
  function changed(output) {
    var text = output && output.summary ? output.summary : '';
    var at = text.search(/\d+ items? tracked:/);
    return (at > 0 ? text.slice(0, at) : text).trim();
  }

  function low(ctx) {
    return ctx.invoke('stock_status', {}, 'Stock check').then(function () { return state(ctx); }).then(function (s) {
      var list = needs(s);
      if (!list.length) return 'Nothing is at or below its reorder point. The shelf is in good shape.';
      var waiting = list.filter(function (r) { var o = openOrder(s, r); return !o || o.status !== 'sent'; });
      return 'Here’s what needs attention, out first:\n' + list.map(function (r) {
        var f = r.fields, o = openOrder(s, r);
        if (o && o.status === 'sent') return '- **' + f.name + '**: ' + rules.amount(n(f.onHand), f.unit) + ' left, already on ' + o.id + ' from ' + f.supplier + (o.fields.expectedAt ? ', expected ' + niceDate(o.fields.expectedAt) : '');
        return '- **' + f.name + '**: ' + (status(r) === 'out' ? 'out' : rules.amount(n(f.onHand), f.unit) + ' left (reorder at ' + n(f.reorderPoint) + ')') + '; order ' + rules.amount(rules.orderQty(f), f.unit) + ' from ' + (f.supplier || 'a supplier we still need to name') + (rules.num(f.leadDays) !== null ? ', ' + f.leadDays + '-day lead' : '');
      }).join('\n') + (waiting.length ? '\n\nSay the word and I’ll draft the orders, one per supplier.' : '');
    });
  }

  function draft(ctx) {
    return ctx.invoke('draft_orders', {}, 'One draft per supplier').then(function () { return state(ctx); }).then(function (s) {
      var drafts = s.orders.filter(function (o) { return o.status === 'draft'; });
      if (!drafts.length) return 'Nothing needs a new order: everything low is already on its way.';
      var total = drafts.reduce(function (sum, o) { return sum + n(o.fields.totalCents); }, 0);
      return 'Drafted ' + (drafts.length === 1 ? 'one order' : drafts.length + ' orders') + ' for you to check, ' + rules.money(total) + ' in all:\n' + drafts.map(function (o) {
        var lead = (rules.suppliers(s.items).filter(function (x) { return x.name === o.fields.supplier; })[0] || {}).leadDays;
        return '- **' + o.fields.supplier + '** (' + o.id + '): ' + o.fields.lines.map(function (l) { return rules.amount(n(l.qty), l.unit) + ' ' + lc(l.name); }).join(', ') + ', ' + rules.money(n(o.fields.totalCents)) + (lead ? '; arrives about ' + lead + ' days after you send it' : '');
      }).join('\n') + '\n\nNothing is ordered until you place them. Tell me when one is sent and I’ll track it.';
    });
  }

  function stock(ctx, text) {
    return state(ctx).then(function (s) {
      var r = findItem(s, text);
      if (!r) return 'Which item was that? Name it, like “we used 3 bags of espresso beans”.';
      var lowerText = text.toLowerCase();
      var count = (lowerText.match(/\bcount(?:ed)?\s+(\d+(?:\.\d+)?)/) || lowerText.match(/(\d+(?:\.\d+)?)\D{0,24}\b(?:left on the shelf|on the shelf)\b/) || [])[1];
      var received = (lowerText.match(/\b(?:got|received|delivered|took in)\s+(\d+(?:\.\d+)?)/) || lowerText.match(/(\d+(?:\.\d+)?)\D{0,30}\b(?:came in|arrived)\b/) || [])[1];
      var used = (lowerText.match(/\b(?:used|sold|tossed|wasted|went through|threw out)\s+(\d+(?:\.\d+)?)/) || [])[1];
      var input = { item: r.fields.name };
      if (count) input.count = Number(count);
      else {
        if (received) input.received = Number(received);
        if (used) input.used = Number(used);
      }
      if (!count && !received && !used) return 'How many? Tell me what came in and what got used, like “got 12, used 3”, and I’ll do the math.';
      var summary = count ? 'Count: ' + count : [received ? 'received ' + received : '', used ? 'used ' + used : ''].filter(Boolean).join(', ');
      var before = n(r.fields.onHand);
      return ctx.invoke('record_stock', input, r.fields.name + ': ' + summary).then(function (output) {
        return state(ctx).then(function (after) {
          var now = after.items.filter(function (x) { return x.id === r.id; })[0], f = now.fields, st = status(now);
          var o = openOrder(after, now);
          var reply = 'Logged: ' + (count ? 'counted ' + rules.amount(Number(count), f.unit) : [received ? 'received ' + rules.amount(Number(received), f.unit) : '', used ? 'used ' + rules.amount(Number(used), f.unit) : ''].filter(Boolean).join(' and ')) + ' of ' + lc(f.name) + '. ' +
            rules.amount(n(f.onHand), f.unit) + ' now, from ' + before + '. ';
          reply += st === 'ok' ? 'That’s above the reorder point of ' + n(f.reorderPoint) + '.' : st === 'out' ? 'It’s out.' : 'Still at or below the reorder point of ' + n(f.reorderPoint) + '.';
          if (o && o.status === 'draft') reply += ' The ' + o.fields.supplier + ' draft now asks for ' + rules.amount(o.fields.lines.filter(function (l) { return l.itemId === now.id; })[0].qty, f.unit) + '.';
          else if (/Dropped draft/.test(output.summary || '')) reply += ' Its draft order is no longer needed, so I dropped it.';
          else if (st !== 'ok' && !o) reply += ' Want me to draft an order from ' + (f.supplier || 'a supplier') + '?';
          return reply;
        });
      });
    });
  }

  function arrived(ctx, text) {
    return state(ctx).then(function (s) {
      var o = findOpenOrder(s, text);
      if (!o) return 'Which delivery was that? Name the supplier or an item on it, like “the cold cups arrived”.';
      return ctx.invoke('update_order', { order: o.id, status: 'received' }, o.id + ' from ' + o.fields.supplier).then(function () { return state(ctx); }).then(function (after) {
        return 'Received **' + o.id + '** from ' + o.fields.supplier + ' and added it to stock:\n' + o.fields.lines.map(function (l) {
          var r = after.items.filter(function (x) { return x.id === l.itemId; })[0];
          return '- ' + l.name + ': +' + rules.amount(n(l.qty), l.unit) + (r ? ', ' + rules.amount(n(r.fields.onHand), r.fields.unit) + ' on hand' + (status(r) === 'ok' ? '' : ', still low') : '');
        }).join('\n') + '\n\nIf anything was short, count the shelf and tell me the number.';
      });
    });
  }

  function sent(ctx, text) {
    return state(ctx).then(function (s) {
      var drafts = s.orders.filter(function (o) { return o.status === 'draft'; });
      var o = findOpenOrder({ items: s.items, orders: drafts }, text) || (drafts.length === 1 ? drafts[0] : null);
      if (!o) return drafts.length ? 'Which one did you send? The drafts are ' + drafts.map(function (d) { return d.fields.supplier + ' (' + d.id + ')'; }).join(', ') + '.' : 'There are no drafts to send. Ask me to draft this week’s orders first.';
      return ctx.invoke('update_order', { order: o.id, status: 'sent' }, o.id + ' to ' + o.fields.supplier).then(function () { return state(ctx); }).then(function (after) {
        var now = after.orders.filter(function (x) { return x.id === o.id; })[0];
        return 'Marked **' + o.id + '** to ' + o.fields.supplier + ' as sent' + (now.fields.expectedAt ? '. With their lead time it should arrive by ' + niceDate(now.fields.expectedAt) : '') + '. Tell me when it comes in and I’ll add it to stock.';
      });
    });
  }

  function added(ctx, text) {
    var name = (text.match(/\b(?:track|add)\s+(?:our\s+|the\s+|some\s+)?(.+?)(?=\s+from\b|:|,|$)/i) || [])[1];
    if (!name) return Promise.resolve('What should I add? Give me the item, the supplier and the counts, like “track chai concentrate from Harbor Wholesale: 4 on hand, reorder at 3”.');
    name = name.trim().replace(/^./, function (c) { return c.toUpperCase(); });
    var supplier = (text.match(/\bfrom\s+([^:,.;]+(?:\.\s?Co)?)/i) || [])[1];
    var onHand = (text.match(/(\d+(?:\.\d+)?)\s+(?:\w+\s+)?on hand/i) || [])[1];
    var point = (text.match(/reorder (?:at|point(?: of)?)\s*(\d+(?:\.\d+)?)/i) || [])[1];
    var par = (text.match(/(?:up to|par(?: of)?)\s*(\d+(?:\.\d+)?)/i) || [])[1];
    var cost = (text.match(/\$(\d+(?:\.\d+)?)/) || [])[1];
    if (!onHand) return Promise.resolve('How many ' + name.toLowerCase() + ' are on the shelf now? I need that to start counting.');
    var input = { name: name, onHand: Number(onHand) };
    if (supplier) input.supplier = supplier.trim();
    if (point) input.reorderPoint = Number(point);
    if (par) input.par = Number(par);
    if (cost) input.unitCost = Number(cost);
    if (/bottle/i.test(text)) input.unit = 'bottle';
    return ctx.invoke('add_item', input, name).then(function () { return state(ctx); }).then(function (s) {
      var r = s.items.filter(function (x) { return x.fields.name.toLowerCase() === name.toLowerCase(); })[0];
      var f = r.fields, lead = rules.num(f.leadDays);
      return 'Added **' + f.name + '**: ' + rules.amount(n(f.onHand), f.unit) + ' on hand, reorder at ' + n(f.reorderPoint) + (rules.num(f.par) !== null ? ', order up to ' + f.par : '') + (f.supplier ? ', from ' + f.supplier + (lead !== null ? ' (' + lead + '-day lead, same as their other items)' : '') : '') + '. ' +
        (status(r) === 'ok' ? 'It’s above its reorder point, so nothing to order yet.' : 'It’s already at or below its reorder point; want a draft order?');
    });
  }

  function suppliersReply(ctx) {
    return state(ctx).then(function (s) {
      var list = rules.suppliers(s.items);
      if (!list.length) return 'No suppliers yet. They appear as you add items from them.';
      return 'Our suppliers, with their lead times:\n' + list.map(function (x) {
        return '- **' + x.name + '**: ' + (x.leadDays !== null ? x.leadDays + ' days' : 'no lead time yet') + ', ' + x.items + (x.items === 1 ? ' item' : ' items') + (x.low ? ', ' + x.low + ' to reorder' : '');
      }).join('\n') + '\n\nThe longest lead sets the pace: order paper goods a week before you need them.';
    });
  }

  return {
    name: 'Stijn',
    role: 'Stock Keeper',
    greeting: 'Hello, I’m Stijn. I keep Harbor Street Café stocked. Oat milk is out, espresso beans and vanilla syrup are below their reorder points, and the cold cups are already on their way.',
    suggestions: [
      'What’s running low?',
      'Draft this week’s orders',
      'We used 3 bags of espresso beans today',
      'The cold cups arrived',
      'Track chai concentrate from Harbor Wholesale: 4 bottles on hand, reorder at 3',
    ],
    respond: function (text, ctx) {
      var lower = text.toLowerCase();
      if (/\b(place|buy|pay|purchase)\b.*\border\b|\border it\b/.test(lower)) return 'I only draft orders. You place them with the supplier, then tell me you sent one and I’ll track it until it arrives.';
      if (/\b(track|add)\b/.test(lower) && /\bon hand\b|\bfrom\b/.test(lower)) return added(ctx, text);
      if (/\b(used|sold|tossed|wasted|went through|threw out|got|received|counted|count)\b\s*\d|\d+\D{0,30}\b(came in|on the shelf)\b/.test(lower)) return stock(ctx, text);
      if (/\b(arrived|came in|delivered|showed up|delivery)\b/.test(lower)) return arrived(ctx, text);
      if (/\b(sent|placed|ordered|called in|emailed)\b/.test(lower)) return sent(ctx, text);
      if (/\b(draft|purchase orders?|make the orders?|po)\b/.test(lower)) return draft(ctx);
      if (/\b(supplier|suppliers|lead time|lead times|who supplies)\b/.test(lower)) return suppliersReply(ctx);
      if (/\b(low|running|short|out|order|need|reorder|stock)\b/.test(lower)) return low(ctx);
      return null;
    },
    reactions: {
      page_add_item: function (input, output) { return changed(output) || 'On the stock list.'; },
      page_record_stock: function (input, output) { return changed(output) || 'Logged.'; },
      page_draft_orders: function (input, output) { return changed(output) || 'Drafted.'; },
      page_update_order: function (input, output) { return changed(output) || 'Updated.'; },
    },
  };
})();

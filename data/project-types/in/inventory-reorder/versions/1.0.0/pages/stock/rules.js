// The inventory-store script's rules block, verbatim: the demo runs the same rules as the live store.
window.stockRules = (function () {
  'use strict';
// ── inventory-rules-start ──
// Pure stock rules: an item's status from its count, the quantity that fills it
// back to par, and the purchase-order drafts each supplier needs. run() applies
// one action to a snapshot of the stores and lists the store operations, so the
// live store and the page's demo share every rule. Kept self-contained between
// these sentinels; the page loads the same bytes as rules.js.
var DAY_MS = 86400000;
var OPEN = ['draft', 'sent'];

function pad(n) {
  return n < 10 ? '0' + n : String(n);
}
function localDay(ms) {
  var d = new Date(ms);
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
}
function addDays(day, n) {
  var d = new Date(String(day).slice(0, 10) + 'T12:00:00');
  d.setDate(d.getDate() + n);
  return localDay(d.getTime());
}
function daysUntil(day, nowMs) {
  return Math.round((Date.parse(String(day).slice(0, 10) + 'T00:00:00') - Date.parse(localDay(nowMs) + 'T00:00:00')) / DAY_MS);
}
function when(days) {
  if (days < 0) return -days + (days === -1 ? ' day late' : ' days late');
  if (days === 0) return 'today';
  return 'in ' + days + (days === 1 ? ' day' : ' days');
}
function num(value) {
  if (value === undefined || value === null || value === '') return null;
  var n = typeof value === 'number' ? value : Number(String(value).replace(/[$,\s]/g, ''));
  return isFinite(n) ? n : null;
}
function round2(n) {
  return Math.round(n * 100) / 100;
}
function key(text) {
  return String(text === undefined || text === null ? '' : text).trim().toLowerCase();
}
function unitText(unit, n) {
  var u = String(unit || '').trim();
  if (!u) return n === 1 ? 'unit' : 'units';
  if (n === 1) return u;
  var parts = u.split(' ');
  var first = parts[0];
  if (first.length <= 2 || /^(lbs|each|dozen)$/i.test(first) || /s$/i.test(first)) return u;
  parts[0] = /(x|ch|sh)$/i.test(first) ? first + 'es' : /[^aeiou]y$/i.test(first) ? first.slice(0, -1) + 'ies' : first + 's';
  return parts.join(' ');
}
function amount(n, unit) {
  return round2(n) + ' ' + unitText(unit, n);
}
function money(cents) {
  var parts = (Math.round(cents) / 100).toFixed(2).split('.');
  return '$' + parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',') + '.' + parts[1];
}
function stockStatus(f) {
  var onHand = num(f.onHand) || 0;
  var point = num(f.reorderPoint) || 0;
  return onHand <= 0 ? 'out' : onHand <= point ? 'low' : 'ok';
}
// Reordering fills an item back up to its par level; without a par, to twice its reorder point.
function orderQty(f) {
  var onHand = Math.max(0, num(f.onHand) || 0);
  var point = num(f.reorderPoint) || 0;
  var par = num(f.par) || 0;
  var target = par > point ? par : Math.max(point * 2, point + 1);
  return Math.max(1, Math.ceil(target - onHand));
}
function lineTotal(line) {
  return Math.round((num(line.qty) || 0) * (num(line.unitCostCents) || 0));
}
function orderTotal(lines) {
  return lines.reduce(function (sum, line) {
    return sum + lineTotal(line);
  }, 0);
}
function linesText(lines) {
  return lines
    .map(function (l) {
      return l.name + ' (' + amount(l.qty, l.unit) + ')';
    })
    .join(', ');
}
function supplierLead(items, supplier) {
  var hit = items.filter(function (r) {
    return key(r.fields.supplier) === key(supplier) && num(r.fields.leadDays) !== null;
  })[0];
  return hit ? num(hit.fields.leadDays) : null;
}
function suppliers(items) {
  var seen = {};
  var list = [];
  items.forEach(function (r) {
    var k = key(r.fields.supplier);
    if (!k) return;
    if (!seen[k]) {
      seen[k] = { name: r.fields.supplier, leadDays: null, items: 0, low: 0 };
      list.push(seen[k]);
    }
    seen[k].items += 1;
    if (stockStatus(r.fields) !== 'ok') seen[k].low += 1;
    if (seen[k].leadDays === null && num(r.fields.leadDays) !== null) seen[k].leadDays = num(r.fields.leadDays);
  });
  return list.sort(function (a, b) {
    return a.name.localeCompare(b.name);
  });
}
function words(text) {
  return key(text)
    .split(/[^a-z0-9]+/)
    .filter(function (w) {
      return w.length > 2;
    });
}
function findItem(items, wanted) {
  var text = String(wanted === undefined || wanted === null ? '' : wanted).trim();
  if (!text) throw new Error("Name the item ('Oat milk') or pass its id ('it-3'). Call stock_status to see them.");
  var byId = items.filter(function (r) {
    return r.id === text;
  });
  if (byId.length) return byId[0];
  var k = key(text);
  var exact = items.filter(function (r) {
    return key(r.fields.name) === k;
  });
  if (exact.length === 1) return exact[0];
  var stem = k.replace(/s$/, '');
  var asked = words(k);
  var tiers = [
    items.filter(function (r) {
      return key(r.fields.name).indexOf(stem) >= 0;
    }),
    items.filter(function (r) {
      var name = key(r.fields.name);
      return (
        asked.length > 0 &&
        asked.every(function (w) {
          return name.indexOf(w.replace(/s$/, '')) >= 0;
        })
      );
    }),
  ];
  for (var i = 0; i < tiers.length; i++) {
    if (tiers[i].length === 1) return tiers[i][0];
    if (tiers[i].length > 1) {
      throw new Error("More than one item matches '" + text + "': " + tiers[i].map(itemName).join(', ') + '. Pass the id.');
    }
  }
  throw new Error("No item matches '" + text + "'. Items: " + (items.map(itemName).join(', ') || 'none yet') + '.');
}
function itemName(r) {
  return r.id + ' ' + r.fields.name;
}
function orderName(o) {
  return o.id + ' ' + o.fields.supplier + ' (' + o.status + ')';
}
function findOrder(orders, wanted, status) {
  var text = String(wanted === undefined || wanted === null ? '' : wanted).trim();
  var open = orders.filter(function (o) {
    return OPEN.indexOf(o.status) >= 0;
  });
  if (!text) {
    if (open.length === 1) return open[0];
    throw new Error("Pass the order id ('po-2') or the supplier's name. Open orders: " + (open.map(orderName).join(', ') || 'none') + '.');
  }
  var byId = orders.filter(function (o) {
    return o.id === text || o.id === 'po-' + text.replace(/^#/, '');
  });
  if (byId.length) return byId[0];
  var k = key(text);
  var hits = open.filter(function (o) {
    var s = key(o.fields.supplier);
    return s && (s.indexOf(k) >= 0 || k.indexOf(s) >= 0);
  });
  if (!hits.length) {
    hits = open.filter(function (o) {
      return (o.fields.lines || []).some(function (l) {
        var n = key(l.name);
        return n.indexOf(k.replace(/s$/, '')) >= 0 || k.indexOf(n) >= 0;
      });
    });
  }
  var preferred = hits.filter(function (o) {
    return status === 'sent' ? o.status === 'draft' : status === 'received' ? o.status === 'sent' : true;
  });
  if (preferred.length === 1) return preferred[0];
  if (!preferred.length && hits.length === 1) return hits[0];
  if (hits.length) throw new Error("More than one open order matches '" + text + "': " + hits.map(orderName).join(', ') + '. Pass the id.');
  throw new Error("No open order matches '" + text + "'. Open orders: " + (open.map(orderName).join(', ') || 'none') + '.');
}

// A working copy of the stores. Each change is applied here and recorded as an operation
// the live store replays through rosterStore; the demo keeps the copy itself.
function transaction(state, nowMs) {
  var data = JSON.parse(JSON.stringify(state));
  var ops = [];
  var at = new Date(nowMs).toISOString();
  function copy(value) {
    return JSON.parse(JSON.stringify(value));
  }
  function get(store, id) {
    return (
      data[store].filter(function (r) {
        return r.id === id;
      })[0] || null
    );
  }
  return {
    data: data,
    ops: ops,
    get: get,
    add: function (store, prefix, status, fields, note) {
      var max = 0;
      data[store].forEach(function (r) {
        var m = /-(\d+)$/.exec(r.id);
        if (m && r.id.indexOf(prefix + '-') === 0) max = Math.max(max, Number(m[1]));
      });
      var id = prefix + '-' + (max + 1);
      data[store].push({ id: id, status: status, fields: copy(fields), createdAt: at, updatedAt: at, history: [{ at: at, from: null, to: status, note: note }] });
      ops.push({ store: store, op: 'add', id: id, status: status, fields: copy(fields), note: note });
      return id;
    },
    update: function (store, id, fields, note) {
      var r = get(store, id);
      r.fields = Object.assign({}, r.fields, copy(fields));
      r.updatedAt = at;
      if (note) (r.history = r.history || []).push({ at: at, from: r.status, to: r.status, note: note });
      ops.push({ store: store, op: 'update', id: id, fields: copy(fields), note: note });
    },
    transition: function (store, id, to, note) {
      var r = get(store, id);
      (r.history = r.history || []).push({ at: at, from: r.status, to: to, note: note });
      r.status = to;
      r.updatedAt = at;
      ops.push({ store: store, op: 'transition', id: id, to: to, note: note });
    },
  };
}
function syncStatus(t, id) {
  var r = t.get('items', id);
  var next = stockStatus(r.fields);
  if (next !== r.status) {
    t.transition('items', id, next, next === 'ok' ? 'Back above the reorder point' : next === 'low' ? 'At or below the reorder point' : 'Out of stock');
  }
}

// What each supplier needs: items at or below their reorder point that are not already on a sent order.
function needsBySupplier(items, orders) {
  var onSent = {};
  orders.forEach(function (o) {
    if (o.status === 'sent') {
      (o.fields.lines || []).forEach(function (l) {
        onSent[l.itemId] = o.id;
      });
    }
  });
  var groups = [];
  var byKey = {};
  items.forEach(function (r) {
    if (stockStatus(r.fields) === 'ok' || onSent[r.id] || !key(r.fields.supplier)) return;
    var k = key(r.fields.supplier);
    if (!byKey[k]) {
      byKey[k] = { key: k, supplier: r.fields.supplier, items: [] };
      groups.push(byKey[k]);
    }
    byKey[k].items.push(r);
  });
  return groups;
}
// Lines the person set by hand stay; every other line follows the stock.
function draftLines(items, existing) {
  var fixed = (existing || []).filter(function (l) {
    return l.fixed;
  });
  return fixed.concat(
    items
      .filter(function (r) {
        return !fixed.some(function (l) {
          return l.itemId === r.id;
        });
      })
      .map(function (r) {
        return { itemId: r.id, name: r.fields.name, unit: r.fields.unit || '', qty: orderQty(r.fields), unitCostCents: num(r.fields.unitCostCents) || 0 };
      }),
  );
}
function refreshDrafts(t, create, only) {
  var notes = [];
  var groups = needsBySupplier(t.data.items, t.data.orders);
  var done = {};
  function wanted(supplier) {
    return !only || key(supplier).indexOf(key(only)) >= 0 || key(only).indexOf(key(supplier)) >= 0;
  }
  t.data.orders
    .filter(function (o) {
      return o.status === 'draft';
    })
    .forEach(function (o) {
      if (!wanted(o.fields.supplier)) return;
      var k = key(o.fields.supplier);
      var group = done[k]
        ? null
        : groups.filter(function (g) {
            return g.key === k;
          })[0];
      done[k] = true;
      var lines = draftLines(group ? group.items : [], o.fields.lines);
      if (!lines.length) {
        t.transition('orders', o.id, 'cancelled', 'Nothing left to order');
        notes.push('Dropped draft ' + o.id + ' for ' + o.fields.supplier + ': nothing on it needs ordering now.');
        return;
      }
      if (JSON.stringify(lines) === JSON.stringify(o.fields.lines)) return;
      t.update('orders', o.id, { lines: lines, totalCents: orderTotal(lines) }, 'Refreshed from stock');
      notes.push('Updated draft ' + o.id + ' for ' + o.fields.supplier + ': ' + linesText(lines) + ', ' + money(orderTotal(lines)) + '.');
    });
  if (create) {
    groups.forEach(function (g) {
      if (done[g.key] || !wanted(g.supplier)) return;
      var lines = draftLines(g.items, []);
      var id = t.add('orders', 'po', 'draft', { supplier: g.supplier, lines: lines, totalCents: orderTotal(lines) }, 'Drafted from stock');
      notes.push('Drafted ' + id + ' for ' + g.supplier + ': ' + linesText(lines) + ', ' + money(orderTotal(lines)) + '.');
    });
  }
  return notes;
}

function addItem(t, input) {
  var name = String(input.name || '').trim();
  if (!name) throw new Error("add needs the item's 'name'.");
  var fields = {};
  ['onHand', 'reorderPoint', 'par', 'leadDays', 'unitCost'].forEach(function (k) {
    if (input[k] === undefined || input[k] === null || input[k] === '') return;
    var n = num(input[k]);
    if (n === null || n < 0) throw new Error(k + ' must be a number, zero or more (got ' + input[k] + ').');
    if (k === 'unitCost') fields.unitCostCents = Math.round(n * 100);
    else fields[k] = k === 'leadDays' ? Math.round(n) : round2(n);
  });
  if (input.unit) fields.unit = String(input.unit).trim();
  if (input.supplier) fields.supplier = String(input.supplier).trim();
  if (input.note) fields.notes = String(input.note).trim();
  var items = t.data.items;
  var existing = items.filter(function (r) {
    return key(r.fields.name) === key(name);
  })[0];
  var supplier = fields.supplier || (existing && existing.fields.supplier) || '';
  var others = supplier
    ? items.filter(function (r) {
        return key(r.fields.supplier) === key(supplier) && (!existing || r.id !== existing.id);
      })
    : [];
  // One supplier, one spelling and one lead time.
  if (fields.supplier && others.length) fields.supplier = others[0].fields.supplier;
  if (fields.supplier && fields.leadDays === undefined) {
    var lead = supplierLead(others, supplier);
    if (lead !== null) fields.leadDays = lead;
  }
  var id;
  var msg;
  if (existing) {
    t.update('items', existing.id, fields, 'Updated');
    id = existing.id;
    msg = 'Updated ' + existing.fields.name + ' (' + id + ').';
  } else {
    if (fields.onHand === undefined) throw new Error("A new item needs 'onHand': how many are on the shelf now.");
    fields = Object.assign({ name: name }, fields);
    id = t.add('items', 'it', stockStatus(fields), fields, 'Added');
    msg = 'Added ' + name + ' (' + id + ').';
    if (fields.reorderPoint === undefined) msg += ' It has no reorder point yet, so it only flags when it runs out.';
  }
  var lead2 = num(input.leadDays);
  var changed =
    lead2 !== null && supplier
      ? others.filter(function (r) {
          return num(r.fields.leadDays) !== Math.round(lead2);
        })
      : [];
  changed.forEach(function (r) {
    t.update('items', r.id, { leadDays: Math.round(lead2) }, 'Supplier lead time ' + Math.round(lead2) + ' days');
  });
  if (changed.length) msg += ' ' + supplier + "'s lead time is now " + Math.round(lead2) + ' days on every item from them.';
  syncStatus(t, id);
  var r = t.get('items', id);
  var status = r.status;
  msg +=
    ' ' + r.fields.name + ' has ' + amount(num(r.fields.onHand) || 0, r.fields.unit) +
    (status === 'ok' ? ' on hand, above its reorder point.' : status === 'low' ? ' on hand, at or below its reorder point of ' + (num(r.fields.reorderPoint) || 0) + '.' : ' on hand, so it is out.');
  return [msg].concat(refreshDrafts(t, false, null)).join(' ');
}

function recordStock(t, input, nowMs) {
  var r = t.get('items', findItem(t.data.items, input.item !== undefined && input.item !== '' ? input.item : input.name !== undefined && input.name !== '' ? input.name : input.id).id);
  var values = {};
  ['received', 'used', 'count'].forEach(function (k) {
    if (input[k] === undefined || input[k] === null || input[k] === '') return;
    var n = num(input[k]);
    if (n === null || n < 0) throw new Error(k + ' must be a number, zero or more (got ' + input[k] + ').');
    values[k] = round2(n);
  });
  if (values.count !== undefined && (values.received !== undefined || values.used !== undefined)) {
    throw new Error("Pass 'count' on its own for a shelf count, or 'received' and 'used' for what came in and went out; not both.");
  }
  if (values.count === undefined && values.received === undefined && values.used === undefined) {
    throw new Error("record_stock needs 'received' (came in), 'used' (sold, used or thrown out), or 'count' (counted on the shelf).");
  }
  var unit = r.fields.unit;
  var point = num(r.fields.reorderPoint) || 0;
  var before = num(r.fields.onHand) || 0;
  var wasStatus = stockStatus(r.fields);
  var done = [];
  var after;
  if (values.count !== undefined) {
    after = values.count;
    done.push('counted ' + amount(values.count, unit));
  } else {
    after = before + (values.received || 0) - (values.used || 0);
    if (values.received) done.push('received ' + amount(values.received, unit));
    if (values.used) done.push('used ' + amount(values.used, unit));
    if (!done.length) done.push('no change');
  }
  var short = after < 0;
  if (short) after = 0;
  after = round2(after);
  var change = done.join(' and ');
  t.update('items', r.id, values.count !== undefined ? { onHand: after, countedAt: localDay(nowMs) } : { onHand: after }, change.charAt(0).toUpperCase() + change.slice(1) + ': ' + round2(before) + ' to ' + after);
  syncStatus(t, r.id);
  var status = t.get('items', r.id).status;
  var msg = r.fields.name + ': ' + change + '; ' + round2(before) + ' before, ' + amount(after, unit) + ' now.';
  if (short) msg += ' More was used than the ' + round2(before) + ' on hand, so it is set to 0; count the shelf to correct it.';
  if (status !== wasStatus) {
    msg += status === 'out' ? ' It is out.' : status === 'low' ? ' It is now at or below its reorder point of ' + point + '.' : ' It is back above its reorder point.';
  } else if (status !== 'ok') {
    msg += ' Still ' + status + ' (reorder point ' + point + ').';
  }
  return [msg].concat(refreshDrafts(t, false, null)).join(' ');
}

function draftOrders(t, input) {
  var only = String(input.supplier || '').trim();
  var notes = refreshDrafts(t, true, only || null);
  var orphans = t.data.items.filter(function (r) {
    return stockStatus(r.fields) !== 'ok' && !key(r.fields.supplier);
  });
  if (!notes.length) {
    notes.push(
      only
        ? 'Nothing from ' + only + ' is at or below its reorder point without an order already.'
        : 'Nothing is at or below its reorder point without an order already, so there is nothing to draft.',
    );
  } else {
    notes.push('These are drafts: check them, place them with the supplier, then mark each one sent.');
  }
  if (orphans.length && !only) {
    notes.push(
      orphans
        .map(function (r) {
          return r.fields.name;
        })
        .join(', ') + (orphans.length === 1 ? ' needs' : ' need') + ' a supplier before it can go on an order.',
    );
  }
  return notes.join(' ');
}

function updateOrder(t, input, nowMs) {
  var status = key(input.status);
  if (status && ['sent', 'received', 'cancelled'].indexOf(status) < 0) throw new Error("status must be 'sent', 'received', or 'cancelled'.");
  var hasLine = input.item !== undefined && input.item !== null && input.item !== '' && num(input.qty) !== null;
  if (!status && !hasLine) throw new Error("update_order needs 'status' (sent, received or cancelled), or 'item' and 'qty' to change a line on a draft.");
  var o = t.get('orders', findOrder(t.data.orders, input.order !== undefined && input.order !== '' ? input.order : input.id !== undefined && input.id !== '' ? input.id : input.supplier, status).id);
  var supplier = o.fields.supplier;
  var msgs = [];
  if (hasLine) {
    if (o.status !== 'draft') throw new Error(o.id + ' is ' + o.status + '; only a draft can change.');
    var qty = num(input.qty);
    if (qty < 0) throw new Error('qty must be zero or more.');
    var item = findItem(t.data.items, input.item);
    var line = { itemId: item.id, name: item.fields.name, unit: item.fields.unit || '', qty: round2(qty), unitCostCents: num(item.fields.unitCostCents) || 0, fixed: true };
    var lines = (o.fields.lines || []).slice();
    var at = -1;
    lines.forEach(function (l, i) {
      if (l.itemId === item.id) at = i;
    });
    if (qty === 0) {
      if (at >= 0) lines.splice(at, 1);
    } else if (at >= 0) lines[at] = line;
    else lines.push(line);
    if (!lines.length) {
      t.transition('orders', o.id, 'cancelled', 'Last line removed');
      msgs.push('Took ' + item.fields.name + ' off ' + o.id + ', which leaves nothing on it, so the draft is dropped.');
    } else {
      t.update('orders', o.id, { lines: lines, totalCents: orderTotal(lines) }, 'Line changed by hand');
      msgs.push(qty === 0 ? 'Took ' + item.fields.name + ' off ' + o.id + '; it now comes to ' + money(orderTotal(lines)) + '.' : o.id + ' now orders ' + amount(qty, item.fields.unit) + ' ' + item.fields.name + ', ' + money(orderTotal(lines)) + ' in all.');
    }
  }
  if (status === 'sent') {
    if (o.status !== 'draft') throw new Error(o.id + ' is already ' + o.status + '.');
    var lead = supplierLead(t.data.items, supplier);
    var today = localDay(nowMs);
    t.update('orders', o.id, lead !== null ? { sentAt: today, leadDays: lead, expectedAt: addDays(today, lead) } : { sentAt: today }, input.note ? String(input.note) : undefined);
    t.transition('orders', o.id, 'sent', 'Sent');
    msgs.push('Marked ' + o.id + ' to ' + supplier + ' sent' + (lead !== null ? '; with a ' + lead + '-day lead it should arrive by ' + addDays(today, lead) + '.' : '.'));
  } else if (status === 'received') {
    if (o.status === 'received' || o.status === 'cancelled') throw new Error(o.id + ' is already ' + o.status + '.');
    var got = [];
    (o.fields.lines || []).forEach(function (l) {
      var r = t.get('items', l.itemId);
      if (!r) return;
      var before = num(r.fields.onHand) || 0;
      var after = round2(before + (num(l.qty) || 0));
      t.update('items', r.id, { onHand: after }, 'Received ' + amount(l.qty, l.unit) + ' on ' + o.id + ': ' + round2(before) + ' to ' + after);
      syncStatus(t, r.id);
      got.push(r.fields.name + ' ' + round2(before) + ' to ' + amount(after, r.fields.unit));
    });
    t.update('orders', o.id, { receivedAt: localDay(nowMs) }, input.note ? String(input.note) : undefined);
    t.transition('orders', o.id, 'received', 'Received');
    msgs.push('Received ' + o.id + ' from ' + supplier + (got.length ? ' and added it to stock: ' + got.join(', ') + '.' : '.'));
    msgs = msgs.concat(refreshDrafts(t, false, null));
  } else if (status === 'cancelled') {
    if (o.status === 'received' || o.status === 'cancelled') throw new Error(o.id + ' is already ' + o.status + '.');
    t.transition('orders', o.id, 'cancelled', input.note ? String(input.note) : 'Cancelled');
    msgs.push('Cancelled ' + o.id + ' to ' + supplier + '.');
  }
  return msgs.join(' ');
}

function onOrderText(r, orders) {
  var o = orders.filter(function (x) {
    return (
      OPEN.indexOf(x.status) >= 0 &&
      (x.fields.lines || []).some(function (l) {
        return l.itemId === r.id;
      })
    );
  })[0];
  if (!o) return '';
  return o.status === 'draft' ? 'on draft ' + o.id : 'on order ' + o.id + (o.fields.expectedAt ? ', expected ' + o.fields.expectedAt : '');
}
function itemLine(r, orders) {
  var f = r.fields;
  var status = stockStatus(f);
  var onOrder = onOrderText(r, orders);
  var text =
    f.name + ' (' + r.id + '): ' + amount(num(f.onHand) || 0, f.unit) + ' on hand' + (status === 'ok' ? '' : ', ' + status) +
    ', reorder at ' + (num(f.reorderPoint) || 0) + (num(f.par) ? ', par ' + num(f.par) : '');
  if (status !== 'ok') {
    text += onOrder.indexOf('on order') === 0 ? '; ' + onOrder : '; order ' + amount(orderQty(f), f.unit) + (onOrder ? ' (' + onOrder + ')' : '');
  }
  text += f.supplier ? '; supplier ' + f.supplier + (num(f.leadDays) !== null ? ', ' + num(f.leadDays) + '-day lead' : '') : '; no supplier yet';
  return text;
}
function orderLine(o, nowMs) {
  var f = o.fields;
  var text = o.id + ' ' + f.supplier + ': ' + linesText(f.lines || []) + ', ' + money(num(f.totalCents) || 0);
  if (o.status === 'sent') text += ', sent ' + f.sentAt + (f.expectedAt ? ', expected ' + f.expectedAt + ' (' + when(daysUntil(f.expectedAt, nowMs)) + ')' : '');
  if (o.status === 'received') text += ', received ' + f.receivedAt;
  return text;
}
function urgency(a, b) {
  var sa = stockStatus(a.fields);
  var sb = stockStatus(b.fields);
  if (sa !== sb) return sa === 'out' ? -1 : sb === 'out' ? 1 : 0;
  var ra = (num(a.fields.onHand) || 0) / Math.max(1, num(a.fields.reorderPoint) || 1);
  var rb = (num(b.fields.onHand) || 0) / Math.max(1, num(b.fields.reorderPoint) || 1);
  return ra - rb || String(a.fields.name).localeCompare(String(b.fields.name));
}
function picture(items, orders, nowMs) {
  var needs = items
    .filter(function (r) {
      return stockStatus(r.fields) !== 'ok';
    })
    .sort(urgency);
  var out = needs.filter(function (r) {
    return stockStatus(r.fields) === 'out';
  }).length;
  var sent = orders
    .filter(function (o) {
      return o.status === 'sent';
    })
    .sort(function (a, b) {
      return String(a.fields.expectedAt || '').localeCompare(String(b.fields.expectedAt || ''));
    });
  var drafts = orders.filter(function (o) {
    return o.status === 'draft';
  });
  var parts = [items.length + (items.length === 1 ? ' item' : ' items') + ' tracked: ' + out + ' out, ' + (needs.length - out) + ' low.'];
  // One list, out first: asked "what's running low", a model reads a separate out-of-stock list as out of scope.
  parts.push(
    needs.length
      ? 'Running low or out, out first: ' + needs.map(function (r) { return itemLine(r, orders); }).join(' | ') + '.'
      : items.length
        ? 'Nothing is at or below its reorder point.'
        : 'Nothing tracked yet.',
  );
  if (sent.length) parts.push('On order: ' + sent.map(function (o) { return orderLine(o, nowMs); }).join(' | ') + '.');
  if (drafts.length) parts.push('Drafts for the person to check and send: ' + drafts.map(function (o) { return orderLine(o, nowMs); }).join(' | ') + '.');
  var list = suppliers(items);
  if (list.length) {
    parts.push(
      'Suppliers: ' +
        list
          .map(function (s) {
            return s.name + (s.leadDays !== null ? ' (' + s.leadDays + '-day lead)' : ' (no lead time yet)');
          })
          .join(', ') +
        '.',
    );
  }
  return { out: out, low: needs.length - out, onOrder: sent.length, drafts: drafts.length, summary: parts.join(' ') };
}
function listing(items, orders, nowMs) {
  var lines = items
    .slice()
    .sort(function (a, b) {
      return String(a.fields.name).localeCompare(String(b.fields.name));
    })
    .map(function (r) {
      return '[' + stockStatus(r.fields) + '] ' + itemLine(r, orders) + (num(r.fields.unitCostCents) ? ', ' + money(r.fields.unitCostCents) + ' each' : '');
    });
  var open = orders.filter(function (o) {
    return OPEN.indexOf(o.status) >= 0;
  });
  var closed = orders
    .filter(function (o) {
      return OPEN.indexOf(o.status) < 0;
    })
    .slice(-5);
  open.concat(closed).forEach(function (o) {
    lines.push('[' + o.status + '] ' + orderLine(o, nowMs));
  });
  return lines.join('\n') || 'Nothing tracked yet.';
}
function run(action, input, state, nowMs) {
  var t = transaction(state, nowMs);
  var note = '';
  input = input || {};
  if (action === 'add') note = addItem(t, input);
  else if (action === 'stock') note = recordStock(t, input, nowMs);
  else if (action === 'draft_orders') note = draftOrders(t, input);
  else if (action === 'update_order') note = updateOrder(t, input, nowMs);
  else if (action !== 'status' && action !== 'list') {
    throw new Error("Unknown action '" + action + "'. Use status, add, stock, draft_orders, update_order, or list.");
  }
  var view = picture(t.data.items, t.data.orders, nowMs);
  return {
    ops: t.ops,
    state: t.data,
    output: {
      out: view.out,
      low: view.low,
      onOrder: view.onOrder,
      drafts: view.drafts,
      tracked: t.data.items.length,
      summary: action === 'list' ? listing(t.data.items, t.data.orders, nowMs) : (note ? note + ' ' : '') + view.summary,
    },
  };
}
// ── inventory-rules-end ──
  return { run: run, stockStatus: stockStatus, orderQty: orderQty, amount: amount, unitText: unitText, money: money, suppliers: suppliers, localDay: localDay, addDays: addDays, daysUntil: daysUntil, num: num };
})();

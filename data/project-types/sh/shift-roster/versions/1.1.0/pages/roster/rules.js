// The roster-store script's rules block, verbatim: the demo runs the same rules as the live store.
window.rosterRules = (function () {
  'use strict';
// ── roster-rules-start ──
// Pure roster rules: shift times and hours, who can take a shift (role,
// availability, overlaps, and the rest and hours limits the business stated),
// each week's coverage and conflicts, and run(), which applies one action to a
// snapshot of the stores and lists the store operations, so the live store and
// the page's demo share every rule. Kept self-contained between these
// sentinels; the page loads the same bytes as rules.js.
var DAY_MS = 86400000;
var WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
var SHORT_DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
var PARTS = { 'all day': null, morning: ['00:00', '12:00'], afternoon: ['12:00', '17:00'], evening: ['17:00', '24:00'] };

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
function weekdayIndex(day) {
  return new Date(String(day).slice(0, 10) + 'T12:00:00').getDay();
}
function mondayOf(day) {
  return addDays(day, -((weekdayIndex(day) + 6) % 7));
}
function key(text) {
  return String(text === undefined || text === null ? '' : text).trim().toLowerCase();
}
function num(value) {
  if (value === undefined || value === null || value === '') return null;
  var n = typeof value === 'number' ? value : Number(String(value).trim());
  return isFinite(n) ? n : null;
}
function round1(n) {
  return Math.round(n * 10) / 10;
}
function given(value) {
  return value !== undefined && value !== null && value !== '';
}
function normalizeDate(text, nowMs) {
  var raw = key(text);
  if (!raw) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  var today = localDay(nowMs);
  if (raw === 'today' || raw === 'this week') return today;
  if (raw === 'tomorrow') return addDays(today, 1);
  if (raw === 'next week') return addDays(mondayOf(today), 7);
  var bare = raw.replace(/^(this|next|on)\s+/, '').replace(/s$/, '');
  var w = WEEKDAYS.indexOf(bare);
  if (w >= 0) return addDays(today, (w - weekdayIndex(today) + 7) % 7);
  if (/\d{4}/.test(raw)) {
    var parsed = Date.parse(String(text).trim());
    if (isFinite(parsed)) return localDay(parsed);
  }
  return null;
}
function normalizeTime(text) {
  var raw = key(text).replace(/\s+/g, '').replace(/\./g, '');
  if (!raw) return null;
  if (raw === 'noon') return '12:00';
  if (raw === 'midnight') return '00:00';
  var m = /^(\d{1,2})(?::?(\d{2}))?(am|pm|a|p)?$/.exec(raw);
  if (!m) return null;
  var h = Number(m[1]);
  var min = m[2] ? Number(m[2]) : 0;
  if (m[3]) {
    if (h < 1 || h > 12) return null;
    if (m[3].charAt(0) === 'p' && h !== 12) h += 12;
    if (m[3].charAt(0) === 'a' && h === 12) h = 0;
  }
  if (h > 24 || min > 59 || (h === 24 && min > 0)) return null;
  return pad(h % 24) + ':' + pad(min);
}
function minutes(hhmm) {
  var p = String(hhmm).split(':');
  return Number(p[0]) * 60 + Number(p[1] || 0);
}
// A shift that ends at or before its start runs past midnight.
function span(f) {
  var s = minutes(f.start);
  var e = minutes(f.end);
  var over = e <= s;
  return {
    startAt: Date.parse(f.date + 'T' + f.start + ':00'),
    endAt: Date.parse((over ? addDays(f.date, 1) : f.date) + 'T' + f.end + ':00'),
    startMin: s,
    endMin: over ? e + 1440 : e,
    hours: ((over ? e + 1440 : e) - s) / 60,
  };
}
function normalizeDay(text, nowMs) {
  var raw = key(text);
  if (!raw) return null;
  if (/^(every ?day|daily|all week|always)$/.test(raw)) return 'every day';
  if (/^(weekdays?|mon(day)?\s*(-|to|through)\s*fri(day)?)$/.test(raw)) return 'weekdays';
  if (/^weekends?$/.test(raw)) return 'weekends';
  var bare = raw.replace(/^(every|on)\s+/, '').replace(/s$/, '');
  if (WEEKDAYS.indexOf(bare) >= 0) return bare;
  return normalizeDate(text, nowMs);
}
function dayText(day) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(day)) return 'on ' + SHORT_DAYS[weekdayIndex(day)] + ' ' + day;
  if (day === 'every day') return 'every day';
  if (day === 'weekdays' || day === 'weekends') return 'on ' + day;
  return 'on ' + day.charAt(0).toUpperCase() + day.slice(1) + 's';
}
function windowText(f) {
  if (!f.from || !f.to) return 'all day';
  if (f.from === '00:00') return 'until ' + f.to;
  if (f.to === '24:00') return 'from ' + f.from;
  return f.from + '–' + f.to;
}
function availText(f) {
  return dayText(f.day) + ' ' + windowText(f);
}
function dayMatches(day, date) {
  var d = key(day);
  if (/^\d{4}-\d{2}-\d{2}$/.test(d)) return d === date;
  var w = weekdayIndex(date);
  if (d === 'every day') return true;
  if (d === 'weekdays') return w >= 1 && w <= 5;
  if (d === 'weekends') return w === 0 || w === 6;
  return WEEKDAYS[w] === d;
}
function blocks(entry, shiftFields) {
  if (entry.status !== 'active') return false;
  var f = entry.fields;
  if (!dayMatches(f.day, shiftFields.date)) return false;
  if (!f.from || !f.to) return true;
  var sp = span(shiftFields);
  var from = minutes(f.from);
  var to = minutes(f.to);
  if (to <= from) to += 1440;
  return sp.startMin < to && from < sp.endMin;
}
function staffOn(s) {
  return Array.isArray(s.fields.staff) ? s.fields.staff : [];
}
function neededOf(s) {
  return Math.max(1, Math.round(num(s.fields.needed) || 1));
}
function person(data, id) {
  return (
    data.staff.filter(function (p) {
      return p.id === id;
    })[0] || null
  );
}
function nameOf(data, id) {
  var p = person(data, id);
  return p ? p.fields.name : id;
}
function namesOn(data, s) {
  return staffOn(s)
    .map(function (id) {
      return nameOf(data, id);
    })
    .join(', ');
}
function limitFor(p, rules) {
  var own = num(p.fields.maxHours);
  if (own !== null && own > 0) return own;
  var all = num(rules.maxWeekHours);
  return all !== null && all > 0 ? all : null;
}
function byStart(a, b) {
  return (a.fields.date + ' ' + a.fields.start).localeCompare(b.fields.date + ' ' + b.fields.start) || String(a.fields.role).localeCompare(String(b.fields.role));
}
function weekShifts(shifts, monday) {
  var end = addDays(monday, 7);
  return shifts
    .filter(function (s) {
      return s.fields.date >= monday && s.fields.date < end;
    })
    .sort(byStart);
}
function hoursFor(shifts, id, monday) {
  return weekShifts(shifts, monday)
    .filter(function (s) {
      return staffOn(s).indexOf(id) >= 0;
    })
    .reduce(function (h, s) {
      return h + span(s.fields).hours;
    }, 0);
}
function shiftLabel(s) {
  var f = s.fields;
  return SHORT_DAYS[weekdayIndex(f.date)] + ' ' + f.date + ' ' + f.start + '–' + f.end + (f.role ? ' ' + f.role : '') + ' (' + s.id + ')';
}
// Why a person cannot take a shift, from the roster's facts and the business's stated rules only.
function problems(p, shift, data, opts) {
  var rules = data.rules || {};
  var f = shift.fields;
  var sp = span(f);
  var name = p.fields.name;
  var out = [];
  if (p.status !== 'active') out.push(name + ' is not on the active staff');
  var roles = p.fields.roles || [];
  if (f.role && roles.length && roles.indexOf(key(f.role)) < 0) out.push(name + ' does not work ' + f.role + ' (works ' + roles.join(', ') + ')');
  data.availability.forEach(function (a) {
    if (a.fields.staffId === p.id && blocks(a, f)) out.push(name + ' is unavailable ' + availText(a.fields));
  });
  var rest = num(rules.minRestHours);
  data.shifts.forEach(function (s) {
    if (s.id === shift.id || staffOn(s).indexOf(p.id) < 0) return;
    var o = span(s.fields);
    if (opts.earlierOnly && (o.startAt > sp.startAt || (o.startAt === sp.startAt && s.id > shift.id))) return;
    if (o.startAt < sp.endAt && sp.startAt < o.endAt) {
      out.push(name + ' is also on ' + shiftLabel(s) + ', which overlaps');
      return;
    }
    if (rest) {
      var gap = (o.endAt <= sp.startAt ? sp.startAt - o.endAt : o.startAt - sp.endAt) / 3600000;
      if (gap < rest) out.push(name + ' would get ' + round1(gap) + ' hours of rest next to ' + shiftLabel(s) + ' (rule: at least ' + rest + ')');
    }
  });
  if (opts.hours) {
    var limit = limitFor(p, rules);
    if (limit !== null) {
      var h =
        hoursFor(
          data.shifts.filter(function (s) {
            return s.id !== shift.id;
          }),
          p.id,
          mondayOf(f.date),
        ) + sp.hours;
      if (h > limit) out.push(name + ' would have ' + round1(h) + ' hours that week (limit ' + limit + ')');
    }
  }
  return out;
}
// Who could take a shift, fewest hours that week first.
function freeFor(shift, data) {
  var monday = mondayOf(shift.fields.date);
  return data.staff
    .filter(function (p) {
      return p.status === 'active' && staffOn(shift).indexOf(p.id) < 0 && !problems(p, shift, data, { hours: true }).length;
    })
    .map(function (p) {
      return { id: p.id, name: p.fields.name, hours: round1(hoursFor(data.shifts, p.id, monday)) };
    })
    .sort(function (a, b) {
      return a.hours - b.hours || a.name.localeCompare(b.name);
    });
}
function weekView(data, monday, nowMs) {
  var rules = data.rules || {};
  var list = weekShifts(data.shifts, monday);
  var gaps = [];
  var conflicts = [];
  var hours = {};
  var toApprove = 0;
  var maxLen = num(rules.maxShiftHours);
  list.forEach(function (s) {
    var on = staffOn(s);
    var sp = span(s.fields);
    if (s.status !== 'approved') toApprove += 1;
    if (on.length < neededOf(s)) gaps.push({ shift: s, open: neededOf(s) - on.length, past: sp.endAt <= nowMs });
    if (maxLen && sp.hours > maxLen) conflicts.push({ shiftId: s.id, text: shiftLabel(s) + ' is ' + round1(sp.hours) + ' hours long (rule: at most ' + maxLen + ')' });
    on.forEach(function (id) {
      hours[id] = (hours[id] || 0) + sp.hours;
      var p = person(data, id);
      if (!p) {
        conflicts.push({ shiftId: s.id, text: shiftLabel(s) + ' lists ' + id + ', who is not on the staff list' });
        return;
      }
      problems(p, s, data, { hours: false, earlierOnly: true }).forEach(function (text) {
        conflicts.push({ shiftId: s.id, staffId: id, text: shiftLabel(s) + ': ' + text });
      });
    });
  });
  data.staff.forEach(function (p) {
    var limit = limitFor(p, rules);
    var h = hours[p.id] || 0;
    if (limit !== null && h > limit) conflicts.push({ staffId: p.id, text: p.fields.name + ' has ' + round1(h) + ' hours in the week of Mon ' + monday + ' (limit ' + limit + ')' });
  });
  return { monday: monday, shifts: list, gaps: gaps, conflicts: conflicts, hours: hours, toApprove: toApprove };
}
function rulesText(rules) {
  var list = [];
  if (num(rules.maxWeekHours)) list.push('at most ' + rules.maxWeekHours + ' hours a week per person, unless their own limit says otherwise');
  if (num(rules.minRestHours)) list.push('at least ' + rules.minRestHours + ' hours between shifts');
  if (num(rules.maxShiftHours)) list.push('shifts no longer than ' + rules.maxShiftHours + ' hours');
  (rules.notes || []).forEach(function (n) {
    list.push('"' + String(n).replace(/[.\s]+$/, '') + '"');
  });
  return list.length
    ? 'Rules the business set: ' + list.join('; ') + '.'
    : 'The business has not stated any scheduling rules; the roster checks only availability, overlaps, roles and personal hour limits.';
}
function picture(data, nowMs, week) {
  var rules = data.rules || {};
  var first = mondayOf(week || localDay(nowMs));
  var mondays = week ? [first] : [first, addDays(first, 7)];
  var views = mondays.map(function (m) {
    return weekView(data, m, nowMs);
  });
  var label = function (i) {
    return week ? 'The week of Mon ' + views[i].monday : (i === 0 ? 'This week' : 'Next week') + ' (from Mon ' + views[i].monday + ')';
  };
  var parts = [];
  views.forEach(function (v, i) {
    var open = v.gaps.reduce(function (sum, g) {
      return sum + g.open;
    }, 0);
    parts.push(
      label(i) + ': ' +
        (v.shifts.length
          ? v.shifts.length + (v.shifts.length === 1 ? ' shift, ' : ' shifts, ') + open + (open === 1 ? ' open spot, ' : ' open spots, ') +
            v.conflicts.length + (v.conflicts.length === 1 ? ' conflict, ' : ' conflicts, ') +
            (v.toApprove ? v.toApprove + ' waiting for the person to approve' : 'all approved')
          : 'no shifts yet') + '.',
    );
  });
  // One list, soonest first: the answer to "where are we short?".
  var gaps = [];
  views.forEach(function (v) {
    v.gaps.forEach(function (g) {
      if (!g.past) gaps.push(g);
    });
  });
  var openSpots = gaps.reduce(function (sum, g) {
    return sum + g.open;
  }, 0);
  parts.push(
    gaps.length
      ? 'Open spots, soonest first: ' +
          gaps
            .map(function (g) {
              var free = freeFor(g.shift, data);
              return (
                shiftLabel(g.shift) + ' needs ' + g.open + ' more' + (staffOn(g.shift).length ? ' (on it: ' + namesOn(data, g.shift) + ')' : '') + '; free: ' +
                (free.length
                  ? free
                      .slice(0, 4)
                      .map(function (x) {
                        return x.name + ' (' + x.id + ', ' + x.hours + 'h)';
                      })
                      .join(', ')
                  : 'nobody passes every rule')
              );
            })
            .join(' | ') + '.'
      : 'No open spots.',
  );
  var conflicts = [];
  views.forEach(function (v) {
    v.conflicts.forEach(function (c) {
      conflicts.push(c.text);
    });
  });
  parts.push(conflicts.length ? 'Conflicts to fix: ' + conflicts.join(' | ') + '.' : 'No conflicts with availability or the rules.');
  views.forEach(function (v, i) {
    if (!v.shifts.length) return;
    var people = data.staff.filter(function (p) {
      return p.status === 'active' || v.hours[p.id];
    });
    parts.push(
      (week ? 'Hours that week' : i === 0 ? 'Hours this week' : 'Hours next week') + ': ' +
        people
          .map(function (p) {
            var limit = limitFor(p, rules);
            var roles = p.fields.roles || [];
            return p.fields.name + ' (' + p.id + (roles.length ? ', ' + roles.join('/') : '') + ') ' + round1(v.hours[p.id] || 0) + (limit !== null ? ' of ' + limit : '') + 'h';
          })
          .join(', ') + '.',
    );
    var days = [];
    // Mark drafts per shift only when a week is part approved; the headline covers the rest.
    var mixed = v.toApprove > 0 && v.toApprove < v.shifts.length;
    for (var d = 0; d < 7; d++) {
      var date = addDays(v.monday, d);
      var todays = v.shifts.filter(function (s) {
        return s.fields.date === date;
      });
      if (!todays.length) continue;
      days.push(
        SHORT_DAYS[weekdayIndex(date)] + ' ' + date.slice(5) + ': ' +
          todays
            .map(function (s) {
              var on = staffOn(s);
              return (
                s.fields.start + '–' + s.fields.end + ' ' + (s.fields.role || 'shift') + ' ' + (on.length ? namesOn(data, s) : 'nobody') +
                (on.length < neededOf(s) ? ' (' + (neededOf(s) - on.length) + ' open)' : '') + (mixed && s.status !== 'approved' ? ' [draft]' : '') + ' (' + s.id + ')'
              );
            })
            .join('; '),
      );
    }
    parts.push((week ? 'By day' : i === 0 ? 'This week by day' : 'Next week by day') + ': ' + days.join(' / ') + '.');
  });
  if (!data.staff.length) parts.push('No staff on the roster yet.');
  var away = data.availability.filter(function (a) {
    return a.status === 'active';
  });
  if (away.length) {
    parts.push(
      'Unavailable: ' +
        away
          .map(function (a) {
            return nameOf(data, a.fields.staffId) + ' ' + availText(a.fields);
          })
          .join('; ') + '.',
    );
  }
  parts.push(rulesText(rules));
  return {
    monday: first,
    openSpots: openSpots,
    conflicts: conflicts.length,
    toApprove: views.reduce(function (sum, v) {
      return sum + v.toApprove;
    }, 0),
    shifts: views.reduce(function (sum, v) {
      return sum + v.shifts.length;
    }, 0),
    summary: parts.join(' '),
  };
}

function findStaff(staff, wanted) {
  var text = String(given(wanted) ? wanted : '').trim();
  if (!text) throw new Error("Name the person ('Ana') or pass their id ('st-1').");
  var byId = staff.filter(function (p) {
    return p.id === text;
  });
  if (byId.length) return byId[0];
  var k = key(text);
  var exact = staff.filter(function (p) {
    return key(p.fields.name) === k;
  });
  if (exact.length === 1) return exact[0];
  var partial = staff.filter(function (p) {
    var name = key(p.fields.name);
    return name.indexOf(k) === 0 || name.split(/\s+/).indexOf(k) >= 0 || k.split(/\s+/).indexOf(name.split(/\s+/)[0]) >= 0;
  });
  if (partial.length === 1) return partial[0];
  var list = staff
    .map(function (p) {
      return p.id + ' ' + p.fields.name;
    })
    .join(', ');
  if (partial.length > 1) throw new Error("More than one person matches '" + text + "': " + partial.map(function (p) { return p.id + ' ' + p.fields.name; }).join(', ') + '. Pass the id.');
  throw new Error("Nobody on the staff list matches '" + text + "'. Staff: " + (list || 'none yet; add them with add_staff') + '.');
}
function findShift(shifts, input, nowMs) {
  var id = String(given(input.id) ? input.id : given(input.shift) ? input.shift : '').trim();
  if (id) {
    var hit = shifts.filter(function (s) {
      return s.id === id;
    })[0];
    if (hit) return hit;
    if (/^sh-\d+$/.test(id)) throw new Error('No shift ' + id + '. Call roster_status to see the shifts and their ids.');
  }
  var date = given(input.date) ? normalizeDate(input.date, nowMs) : id ? normalizeDate(id, nowMs) : null;
  if (!date) throw new Error("Pass the shift's id ('sh-4'), or its date (YYYY-MM-DD) with its start time or role.");
  var start = given(input.start) ? normalizeTime(input.start) : null;
  var role = key(input.role);
  var that = shifts
    .filter(function (s) {
      return s.fields.date === date;
    })
    .sort(byStart);
  var hits = that.filter(function (s) {
    return (!start || s.fields.start === start) && (!role || key(s.fields.role) === role);
  });
  if (hits.length === 1) return hits[0];
  if (hits.length > 1) throw new Error('More than one shift matches on ' + date + ': ' + hits.map(shiftLabel).join(', ') + '. Pass the id.');
  throw new Error('No shift matches on ' + date + '. Shifts that day: ' + (that.map(shiftLabel).join(', ') || 'none') + '.');
}

// A working copy of the stores. Each change is applied here and recorded as an operation
// the live store replays through rosterStore (rules.json is written whole); the demo keeps the copy.
function transaction(state, nowMs) {
  var data = JSON.parse(JSON.stringify(state));
  data.rules = data.rules || { version: 1, notes: [] };
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
    focus: null,
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
    setRules: function (value) {
      data.rules = copy(value);
      ops.push({ store: 'rules', op: 'set', value: copy(value) });
    },
  };
}
// The crew proposes; the person approves. A crew change to an approved shift sends it back for approval.
function reopen(t, id, byPerson) {
  var s = t.get('shifts', id);
  if (!byPerson && s.status === 'approved') {
    t.transition('shifts', id, 'draft', 'Changed by the crew; needs approval again');
    return true;
  }
  return false;
}
function parseRoles(text) {
  var raw = Array.isArray(text) ? text.join(',') : String(text || '');
  return raw
    .split(/,|\/|;|&|\band\b/)
    .map(key)
    .filter(function (r, i, all) {
      return r && all.indexOf(r) === i;
    });
}
function addStaff(t, input, nowMs) {
  var name = String(input.name || '').trim();
  if (!name) throw new Error("add_staff needs the person's 'name'.");
  var fields = {};
  if (given(input.roles)) fields.roles = parseRoles(input.roles);
  if (given(input.maxHours)) {
    var h = num(input.maxHours);
    if (h === null || h < 0) throw new Error('maxHours must be a number of hours, zero or more (0 removes their limit).');
    fields.maxHours = h > 0 ? h : null;
  }
  if (input.note) fields.notes = String(input.note).trim();
  var status = key(input.status);
  if (status && status !== 'active' && status !== 'inactive') throw new Error("status must be 'active' or 'inactive'.");
  var existing = t.data.staff.filter(function (p) {
    return key(p.fields.name) === key(name);
  })[0];
  var id;
  var msg;
  if (existing) {
    id = existing.id;
    if (Object.keys(fields).length) t.update('staff', id, fields, 'Updated');
    if (status && status !== existing.status) t.transition('staff', id, status, status === 'inactive' ? 'No longer on the active staff' : 'Back on the active staff');
    msg = 'Updated ' + existing.fields.name + ' (' + id + ').';
  } else {
    id = t.add('staff', 'st', status || 'active', Object.assign({ name: name, roles: [] }, fields), 'Added');
    msg = 'Added ' + name + ' (' + id + ').';
  }
  var p = t.get('staff', id);
  var roles = p.fields.roles || [];
  msg += ' ' + p.fields.name + ' works ' + (roles.length ? roles.join(', ') : 'any role') + (num(p.fields.maxHours) ? ', up to ' + p.fields.maxHours + ' hours a week' : '') + (p.status === 'inactive' ? ', and is not on the active staff' : '') + '.';
  if (p.status === 'inactive') {
    var upcoming = t.data.shifts.filter(function (s) {
      return staffOn(s).indexOf(id) >= 0 && span(s.fields).endAt > nowMs;
    });
    if (upcoming.length) msg += ' Still on ' + upcoming.sort(byStart).map(shiftLabel).join(', ') + '; those spots need someone else.';
  }
  return msg;
}
function setAvailability(t, input, nowMs) {
  var p = findStaff(t.data.staff, given(input.staff) ? input.staff : input.name);
  // The page's form picks "one date" and fills date; the crew passes the date as day.
  var day = key(input.day) === 'one date' ? normalizeDate(input.date, nowMs) : normalizeDay(input.day, nowMs);
  if (!day) throw new Error("day must be a weekday ('tuesday') for every week, 'weekdays', 'weekends', 'every day', or a date (YYYY-MM-DD) for one day.");
  var from = null;
  var to = null;
  if (given(input.part) && key(input.part) !== 'all day') {
    var w = PARTS[key(input.part)];
    if (!w) throw new Error("part must be 'all day', 'morning', 'afternoon', or 'evening'.");
    from = w[0];
    to = w[1];
  }
  if (given(input.from) || given(input.to)) {
    from = given(input.from) ? normalizeTime(input.from) : '00:00';
    to = given(input.to) ? normalizeTime(input.to) : '24:00';
    if (!from || !to) throw new Error("from and to must be times like '14:00' or '2pm'.");
    if (to === '00:00') to = '24:00';
    if (minutes(to) <= minutes(from)) throw new Error("'to' must be later in the day than 'from'.");
  }
  var available = input.available === true || key(input.available) === 'true' || key(input.available) === 'yes';
  var mine = t.data.availability.filter(function (a) {
    return a.status === 'active' && a.fields.staffId === p.id && key(a.fields.day) === day;
  });
  if (available) {
    if (!mine.length) return p.fields.name + ' had nothing marked ' + dayText(day) + '.';
    mine.forEach(function (a) {
      t.transition('availability', a.id, 'cleared', input.note ? String(input.note) : 'Available again');
    });
    return p.fields.name + ' is available ' + dayText(day) + ' again.';
  }
  var fields = { staffId: p.id, name: p.fields.name, day: day, from: from, to: to };
  if (input.note) fields.note = String(input.note).trim();
  var id;
  if (mine.length) {
    id = mine[0].id;
    t.update('availability', id, fields, 'Changed');
  } else id = t.add('availability', 'av', 'active', fields, 'Added');
  var entry = t.get('availability', id);
  var clash = t.data.shifts
    .filter(function (s) {
      return staffOn(s).indexOf(p.id) >= 0 && span(s.fields).endAt > nowMs && blocks(entry, s.fields);
    })
    .sort(byStart);
  var msg = 'Noted: ' + p.fields.name + ' is unavailable ' + availText(fields) + '.';
  if (clash.length) {
    msg +=
      ' That clashes with ' +
      clash
        .map(function (s) {
          var free = freeFor(s, t.data);
          return shiftLabel(s) + (free.length ? ' (free: ' + free.slice(0, 3).map(function (x) { return x.name; }).join(', ') + ')' : ' (nobody else is free)');
        })
        .join('; ') +
      '; the person decides who covers it.';
    t.focus = mondayOf(clash[0].fields.date);
  }
  return msg;
}
function addShift(t, input, nowMs) {
  var byPerson = input.byPerson === true;
  var date = normalizeDate(input.date, nowMs);
  if (!date) throw new Error("date must be YYYY-MM-DD (a weekday name means the next one).");
  var start = given(input.start) ? normalizeTime(input.start) : null;
  var end = given(input.end) ? normalizeTime(input.end) : null;
  if (given(input.start) && !start) throw new Error("start must be a time like '06:00' or '6am'.");
  if (given(input.end) && !end) throw new Error("end must be a time like '14:00' or '2pm'.");
  var role = key(input.role);
  var needed = given(input.needed) ? Math.round(num(input.needed)) : null;
  if (given(input.needed) && !(needed >= 1)) throw new Error('needed must be 1 or more people.');
  t.focus = mondayOf(date);
  var existing = start
    ? t.data.shifts.filter(function (s) {
        return s.fields.date === date && s.fields.start === start && key(s.fields.role) === role;
      })[0]
    : null;
  if (existing) {
    var fields = {};
    if (end) fields.end = end;
    if (needed !== null) fields.needed = needed;
    if (input.note) fields.note = String(input.note).trim();
    if (fields.end && fields.end === existing.fields.start) throw new Error('start and end are the same time.');
    t.update('shifts', existing.id, fields, 'Changed');
    var back = reopen(t, existing.id, byPerson);
    var s0 = t.get('shifts', existing.id);
    return 'Updated ' + shiftLabel(s0) + ': needs ' + neededOf(s0) + ', has ' + staffOn(s0).length + '.' + (back ? ' It needs the person’s approval again.' : '');
  }
  if (!start || !end) throw new Error("A new shift needs 'start' and 'end', e.g. '06:00' and '14:00'.");
  if (start === end) throw new Error('start and end are the same time.');
  var fieldsNew = { date: date, start: start, end: end, role: role, needed: needed || 1, staff: [] };
  if (input.note) fieldsNew.note = String(input.note).trim();
  var id = t.add('shifts', 'sh', 'draft', fieldsNew, 'Added');
  var s = t.get('shifts', id);
  var free = freeFor(s, t.data);
  return (
    'Added ' + shiftLabel(s) + ', needs ' + neededOf(s) + '. Free for it: ' +
    (free.length
      ? free
          .slice(0, 4)
          .map(function (x) {
            return x.name + ' (' + x.hours + 'h)';
          })
          .join(', ')
      : 'nobody passes every rule yet') + '.'
  );
}
function copyWeek(t, input, nowMs) {
  var target = given(input.week) ? normalizeDate(input.week, nowMs) : addDays(mondayOf(localDay(nowMs)), 7);
  if (!target) throw new Error('week must be a date in the week to fill, YYYY-MM-DD.');
  var to = mondayOf(target);
  var source = given(input.fromWeek) ? normalizeDate(input.fromWeek, nowMs) : addDays(to, -7);
  if (!source) throw new Error('fromWeek must be a date in the week to copy, YYYY-MM-DD.');
  var from = mondayOf(source);
  if (from === to) throw new Error('Pick two different weeks to copy between.');
  t.focus = to;
  var list = weekShifts(t.data.shifts, from);
  if (!list.length) return 'The week of Mon ' + from + ' has no shifts to copy.';
  var shiftBy = Math.round((Date.parse(to + 'T12:00:00') - Date.parse(from + 'T12:00:00')) / DAY_MS);
  var added = 0;
  var skipped = 0;
  var kept = 0;
  var left = [];
  list.forEach(function (s) {
    var date = addDays(s.fields.date, shiftBy);
    var exists = t.data.shifts.filter(function (x) {
      return x.fields.date === date && x.fields.start === s.fields.start && key(x.fields.role) === key(s.fields.role);
    })[0];
    if (exists) {
      skipped += 1;
      return;
    }
    var draft = { id: '(copy)', status: 'draft', fields: { date: date, start: s.fields.start, end: s.fields.end, role: s.fields.role || '', needed: neededOf(s), staff: [] } };
    staffOn(s).forEach(function (pid) {
      var p = person(t.data, pid);
      if (!p) return;
      var why = problems(p, draft, t.data, { hours: true });
      if (why.length) left.push(why[0]);
      else draft.fields.staff.push(pid);
    });
    kept += draft.fields.staff.length;
    t.add('shifts', 'sh', 'draft', draft.fields, 'Copied from ' + s.id);
    added += 1;
  });
  return (
    'Copied ' + added + (added === 1 ? ' shift' : ' shifts') + ' from the week of Mon ' + from + ' into the week of Mon ' + to +
    (skipped ? ' (' + skipped + ' were already there)' : '') + ', keeping ' + kept + (kept === 1 ? ' assignment' : ' assignments') +
    (left.length ? ' and leaving ' + left.length + (left.length === 1 ? ' spot' : ' spots') + ' open: ' + left.join('; ') : '') +
    '. The copied shifts are drafts for the person to approve.'
  );
}
function assign(t, input, nowMs) {
  var byPerson = input.byPerson === true;
  var s = findShift(t.data.shifts, input, nowMs);
  t.focus = mondayOf(s.fields.date);
  var adding = given(input.staff) ? findStaff(t.data.staff, input.staff) : null;
  var removing = given(input.remove) ? findStaff(t.data.staff, input.remove) : null;
  if (!adding && !removing) throw new Error("assign needs 'staff' (who to put on the shift) or 'remove' (who to take off).");
  var on = staffOn(s).slice();
  var notes = [];
  var changed = false;
  if (removing) {
    if (on.indexOf(removing.id) < 0) throw new Error(removing.fields.name + ' is not on ' + shiftLabel(s) + '. On it: ' + (namesOn(t.data, s) || 'nobody') + '.');
    on.splice(on.indexOf(removing.id), 1);
    t.update('shifts', s.id, { staff: on.slice() }, 'Took ' + removing.fields.name + ' off');
    changed = true;
    notes.push('Took ' + removing.fields.name + ' off ' + shiftLabel(s) + '.');
  }
  if (adding) {
    if (on.indexOf(adding.id) >= 0) notes.push(adding.fields.name + ' is already on ' + shiftLabel(s) + '.');
    else {
      if (on.length >= neededOf(s)) {
        throw new Error(shiftLabel(s) + ' already has its ' + neededOf(s) + ' (' + namesOn(t.data, t.get('shifts', s.id)) + '). Take someone off with remove, or raise needed with add_shift.');
      }
      var why = problems(adding, t.get('shifts', s.id), t.data, { hours: true });
      if (why.length && !byPerson) {
        var free = freeFor(t.get('shifts', s.id), t.data);
        throw new Error(
          adding.fields.name + " can't take " + shiftLabel(s) + ': ' + why.join('; ') + '. Free for it: ' +
            (free.length
              ? free
                  .slice(0, 4)
                  .map(function (x) {
                    return x.name + ' (' + x.id + ', ' + x.hours + 'h)';
                  })
                  .join(', ')
              : 'nobody passes every rule; tell the person') + '.',
        );
      }
      on.push(adding.id);
      t.update('shifts', s.id, { staff: on.slice() }, 'Put ' + adding.fields.name + ' on');
      changed = true;
      notes.push('Put ' + adding.fields.name + ' on ' + shiftLabel(s) + '.' + (why.length ? ' Saved as the person asked, though ' + why.join('; ') + '.' : ''));
    }
  }
  var back = changed ? reopen(t, s.id, byPerson) : false;
  var after = t.get('shifts', s.id);
  var open = neededOf(after) - staffOn(after).length;
  notes.push(open > 0 ? 'It still needs ' + open + ' more.' : 'It is covered.');
  if (back) notes.push('It needs the person’s approval again.');
  return notes.join(' ');
}
function setRules(t, input) {
  var rules = JSON.parse(JSON.stringify(t.data.rules || {}));
  rules.version = 1;
  rules.notes = Array.isArray(rules.notes) ? rules.notes : [];
  var changed = false;
  ['maxWeekHours', 'minRestHours', 'maxShiftHours'].forEach(function (k) {
    if (!given(input[k])) return;
    var v = num(input[k]);
    if (v === null || v < 0) throw new Error(k + ' must be a number of hours, zero or more (0 removes the rule).');
    rules[k] = v > 0 ? v : null;
    changed = true;
  });
  var rule = String(input.rule || '').trim();
  if (rule) {
    if (rules.notes.map(key).indexOf(key(rule)) < 0) rules.notes.push(rule);
    changed = true;
  }
  var forget = key(input.forget);
  if (forget) {
    rules.notes = rules.notes.filter(function (n) {
      return key(n).indexOf(forget) < 0;
    });
    changed = true;
  }
  if (!changed) throw new Error("set_rules needs maxWeekHours, minRestHours, maxShiftHours, a rule in the business's own words, or forget.");
  t.setRules(rules);
  return 'Saved the rules; the conflicts below are checked against them.';
}
function approve(t, input, nowMs) {
  var day = given(input.week) ? normalizeDate(input.week, nowMs) : localDay(nowMs);
  if (!day) throw new Error('week must be a date in the week to approve, YYYY-MM-DD.');
  var monday = mondayOf(day);
  t.focus = monday;
  var list = weekShifts(t.data.shifts, monday).filter(function (s) {
    return s.status !== 'approved';
  });
  if (!list.length) return 'Nothing in the week of Mon ' + monday + ' is waiting for approval.';
  list.forEach(function (s) {
    t.transition('shifts', s.id, 'approved', 'Approved by the person');
  });
  var v = weekView(t.data, monday, nowMs);
  var open = v.gaps.reduce(function (sum, g) {
    return sum + g.open;
  }, 0);
  return (
    'Approved ' + list.length + (list.length === 1 ? ' shift' : ' shifts') + ' for the week of Mon ' + monday + '.' +
    (open ? ' ' + open + (open === 1 ? ' spot is' : ' spots are') + ' still open.' : ' Every shift is covered.') +
    (v.conflicts.length ? ' ' + v.conflicts.length + (v.conflicts.length === 1 ? ' conflict remains.' : ' conflicts remain.') : '')
  );
}
function run(action, input, state, nowMs) {
  input = input || {};
  var t = transaction(state, nowMs);
  var note = '';
  var week = null;
  if (action === 'add_staff') note = addStaff(t, input, nowMs);
  else if (action === 'availability') note = setAvailability(t, input, nowMs);
  else if (action === 'add_shift') note = addShift(t, input, nowMs);
  else if (action === 'copy_week') note = copyWeek(t, input, nowMs);
  else if (action === 'assign') note = assign(t, input, nowMs);
  else if (action === 'rules') note = setRules(t, input);
  else if (action === 'approve') note = approve(t, input, nowMs);
  else if (action === 'status') {
    if (given(input.week)) {
      week = normalizeDate(input.week, nowMs);
      if (!week) throw new Error('week must be a date in the week, YYYY-MM-DD.');
    }
  } else throw new Error("Unknown action '" + action + "'. Use status, add_staff, availability, add_shift, copy_week, assign, rules, or approve.");
  // A change outside this week and next is reported on its own week.
  var thisWeek = mondayOf(localDay(nowMs));
  if (!week && t.focus && t.focus !== thisWeek && t.focus !== addDays(thisWeek, 7)) week = t.focus;
  var view = picture(t.data, nowMs, week);
  return {
    ops: t.ops,
    state: t.data,
    output: {
      openSpots: view.openSpots,
      conflicts: view.conflicts,
      toApprove: view.toApprove,
      shifts: view.shifts,
      week: view.monday,
      summary: (note ? note + ' ' : '') + view.summary,
    },
  };
}
// ── roster-rules-end ──
  return { run: run, weekView: weekView, freeFor: freeFor, problems: problems, span: span, mondayOf: mondayOf, addDays: addDays, localDay: localDay, weekdayIndex: weekdayIndex, limitFor: limitFor, staffOn: staffOn, neededOf: neededOf, availText: availText, rulesText: rulesText, shiftLabel: shiftLabel, num: num };
})();

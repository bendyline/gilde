// The standalone demo's sample conversation. In Gezel, the care coordinator's
// replies come from the model the person chooses; here they are scripted, and
// every change goes through the same tools the real crew member calls. The
// coordinator organizes what the family records; it never gives medical advice.
window.demoChat = (function () {
  'use strict';
  var DAY = 24 * 60 * 60 * 1000;
  var URGENT = /\b(chest pain|chest pressure|fell|fall|fallen|confus|disoriented|can'?t breathe|trouble breathing|short of breath|slurr|stroke|faint|passed out|unresponsive|seizure|bleeding)\b/;
  var URGENT_LINE = 'If this is happening now, call 911 or her doctor right away; that’s a call-the-doctor-now matter, not one for the next visit.';
  var WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

  function person(ctx) { return (ctx.page && ctx.page.params && ctx.page.params.person) || 'Mom'; }
  function plural(n, one, many) { return n + ' ' + (n === 1 ? one : many); }
  function capitalize(text) { return text.charAt(0).toUpperCase() + text.slice(1); }
  function lowerFirst(text) { return text.charAt(0).toLowerCase() + text.slice(1); }
  // A date-only appointment stays upcoming through that local day, as the page shows it.
  function whenMs(value) {
    var day = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value));
    return day ? new Date(Number(day[1]), Number(day[2]) - 1, Number(day[3]) + 1).getTime() - 1 : Date.parse(value);
  }
  function friendly(value, withTime) {
    var text = String(value), day = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
    var d = day ? new Date(Number(day[1]), Number(day[2]) - 1, Number(day[3])) : new Date(text);
    if (isNaN(d.getTime())) return text;
    var label = d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
    return withTime && !day ? label + ' at ' + d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : label;
  }
  function shortDate(value) { return new Date(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }); }

  function state(ctx) {
    return Promise.all([ctx.read('meds.json'), ctx.read('care.json')]).then(function (values) {
      var meds = ((values[0] && values[0].records) || []);
      var events = ((values[1] && values[1].events) || []);
      var now = Date.now();
      var appointments = events.filter(function (e) { return e.kind === 'appointment' && e.data && isFinite(whenMs(e.data.whenAt)); });
      var upcoming = appointments.filter(function (e) { return whenMs(e.data.whenAt) >= now; })
        .sort(function (a, b) { return whenMs(a.data.whenAt) - whenMs(b.data.whenAt); });
      var past = appointments.filter(function (e) { return whenMs(e.data.whenAt) < now; });
      var last = past.length ? Math.max.apply(null, past.map(function (e) { return whenMs(e.data.whenAt); })) : null;
      return {
        active: meds.filter(function (m) { return m.status === 'active'; }),
        journal: events.filter(function (e) { return e.kind !== 'appointment'; }),
        upcoming: upcoming,
        last: last,
        since: events.filter(function (e) { return e.kind !== 'appointment' && (last === null || Date.parse(e.at) > last); }),
      };
    });
  }
  function medLine(m) {
    var f = m.fields || {};
    return f.name + ', ' + (f.dose || 'dose not recorded') + (f.prescriber ? ' (' + f.prescriber + ')' : '');
  }
  function doctorOf(e) { var match = /\b(Dr\.? [A-Z][a-z]+)/.exec(e && e.note || ''); return match ? match[1] : 'the doctor'; }

  function prep(ctx) {
    return ctx.invoke('visit_prep', {}, 'Since the last visit').then(function () { return state(ctx); }).then(function (s) {
      var next = s.upcoming[0];
      var symptoms = s.since.filter(function (e) { return e.kind === 'symptom'; });
      var changes = s.since.filter(function (e) { return e.kind !== 'symptom'; });
      return [
        'Visit prep' + (next ? ' for the ' + lowerFirst(next.note) + ', ' + friendly(next.data.whenAt, true) : '') + '.',
        '**Active medications**',
        s.active.length ? s.active.map(function (m) { return '- ' + medLine(m); }).join('\n') : 'None recorded.',
        '**Since the last visit' + (s.last ? ' on ' + shortDate(s.last) : '') + '**',
        changes.length ? changes.map(function (e) { return '- ' + shortDate(e.at) + ': ' + e.note; }).join('\n') : 'No changes logged.',
        symptoms.length ? '**Worth mentioning to ' + doctorOf(next) + '**' : 'No symptoms were logged since the last visit.',
        symptoms.length ? symptoms.map(function (e) { return '- ' + String(e.note).replace(/\.$/, '') + ' (' + shortDate(e.at) + ')'; }).join('\n') : '',
        'Print this or keep it on your phone; it’s the record in your own words, for the doctor to interpret.',
      ].filter(Boolean).join('\n\n');
    });
  }

  function update(ctx) {
    return state(ctx).then(function (s) {
      var who = person(ctx);
      var week = s.journal.filter(function (e) { return Date.now() - Date.parse(e.at) <= 7 * DAY; });
      var good = week.filter(function (e) { return /better|good|enjoy|walk|smil|slept well/i.test(e.note); });
      var hard = week.filter(function (e) { return e.kind === 'symptom' && good.indexOf(e) < 0; });
      var meds = week.filter(function (e) { return /^(Started|Stopped)\b/.test(e.note); });
      var next = s.upcoming[0];
      var lines = [];
      lines.push('Here’s a short version you can send:');
      lines.push('Hi all, a quick update on ' + who + '. ' +
        (!week.length ? 'It was a quiet week with nothing new to report. ' : hard.length ? 'It was a mostly steady week. ' : 'It was a steady week. ') +
        (hard.length ? String(hard[hard.length - 1].note).replace(/\.$/, '') + ', which we’re keeping an eye on. ' : '') +
        (good.length ? String(good[good.length - 1].note).replace(/\.$/, '') + '. ' : '') +
        (meds.length ? meds.map(function (e) { return e.note; }).join(' ') + ' ' : '') +
        (next ? 'Next up: ' + lowerFirst(next.note) + ' on ' + friendly(next.data.whenAt, false) + '. ' : '') +
        'Thanks for checking in.');
      lines.push('Change anything that doesn’t sound like you.');
      return lines.join('\n\n');
    });
  }

  function startMed(ctx, text) {
    var match = text.match(/\b(?:started|start|starting|put|prescribed|added|on)\b.*?\b(?:on\s+)?([A-Za-z][A-Za-z-]{2,})\s*,?\s*(\d+(?:\.\d+)?\s*(?:mg|mcg|ml|units?|tablets?|capsules?)\b.*)$/i);
    if (!match) return 'What’s the medication and the dose as written on the label? Something like “started metformin, 500 mg with dinner”.';
    var name = capitalize(match[1].toLowerCase());
    var dose = match[2].replace(/[.!]+$/, '').trim();
    var doctor = /\b(Dr\.? [A-Z][a-z]+)/.exec(text);
    var input = { name: name, dose: dose };
    if (doctor) input.prescriber = doctor[1];
    return ctx.invoke('add_med', input, name + ' · ' + dose).then(function () { return state(ctx); }).then(function (s) {
      var next = s.upcoming[0];
      return 'Recorded **' + name + ', ' + dose + '**' + (doctor ? ', prescribed by ' + doctor[1] : '') + ', and logged the start in the journal. ' +
        plural(s.active.length, 'medication is', 'medications are') + ' active now.' +
        (next ? ' It will be on the list for the ' + lowerFirst(next.note) + ' on ' + friendly(next.data.whenAt, false) + '.' : '') +
        ' Questions about how it fits with the others are for ' + (doctor ? doctor[1] : 'the prescriber') + ' or the pharmacist.';
    });
  }

  function stopMed(ctx, text) {
    return state(ctx).then(function (s) {
      var said = text.toLowerCase();
      var med = s.active.find(function (m) { return said.indexOf(String(m.fields.name).toLowerCase()) >= 0; });
      if (!med) return 'Which medication stopped? These are active: ' + s.active.map(function (m) { return m.fields.name; }).join(', ') + '.';
      var why = text.match(/\b(?:because|after|since)\b\s+(.+)$/i);
      var input = { id: med.id };
      if (why) input.note = why[0].replace(/[.!]+$/, '');
      return ctx.invoke('stop_med', input, med.fields.name).then(function () {
        return 'Marked ' + med.fields.name + ' stopped and noted it in the journal with today’s date. Stopping a medication is a prescriber’s call; if that hasn’t been confirmed with them yet, it’s worth a quick call.';
      });
    });
  }

  function logSymptom(ctx, text) {
    var note = capitalize(text.trim().replace(/[.!]+$/, '')) + '.';
    var urgent = URGENT.test(text.toLowerCase());
    return ctx.invoke('log_entry', { kind: 'symptom', note: note }, 'Symptom: ' + lowerFirst(note).replace(/\.$/, '')).then(function () { return state(ctx); }).then(function (s) {
      var next = s.upcoming[0];
      if (urgent) return URGENT_LINE + '\n\nI’ve logged it with today’s date so the record is ready when you talk to them.';
      return 'Logged as an observation, in your words, with today’s date. ' +
        (next ? 'It’s in the visit prep for ' + friendly(next.data.whenAt, false) + '. ' : '') +
        'If it ever comes with a fall, chest pain, or confusion, call her doctor right away, or 911 in an emergency.';
    });
  }

  function logNote(ctx, text) {
    var note = capitalize(text.replace(/^(note|log|add a note)\s*(that|:)?\s*/i, '').replace(/[.!]+$/, '')) + '.';
    return ctx.invoke('log_entry', { kind: 'note', note: note }, 'Note').then(function () {
      return 'Added to the journal with today’s date.';
    });
  }

  // "Tuesday" is the coming one; "next Tuesday" is the one in the following week.
  function nextWeekday(name, hour, minute, following) {
    var d = new Date();
    var target = WEEKDAYS.indexOf(name);
    var ahead = (target - d.getDay() + 7) % 7 || 7;
    if (following) ahead = ((8 - d.getDay()) % 7 || 7) + (target + 6) % 7;
    d.setDate(d.getDate() + ahead);
    d.setHours(hour, minute, 0, 0);
    return d;
  }
  function localIso(d, withTime) {
    function pad(n) { return String(n).padStart(2, '0'); }
    var date = d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
    return withTime ? date + 'T' + pad(d.getHours()) + ':' + pad(d.getMinutes()) : date;
  }
  function appointment(ctx, text) {
    var said = text.toLowerCase();
    var day = WEEKDAYS.find(function (w) { return said.indexOf(w) >= 0; });
    var tomorrow = /\btomorrow\b/.test(said);
    var time = said.match(/\b(\d{1,2})(?::(\d{2}))?\s*(am|pm|a\.m\.|p\.m\.)/);
    var hour = time ? Number(time[1]) % 12 + (/p/.test(time[3]) ? 12 : 0) : 9;
    var minute = time && time[2] ? Number(time[2]) : 0;
    var when = day ? nextWeekday(day, hour, minute, new RegExp('\\bnext\\s+' + day).test(said)) : tomorrow ? (function () { var d = new Date(Date.now() + DAY); d.setHours(hour, minute, 0, 0); return d; })() : null;
    if (!when) return 'What day is it? Something like “add her eye exam next Tuesday at 2 pm”.';
    var what = text.replace(/^(please\s+)?(add|schedule|record|put in|note)\s+(her|his|mom'?s|the|an?)?\s*/i, '')
      .replace(/\s+(on|for|next|this)\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday|tomorrow).*$/i, '')
      .replace(/\s+(tomorrow|monday|tuesday|wednesday|thursday|friday|saturday|sunday).*$/i, '').trim();
    var label = capitalize(what || 'Appointment');
    var whenAt = localIso(when, !!time);
    return ctx.invoke('log_appointment', { note: label, when: whenAt }, label + ' · ' + friendly(whenAt, true)).then(function () { return state(ctx); }).then(function (s) {
      return 'Added to Upcoming: **' + lowerFirst(label) + ', ' + friendly(whenAt, true) + '**. ' +
        (s.upcoming.length > 1 ? 'That makes ' + plural(s.upcoming.length, 'appointment', 'appointments') + ' on the calendar. ' : '') +
        'I’ll fold anything logged before then into its visit prep.';
    });
  }

  function meds(ctx) {
    return state(ctx).then(function (s) {
      if (!s.active.length) return 'No active medications are recorded.';
      return 'Active medications, as the family recorded them:\n\n' + s.active.map(function (m) { return '- ' + medLine(m); }).join('\n');
    });
  }

  return {
    name: 'Anouk',
    role: 'Care Coordinator',
    greeting: 'Hello, I’m Anouk. I keep Mom’s medications, appointments, and journal in one record, so a hard week never has to rely on memory. Her follow-up with Dr. Chen is in under two weeks.',
    suggestions: [
      'Prepare for the next doctor visit',
      'Dr. Chen started her on metformin, 500 mg with dinner',
      'She was dizzy getting out of bed this morning',
      'Add her eye exam next Tuesday at 2 pm',
      'Write a short family update',
    ],
    respond: function (text, ctx) {
      var said = text.toLowerCase();
      if (/\b(prep|prepare|visit brief|before the visit|for the doctor|for the appointment)\b/.test(said)) return prep(ctx);
      if (/\b(family update|update the family|update for|tell the family|siblings|write an update|short update)\b/.test(said)) return update(ctx);
      if (/\b(stopped|stop taking|no longer taking|discontinued|came off|off the)\b/.test(said)) return stopMed(ctx, text);
      if (/\b(started|starting|prescribed|new prescription|put her on|put him on)\b/.test(said) || /\b\d+(\.\d+)?\s*(mg|mcg|ml)\b/.test(said)) return startMed(ctx, text);
      if (/\b(appointment|exam|visit|checkup|check-up|dentist|physical therapy|scan|test)\b/.test(said) && /\b(add|schedule|record|next|on|tomorrow|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/.test(said) && !/\bprep/.test(said)) return appointment(ctx, text);
      if (URGENT.test(said) || /\b(dizzy|dizziness|tired|pain|ache|nause|cough|fever|rash|swollen|swelling|unsteady|sleep|appetite|headache|short of)\b/.test(said)) return logSymptom(ctx, text);
      if (/\b(medications?|meds|pills|what is she taking|what's she taking)\b/.test(said)) return meds(ctx);
      if (/^(note|log|add a note)\b/.test(said)) return logNote(ctx, text);
      return null;
    },
    reactions: {
      page_log_entry: function (input) {
        var note = String(input.note || '');
        if (URGENT.test(note.toLowerCase())) return URGENT_LINE + ' The entry is in the journal.';
        return input.kind === 'symptom'
          ? 'Logged. I’ll include it in the visit prep, in your words.'
          : 'In the journal. Thank you for writing it down.';
      },
      page_log_appointment: function (input) {
        return 'Added to Upcoming: ' + lowerFirst(String(input.note)) + ', ' + friendly(String(input.when), true) + '. I’ll have the visit prep ready before it.';
      },
    },
  };
})();

// The standalone demo's sample conversation. In Gezel, the analyst answers
// from the project's indexed tables with the model the person chooses; here
// the replies are scripted and computed from the page's own labeled sample
// table, and no query runs.
window.demoChat = (function () {
  'use strict';
  var SOURCE = 'sales/quarterly-sales.csv';
  var MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

  function money(n) { return '$' + Math.round(n).toLocaleString('en-US'); }
  function cents(n) { return '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
  function pct(n) { return (n >= 0 ? '+' : '') + (Math.round(n * 1000) / 10).toFixed(1) + '%'; }
  function share(n) { return (Math.round(n * 1000) / 10).toFixed(1) + '%'; }
  function monthName(value) { return MONTHS[Number(String(value).slice(5, 7)) - 1] || String(value); }
  function word(n) { return ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine'][n] || String(n); }

  // Parse the sample CSV the page summarizes; numbers stay numbers, blanks become null.
  function table(ctx) {
    return ctx.read(SOURCE).then(function (text) {
      var lines = String(text || '').trim().split(/\r?\n/);
      var head = lines.shift().split(',');
      return lines.map(function (line) {
        var cells = line.split(','), row = {};
        head.forEach(function (key, i) {
          var raw = cells[i] == null ? '' : cells[i].trim();
          row[key] = raw === '' ? null : /^-?\d+(\.\d+)?$/.test(raw) ? Number(raw) : raw;
        });
        return row;
      });
    });
  }
  function group(rows, key) {
    var out = {};
    rows.forEach(function (row) {
      var k = row[key];
      if (k == null) return;
      if (!out[k]) out[k] = { key: k, revenue: 0, orders: 0, rows: 0 };
      out[k].revenue += row.revenue || 0;
      out[k].orders += row.orders || 0;
      out[k].rows += 1;
    });
    return Object.keys(out).sort().map(function (k) { return out[k]; });
  }
  var intro = 'From the sample table in ' + SOURCE + ':';

  function regions(ctx) {
    return table(ctx).then(function (rows) {
      var g = group(rows, 'region').sort(function (a, b) { return b.revenue - a.revenue; });
      if (g.length < 2) return 'This table has only one region, so there is nothing to compare.';
      var total = g.reduce(function (s, r) { return s + r.revenue; }, 0), top = g[0], next = g[1];
      return [intro + '\n\n' + g.map(function (r) {
        return '- **' + r.key + '** ' + money(r.revenue) + ' from ' + r.orders + ' orders (' + share(r.revenue / total) + ' of revenue), ' + cents(r.revenue / r.orders) + ' per order';
      }).join('\n'),
      top.key + ' brings in more, but not because its orders are bigger: ' + next.key + '’s average order is ' +
        (next.revenue / next.orders > top.revenue / top.orders ? 'actually slightly larger' : 'about the same') + '. ' + top.key + ' simply has more of them, ' +
        top.orders + ' to ' + next.orders + '. In the chart, group by region and show average revenue to see the gap.'];
    });
  }

  function growth(ctx) {
    return table(ctx).then(function (rows) {
      var g = group(rows, 'month');
      if (g.length < 2) return 'There is only one month here, so there is no trend to read.';
      var steps = g.slice(1).map(function (m, i) { return monthName(g[i].key) + ' to ' + monthName(m.key) + ' ' + pct(m.revenue / g[i].revenue - 1); });
      var regionsUp = group(rows, 'region').map(function (r) {
        var mine = rows.filter(function (row) { return row.region === r.key; }).sort(function (a, b) { return String(a.month).localeCompare(String(b.month)); });
        var steady = mine.every(function (row, i) { return !i || row.revenue > mine[i - 1].revenue; });
        return { key: r.key, steady: steady, change: mine[mine.length - 1].revenue / mine[0].revenue - 1 };
      }).sort(function (a, b) { return b.change - a.change; });
      var rates = g.slice(1).map(function (m, i) { return m.revenue / g[i].revenue - 1; });
      var slowing = rates.length > 1 && rates[rates.length - 1] < rates[rates.length - 2];
      var fast = regionsUp[0], slow = regionsUp[regionsUp.length - 1];
      return [intro + ' revenue went ' + g.map(function (m) { return money(m.revenue); }).join(', then ') + ' (' + steps.join(', ') + ').',
        (regionsUp.every(function (r) { return r.steady; }) ? 'Every region grew every month, and ' : 'Not every region rose every month; ') +
        fast.key + ' changed most: ' + pct(fast.change) + ' from ' + monthName(g[0].key) + ' to ' + monthName(g[g.length - 1].key) +
        (regionsUp.length > 1 ? ', against ' + pct(slow.change) + ' for ' + slow.key : '') + '.',
        (['One', 'Two', 'Three', 'Four', 'Five', 'Six'][g.length - 1] || g.length) + ' months is too short to call it a trend or separate it from the season.' + (slowing ? ' The growth is slowing, too, so I would not project it forward yet.' : '')];
    });
  }

  function drivers(ctx) {
    return table(ctx).then(function (rows) {
      var g = group(rows, 'month');
      var aov = g.map(function (m) { return m.revenue / m.orders; });
      var spread = Math.max.apply(null, aov) - Math.min.apply(null, aov), flat = spread < 0.5;
      return [intro + ' the average order was ' + g.map(function (m, i) { return cents(aov[i]) + ' in ' + monthName(m.key); }).join(', ') + '. ' +
        (flat ? (spread < 0.005 ? 'It doesn’t move at all' : 'It barely moves') + ', so the growth comes entirely from more orders: ' : 'Order value moved too, so both matter. Orders went ') +
        g.map(function (m) { return m.orders; }).join(', then ') + '.',
        flat ? 'One caution: an average that stays at exactly the same amount is unusual for real sales. I would check whether revenue in this file was calculated as orders times a fixed price before trusting it as a measure of what customers spent.' : ''].filter(Boolean);
    });
  }

  function quality(ctx) {
    return table(ctx).then(function (rows) {
      var keys = Object.keys(rows[0] || {});
      var missing = keys.map(function (k) { return { k: k, n: rows.filter(function (r) { return r[k] == null; }).length }; }).filter(function (m) { return m.n; });
      var months = group(rows, 'month').length, regionsN = group(rows, 'region').length;
      var complete = months * regionsN === rows.length;
      return [intro + ' ' + rows.length + ' rows and ' + keys.length + ' columns (' + keys.join(', ') + '). ' +
        (missing.length ? missing.map(function (m) { return m.k + ' is missing in ' + m.n + ' row' + (m.n === 1 ? '' : 's'); }).join('; ') + '.' : 'No values are missing.') + ' ' +
        (complete ? 'Every region has exactly one row per month, so nothing is double-counted.' : 'Some region and month pairs repeat or are absent, so totals need care.'),
        'The limit is size, not cleanliness: ' + word(months) + ' month' + (months === 1 ? '' : 's') + ' and ' + word(regionsN) + ' region' + (regionsN === 1 ? '' : 's') + '. That supports a description of the quarter, not a forecast.'];
    });
  }

  function chart() {
    var group = document.getElementById('chart-group'), measure = document.getElementById('chart-measure');
    var bars = Array.prototype.map.call(document.querySelectorAll('#chart li'), function (li) {
      var cells = li.querySelectorAll(':scope > span');
      return { label: cells[0] ? cells[0].textContent : '', value: cells[cells.length - 1] ? cells[cells.length - 1].textContent : '' };
    });
    if (!group || !bars.length) return 'The chart is empty right now. Pick a table above and it will draw.';
    var by = (group.options[group.selectedIndex] ? group.options[group.selectedIndex].text : group.value).replace(/ \(by month\)$/, '');
    var what = measure && measure.value ? measure.options[measure.selectedIndex].text : 'Number of records';
    what = what.charAt(0).toLowerCase() + what.slice(1);
    var line = bars.map(function (b) { return b.label + ' ' + b.value; }).join(', ');
    var nums = bars.map(function (b) { return Number(String(b.value).replace(/[^0-9.-]/g, '')); });
    var even = nums.every(function (n) { return n === nums[0]; });
    if (!measure || !measure.value) {
      return ['It shows the ' + what + ' by ' + by + ': ' + line + '.',
        'That counts rows, not sales' + (even ? '. Every ' + by + ' has the same number of rows, so the bars say nothing about performance yet' : '') + '. Set Show to Average revenue to compare them on money.'];
    }
    var hi = nums.indexOf(Math.max.apply(null, nums)), lo = nums.indexOf(Math.min.apply(null, nums));
    return ['It shows ' + what + ' by ' + by + ': ' + line + '.',
      (even ? 'They are level.' : bars[hi].label + ' is highest and ' + bars[lo].label + ' lowest.') + ' Each bar averages the sample rows in its group, so a group with more rows is not favored.'];
  }

  function next() {
    var files = (window.dataAnalysisSampleFiles || []).concat(window.gezel && window.gezel.ui.components && window.gezel.ui.components.demo ? window.gezel.ui.components.demo.files() : []);
    var paths = files.map(function (f) { return f.path; });
    var lines = [];
    if (paths.indexOf('sales/revenue-plan.xlsx') >= 0) lines.push('- **sales/revenue-plan.xlsx**: if it holds the quarter’s targets, comparing plan against these actuals is the most useful next question');
    if (paths.indexOf('archive/orders.parquet') >= 0) lines.push('- **archive/orders.parquet**: at 3 MB it likely holds individual orders, which would show whether that flat order value is real');
    if (paths.indexOf('research/survey-responses.tsv') >= 0) lines.push('- **research/survey-responses.tsv**: could explain why the South is growing faster, if responses carry a region');
    var added = paths.filter(function (p) { return (window.dataAnalysisSampleFiles || []).every(function (f) { return f.path !== p; }); });
    return [lines.length ? ['One file', 'Two files', 'Three files'][lines.length - 1] + ' could take this further:\n\n' + lines.join('\n') : 'Add the files behind your question and I will look at them.',
      (added.length ? 'You also added ' + added.join(', ') + '. ' : '') + 'In Gezel, spreadsheets and large CSVs are indexed into tables, and I answer from those. In this preview only the sample table is summarized.'];
  }

  function totals(ctx) {
    return table(ctx).then(function (rows) {
      var revenue = rows.reduce(function (s, r) { return s + (r.revenue || 0); }, 0), orders = rows.reduce(function (s, r) { return s + (r.orders || 0); }, 0);
      var months = group(rows, 'month');
      var best = months.slice().sort(function (a, b) { return b.revenue - a.revenue; })[0];
      return intro + ' ' + money(revenue) + ' across ' + orders + ' orders, ' + cents(revenue / orders) + ' per order. The best month was ' + monthName(best.key) + ' at ' + money(best.revenue) + '.';
    });
  }

  return {
    name: 'Thijs',
    role: 'Researcher',
    greeting: 'Hi, I’m Thijs. I’ve read the sample quarterly-sales table: six rows, two regions, July through September. Ask me what it says and I’ll show the numbers behind the answer, and where they stop.',
    suggestions: [
      'Which region sells more?',
      'Is revenue growing month to month?',
      'What is driving the growth?',
      'What is the chart showing?',
      'What should we look at next?',
    ],
    respond: function (text, ctx) {
      var lower = text.toLowerCase();
      if (/\b(what can you|help|what do you do|how does this work)\b/.test(lower)) {
        return 'I read the project’s data and answer with the numbers behind each claim, and where they run out. Here that means the sample quarterly-sales table: ask about regions, growth, order value, missing values, what the chart shows, or what to look at next.';
      }
      if (/\b(predict|forecast|project|next (year|quarter|month)|will .* be)\b/.test(lower)) {
        return table(ctx).then(function (rows) {
          var months = group(rows, 'month').length;
          return 'I wouldn’t forecast from this. The sample table covers ' + (['one', 'two', 'three', 'four', 'five', 'six'][months - 1] || months) + ' month' + (months === 1 ? '' : 's') + ', which can’t separate a trend from the season. With a year or more of monthly history, I could fit a simple trend and give you a range rather than a single number.';
        });
      }
      if (/\bchart|graph|bars?\b/.test(lower)) return chart();
      if (/\b(driv|why|order value|per order|average order|price|basket)/.test(lower)) return drivers(ctx);
      if (/\b(region|north|south|where)\b/.test(lower)) return regions(ctx);
      if (/\b(grow|growth|trend|month|increas|declin|up or down)/.test(lower)) return growth(ctx);
      if (/\b(missing|null|blank|quality|clean|gaps?|complete|trust)\b/.test(lower)) return quality(ctx);
      if (/\b(next|else|other files?|which files?|datasets?|compare)\b/.test(lower)) return next();
      if (/\b(total|sum|how much|revenue|orders|best|summary|summarize)\b/.test(lower)) return totals(ctx);
      return null;
    },
  };
})();

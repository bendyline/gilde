(() => {
  'use strict';
  const quote = (name) => `"${String(name).replaceAll('"', '""')}"`;
  const numeric = (columns) => columns.filter((c) => ['BIGINT', 'DOUBLE'].includes(c.type) && c.role !== 'identifier');
  const groups = (columns) => columns.filter((c) => c.type !== 'JSON').sort((a, b) => {
    const rank = (c) => c.role === 'dimension' ? 0 : c.role === 'time' ? 1 : c.role === 'identifier' ? 3 : 2;
    return rank(a) - rank(b);
  });
  function summary(table, columns) {
    const measures = numeric(columns).slice(0, 6);
    const fields = ['count(*) AS row_count'];
    measures.forEach((c, i) => {
      for (const fn of ['count', 'min', 'max', 'avg']) fields.push(`${fn}(${quote(c.name)}) AS ${fn}_${i}`);
    });
    return {
      sql: `SELECT ${fields.join(', ')} FROM ${quote(table)}`,
      measures,
      sample(rows) {
        const result = { row_count: rows.length };
        measures.forEach((c, i) => {
          const values = rows.map((r) => r[c.name]).filter((v) => v !== null && v !== undefined);
          result[`count_${i}`] = values.length;
          result[`min_${i}`] = values.length ? Math.min(...values) : null;
          result[`max_${i}`] = values.length ? Math.max(...values) : null;
          result[`avg_${i}`] = values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
        });
        return [result];
      },
    };
  }
  function chart(table, group, measure) {
    const time = ['DATE', 'TIMESTAMP'].includes(group.type);
    const key = time ? `CAST(date_trunc('month', ${quote(group.name)}) AS VARCHAR)` : `CAST(${quote(group.name)} AS VARCHAR)`;
    const value = measure ? `avg(${quote(measure.name)})` : 'count(*)';
    return {
      sql: `SELECT ${key} AS label, ${value} AS value FROM ${quote(table)} WHERE ${quote(group.name)} IS NOT NULL GROUP BY 1 ORDER BY ${time ? 'label DESC' : 'value DESC NULLS LAST, label ASC'} LIMIT 12`,
      time,
      sample(rows) {
        const buckets = new Map();
        for (const row of rows) {
          if (row[group.name] == null) continue;
          const label = time ? `${String(row[group.name]).slice(0, 7)}-01 00:00:00` : String(row[group.name]);
          if (!buckets.has(label)) buckets.set(label, []);
          buckets.get(label).push(row);
        }
        return [...buckets].map(([label, bucket]) => {
          const values = measure ? bucket.map((r) => r[measure.name]).filter((v) => v != null) : [];
          return { label, value: measure ? (values.length ? values.reduce((a, b) => a + b, 0) / values.length : null) : bucket.length };
        }).sort((a, b) => time ? b.label.localeCompare(a.label) : (b.value ?? -Infinity) - (a.value ?? -Infinity) || a.label.localeCompare(b.label)).slice(0, 12);
      },
    };
  }
  function bars(rows) {
    const values = rows.map((r) => Number(r.value)).filter(Number.isFinite);
    const low = Math.min(0, ...values), high = Math.max(0, ...values);
    const span = high - low || 1;
    return { zero: -low / span * 100, rows: rows.map((row) => {
      const value = Number(row.value);
      return { ...row, left: (Math.min(0, value) - low) / span * 100, width: Math.abs(value) / span * 100 };
    }) };
  }
  window.dataAnalysisQueries = { quote, numeric, groups, summary, chart, bars };
})();

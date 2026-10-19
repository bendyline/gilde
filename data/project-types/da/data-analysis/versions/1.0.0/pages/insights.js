(() => {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const queries = window.dataAnalysisQueries;
  const api = window.gezel;
  const sampleRows = [
    { month: '2026-07-01', region: 'North', revenue: 7480, orders: 94 },
    { month: '2026-07-01', region: 'South', revenue: 5000, orders: 62 },
    { month: '2026-08-01', region: 'North', revenue: 8360, orders: 105 },
    { month: '2026-08-01', region: 'South', revenue: 6200, orders: 77 },
    { month: '2026-09-01', region: 'North', revenue: 9240, orders: 116 },
    { month: '2026-09-01', region: 'South', revenue: 7000, orders: 87 },
  ];
  const sampleTable = { name: 'sample_sales', title: 'Quarterly sales', source: 'workspace', path: 'sales/quarterly-sales.csv', rows: 6, columnCount: 4 };
  const sampleColumns = [
    { name: 'month', type: 'DATE', role: 'time' }, { name: 'region', type: 'VARCHAR', role: 'dimension' },
    { name: 'revenue', type: 'DOUBLE', role: 'measure', unit: 'USD' }, { name: 'orders', type: 'BIGINT', role: 'measure' },
  ];
  let selected, schema, pending = 0, running = false, revision = 0, stopped = false;
  const fmt = (value) => value == null || !Number.isFinite(Number(value)) ? '—' : new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(Number(value));
  const node = (tag, text) => { const el = document.createElement(tag); el.textContent = text; return el; };
  function options(id, items, previous) {
    $(id).replaceChildren(...items.map(([value, text]) => { const el = node('option', text); el.value = value; return el; }));
    if (items.some(([value]) => value === previous)) $(id).value = previous;
  }
  async function run(plan) {
    if (demoMode) return plan.sample(sampleRows);
    return (await api.tables.query(plan.sql, { tables: [selected.name], limit: 100 })).rows;
  }
  function tableBody(id, rows) {
    $(id).replaceChildren(...rows.map((cells) => {
      const tr = document.createElement('tr');
      cells.forEach((cell, i) => { const el = node(i === 0 ? 'th' : 'td', cell); if (i === 0) el.scope = 'row'; tr.append(el); });
      return tr;
    }));
  }
  async function load(rev, full) {
    const current = () => !stopped && rev === revision;
    if (full) {
      if (!demoMode && !api.tables) throw new Error('Open this project in an updated Gezel app to see data summaries.');
      const tables = demoMode ? [sampleTable] : await api.tables.list();
      if (!current()) return;
      options('table-picker', tables.map((t) => [t.name, `${t.path} · ${t.title}`]), $('table-picker').value);
      $('table-picker-wrap').hidden = tables.length === 0;
      selected = tables.find((t) => t.name === $('table-picker').value);
      if (!selected) {
        $('insights-status').textContent = 'No tables are ready yet. Summaries appear after Gezel indexes a supported spreadsheet or large CSV/TSV. You can still open any dataset below.';
        return;
      }
      schema = demoMode ? { columns: sampleColumns } : await api.tables.describe(selected.name);
      if (!current()) return;
      const plan = queries.summary(selected.name, schema.columns);
      const [totals] = await run(plan);
      if (!current()) return;
      $('table-rows').textContent = fmt(totals.row_count);
      $('table-columns').textContent = fmt(schema.columns.length);
      $('table-source').textContent = selected.path;
      $('open-table-source').hidden = selected.source !== 'workspace' || (!demoMode && api.page.mode !== 'embedded');
      $('table-stamp').textContent = demoMode ? 'Sample data' : selected.updatedAt ? `Indexed ${new Date(selected.updatedAt).toLocaleString()}` : 'Indexed data';
      tableBody('numeric-body', plan.measures.map((c, i) => [c.name + (c.unit ? ` (${c.unit})` : ''), fmt(totals[`count_${i}`]), fmt(Number(totals.row_count) - Number(totals[`count_${i}`])), fmt(totals[`min_${i}`]), fmt(totals[`max_${i}`]), fmt(totals[`avg_${i}`])]));
      $('numeric-summary').hidden = plan.measures.length === 0;
      $('numeric-note').textContent = queries.numeric(schema.columns).length > 6 ? 'Showing the first six numeric fields. Averages exclude missing values.' : 'Averages exclude missing values.';
      tableBody('schema-body', schema.columns.map((c) => [c.name, c.type, c.role, c.description || '—']));
      $('schema-note').textContent = schema.description || (selected.schemaInferred ? 'Column types were inferred during indexing.' : 'Column types from the indexed table.');
      options('chart-group', queries.groups(schema.columns).map((c) => [c.name, c.name + (['DATE', 'TIMESTAMP'].includes(c.type) ? ' (by month)' : '')]), $('chart-group').value);
      options('chart-measure', [['', 'Number of records'], ...queries.numeric(schema.columns).map((c) => [c.name, `Average ${c.name}${c.unit ? ` (${c.unit})` : ''}`])], $('chart-measure').value);
      $('insights-content').hidden = false;
    }
    const group = schema.columns.find((c) => c.name === $('chart-group').value);
    const measure = schema.columns.find((c) => c.name === $('chart-measure').value);
    $('chart-controls').hidden = !group;
    $('chart').replaceChildren();
    if (!group) { $('chart-caption').textContent = 'This table has no fields that can be grouped into a chart.'; $('insights-status').textContent = 'Table summary and schema are ready.'; return; }
    const plan = queries.chart(selected.name, group, measure);
    const rows = await run(plan);
    if (!current()) return;
    if (plan.time) rows.reverse();
    const geometry = queries.bars(rows);
    $('chart').style.setProperty('--zero', `${geometry.zero}%`);
    for (const row of geometry.rows) {
      const li = document.createElement('li');
      const label = plan.time ? String(row.label).slice(0, 7) : String(row.label);
      li.append(node('span', label));
      const track = document.createElement('span'); track.className = 'bar-track'; track.setAttribute('aria-hidden', 'true');
      const bar = document.createElement('span'); bar.className = 'bar';
      if (row.value != null && Number.isFinite(Number(row.value))) { bar.style.left = `${row.left}%`; bar.style.width = `${row.width}%`; }
      track.append(bar); li.append(track, node('span', fmt(row.value))); $('chart').append(li);
    }
    const metric = measure ? `Average ${measure.name}${measure.unit ? ` (${measure.unit})` : ''}` : 'Number of records';
    $('chart-caption').textContent = rows.length ? `${metric} by ${group.name}. ${plan.time ? 'Up to 12 most recent months' : 'Up to 12 highest groups'}. Missing groups${measure ? ' and missing measure values' : ''} excluded.` : 'No non-empty groups to chart.';
    $('insights-status').textContent = demoMode ? 'Exploring sample data.' : 'Summaries use the indexed data. They refresh as the index updates.';
  }
  async function drain() {
    if (running) return;
    running = true;
    while (pending && !stopped) {
      const full = pending === 2, rev = revision; pending = 0;
      $('insights').setAttribute('aria-busy', 'true');
      $('insights-status').textContent = 'Reading table data…';
      $('insights-error').hidden = true;
      try { await load(rev, full); }
      catch (error) {
        if (rev === revision && !stopped) {
          $('insights-content').hidden = true;
          $('insights-status').textContent = 'Data summaries are unavailable. You can still browse the files below.';
          $('insights-error').textContent = error.message || 'Refresh to try again.';
          $('insights-error').hidden = false;
        }
      }
    }
    running = false;
    $('insights').removeAttribute('aria-busy');
  }
  function schedule(full = true) {
    if (stopped) return;
    pending = Math.max(pending, full || !schema || running ? 2 : 1); revision++;
    if (full) $('insights-content').hidden = true;
    void drain();
  }
  $('table-picker').addEventListener('change', () => schedule());
  for (const id of ['chart-group', 'chart-measure']) $(id).addEventListener('change', () => schedule(false));
  $('open-table-source').addEventListener('click', async () => {
    if (demoMode) { $('demo-title').textContent = selected.path; $('demo-preview').showModal(); return; }
    try { await api.data.open(selected.path); }
    catch (error) { $('insights-error').textContent = error.message; $('insights-error').hidden = false; }
  });
  window.dataAnalysisInsights = { refresh: schedule, reset() { $('table-picker').value = ''; $('chart-group').value = ''; $('chart-measure').value = ''; schedule(); } };
  window.addEventListener('pagehide', () => { stopped = true; revision++; }, { once: true });
})();

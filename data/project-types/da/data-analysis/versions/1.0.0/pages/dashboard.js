(() => {
  'use strict';

  const { data: DATA, reports: REPORTS, extension, scan } = window.dataAnalysisFiles;
  const $ = (id) => document.getElementById(id);
  const api = window.gezel;
  const demo = demoMode;
  let files = [];
  let busy = false;
  let again = false;
  let stopped = false;
  let debounce;
  const watches = new Map();
  const sampleFiles = [
    { path: 'sales/quarterly-sales.csv', size: 12480, mtime: 1791849600000 },
    { path: 'sales/revenue-plan.xlsx', size: 48210, mtime: 1791763200000 },
    { path: 'customers.json', size: 22680, mtime: 1791676800000 },
    { path: 'research/survey-responses.tsv', size: 8640, mtime: 1791590400000 },
    { path: 'archive/orders.parquet', size: 3145728, mtime: 1791504000000 },
    { path: 'reports/quarterly-summary.pdf', size: 128040, mtime: 1791849600000 },
  ];

  function sizeLabel(size) {
    if (size < 1024) return `${size} B`;
    const units = ['KB', 'MB', 'GB', 'TB'];
    let value = size / 1024;
    let unit = 0;
    while (value >= 1024 && unit < units.length - 1) { value /= 1024; unit++; }
    return `${new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 }).format(value)} ${units[unit]}`;
  }
  function message(id, text) { $(id).textContent = text; $(id).hidden = !text; }
  function compare(a, b) {
    const sort = $('sort').value;
    const delta = sort === 'size' ? b.size - a.size : sort === 'modified' ? b.mtime - a.mtime : 0;
    return delta || a.path.localeCompare(b.path, undefined, { numeric: true, sensitivity: 'base' });
  }
  function scheduleRefresh() {
    clearTimeout(debounce);
    debounce = setTimeout(() => { if (!stopped) void refresh(); }, 200);
  }
  async function discover() {
    const result = await scan((path) => api.data.list(path), { cancelled: () => stopped });
    const visited = new Set(result.folders);
    if (!stopped) {
      for (const [path, stop] of watches) {
        if (!visited.has(path)) { stop(); watches.delete(path); }
      }
      for (const path of visited) {
        if (!watches.has(path)) watches.set(path, api.data.watch(path, scheduleRefresh));
      }
    }
    const notes = [];
    if (result.limited) notes.push(`This is a partial listing: scanning is limited to ${result.maxFolders} folders and ${result.maxFiles.toLocaleString()} files.`);
    if (result.skipped) notes.push(`${result.skipped} subfolder${result.skipped === 1 ? '' : 's'} could not be read. Refresh to try again.`);
    return { files: result.files, notice: notes.join(' ') };
  }

  async function openFile(file) {
    message('error', '');
    if (demo) {
      $('demo-title').textContent = file.path;
      $('demo-preview').showModal();
      return;
    }
    if (api.page.mode !== 'embedded' || typeof api.data.open !== 'function') {
      message('error', 'Open this project in the latest Gezel app to use its file viewers.');
      return;
    }
    try { await api.data.open(file.path); }
    catch (error) { message('error', `Could not open ${file.path}: ${error.message || 'Please try again.'}`); }
  }
  function row(file) {
    const li = document.createElement('li');
    const badge = document.createElement('span');
    badge.className = 'file-format';
    badge.textContent = extension(file.path).toUpperCase();
    const info = document.createElement('div');
    info.className = 'file-info';
    const name = document.createElement('span');
    name.className = 'file-name';
    name.textContent = file.path.split('/').pop();
    const detail = document.createElement('span');
    detail.className = 'file-detail';
    const folder = file.path.includes('/') ? file.path.slice(0, file.path.lastIndexOf('/')) : 'Project folder';
    const date = file.mtime ? new Date(file.mtime).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : 'Date unavailable';
    detail.textContent = `${folder} · ${sizeLabel(file.size)} · ${date}`;
    info.append(name, detail);
    const open = document.createElement('button');
    open.type = 'button';
    open.className = 'file-open';
    open.textContent = 'Open';
    open.setAttribute('aria-label', `Open ${file.path}`);
    open.addEventListener('click', () => { void openFile(file); });
    li.append(badge, info, open);
    return li;
  }
  function render() {
    const datasets = files.filter((file) => DATA.has(extension(file.path)));
    const formats = [...new Set(datasets.map((file) => extension(file.path)))].sort();
    const chosen = $('format').value;
    const all = document.createElement('option');
    all.value = ''; all.textContent = 'All formats';
    $('format').replaceChildren(all, ...formats.map((format) => {
      const option = document.createElement('option');
      option.value = format; option.textContent = format.toUpperCase();
      return option;
    }));
    $('format').value = formats.includes(chosen) ? chosen : '';
    const query = $('search').value.trim().toLowerCase();
    const shown = datasets.filter((file) => file.path.toLowerCase().includes(query) && (!$('format').value || extension(file.path) === $('format').value)).sort(compare);
    $('datasets').replaceChildren(...shown.map(row));
    $('dataset-count').textContent = datasets.length.toLocaleString();
    $('format-count').textContent = formats.length.toLocaleString();
    $('total-size').textContent = sizeLabel(datasets.reduce((sum, file) => sum + file.size, 0));
    $('empty').hidden = datasets.length > 0;
    $('no-matches').hidden = datasets.length === 0 || shown.length > 0;
    $('datasets').hidden = shown.length === 0;
    const reports = files.filter((file) => REPORTS.has(extension(file.path)) && file.path.toLowerCase().includes(query)).sort(compare);
    $('reports').replaceChildren(...reports.map(row));
    $('reports-section').hidden = reports.length === 0;
    $('status').textContent = `${shown.length} of ${datasets.length} dataset${datasets.length === 1 ? '' : 's'}`;
  }
  async function refresh() {
    if (busy) { again = true; return; }
    window.dataAnalysisInsights.refresh();
    busy = true;
    $('refresh').disabled = true;
    $('datasets').setAttribute('aria-busy', 'true');
    message('error', '');
    try {
      const result = demo ? { files: sampleFiles.map((file) => ({ ...file })), notice: '' } : await discover();
      if (stopped) return;
      files = result.files;
      message('notice', result.notice);
      render();
      $('updated').textContent = demo ? 'Sample files' : `Updated ${new Date().toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}`;
    } catch (error) {
      message('error', `Could not read the project folder: ${error.message || 'Please try again.'}`);
      $('status').textContent = files.length ? 'Showing the previous listing.' : 'Folder unavailable. Use Refresh to try again.';
      $('updated').textContent = 'Refresh needed';
    } finally {
      busy = false;
      $('refresh').disabled = false;
      $('datasets').removeAttribute('aria-busy');
      if (again && !stopped) { again = false; scheduleRefresh(); }
    }
  }

  $('search').addEventListener('input', render);
  $('format').addEventListener('change', render);
  $('sort').addEventListener('change', render);
  $('refresh').addEventListener('click', () => { void refresh(); });
  $('reset-demo').addEventListener('click', () => {
    $('search').value = ''; $('format').value = ''; $('sort').value = 'name';
    $('demo-preview').close();
    window.dataAnalysisInsights.reset();
    void refresh();
  });
  document.querySelector('[data-gezel-demo-banner]').hidden = !demo;
  let stopTheme;
  if (api) {
    const applyTheme = ({ mode }) => { document.documentElement.dataset.theme = mode; };
    applyTheme(api.ui.theme);
    stopTheme = api.ui.onTheme(applyTheme);
  }
  // A periodic sweep also closes the gap between a listing and its first watch stamp.
  const timer = demo ? null : setInterval(() => {
    if (document.visibilityState !== 'hidden') void refresh();
  }, 30000);
  document.addEventListener('visibilitychange', () => {
    if (!demo && document.visibilityState !== 'hidden') scheduleRefresh();
  });
  window.addEventListener('pagehide', () => {
    stopped = true;
    clearTimeout(debounce); clearInterval(timer);
    for (const stop of watches.values()) stop();
    stopTheme?.();
  }, { once: true });
  void refresh();
})();

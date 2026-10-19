(() => {
  'use strict';
  const api = window.makeDemoGezel({ page: { typeName: 'Media Library' } });
  const demoMode = api.page.mode === 'demo';
  const model = window.mediaLibraryFiles;
  const $ = (id) => document.getElementById(id);
  const labels = { image: 'Image', video: 'Video', audio: 'Audio' };
  const icons = { image: 'M3 3h18v18H3z M3 16l5-5 5 5 4-4 4 4 M15 7h.01', video: 'M4 3h16v18H4z M4 7h16 M4 17h16 M10 10l5 2-5 2z', audio: 'M9 18V5l11-2v12 M9 8l11-2 M9 18c0 3-6 3-6 0s6-3 6 0 M20 15c0 3-6 3-6 0s6-3 6 0' };
  const samples = [
    ['Journeys/Alpine morning.svg', 'alpine.svg', 2210], ['Journeys/Quiet coast.svg', 'coast.svg', 1840],
    ['Journeys/Forest path.svg', 'forest.svg', 2670], ['Studio/Color study.svg', 'study.svg', 1420],
    ['Studio/Evening light.svg', 'evening.svg', 1980], ['Motion/Light study.webm', 'light.webm', 24000],
    ['Recordings/Three notes.wav', 'notes.wav', 96044],
  ].map(([path, asset, size], i) => ({ path, asset, kind: model.kind(path), size, mtime: 1792368000000 - i * 86400000 }));
  let files = [], shown = [], visible = 24, view = 'grid', busy = false, again = false, stopped = false, debounce, currentPath = null, previewRevision = 0, focusPath = null;
  const watches = new Map();
  const cards = new Map();
  function element(tag, text, className) { const el = document.createElement(tag); if (text !== undefined) el.textContent = text; if (className) el.className = className; return el; }
  function icon(type) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24'); svg.setAttribute('aria-hidden', 'true');
    const path = document.createElementNS(svg.namespaceURI, 'path'); path.setAttribute('d', icons[type]); svg.append(path); return svg;
  }
  function message(id, text) { $(id).textContent = text; $(id).hidden = !text; }
  function size(value) {
    if (value < 1024) return `${value} B`;
    const units = ['KB', 'MB', 'GB', 'TB']; let n = value / 1024, i = 0;
    while (n >= 1024 && i < units.length - 1) { n /= 1024; i++; }
    return `${new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 }).format(n)} ${units[i]}`;
  }
  const stamp = (value) => value ? new Date(value).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : 'Date unavailable';
  const mediaUrl = (file) => demoMode ? `assets/${file.asset}` : api.data.url(file.path);
  function stopPlayback() {
    previewRevision++;
    for (const media of $('preview-media').querySelectorAll('video,audio')) { media.pause(); media.removeAttribute('src'); media.load(); }
    $('preview-media').replaceChildren();
  }
  function card(file) {
    const li = document.createElement('li');
    const button = element('button', undefined, 'media-card'); button.type = 'button';
    button.dataset.path = file.path; button.setAttribute('aria-label', `Preview ${file.path}`);
    const thumb = element('span', undefined, 'thumbnail');
    thumb.append(icon(file.kind), element('span', labels[file.kind], 'fallback-label'));
    if (file.kind === 'image' && model.browserImages.has(model.extension(file.path))) {
      const image = document.createElement('img'); image.alt = ''; image.loading = 'lazy'; image.decoding = 'async';
      image.addEventListener('error', () => { image.remove(); thumb.querySelector('.fallback-label').textContent = 'Preview unavailable'; });
      try { image.src = mediaUrl(file); thumb.append(image); } catch { /* Keep the usable file card. */ }
    }
    const info = element('span', undefined, 'card-info');
    info.append(element('span', file.path.split('/').pop(), 'file-name'), element('span', model.folderOf(file.path) === '.' ? 'Project folder' : model.folderOf(file.path), 'file-folder'), element('span', `${model.extension(file.path).toUpperCase()} · ${size(file.size)}`, 'file-meta'));
    button.append(thumb, info); button.addEventListener('click', () => openPreview(file.path)); li.append(button); return li;
  }
  function render() {
    const previousFocus = document.activeElement?.dataset.path;
    shown = model.select(files, { query: $('search').value, kind: $('kind').value, folder: $('folder').value, sort: $('sort').value });
    $('gallery').dataset.view = view;
    const present = new Set(files.map((file) => file.path));
    for (const path of cards.keys()) if (!present.has(path)) cards.delete(path);
    $('gallery').replaceChildren(...shown.slice(0, visible).map((file) => {
      const stamp = `${file.size}:${file.mtime}`;
      if (cards.get(file.path)?.stamp !== stamp) cards.set(file.path, { stamp, node: card(file) });
      return cards.get(file.path).node;
    }));
    for (const type of ['image', 'video', 'audio']) $(`${type}-count`).textContent = files.filter((f) => f.kind === type).length.toLocaleString();
    $('file-count').textContent = `${files.length.toLocaleString()} media file${files.length === 1 ? '' : 's'}`;
    $('status').textContent = shown.length > visible ? `Showing ${visible} of ${shown.length.toLocaleString()} matches` : `${shown.length.toLocaleString()} of ${files.length.toLocaleString()} media files`;
    $('empty').hidden = files.length > 0;
    $('no-matches').hidden = files.length === 0 || shown.length > 0;
    $('show-more').hidden = shown.length <= visible;
    $('view-grid').setAttribute('aria-pressed', String(view === 'grid')); $('view-list').setAttribute('aria-pressed', String(view === 'list'));
    if (previousFocus) [...$('gallery').querySelectorAll('button')].find((el) => el.dataset.path === previousFocus)?.focus();
  }
  function openPreview(path) {
    const file = files.find((f) => f.path === path); if (!file) return;
    const wasOpen = $('preview').open;
    if (!wasOpen) focusPath = path;
    stopPlayback(); currentPath = path;
    const rev = previewRevision;
    $('preview-title').textContent = path.split('/').pop();
    $('preview-path').textContent = path;
    $('preview-detail').textContent = `${labels[file.kind]} · ${model.extension(path).toUpperCase()} · ${size(file.size)} · Modified ${stamp(file.mtime)}`;
    message('preview-error', '');
    $('open-file').hidden = !demoMode && (api.page.mode !== 'embedded' || !api.data.open);
    const index = shown.findIndex((f) => f.path === path);
    $('previous').disabled = index <= 0; $('next').disabled = index < 0 || index >= shown.length - 1;
    $('position').textContent = index < 0 ? '' : `${index + 1} of ${shown.length}`;
    if (file.kind === 'image' && !model.browserImages.has(model.extension(path))) {
      $('preview-media').append(icon(file.kind));
      message('preview-error', 'This image format cannot be previewed here. Open the file in Gezel to explore available viewers.');
    } else {
      const media = document.createElement(file.kind === 'image' ? 'img' : file.kind);
      if (file.kind === 'image') media.alt = file.path.split('/').pop();
      else { media.controls = true; media.preload = 'metadata'; if (file.kind === 'video') media.playsInline = true; }
      media.addEventListener('error', () => {
        if (rev !== previewRevision) return;
        message('preview-error', 'This file could not be previewed. Its format may be unsupported, or the file may have moved. Try Refresh or open it in Gezel.');
      });
      media.addEventListener(file.kind === 'image' ? 'load' : 'loadedmetadata', () => {
        if (rev !== previewRevision) return;
        const dimensions = file.kind === 'image' ? `${media.naturalWidth} × ${media.naturalHeight}` : file.kind === 'video' ? `${media.videoWidth} × ${media.videoHeight}` : '';
        const seconds = Number.isFinite(media.duration) ? `${Math.floor(media.duration / 60)}:${String(Math.floor(media.duration % 60)).padStart(2, '0')}` : '';
        $('preview-detail').textContent = [labels[file.kind], dimensions, seconds, size(file.size), `Modified ${stamp(file.mtime)}`].filter(Boolean).join(' · ');
      });
      try { media.src = mediaUrl(file); $('preview-media').append(media); }
      catch (error) { message('preview-error', error.message || 'Media preview is unavailable on this device.'); }
    }
    if (!wasOpen) $('preview').showModal();
  }
  function move(delta) {
    const at = shown.findIndex((f) => f.path === currentPath); const next = shown[at + delta];
    if (at >= 0 && next) openPreview(next.path);
  }
  function schedule() { clearTimeout(debounce); debounce = setTimeout(() => { if (!stopped) void refresh(); }, 250); }
  async function refresh() {
    if (busy) { again = true; return; } busy = true; $('refresh').disabled = true;
    $('gallery').setAttribute('aria-busy', 'true'); message('error', '');
    try {
      const result = demoMode ? { files: samples, folders: ['.', 'Journeys', 'Studio', 'Motion', 'Recordings'] } : await model.scan((path) => api.data.list(path), { cancelled: () => stopped });
      if (stopped) return;
      files = result.files;
      const chosen = $('folder').value;
      const option = (value, text) => { const el = element('option', text); el.value = value; return el; };
      $('folder').replaceChildren(option('', 'All folders'), ...result.folders.map((path) => option(path, path === '.' ? 'Project folder only' : path)));
      $('folder').value = result.folders.includes(chosen) ? chosen : '';
      const notes = [];
      if (result.limited) notes.push(`Partial library: scanned up to ${result.maxFolders} folders and ${result.maxFiles.toLocaleString()} files.`);
      if (result.skipped) notes.push(`${result.skipped} subfolder${result.skipped === 1 ? '' : 's'} could not be read.`);
      message('notice', notes.join(' '));
      if (!demoMode) {
        const visited = new Set(result.folders);
        for (const [path, stop] of watches) if (!visited.has(path)) { stop(); watches.delete(path); }
        for (const path of visited) if (!watches.has(path)) watches.set(path, api.data.watch(path, schedule, { intervalMs: 15000 }));
      }
      render();
      $('updated').textContent = demoMode ? 'Sample library' : `Updated ${new Date().toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}`;
      if (currentPath && !files.some((f) => f.path === currentPath)) { stopPlayback(); message('preview-error', 'This file is no longer in the library. Close this preview to browse the updated folder.'); $('open-file').hidden = true; $('previous').disabled = true; $('next').disabled = true; }
    } catch (error) { message('error', `Could not read the folder: ${error.message || 'Try Refresh.'}`); $('status').textContent = files.length ? 'Showing the previous listing.' : 'Folder unavailable.'; }
    finally { busy = false; $('refresh').disabled = false; $('gallery').removeAttribute('aria-busy'); if (again && !stopped) { again = false; schedule(); } }
  }
  $('search').addEventListener('input', () => { visible = 24; render(); });
  for (const id of ['kind', 'folder', 'sort']) $(id).addEventListener('change', () => { visible = 24; render(); });
  for (const style of ['grid', 'list']) $(`view-${style}`).addEventListener('click', () => { view = style; render(); });
  $('show-more').addEventListener('click', () => { visible += 24; render(); });
  $('refresh').addEventListener('click', () => { void refresh(); });
  $('reset-demo').addEventListener('click', () => { $('search').value = ''; $('kind').value = ''; $('folder').value = ''; $('sort').value = 'newest'; visible = 24; view = 'grid'; $('preview').close(); void refresh(); });
  $('close-preview').addEventListener('click', () => $('preview').close());
  $('preview').addEventListener('close', () => { stopPlayback(); currentPath = null; [...$('gallery').querySelectorAll('button')].find((el) => el.dataset.path === focusPath)?.focus(); });
  $('previous').addEventListener('click', () => move(-1)); $('next').addEventListener('click', () => move(1));
  $('preview').addEventListener('keydown', (e) => {
    if (['VIDEO', 'AUDIO', 'INPUT', 'SELECT'].includes(e.target.tagName)) return;
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { e.preventDefault(); move(e.key === 'ArrowLeft' ? -1 : 1); }
  });
  $('open-file').addEventListener('click', async () => {
    if (demoMode) { message('preview-error', 'In Gezel, this button opens the original file in its project viewer.'); return; }
    try { await api.data.open(currentPath); $('preview').close(); }
    catch (error) { message('preview-error', error.message || 'Could not open the file.'); }
  });
  document.querySelector('[data-gezel-demo-banner]').hidden = !demoMode;
  const theme = ({ mode }) => { document.documentElement.dataset.theme = mode; };
  theme(api.ui.theme); const stopTheme = api.ui.onTheme(theme);
  const timer = demoMode ? null : setInterval(() => { if (document.visibilityState !== 'hidden') void refresh(); }, 30000);
  document.addEventListener('visibilitychange', () => { if (!demoMode && document.visibilityState !== 'hidden') schedule(); });
  window.addEventListener('pagehide', () => { stopped = true; clearTimeout(debounce); clearInterval(timer); stopPlayback(); stopTheme(); for (const stop of watches.values()) stop(); }, { once: true });
  void refresh();
})();

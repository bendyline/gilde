(() => {
  'use strict';
  const data = new Set(['csv', 'tsv', 'tab', 'xlsx', 'xls', 'xlsm', 'xlsb', 'ods', 'numbers', 'json', 'jsonl', 'ndjson', 'parquet', 'arrow', 'feather', 'sqlite', 'sqlite3', 'db', 'duckdb', 'h5', 'hdf5', 'rds', 'rdata', 'sav', 'dta', 'sas7bdat', 'xml']);
  const reports = new Set(['html', 'htm', 'pdf', 'md', 'docx', 'pptx', 'ipynb']);
  const skip = new Set(['node_modules', '__pycache__', 'venv', 'env']);
  const extension = (path) => (path.split('.').pop() || '').toLowerCase();

  async function scan(list, { maxFolders = 100, maxFiles = 10000, cancelled = () => false } = {}) {
    const queue = ['.'];
    const folders = new Set();
    const files = [];
    let skipped = 0;
    let seenFiles = 0;
    let limited = false;
    while (queue.length && folders.size < maxFolders && seenFiles < maxFiles && !cancelled()) {
      const folder = queue.shift();
      folders.add(folder);
      let entries;
      try { entries = await list(folder); }
      catch (error) {
        if (folder === '.') throw error;
        skipped++;
        continue;
      }
      for (const entry of entries) {
        if (!entry.name || /[\\/]/.test(entry.name) || entry.name.startsWith('.') || entry.name.startsWith('~$')) continue;
        const path = folder === '.' ? entry.name : `${folder}/${entry.name}`;
        if (entry.kind === 'dir') {
          if (!skip.has(entry.name) && !entry.name.endsWith('_files')) {
            if (queue.length + folders.size < maxFolders) queue.push(path);
            else limited = true;
          }
        } else {
          seenFiles++;
          const ext = extension(path);
          if (data.has(ext) || reports.has(ext)) files.push({ path, size: entry.size, mtime: entry.mtime });
          if (seenFiles >= maxFiles) { limited = true; break; }
        }
      }
    }
    return { files, folders: [...folders], skipped, limited, maxFolders, maxFiles };
  }
  window.dataAnalysisFiles = { data, reports, extension, scan };
})();

(() => {
  'use strict';
  const images = new Set('jpg jpeg png gif webp avif bmp svg ico heic heif tif tiff dng raw cr2 cr3 nef arw orf raf'.split(' '));
  const videos = new Set('mp4 webm mov m4v ogv avi mkv mpg mpeg mts m2ts'.split(' '));
  const audio = new Set('mp3 wav ogg oga m4a aac flac opus aif aiff wma'.split(' '));
  const browserImages = new Set('jpg jpeg png gif webp avif bmp svg ico'.split(' '));
  const skip = new Set(['node_modules', '__pycache__', 'venv', 'env']);
  const extension = (path) => path.split('.').pop().toLowerCase();
  const kind = (path) => images.has(extension(path)) ? 'image' : videos.has(extension(path)) ? 'video' : audio.has(extension(path)) ? 'audio' : null;
  const folderOf = (path) => path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '.';
  async function scan(list, { maxFolders = 100, maxFiles = 10000, cancelled = () => false } = {}) {
    const queue = ['.'], folders = [], files = [];
    let seen = 0, skipped = 0, limited = false;
    while (queue.length && folders.length < maxFolders && seen < maxFiles && !cancelled()) {
      const folder = queue.shift(); folders.push(folder);
      let entries;
      try { entries = await list(folder); }
      catch (error) { if (folder === '.') throw error; skipped++; continue; }
      for (const entry of entries) {
        if (!entry.name || /[\\/\0]/.test(entry.name) || entry.name.startsWith('.') || entry.name.startsWith('~$')) continue;
        const path = folder === '.' ? entry.name : `${folder}/${entry.name}`;
        if (entry.kind === 'dir') {
          if (skip.has(entry.name) || entry.name.endsWith('_files')) continue;
          if (queue.length + folders.length < maxFolders) queue.push(path); else limited = true;
        } else if (entry.kind === 'file') {
          seen++;
          const type = kind(path);
          if (type) files.push({ path, kind: type, size: entry.size, mtime: entry.mtime });
          if (seen >= maxFiles) { limited = true; break; }
        }
      }
    }
    return { files, folders, skipped, limited, maxFolders, maxFiles };
  }
  function select(files, { query = '', kind = '', folder = '', sort = 'newest' } = {}) {
    const search = query.trim().toLowerCase();
    return files.filter((file) => (!kind || file.kind === kind) && (!folder || file.path.startsWith(folder + '/') || (folder === '.' && folderOf(file.path) === '.')) && file.path.toLowerCase().includes(search))
      .sort((a, b) => (sort === 'newest' ? b.mtime - a.mtime : sort === 'oldest' ? a.mtime - b.mtime : sort === 'size' ? b.size - a.size : 0) || a.path.localeCompare(b.path, undefined, { numeric: true, sensitivity: 'base' }));
  }
  window.mediaLibraryFiles = { extension, kind, folderOf, browserImages, scan, select };
})();

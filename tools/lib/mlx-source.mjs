const MLX_KEEP = [
  /\.safetensors(\.index\.json)?$/,
  /^(?:config|generation_config|preprocessor_config|processor_config|video_preprocessor_config|tokenizer_config|special_tokens_map)\.json$/,
  /^tokenizer\.json$/,
  /^tokenizer\.model$/,
  /^vocab\.json$/,
  /^merges\.txt$/,
  /^chat_template\.jinja$/,
];

function containsAsciiControlCharacter(value) {
  for (const character of value) {
    const code = character.charCodeAt(0);
    if (code <= 0x1f || code === 0x7f) return true;
  }
  return false;
}

/** True for a contained POSIX-style path relative to a Hugging Face repo root. */
export function isSafeRepoRelativePath(path) {
  return (
    typeof path === 'string' &&
    path.length > 0 &&
    path.length <= 1024 &&
    !path.startsWith('/') &&
    !path.includes('\\') &&
    !containsAsciiControlCharacter(path) &&
    path.split('/').every((segment) => segment !== '' && segment !== '.' && segment !== '..')
  );
}

/**
 * Select the files that make up one MLX model root.
 *
 * `subdir` is a remote-only coordinate: matching tree paths are stripped to
 * names relative to that selected root before they enter the catalog. The
 * installer can then fetch `6bit/config.json` while still placing
 * `config.json` at the local model root expected by mlx-vlm.
 */
export function selectMlxFiles(files, subdir) {
  if (subdir !== undefined && !isSafeRepoRelativePath(subdir)) {
    throw new Error(`MLX subdir must be a contained POSIX-style relative path: ${subdir}`);
  }

  const prefix = subdir === undefined ? '' : `${subdir}/`;
  const selected = [];
  const seen = new Set();
  for (const file of files) {
    if (typeof file?.path !== 'string') continue;
    if (prefix && !file.path.startsWith(prefix)) continue;
    const relativePath = prefix ? file.path.slice(prefix.length) : file.path;
    if (!MLX_KEEP.some((pattern) => pattern.test(relativePath))) continue;
    if (!isSafeRepoRelativePath(relativePath)) {
      throw new Error(`unsafe MLX file path below selected model root: ${file.path}`);
    }
    if (seen.has(relativePath)) {
      throw new Error(`duplicate MLX install path after selecting ${subdir ?? 'repo root'}: ${relativePath}`);
    }
    seen.add(relativePath);
    selected.push({ ...file, path: relativePath, repoPath: file.path });
  }
  return selected;
}

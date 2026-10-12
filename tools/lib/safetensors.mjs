/**
 * The `tensors` facts of a safetensors weight file: the element count at
 * every stored float precision, plus the bytes of every tensor that is not a
 * float. Gezel prices an image or video model's memory from these (its core
 * `media-memory.ts`), so they are pinned in the catalog beside each file's
 * sha256 and the app never reads a header over the network.
 *
 * Twin of gezel core's `tallySafetensorsHeader`. This repo's
 * tools/test/safetensors.test.mjs and gezel's media-memory.test.ts check the
 * same fixture, so a change here goes in both.
 */

const STORED_BYTES = {
  F64: 8,
  F32: 4,
  F16: 2,
  BF16: 2,
  F8_E4M3: 1,
  F8_E5M2: 1,
  I64: 8,
  I32: 4,
  I16: 2,
  I8: 1,
  U8: 1,
  BOOL: 1,
};
const FLOAT_DTYPES = new Set(['F64', 'F32', 'F16', 'BF16', 'F8_E4M3', 'F8_E5M2']);

/** A header larger than this is not a safetensors header. */
const MAX_HEADER_BYTES = 100 * 1024 * 1024;
/** First ranged read: covers every header in the catalog so far, so one request each. */
const FIRST_READ_BYTES = 64 * 1024;
const REQUEST_TIMEOUT_MS = 30_000;

/** Tally a parsed safetensors header (the JSON after the 8-byte length prefix). */
export function tallySafetensorsHeader(header) {
  if (!header || typeof header !== 'object' || Array.isArray(header)) {
    throw new Error('safetensors header is not a JSON object');
  }
  const floatElements = {};
  let otherBytes = 0;
  for (const [name, tensor] of Object.entries(header)) {
    if (name === '__metadata__' || !tensor || typeof tensor !== 'object') continue;
    if (typeof tensor.dtype !== 'string') continue;
    const shape = Array.isArray(tensor.shape) ? tensor.shape : [];
    const elements = shape.reduce((acc, dim) => acc * (typeof dim === 'number' && dim >= 0 ? dim : 0), 1);
    if (FLOAT_DTYPES.has(tensor.dtype)) {
      floatElements[tensor.dtype] = (floatElements[tensor.dtype] ?? 0) + elements;
      continue;
    }
    const [start, end] = Array.isArray(tensor.data_offsets) ? tensor.data_offsets : [];
    otherBytes +=
      typeof start === 'number' && typeof end === 'number' && end > start
        ? end - start
        : elements * (STORED_BYTES[tensor.dtype] ?? 4);
  }
  return { floatElements, otherBytes };
}

/** Length of the JSON header from a file's first 8 bytes, or null when implausible. */
export function safetensorsHeaderLength(prefix, fileBytes) {
  if (prefix.byteLength < 8) return null;
  const view = new DataView(prefix.buffer, prefix.byteOffset, 8);
  const length = Number(view.getBigUint64(0, true));
  if (!Number.isSafeInteger(length) || length <= 0 || length > MAX_HEADER_BYTES) return null;
  if (length + 8 > fileBytes) return null;
  return length;
}

/**
 * Read `[start, end]` of a published file. A server that ignores `Range` and
 * answers 200 would otherwise stream the whole multi-GB file, so the body is
 * cancelled as soon as the wanted bytes have arrived.
 */
async function rangeRead(url, start, end, fetchImpl, signal, token) {
  const headers = { Range: `bytes=${start}-${end}` };
  // Only toward huggingface.co itself: fetch drops it on the redirect to the
  // signed storage URL, which needs none.
  if (token && new URL(url).hostname === 'huggingface.co') headers.Authorization = `Bearer ${token}`;
  const response = await fetchImpl(url, { headers, signal });
  if (response.status !== 206 && response.status !== 200) {
    await response.body?.cancel().catch(() => {});
    throw new Error(`HTTP ${response.status} for ${url}`);
  }
  const skip = response.status === 200 ? start : 0;
  const wanted = end - start + 1;
  const reader = response.body?.getReader();
  if (!reader) throw new Error(`empty response body for ${url}`);
  const chunks = [];
  let received = 0;
  try {
    while (received < skip + wanted) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      received += value.byteLength;
    }
  } finally {
    await reader.cancel().catch(() => {});
  }
  return Buffer.concat(chunks).subarray(skip, skip + wanted);
}

/**
 * The `tensors` facts of a published safetensors file, from one or two ranged
 * reads of its header. `token` (a Hugging Face access token) reaches a gated
 * repo; the app itself downloads without one, so a gated file is also a file
 * no one can install.
 */
export async function fetchWeightTensors(url, sizeBytes, { fetchImpl = fetch, token } = {}) {
  const signal = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
  const first = await rangeRead(url, 0, Math.min(FIRST_READ_BYTES, sizeBytes) - 1, fetchImpl, signal, token);
  const length = safetensorsHeaderLength(first, sizeBytes);
  if (length === null) throw new Error(`not a safetensors header: ${url}`);
  let header = first.subarray(8, 8 + length);
  if (header.byteLength < length) {
    const rest = await rangeRead(url, first.byteLength, 8 + length - 1, fetchImpl, signal, token);
    header = Buffer.concat([header, rest]);
  }
  if (header.byteLength < length) throw new Error(`truncated safetensors header: ${url}`);
  return tallySafetensorsHeader(JSON.parse(header.toString('utf8')));
}

/** A file an engine loads as safetensors weights, by name. */
export function isSafetensors(name) {
  return /\.safetensors$/i.test(name);
}

function urlFileName(url) {
  try {
    return decodeURIComponent(new URL(url).pathname.split('/').pop() ?? '');
  } catch {
    return '';
  }
}

/** The URL the video installer downloads a repo file from. */
function huggingFaceResolveUrl(repo, revision, name) {
  return `https://huggingface.co/${repo}/resolve/${encodeURIComponent(revision ?? 'main')}/${name
    .split('/')
    .map(encodeURIComponent)
    .join('/')}?download=true`;
}

/**
 * Every safetensors weight file in an image- or video-model version
 * manifest, as `{ pointer, url, sizeBytes, holder, sizeKey }`. `holder` is
 * the object that carries (or should carry) the file's `tensors`, and
 * `sizeKey` the key `tensors` is written after.
 */
export function safetensorsWeightFiles(kind, version) {
  const out = [];
  if (kind === 'video-model') {
    const source = version.source ?? {};
    (source.files ?? []).forEach((file, i) => {
      if (!file || !isSafetensors(String(file.name ?? ''))) return;
      out.push({
        pointer: `/source/files/${i}`,
        url: huggingFaceResolveUrl(file.repo ?? source.huggingfaceRepo, file.revision ?? source.revision, file.name),
        sizeBytes: file.sizeBytes,
        holder: file,
        sizeKey: 'sizeBytes',
      });
    });
  }
  if (kind === 'image-model') {
    if (isSafetensors(urlFileName(String(version.downloadUrl ?? '')))) {
      out.push({
        pointer: '',
        url: version.downloadUrl,
        sizeBytes: version.approxSizeBytes,
        holder: version,
        sizeKey: 'approxSizeBytes',
      });
    }
    (version.auxiliaryFiles ?? []).forEach((aux, i) => {
      if (!aux || !isSafetensors(urlFileName(String(aux.downloadUrl ?? '')))) return;
      out.push({
        pointer: `/auxiliaryFiles/${i}`,
        url: aux.downloadUrl,
        sizeBytes: aux.approxSizeBytes,
        holder: aux,
        sizeKey: 'approxSizeBytes',
      });
    });
  }
  return out;
}

/**
 * Set `holder.tensors` in place, keeping the authored key order: an existing
 * value is replaced where it stands, a new one goes right after the file's
 * size.
 */
export function setTensors(holder, sizeKey, tensors) {
  if ('tensors' in holder) {
    holder.tensors = tensors;
    return;
  }
  const entries = Object.entries(holder);
  for (const [key] of entries) delete holder[key];
  for (const [key, value] of entries) {
    holder[key] = value;
    if (key === sizeKey) holder.tensors = tensors;
  }
  if (!('tensors' in holder)) holder.tensors = tensors;
}

import { relative } from 'node:path';

/**
 * Shared findings pipeline. A finding is
 *   { severity: 'error' | 'warn', file, pointer, rule, message }
 * where `file` is repo-relative (so GitHub annotations resolve) and
 * `pointer` is a slash path inside the file ("/runtime/envHints/0") or
 * "" for whole-file findings.
 */

export function makeCollector(repoRoot) {
  const findings = [];
  const rel = (p) => (p.startsWith('/') ? relative(repoRoot, p) : p);
  return {
    findings,
    error(file, pointer, rule, message) {
      findings.push({ severity: 'error', file: rel(file), pointer, rule, message });
    },
    warn(file, pointer, rule, message) {
      findings.push({ severity: 'warn', file: rel(file), pointer, rule, message });
    },
    errorCount: () => findings.filter((f) => f.severity === 'error').length,
    warnCount: () => findings.filter((f) => f.severity === 'warn').length,
  };
}

export function renderHuman(findings, out = process.stdout) {
  for (const f of findings) {
    const sev = f.severity === 'error' ? 'ERROR' : 'WARN ';
    const ptr = f.pointer ? ` ${f.pointer}` : '';
    out.write(`${sev} ${f.file}${ptr} - ${f.rule}: ${f.message}\n`);
  }
}

/** GitHub Actions workflow annotations. */
export function renderGithub(findings, out = process.stdout) {
  const esc = (s) => String(s).replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A');
  for (const f of findings) {
    const kind = f.severity === 'error' ? 'error' : 'warning';
    const msg = f.pointer ? `${f.pointer}: ${f.message}` : f.message;
    out.write(`::${kind} file=${esc(f.file)},title=${esc(f.rule)}::${esc(msg)}\n`);
  }
}

export function renderJson(findings, out = process.stdout) {
  out.write(`${JSON.stringify(findings, null, 2)}\n`);
}

export function render(findings, mode, out = process.stdout) {
  if (mode === 'github') renderGithub(findings, out);
  else if (mode === 'json') renderJson(findings, out);
  else renderHuman(findings, out);
}

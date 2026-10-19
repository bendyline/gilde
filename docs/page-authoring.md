# Authoring type pages against `window.gezel` (v1)

How to write a project-type Output page — the HTML dashboard pinned into a
project's Output pane — using the Output Pane API instead of the old
hand-rolled postMessage sentinels. Full API reference lives in the gezel
repo at [docs/output-pane-api.md](https://github.com/bendyline/gezel/blob/main/docs/output-pane-api.md).
Start with [Building AI Apps inside Gezel](https://github.com/bendyline/gezel/blob/main/docs/handboek/technical/building-ai-apps-inside-gezel.md)
for the complete composition and [Using the Gezel page APIs](https://github.com/bendyline/gezel/blob/main/docs/handboek/technical/gezel-page-apis.md)
for choosing operations. This file records the Gilde-specific page/demo contract;
the [app page style guide](https://github.com/bendyline/gezel/blob/main/docs/handboek/technical/gezel-app-page-style-guide.md) owns presentation guidance.

## The surface

Served type pages find a frozen `window.gezel` before any page script runs:

```js
gezel.page      // { api: 1, projectId, source, entry, typeName, params, mode }
gezel.tools     // { list(), invoke(tool, input?) }
gezel.data      // { read(path, opts?), list(path, opts?), watch(path, cb, opts?), url(path, opts?), open(path, opts?) }
gezel.tables    // { list(), describe(name), query(sql, opts?) }
gezel.ui        // { theme: { mode: 'light'|'dark' }, onTheme(cb) }
gezel.refresh() // ask the host to re-mint + reload this page
```

Declare `"api": 1` in the manifest's `pages` block. Serving does not branch
on it, but it routes lint (v1 pages are held to this contract, not the v0
sentinel checks) and documents intent.

## The host modes

`gezel.page.mode` tells the page where it woke up. Author one code path and
let the mode gate the differences:

| mode | where | tools.invoke | data reads |
|---|---|---|---|
| `embedded` | the Output pane iframe | works | works |
| `serve` | authenticated app-serve mini-site | works | works |
| `browser` | "Open in browser" tab | rejects `code: 'unavailable'` | works |
| `demo` | raw file, no server | page-supplied handlers | page-supplied handlers |

In `browser` mode, catch the `'unavailable'` rejection and say where the
action lives ("moving posts happens in the app's Output pane") — never a
dead read-only error state. In `demo` mode, everything runs against the
handlers the page itself supplies.

## The demo-stub paste pattern

`demo` is not produced by the injected shim — a double-clicked file has no
server. `authoring/page-demo-stub.js` is the canonical stub that
fills the gap. The contract:

1. Paste the stub file's bytes **verbatim** into a `<script>` block ahead
   of the page's own code. The file opens with the marker comment
   `/* gezel-page-demo-stub v1 */`, so review tooling can byte-check the
   embedded copy against the canonical source. Do not reformat it, and do
   not fetch it — pages must stay self-contained.
2. In the page's own script, call it first thing:

```js
makeDemoGezel({
  page: { entry: 'dashboard/index.html', typeName: 'Social Feed', params: { brand: 'Juniper Press' } },
  tools: {
    page_set_status: function (input) { /* mutate in-memory demo state or throw */ },
  },
  data: {
    'posts/index.json': function () { return demoIndex(); },
  },
});
// window.gezel now exists in every mode.
var demoMode = gezel.page.mode === 'demo';
```

When the real `window.gezel` exists, `makeDemoGezel` returns it untouched.
Otherwise it installs a `window.gezel` with `mode: 'demo'` whose
`tools.invoke` / `data.read` / `data.list` dispatch to the handler maps
(unknown names reject with `code: 'not-allowed'`), `data.watch` is a no-op
returning an unsubscribe, `data.url` returns the handler's value or passes
`data:` URIs through, and `ui.theme` follows `prefers-color-scheme` live.

Demo handlers keep mutations in memory; the required `Reset demo` control
restores the initial sample state (see AGENTS.md "Project page demo
contract"). A watch never fires in demo mode, so re-render explicitly after
a successful invoke — harmless in embedded mode, where the post-invoke etag
sweep also repaints watchers.

## Declaring reads and tools

The manifest is the authority; the host re-derives both allowlists
server-side on every call.

```json
"pages": {
  "entry": "dashboard/index.html",
  "api": 1,
  "reads": [
    { "source": "workspace", "path": "posts", "subtree": true },
    { "source": "artifacts", "path": "data", "subtree": true }
  ],
  "tools": ["page_set_status", "page_get_post"]
}
```

- Every `gezel.data` path must be declared in `reads` — an exact file, or a
  subtree root with `subtree: true`. `source` is `workspace` (default) or
  `artifacts`.
- `pages.tools` names are **page-only**: they are removed from the model's
  tool surface so a gezel can never play the user's moves. A tool needed on
  both surfaces declares two names sharing one script and bind — the
  social-feed type's `page_get_post` next to `get_post` is the pattern.
- Give every tool a JSON-schema `inputs` (`properties` + `required`, kept
  permissive) — the page-invoke route validates inputs server-side and a
  mismatch rejects with `code: 'invalid-input'` before the script runs.
- A page tool may declare a `reaction` — a seeded gezel turn fired only on
  page invokes. That is how a board move summons the crew.
- When the reaction's seed carries the whole current state (the board and its
  legal moves), declare `"standalone": true` on the reaction. The gezel then
  answers from its instructions and the seed alone. Small on-device models need
  this: earlier turns crowd out the state in a 4K window, and a model shown its
  own old replies tends to repeat one instead of acting on the new position.
  Leave it off when the conversation matters to the reply (a coach following up).
- When one model call is a turn's whole job (a move, a scored reply), declare
  `"turn": { "say": "<argument>" }` on that tool: a successful call ends the
  turn and the argument becomes the reply. Declare `"state": true` on the tool
  that reads the current state; a person's chat message is then answered from
  its fresh output. A reaction can require its turn to be that call with
  `"turn": { "tool": "make_move", "when": { "op": "equals", "field": "status",
  "value": "playing" } }`: while `when` holds over the page tool's output, the
  turn offers only that tool and engines that can force a call do. Keep `when`
  tight, so a finished game still gets a gracious line instead of a forced move.
  Checkers, chess and go are the reference.
- A person's own chat message can be held to the turn tool too: on the `state`
  tool, `"answer": { "tool": "reply", "when": { "op": "equals", "field":
  "status", "value": "active" } }` requires that call while the state matches.
  And `"turn": { "show": "display" }` displays an output field the script
  composed instead of the model's `say` argument: the language trainer shows its
  line plus the corrections it graded, Word Clues shows the clue and its count.

## Existing file viewers and indexed data

Use `gezel.data.open(path, { source: 'workspace' })` to open a file in Gezel's
existing rendition. It is an embedded-host action; hide it or explain the live
action in other modes, and feature-detect it for older hosts.

Use `gezel.tables.list/describe/query` for summaries and charts. The host checks
the same `pages.reads` against the source files and runs bounded read-only SQL.
Tables describe an indexed snapshot, not a raw CSV parsed on demand. They work
in desktop embedded and serve modes when indexing and DuckDB are available;
browser previews and the portable phone runtime report unavailable. Keep file
browsing useful when no table is ready. The canonical demo stub does not implement
tables; a demo page supplies its own clearly labeled sample summaries.

Prefer the shared API to a private filesystem/query bridge. The
[full reference](https://github.com/bendyline/gezel/blob/main/docs/output-pane-api.md)
defines limits, errors, and permissions. `data.read` remains bounded; use
`data.url` for streamed media. Bound recursive scans and browser watch polling,
unsubscribe on teardown, and ignore stale results after selection changes.

## Theme and UX

Apply the host theme at boot and follow changes:

```js
applyTheme(gezel.ui.theme.mode);
gezel.ui.onTheme(function (theme) { applyTheme(theme.mode); });
```

where `applyTheme` stamps `data-theme` on the root element. Style both
palettes with custom properties on `:root` / `:root[data-theme='dark']`,
plus a `prefers-color-scheme` block guarded with
`:root:not([data-theme='light'])` for the instant before boot. Pages follow
the gezel UX rules (`docs/ux.md` in the gezel repo): warm quiet neutrals
with one accent, small radii (4px chips, 6px keys, 10px trays), no capsule
buttons, and no emojis. Hosted type pages inherit Hanken Grotesk for body/UI
and PT Serif for headings through `--font-body`, `--font-ui`, and
`--font-heading`. Do not ship font files or duplicate `@font-face` rules.
Use `var(--font-body, system-ui, sans-serif)` and
`var(--font-heading, Georgia, serif)` for standalone fallbacks.

Only typography is injected today: each page owns its colors, spacing, layout,
control styling, and reset rules. Shell classes and other design tokens are not
inherited. Follow the [page style guide](https://github.com/bendyline/gezel/blob/main/docs/handboek/technical/gezel-app-page-style-guide.md)
for the exact defaults, accessible controls, and responsive states. Bundle local
assets or use scoped `gezel.data.url()`; standalone demos must make no external
requests. Live external network access is controlled by host policy, not the page.

## Checklist

- `<meta name="gezel-demo" content="standalone" />` in the head, and a
  visible `data-gezel-demo-banner` element (demo mode only) with a
  `Reset demo` control.
- Deterministic sample data renders immediately in demo mode; controls stay
  usable; mutations stay in the page.
- The stub bytes match `authoring/page-demo-stub.js` exactly.
- `pages.api: 1` in the manifest; every read and page tool declared.
- `npm run check-page-demos` passes. This is a structural check, not a browser test.
- Verify the real host with permitted and denied paths, empty data, failed actions,
  and unsupported capabilities. Never fall back to demo data after a live failure.
- Check light/dark themes, keyboard focus, narrow layouts, and teardown of watches
  and media. Verify role tool calls and craftbooks when the app includes them.

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
| `demo` | published preview or offline export | page-supplied handlers | page-supplied handlers |

In `browser` mode, catch the `'unavailable'` rejection and say where the
action lives ("moving posts happens in the app's Output pane") — never a
dead read-only error state. In `demo` mode, everything runs against the
handlers the page itself supplies.

## Shared demo bootstrap

App source contains the app's HTML, CSS, scripts, assets and sample handlers.
The host supplies the platform: APIs, components and typography. Do not copy a
component runtime, demo adapter or fonts into each project's pages.

- Local preview: run `npm run demos` and open the listed URL.
- Website: Gezel's Handboek exporter injects a shared content-hashed bootstrap
  and typography stylesheet before app scripts. All demo pages share those assets.
- Offline: run `npm run export-page-demo -- media-library --out ../media-demo`
  and open its entry under `pages/`. The new output directory includes all
  runtime assets and font licenses; it needs no server or network.
- Private AI apps: `gezel app demo <source-folder> --out <new-directory>`.

Open generated output for an offline demo, not the unprocessed source HTML.
Initialize app-owned samples with the shared demo helper only when no real API exists:

```js
const api = window.gezel || window.makeDemoGezel({
  page: { entry: 'dashboard/index.html', typeName: 'Social Feed' },
  tools: { page_set_status: input => updateDemoState(input) },
  data: { 'posts/index.json': () => demoIndex() },
  existingPaths: sampleFiles.map(file => file.path),
});
const demoMode = api.page.mode === 'demo';
const components = api.ui.components;
```

The bootstrap installs the shared components with import targets from the
manifest's `pages.imports`. Demo imports keep Files/object URLs only in memory.
Merge `components.demo.files()` into the sample listing and call
`components.demo.reset()` in Reset demo, then reset your own sample state and
remount the adder to clear results. A demo watch fires only when the sample
conversation changes data: refresh explicitly after the page's own mutations. Failed live operations must never switch to sample data.

Older embedded canonical stubs are accepted for compatibility; publishing strips
the legacy adapter block from generated HTML so it cannot replace the bootstrap.
New pages must use injection. The structural check rejects per-page component copies.

## The sample conversation

In a standalone demo, `appLayout` draws a sample conversation where Gezel's
chat would be, so a visitor sees the companion work the page. Script it in a
`demo-chat.js` beside the entry page, loaded before the inline script, and
pass it to the demo initializer:

```js
window.gezel || window.makeDemoGezel({
  page: { entry: 'dashboard/index.html', typeName: 'Meal Planner' },
  tools: { page_set_menu: input => setDemoMenu(input), grocery_list: () => demoGroceries() },
  data: { 'menu.json': () => demoMenu },
  chat: window.demoChat,
});
```

```js
window.demoChat = {
  name: 'Mila',               // a sample first name; live crew members get their own
  role: 'Meal Planner',       // the crew template's plain-English role
  greeting: 'Hello, I’m Mila. Sunday is still open, and you’re out of limes.',
  suggestions: ['Plan Sunday around what we have', 'What do I need from the store?'],
  respond: function (text, ctx) {
    // Return a reply (string, array of strings, or { reply, suggestions }),
    // or null for the shared "I can only follow a few sample requests" answer.
  },
  reactions: {
    // Keyed by page tool: the demo form of a manifest `reaction`.
    page_set_menu: function (input, output, ctx) { return 'Sunday is set.'; },
  },
};
```

`ctx.read(path)` returns a snapshot of the page's sample data.
`ctx.invoke(tool, input, summary)` runs the page's own demo handler, shows a
step in the conversation, repaints the page's watches, and briefly highlights
what changed. Name the **model** tool (`set_menu`); the demo falls back to
the `page_` alias when only that handler exists. Add demo handlers for model
tools the page never calls (`grocery_list`, `make_move`) so the conversation
can use them. `ctx.say(text)` adds a line mid-turn; `ctx.suggest(list)` swaps
the suggestions without a reply. Replies that return `{ reply, suggestions }`
may offer earlier wording again.

Write it the way the crew member would act in Gezel:

- Every suggestion does real work on the sample: it calls the app's tools so
  the page visibly changes, or answers from the current data. Compute replies
  from `ctx.read`, never from text that assumes the starting sample.
- Keep the companion's voice from the role template's `about.md`: warm,
  specific, short. American English, no emojis, no claims beyond what the app
  can do.
- Match free text with a few forgiving patterns and return `null` otherwise.
  The shared fallback says the preview follows sample requests only.
- For games, react to the person's move with the companion's own move through
  the model's turn tool, as the live reaction does, and say its `say` text.
- An app whose layout passes `chat: false` has no conversation.

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
- Platform assets are absent from app source; test the preview server or exported demo.
- `pages.api: 1` in the manifest; every read and page tool declared.
- `npm run check-page-demos` passes. This is a structural check, not a browser test.
- Verify the real host with permitted and denied paths, empty data, failed actions,
  and unsupported capabilities. Never fall back to demo data after a live failure.
- Check light/dark themes, keyboard focus, narrow layouts, and teardown of watches
  and media. Verify role tool calls and craftbooks when the app includes them.

## Shared file components and scoped imports

Use `gezel.ui.components.fileCard(mount, options)` for file tiles/rows and
`fileAdder(mount, { target, onAdded })` for picker/drop imports. Declare a
named workspace destination in `pages.imports`, separately from `pages.reads`.
The host enforces extensions, byte limits and the project's managed-write policy;
never add a private upload bridge or grant writes from page code. Refresh listings
after `onAdded`; DuckDB indexing may finish later.

See the [component/import API guide](https://github.com/bendyline/gezel/blob/main/docs/handboek/technical/gezel-page-apis.md#file-cards-and-adding-files)
and [style guide](https://github.com/bendyline/gezel/blob/main/docs/handboek/technical/gezel-app-page-style-guide.md#shared-file-components).
Live imports currently require the desktop Output pane. Browser/phone/serve
hosts must show an unavailable state, not a fake success or demo fallback.

For standalone demos, use the shared bootstrap described above. Both the local
server and website exporter supply it before app scripts, including fonts.

The canonical runtime lives in Gezel's `packages/core/src/project-types/`.
Run `pnpm pages:sync-components` there after changing it to regenerate the shared
assets under Gilde's `authoring/`; do not hand-edit generated assets or copy them
into app pages. `GILDE_DIR=<checkout> pnpm test:e2e:page-components` in Gezel
checks component behavior and exported Media Library/Data Analysis demos.


## Full-page application workspaces

Current page apps use `gezel.ui.components.appLayout('main', options)` to expand
their content and embed the native project conversation in fullscreen. Keep
the existing page DOM mounted, choose a useful companion title and description,
and allow crew selection only where it serves the app. Media Library deliberately
uses `chat: false`. The native Email, Just Chat, and Software Project experiences
remain native rather than duplicating the shell in a page.

Organize the page by the [app UX guide](https://github.com/bendyline/gezel/blob/main/docs/handboek/technical/gezel-app-ux-guide.md):
choose the app's shape, put the dashboard on Home, give each managed noun a tab,
and draw actions as keys that open dialogs. Use `actionForm` for record edits and
`collectionFilter` for searching long rendered lists. Give page actions separate aliases from model actions, bound
to the same scripts, and put only those aliases in `pages.tools`. Every new
page action needs an in-memory demo handler. Respect the project's write policy
and keep all state in the existing declared files. A successful schema check or
demo is not proof that the script-backed action works: exercise adoption, edits,
denied writes, and an upgrade with seed preservation in the real host.

Use native dialogs for overlapping page details; appLayout temporarily hides its
host-owned chat slot while a dialog is visible. Keep form drafts on failures,
report read failures without pretending the collection is empty, and dispose
watches on page exit. Feature-detect new components and provide an update message
when an older host cannot supply them.

### The shared composition script

Catalog pages share one `application.js`: a `config` object followed by the
shared boot. Edit the config; copy the boot unchanged from the newest app
(Shift Roster is the reference). On hosts with page components version 2 it
builds:

- `tabs`: `[{ id, label, sections, actions, primary, settings, badge }]`.
  `sections` are selectors of the page's own elements, moved into the tab's
  panel in order; `actions` are model tool names drawn as dialog keys, the first
  (or `primary`, or none with `false`) filled; `settings` tools are drawn as
  inline forms; `badge` is the selector of a count the page already shows.
  Everything except the demo banner, `h1`, and the summary line belongs in a tab.
- `bar`: for a single-view app without tabs, the tools drawn as keys under the
  title. Without `tabs` or `bar`, every action not marked `rowOnly` is a key.
- Row actions: a `<button data-app-action="<tool>" data-app-values='{"id":"…"}'>`
  rendered by the page opens that action's dialog filled in. Set the attributes
  with `setAttribute` and `JSON.stringify`. These buttons are hidden on older hosts.
- `actions[].current`: `{ path, fields: { formField: 'dot.path' } }` shows the saved
  values in a settings form. The path must already be in `pages.reads`.
- `filter`: `{ container, selector, label, placeholder, minItems }`; the search
  appears from `minItems` (default 8) records.
- `buttonLabel`, `description`, and `submitLabel` on an action set the key text,
  the line under the dialog title, and the submit verb.

Older hosts get the previous behavior: expandable forms and an "On this page"
list (`navExclude` skips headings there). The page adds a `<style data-app-shell="2">`
block after its shared style block for the tab, key bar, settings, primary
(`app-primary`), empty-row, and demo-banner styles.

The maintained [workspace API guide](https://github.com/bendyline/gezel/blob/main/docs/handboek/technical/gezel-page-apis.md#building-a-full-page-workspace)
documents options and lifecycle. Gezel's `test:e2e:catalog-apps` suite exercises
every current page in both the live host and exported demos; set `GILDE_DIR`
and `GEZEL_GILDE_DATA_DIR` to the checkout under review.

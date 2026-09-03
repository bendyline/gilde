# AGENTS.md — the contract for AI contributors

Many gilde contributions are authored by AI agents. This file is the
precise, mechanical contract. Follow it and your PR will pass CI on the
first try.

## Layout grammar

```
data/<kind-dir>/<shard>/<id>/manifest.json                    identity
data/<kind-dir>/<shard>/<id>/versions/<semver>/...            released content
data/<kind-dir>/index.json                                    generated listing
authoring/<family>/                                            generator inputs
```

- `<kind-dir>` is one of: `chat-models`, `image-models`, `video-models`,
  `knowledge-catalogs`, `toolsets`, `connector-types`, `project-types`,
  `gezel-templates`, `craftbook-templates`. The community tier mirrors this under
  `data/community/toolsets/`.
- `<id>`: lowercase, matches `[a-z0-9][a-z0-9-]*`. The item's directory
  name must equal the `id` field inside its manifests.
- `<shard>`: exactly the first two characters of the id, lowercased.
  `meeting-notes-digest` lives under `me/meeting-notes-digest/`.
- Version directory names are valid semver and must equal the `version`
  field of the file(s) inside. Every version carries `releasedAt` (ISO
  8601).

## Identity vs version

The identity `manifest.json` holds what is true across versions:
`schemaVersion`, `kind` (singular, e.g. `chat-model`), `id`, `name`,
`description`, `tags`, `maintainer`, optional chat-model `maker` when the
maintainer is a converter rather than the core-model creator, `license`, plus kind-specific fields
(models: `parameterSize`, `contextWindow`, `tuning`, `style`; templates:
`role`; craftbooks: lifecycle `role`). `yankedVersions` (optional) lists
released versions that must not be installed — entries must name version
directories that actually exist.

The `versions/<semver>/` directory holds the released payload:

- chat/image/video models: `manifest.json` with the engine source blocks
  (`llamaCpp`, `mlx`, `ollama`, `ds4` for chat; `downloadUrl`/`source` for
  image/video). Every `sha256` is 64 lowercase hex chars; download URLs
  point at `https://huggingface.co/...`.
- gezel-templates: `manifest.json` + `about.md` (the role's prose).
- project-types: `manifest.json` + `about.md`, `mission.md`, optional
  `game.json`, `pages/**`.
- craftbook-templates (V2): **no version manifest.json** — instead
  `craftbook.json` (the full doc) and `test.json` (the eval sidecar).

## Craftbook rules

`craftbook.json` must be fully resolved:

- Identity `role` is one of `project-starter`, `maintenance-review`, or
  `general`. Use `project-starter` only for greenfield recipes that assume a
  blank workspace; established codebases intentionally hide that shelf.
- `entryStepId` names an existing step.
- Every step has an explicit, unique `id`.
- No `deliverable` shorthand anywhere — write the expanded steps.
- `toolsets` should reference real toolset ids where they are local
  (unknown references are a warning, not an error).

Ship a `test.json` with every craftbook. A craftbook without an eval
cannot be regression-checked.

## Generated-family authoring

`authoring/` holds maintained inputs for catalog families whose released
payloads are expanded by a generator. It is not an alternate runtime catalog:
generated `manifest.json`, `craftbook.json`, and `test.json` still belong
under `data/`, and the index builder reads only `data/`.

It does ship in the npm package, unlike `tools/`. Downstream regeneration
checks resolve these inputs from the installed package and go quiet rather
than fail without them, so `tools/check-package-size.mjs` asserts the pinned
sources are in the tarball. That same guardrail caps `authoring/` at a byte
budget: `files` grants the whole directory, so a new family ships
automatically unless the budget forces the decision. Adding one means raising
`MAX_AUTHORING_BYTES` on purpose, not discovering it in a release.

For `authoring/gstack/`:

- `wave.json` owns release metadata and the source-to-craftbook mapping.
- `snapshots/` is a frozen upstream capture; do not casually rewrite it.
- `overlays/` owns Gezel-native workflow curation.
- `evals/` owns the source form of each generated `test.json`.
- `persona-drafts/` is review-only and never ships as a gezel template
  without a separate curated release.

Run the Gezel-side importer documented in `authoring/gstack/README.md`, then
commit source and generated output together. Never hand-edit an emitted
released version or generate from a different Gilde revision.

## Project page demo contract

Every latest project-type page under `pages/**` must also run outside the
Gezel preview host. These standalone pages are the live demos embedded on
gezelgilde.com and the fastest way to dogfood a project type in a browser.

- Detect live mode from the capability-scoped `/preview/<capability>/type/<projectId>/`
  path. Being inside an iframe is not proof that the Gezel bridge exists.
- Add `<meta name="gezel-demo" content="standalone" />` and a visible element
  marked `data-gezel-demo-banner` that explains sample data stays in the page.
- Without a live capability/project pair, render representative deterministic
  sample data immediately. Do not leave the page empty or show a read-only/error
  state.
- Keep the page's meaningful controls usable in demo mode. Mutations stay in
  memory, and a `Reset demo` control restores the initial sample state.
- Demo mode must not fetch private project URLs, post messages to an arbitrary
  parent, require credentials, or use external network assets.
- Live behavior is unchanged: polling and tool calls still go through the Gezel
  preview host and its postMessage bridge.

`npm run check-page-demos` enforces the structural markers on every current
project-type page. Browser interaction checks remain part of review for pages
with controls.

## Never edit

- `data/**/index.json` — generated. Run `npm run build-index` after any
  content change; on merge conflict take either side and regenerate.
- `schemas/` — generated from gezel core's Zod schemas, refreshed from the
  gezel repo.
- `data/community/` — bot-managed MCP-registry imports.
- Released `versions/<v>/` directories — add a new version instead;
  yank via `yankedVersions`.

## Validation loop

```
npm run validate       full-tree structural + schema validation
npm run check-authoring  generated-family source/output consistency
npm run check-index    generated indexes are fresh
npm run lint-models    chat-model completeness lint
npm run check-page-demos  latest project pages carry the standalone contract
```

Findings print as:

```
ERROR data/chat-models/qw/qwen3.5-2b-q4/manifest.json #/tuning — missing-tuning: <message>
```

That is: severity, file path, JSON pointer to the offending field, rule
name, message. Fix the field the pointer names, re-run, repeat until
clean, and paste the final summary line into your PR description.

## Style

- JSON files: two-space indent, trailing newline, key order as authored
  (`npm run format` fixes this mechanically).
- Markdown prose (`about.md`): plain, warm, no emojis.
- Keep diffs minimal — do not reformat files you did not change.

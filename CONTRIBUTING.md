# Contributing to gilde

Thanks for adding to the gilde. This page covers the mechanics; the layout
grammar lives in [AGENTS.md](AGENTS.md) (written for AI agents, equally
useful to humans).

## Before you open a PR

Run all checks locally from the repo root (Node 24+):

```
npm run check
```

Paste the summary line of `validate` into the PR description. CI runs the
same commands; a red check means the same failure you would have seen
locally.

## Adding a craftbook

A craftbook is a step-by-step playbook a gezel follows. To add one:

1. Pick an id: lowercase, `[a-z0-9-]`, descriptive (`meeting-notes-digest`).
2. Create `data/craftbook-templates/<shard>/<id>/` where `<shard>` is the
   first two characters of the id.
3. Write `manifest.json` (identity: `schemaVersion`, `kind:
   "craftbook-template"`, `id`, `name`, `description`, `tags`,
   `maintainer`).
4. Write `versions/1.0.0/craftbook.json` — the full doc: `id`, `name`,
   `description`, `entryStepId`, `triggers`, `toolsets`, `steps` (every
   step needs an explicit `id`), `version`, `releasedAt`.
5. Write `versions/1.0.0/test.json` — the eval sidecar (objective, prompt,
   setup, mocks, success criteria, rubric). Craftbooks without evals are
   hard to keep honest; see
   [docs/craftbook-evaluation-framework.md](docs/craftbook-evaluation-framework.md).
6. `npm run build-index`, then validate.

### Declaring step inputs

When a step depends on a file produced by an earlier step, declare its drawer
and path instead of leaving a bare relative path for the model to guess:

```json
"consumes": [
  { "file": "security/review-scope.md", "artifact": true }
]
```

Omit `artifact` (or set it to `false`) for project-workspace files. For an
artifact input, the step prompt must also explicitly name `read_artifact` so
the procedure remains unambiguous on older runtimes and the model's first
tool action is correct. The workspace and artifacts are separate drawers;
never rely on `read_file` to fall back across that boundary.

### Generated craftbook families

Some released craftbooks have a maintained source representation under
`authoring/`. For those families, edit the authoring source and run its named
generator instead of hand-editing the expanded payload. The gstack-derived
family is documented in `authoring/gstack/README.md`; its schema-aware
compiler lives in the Gezel repository because it depends on Gezel's parser
and runtime schemas.

Both source and generated files belong in the same Gilde change. Released
version directories remain immutable: bump the family version and generate a
new directory.

## Project-type Output pages

A project type may ship a `versions/<semver>/pages/` tree — the dashboard Gezel
pins into the project's Output pane. The full manifest contract lives in
Gezel's `docs/project-types.md`; two rules matter every time you touch a page.

**Follow the reader's theme.** The page renders in a null-origin sandboxed
iframe, so none of Gezel's own styling reaches it and the page owns its whole
palette. Gezel pushes the user's Light/Dark/System choice into the browser's
colour-scheme preference, which makes the ordinary media query the contract:

```css
:root { color-scheme: light dark; --bg: #faf7f2; --card: #fff; --ink: #2b2620; }
@media (prefers-color-scheme: dark) {
  :root { --bg: #1c1a17; --card: #262320; --ink: #efe9e0; }
}
```

Declare `color-scheme: light dark` so form controls and scrollbars come along,
and route every colour through the variables. A literal `#fff` left in a card
rule survives the media query, and one hardcoded panel is enough to put a
glaring white slab down the side of a dark workshop.

**Assume no network and no parent.** Pages are opened in a plain browser too
("Open in browser"), where there is no parent frame to answer `postMessage`.
Render a sensible read-only or demo state instead of hanging on a reply, and
keep assets local to the `pages/` tree — a CDN reference will not load.

## Updating a model entry

Model manifests split identity (name, description, license) from released
versions (engine sources with pinned revisions and sha256s).

- Fixing metadata or tuning on the identity manifest: edit in place.
- New weights, new quantization, changed upstream files: add a **new**
  `versions/<semver>/` directory. Released version directories are never
  mutated — downstream installs verify sha256s against them.
- To retire a bad version, add it to `yankedVersions` in the identity
  manifest instead of deleting it.
- `npm run lint-models` enforces completeness (tuning block, resident
  bytes, license class). Fix findings rather than extending the allowlist.

## Versioning rules

- Version directories are semver and must match the `version` field inside.
- Every released version carries `releasedAt` (ISO date).
- Never rewrite a released `versions/<v>/` — add a new version.

## Gezel version floors (`minGezelVersion`)

Some content only works on a new-enough gezel build — a model that needs a
newer bundled engine, a craftbook that leans on newer runtime behavior.
Declare that with an optional `minGezelVersion` on the **version** payload
(`versions/<v>/manifest.json` or `craftbook.json`); older gezel builds then
skip that version and keep resolving the previous one. An identity-level
`minGezelVersion` hides the whole item from older builds — reserve it for
items that have never worked on older gezels.

- Gezel versions are date-based: `1.YYDDD.RUN` (two-digit year,
  day-of-year, CI run number). Author floors as `1.YYDDD` — major.minor
  only; the run number is unknowable ahead of a release. When targeting an
  unreleased gezel, guess its release day: a floor a day or two high just
  delays availability by one release, it never breaks anything.
- Add floors on **new** versions only. Never retro-add one to a released
  version — older item versions are the compatibility path for older gezel
  builds, and gezel's live-update gate refuses content that would make a
  currently-resolvable item vanish.
- Unstamped dev builds of gezel (`0.0.0`) ignore floors entirely, so local
  `link:gilde` testing always sees everything.

## Generated files

- `data/**/index.json` are generated. Run `npm run build-index` before
  pushing; never hand-edit or hand-merge them. On a merge conflict in an
  index, take either side and regenerate.
- `schemas/*.schema.json` are exported from gezel core and refreshed from
  there. Do not edit them in this repo.
- `data/community/` is bot-managed (imported from the MCP registry). To
  fix a community entry, fix it upstream in the registry.
- `authoring/gstack/snapshots/` is a frozen upstream capture. Change it only
  as part of an explicit upstream refresh; ordinary curation belongs in the
  overlays and evals beside it.

## Sign-off

This project uses the [Developer Certificate of
Origin](https://developercertificate.org/). Sign your commits off
(`git commit -s`) to certify you have the right to contribute what you are
contributing. Model and toolset entries must respect their upstream
licenses; community imports are restricted to permissive licenses.

AI-assisted contributions are welcome — say so in the PR and confirm a
human reviewed the result.

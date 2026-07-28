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

## Generated files

- `data/**/index.json` are generated. Run `npm run build-index` before
  pushing; never hand-edit or hand-merge them. On a merge conflict in an
  index, take either side and regenerate.
- `schemas/*.schema.json` are exported from gezel core and refreshed from
  there. Do not edit them in this repo.
- `data/community/` is bot-managed (imported from the MCP registry). To
  fix a community entry, fix it upstream in the registry.

## Sign-off

This project uses the [Developer Certificate of
Origin](https://developercertificate.org/). Sign your commits off
(`git commit -s`) to certify you have the right to contribute what you are
contributing. Model and toolset entries must respect their upstream
licenses; community imports are restricted to permissive licenses.

AI-assisted contributions are welcome — say so in the PR and confirm a
human reviewed the result.

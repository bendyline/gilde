# gstack-derived craftbook authoring

This directory is the reproducible source for the nine craftbooks adapted
from [garrytan/gstack](https://github.com/garrytan/gstack). The frozen
snapshots match upstream revision
`a3259400a366593e0c909dd9ac3e59752efd2488`; its MIT terms and attribution are
preserved in [LICENSE.gstack](LICENSE.gstack). The released, fully expanded
catalog payloads remain under `data/craftbook-templates/`.

```
wave.json                  release metadata and source-to-craftbook mapping
snapshots/<source>/SKILL.md  frozen upstream inputs
overlays/<source>.json     Gezel-native workflow definitions and patches
evals/<source>.json        source form of each released test.json
persona-drafts/*.about.md  inert review drafts; never indexed as templates
```

The schema-aware compiler remains in the Gezel repository at
`packages/catalog/scripts/import-gstack-skills.ts`; it depends on Gezel's
skill parser, craftbook schemas, and graph validator. It reads this directory
and writes into the same Gilde checkout, so source and generated output cannot
silently come from different revisions.

From a sibling `gezel` checkout:

```sh
pnpm --filter @bendyline/gezel-catalog exec tsx scripts/import-gstack-skills.ts --dry-run
pnpm --filter @bendyline/gezel-catalog exec tsx scripts/import-gstack-skills.ts
pnpm --filter @bendyline/gezel-catalog run build-index --kind=craftbook-template
```

Set `GILDE_DIR` when the checkouts are not siblings. Generation is
append-only: change `version` and `releasedAt` in `wave.json`, add a new
version, and never rewrite a released `versions/<version>/` directory.

The authoring tree is included in `@bendyline/gilde` so Gezel's exact-pinned
regeneration test can compare these inputs with the generated payload from
the same package. The product runtime and catalog index never read it.

That test resolves the tree from the installed package by default and only
falls back to a checkout via `GILDE_DIR` or `pnpm link:gilde`, so a release
without it does not fail Gezel CI — the fidelity suite just stops running.
`tools/check-package-size.mjs` therefore fails the publish when these sources
are missing from the tarball, and caps how large the tree may grow.

Gilde's dependency-light check validates the authoring sets, release metadata,
license notice, eval schema, and generated metadata. The Gezel-side fidelity
test performs the deeper byte-for-byte compiler comparison. Land and publish
the Gilde change first, then bump Gezel's exact `@bendyline/gilde` pin and
lockfile.

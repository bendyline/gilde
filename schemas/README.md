# schemas/

JSON Schemas for every content file in `data/`, consumed by
`tools/validate.mjs`.

**Generated — do not edit.** These are exported from the Zod schemas in
gezel core (`packages/core/src/schemas/`), which remain the source of
truth. Regenerate from a gezel checkout with:

```
pnpm gilde:export-schemas
```

Note: Zod refinements do not survive the export, so validation here is
slightly looser than gezel's runtime parse. Layout and cross-reference
rules that matter are re-implemented in `tools/validate.mjs`.

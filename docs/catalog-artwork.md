# Catalog artwork

Gilde items can ship a square thumbnail as `logo.webp` beside the identity
`manifest.json`, referenced by `"logo": "logo.webp"`. Gezel resolves it to the
item's `logoUrl` (`/api/catalog/<kind>/<id>/file/logo.webp`) and renders it in
catalog galleries; a missing or failed image falls back to the surface's glyph,
never to a broken-image placeholder. `tools/validate.mjs` checks that a
referenced logo exists and is a real WebP.

Two families share one material language. Both are generated with an image
model from a fixed prompt plus a style reference, and each item records how
its image was made in `art.json`, so a mark can be regenerated or extended
without guessing.

## Shared rules

- **Format:** 512×512 WebP, sRGB, opaque. Encode at quality 82, method 6
  (about 15–25 KB each).
- **Material language:** a quiet circa-1905–1915 bookbinder and small
  letterpress workshop: laid rag paper, woven bookcloth, hand-cut board,
  lightly block-printed charcoal ink, gently oxidized brass. Matte gouache and
  cut-paper rendering. Clean modern simplicity stays dominant. It should feel
  *made then*, never *themed as then*.
- **Palette:** parchment, charcoal, dull aged brass, and one or two muted
  accents from terracotta, sage, muted indigo, ochre, dusty rose, and
  desaturated blue.
- **Legibility:** the subject must be recognizable at 44×44 px.
- **Never:** readable text, letters, numbers, people, hands, faces, logos,
  watermarks, faux UI, photorealism, sepia filters, brown monochrome,
  vignettes, scratches, stains, torn edges, heavy patina, Art Nouveau
  flourishes, medieval props, wax seals, calligraphy, steampunk gears,
  Victorian clutter.

## Workshop Marks (craftbook templates)

One dominant job-specific artifact plus at most one or two supporting tools,
on a parchment ground, in three-quarter top-down view, with roughly 18% clear
margin. The style anchor is `a11y-audit`'s mark (`accessibility-audit-1910`);
every other mark used it as a strict style reference. `art.json` records the
semantic `family` (for example `inspect-review`, `build-code`,
`write-publish`) that chose the accent colors.

Per-item prompt (`promptVersion: workshop-mark-1910-v2`):

```text
Use case: stylized-concept
Asset type: square catalog thumbnail / Workshop Mark for the Gezel craftbook "<name>"
Input images: Image 1 is a strict style reference only. Match its restrained circa-1905–1915 bindery/letterpress material language, Gezel palette, square framing, lighting, natural fibers, oxidized brass, clean geometry, and simplicity. Do not copy its accessibility subject.
Primary request: create one distinct, immediately legible still-life representing this exact craftbook. The title is context only and must not appear in the image.
Meaning to express: <first sentence of the description>
Catalog family: <family>. Catalog tags: <tags>.
Subject logic: infer one dominant concrete artifact and one supporting tool or action that best symbolize the meaning. Prefer an object specific to this job; avoid a generic document card unless the job genuinely centers on documents, writing, or interface review. Use no more than three main shapes.
Composition/framing: 1:1 square, centered three-quarter top-down view, roughly 18% clear margin, recognizable at 44×44 pixels.
Style/medium: quiet Arts-and-Crafts-era bookbinder and small letterpress workshop; hand-cut board, laid rag paper, muted woven bookcloth, lightly block-printed charcoal ink, gently oxidized brass. Clean modern simplicity remains dominant.
Color palette: parchment, charcoal, <family accents>, dull aged brass.
Constraints: no readable text, letters, numbers, people, hands, logos, watermark, faux UI screenshot, generic image-placeholder glyph, sepia filter, brown monochrome, vignette, scratches, stains, torn edges, heavy patina, ornate Art Nouveau flourishes, medieval props, wax seals, calligraphy, steampunk gears, Victorian clutter, or extra decoration. The historical cue must remain subtle and believable, never themed or cheesy.
```

## Reference Marks (knowledge catalogs)

A knowledge catalog is a library, not a job, so its mark has a fixed
composition that keeps every catalog recognizably one family and visibly
distinct from the craftbook shelf:

- **The volume:** one closed, cloth-bound reference volume lies flat in
  three-quarter top-down view, filling roughly the lower two-thirds of the
  frame. A darker charcoal spine, small dull-brass corner caps, and a plain
  cover: no title, label, or emblem.
- **The ribbon:** a narrow ribbon bookmark with a tiny brass tip trails from
  between the pages. It is the family's signature.
- **The subject:** one object (or a tight pair) resting large and centered on
  the cover, chosen to name the domain at a glance: a loaf and pitcher for
  Food & Drink, a ringed planet for Astronomy, a balance scale and gavel for
  Law.
- **The cloth:** the bookcloth is the catalog's one accent color, so
  neighboring catalogs in a picker differ by color before they differ by
  subject.
- **No magnifying glass.** It is the craftbook shelf's tool, and a
  library's meaning is its subject, not its search.
- **No flags, weapons, or religious or national symbols.** Pick a neutral
  emblem of the field (a bugle and medal for Military, an owl and oil lamp
  for Religion & Philosophy).

The first marks were generated with the craftbook style anchor
(`accessibility-audit-1910`) as Image 1. Every later mark also passed
`wikipedia-astronomy`'s mark as Image 2, the set anchor for camera angle,
volume proportions, subject scale, and margins. `art.json` records the
`subject` and the `accents` (the cloth) that filled the template, so adding a
catalog means choosing a subject and a cloth and running the same prompt.

Per-item prompt (`promptVersion: reference-mark-1910-v1`):

```text
Use case: stylized-concept
Asset type: square catalog thumbnail / Reference Mark for the Gezel knowledge catalog "<name>"
Input images: Image 1 is a strict style reference only (a Gezel craftbook Workshop Mark): match its restrained circa-1905–1915 bindery/letterpress material language, Gezel palette, lighting, natural fibers, oxidized brass, clean geometry, and simplicity, but do not copy its subject. Image 2 is the set anchor, the first Reference Mark in this family: match its camera angle, the volume's size, proportions, and placement, the ribbon bookmark, the subject's scale, the margins, and the shadow, so the two read as one matched set. Do not copy Image 2's subject or its bookcloth color.
Primary request: one immediately legible still-life that reads as "a reference library about this subject". The catalog name is context only and must not appear in the image.
Set grammar (identical for every Reference Mark): a single closed, cloth-bound reference volume lies flat, seen from a three-quarter top-down view, filling roughly the lower two-thirds of the frame. Its cover is woven <cloth> bookcloth with a darker charcoal spine and small dull-brass corner caps, and a narrow ribbon bookmark with a tiny brass tip trails out from between its pages. Resting on the cover, large and centered, is the subject: <subject>. The subject is the dominant shape and must stay recognizable at 44×44 pixels; the volume is its plinth. The cover itself is plain: no title, no label, no emblem.
Composition/framing: 1:1 square, centered, roughly 16% clear margin on a plain warm parchment background, soft shallow grounding shadow. No more than three main shapes: the volume, the subject, the ribbon.
Style/medium: quiet Arts-and-Crafts-era bookbinder and small letterpress workshop; hand-cut board, laid rag paper, muted woven bookcloth, lightly block-printed charcoal ink, gently oxidized brass. Matte gouache and cut-paper rendering with the reference's restraint: simplified forms, flat matte color fields, and only gentle shading; no photographic detail, fine surface texture, or glossy highlights. Clean modern simplicity remains dominant.
Lighting/mood: soft north-window workshop daylight, warm-neutral, calm and carefully made.
Color palette: parchment, charcoal, <cloth> bookcloth, dull aged brass, and at most one or two other muted Gezel accents (terracotta, sage, muted indigo, ochre, dusty rose) on the subject.
Constraints: no readable text, letters, numbers, numerals, or title on the volume; no people, hands, or faces; no logos, watermark, faux UI, or magnifying glass; no flags, weapons, or religious or national symbols; no sepia filter, brown monochrome, vignette, scratches, stains, torn edges, heavy patina, ornate Art Nouveau flourishes, medieval props, wax seals, calligraphy, steampunk gears, Victorian clutter, or extra decoration. The historical cue must remain subtle and believable, never themed or cheesy.
```

## `art.json`

Not read by the runtime; it is the regeneration record.

| Field | Meaning |
| --- | --- |
| `schemaVersion` | `1` |
| `promptVersion` | Which prompt template above produced the image |
| `periodCue` | `circa-1910-subtle` for both families |
| `family` | Craftbooks: the semantic family. Knowledge catalogs: `reference-library` |
| `accents` | The accent colors the prompt named (for a Reference Mark, the cloth) |
| `sourceSummary` | Craftbooks: the description sentence the prompt quoted |
| `subject` | Reference Marks: the subject sentence the prompt named |
| `styleReference` | The style anchor passed as Image 1 |
| `setReference` | Reference Marks: the set anchor passed as Image 2 |

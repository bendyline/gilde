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

A knowledge catalog's mark is a single paper-crafted emblem of its subject:
a loaf and pitcher for Food & Drink, a ringed planet for Astronomy, a
balance scale and gavel for Law. These marks are drawn far smaller than a
craftbook card, as a 24 px picker row or a 56 px rail header, so the subject
gets the whole tile:

- **The subject alone.** One object, or a tight pair overlapping into one
  silhouette, fills about 80% of the frame with 8–10% margin. Nothing sits
  under or behind it: no book, card, tray, table, or plinth.
- **Cut paper, not paint.** Layered cut-paper and hand-cut board, flat matte
  color fields, slight depth between layers, and dull brass where the object
  is metal. This is the same bindery material language as the Workshop
  Marks, shown as an emblem rather than a still-life.
- **One accent per catalog.** The subject carries its catalog's accent color,
  plus at most one other muted accent.
- **No magnifying glass.** That is the craftbook shelf's tool, and a
  library's meaning is its subject, not its search.
- **No flags, weapons, or religious or national symbols.** Pick a neutral
  emblem of the field (a bugle and medal for Military, an owl and oil lamp
  for Religion & Philosophy), and keep protected emblems such as the red
  cross off medicine bottles.

Regional catalogs (`regional-*`) use the same prompt. Their subject is an
animal or plant people associate with the place: a leaping sockeye salmon for
the Pacific Northwest, an olive tree for the Mediterranean, a baobab for West
& Central Africa. Never a map outline, landmark, or building, and never a
national emblem: the Northeast's maple is two fallen autumn leaves, not one
red leaf. Regions share a gallery with the topic catalogs, so a region must
not reuse another catalog's subject. Australia & New Zealand is a kangaroo
because Biology already has the fern. Two regions with similar animals get
different poses and accents: the stork stands in its nest, and the crane
dances.

The first tranche (Food & Drink, Astronomy, Law, Technology) was generated
with the craftbook style anchor (`accessibility-audit-1910`) as Image 1.
Every later mark also passed `wikipedia-astronomy`'s mark as Image 2, the set
anchor for scale, fill, margins, and construction. `art.json` records the
`subject` and the `accents` that filled the template, so adding a catalog
means choosing a subject and an accent and running the same prompt.

The v1 marks (`reference-mark-1910-v1`, 2026-10-06) stood each subject on a
closed cloth-bound volume. At 56 px the volume took most of the tile and the
subject became unreadable, so v2 removed it.

Per-item prompt (`promptVersion: reference-mark-1910-v2`):

```text
Use case: stylized-concept
Asset type: square catalog icon / Reference Mark for the Gezel knowledge catalog "<name>"
Input images: Image 1 is a strict style reference only (a Gezel craftbook Workshop Mark): match its restrained circa-1905–1915 bindery/letterpress material language, Gezel palette, lighting, natural fibers, oxidized brass, and simplicity, but do not copy its subject, its card, or its magnifying glass. Image 2 is the set anchor, the first Reference Mark in this family: match its scale, how fully the subject fills the frame, its margins, its paper-craft construction, and its shadow, so the two read as one matched set. Do not copy Image 2's subject.
Primary request: one bold, immediately legible paper-crafted emblem of the subject: <subject>. The catalog name is context only and must not appear in the image.
Composition/framing: 1:1 square. The subject alone, large and centered, filling about 80% of the frame with roughly 8–10% clear margin on every side, in a gentle three-quarter front view. Nothing but the subject: no carrier book or volume beneath or behind it, no card, tray, table surface, plinth, or base. Only a soft, shallow shadow on a plain warm parchment ground. At most two objects, overlapping into one compact silhouette that stays readable at 24×24 pixels.
Style/medium: layered cut-paper and hand-cut board construction, like a paper craftsman's emblem from a quiet circa-1910 bindery workshop: crisp simplified shapes, flat matte color fields, laid rag paper and woven bookcloth textures that are felt but not busy, slight layered depth with gentle shadows between paper layers, and dull oxidized brass where the object is metal. Bold, simple, graphic; no fine detail, no photographic texture, no glossy highlights.
Lighting/mood: soft north-window workshop daylight, warm-neutral, calm and carefully made.
Color palette: parchment ground, charcoal, dull aged brass, with <accent> as the subject's dominant accent and at most one other muted Gezel accent (terracotta, sage, muted indigo, ochre, dusty rose).
Constraints: no readable text, letters, numbers, or numerals; no people, hands, or faces; no logos, watermark, faux UI, or magnifying glass; no flags, weapons, or religious or national symbols; no sepia filter, brown monochrome, vignette, scratches, stains, torn edges, heavy patina, ornate Art Nouveau flourishes, medieval props, wax seals, calligraphy, steampunk gears, Victorian clutter, or extra decoration. The historical cue must remain subtle and believable, never themed or cheesy.
```

## `art.json`

Not read by the runtime; it is the regeneration record.

| Field | Meaning |
| --- | --- |
| `schemaVersion` | `1` |
| `promptVersion` | Which prompt template above produced the image |
| `periodCue` | `circa-1910-subtle` for both families |
| `family` | Craftbooks: the semantic family. Knowledge catalogs: `reference-library` |
| `accents` | The accent colors the prompt named |
| `sourceSummary` | Craftbooks: the description sentence the prompt quoted |
| `subject` | Reference Marks: the subject sentence the prompt named |
| `styleReference` | The style anchor passed as Image 1 |
| `setReference` | Reference Marks: the set anchor passed as Image 2 |

# Catalog artwork

Gilde items can ship a square thumbnail as `logo.webp` beside the identity
`manifest.json`, referenced by `"logo": "logo.webp"`. Gezel resolves it to the
item's `logoUrl` (`/api/catalog/<kind>/<id>/file/logo.webp`) and renders it in
catalog galleries; a missing or failed image falls back to the surface's glyph,
never to a broken-image placeholder. `tools/validate.mjs` checks that a
referenced logo exists and is a real WebP.

Two families share one cut-paper construction. Both are generated with an
image model from a fixed prompt plus style references, and each item records
how its image was made in `art.json`, so a mark can be regenerated or extended
without guessing.

## Shared rules

- **Format:** 512×512 WebP, sRGB. Workshop Marks are transparent; Reference
  Marks are opaque. Encode at quality 82, method 6 (alpha quality 90).
- **Construction:** layered cut paper and hand-cut card: crisp simplified
  shapes, flat matte color, slight soft shadows between the layers, dull
  brushed brass where the object is metal. Clean and contemporary.
- **Legibility:** the subject must be recognizable at 44×44 px.
- **Never:** readable text, letters, numbers, people, silhouettes of people,
  hands, faces, logos, watermarks, faux UI, photorealism, a magnifying glass,
  flags, weapons, religious or national symbols, protected emblems such as the
  red cross, sepia, aging, stains, torn edges, wax seals, or ornament.

## Workshop Marks (craftbook templates and project types)

A Workshop Mark is **one bold cut-paper subject that names the job**: a sieve
for a data-quality audit, a card-catalog drawer for a data dictionary, merging
toy rails for a pull request review, a piggy bank for a household budget.
Nothing sits under or behind it: no book, card, clipboard, tray, or plinth,
unless that object is itself the subject. The subject is built mainly from
cream and warm white papers with charcoal details, so it reads on every
ground.

**The ground is not in the image.** Gezel paints it from the item's category
(`catalogGroundFor` in core's `catalog-ground.ts`, colors as
`--gezel-ground-<tone>` in the UI's foundation palette). Nine tones cover the
craftbook shelves and project-type categories, and dark mode deepens each one.
A shelf in the gallery rail therefore shows one ground, and the subject alone
tells its books apart.

**Choose subjects per shelf.** Write the subject list for a whole shelf before
generating anything, so no two neighbors share an object, and review it at the
size it will be seen. Prefer a physical thing a person already knows over a
diagram (a lifebuoy for an FAQ, a tuning fork for a tone rewrite). Swap a
subject whose natural form brings a face with it, such as a contact card with
a portrait frame, rather than fighting the model with constraints.

**Generation.** Subjects are drawn eight at a time on one transparent sheet,
which keeps a set consistent. Image 1 is the knowledge-catalog mark
`wikipedia-astronomy`; Image 2 is the set anchor, `data-dictionary`'s v3 mark
on its ground. Each subject is then cut out:

1. Drop the image model's faint glow: alpha is remapped as
   `clamp((a − 60) × 255 / 170)`, which removes the 1–40 halo and keeps real
   edges.
2. Group the remaining pixels into connected shapes, split them into rows by
   the empty bands between them, and into cells by their positions within each
   row.
3. Trim each subject to its own shapes and scale it so its longer side is 88%
   of 512 px, centered. Every mark has the same 6% clear margin.
4. Bake one soft shadow under the subject: color `#1c120a` at 38% of the
   subject's alpha, blurred by 3.5% and offset down by 2.5% of the tile.

Sheet prompt (`promptVersion: workshop-mark-cutout-v3`):

```text
Input images: Image 1 is a Gezel knowledge-catalog mark and Image 2 is a cut-paper Gezel craftbook mark on a colored ground. Match their cut-paper construction, layering and the soft shadows between paper layers. Do not copy their subjects.

Create one landscape 3:2 PNG with a fully TRANSPARENT background (alpha channel). No tiles, no colored squares, no paper ground, no cast shadow on the background: only the 8 subjects themselves on transparency.

Layout: 8 subjects arranged in a strict, evenly spaced grid of 4 columns and 2 rows of equal invisible cells. Each subject sits centered in its own cell, filling about 75% of the cell, and stays entirely inside it, with wide empty transparent gaps between neighboring subjects so they never touch or overlap.

Subjects, left to right, top row then bottom row:
1) <subject>
...
8) <subject>

Style for every subject: a bold, layered cut-paper emblem: crisp simplified shapes cut from matte paper and card, two or three layers with slight soft shadows between them, gentle three-quarter front view. Build each subject mainly from cream and warm white papers with charcoal (#2a2520) details, dull brushed brass where the object is metal, and at most one muted accent (terracotta, sage, ochre, muted indigo, dusty rose, slate blue or plum), so it reads on any deep colored background. Bold simple silhouettes that stay recognizable at 44x44 pixels. Clean, contemporary paper craft: no aging, no dust, no sepia, no photographic realism.

Constraints: no text, letters, numbers, labels, logos, people, silhouettes of people, hands, faces or magnifying glass anywhere. Nothing under a subject: no book, card, tray, table or plinth. Background must be transparent.
```

To regenerate one mark, put its `art.json` subject on a sheet with seven
others from the same shelf (or redraw the whole shelf) and cut it out the same
way.

The v2 marks (`workshop-mark-1910-v2`, 2026-10) were circa-1910 still-lifes:
the job printed on a card resting on a book, often with a magnifier, on a
parchment ground. At the plan gallery's 64 px the carrier filled most of the
tile, the meaning was a few pixels, and a shelf of them read as one beige
ledger. v3 replaced every one.

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
| `subject` | The subject sentence the prompt named |
| `sourceSummary` | Workshop Marks: the item's opening description sentence, for review |
| `styleReference` | The style anchor passed as Image 1 |
| `setReference` | The set anchor passed as Image 2 |
| `sheet`, `cell` | Workshop Marks: which generation sheet and which cell (1–8, row by row) the subject came from |
| `fill`, `shadow` | Workshop Marks: the cut-out's fit (longer side as a share of the tile) and the baked shadow |
| `periodCue`, `family`, `accents` | Reference Marks only: the period cue, `reference-library`, and the accent colors the prompt named |

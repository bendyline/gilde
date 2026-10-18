# Knowledge catalog keywords

Gezel suggests a knowledge catalog a person has not installed when what they
type names something it covers: "angioplasty" for *Wikipedia: Medicine &
Health*, "Seattle" for *Pacific Northwest*. The phrases live in
`keywords.json` beside each catalog's identity manifest
(`data/knowledge-catalogs/<shard>/<id>/keywords.json`), in the shape of
`schemas/knowledge-catalog-keywords.schema.json`:

```json
{
  "schemaVersion": 1,
  "catalogId": "regional-pacific-northwest",
  "sourceVersion": "2026.10.3",
  "terms": ["Pacific Northwest", "PNW", "Cascadia"],
  "articles": [
    "Bend, Oregon | Bend",
    "Spokane, Washington | Spokane | The Lilac City"
  ],
  "matchCase": ["Bend"]
}
```

- `terms` are hand-written here, in `rules.json`, and are the only phrases
  for catalogs without a Parquet companion (case law, Microsoft docs, how-to
  books).
- `articles` are generated: one line per article, its title first, then the
  other phrases that name it, joined by ` | `.
- `matchCase` phrases match only with this capitalization. A name made of
  everyday words ("Bend", "Frozen", "The Office") would otherwise fire on
  ordinary speech.

Phrases match on word boundaries and ignore case otherwise (gezel core's
`PhraseIndex`).

## Regenerating

```sh
npm run build-knowledge-keywords -- --cache=/tmp/gilde-keywords
npm run fix
npm run check
```

Run it after adding a knowledge catalog, after a catalog's new version, or
after changing `rules.json`; `--catalog=<id>` limits the run to some
catalogs. It needs the DuckDB CLI (`duckdb` on `PATH`, or `--duckdb=<path>`)
and network access to Hugging Face: it reads only the `title`, `aliases`,
`topic_path`, `chunk_count` and `summary` columns of each catalog's pinned
Parquet companion, about 3 MB per catalog. `--cache` keeps them between
runs.

## How articles are chosen

Each catalog's articles are ranked by `ln(1 + chunks) × (1 + aliases)`, then
filtered:

- list, timeline, history-of and similar titles are skipped, and so is any
  title with a year in it (seasons, editions, events);
- a qualifier is stripped from what is matched ("Frozen (2013 film)"
  matches "Frozen"), and regional catalogs also match the place before the
  comma ("Spokane, Washington" matches "Spokane");
- an alias is dropped when the article's other phrases already match it,
  when it is all capitals ("PTA"), or when it is a code or a URL;
- phrases shorter than four characters and phrases with a blocked word are
  dropped.

Whether a word is an everyday word comes from the catalogs' own summaries,
which are written in sentence case: "water" and "bend" appear in lowercase,
"Manchester" and "Seattle" do not. The system dictionary
(`/usr/share/dict/words`) settles words the summaries rarely use; the
committed files were built with the one macOS ships.

- **Named catalogs** (`commonWords: "matchCase"`, the default) keep a short
  name made only of everyday words, case-sensitively.
- **Concept catalogs** (`commonWords: "drop"`) keep everyday words,
  case-insensitively, because "asthma" and "gout" are what they are about.
  They drop a single word that also appears in 250 or more article titles of
  other catalogs: "heart", "water" and "pain" name too much to mean medicine.

## rules.json

`defaults`, then the first matching `families` prefix, then `catalogs.<id>`,
each overriding the last:

| Field | Meaning |
|---|---|
| `terms` | Hand-written phrases about the catalog as a whole. |
| `maxArticles` | Most articles kept; the file is also held under 900 KB. |
| `maxAliases` | Most aliases kept per article. |
| `commonWords` | `"matchCase"` for named things, `"drop"` for concepts. |
| `excludeTopics` | Second-level topic ids to skip (`"music-albums"`). |
| `geographyOnly` | Keep only `*-geography` articles (regional catalogs). |
| `placeNames` | Also match the place before a comma. |
| `matchCase` | Extra phrases to match case-sensitively. |
| `exclude` | Phrases never to emit. |
| `blockedWords`, `blockedRoots` | Words, and word fragments, that drop any phrase containing them. |

The generator warns about a term no title in the catalog mentions. Region
names ("Pacific Northwest", "Cascadia") are expected there; a place the
catalog has no articles about is a claim to remove.

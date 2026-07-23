# The gezelgilde.com update manifest

This is the contract between the gilde-pipeline publisher and gezel
clients. The pipeline emits it on every deploy; clients poll it to learn
that new catalog content exists. It is deliberately dumb: static JSON on
GitHub Pages, no server logic, cache-friendly.

## Endpoints

### Mutable pointer

`https://gezelgilde.com/catalog/v1/latest.json`

```json
{
  "schemaVersion": 1,
  "contentVersion": "0.1.7",
  "npmVersion": "0.1.7",
  "publishedAt": "2026-07-22T21:04:05Z",
  "gitSha": "<gilde commit sha this deploy was built from>",
  "baseUrl": "https://gezelgilde.com/catalog/v1/content/0.1.7",
  "kinds": {
    "chat-model":         { "count": 32,   "indexPath": "data/chat-models/index.json",         "sha256": "<hex>" },
    "image-model":        { "count": 12,   "indexPath": "data/image-models/index.json",        "sha256": "<hex>" },
    "video-model":        { "count": 4,    "indexPath": "data/video-models/index.json",        "sha256": "<hex>" },
    "toolset":            { "count": 3,    "indexPath": "data/toolsets/index.json",            "sha256": "<hex>" },
    "connector-type":     { "count": 7,    "indexPath": "data/connector-types/index.json",     "sha256": "<hex>" },
    "project-type":       { "count": 18,   "indexPath": "data/project-types/index.json",       "sha256": "<hex>" },
    "gezel-template":     { "count": 29,   "indexPath": "data/gezel-templates/index.json",     "sha256": "<hex>" },
    "craftbook-template": { "count": 283,  "indexPath": "data/craftbook-templates/index.json", "sha256": "<hex>" },
    "community-toolset":  { "count": 3797, "indexPath": "data/community/toolsets/index.json",  "sha256": "<hex>" }
  }
}
```

Counts are the `count` field of each generated `index.json`; `sha256` is
the hex SHA-256 of the index file's bytes.

### Immutable content snapshot

`{baseUrl}/data/**` mirrors the gilde repo's `data/` tree verbatim at the
published commit, with one exclusion: the per-item folders under
`data/community/` are omitted (the community `index.json` already embeds
every resolved manifest, so per-item files add ~60 MB of redundant deploy
weight). Everything else composes exactly like the repo layout:

```
{baseUrl}/data/<kind-dir>/index.json
{baseUrl}/data/<kind-dir>/<shard>/<id>/manifest.json
{baseUrl}/data/<kind-dir>/<shard>/<id>/versions/<v>/manifest.json
{baseUrl}/data/<kind-dir>/<shard>/<id>/versions/<v>/craftbook.json
{baseUrl}/data/<kind-dir>/<shard>/<id>/versions/<v>/test.json
{baseUrl}/data/<kind-dir>/<shard>/<id>/versions/<v>/about.md
```

## Client rules

- Poll `latest.json` only. Never crawl the content tree (GitHub Pages
  has a soft 100 GB/month bandwidth budget).
- Compare each kind's `sha256` against your cached copy; fetch that
  kind's index only when it changed, and per-item files on demand.
- Only the current `contentVersion` snapshot is guaranteed to exist. A
  404 on a stale versioned path means "re-read latest.json" — versioned
  paths give atomicity during a deploy, not an archive.
- `latest.json` is served with GitHub Pages' default caching (roughly
  ten minutes). That staleness is acceptable for a catalog.

# gilde

The open catalog that powers [gezel](https://github.com/bendyline/gezel). Browse it rendered at [**gezelgilde.com**](https://gezelgilde.com), or use it as data:

```
npm install @bendyline/gilde
```

The package is raw JSON, Markdown, and implementations with no runtime
dependencies. It includes the released `data/`, exported schemas, and the
small authoring source trees consumers need to verify generated families
against their inputs; repository tooling and CI files are not published.

## What's inside

| Category | Path | What it is |
| --- | --- | --- |
| Craftbooks | data/craftbook-templates/ | Step-by-step task playbooks a gezel can follow, each with an eval sidecar (`test.json`) |
| Chat models | data/chat-models/ | Local model manifests: engine sources (llama.cpp / MLX / ds4), pinned revisions and sha256s, tuning defaults |
| Roles | data/gezel-templates/ | Gezel role templates — the `about.md` prose that gives a gezel its character |
| Project types | data/project-types/ | Ready-made project scaffolds (mission, about, pages, embedded craftbooks) |
| Image models | data/image-models/ | Image generation model manifests |
| Connector types | data/connector-types/ | Connector definitions for external services |
| Video models | data/video-models/ | Video generation model manifests |
| Toolsets | data/toolsets/ | Hand-curated first-party toolsets |
| Community toolsets | data/community/toolsets/ | Auto-imported from the MCP registry, permissive licenses only — bot-managed |
| Authoring sources | authoring/ | Reproducible source material for generated catalog families; inert at runtime |

Every item follows the same layout:

```
data/<category>/<shard>/<id>/manifest.json          identity: name, description, tags, license
data/<category>/<shard>/<id>/versions/<semver>/...  released content, never mutated after release
data/<category>/index.json                          generated listing (do not hand-edit)
```

where `<shard>` is the first two characters of the id.

Chat-model introductions are Gilde-only: add an authoring recipe under
`authoring/chat-models/`, run `npm run build-chat-model`, and commit the new
identity, version payload, and regenerated index. See
`authoring/chat-models/README.md` for the recipe contract.

## Contributing

New craftbooks, model updates, roles — contributions are welcome, from

humans and their AI agents alike. Start with

[CONTRIBUTING.md](CONTRIBUTING.md); if you are an AI agent,

[AGENTS.md](AGENTS.md) is the contract written for you.

Every PR is validated by CI. Run the same checks locally:

```
npm run check         runs all validation checks below
npm run validate      structural + schema validation of the whole tree
npm run check-index   verifies the generated index.json files are fresh
npm run lint-models   completeness lint for chat-model manifests
npm run fix           rewrites non-canonical JSON and regenerates the indexes
                      (check never writes — run fix, then re-run check)
```

Validation is dependency-light on purpose: plain Node 24 plus `ajv`,

against the JSON Schemas in schemas/ (generated from gezel's

canonical Zod schemas — do not edit them here).

## Try the project pages locally

Run the standalone page gallery from the repository root:

```
npm run demos
```

Then open [http://127.0.0.1:4173/](http://127.0.0.1:4173/). The home page
links to every latest project-type web experience. Each page recognizes
that it is outside Gezel, uses local sample data, and can be reset by
reloading. To choose a different address:

```
npm run demos -- --host 127.0.0.1 --port 8080
```

## Licensing

The catalog structure and tooling are MIT. Each model entry carries its

own upstream `license` field — check it before you ship a model. Community

toolset entries are filtered to permissive licenses at import time.

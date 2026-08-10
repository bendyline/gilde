# Chat-model authoring recipes

Each JSON file in this directory is the complete source recipe for one local
chat model. Recipes combine stable catalog metadata with provider source
pointers; `tools/build-chat-model.mjs` resolves Hugging Face revisions,
checksums, file sizes, and MLX file lists and emits the released identity and
version manifests under `data/chat-models/`.

To introduce a model, add `<id>.json` here and run:

```sh
npm run build-chat-model -- --config authoring/chat-models/<id>.json --release
npm run fix
npm run check
```

At least one of `ollama`, `llamaCpp`, `mlx`, or `ds4` is required. The filename
must match `id`. The generator will not overwrite an existing version: bump
`version` and `updatedAt` for every release. A normal rebuild preserves tuning,
behaviors, eval hints, and provider revision pins already evolved in the
identity; `--reseed` deliberately makes the recipe authoritative for those
editorial fields.

The runtime never reads this directory. It consumes only the validated,
generated manifests in `data/chat-models/`, so a published Gilde patch can add
a model without a Gezel application release.

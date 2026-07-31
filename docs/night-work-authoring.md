# Authoring night work: runModes, suggestedCraftbooks, and report actions

How gilde content plugs into gezel's Night Shift.

## Craftbooks: declare run-mode affinity

A craftbook suited to unattended recurring runs declares it in the
version document (`craftbook.json`):

```json
"runModes": { "nightShift": "recommended", "scheduled": "supported" }
```

`recommended` puts the book on the launcher's recommended shelf for that
mode; `supported` merely allows it. Keep the `night-shift` manifest tag in
sync with `runModes.nightShift` — the tag drives search, the field drives
behavior.

Night-work books should default to **reports, findings, and sidecar
files** (artifacts, `translations/…`), not in-place workspace mutation.
That's a soft rule — gezel's per-project write gates are the hard
backstop — but it keeps the morning review a review, not a surprise.

## Gezel templates: suggest recurring work

A role can bring standing night work. In the template's version manifest:

```json
"suggestedCraftbooks": [
  {
    "craftbookId": "security-architecture-review",
    "runMode": "night-shift",
    "reason": "Keeps an eye on new code overnight."
  }
]
```

`runMode: "scheduled"` requires a `cron` (5-field, UTC). Suggestions are
**never auto-armed** — gezel surfaces them as opt-in toggles when the
role joins a project. Optional `params` seed the enable form.

## Report actions: make recommendations fireable

A night-work book whose report step produces recommendations can make
them one-click actionable by emitting ` ```gezel-action ` fenced YAML
blocks in the report markdown. Three kinds — `fire-craftbook`
(`craftbookId`, optional `params`), `create-task` (`prompt`, optional
`role`), and `apply-edits` (`edits: [{path, diffArtifact}]`). Rules that
matter for content authors:

- Flat YAML keys, one block per action, a stable `id` slug per block
  (lifecycle state survives nightly report regeneration through it).
- `apply-edits` diffs are **sidecar `.diff` artifacts** (one single-file
  unified diff per file), referenced via `diffArtifact` — never inlined
  in the YAML.
- Cross-project recommendations set `projectId`.
- Never invent craftbook ids — only reference books the step confirmed
  exist.

The canonical prompt snippet teaching the format is
`REPORT_ACTION_AUTHORING_GUIDE` in gezel core
(`packages/core/src/markdown/report-actions.ts`) — embed or paraphrase
it in report-writing step prompts rather than restating the grammar from
memory.

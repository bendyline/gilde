# Craftbook gallery taxonomy

The content backlog for the gallery (Pillar 3). Each entry below maps to one
`ArchetypeSpec` in [`scripts/craftbook-archetypes.ts`](../scripts/craftbook-archetypes.ts);
running `pnpm --filter @bendyline/gezel-catalog generate-craftbooks` turns
specs into bundled craftbooks, and `suggest_craftbook` ranks the lot into a
top-K shortlist for the voorman.

This is a *menu*, not 400 finished specs. The value of a specific gallery
book over the generic `build-loop` is two things, and every entry encodes
them: **the right specialist role per phase**, and a **domain-correct
ordering**. Write the small spec (phases + roles + prompts); the
deterministic generator guarantees a schema-valid, consistently-gated book.

## How to read an entry

```
- id — Name. phaseA(role) → phaseB(role) → build(role)        [notes]
```

- Every archetype ends with the standard gate, omitted for brevity:
  **`→ evaluate(reviewer) ⟲`** — the reviewer grades against the
  acceptance-criteria the first phase locks, and loops back to the build
  phase until they pass (the `build-loop` contract).
- The **first phase locks acceptance criteria** — that is the scaffold a
  small model needs; it is what `evaluate` grades against.
- Roles resolve via `ensureGezel`: `planner`, `developer`, `designer`,
  `game-designer`, `visual-designer`, `copywriter`, `reviewer`,
  `researcher`, `data-analyst`, `image-generator`, `qa`. New role strings
  are fine — they fuzzy-match or spin up a bespoke gezel.
- **Ordering is deliberate.** Where a domain needs design/scope before
  build (branding, decks, data), the phases say so; that ordering is the
  point.

Shipped seed (in `craftbook-archetypes.ts` today): `html-arcade-game`,
`branding-website`, `image-set-index`, `content-deck`, `corpus-email-digest`.

---

## Two axes

1. **Outcome axis** — "what the human wants." The 12 families below.
2. **Capability axis** — "one craftbook per MCP." Enumerable directly from
   the catalog's toolset list; see the last section. These are the
   fastest, most reliable seed (grounded in real tools) and double as
   building blocks the outcome books compose.

---

## 1. Build — interactive / web

- html-arcade-game — Arcade game. game-design(game-designer) → visual-design(visual-designer) → build(developer)   *[shipped]*
- html-puzzle-game — Puzzle/logic game. game-design(game-designer) → visual-design(visual-designer) → build(developer)
- board-game-web — Digital board game. rules-design(game-designer) → visual-design(visual-designer) → build(developer)
- idle-clicker-game — Idle/incremental game. economy-design(game-designer) → visual-design(visual-designer) → build(developer)
- physics-toy — Interactive physics/canvas toy. concept(designer) → build(developer)
- branding-website — Brand/marketing site. brand-design(visual-designer) → copy(copywriter) → build(developer)   *[shipped, visual-first]*
- landing-page — Single conversion landing page. offer-scope(planner) → visual-design(visual-designer) → copy(copywriter) → build(developer)
- portfolio-site — Personal/portfolio site. content-scope(planner) → visual-design(visual-designer) → build(developer)
- docs-site — Documentation site. ia(planner) → visual-design(designer) → build(developer)
- spa-dashboard — Metrics/admin dashboard. data-scope(planner) → layout-design(designer) → build(developer)
- web-app-crud — Small CRUD web app. model-scope(planner) → ui-design(designer) → build(developer)
- form-wizard — Multi-step form/wizard. flow-design(designer) → build(developer)
- data-viz-page — Single interactive chart/explorer. data-scope(planner) → chart-design(designer) → build(developer)
- email-template — Responsive HTML email. design(visual-designer) → copy(copywriter) → build(developer)
- chrome-extension — Browser extension. scope(planner) → ui-design(designer) → build(developer)
- pwa-offline — Installable offline PWA. scope(planner) → design(designer) → build(developer)
- interactive-quiz — Quiz/assessment widget. content(planner) → design(designer) → build(developer)
- onboarding-flow — Product onboarding tour. flow-design(designer) → copy(copywriter) → build(developer)
- pricing-page — Pricing/plan-comparison page. offer-scope(planner) → visual-design(visual-designer) → copy(copywriter) → build(developer)
- micro-game-jam — Tiny themed game from a prompt. theme-design(game-designer) → build(developer)
- svg-animation — Animated SVG/CSS hero. motion-design(visual-designer) → build(developer)
- web-component — Reusable custom element. api-design(developer) → build(developer)
- canvas-generative-art — Generative art piece. aesthetic-scope(visual-designer) → build(developer)
- accessibility-retrofit — Make an existing page WCAG-AA. audit(reviewer) → fix(developer)   *[loopBackTo: fix]*

## 2. Build — software / code

- rest-api — REST API service. contract-design(planner) → build(developer) → test(developer)
- graphql-api — GraphQL API. schema-design(planner) → build(developer) → test(developer)
- cli-tool — Command-line tool. ux-scope(planner) → build(developer) → test(developer)
- library-package — Reusable library/SDK. api-design(planner) → build(developer) → docs(copywriter)
- webhook-handler — Inbound webhook processor. contract-scope(planner) → build(developer) → test(developer)
- cron-job — Scheduled batch job. scope(planner) → build(developer) → test(developer)
- data-pipeline-etl — ETL/ingest pipeline. schema-scope(planner) → build(developer) → validate(reviewer)
- schema-migration — Multi-file schema/type migration. plan(planner) → migrate(developer) → verify(reviewer)
- refactor-module — Behavior-preserving refactor. plan(planner) → refactor(developer) → verify(reviewer)   *[gate: tests still green]*
- bug-fix-tdd — Reproduce-then-fix a bug. reproduce(developer) → fix(developer) → verify(reviewer)
- test-suite-backfill — Add tests to untested code. coverage-scope(planner) → write-tests(developer)
- perf-optimization — Targeted performance fix. profile(developer) → optimize(developer) → verify(reviewer)
- type-safety-pass — Tighten types / kill `any`. audit(developer) → fix(developer) → verify(reviewer)
- dockerize-app — Containerize a service. scope(planner) → build(developer) → verify(reviewer)
- ci-pipeline — CI workflow from scratch. scope(planner) → build(developer) → verify(reviewer)
- config-scaffold — Project config/bootstrap. scope(planner) → build(developer)
- sdk-wrapper — Wrap an external API as a typed client. api-study(researcher) → build(developer) → test(developer)
- state-machine — Model a flow as a state machine. model(planner) → build(developer) → test(developer)
- parser-grammar — Parser/DSL for a small grammar. grammar-design(planner) → build(developer) → test(developer)
- auth-flow — Auth/session implementation. threat-scope(planner) → build(developer) → review(reviewer)
- feature-flag-rollout — Add a flagged feature. plan(planner) → build(developer) → verify(reviewer)
- db-index-tuning — Diagnose + add DB indexes. analyze(data-analyst) → change(developer) → verify(reviewer)
- regex-builder — Build + test a tricky regex. spec(planner) → build(developer) → test(developer)
- script-automation — One-off automation script. scope(planner) → build(developer) → verify(reviewer)

## 3. Media — images

- image-set-index — Index & describe an image set. scope(planner) → describe(developer) → assemble(developer)   *[shipped]*
- logo-set — Logo + variants. brief(visual-designer) → generate(image-generator) → assemble(developer)
- icon-pack — Coherent icon set. style-scope(visual-designer) → generate(image-generator) → assemble(developer)
- hero-image — Marketing hero image. brief(visual-designer) → generate(image-generator) → place(developer)
- image-batch-edit — Batch transform a folder. scope(planner) → process(developer) → verify(reviewer)
- alt-text-pass — Generate alt-text for a site/folder. scope(planner) → caption(developer) → apply(developer)
- thumbnail-generator — Derive thumbnails/variants. scope(planner) → build(developer)
- moodboard — Visual moodboard from a brief. brief(visual-designer) → assemble(image-generator)
- sprite-sheet — Game sprite sheet. style-scope(game-designer) → generate(image-generator) → pack(developer)
- image-dedup-cluster — Find/cluster near-duplicate images. scope(planner) → analyze(developer) → report(developer)
- ocr-extract — OCR a folder of scans to text. scope(planner) → extract(developer) → verify(reviewer)
- diagram-from-text — Render a diagram from a description. spec(planner) → build(developer)
- photo-cull — Rank/cull a photo set by quality. criteria(planner) → score(developer) → report(developer)
- image-seo-rename — Rename/tag images for SEO. scope(planner) → process(developer)

## 4. Media — audio / video

- folder-to-audio — TTS a folder of text. scope(planner) → synthesize(developer) → verify(reviewer)
- transcribe-audio — Audio/video → transcript. scope(planner) → transcribe(developer) → verify(reviewer)
- subtitle-generator — Generate + sync subtitles. scope(planner) → transcribe(developer) → format(developer)
- narrated-slideshow — Slides + narration video. outline(planner) → design(designer) → build(developer)
- podcast-chaptering — Chapter markers + show notes. scope(planner) → analyze(developer) → write(copywriter)
- audio-highlight-reel — Cut highlights from long audio. criteria(planner) → select(developer) → assemble(developer)
- voiceover-script — Script tuned for TTS/VO. brief(copywriter) → draft(copywriter)
- meeting-summary-audio — Recording → minutes + actions. transcribe(developer) → summarize(copywriter)
- music-metadata-tag — Tag/organize an audio library. schema(planner) → tag(developer) → verify(reviewer)
- video-storyboard — Storyboard from a script. script-scope(planner) → storyboard(visual-designer)

## 5. Documents & decks

- content-deck — Slide deck from content. outline(planner) → slide-design(designer) → build(developer)   *[shipped]*
- pitch-deck — Investor/sales pitch deck. narrative(planner) → visual-design(visual-designer) → build(developer)
- report-pdf — Formatted report/PDF. outline(planner) → design(designer) → build(developer)
- one-pager — Single-page brief/summary. scope(planner) → design(designer) → write(copywriter)
- whitepaper — Long-form whitepaper. research(researcher) → outline(planner) → write(copywriter)
- resume-cv — Résumé/CV from background. scope(planner) → design(designer) → write(copywriter)
- proposal-sow — Proposal / statement of work. scope(planner) → write(copywriter) → format(developer)
- runbook — Ops runbook/playbook. scope(planner) → write(copywriter) → review(reviewer)
- spec-doc — Technical design doc. scope(planner) → write(developer) → review(reviewer)
- contract-template — Templated agreement (non-legal-advice). scope(planner) → draft(copywriter) → review(reviewer)
- newsletter-issue — Formatted newsletter issue. outline(planner) → write(copywriter) → build(developer)
- ebook-compile — Compile notes into an ebook. outline(planner) → write(copywriter) → build(developer)
- handbook-section — Team handbook section. scope(planner) → write(copywriter) → review(reviewer)
- invoice-generator — Generate a formatted invoice. scope(planner) → build(developer)

## 6. Content & writing

- blog-post — SEO-aware blog post. keyword-scope(planner) → draft(copywriter) → edit(reviewer)
- landing-copy — Conversion copy for a page. offer-scope(planner) → draft(copywriter) → edit(reviewer)
- product-descriptions — Bulk product copy. voice-scope(planner) → draft(copywriter)
- social-thread — Multi-post social thread. angle-scope(planner) → draft(copywriter)
- press-release — Press release. scope(planner) → draft(copywriter) → review(reviewer)
- faq-from-docs — FAQ from source docs. mine(researcher) → write(copywriter)
- doc-rewrite — Rewrite/clarify existing docs. audit(reviewer) → rewrite(copywriter)   *[loopBackTo: rewrite]*
- tone-rewrite — Re-voice content to a brand tone. voice-scope(planner) → rewrite(copywriter)
- localize-content — Localize/translate content. scope(planner) → translate(copywriter) → review(reviewer)
- summarize-long — Summarize a long document. scope(planner) → summarize(copywriter)
- changelog-writeup — Human-readable changelog. gather(developer) → write(copywriter)
- cover-letter — Tailored cover letter. scope(planner) → draft(copywriter)
- ad-variations — A/B ad copy variations. brief(planner) → draft(copywriter)
- email-sequence — Lifecycle email sequence. journey-scope(planner) → draft(copywriter) → build(developer)
- knowledge-base-article — Support KB article. scope(planner) → write(copywriter) → review(reviewer)

## 7. Data & analysis

- dataset-clean — Ingest + clean a dataset. profile(data-analyst) → clean(developer) → validate(reviewer)
- data-to-report — Dataset → narrative report. analyze(data-analyst) → write(copywriter) → build(developer)
- chart-pack — Set of charts from data. question-scope(planner) → analyze(data-analyst) → build(developer)
- spreadsheet-model — Build a spreadsheet/model. scope(planner) → build(developer) → verify(reviewer)
- sql-analysis — Answer a question with SQL. question-scope(planner) → query(data-analyst) → verify(reviewer)
- ab-test-readout — Analyze an experiment. hypothesis-scope(data-analyst) → analyze(data-analyst) → write(copywriter)
- csv-transformer — Reshape/convert tabular data. schema-scope(planner) → build(developer) → verify(reviewer)
- data-dictionary — Document a dataset's schema. inspect(data-analyst) → write(copywriter)
- anomaly-scan — Find anomalies/outliers. criteria(data-analyst) → scan(developer) → report(copywriter)
- forecast-model — Simple forecast/trend. scope(data-analyst) → build(developer) → review(reviewer)
- survey-analysis — Analyze survey responses. scope(data-analyst) → analyze(data-analyst) → write(copywriter)
- dashboard-spec — Spec a dashboard from questions. question-scope(planner) → design(designer)
- cohort-analysis — Cohort/retention readout. scope(data-analyst) → analyze(data-analyst) → write(copywriter)
- data-quality-audit — Audit data quality. rules(data-analyst) → audit(developer) → report(copywriter)

## 8. Knowledge & research

- research-report — Cited research report. question-scope(planner) → research(researcher) → write(copywriter)
- literature-review — Survey of sources on a topic. scope(planner) → gather(researcher) → synthesize(copywriter)
- competitive-analysis — Compare competitors. dimension-scope(planner) → research(researcher) → write(copywriter)
- market-scan — Market/landscape scan. scope(planner) → research(researcher) → write(copywriter)
- fact-check — Verify a set of claims. claim-scope(planner) → verify(researcher) → report(reviewer)
- corpus-synthesis — Synthesize a document corpus. scope(planner) → read(researcher) → synthesize(copywriter)
- comparison-matrix — Option comparison matrix. criteria-scope(planner) → research(researcher) → build(developer)
- due-diligence-brief — Diligence brief on an entity. scope(planner) → research(researcher) → write(copywriter)
- topic-explainer — Explainer on a complex topic. scope(planner) → research(researcher) → write(copywriter)
- citation-audit — Check claims↔citations in a doc. scope(reviewer) → verify(researcher) → report(reviewer)
- glossary-build — Build a domain glossary. scope(planner) → gather(researcher) → write(copywriter)
- reading-list — Curated annotated reading list. scope(planner) → curate(researcher)

## 9. Comms & ops automation

- corpus-email-digest — Daily digest from a corpus. scope(planner) → draft(copywriter) → build(developer)   *[shipped]*
- inbox-triage — Triage + draft replies. rules-scope(planner) → triage(developer) → draft(copywriter)
- status-report — Recurring status report. scope(planner) → gather(developer) → write(copywriter)
- standup-summary — Summarize team updates. scope(planner) → summarize(copywriter)
- calendar-brief — Daily calendar/prep brief. scope(planner) → assemble(developer)
- alert-rules — Monitoring alert rules. scope(planner) → build(developer) → verify(reviewer)
- notification-router — Route events to channels. scope(planner) → build(developer) → test(developer)
- meeting-notes-to-actions — Notes → action items. extract(developer) → assign(planner)
- weekly-review — Personal/team weekly review. scope(planner) → assemble(copywriter)
- escalation-playbook — On-call escalation flow. scope(planner) → write(copywriter) → review(reviewer)
- digest-from-feeds — RSS/feed digest. source-scope(planner) → gather(developer) → write(copywriter)
- crm-update-batch — Bulk CRM updates from notes. scope(planner) → build(developer) → verify(reviewer)

## 10. Personal / biz workflows

- scrape-to-structured — Scrape a site → structured data. scope(planner) → scrape(developer) → validate(reviewer)
- form-fill-batch — Fill forms from a dataset. scope(planner) → build(developer) → verify(reviewer)
- monitor-and-alert — Watch a page/API + alert. scope(planner) → build(developer) → test(developer)
- price-tracker — Track prices over time. scope(planner) → build(developer)
- lead-enrichment — Enrich a leads list. scope(planner) → enrich(developer) → verify(reviewer)
- expense-categorize — Categorize transactions. rules-scope(planner) → categorize(developer) → review(reviewer)
- doc-intake-pipeline — Classify/route incoming docs. scope(planner) → build(developer) → verify(reviewer)
- booking-automation — Automate a booking/checkout flow. scope(planner) → build(developer) → test(developer)
- backup-routine — Scheduled backup/export. scope(planner) → build(developer) → verify(reviewer)
- data-export-migrate — Migrate data between tools. scope(planner) → build(developer) → verify(reviewer)
- recurring-invoice-run — Generate + send invoices. scope(planner) → build(developer) → verify(reviewer)
- onboarding-checklist — Generate an onboarding checklist. scope(planner) → write(copywriter)

## 11. Review & QA

- pull-request-review — Staff-eng PR review.   *(exists: `pull-request-review`)*
- qa — Live browser QA pass.   *(exists: `qa`)*
- investigate — Root-cause debugging.   *(exists: `investigate`)*
- security-review — Security review of a diff. scope(reviewer) → audit(reviewer) → report(reviewer)
- a11y-audit — Accessibility audit. scope(reviewer) → audit(reviewer) → report(reviewer)
- design-review — UX/visual design review. scope(reviewer) → review(visual-designer) → report(reviewer)
- copy-review — Editorial/tone review. scope(reviewer) → review(copywriter) → report(reviewer)
- perf-audit — Performance audit. scope(reviewer) → measure(developer) → report(reviewer)
- dependency-audit — Audit deps for risk/staleness. scan(developer) → assess(reviewer) → report(reviewer)
- api-contract-review — Review an API contract. scope(reviewer) → review(developer) → report(reviewer)
- threat-model — Lightweight threat model. scope(planner) → model(reviewer) → report(reviewer)
- content-accuracy-review — Fact/accuracy review of content. scope(reviewer) → verify(researcher) → report(reviewer)

## 12. Ship & release

- ship — Full release pipeline.   *(exists: `ship`)*
- reviewer-loop — Draft→critique→revise→publish.   *(exists: `reviewer-loop`)*
- office-hours — Scope/forcing-questions.   *(exists: `office-hours`)*
- release-notes — Human release notes. gather(developer) → write(copywriter) → review(reviewer)
- changelog-cut — Cut a versioned changelog. gather(developer) → write(copywriter)
- deploy-checklist — Pre-deploy verification. scope(planner) → verify(developer) → report(reviewer)
- rollback-plan — Author a rollback plan. scope(planner) → write(developer) → review(reviewer)
- hotfix-flow — Expedited hotfix. reproduce(developer) → fix(developer) → verify(reviewer)
- version-bump — Coordinated version bump. scope(planner) → bump(developer) → verify(reviewer)
- postmortem — Incident postmortem.   *(see eval scenario `incident-postmortem`)*

---

## Capability axis — one craftbook per MCP

The catalog already lists every toolset/MCP. A capability book is
**enumerable** from that list and **tool-grounded** (its steps reference the
MCP's real tools, so the generator can't invent capabilities). Shape:

```
use-<toolset> — Accomplish a task with <toolset>.
  scope(planner) → operate(developer, using <toolset>'s tools) → evaluate(reviewer)
```

Enumeration: read `catalog.list('toolset')`, and for each toolset emit a spec
whose `operate` phase names that toolset's tools and whose `scope` phase
locks acceptance criteria. Group by the existing toolset category
(`categorizeToolset`) so the gallery reads sensibly — representative shapes:

- **Comms** (email, chat, calendar MCPs) — `use-<x>`: scope → operate → verify. Compose with family 9 (digests, triage, briefs).
- **Storage/files** (drive, S3, fs MCPs) — scope → operate → verify. Compose with families 3/7 (index, migrate, backup).
- **Data/DB** (SQL, warehouse MCPs) — scope → query(data-analyst) → verify. Compose with family 7.
- **Dev/VCS** (GitHub, CI MCPs) — scope → operate → verify. Compose with families 2/12.
- **Media/gen** (image/audio MCPs) — brief(designer) → generate(image-generator) → verify. Compose with families 3/4.
- **Web/browse** (fetch, browser MCPs) — scope → operate → validate. Compose with family 10 (scrape, monitor).
- **Knowledge** (search, wiki MCPs) — scope → research(researcher) → synthesize. Compose with family 8.

Capability books are also **building blocks**: an outcome book like
`branding-website` composes the image-gen capability for its hero image.

---

## Turning an entry into a spec

1. Pick an entry; copy its phase→role shape.
2. In `scripts/craftbook-archetypes.ts`, add an `ArchetypeSpec`: `id`,
   `name`, `description` (what `suggest_craftbook` ranks on), `tags`,
   `triggers`, the `phases` (each with a concrete `prompt` — the first
   phase must lock an acceptance-criteria checklist), and `evaluate`
   (what to check; `loopBackTo` if not the last phase).
3. `pnpm --filter @bendyline/gezel-catalog generate-craftbooks` then
   `build-index --kind=craftbook-template`.
4. The bundled-craftbook guard test validates it; `suggest_craftbook` can
   now rank it; the meester can pin it at project creation.

**Prioritization for scaling 12 → hundreds:** seed the capability axis
first (mechanical, grounded), then the highest-traffic outcome families
(1, 2, 5, 6, 9), and **eval-gate new books** (Pillar 4) before trusting
them — a bad book misleads a small model worse than no book.

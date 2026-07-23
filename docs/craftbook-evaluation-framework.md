# Craftbook evaluation framework — ironclad gates + reviewer roles

## The problem this solves

Eval runs showed the load-bearing weakness of the build→evaluate→loop: the
*evaluate gate is model-driven*. A small model builds a (mediocre) deliverable
but can't **grade it and route** `advance_task_step` back to build — so the
loop that's meant to rescue weak output strands them at the gate (e4b on
arcade-deluxe: wrote `README.md` ×5 and stalled). The structure is safe (no
regression on easy scenarios / capable models) but its *value* never
materializes for the models it's meant to help.

The fix is to **take the gate out of the model's hands**, in two layers:

1. **Static gates** — declarative, runtime-evaluated, objective. Cheap,
   deterministic, "ironclad". *No gezel, no LLM judgment.*
2. **Reviewer gates** — a dedicated reviewer-role gezel with Playwright that
   screenshots, hunts JS console errors, and exercises the flow — the dynamic
   checks static can't do. *Encouraged via the step's `suggestedRole`.*

A craftbook author composes them: static first (always, automated), then —
when the deliverable warrants it — a reviewer pass.

---

## Layer 1 — static gates (the ironclad floor)

A new declarative `gate` on a craftbook step. When that step activates, the
**runtime** evaluates the checks against the workspace and routes the task —
**without a model turn**. On fail it writes the specific gaps to task notes
and loops back to build; on pass it advances (or hands to a reviewer). This is
what carries a weak model: it builds, the runtime gates + loops with a concrete
gap ("index.html+game.js = 2.1 KB, need ≥5 KB; no CSS found"), it builds again.

### Schema (`packages/core/src/schemas/craftbook.ts`)

```ts
gate?: {
  checks: GateCheck[];        // ALL must pass
  onFail?: string;            // step on fail (default: loop back to the build/entry step)
  onPass?: string;            // step on pass (default: `next`)
  maxAttempts?: number;       // after N failed loops, escalate instead of looping forever (default 4)
  reviewer?: string;          // optional role to hand to AFTER static passes (Layer 2)
};

type GateCheck =
  | { kind: 'minBytes';      file: string;   bytes: number }                 // a file ≥ N bytes
  | { kind: 'totalMinBytes'; files: string[]; bytes: number }                // Σ files ≥ N  (index.html + game.js ≥ 5 KB)
  | { kind: 'fileCount';     ext: string[];  min: number; dir?: string }     // ≥ 3 images (png/jpg/svg/webp)
  | { kind: 'cssMinBytes';   bytes: number }                                 // inline <style> + linked .css ≥ N
  | { kind: 'sniff';         file: string;   sniff: 'html-complete'|'html-game'|'nonempty'|'json-valid' }
  | { kind: 'contains';      file: string;   pattern: string; flags?: string }; // regex present (e.g. a game-over screen)
```

The user's two examples map directly:

```jsonc
// game
"gate": { "checks": [
  { "kind": "totalMinBytes", "files": ["index.html", "game.js"], "bytes": 5120 },
  { "kind": "sniff", "file": "index.html", "sniff": "html-game" }
], "onFail": "build", "maxAttempts": 4 }

// marketing website
"gate": { "checks": [
  { "kind": "cssMinBytes", "bytes": 1024 },
  { "kind": "fileCount", "ext": ["png","jpg","jpeg","svg","webp"], "min": 3 }
], "onFail": "build", "maxAttempts": 4 }
```

### Mechanism (`packages/service`)

- New `packages/service/src/tasks/gate-eval.ts`: pure `evaluateGate(checks, reader) → { pass, failures: string[] }`. `reader` reads workspace files + lists them (backed by `store`). Reuses `runStepSniff`. No LLM, no Playwright — just filesystem facts.
- Wire into the **`onStepActivated` hook** (`service.ts`): when the newly-activated step has a `gate`, the runtime evaluates it instead of starting a gezel session:
  - **pass + no reviewer** → `tasks.completeStep(step → onPass/next)`.
  - **pass + reviewer** → start a task-scoped session for the `reviewer` role (Layer 2) — it does the dynamic pass and routes.
  - **fail + attemptCount < maxAttempts** → `appendNote(failures)` then `completeStep(step → onFail)` (loop back to build).
  - **fail + attemptCount ≥ maxAttempts** → route to a terminal `halt`/`finish-with-concerns` step (escape the loop, surface to the user).
- This composes with the existing pieces: build's `advanceWhen` gets the loop *to* the gate without a model advance; the gate then routes *out* of it without a model advance. The model only ever does the one thing it's good at — `writeFile`. Loop bounding rides on `attemptCount` (already tracked).

---

## Layer 2 — reviewer-role gates (dynamic, Playwright)

Static checks prove "there's enough of the right stuff." They can't prove "it
runs and looks right." For that, the gate optionally hands — *after static
passes* — to a dedicated **reviewer** gezel that does what a builder won't:

- `run_playwright_script` / `browser_*`: load the deliverable, **screenshot**
  it (artifact), assert no **JS console errors** on load, click the primary
  CTA / press keys, verify the flow (title → play → game-over → restart).
- Report a structured verdict; route `advance_task_step` pass→finish /
  fail→build with the observed gap ("page threw `TypeError` on load",
  "clicking Start did nothing").

### Encouraging small models to actually do it

The reason builders skip evaluation is they're builders. The fix is **role +
session + tools + prompt**, all of which we now have the machinery for:

- The gate step's `suggestedRole: "reviewer"` (a QA-reviewer gilde template)
  means the engagement fix starts a **fresh task-scoped session for a reviewer
  gezel**, not the builder — clean context, the reviewer persona, and a
  procedure that says exactly "run Playwright, screenshot, check errors, route."
- The reviewer template ships with the QA toolset (`run_playwright_script`,
  `browser_*`) and **without** `writeFile` (role-tool-filter) — so it can't
  drift into rebuilding; its only forward action is to route. This is the
  structural nudge: a small model in a reviewer session with no build tools and
  a 3-line "screenshot → check → route" procedure is far likelier to evaluate
  than a builder told "now also review your own work."
- **Tier/mode behavior:** in a **crew** project the reviewer is a distinct
  specialist (natural). In **solo** the role collapses to the one worker, so
  solo gets **Layer 1 only** (the automated static floor) — which is correct:
  the static gate needs no gezel. The meester should route gate-bearing
  multi-phase builds to **crew** (where a reviewer is available) — a small
  routing nudge, tracked as follow-up.

---

## How the two layers run together (build-loop)

```
build (model writes index.html)
  │  advanceWhen{index.html, html-complete} — runtime advances, no model call
  ▼
evaluate (gate)
  ├─ static checks (runtime)            ── fail ──▶ note the gap, loop to build   (≤ maxAttempts)
  │                                                  └─ after maxAttempts ▶ halt (surface to user)
  └─ pass ─▶ reviewer? ── no ──▶ finish
                       └─ yes ─▶ reviewer gezel (Playwright: screenshot + JS errors + flow)
                                   ├─ pass ▶ finish
                                   └─ fail ▶ loop to build with the observed gap
```

The model's only job is `build`. Everything downstream is runtime + a
focused reviewer — which is exactly why it works for a 4B model.

---

## Implementation plan (sequenced)

1. **Static gate core** *(this change)* — `gate`/`GateCheck` schema + refine guard (core); `gate-eval.ts` evaluator (service); wire automated routing into `onStepActivated`; give build-loop's `evaluate` step a generic static gate; preserve `gate` through `inlineStepsToCraftbook` (same class of bug as `advanceWhen`). Validate on `arcade-deluxe` e4b: the gate auto-evaluates + loops with zero model advances; the loop bounds on `attemptCount`.
2. **Gallery gates** — extend the archetype spec/generator (`archetype.ts`) so each book declares its `gate.checks` (game → 5 KB + html-game; site → CSS + images; deck → slide count; etc.). Regenerate.
3. **Reviewer layer** — a `qa-reviewer` gilde template (Playwright toolset, no writeFile, "screenshot → check errors → route" about.md); set gate-step `suggestedRole`/`reviewer`; the reviewer's `onExit`/routing. Validate on a crew run.
4. **Routing nudge** — meester prefers crew for gate-bearing multi-phase builds so the reviewer is available; tier-aware (don't impose a reviewer pass a tiny solo model can't staff).
5. **Re-measure** — `arcade-deluxe` A/B across tiers: expect the static gate to carry weak models (loop until ≥ floor) and the reviewer to catch runtime breakage on crew runs.

**Guardrails:** the static gate is the ironclad floor — it can never *pass*
junk (objective minimums), only *fail-and-loop* or *escalate*; it can't loop
forever (`maxAttempts` → halt); and it's strictly opt-in per step (absent
`gate`, behavior is unchanged), so existing craftbooks (ship, qa, …) are
untouched.

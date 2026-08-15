# AGENTS.md

Working notes for an agent picking up this repository. The README is written for
users; this file is the operational detail a README should not carry.

## What this project is

SpecTruth is a **Done Integrity ship gate**. When an agent marks a spec task
complete, that is a *claim*. SpecTruth audits the claim against the acceptance
criteria the task references and returns a ship decision.

The framing matters and is easy to drift from. It is **not** a code reviewer, a
test runner, or a spec-conformance scorer. Its input is the completion claim,
which is why it can catch work that was never done rather than only work done
badly.

## Layout

```text
packages/core     spectruth-core  — the whole engine
packages/cli      spectruth       — thin CLI over core
packages/web      spectruth-web   — landing page (private, never published)
examples/         records-api     — deliberately flawed project to audit
docs/             integration findings
.kiro/            this project's own spec, skill, agent, hooks
```

Root package is `spectruth-workspace`. It was renamed because it previously
clashed with the published CLI package name and made `pnpm --filter spectruth`
ambiguous — do not rename it back.

All logic lives in core. The CLI, the hooks, and any future MCP server are thin
callers. Keep it that way.

## Commands that work

```bash
pnpm build            # core then cli
pnpm test             # 338 tests in core
pnpm demo             # the full audit → repair → re-audit loop
pnpm audit:example    # audits examples/records-api: task 1 READY, task 2 BLOCKED

cd packages/web && pnpm dev      # landing page
cd packages/web && pnpm build
```

Per-package builds are `npx tsc` inside `packages/core` and `packages/cli`.
Root `pnpm -r build` has previously failed on an `ERR_PNPM_IGNORED_BUILDS` gate
for esbuild; the scripts above avoid it. Do not "fix" that by approving builds
without asking.

## Publishing — read before releasing

Published as two unscoped packages: `spectruth` (CLI) and `spectruth-core`.
Both are at **0.1.1** in git and **0.1.1 is live on npm**, so the tree and the
registry currently agree. Bump before publishing again.

```bash
pnpm build
cd packages/core && pnpm publish --access public
cd ../cli && pnpm publish --access public
```

Two things that will bite:

- **Use `pnpm publish`, never `npm publish`.** The CLI depends on core via
  `workspace:*`, which pnpm rewrites to a real version at publish time. npm
  would publish the literal protocol and break every install.
- **Core must go first**, because the CLI depends on it.

The provider SDKs (`@anthropic-ai/sdk`, `openai`) are **optional peers** on
purpose. They are loaded through dynamic `import()`, so a cold `npx` run stays
around three seconds and the deterministic path is dependency-free. Do not
promote them to dependencies.

## Invariants — breaking these breaks the product

- **Four evidence states only**: `SUPPORTED`, `PARTIAL`, `UNSUPPORTED`,
  `UNVERIFIED`. No `PASS`/`FAIL`.
- **Three ship decisions only**: `READY`, `REVIEW_REQUIRED`, `BLOCKED`.
- **No confidence values, percentages, or completion scores.** Anywhere. This is
  the main differentiator against fidelity-scoring tools; there are tests
  asserting their absence.
- **Every finding needs a non-empty justification.** `createCriterionAudit`
  rejects an empty one at runtime.
- **Missing security enforcement is `UNSUPPORTED`**, never `UNVERIFIED`. Partial
  enforcement of a security requirement is also `UNSUPPORTED` — half an
  ownership check protects nothing.
- **Documentation is never evidence.** `isImplementationFile()` excludes `.md`,
  `.kiro`, `.spectruth` and `docs`. This exists because an early version cited a
  README as proof that code returned 403.
- **Refuse to guess.** Task inference requires exactly one incomplete → complete
  transition. Ambiguity returns a typed failure.
- **`BLOCKED` exits 0 in hook mode** so the summary reaches agent context.
  Non-zero is reserved for operational failures. Note that `audit` also always
  exits 0, including on `BLOCKED` — so `spectruth audit && deploy` will deploy.
  If a CI gate is wanted, that needs a deliberate decision about whether the
  Kiro agent path can tolerate a non-zero exit.
- **Never edit `tasks.md`.** No repair path may touch it; the shipped agent
  config denies it. Marking a task complete is the user's claim to make.
- **Repair previews mutate nothing**, and approval is bound to one preview, one
  report, and a fingerprint of the covered files.
- **Report identity is content-derived and excludes the timestamp**, so a no-op
  re-audit preserves an approval the user already granted.

## Kiro integration — what actually happens

The paired hooks use Kiro's `PreTaskExec` and `PostTaskExec` triggers in the
`.kiro/hooks/*.json` v1 schema. Both are documented as **IDE-only** — they do not
exist in the CLI, so nothing about them can be tested with `kiro-cli`.

**They do not fire.** IDE spec task execution delegates to an internal
spec-task-execution subagent, and Kiro documents that hooks do not trigger in
subagents ([kirodotdev/Kiro#7755](https://github.com/kirodotdev/Kiro/issues/7755)).
Verified by running task 10 of `demo-project` to completion in the IDE: the
transcript showed "Delegating the implementation of task 10 to the
spec-task-execution subagent", the task moved to `[x]`, three source files were
written, and no `.spectruth/` directory was created at all — no snapshot, no
report, and no hook error.

That test is only meaningful because the schema was correct when it ran. An
earlier version of these files paired IDE 0.x content — a `when`/`then` structure
naming `preTaskExecution` / `postTaskExecution` — with the 1.0 file location.
0.x read hooks from `.kiro.hook` files, so no Kiro version could load them, and
the same conclusion had been drawn from a config Kiro never parsed. Do not
"simplify" the hook files back toward that shape; there is a test asserting the
v1 schema and rejecting every legacy token.

Consequence: SpecTruth is **agent-initiated**, not automatic. The user asks, the
agent runs `npx spectruth audit --json` and explains the result. That is the
intended UX, not a workaround. Do not write copy claiming automatic auditing.

Worth knowing for a future attempt: Kiro treats exit code `2` from a command hook
as a *block* on `PreTaskExec`, `PreToolUse` and `UserPromptSubmit`. If task hooks
ever fire, SpecTruth could refuse to let a task start. Exit `0` puts stdout into
the agent's context and any other non-zero is reported as a hook error, which is
exactly why a `BLOCKED` decision exits `0`.

What *does* work, verified in the IDE: the Agent Skill loads via `skill://`, the
custom agent runs the CLI, and it reads and explains reports correctly.

The CLI is a separate process from Kiro, so it has no access to Kiro's model.
Audits inside Kiro are deterministic-only unless the user sets an API key. Treat
that as the architecture: the engine decides, the agent narrates.

## Self-audit expectations

Running SpecTruth on this repository returns `UNVERIFIED` for nearly every
criterion, so `REVIEW_REQUIRED`. **That is correct.** These criteria
describe internal behaviour that static analysis cannot prove, and the evidence
that would prove it is test output, which is not ingested. Do not "fix" this by
loosening the checks.

Never demo with the self-audit. Use `pnpm demo` or `examples/records-api`, where
the deterministic checks apply and you get the `READY` / `BLOCKED` contrast.

## Landing page

`packages/web` — Vite + React + Tailwind v4, no animation library (CSS plus an
IntersectionObserver hook). Eleven sections. Two colour systems kept separate on
purpose: **purple is product chrome** (Kiro's colour), while green/amber/red/blue
are reserved for the four evidence states and mean the same thing as in the
terminal. Light and dark themes are both full palettes; the theme is applied by
an inline script before first paint.

**Placeholders waiting for assets:**

- Walkthrough video, under the terminal in the `Proof` section. Drop `demo.mp4`
  in `packages/web/public/` and replace the dashed box with a `<video>`.
- Four Kiro screenshots in `BuiltWithKiro` — skill activating, an audit in the
  IDE, the approval turn, the spec files. Replace `<ScreenshotSlot>` with `<img>`.

Deploy target is Vercel with root directory `packages/web`, build `pnpm build`,
output `dist`. Not yet deployed.

## Still pending

0. **`checkApproval` / `assertApproved` are never called from the CLI.** They
   implement the three documented refusals — widened scope, superseded report,
   drifted code — and are unit-tested, but no CLI command invokes them. The
   agent writes the repair itself, so nothing mechanically validates consent at
   the moment of writing. `approveRepair` now refuses a superseded report, which
   closes the most misleading case, but the README's "all three refusals are
   typed and explained" describes the library, not the shipped CLI path. Wiring
   a real gate means either a `repair --apply` command or a pre-write check in
   the agent contract; both are design decisions, not cleanups.
1. **Static checks only see the retrieved window, so a match past it reads as
   absent.** `extractSnippets` caps a snippet at 50 lines and keeps only the
   single best range per file, so a criterion's evidence can sit in the file and
   still be reported missing. Found when Kiro inserted a new endpoint above an
   existing route in `demo-project`: the `204` moved from line 46 to line 75, the
   retrieved window was lines 1–50, and `REQ-6-AC-1` flipped to `UNSUPPORTED`
   with the code unchanged and correct. This is a false negative rather than a
   false green, so it cries wolf rather than waving work through — but it is
   still wrong, and it is load-bearing for any file over ~50 lines. The fix is
   either multiple windows per file or scanning the whole file for the specific
   pattern once retrieval has selected the file.
2. **Deploy the landing page.** The hackathon organizer said judges expect to run
   submissions, "preferably live."
2. **Record the walkthrough video** and fill the placeholder.
3. **Capture the four Kiro screenshots.**
4. **Timed cold-start run** — fresh clone, follow only the README, time it.

## Conventions

- TypeScript strict, ESM, explicit `.js` extensions in relative imports.
- Vitest. Tests live in `__tests__` beside the code.
- Comments explain *why*, not *what*. Several comments record decisions that look
  arbitrary without the history — leave them.
- Small focused commits with a body explaining the reasoning. Do not amend or
  rebase; the history is deliberately append-only.
- **Do not push or publish without being asked.**

## History worth knowing

- The project began as a generic spec-conformance verifier with `PASS`/`FAIL` and
  confidence scores. It was reframed to Done Integrity because that space is
  crowded — Kiro's own property-based testing, verification skills, and fidelity
  scorers all live there.
- Its own `.kiro/specs/spectruth/requirements.md` was stale for a while,
  describing the old product, which made the task→requirement links point at
  criteria for something no longer being built. Rewritten. If you change what the
  product does, update that spec too.
- Kiro's IDE task runner was used on tasks 3, 4 and 5 during the hook
  investigation. Those runs implemented the *old* spec and their changes were
  discarded. The current source does not include them.

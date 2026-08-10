---
name: spectruth
description: Explains SpecTruth Done Integrity audits for Kiro spec tasks. Use when a task was marked complete and you need the ship decision, the evidence behind it, why a task is blocked, or a repair preview that requires explicit approval before anything changes.
---

# SpecTruth — Done Integrity

SpecTruth answers one question: **when Kiro marks a spec task complete, does the
available evidence support that completion claim?**

It never edits `tasks.md`, never repairs code on its own, and never treats a
missing test suite as a failure.

## Evidence states

| State | Meaning |
|---|---|
| `SUPPORTED` | Evidence demonstrates the complete criterion |
| `PARTIAL` | Evidence demonstrates only part of the criterion |
| `UNSUPPORTED` | Implementation is absent, contradicted, or demonstrably incomplete |
| `UNVERIFIED` | Implementation may exist, but evidence cannot establish the behavior |

## Ship decisions

| Decision | Rule |
|---|---|
| `BLOCKED` | Any `UNSUPPORTED` or any `PARTIAL` finding |
| `REVIEW_REQUIRED` | No blocking findings, but at least one `UNVERIFIED` |
| `READY` | Every linked criterion is `SUPPORTED` |

A missing authorization, ownership, permission, credential, or encryption check
is `UNSUPPORTED` and therefore `BLOCKED`. It is never softened to `UNVERIFIED`.

## Commands

The CLI is not published yet, so it runs from the built entry point. Build once
with `cd packages/core; npx tsc` then `cd ../cli; npx tsc`.

Read-only:

```bash
node packages/cli/dist/index.js report          # concise summary of the latest audit
node packages/cli/dist/index.js report --json   # full report with evidence and gaps
```

Audit lifecycle, normally run by the paired task hooks:

```bash
node packages/cli/dist/index.js pre-task        # snapshot task states, Git state, fingerprints
node packages/cli/dist/index.js post-task       # infer the completed task and audit it
```

Once the package is installed or published these become `npx spectruth report`,
`npx spectruth pre-task`, and `npx spectruth post-task`.

## How to respond to a user

1. Run `node packages/cli/dist/index.js report --json` to read the latest audit.
2. Lead with the ship decision and the task it applies to.
3. For each non-`SUPPORTED` criterion, give the state, the justification, and
   the concrete gap. Cite file and line when the evidence has a location.
4. Never restate a finding as more certain than its state. `UNVERIFIED` means
   unproven, not failing.
5. If no report exists, say so and suggest completing a spec task or running
   the post-task audit.

## Repair previews require explicit approval

When the user asks how to fix a blocked finding:

1. Describe the proposed repair as a **preview**: the affected criterion, the
   evidence gap, the proposed change, and the evidence expected afterwards.
2. State plainly that nothing has been changed.
3. Ask for explicit approval in a separate turn.
4. Only after the user approves in that separate turn may you implement the
   approved scope, and nothing beyond it.
5. Never modify `tasks.md`, and never mark a task complete.
6. After an approved repair, re-run `node packages/cli/dist/index.js post-task`
   so the claim is re-audited rather than assumed fixed.

If the user has not approved, the correct action is to stop and wait.

## Exit-code contract

`BLOCKED` is a domain result, not a tooling error: the hooks exit `0` for every
ship decision so the summary reaches Kiro's context. A non-zero exit means an
operational problem such as a missing snapshot, an unreadable spec, or task
inference that could not identify exactly one completed task.

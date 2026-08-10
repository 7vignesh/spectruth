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

The primary command needs no snapshot and is what you should normally run:

```bash
node packages/cli/dist/index.js audit --json                 # every completed task
node packages/cli/dist/index.js audit --task 3.2 --json      # one task
node packages/cli/dist/index.js audit --deterministic --json # no LLM adjudication
```

Repair protocol:

```bash
node packages/cli/dist/index.js preview --report <reportId> --json
node packages/cli/dist/index.js approve --report <reportId> --preview <previewId>
```

Reading a previous result, and the paired hooks:

```bash
node packages/cli/dist/index.js report --json     # most recent report
node packages/cli/dist/index.js pre-task          # snapshot before work starts
node packages/cli/dist/index.js post-task         # audit an observed transition
```

Once the package is installed or published these become `npx spectruth audit`
and so on.

## How to respond to a user

When the user asks whether work is done, whether a task is complete, or whether
something is ready to ship:

1. Run `audit --json` (add `--task <id>` when they named a task).
2. Lead with the ship decision and the task it applies to.
3. For each non-`SUPPORTED` criterion, give the state, the justification, and
   the concrete gap. Cite file and line when the evidence has a location.
4. Never restate a finding as more certain than its state. `UNVERIFIED` means
   unproven, not failing.
5. If the audit reports skipped tasks with no requirement reference, say so
   plainly rather than implying they passed.

Do not run `pre-task` or `post-task` to answer a question. Those exist for the
observed-transition flow, and `post-task` fails without a prior snapshot.

## Repair previews require explicit approval

The audit already generates previews for every blocking finding and prints their
ids. It changes nothing while doing so.

When the user asks you to fix a finding:

1. Show the preview: its id, the affected criterion, the evidence gap, the
   proposed change, and the evidence expected afterwards.
2. State plainly that nothing has been changed.
3. Ask for explicit approval in a separate turn. Stop there and wait.
4. Once the user approves, run `approve --report <reportId> --preview <previewId>`
   to record consent, then implement **only** the authorized scope.
5. Never modify `tasks.md`, and never mark a task complete. The completion claim
   belongs to the user; your job is the code change they approved.
6. Re-run `audit --task <id>` afterwards so the repair is verified independently
   rather than assumed. Report whether the gap actually closed — if the criterion
   is still not `SUPPORTED`, say so instead of claiming success.

An approval is bound to one preview, one report, and the state of the files at
the moment it was granted. If the report or those files have changed, the
approval is refused and you must ask again.

If the user has not approved, the correct action is to stop and wait.

## Exit-code contract

`BLOCKED` is a domain result, not a tooling error: the hooks exit `0` for every
ship decision so the summary reaches Kiro's context. A non-zero exit means an
operational problem such as a missing snapshot, an unreadable spec, or task
inference that could not identify exactly one completed task.

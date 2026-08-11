# SpecTruth

**Kiro says the task is done. SpecTruth decides whether the evidence agrees.**

When an agent marks a spec task complete, that is a *claim*. SpecTruth audits the
claim against the acceptance criteria it was supposed to satisfy, and blocks the
ship when the evidence does not support it.

```bash
npx spectruth@latest demo     # see it work — no spec, no API key, no network
npx spectruth@latest          # audit this project
npx spectruth@latest init     # install the Kiro integration
```

## What it catches

A task marked "Enforce record ownership on delete" whose implementation never
compares `ownerId` to the caller:

```text
SpecTruth — Done Integrity

Task 2  Enforce record ownership on delete   ← marked complete

  REQ-1-AC-2   UNSUPPORTED
    required  WHEN a user requests to delete a record they do not own THEN the
              system SHALL refuse and return 403
    found     src/records.js:16 Found DELETE route definition
    missing   Status code 403 not found in relevant code

SHIP DECISION  BLOCKED
1 criterion checked: 1 unsupported
Verdict computed from static evidence only. No model was used.
```

The route is *good code*. A reviewer would approve it. The problem is what isn't
there — and only the spec knows that.

## How it differs

| | Input | Question |
|---|---|---|
| Code review | a diff | Is this code good? |
| Property-based tests | running code | Does it behave correctly? |
| **SpecTruth** | **a completion claim** | **Is this claim true?** |

Only the last one can catch a task that was checked off with nothing written.

## Evidence states

`SUPPORTED` · `PARTIAL` · `UNSUPPORTED` · `UNVERIFIED`

No confidence percentages. No completion scores. Every finding carries a
justification, and `UNVERIFIED` explicitly means *unproven*, not *failing*.

A missing authorization, ownership, permission, or credential check is
`UNSUPPORTED` and blocking — partial enforcement of a security requirement is
not enforcement.

## Repairs need your approval

SpecTruth proposes; it never repairs. An approval is bound to one preview, one
report, and the files as they were when you granted it. It never authorizes
editing `tasks.md`, because marking a task complete is your claim to make.

Full documentation: https://github.com/7vignesh/spectruth

MIT

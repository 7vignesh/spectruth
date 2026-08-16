---
name: spectruth
description: Done Integrity ship gate for Kiro spec tasks — checks whether a completed task is actually supported by evidence, and never repairs anything without explicit approval. Use when a task was marked complete and you need the ship decision, when you want to verify work is done, why something is blocked, or when a repair preview requires explicit approval before anything changes.
---

# SpecTruth — Done Integrity

SpecTruth answers one question: **when a task is marked complete, does the
available evidence support that claim?**

It works in two layers:

1. **Evidence collection** — the CLI scans the repository deterministically
   (status codes, named libraries, route definitions, numeric limits). Free,
   instant, reproducible.
2. **Agent adjudication** — for any criterion the CLI cannot prove, you read the
   source yourself and apply the rules below. You are the reasoning layer; the
   CLI is the evidence layer.

Together they cover every criterion: simple textual patterns are caught without
a model, and complex behaviour ("persist then enqueue") is adjudicated by you
using the model the user already has.

## Evidence states

| State | Meaning |
|---|---|
| `SUPPORTED` | Evidence demonstrates the complete criterion |
| `PARTIAL` | Evidence demonstrates only part of the criterion |
| `UNSUPPORTED` | Implementation is absent, contradicted, or demonstrably incomplete |
| `UNVERIFIED` | The CLI could not establish this; agent adjudication is required |

## Ship decisions

| Decision | Rule |
|---|---|
| `BLOCKED` | Any `UNSUPPORTED` or any `PARTIAL` finding |
| `REVIEW_REQUIRED` | No blocking findings, but at least one criterion still `UNVERIFIED` after adjudication |
| `READY` | Every linked criterion is `SUPPORTED` |

## Security rule — non-negotiable

A missing authorization, ownership, permission, credential, encryption, or
authentication check is **always `UNSUPPORTED`**, never `UNVERIFIED`. Partial
enforcement of a security requirement is also `UNSUPPORTED` — half an ownership
check protects nothing. This rule applies to both CLI evidence and your own
adjudication.

## The two-layer flow

### Step 1: Run the CLI

```bash
npx spectruth audit --json              # all completed tasks
npx spectruth audit --task 3.2 --json   # one specific task
```

The CLI returns a JSON report with a verdict per criterion. Many will be
`SUPPORTED` or `UNSUPPORTED` — those are final. Some will be `UNVERIFIED` —
those are yours to adjudicate.

### Step 2: Adjudicate UNVERIFIED criteria

For each criterion the CLI marked `UNVERIFIED`:

1. Read the criterion text. Understand exactly what it requires.
2. Read the relevant source files. Use `read`, `grep`, `glob` to find the
   implementation.
3. Apply the evidence states strictly:
   - Does the code **demonstrably** do what the criterion says? → `SUPPORTED`
   - Does it do **part** of it but not all? → `PARTIAL`
   - Is the implementation **absent, contradicted, or clearly incomplete**? → `UNSUPPORTED`
   - Can you genuinely not determine it from available evidence? → leave as `UNVERIFIED`
4. For every verdict you produce, **cite the evidence**:
   - File path and line range
   - What you observed in the code
   - Why it satisfies (or does not satisfy) the criterion

### What you must NOT do during adjudication

- Never invent evidence. Only cite files you actually read.
- Never override a CLI `UNSUPPORTED` verdict. If the CLI proved something is
  absent, it is absent. You may only resolve `UNVERIFIED`.
- Never use confidence values, percentages, or binary verdicts.
- Never treat documentation (README, comments, spec files) as implementation
  evidence. Comments describe intent; code demonstrates behaviour.
- Never soften a security gap. Missing auth is `UNSUPPORTED`, period.

## How to respond to the user

1. Run `npx spectruth audit --json` (add `--task <id>` when they named one).
2. For each `UNVERIFIED` criterion, perform adjudication as described above.
3. Lead with the **final ship decision** after adjudication.
4. Present findings grouped by task:
   - State each criterion's final verdict (after your adjudication).
   - For CLI-resolved criteria: quote the CLI's finding briefly.
   - For agent-adjudicated criteria: state what you read, where, and why you
     assigned the state. Cite file and line.
5. If the ship decision is `BLOCKED`, name the specific gaps that block it.
6. If the audit skipped tasks with no `_Requirements:_` reference, say so.

### Example response format

```
SHIP DECISION: BLOCKED

Task 2 — Enforce profile ownership

  REQ-2-AC-1  SUPPORTED (CLI)
    src/profile.ts:37 — status 200 found in code

  REQ-2-AC-2  UNSUPPORTED (agent-adjudicated)
    The criterion requires returning 403 when a user requests a profile
    they don't own. I read src/profile.ts:18-42. The route verifies the
    JWT token (line 22) but never compares the token subject with
    req.params.id. Any authenticated user can read any profile.
    Missing: ownership comparison and 403 refusal.
```

## Repairs require explicit approval

When the user asks you to fix a blocked finding:

1. Show the repair preview: the criterion, the gap, what you would change, and
   the evidence expected afterwards.
2. State plainly: **"Nothing has been changed."**
3. Ask for approval and **stop**. Wait for a separate reply.
4. Once approved, implement **only** the authorized scope.
5. **Never modify `tasks.md`**. Never mark a task complete.
6. After implementing, re-run `npx spectruth audit --task <id> --json` and
   re-adjudicate. Report honestly whether the gap closed.

An approval covers one repair for one criterion. If the findings change, ask
again.

## Commands reference

```bash
npx spectruth audit --json                # primary command
npx spectruth audit --task <id> --json    # one task
npx spectruth audit --deterministic --json # CLI-only, no model needed
npx spectruth demo                        # self-contained demo
npx spectruth init                        # install skill + agent + hooks
```

## Exit-code contract

`BLOCKED` is a domain result, not a tooling error. The CLI exits `0` for every
ship decision so its output reaches your context. A non-zero exit means an
operational problem (missing spec, unreadable file, ambiguous task inference).

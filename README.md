# SpecTruth

**The agent says the task is done. SpecTruth decides whether the evidence agrees.**

When an agent marks a spec task complete, that is a *claim*. SpecTruth audits the
claim against the acceptance criteria it was supposed to satisfy and blocks the
ship when the evidence does not support it.

```bash
npx spectruth@latest demo     # see it work — no spec, no API key, no network
npx spectruth@latest          # audit this project
npx spectruth@latest init     # install the Kiro integration
```

Built for the Ready, Spec, Ship hackathon sponsored by Kiro.

---

## The problem is documented, not hypothetical

From Kiro's own issue tracker,
[kirodotdev/Kiro#3599](https://github.com/kirodotdev/Kiro/issues/3599):

> "Kiro is out right not completing tasks and burning credits with said
> incomplete tasks despite them being in the task.md for a spec.
> **It has lied multiple times and hallucinated an error.**"

That is the failure mode. Not bad code — *absent* code, behind a checked box.

The person exposed to it is not the one reviewing diffs carefully. It is the one
who hands a task to an agent, sees **Task completed ✓**, and moves on. That is
most people using agents today.

Nothing in the existing toolchain checks that claim:

- **Tests** verify the code that exists. If nothing was written, nothing fails.
- **Code review** reads a diff. If nothing was written, there is no diff.
- **Property-based testing** needs runnable behaviour to probe.

SpecTruth's input is the claim itself, which is why it can catch the case where
the work simply never happened.

---

## What it looks like

Auditing the bundled example (`examples/records-api`), where two tasks are
marked complete and only one of them actually is:

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

Repair preview available: RP-7101b5d9
Nothing has been changed. Approve a preview to authorize that repair.
```

The route is *good code*. A reviewer would approve it. There is no bug in what is
there — the problem is what isn't, and only the spec knows that.

Task 1 in the same file returns `READY`. It discriminates; it is not a blanket
pessimist.

---

## How this differs from adjacent tools

| | Input | Question it answers |
|---|---|---|
| Code review | a diff | Is this code good? |
| Property-based tests | running code | Does it behave correctly? |
| Fidelity scoring | spec + repo | How closely do they match? |
| **SpecTruth** | **a completion claim** | **Is this claim true?** |

Kiro ships its own [property-based testing](https://kiro.dev/docs/specs/correctness/),
and it is genuinely good at what it does: probing behaviour across many inputs.
Its documented limits are where SpecTruth applies — it is IDE-only, *"not every
requirement maps cleanly to a property,"* and it needs code that runs. A task
checked off with nothing written has no property to test.

There are also verification *skills* — prompts instructing an agent to demand
fresh evidence before claiming success. They are directionally right. The
difference is mechanical: a skill asks a model to be careful, and a model can be
talked out of being careful. SpecTruth computes the verdict from snapshots, diffs
and static checks. Run it twice offline and the output is byte-identical. An
agent cannot argue its way past it.

On fidelity scores specifically, see the first design decision below.

---

## Design decisions

These were deliberate, and most of them cost something.

### 1. No scores, no confidence values

The obvious output for a tool like this is a number: *"Spec fidelity: 61%"* or
*"confidence: 0.92"*. We removed both.

A percentage describes a feeling and hides the decision. Is 61% shippable? Nobody
can say. So the output is a decision instead:

```text
READY  ·  REVIEW_REQUIRED  ·  BLOCKED
```

`READY` when every linked criterion is supported. `BLOCKED` on any `UNSUPPORTED`
or `PARTIAL` finding. `REVIEW_REQUIRED` when nothing blocks but something is
unproven. Three outcomes, each with an obvious next action.

### 2. Four evidence states, and `UNVERIFIED` is not failure

| State | Meaning |
|---|---|
| `SUPPORTED` | Evidence demonstrates the complete criterion |
| `PARTIAL` | Evidence demonstrates only part of it |
| `UNSUPPORTED` | Implementation is absent, contradicted, or demonstrably incomplete |
| `UNVERIFIED` | Implementation may exist, but evidence cannot establish the behaviour |

`UNVERIFIED` is the state most tools lack, and it is the honest one. Saying *"I
cannot prove this"* is different from *"this is broken,"* and collapsing them
either cries wolf or hides risk.

### 3. Every finding must justify itself

A state with no reason is not auditable. The domain constructor rejects an empty
justification at runtime — there is no path to a finding without one.

### 4. Deterministic first; the model is optional

Static evidence produces the verdict. If `ANTHROPIC_API_KEY` or `OPENAI_API_KEY`
is present, a provider adjudicates *within a bounded evidence bundle* and may
refine the result — but the default path uses no model at all, and the output
says so:

```text
Verdict computed from static evidence only. No model was used.
```

This is the core architectural bet. The engine decides; the agent explains. If
the model produced the verdict, this would be a careful prompt rather than a
gate.

### 5. Missing security enforcement is `UNSUPPORTED`, never `UNVERIFIED`

A missing authorization, ownership, permission, credential, or encryption check
is a blocking absence — not an unknown. And partial enforcement of a security
requirement is **not** enforcement: a criterion with the route present but the
403 missing is `UNSUPPORTED`, not `PARTIAL`. Half an ownership check protects
nothing.

### 6. Documentation is not evidence

An early version cited `README.md:10` as proof that the code returned 403 —
because the README *documented* returning 403. Prose describing intent is
exactly the false support this tool exists to catch, so markdown, `.kiro`,
`.spectruth` and `docs` paths are excluded from evidence retrieval.

### 7. Refuse to guess which task completed

Kiro's IDE task events are not documented to carry a task identifier, so task
identity comes from comparing a pre-task snapshot with current state. Success
requires **exactly one** task moving from incomplete to complete. Two
simultaneous completions, a removed task, or a spec mismatch produce a typed
refusal rather than a guess, because auditing the wrong task would attach real
evidence to the wrong claim.

### 8. Say how the task was identified

A transition observed across a snapshot pair is stronger evidence than a checkbox
that is simply ticked right now. Reports record which one happened, and an
on-demand audit says so plainly:

```text
Task 2 is currently marked complete with 1 changed file(s); no transition was observed
```

### 9. Report identity is content-based

An approval binds to a report. If the report id included a timestamp, re-running
the audit and finding *the same thing* would invalidate consent you had already
given. So the id derives from the findings: identical findings keep the identity,
and any change in them supersedes the approval.

### 10. Repairs are previewed, never performed

SpecTruth proposes; it does not repair. Generating a preview leaves the working
tree byte-identical — there is a test that asserts exactly that.

An approval covers **one** preview, bound to **one** report, plus a fingerprint of
the files it would touch. It cannot be widened to other findings, replayed after
the findings change, or reused once the code has drifted. All three refusals are
typed and explained.

### 11. Never edit `tasks.md`

Marking a task complete is the user's claim to make. No repair is ever authorized
to touch it, the shipped agent config puts it in `deniedPaths`, and a test walks
the entire repair cycle asserting the file is untouched.

### 12. Re-audit instead of trusting the repair

After an approved fix, the same engine runs again and compares the specific
criterion. A repair that did not close the gap is reported as still open:

```text
REQ-1-AC-2 is still UNSUPPORTED. The approved repair did not close the gap.
```

### 13. `BLOCKED` is a domain result, not a tooling error

In hook mode every ship decision exits `0`, so the summary reaches the agent's
context. Non-zero is reserved for operational failures — an unreadable spec, a
missing snapshot, ambiguous task inference. A blocked ship is the tool working.

### 14. Missing tests never stop an audit

Test output is optional evidence. Its absence may leave a criterion `UNVERIFIED`,
but it never prevents the audit from running or from reaching a decision.

### 15. Kiro is the interface; the CLI is the engine

No dashboard, no web app for the tool itself. The user talks to the agent; the
agent runs the deterministic engine and explains the result. Keeping all logic in
`spectruth-core` means the CLI, the hooks, and any future MCP server are thin
callers over the same functions.

---

## Using it

### In Kiro

```bash
npx spectruth@latest init    # writes the skill, agent, and paired hooks
```

Then talk to the `spectruth` agent:

> **you:** is task 2 actually done?
>
> **agent:** No. `REQ-1-AC-2` is UNSUPPORTED — the spec requires a 403 when a
> user deletes a record they don't own, and `src/records.js:16` has the DELETE
> route but no ownership comparison. Ship decision is BLOCKED. There's a repair
> preview — nothing has been changed.
>
> **you:** fix it
>
> **agent:** [shows the preview] Nothing has been changed. Approve `RP-7101b5d9`?
>
> **you:** approved
>
> **agent:** [implements, re-audits] `REQ-1-AC-2` is now SUPPORTED. BLOCKED → READY.

The agent can write code for an approved repair, but writing is never
auto-approved and `tasks.md` is denied outright.

### From a terminal

```bash
npx spectruth                      # audit every completed task, every spec
npx spectruth --task 3.2           # one task
npx spectruth --deterministic      # never call a model
npx spectruth --json               # structured output for an agent
```

### The bundled example

```bash
git clone https://github.com/7vignesh/spectruth
cd spectruth
pnpm install
pnpm build

pnpm audit:example
```

Task 1 returns `READY`. Task 2 returns `BLOCKED`.

There is also `pnpm demo`, which runs the full loop in a temporary directory.

---

## How it works

```text
pre-task snapshot          task states · git state · file fingerprints
        ↓
agent works, marks task complete
        ↓
transition inference       exactly one incomplete → complete, or refuse
        ↓
evidence bundle            linked criteria · design context · git diff
                           source snippets · static checks · optional tests
        ↓
adjudication               deterministic first, bounded model optional
        ↓
ship decision              READY · REVIEW_REQUIRED · BLOCKED
        ↓
repair preview             proposal only, approval required, then re-audit
```

Reports, previews, approvals and snapshots live under `.spectruth/` in the
project being audited.

---

## Honest limitations

- **The paired hooks do not fire automatically in the current Kiro IDE.** The
  configuration uses the documented `preTaskExecution` / `postTaskExecution`
  schema, but IDE task execution delegates to an internal subagent and does not
  invoke external hooks. SpecTruth is therefore agent-initiated: you ask, it
  audits. The hooks are shipped and will work if those triggers activate.
- **Deterministic checks are pattern-based.** They detect concrete signals such
  as status codes, route definitions and auth keywords. They are strong at
  catching *absence* and weaker at catching a *wrong* implementation.
- **Without a provider, expect `UNVERIFIED` on criteria that need judgement.**
  That is the honest state, not a failure — but run `npx spectruth demo` before
  running it on an arbitrary project, so the vocabulary is familiar first.
- **Tasks must reference requirements.** A task with no `_Requirements:_` footer
  has nothing to audit against, and is reported as skipped rather than passed.

### What happens when it audits itself

Running SpecTruth on this repository returns `UNVERIFIED` for almost every
criterion, and therefore `REVIEW_REQUIRED`:

```text
Task 4  Evidence-backed domain model   ← marked complete
  REQ-3-AC-1   UNVERIFIED
    required  WHEN any criterion is UNSUPPORTED or PARTIAL THEN the ship
              decision SHALL be BLOCKED
```

That is the correct answer, and it is worth understanding why.

These criteria describe internal behaviour — how states aggregate, when a
decision blocks. Static analysis can detect a missing HTTP 403; it cannot prove
that a policy function returns the right decision. The evidence that *does* prove
it is the test suite, and SpecTruth does not yet ingest test output — that
adapter is deliberately out of scope for this version.

So the honest verdict on its own code is *unproven*, not *passing*. A tool that
scored itself highly here would be telling you something it cannot know. The
existence of `UNVERIFIED` is what makes that answer expressible at all.

For a demonstration where the deterministic checks do apply, use
`npx spectruth demo` or the bundled `examples/records-api`.

---

## Built with Kiro

This project was itself built spec-first with Kiro, and the record is in the
commit history: `.kiro/specs/spectruth/` holds the requirements, design and task
plan, and the work landed in small day-by-day commits.

Two findings from building it are documented in
[`docs/kiro-integration-spike.md`](docs/kiro-integration-spike.md): the real hook
schema, and the discovery that IDE task execution does not fire external hooks.
That is why the architecture is agent-initiated rather than automatic.

---

## Repository layout

```text
packages/core     spectruth-core — parser, snapshots, evidence, adjudication, repair
packages/cli      spectruth — the command line entry point
examples/         a deliberately flawed project to audit
docs/             integration findings
.kiro/            this project's own spec, skill, agent and hooks
```

313 tests cover the domain model, ship policy, spec parsing, transition
inference, evidence bundles, adjudication, the repair cycle, and the shipped Kiro
configuration.

```bash
pnpm test
```

## License

MIT

# Kiro Integration Spike — Findings

Automated tests cover the hook engine. The checks below could only be confirmed
by driving the Kiro IDE, because `PreTaskExec` and `PostTaskExec` are IDE-only
triggers and their payload shape is not documented.

**Outcome: the paired task hooks do not fire during IDE spec task execution.**
That is why SpecTruth is agent-initiated rather than automatic.

## Finding 1 — the hook schema, and a false conclusion drawn from a broken one

The first version of these files used a `when` / `then` structure naming
`preTaskExecution` and `postTaskExecution`, at `.kiro/hooks/*.json`.

Those trigger names were real, but they belong to **IDE 0.x**, which read hooks
from `.kiro.hook` files. The standalone `.kiro/hooks/*.json` format arrived in
IDE 1.0 and requires `trigger` / `action` with PascalCase trigger names. So the
files paired 0.x content with a 1.0 location and **no Kiro version could load
them** — Kiro reads a hook file, matches no trigger, and says nothing.

The current schema:

```json
{
  "version": "v1",
  "hooks": [
    {
      "name": "SpecTruth Pre-Task Snapshot",
      "trigger": "PreTaskExec",
      "action": { "type": "command", "command": "npx spectruth pre-task" },
      "timeout": 60,
      "enabled": true
    }
  ]
}
```

Kiro's own migration table maps `preTaskExecution` → `PreTaskExec` and
`postTaskExecution` → `PostTaskExec`.

The lesson worth keeping: the original "hooks do not fire" conclusion was drawn
while the config was invalid, so it proved nothing at the time. A test against a
file the system cannot read has no result. The conclusion below was re-established
against a schema-correct config.

## Finding 2 — they still do not fire, and the cause is the subagent

Run with the corrected schema, in `demo-project`, executing task 10 from
`.kiro/specs/userhub/tasks.md`:

| # | Check | Expected | Result |
|---|---|---|---|
| 1 | `PreTaskExec` fires before Kiro works on the task | `.spectruth/snapshots/userhub.json` created | **No.** No snapshot. |
| 2 | `PostTaskExec` fires when task status becomes complete | New file under `.spectruth/reports/` | **No.** No report. |
| 3 | Snapshot survives between the two events | Post-task does not report `SNAPSHOT_NOT_FOUND` | N/A — never created |
| 4 | Exactly one completed task is inferred | Summary names the task completed | Not via hook. Confirmed by running `post-task` by hand: it named task 10 from the snapshot pair without being told. |
| 5 | Hook stdout reaches Kiro's context | Kiro can answer "what did SpecTruth just report?" | N/A — the command never ran |
| 6 | Domain result exits `0` | No hook error banner on a non-`READY` decision | Not via hook. Confirmed by hand: `post-task` exits `0` on every ship decision. |
| 7 | Payload contents | Task identifier present? | N/A — nothing written to `.spectruth/hook-events/` |
| 8 | Working directory | `cwd` matches project root | N/A |
| 9 | Skill loads via `skill://` | Skill answers in chat | **Yes.** |
| 10 | Approval is a separate turn | Preview changes nothing; approval is a distinct message | **Yes**, via the CLI. |
| 11 | Ambiguity is loud, not silent | Two completions produce a typed refusal | Covered by unit tests, not by a hook run. |

The IDE transcript states the mechanism directly:

```text
Invoked Spec Task Execution
Delegating the implementation of task 10 (Add account deactivation) to the
spec-task-execution subagent.
```

The task moved to `[x]`, the subagent wrote three source files, and **no
`.spectruth/` directory was created at all** — no snapshot, no report, and no
hook error. The absence of an error matters: it indicates the command was never
invoked, rather than invoked and failed.

This matches Kiro's documented behaviour that hooks do not trigger in subagents,
raised in [kirodotdev/Kiro#7755](https://github.com/kirodotdev/Kiro/issues/7755).

## Finding 3 — `PreTaskExec` is blockable, if it ever fires

Kiro treats exit code `2` from a command hook as a *block* on `PreTaskExec`,
`PreToolUse` and `UserPromptSubmit`. Exit `0` adds stdout to the agent's context;
any other non-zero is reported as a hook error.

Two consequences. First, this is why a `BLOCKED` ship decision exits `0` — the
summary is the payload, and a blocked ship is the tool working rather than
failing. Second, if task hooks ever do fire, SpecTruth could refuse to let a task
*start* — for example when the previous task is still `BLOCKED`. That capability
is not used today.

## Consequence for the architecture

SpecTruth is agent-initiated. The user asks, the agent runs
`npx spectruth audit --json`, and the deterministic engine answers. The hooks
ship in the correct schema so they begin working if Kiro's behaviour changes, but
no copy should claim automatic auditing.

## Reproducing

```powershell
cd packages\core; npx tsc
cd ..\cli; npx tsc
```

Confirm the paired hooks are present and schema-valid:

- `.kiro/hooks/spectruth-pre-task.json` (`PreTaskExec`)
- `.kiro/hooks/spectruth-post-task.json` (`PostTaskExec`)

Confirm the commands work standalone from the project root, which isolates
whether a failure is Kiro's or SpecTruth's:

```powershell
node packages/cli/dist/index.js pre-task
node packages/cli/dist/index.js post-task
```

Then open the project in the Kiro IDE, reload so hooks and the skill load, run an
incomplete spec task to completion, and check whether `.spectruth/` appears.

To distinguish "hooks never loaded" from "task triggers do not fire", add a
control hook on a trigger that is known to work in the IDE — `Stop` or
`PostFileSave` — writing a marker file. If the marker appears and the task hooks
still produce nothing, the task triggers specifically are the gap.

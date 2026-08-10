# Kiro Integration Spike — Manual Checklist

Automated tests cover the hook engine. These checks can only be confirmed by
driving the Kiro IDE, because `PreTaskExec` and `PostTaskExec` are IDE-only
triggers and their payload shape is not documented.

## Setup

1. Build the workspace so `spectruth` resolves:
   ```powershell
   cd packages\core; npx tsc
   cd ..\cli; npx tsc
   ```
2. Confirm the paired hooks are present:
   - `.kiro/hooks/spectruth-pre-task.json` (`PreTaskExec`)
   - `.kiro/hooks/spectruth-post-task.json` (`PostTaskExec`)
3. Open the project in the Kiro IDE and reload so hooks and the skill load.

If `npx spectruth` does not resolve inside the IDE, temporarily change the hook
commands to `node packages/cli/dist/index.js pre-task` / `... post-task` and
record that as a finding.

## Checks

Complete one incomplete task in `.kiro/specs/spectruth/tasks.md`, then record
what actually happened.

| # | Check | Expected | Result |
|---|---|---|---|
| 1 | `PreTaskExec` fires before Kiro works on the task | `.spectruth/snapshots/spectruth.json` is created or updated | |
| 2 | `PostTaskExec` fires when task status becomes complete | New file under `.spectruth/reports/` | |
| 3 | Snapshot survives between the two events | Post-task does not report `SNAPSHOT_NOT_FOUND` | |
| 4 | Exactly one completed task is inferred | Summary names the task you completed | |
| 5 | Hook stdout reaches Kiro's context | Kiro can answer "what did SpecTruth just report?" without re-running anything | |
| 6 | Domain result exits `0` | No hook error banner even though the decision is `REVIEW_REQUIRED` | |
| 7 | Payload contents | Inspect newest file in `.spectruth/hook-events/`; note whether any task identifier is present | |
| 8 | Working directory | `cwd` in the recorded payload matches the project root | |
| 9 | Skill loads via `skill://` | `/spectruth` (or agent switch) exposes the skill; it can explain the last report | |
| 10 | Approval is a separate turn | Asking for a repair preview changes no files; approval is a distinct message | |
| 11 | Ambiguity is loud, not silent | Complete two tasks between events; expect a non-zero hook warning naming both | |

## Findings to record

- Does either IDE task event carry a usable task identifier?
- Does `PostTaskExec` fire once per task, or once per batch?
- Is hook stdout visible to the agent, the user, or both?
- Does the IDE surface non-zero hook exits as warnings rather than failures?
- Any Windows path or `npx` resolution problems?

## Why this gate matters

The evidence engine is built on top of these assumptions. If task inference,
snapshot persistence, or stdout-to-context behaves differently than expected,
adjust the architecture here rather than after the evidence bundle exists.

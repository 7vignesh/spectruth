# Example: Records API

A deliberately flawed project. Two tasks are marked complete in
`.kiro/specs/records/tasks.md`:

- **Task 1** — add the delete endpoint. Genuinely done.
- **Task 2** — enforce record ownership on delete. **Marked complete, never implemented.**

`src/records.js` deletes a record without ever comparing `ownerId` to the
caller, so requirement 1.2 ("return 403 when the user does not own the record")
is unsatisfied even though the task is checked off.

Audit it from the repository root:

```bash
node packages/cli/dist/index.js audit --root examples/records-api
```

Expected: task 1 passes, task 2 is `UNSUPPORTED` and the ship decision is
`BLOCKED`, with a repair preview offered and nothing changed.

To see the loop close, add the missing check to `deleteRecord`:

```javascript
if (record.ownerId !== req.user.id) {
  return res.status(403).json({ error: 'Forbidden' });
}
```

Then audit again — the finding becomes `SUPPORTED` and the decision `READY`.

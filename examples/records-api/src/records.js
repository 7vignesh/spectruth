/**
 * Record routes.
 *
 * Task 1 (add the delete endpoint) is genuinely implemented.
 *
 * Task 2 (enforce record ownership) was marked complete, but look closely:
 * the record is deleted without ever comparing ownerId to the caller, so a
 * user can delete a record they do not own.
 */

import { Router } from 'express';
import { db } from './db.js';

export const router = Router();

router.delete('/records/:id', async (req, res) => {
  const record = await db.records.find(req.params.id);

  if (!record) {
    return res.status(404).json({ error: 'Record not found' });
  }

  await db.records.delete(record.id);
  return res.status(204).send();
});

router.get('/records', async (req, res) => {
  const records = await db.records.findAllForUser(req.user.id);
  return res.status(200).json({ records });
});

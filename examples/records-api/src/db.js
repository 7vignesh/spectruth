/** Minimal in-memory store for the example. */

const records = new Map([
  ['r1', { id: 'r1', ownerId: 'u1', title: 'First record' }],
  ['r2', { id: 'r2', ownerId: 'u2', title: 'Someone else record' }],
]);

export const db = {
  records: {
    async find(id) {
      return records.get(id) ?? null;
    },
    async delete(id) {
      records.delete(id);
    },
    async findAllForUser(ownerId) {
      return [...records.values()].filter(record => record.ownerId === ownerId);
    },
  },
};

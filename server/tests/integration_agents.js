// Manual integration smoke (NOT part of `node --test`): exercises migration 012
// + the agent-orchestration db functions against a real MariaDB (the dev sandbox).
// Run against a throwaway DB, e.g.:
//   DB_NAME=chat_app_dev DB_USER=<user> DB_PASSWORD=<pw> node tests/integration_agents.js
const assert = require('node:assert/strict');
const { hashPassword } = require('../auth');
const db = require('../db');

(async () => {
  await db.initDb();
  const pw = await hashPassword('Smoke!Test#2026');
  const suffix = Date.now().toString(36);
  const mk = (u, extra) =>
    db.createUser({ username: `${u}_${suffix}`, passwordHash: pw, displayName: u, role: 'user', ...extra });

  const manager = await mk('mgr', { manager: true });
  const exclusiveAgent = await mk('exq', { bot: true });
  const sharedAgent = await mk('shr', { bot: true });
  const r1 = await db.createRoom({ title: `r1_${suffix}`, createdBy: manager.id });
  const r2 = await db.createRoom({ title: `r2_${suffix}`, createdBy: manager.id });

  await db.upsertAgentProfile(exclusiveAgent.id, { exclusive: true, skills: ['node', 'sql'] });
  await db.upsertAgentProfile(sharedAgent.id, { exclusive: false, skills: ['triage'] });

  // Exclusive: first claim wins, second is rejected (atomic lock).
  const a1 = await db.assignAgent({ userId: exclusiveAgent.id, roomId: r1.id, assignedBy: manager.id });
  assert.equal(a1.advisory, false, 'exclusive assign is not advisory');
  await assert.rejects(
    () => db.assignAgent({ userId: exclusiveAgent.id, roomId: r2.id, assignedBy: manager.id }),
    (e) => e.code === 'AGENT_LOCKED',
    'second concurrent exclusive claim must be AGENT_LOCKED'
  );

  // Release frees the lock; re-assign succeeds.
  await db.releaseAgent({ userId: exclusiveAgent.id });
  const a3 = await db.assignAgent({ userId: exclusiveAgent.id, roomId: r2.id, assignedBy: manager.id });
  assert.ok(a3.id, 're-assign after release succeeds');

  // Shared: never locks, always advisory, two assigns both fine.
  const s1 = await db.assignAgent({ userId: sharedAgent.id, roomId: r1.id, assignedBy: manager.id });
  const s2 = await db.assignAgent({ userId: sharedAgent.id, roomId: r2.id, assignedBy: manager.id });
  assert.equal(s1.advisory, true, 'shared assign forced advisory');
  assert.equal(s2.advisory, true, 'shared second assign also advisory, no 409');

  // Activity + availability view.
  assert.equal(await db.setActivityStatus(sharedAgent.id, 'working'), 'working');
  const available = await db.listAgents({ available: true });
  const ids = available.map((a) => a.user.id);
  assert.ok(ids.includes(sharedAgent.id), 'shared agent always available');
  assert.ok(!ids.includes(exclusiveAgent.id), 'locked exclusive agent excluded from available');

  const asg = await db.getAgentAssignment(exclusiveAgent.id);
  assert.ok(asg.active && asg.active.roomId === r2.id, 'active assignment reflects re-assign');

  // Cleanup.
  await db.deleteUser(exclusiveAgent.id);
  await db.deleteUser(sharedAgent.id);
  await db.deleteUser(manager.id);
  await db.closePool();
  console.log('INTEGRATION OK: lock 409, release/reassign, shared no-lock, activity, availability, assignment');
})().catch((e) => {
  console.error('INTEGRATION FAIL:', e);
  process.exit(1);
});

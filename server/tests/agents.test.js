const test = require('node:test');
const assert = require('node:assert/strict');
const { resolveAssignmentMode } = require('../db');

test('exclusive agent default assign takes the lock', () => {
  const mode = resolveAssignmentMode({ exclusive: true, advisory: false });
  assert.deepEqual(mode, { advisory: false, takeLock: true });
});

test('exclusive agent with advisory:true does not take the lock', () => {
  const mode = resolveAssignmentMode({ exclusive: true, advisory: true });
  assert.deepEqual(mode, { advisory: true, takeLock: false });
});

test('shared agent is always advisory and never locks (advisory omitted)', () => {
  const mode = resolveAssignmentMode({ exclusive: false });
  assert.deepEqual(mode, { advisory: true, takeLock: false });
});

test('shared agent never locks even if advisory:false requested', () => {
  const mode = resolveAssignmentMode({ exclusive: false, advisory: false });
  assert.deepEqual(mode, { advisory: true, takeLock: false });
});

test('missing exclusive defaults to exclusive (takes lock)', () => {
  const mode = resolveAssignmentMode({ advisory: false });
  assert.deepEqual(mode, { advisory: false, takeLock: true });
});

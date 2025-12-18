const test = require('node:test');
const assert = require('node:assert/strict');
const { sanitizeUser } = require('../auth');

test('sanitizeUser strips sensitive fields and normalizes booleans', () => {
  const user = {
    id: 'user-1',
    username: 'alice',
    displayName: 'Alice',
    role: 'admin',
    status: 'active',
    manager: 1,
    avatarUrl: '/avatar',
    bio: 'bio',
    birthday: '2000-01-01',
    profileTheme: 'dark',
    accentColor: '#000',
    presenceStatus: 'online',
    lastSeenAt: '2024-01-01T00:00:00.000Z',
    profilePhotoUrl: '/photo',
    lastRoomId: 'room-1',
    createdAt: '2024-01-01T00:00:00.000Z',
    password_hash: 'secret',
    manager_token: 'should-not-leak'
  };

  const safe = sanitizeUser(user);
  assert.equal(safe.id, 'user-1');
  assert.equal(safe.username, 'alice');
  assert.equal(safe.manager, true);
  assert(!('password_hash' in safe));
  assert(!('manager_token' in safe));
});

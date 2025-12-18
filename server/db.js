const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');
const { randomUUID } = require('crypto');
const config = require('./config');
const events = require('./events');

const DEFAULT_AVATARS = [
  '/assets/avatars/avatar-blue.svg',
  '/assets/avatars/avatar-green.svg',
  '/assets/avatars/avatar-purple.svg',
  '/assets/avatars/avatar-orange.svg',
  '/assets/avatars/avatar-teal.svg',
  '/assets/avatars/avatar-gray.svg'
];

const PRESENCE_STATES = ['online', 'idle', 'away', 'dnd', 'offline'];
const LOBBY_ROOM_TITLE = 'Lobby';
const MIGRATIONS_DIR = path.join(__dirname, 'migrations');

let pool;
let cachedLobbyRoomId = null;

function iso(date) {
  return date ? new Date(date).toISOString() : null;
}

function randomAvatar() {
  const idx = Math.floor(Math.random() * DEFAULT_AVATARS.length);
  return DEFAULT_AVATARS[idx];
}

function mapUser(row) {
  if (!row) return null;
  return {
    id: row.id,
    username: row.username,
    displayName: row.display_name || row.displayName,
    role: row.role,
    bot: Boolean(row.bot),
    status: row.status,
    manager: Boolean(row.manager),
    avatarUrl: row.avatar_url || row.avatarUrl || DEFAULT_AVATARS[0],
    bio: row.bio || '',
    birthday: row.birthday ? new Date(row.birthday).toISOString().slice(0, 10) : null,
    profileTheme: row.profile_theme || row.profileTheme || 'light',
    accentColor: row.accent_color || row.accentColor || '#2563eb',
    presenceStatus: row.presence_status || row.presenceStatus || 'offline',
    lastSeenAt: iso(row.last_seen_at || row.lastSeenAt),
    profilePhotoUrl: row.profile_photo_url || row.profilePhotoUrl || '',
    idleTimeoutMinutes: row.idle_timeout_minutes || row.idleTimeoutMinutes || 5,
    managerToken: row.manager_token || row.managerToken || '',
    lastRoomId: row.last_room_id || row.lastRoomId || null,
    createdAt: iso(row.created_at || row.createdAt)
  };
}

function mapConversationMember(row) {
  return {
    id: row.id,
    displayName: row.displayName,
    role: row.role,
    bot: Boolean(row.bot),
    avatarUrl: row.avatarUrl || DEFAULT_AVATARS[0],
    profilePhotoUrl: row.profilePhotoUrl || '',
    presenceStatus: row.presenceStatus || 'offline'
  };
}

function mapJoinRequest(row) {
  if (!row) return null;
  return {
    id: row.id,
    roomId: row.room_id || row.roomId,
    requesterId: row.requester_id || row.requesterId,
    note: row.note || '',
    status: row.status,
    createdAt: iso(row.created_at || row.createdAt),
    decidedAt: iso(row.decided_at || row.decidedAt),
    decidedBy: row.decided_by || row.decidedBy || null
  };
}

async function initDb() {
  pool = mysql.createPool({
    host: config.db.host,
    port: config.db.port,
    user: config.db.user,
    password: config.db.password,
    database: config.db.database,
    waitForConnections: true,
    connectionLimit: config.db.connectionLimit,
    namedPlaceholders: true,
    multipleStatements: true
  });

  await runMigrations();
  await seedAdmin();
  await ensureLobbyRoom();
}

function getPool() {
  if (!pool) {
    throw new Error('Database not initialized');
  }
  return pool;
}

async function runMigrations() {
  const conn = getPool();
  await conn.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(255) NOT NULL UNIQUE,
      applied_at DATETIME NOT NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);
  const [rows] = await conn.query('SELECT name FROM schema_migrations');
  const applied = new Set(rows.map((row) => row.name));

  if (!fs.existsSync(MIGRATIONS_DIR)) {
    return;
  }
  const files = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((file) => file.endsWith('.sql'))
    .sort();

  // eslint-disable-next-line no-restricted-syntax
  for (const file of files) {
    if (applied.has(file)) {
      continue;
    }
    const fullPath = path.join(MIGRATIONS_DIR, file);
    const sql = fs.readFileSync(fullPath, 'utf8').trim();
    if (!sql) {
      continue;
    }
    await conn.query(sql);
    await conn.execute('INSERT INTO schema_migrations (name, applied_at) VALUES (?, ?)', [
      file,
      new Date()
    ]);
    // eslint-disable-next-line no-console
    console.log(`Applied migration ${file}`);
  }
}

async function seedAdmin() {
  const conn = getPool();
  const [rows] = await conn.execute('SELECT id FROM users WHERE username = ?', [config.adminUser]);
  if (rows.length) {
    return;
  }
  const id = randomUUID();
  const now = new Date();
  const passwordHash = await bcrypt.hash(config.adminPassword, 10);
  await conn.execute(
    `INSERT INTO users (id, username, password_hash, display_name, role, status, created_at, updated_at)
     VALUES (?, ?, ?, 'System Administrator', 'admin', 'active', ?, ?)`,
    [id, config.adminUser, passwordHash, now, now]
  );
  // eslint-disable-next-line no-console
  console.log(`Seeded admin account "${config.adminUser}"`);
}

async function getAnyUserId() {
  const conn = getPool();
  const [rows] = await conn.execute('SELECT id FROM users ORDER BY created_at ASC LIMIT 1');
  return rows[0] ? rows[0].id : null;
}

async function ensureLobbyRoom() {
  if (cachedLobbyRoomId) {
    return cachedLobbyRoomId;
  }
  const conn = getPool();
  const [rows] = await conn.execute(
    `SELECT id FROM conversations WHERE type = 'room' AND LOWER(title) = LOWER(?) LIMIT 1`,
    [LOBBY_ROOM_TITLE]
  );
  if (rows.length) {
    cachedLobbyRoomId = rows[0].id;
    return cachedLobbyRoomId;
  }
  const admin = await getUserByUsername(config.adminUser);
  const creatorId = admin?.id || (await getAnyUserId());
  if (!creatorId) {
    throw new Error('Unable to bootstrap lobby room');
  }
  const now = new Date();
  const id = randomUUID();
  await conn.execute(
    `INSERT INTO conversations (id, type, title, is_public, created_by, created_at)
     VALUES (?, 'room', ?, 1, ?, ?)`,
    [id, LOBBY_ROOM_TITLE, creatorId, now]
  );
  await addMember(id, creatorId, 'owner');
  cachedLobbyRoomId = id;
  return id;
}

async function ensureUserInLobby(userId) {
  const lobbyId = await ensureLobbyRoom();
  await addMember(lobbyId, userId);
  const conn = getPool();
  await conn.execute('UPDATE users SET last_room_id = COALESCE(last_room_id, ?) WHERE id = ?', [
    lobbyId,
    userId
  ]);
  return lobbyId;
}

async function setUserLastRoom(userId, roomId) {
  const conn = getPool();
  await conn.execute('UPDATE users SET last_room_id = ? WHERE id = ?', [roomId, userId]);
}

async function getUserByUsername(username) {
  const conn = getPool();
  const [rows] = await conn.execute('SELECT * FROM users WHERE username = ?', [username]);
  return rows[0] ? { ...rows[0] } : null;
}

async function getPublicUserByUsername(username) {
  const row = await getUserByUsername(username);
  if (!row) return null;
  const { password_hash: _ignored, ...rest } = row;
  return mapUser(rest);
}

async function getUserById(id) {
  const conn = getPool();
  const [rows] = await conn.execute('SELECT * FROM users WHERE id = ?', [id]);
  const row = rows[0];
  if (!row) return null;
  const { password_hash: _ignored, ...rest } = row;
  return mapUser(rest);
}

async function getUserWithPassword(id) {
  const conn = getPool();
  const [rows] = await conn.execute('SELECT * FROM users WHERE id = ?', [id]);
  return rows[0] || null;
}

async function createUser({ username, passwordHash, displayName, role = 'user', manager = false, bot = false }) {
  const conn = getPool();
  const id = randomUUID();
  const now = new Date();
  const avatarUrl = randomAvatar();
  await conn.execute(
    `INSERT INTO users (
      id,
      username,
      password_hash,
      display_name,
      role,
      bot,
      status,
      manager,
      manager_token,
      avatar_url,
      bio,
      birthday,
      profile_theme,
      accent_color,
      presence_status,
      last_seen_at,
      profile_photo_url,
      idle_timeout_minutes,
      last_room_id,
      created_at,
      updated_at
    )
     VALUES (
      ?, ?, ?, ?, ?, ?, 'active', ?, '', ?, '', NULL, 'light', '#2563eb', 'offline', ?, '', ?, NULL, ?, ?
    )`,
    [
      id,
      username,
      passwordHash,
      displayName,
      role,
      bot ? 1 : 0,
      manager ? 1 : 0,
      avatarUrl,
      now,
      5,
      now,
      now
    ]
  );
  return getUserById(id);
}

async function updateUserProfile(id, payload = {}) {
  const conn = getPool();
  const fields = [];
  const params = [];
  if (payload.displayName) {
    fields.push('display_name = ?');
    params.push(payload.displayName);
  }
  if (payload.bio !== undefined) {
    fields.push('bio = ?');
    params.push(payload.bio || '');
  }
  if (payload.birthday !== undefined) {
    fields.push('birthday = ?');
    params.push(payload.birthday || null);
  }
  if (payload.profileTheme) {
    fields.push('profile_theme = ?');
    params.push(payload.profileTheme);
  }
  if (payload.accentColor) {
    fields.push('accent_color = ?');
    params.push(payload.accentColor);
  }
  if (payload.avatarUrl !== undefined) {
    fields.push('avatar_url = ?');
    params.push(payload.avatarUrl || randomAvatar());
  }
  if (payload.profilePhotoUrl !== undefined) {
    fields.push('profile_photo_url = ?');
    params.push(payload.profilePhotoUrl || '');
  }
  if (payload.managerToken !== undefined) {
    fields.push('manager_token = ?');
    params.push(payload.managerToken || '');
  }
  if (payload.presenceStatus) {
    const normalized = PRESENCE_STATES.includes(payload.presenceStatus)
      ? payload.presenceStatus
      : 'online';
    fields.push('presence_status = ?');
    params.push(normalized);
  }
  if (payload.idleTimeoutMinutes !== undefined) {
    const minutes = Number(payload.idleTimeoutMinutes);
    const safeMinutes = Number.isFinite(minutes) ? Math.max(1, Math.min(240, Math.round(minutes))) : 5;
    fields.push('idle_timeout_minutes = ?');
    params.push(safeMinutes);
  }
  if (!fields.length) {
    return getUserById(id);
  }
  fields.push('updated_at = ?');
  params.push(new Date(), id);
  await conn.execute(`UPDATE users SET ${fields.join(', ')} WHERE id = ?`, params);
  const user = await getUserById(id);
  events.emit('presence:updated', { user });
  return user;
}

async function updateUserPresence(id, status) {
  const conn = getPool();
  const normalized = PRESENCE_STATES.includes(status) ? status : 'offline';
  const now = new Date();
  await conn.execute(
    'UPDATE users SET presence_status = ?, last_seen_at = ?, updated_at = ? WHERE id = ?',
    [normalized, now, now, id]
  );
  const user = await getUserById(id);
  events.emit('presence:updated', { user });
  return user;
}

async function listUsers({ query = '', limit = 50 } = {}) {
  const conn = getPool();
  const pattern = `%${query.toLowerCase()}%`;
  const [rows] = await conn.execute(
    `SELECT
       id,
       username,
       display_name AS displayName,
       role,
       bot,
       status,
       manager,
       avatar_url AS avatarUrl,
       profile_photo_url AS profilePhotoUrl,
       presence_status AS presenceStatus,
       last_seen_at AS lastSeenAt,
       created_at AS createdAt
     FROM users
     WHERE LOWER(username) LIKE ? OR LOWER(display_name) LIKE ?
     ORDER BY created_at DESC
     LIMIT ?`,
    [pattern, pattern, limit]
  );
  return rows.map((row) => ({
    id: row.id,
    username: row.username,
    displayName: row.displayName,
    role: row.role,
    bot: Boolean(row.bot),
    status: row.status,
    manager: Boolean(row.manager),
    avatarUrl: row.avatarUrl || DEFAULT_AVATARS[0],
    profilePhotoUrl: row.profilePhotoUrl || '',
    presenceStatus: row.presenceStatus || 'offline',
    lastSeenAt: iso(row.lastSeenAt),
    createdAt: iso(row.createdAt)
  }));
}

async function updateUserAccess(id, { role, status, manager, bot }) {
  const conn = getPool();
  const updates = [];
  const params = [];
  if (role) {
    updates.push('role = ?');
    params.push(role);
  }
  if (status) {
    updates.push('status = ?');
    params.push(status);
  }
  if (typeof manager !== 'undefined') {
    updates.push('manager = ?');
    params.push(manager ? 1 : 0);
  }
  if (typeof bot !== 'undefined') {
    updates.push('bot = ?');
    params.push(bot ? 1 : 0);
  }
  if (!updates.length) {
    return getUserById(id);
  }
  params.push(new Date(), id);
  await conn.execute(`UPDATE users SET ${updates.join(', ')}, updated_at = ? WHERE id = ?`, params);
  return getUserById(id);
}

async function resetUserPassword(id, passwordHash) {
  const conn = getPool();
  await conn.execute('UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?', [
    passwordHash,
    new Date(),
    id
  ]);
  return getUserById(id);
}

async function deleteUser(id) {
  const conn = getPool();
  const [result] = await conn.execute('DELETE FROM users WHERE id = ?', [id]);
  return result.affectedRows > 0;
}

async function getConversationById(id) {
  const conn = getPool();
  const [rows] = await conn.execute(
    `SELECT
       id,
       type,
       title,
       is_public AS isPublic,
       created_by AS createdBy,
       created_at AS createdAt
     FROM conversations
     WHERE id = ?`,
    [id]
  );
  const conversation = rows[0];
  if (!conversation) return null;
  const members = await getConversationMembers(id);
  return { ...conversation, isPublic: Boolean(conversation.isPublic), members };
}

async function createConversation({ type, title, createdBy, isPublic = true }) {
  const conn = getPool();
  const id = randomUUID();
  const now = new Date();
  await conn.execute(
    'INSERT INTO conversations (id, type, title, is_public, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?)',
    [id, type, title || null, isPublic ? 1 : 0, createdBy, now]
  );
  return getConversationById(id);
}

async function listRoomsForUser(userId) {
  const conn = getPool();
  const [rows] = await conn.execute(
    `SELECT
       c.id,
       c.title,
       c.is_public AS isPublic,
       c.created_by AS createdBy,
       c.created_at AS createdAt,
       (SELECT COUNT(*) FROM conversation_members cm WHERE cm.conversation_id = c.id) AS memberCount,
       EXISTS(
         SELECT 1 FROM conversation_members cm WHERE cm.conversation_id = c.id AND cm.user_id = ?
       ) AS isMember,
       EXISTS(
         SELECT 1 FROM room_bans rb WHERE rb.room_id = c.id AND rb.user_id = ?
       ) AS isBanned,
       rjr.id AS joinRequestId,
       rjr.status AS joinRequestStatus,
       (
         SELECT COUNT(*) FROM room_join_requests r2 WHERE r2.room_id = c.id AND r2.status = 'pending'
       ) AS pendingRequestCount
     FROM conversations c
     LEFT JOIN room_join_requests rjr ON rjr.room_id = c.id AND rjr.requester_id = ?
     WHERE c.type = 'room'
     ORDER BY c.title ASC`,
    [userId, userId, userId]
  );
  const membersMap = await getMembersForConversationIds(rows.map((row) => row.id));
  return rows.map((row) => ({
    id: row.id,
    title: row.title || 'Room',
    isPublic: Boolean(row.isPublic),
    createdBy: row.createdBy,
    createdAt: iso(row.createdAt),
    memberCount: Number(row.memberCount) || 0,
    isMember: Boolean(row.isMember),
    banned: Boolean(row.isBanned),
    joinRequestId: row.joinRequestId || null,
    joinRequestStatus: row.joinRequestStatus || null,
    pendingRequestCount: Number(row.pendingRequestCount) || 0,
    members: membersMap.get(row.id) || []
  }));
}

async function createRoom({ title, createdBy, isPublic = true }) {
  const name = (title || '').trim();
  if (!name) {
    throw new Error('Room name is required');
  }
  const conn = getPool();
  const [existing] = await conn.execute(
    `SELECT id FROM conversations WHERE type = 'room' AND LOWER(title) = LOWER(?) LIMIT 1`,
    [name]
  );
  if (existing.length) {
    throw new Error('A room with that name already exists');
  }
  const conversation = await createConversation({ type: 'room', title: name, createdBy, isPublic });
  await addMember(conversation.id, createdBy, 'owner');
  return getConversationById(conversation.id);
}

async function isUserBannedFromRoom(roomId, userId) {
  const conn = getPool();
  const [rows] = await conn.execute(
    'SELECT 1 FROM room_bans WHERE room_id = ? AND user_id = ? LIMIT 1',
    [roomId, userId]
  );
  return rows.length > 0;
}

async function joinRoom(roomId, userId, { force = false } = {}) {
  const room = await getConversationById(roomId);
  if (!room || room.type !== 'room') {
    throw new Error('Room not found');
  }
  if (!force && !room.isPublic) {
    throw new Error('Room is private');
  }
  if (await isUserBannedFromRoom(roomId, userId)) {
    throw new Error('You are banned from this room');
  }
  await addMember(roomId, userId);
  await setUserLastRoom(userId, roomId);
  return getConversationById(roomId);
}

async function activateRoom(roomId, userId) {
  if (!(await isMember(roomId, userId))) {
    throw new Error('Join the room before activating it');
  }
  await setUserLastRoom(userId, roomId);
  return getConversationById(roomId);
}

async function banUserFromRoom({ roomId, targetUserId, bannedBy, reason }) {
  if (targetUserId === bannedBy) {
    throw new Error('Cannot ban yourself');
  }
  const room = await getConversationById(roomId);
  if (!room || room.type !== 'room') {
    throw new Error('Room not found');
  }
  const conn = getPool();
  await conn.execute(
    `INSERT INTO room_bans (room_id, user_id, banned_by, reason, created_at)
     VALUES (?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE banned_by = VALUES(banned_by), reason = VALUES(reason), created_at = VALUES(created_at)`,
    [roomId, targetUserId, bannedBy, reason || null, new Date()]
  );
  await conn.execute('DELETE FROM conversation_members WHERE conversation_id = ? AND user_id = ?', [
    roomId,
    targetUserId
  ]);
  const lobbyId = await ensureLobbyRoom();
  await setUserLastRoom(targetUserId, lobbyId);
  await addMember(lobbyId, targetUserId);
  return true;
}

async function updateRoomVisibility(roomId, isPublic) {
  const conn = getPool();
  const [result] = await conn.execute(
    `UPDATE conversations
     SET is_public = ?
     WHERE id = ? AND type = 'room'`,
    [isPublic ? 1 : 0, roomId]
  );
  if (!result.affectedRows) {
    throw new Error('Room not found');
  }
  return getConversationById(roomId);
}

async function getRoomJoinRequestById(id) {
  const conn = getPool();
  const [rows] = await conn.execute(
    `SELECT
       r.id,
       r.room_id AS roomId,
       r.requester_id AS requesterId,
       r.note,
       r.status,
       r.created_at AS createdAt,
       r.decided_at AS decidedAt,
       r.decided_by AS decidedBy,
       u.display_name AS displayName,
       u.username,
       u.role,
       u.presence_status AS presenceStatus
     FROM room_join_requests r
     JOIN users u ON u.id = r.requester_id
     WHERE r.id = ?`,
    [id]
  );
  const row = rows[0];
  if (!row) return null;
  return {
    ...mapJoinRequest(row),
    requester: {
      id: row.requesterId,
      displayName: row.displayName,
      username: row.username,
      role: row.role,
      presenceStatus: row.presenceStatus || 'offline'
    }
  };
}

async function listRoomJoinRequests(roomId) {
  const conn = getPool();
  const [rows] = await conn.execute(
    `SELECT
       r.id,
       r.room_id AS roomId,
       r.requester_id AS requesterId,
       r.note,
       r.status,
       r.created_at AS createdAt,
       r.decided_at AS decidedAt,
       r.decided_by AS decidedBy,
       u.display_name AS displayName,
       u.username,
       u.role,
       u.presence_status AS presenceStatus
     FROM room_join_requests r
     JOIN users u ON u.id = r.requester_id
     WHERE r.room_id = ? AND r.status = 'pending'
     ORDER BY r.created_at ASC`,
    [roomId]
  );
  return rows.map((row) => ({
    ...mapJoinRequest(row),
    requester: {
      id: row.requesterId,
      displayName: row.displayName,
      username: row.username,
      role: row.role,
      presenceStatus: row.presenceStatus || 'offline'
    }
  }));
}

async function createRoomJoinRequest({ roomId, requesterId, note }) {
  const room = await getConversationById(roomId);
  if (!room || room.type !== 'room') {
    throw new Error('Room not found');
  }
  if (room.isPublic) {
    throw new Error('Room is already public');
  }
  if (await isMember(roomId, requesterId)) {
    throw new Error('You are already a member of this room');
  }
  if (await isUserBannedFromRoom(roomId, requesterId)) {
    throw new Error('You are banned from this room');
  }
  const conn = getPool();
  const [existing] = await conn.execute(
    'SELECT id, status FROM room_join_requests WHERE room_id = ? AND requester_id = ?',
    [roomId, requesterId]
  );
  const now = new Date();
  if (existing.length) {
    const current = existing[0];
    if (current.status === 'pending') {
      return getRoomJoinRequestById(current.id);
    }
    await conn.execute(
      `UPDATE room_join_requests
       SET status = 'pending',
           note = ?,
           created_at = ?,
           decided_at = NULL,
           decided_by = NULL
       WHERE id = ?`,
      [note || null, now, current.id]
    );
    return getRoomJoinRequestById(current.id);
  }
  const id = randomUUID();
  await conn.execute(
    `INSERT INTO room_join_requests (id, room_id, requester_id, note, status, created_at)
     VALUES (?, ?, ?, ?, 'pending', ?)`,
    [id, roomId, requesterId, note || null, now]
  );
  return getRoomJoinRequestById(id);
}

async function respondRoomJoinRequest({ requestId, moderatorId, decision, roomId }) {
  const conn = getPool();
  const [rows] = await conn.execute(
    'SELECT * FROM room_join_requests WHERE id = ?',
    [requestId]
  );
  if (!rows.length) {
    throw new Error('Request not found');
  }
  const request = rows[0];
  if (request.status !== 'pending') {
    throw new Error('Request already processed');
  }
  if (roomId && request.room_id !== roomId) {
    throw new Error('Request does not belong to this room');
  }
  const status = decision === 'approved' ? 'approved' : 'denied';
  const now = new Date();
  await conn.execute(
    `UPDATE room_join_requests
     SET status = ?, decided_at = ?, decided_by = ?
     WHERE id = ?`,
    [status, now, moderatorId, requestId]
  );
  let room = null;
  if (status === 'approved') {
    room = await joinRoom(request.room_id, request.requester_id, { force: true });
  }
  const updated = await getRoomJoinRequestById(requestId);
  return { request: updated, room };
}

async function addMember(conversationId, userId, role = 'participant') {
  const conn = getPool();
  await conn.execute(
    `INSERT INTO conversation_members (conversation_id, user_id, role, joined_at)
     VALUES (?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE role = VALUES(role)`,
    [conversationId, userId, role, new Date()]
  );
}

async function getConversationMembers(conversationId) {
  const membersMap = await getMembersForConversationIds([conversationId]);
  return membersMap.get(conversationId) || [];
}

async function getMembersForConversationIds(conversationIds = []) {
  if (!conversationIds.length) {
    return new Map();
  }
  const conn = getPool();
  const placeholders = conversationIds.map(() => '?').join(',');
  const [rows] = await conn.execute(
    `SELECT
       cm.conversation_id AS conversationId,
       u.id,
       u.display_name AS displayName,
       u.role,
       u.bot,
       u.avatar_url AS avatarUrl,
       u.profile_photo_url AS profilePhotoUrl,
       u.presence_status AS presenceStatus
     FROM conversation_members cm
     JOIN users u ON u.id = cm.user_id
     WHERE cm.conversation_id IN (${placeholders})
     ORDER BY u.display_name`,
    conversationIds
  );
  const map = new Map();
  rows.forEach((row) => {
    if (!map.has(row.conversationId)) {
      map.set(row.conversationId, []);
    }
    map.get(row.conversationId).push(mapConversationMember(row));
  });
  return map;
}

async function isMember(conversationId, userId) {
  const conn = getPool();
  const [rows] = await conn.execute(
    'SELECT 1 FROM conversation_members WHERE conversation_id = ? AND user_id = ? LIMIT 1',
    [conversationId, userId]
  );
  return rows.length > 0;
}

async function findDirectConversation(userA, userB) {
  const conn = getPool();
  const [rows] = await conn.execute(
    `SELECT c.id
     FROM conversations c
     JOIN conversation_members cm1 ON cm1.conversation_id = c.id AND cm1.user_id = ?
     JOIN conversation_members cm2 ON cm2.conversation_id = c.id AND cm2.user_id = ?
     WHERE c.type = 'direct'
     LIMIT 1`,
    [userA, userB]
  );
  return rows[0] ? rows[0].id : null;
}

async function createOrGetDirectConversation(userA, userB) {
  const existing =
    (await findDirectConversation(userA, userB)) || (await findDirectConversation(userB, userA));
  if (existing) {
    const conversation = await getConversationById(existing);
    return { conversation, isNew: false };
  }
  const conversation = await createConversation({ type: 'direct', title: null, createdBy: userA });
  await addMember(conversation.id, userA);
  await addMember(conversation.id, userB);
  const populated = await getConversationById(conversation.id);
  return { conversation: populated, isNew: true };
}

async function listConversationsForUser(userId) {
  const conn = getPool();
  const [rows] = await conn.execute(
    `SELECT
       c.id,
       c.type,
       c.title,
       c.is_public AS isPublic,
       c.created_by AS createdBy,
       c.created_at AS createdAt,
       (SELECT content FROM messages m WHERE m.conversation_id = c.id ORDER BY m.created_at DESC LIMIT 1) AS lastMessage,
       (SELECT m.created_at FROM messages m WHERE m.conversation_id = c.id ORDER BY m.created_at DESC LIMIT 1) AS lastMessageAt
     FROM conversations c
     JOIN conversation_members cm ON cm.conversation_id = c.id
     WHERE cm.user_id = ?
     ORDER BY COALESCE(lastMessageAt, c.created_at) DESC`,
    [userId]
  );
  const membersMap = await getMembersForConversationIds(rows.map((row) => row.id));
  return rows.map((row) => ({
    id: row.id,
    type: row.type,
    title: row.title,
    createdBy: row.createdBy,
    isPublic: Boolean(row.isPublic),
    createdAt: iso(row.createdAt),
    lastMessage: row.lastMessage,
    lastMessageAt: iso(row.lastMessageAt),
    members: membersMap.get(row.id) || []
  }));
}

async function listMessages(conversationId, { limit = 50, before } = {}) {
  const conn = getPool();
  let sql = `
    SELECT
      m.id,
      m.content,
      m.format,
      m.created_at AS createdAt,
      u.id AS userId,
      u.display_name AS displayName,
      u.role,
      u.bot,
      u.avatar_url AS avatarUrl,
      u.profile_photo_url AS profilePhotoUrl
    FROM messages m
    JOIN users u ON u.id = m.user_id
    WHERE m.conversation_id = ?
  `;
  const params = [conversationId];
  if (before) {
    sql += ' AND m.created_at < ?';
    params.push(before);
  }
  sql += ' ORDER BY m.created_at DESC LIMIT ?';
  params.push(limit);
  const [rows] = await conn.execute(sql, params);
  return rows.reverse().map((row) => ({
    id: row.id,
    content: row.content,
    createdAt: iso(row.createdAt),
    format: row.format || 'text',
    userId: row.userId,
    displayName: row.displayName,
    role: row.role,
    bot: Boolean(row.bot),
    avatarUrl: row.avatarUrl || DEFAULT_AVATARS[0],
    profilePhotoUrl: row.profilePhotoUrl || ''
  }));
}

async function createMessage({ conversationId, userId, content, format = 'text' }) {
  if (!(await isMember(conversationId, userId))) {
    throw new Error('User is not a member of this conversation');
  }
  const conn = getPool();
  const id = randomUUID();
  const now = new Date();
  await conn.execute(
    'INSERT INTO messages (id, conversation_id, user_id, content, format, created_at) VALUES (?, ?, ?, ?, ?, ?)',
    [id, conversationId, userId, content, format, now]
  );
  const [rows] = await conn.execute(
    `SELECT
       m.id,
       m.content,
       m.format,
       m.created_at AS createdAt,
       u.id AS userId,
       u.display_name AS displayName,
       u.role,
       u.bot,
       u.avatar_url AS avatarUrl,
       u.profile_photo_url AS profilePhotoUrl
     FROM messages m
     JOIN users u ON u.id = m.user_id
     WHERE m.id = ?`,
    [id]
  );
  const row = rows[0];
  return {
    id: row.id,
    content: row.content,
    createdAt: iso(row.createdAt),
    format: row.format || 'text',
    userId: row.userId,
    displayName: row.displayName,
    role: row.role,
    bot: Boolean(row.bot),
    avatarUrl: row.avatarUrl || DEFAULT_AVATARS[0],
    profilePhotoUrl: row.profilePhotoUrl || ''
  };
}

async function getStats() {
  const conn = getPool();
  const [[users]] = await conn.execute('SELECT COUNT(*) AS count FROM users');
  const [[conversations]] = await conn.execute('SELECT COUNT(*) AS count FROM conversations');
  const [[messages]] = await conn.execute('SELECT COUNT(*) AS count FROM messages');
  return {
    users: users.count,
    conversations: conversations.count,
    messages: messages.count
  };
}

async function createApprovalRequest({ requesterId, targetId, note, conversationId = null }) {
  if (requesterId === targetId) {
    throw new Error('You cannot request approval from yourself');
  }
  const target = await getUserById(targetId);
  if (!target) {
    throw new Error('Target user not found');
  }
  if (!target.manager) {
    throw new Error('Approval target must be a manager');
  }
  if (conversationId) {
    const member = await isMember(conversationId, requesterId);
    if (!member) {
      throw new Error('You are not a member of that conversation');
    }
  }
  const conn = getPool();
  const [existing] = await conn.execute(
    `SELECT id FROM approval_requests
     WHERE requester_id = ? AND target_id = ? AND status = 'pending'`,
    [requesterId, targetId]
  );
  if (existing.length) {
    throw new Error('A pending request already exists');
  }
  const id = randomUUID();
  const now = new Date();
  await conn.execute(
    `INSERT INTO approval_requests (id, requester_id, target_id, conversation_id, note, status, created_at)
     VALUES (?, ?, ?, ?, ?, 'pending', ?)`,
    [id, requesterId, targetId, conversationId || null, note || null, now]
  );
  return getApprovalRequestById(id);
}

async function listApprovalRequestsForUser(userId, { direction = 'incoming' } = {}) {
  const conn = getPool();
  let clause = 'target_id = ?';
  if (direction === 'outgoing') {
    clause = 'requester_id = ?';
  } else if (direction === 'all') {
    clause = '(target_id = ? OR requester_id = ?)';
  }
  const params = direction === 'all' ? [userId, userId] : [userId];
  const [rows] = await conn.execute(
    `SELECT
       ar.*,
       ru.display_name AS requesterName,
       ru.role AS requesterRole,
       tu.display_name AS targetName,
       tu.role AS targetRole
     FROM approval_requests ar
     JOIN users ru ON ru.id = ar.requester_id
     JOIN users tu ON tu.id = ar.target_id
     WHERE ${clause}
     ORDER BY ar.created_at DESC`,
    params
  );
  return rows.map((row) => ({
    id: row.id,
    requesterId: row.requester_id,
    targetId: row.target_id,
    conversationId: row.conversation_id || null,
    requesterName: row.requesterName,
    requesterRole: row.requesterRole,
    targetName: row.targetName,
    targetRole: row.targetRole,
    note: row.note,
    status: row.status,
    createdAt: iso(row.created_at),
    respondedAt: iso(row.responded_at)
  }));
}

async function getApprovalRequestById(id) {
  const conn = getPool();
  const [rows] = await conn.execute(
    `SELECT
       ar.*,
       ru.display_name AS requesterName,
       ru.role AS requesterRole,
       tu.display_name AS targetName,
       tu.role AS targetRole
     FROM approval_requests ar
     JOIN users ru ON ru.id = ar.requester_id
     JOIN users tu ON tu.id = ar.target_id
     WHERE ar.id = ?`,
    [id]
  );
  const row = rows[0];
  if (!row) return null;
  return {
    id: row.id,
    requesterId: row.requester_id,
    targetId: row.target_id,
    conversationId: row.conversation_id || null,
    requesterName: row.requesterName,
    requesterRole: row.requesterRole,
    targetName: row.targetName,
    targetRole: row.targetRole,
    note: row.note,
    status: row.status,
    createdAt: iso(row.created_at),
    respondedAt: iso(row.responded_at)
  };
}

async function respondToApprovalRequest({ id, responderId, decision }) {
  const conn = getPool();
  const [rows] = await conn.execute('SELECT * FROM approval_requests WHERE id = ?', [id]);
  const request = rows[0];
  if (!request) {
    throw new Error('Approval request not found');
  }
  if (request.target_id !== responderId) {
    throw new Error('Unauthorized to respond to this request');
  }
  if (request.status !== 'pending') {
    throw new Error('This request has already been processed');
  }
  const status = decision === 'approved' ? 'approved' : 'denied';
  await conn.execute(
    `UPDATE approval_requests
     SET status = ?, responded_at = ?
     WHERE id = ?`,
    [status, new Date(), id]
  );
  return getApprovalRequestById(id);
}

async function cancelApprovalRequest(id, requesterId) {
  const conn = getPool();
  const [rows] = await conn.execute('SELECT * FROM approval_requests WHERE id = ?', [id]);
  const request = rows[0];
  if (!request) {
    throw new Error('Approval request not found');
  }
  if (request.requester_id !== requesterId) {
    throw new Error('You can only cancel your own requests');
  }
  if (request.status !== 'pending') {
    throw new Error('Only pending requests can be cancelled');
  }
  await conn.execute(
    `UPDATE approval_requests SET status = 'denied', responded_at = ? WHERE id = ?`,
    [new Date(), id]
  );
  return getApprovalRequestById(id);
}

async function recordAuditLog({ actorId, action, targetId = null, metadata = null }) {
  const conn = getPool();
  const id = randomUUID();
  await conn.execute(
    `INSERT INTO audit_logs (id, actor_id, action, target_id, metadata, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [id, actorId, action, targetId, metadata ? JSON.stringify(metadata) : null, new Date()]
  );
  return id;
}

async function listAuditLogs({ limit = 100 } = {}) {
  const conn = getPool();
  const [rows] = await conn.execute(
    `SELECT
       al.id,
       al.actor_id AS actorId,
       al.action,
       al.target_id AS targetId,
       al.metadata,
       al.created_at AS createdAt,
       actor.display_name AS actorName,
       target.display_name AS targetName
     FROM audit_logs al
     LEFT JOIN users actor ON actor.id = al.actor_id
     LEFT JOIN users target ON target.id = al.target_id
     ORDER BY al.created_at DESC
     LIMIT ?`,
    [limit]
  );
  return rows.map((row) => ({
    id: row.id,
    actorId: row.actorId,
    actorName: row.actorName || null,
    action: row.action,
    targetId: row.targetId,
    targetName: row.targetName || null,
    metadata: row.metadata ? JSON.parse(row.metadata) : null,
    createdAt: iso(row.createdAt)
  }));
}

async function checkDbHealth() {
  const conn = getPool();
  const [[result]] = await conn.execute('SELECT 1 AS ok');
  return result.ok === 1;
}

async function closePool() {
  const conn = getPool();
  if (conn) {
    await conn.end();
  }
}

async function markMessagesRead(conversationId, userId, messageId) {
  const conn = getPool();
  const id = randomUUID();
  const now = new Date();
  await conn.execute(
    `INSERT INTO message_reads (id, conversation_id, user_id, last_read_message_id, read_at)
     VALUES (?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE last_read_message_id = VALUES(last_read_message_id), read_at = VALUES(read_at)`,
    [id, conversationId, userId, messageId, now]
  );
  return { conversationId, userId, messageId, readAt: now.toISOString() };
}

async function getReadReceipts(conversationId) {
  const conn = getPool();
  const [rows] = await conn.execute(
    `SELECT
       mr.user_id AS userId,
       mr.last_read_message_id AS lastReadMessageId,
       mr.read_at AS readAt,
       u.display_name AS displayName,
       u.bot
     FROM message_reads mr
     JOIN users u ON u.id = mr.user_id
     WHERE mr.conversation_id = ? AND u.bot = 1`,
    [conversationId]
  );
  return rows.map((row) => ({
    userId: row.userId,
    lastReadMessageId: row.lastReadMessageId,
    readAt: iso(row.readAt),
    displayName: row.displayName,
    bot: Boolean(row.bot)
  }));
}

module.exports = {
  initDb,
  createUser,
  getUserById,
  getUserWithPassword,
  getUserByUsername,
  getPublicUserByUsername,
  listUsers,
  updateUserProfile,
  updateUserPresence,
  updateUserAccess,
  resetUserPassword,
  deleteUser,
  ensureLobbyRoom,
  ensureUserInLobby,
  setUserLastRoom,
  createConversation,
  addMember,
  getConversationById,
  getConversationMembers,
  listConversationsForUser,
  listRoomsForUser,
  listMessages,
  createMessage,
  createOrGetDirectConversation,
  createRoom,
  joinRoom,
  activateRoom,
  banUserFromRoom,
  isUserBannedFromRoom,
  isMember,
  updateRoomVisibility,
  createRoomJoinRequest,
  listRoomJoinRequests,
  respondRoomJoinRequest,
  getStats,
  createApprovalRequest,
  listApprovalRequestsForUser,
  respondToApprovalRequest,
  cancelApprovalRequest,
  getApprovalRequestById,
  recordAuditLog,
  listAuditLogs,
  checkDbHealth,
  closePool,
  markMessagesRead,
  getReadReceipts
};

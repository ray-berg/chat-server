const express = require('express');
const { z } = require('zod');
const {
  listRoomsForUser,
  createRoom,
  joinRoom,
  activateRoom,
  banUserFromRoom,
  ensureLobbyRoom,
  getConversationById,
  getUserById,
  isMember,
  updateRoomVisibility,
  createRoomJoinRequest,
  listRoomJoinRequests,
  respondRoomJoinRequest
} = require('../db');
const { authenticateRequest, requireRole } = require('../auth');
const events = require('../events');
const { debugLog } = require('../logger');

const router = express.Router();
router.use(authenticateRequest);

function userIsModerator(user) {
  return user.role === 'admin' || user.role === 'moderator';
}

async function requireModeratorMembership(roomId, user) {
  const room = await getConversationById(roomId);
  if (!room) {
    const err = new Error('Room not found');
    err.statusCode = 404;
    throw err;
  }
  if (!userIsModerator(user)) {
    const err = new Error('Moderator access required');
    err.statusCode = 403;
    throw err;
  }
  const member = await isMember(roomId, user.id);
  if (!member) {
    const err = new Error('Join the room before moderating it');
    err.statusCode = 403;
    throw err;
  }
  return room;
}

router.get('/', async (req, res) => {
  await ensureLobbyRoom();
  const rooms = await listRoomsForUser(req.user.id);
  return res.json({ rooms });
});

const createSchema = z.object({
  title: z.string().min(3).max(80),
  isPublic: z.boolean().optional()
});

router.post('/', requireRole('admin', 'moderator'), async (req, res) => {
  const parse = createSchema.safeParse(req.body);
  if (!parse.success) {
    return res.status(400).json({ error: 'Invalid payload' });
  }
  try {
    const room = await createRoom({
      title: parse.data.title,
      createdBy: req.user.id,
      isPublic: typeof parse.data.isPublic === 'boolean' ? parse.data.isPublic : true
    });
    events.emit('conversation:updated', { conversation: room, isNew: true, initiatorId: req.user.id });
    return res.status(201).json({ room });
  } catch (error) {
    return res.status(400).json({ error: error.message || 'Unable to create room' });
  }
});

router.post('/:roomId/join', async (req, res) => {
  try {
    const room = await joinRoom(req.params.roomId, req.user.id, {
      force: userIsModerator(req.user)
    });
    events.emit('conversation:updated', { conversation: room, initiatorId: req.user.id });
    return res.json({ room });
  } catch (error) {
    if (error.message === 'Room is private') {
      return res.status(403).json({ error: 'Room is private. Request access from a moderator.' });
    }
    return res.status(400).json({ error: error.message || 'Unable to join room' });
  }
});

router.post('/:roomId/activate', async (req, res) => {
  try {
    const room = await activateRoom(req.params.roomId, req.user.id);
    events.emit('conversation:updated', { conversation: room, initiatorId: req.user.id });
    return res.json({ room });
  } catch (error) {
    return res.status(400).json({ error: error.message || 'Unable to activate room' });
  }
});

const updateSchema = z.object({
  isPublic: z.boolean()
});

router.patch('/:roomId', requireRole('admin', 'moderator'), async (req, res) => {
  const parse = updateSchema.safeParse(req.body);
  if (!parse.success) {
    return res.status(400).json({ error: 'Invalid payload' });
  }
  try {
    await requireModeratorMembership(req.params.roomId, req.user);
    const room = await updateRoomVisibility(req.params.roomId, parse.data.isPublic);
    events.emit('conversation:updated', { conversation: room });
    return res.json({ room });
  } catch (error) {
    const status = error.statusCode || 400;
    return res.status(status).json({ error: error.message || 'Unable to update room settings' });
  }
});

const banSchema = z.object({
  targetUserId: z.string().uuid(),
  reason: z.string().max(255).optional()
});

router.post('/:roomId/ban', requireRole('admin', 'moderator'), async (req, res) => {
  const parse = banSchema.safeParse(req.body);
  if (!parse.success) {
    return res.status(400).json({ error: 'Invalid payload' });
  }
  try {
    const target = await getUserById(parse.data.targetUserId);
    if (!target) {
      return res.status(404).json({ error: 'User not found' });
    }
    if (target.role === 'admin' && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Only administrators may ban another administrator' });
    }
    await banUserFromRoom({
      roomId: req.params.roomId,
      targetUserId: parse.data.targetUserId,
      bannedBy: req.user.id,
      reason: parse.data.reason
    });
    const room = await getConversationById(req.params.roomId);
    if (room) {
      events.emit('conversation:updated', { conversation: room });
    }
    return res.json({ ok: true });
  } catch (error) {
    return res.status(400).json({ error: error.message || 'Unable to ban user' });
  }
});

const addMemberSchema = z.object({
  targetUserId: z.string().uuid()
});

router.post('/:roomId/members', requireRole('admin', 'moderator'), async (req, res) => {
  const parse = addMemberSchema.safeParse(req.body);
  if (!parse.success) {
    return res.status(400).json({ error: 'Invalid payload' });
  }
  try {
    await requireModeratorMembership(req.params.roomId, req.user);
    debugLog('room.addMember.request', {
      actorId: req.user.id,
      targetUserId: parse.data.targetUserId,
      roomId: req.params.roomId
    });
    const room = await joinRoom(req.params.roomId, parse.data.targetUserId, { force: true });
    debugLog('room.addMember.success', {
      actorId: req.user.id,
      targetUserId: parse.data.targetUserId,
      roomId: req.params.roomId,
      memberCount: room.members?.length || 0
    });
    events.emit('conversation:updated', { conversation: room, initiatorId: req.user.id });
    return res.json({ room });
  } catch (error) {
    debugLog('room.addMember.error', {
      actorId: req.user.id,
      targetUserId: parse.data.targetUserId,
      roomId: req.params.roomId,
      error: error.message
    });
    const status = error.statusCode || 400;
    return res.status(status).json({ error: error.message || 'Unable to add member' });
  }
});

const requestSchema = z.object({
  note: z.string().max(255).optional()
});

router.post('/:roomId/request-access', async (req, res) => {
  const parse = requestSchema.safeParse(req.body || {});
  if (!parse.success) {
    return res.status(400).json({ error: 'Invalid payload' });
  }
  try {
    const room = await getConversationById(req.params.roomId);
    if (!room || room.type !== 'room') {
      return res.status(404).json({ error: 'Room not found' });
    }
    if (room.isPublic) {
      const joined = await joinRoom(req.params.roomId, req.user.id);
      events.emit('conversation:updated', { conversation: joined, initiatorId: req.user.id });
      return res.json({ room: joined, joined: true });
    }
    const request = await createRoomJoinRequest({
      roomId: req.params.roomId,
      requesterId: req.user.id,
      note: parse.data.note
    });
    return res.status(201).json({ request });
  } catch (error) {
    return res.status(400).json({ error: error.message || 'Unable to request access' });
  }
});

router.get('/:roomId/requests', requireRole('admin', 'moderator'), async (req, res) => {
  try {
    await requireModeratorMembership(req.params.roomId, req.user);
    const requests = await listRoomJoinRequests(req.params.roomId);
    return res.json({ requests });
  } catch (error) {
    const status = error.statusCode || 400;
    return res.status(status).json({ error: error.message || 'Unable to load requests' });
  }
});

const respondSchema = z.object({
  decision: z.enum(['approved', 'denied'])
});

router.post(
  '/:roomId/requests/:requestId/respond',
  requireRole('admin', 'moderator'),
  async (req, res) => {
    const parse = respondSchema.safeParse(req.body);
    if (!parse.success) {
      return res.status(400).json({ error: 'Invalid payload' });
    }
    try {
      await requireModeratorMembership(req.params.roomId, req.user);
      const result = await respondRoomJoinRequest({
        requestId: req.params.requestId,
        moderatorId: req.user.id,
        decision: parse.data.decision,
        roomId: req.params.roomId
      });
      if (result.room) {
        events.emit('conversation:updated', { conversation: result.room });
      }
      return res.json({ request: result.request });
    } catch (error) {
      const status = error.statusCode || 400;
      return res.status(status).json({ error: error.message || 'Unable to respond to request' });
    }
  }
);

module.exports = router;

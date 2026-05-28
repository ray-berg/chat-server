const express = require('express');
const { z } = require('zod');
const { authenticateRequest, requireManager } = require('../auth');
const events = require('../events');
const {
  getUserById,
  getConversationById,
  getAgentProfile,
  upsertAgentProfile,
  listAgents,
  getAssignmentById,
  getAgentAssignment,
  assignAgent,
  releaseAgent
} = require('../db');

const router = express.Router();
router.use(authenticateRequest);

// List agents (manager view). available=true (default) excludes exclusive
// agents currently holding a lock; shared agents are always routable.
router.get('/', requireManager, async (req, res) => {
  const skill = typeof req.query.skill === 'string' && req.query.skill ? req.query.skill : undefined;
  const available = req.query.available !== 'false';
  const agents = await listAgents({ skill, available });
  return res.json({ agents });
});

router.get('/:userId/profile', async (req, res) => {
  const profile = await getAgentProfile(req.params.userId);
  if (!profile) {
    return res.status(404).json({ error: 'Agent profile not found' });
  }
  return res.json({ profile });
});

const profileSchema = z
  .object({
    skills: z.array(z.string().max(64)).max(50).optional(),
    expertiseLevel: z.enum(['junior', 'mid', 'senior', 'staff']).optional(),
    systemPrompt: z.string().max(8000).optional().nullable(),
    specialties: z.array(z.string().max(64)).max(50).optional(),
    tone: z.string().max(120).optional().nullable(),
    exclusive: z.boolean().optional()
  })
  .strict();

// Upsert a profile. Auth: admin or the agent itself.
router.post('/:userId/profile', async (req, res) => {
  const { userId } = req.params;
  if (req.user.role !== 'admin' && req.user.id !== userId) {
    return res.status(403).json({ error: 'Can only edit your own agent profile' });
  }
  const parse = profileSchema.safeParse(req.body || {});
  if (!parse.success) {
    return res.status(400).json({ error: 'Invalid payload', details: parse.error.errors });
  }
  const target = await getUserById(userId);
  if (!target) {
    return res.status(404).json({ error: 'User not found' });
  }
  const profile = await upsertAgentProfile(userId, parse.data);
  events.emit('profile:updated', { userId });
  return res.json({ profile });
});

const assignSchema = z.object({
  roomId: z.string().min(1).max(36),
  advisory: z.boolean().optional()
});

// Assign an agent to a room. Manager-gated. Exclusive agents take an atomic
// lock (409 if already held); shared agents are always advisory, never 409.
router.post('/:userId/assign', requireManager, async (req, res) => {
  const { userId } = req.params;
  const parse = assignSchema.safeParse(req.body || {});
  if (!parse.success) {
    return res.status(400).json({ error: 'Invalid payload', details: parse.error.errors });
  }
  const target = await getUserById(userId);
  if (!target) {
    return res.status(404).json({ error: 'Agent not found' });
  }
  const room = await getConversationById(parse.data.roomId);
  if (!room) {
    return res.status(404).json({ error: 'Room not found' });
  }
  try {
    const assignment = await assignAgent({
      userId,
      roomId: parse.data.roomId,
      assignedBy: req.user.id,
      advisory: parse.data.advisory
    });
    events.emit('agent:assigned', { assignment });
    return res.status(201).json({ assignment });
  } catch (err) {
    if (err && err.code === 'AGENT_LOCKED') {
      return res.status(409).json({ error: 'Agent already has an active assignment' });
    }
    return res.status(500).json({ error: 'Failed to assign agent' });
  }
});

const releaseSchema = z.object({ assignmentId: z.string().max(36).optional() });

// Release an assignment. Auth: a manager, or the agent releasing itself.
router.post('/:userId/release', async (req, res) => {
  const { userId } = req.params;
  const isManager = req.user.manager || req.user.role === 'admin';
  if (!isManager && req.user.id !== userId) {
    return res.status(403).json({ error: 'Manager privileges required' });
  }
  const parse = releaseSchema.safeParse(req.body || {});
  if (!parse.success) {
    return res.status(400).json({ error: 'Invalid payload', details: parse.error.errors });
  }
  const { active } = await getAgentAssignment(userId);
  const targetId = parse.data.assignmentId || (active && active.id);
  await releaseAgent({ userId, assignmentId: parse.data.assignmentId });
  if (targetId) {
    const released = await getAssignmentById(targetId);
    if (released) {
      events.emit('agent:released', { assignment: released });
    }
  }
  return res.json(await getAgentAssignment(userId));
});

router.get('/:userId/assignment', async (req, res) => {
  const assignment = await getAgentAssignment(req.params.userId);
  return res.json(assignment);
});

module.exports = router;

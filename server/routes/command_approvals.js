const express = require('express');
const { z } = require('zod');
const { authenticateRequest } = require('../auth');
const {
  createCommandApproval,
  getCommandApproval,
  respondToCommandApproval,
  listCommandApprovalsForUser
} = require('../db');
const events = require('../events');

const router = express.Router();
router.use(authenticateRequest);

const createSchema = z.object({
  command: z.object({
    tool: z.string().min(1).max(120),
    args: z.record(z.any()).default({}),
    display: z.record(z.any()).optional()
  }),
  conversationId: z.string().uuid().optional()
});

// Worker submits a proposed MCP command for its manager's approval.
router.post('/', async (req, res) => {
  const parse = createSchema.safeParse(req.body);
  if (!parse.success) {
    return res.status(400).json({ error: 'Invalid payload', details: parse.error.errors });
  }
  try {
    const approval = await createCommandApproval({
      requesterId: req.user.id,
      tool: parse.data.command.tool,
      args: parse.data.command.args,
      display: parse.data.command.display || null,
      conversationId: parse.data.conversationId || null
    });
    events.emit('command_approval:created', { approval });
    return res.status(201).json({ approval });
  } catch (e) {
    return res.status(e.statusCode || 400).json({ error: e.message || 'Unable to submit command for approval' });
  }
});

// List my command approvals (role=target -> as approver; role=requester -> as worker).
router.get('/', async (req, res) => {
  const role = req.query.role === 'requester' ? 'requester' : 'target';
  const status = ['pending', 'approved', 'denied', 'cancelled'].includes(req.query.status)
    ? req.query.status
    : null;
  const approvals = await listCommandApprovalsForUser(req.user.id, { role, status });
  return res.json({ approvals });
});

// Fetch one -- used by the NOCOS backstop to verify status + param-match the command.
router.get('/:id', async (req, res) => {
  const approval = await getCommandApproval(req.params.id);
  if (!approval) {
    return res.status(404).json({ error: 'Not found' });
  }
  if (![approval.requesterId, approval.targetId].includes(req.user.id) && req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Forbidden' });
  }
  return res.json({ approval });
});

const respondSchema = z.object({
  decision: z.enum(['approved', 'denied']),
  reason: z.string().max(500).optional()
});

// Only the assigned manager may approve/deny.
router.post('/:id/respond', async (req, res) => {
  const parse = respondSchema.safeParse(req.body);
  if (!parse.success) {
    return res.status(400).json({ error: 'Invalid payload' });
  }
  try {
    const approval = await respondToCommandApproval({
      id: req.params.id,
      responderId: req.user.id,
      decision: parse.data.decision,
      reason: parse.data.reason || null
    });
    events.emit('command_approval:updated', { approval });
    return res.json({ approval });
  } catch (e) {
    return res.status(e.statusCode || 400).json({ error: e.message || 'Unable to respond to approval' });
  }
});

module.exports = router;

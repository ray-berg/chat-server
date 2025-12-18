const express = require('express');
const { z } = require('zod');
const { authenticateRequest } = require('../auth');
const {
  createApprovalRequest,
  listApprovalRequestsForUser,
  respondToApprovalRequest,
  cancelApprovalRequest,
  createOrGetDirectConversation,
  createMessage,
  getUserWithPassword,
  isMember
} = require('../db');
const events = require('../events');

const router = express.Router();
router.use(authenticateRequest);

const createSchema = z.object({
  targetUserId: z.string().uuid(),
  note: z.string().max(500).optional(),
  conversationId: z.string().uuid().optional()
});

router.get('/', async (req, res) => {
  const direction = ['incoming', 'outgoing', 'all'].includes(req.query.direction)
    ? req.query.direction
    : 'incoming';
  const requests = await listApprovalRequestsForUser(req.user.id, { direction });
  return res.json({ requests });
});

router.post('/', async (req, res) => {
  const parse = createSchema.safeParse(req.body);
  if (!parse.success) {
    return res.status(400).json({ error: 'Invalid payload', details: parse.error.errors });
  }
  try {
    let conversationId = parse.data.conversationId || null;
    if (conversationId) {
      const member = await isMember(conversationId, req.user.id);
      if (!member) {
        return res.status(400).json({ error: 'You must be in the conversation to reference it' });
      }
    }
    const request = await createApprovalRequest({
      requesterId: req.user.id,
      targetId: parse.data.targetUserId,
      note: parse.data.note?.trim(),
      conversationId
    });
    events.emit('approval:updated', { request });
    return res.status(201).json({ request });
  } catch (error) {
    return res.status(400).json({ error: error.message || 'Unable to submit request' });
  }
});

const respondSchema = z.object({
  decision: z.enum(['approved', 'denied'])
});

router.post('/:id/respond', async (req, res) => {
  const parse = respondSchema.safeParse(req.body);
  if (!parse.success) {
    return res.status(400).json({ error: 'Invalid payload' });
  }
  try {
    let approvalToken = null;
    if (parse.data.decision === 'approved') {
      const manager = await getUserWithPassword(req.user.id);
      if (!manager || !manager.manager) {
        return res.status(400).json({ error: 'Only managers can approve these requests' });
      }
      if (!manager.manager_token || manager.manager_token.length !== 32) {
        return res
          .status(400)
          .json({ error: 'Manager approval token not configured (32 characters required)' });
      }
      approvalToken = manager.manager_token;
    }
    const request = await respondToApprovalRequest({
      id: req.params.id,
      responderId: req.user.id,
      decision: parse.data.decision
    });
    events.emit('approval:updated', { request });
    if (request.status === 'approved') {
      let deliveryConversationId = null;
      if (request.conversationId && (await isMember(request.conversationId, req.user.id))) {
        deliveryConversationId = request.conversationId;
      }
      if (!deliveryConversationId) {
        const { conversation } = await createOrGetDirectConversation(
          req.user.id,
          request.requesterId
        );
        deliveryConversationId = conversation.id;
      }
      const message = await createMessage({
        conversationId: deliveryConversationId,
        userId: req.user.id,
        content: approvalToken
      });
      events.emit('message:created', { conversationId: deliveryConversationId, message });
    }
    return res.json({ request });
  } catch (error) {
    return res.status(400).json({ error: error.message || 'Unable to respond to request' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const request = await cancelApprovalRequest(req.params.id, req.user.id);
    events.emit('approval:updated', { request });
    return res.json({ request });
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
});

module.exports = router;

const express = require('express');
const { z } = require('zod');
const {
  listConversationsForUser,
  createOrGetDirectConversation,
  listMessages,
  createMessage,
  isMember,
  getConversationById,
  markMessagesRead,
  getReadReceipts
} = require('../db');
const { authenticateRequest } = require('../auth');
const events = require('../events');

const router = express.Router();
router.use(authenticateRequest);

router.get('/', async (req, res) => {
  const conversations = await listConversationsForUser(req.user.id);
  return res.json({ conversations });
});

const directSchema = z.object({
  targetUserId: z.string().uuid()
});

router.post('/direct', async (req, res) => {
  const parse = directSchema.safeParse(req.body);
  if (!parse.success) {
    return res.status(400).json({ error: 'Invalid payload' });
  }
  const { targetUserId } = parse.data;
  if (targetUserId === req.user.id) {
    return res.status(400).json({ error: 'Cannot start a direct message with yourself' });
  }
  const result = await createOrGetDirectConversation(req.user.id, targetUserId);
  events.emit('conversation:updated', {
    conversation: result.conversation,
    isNew: result.isNew,
    initiatorId: req.user.id
  });
  return res.status(result.isNew ? 201 : 200).json({ conversation: result.conversation });
});

router.get('/:conversationId', async (req, res) => {
  const conversation = await getConversationById(req.params.conversationId);
  if (!conversation || !(await isMember(conversation.id, req.user.id))) {
    return res.status(404).json({ error: 'Conversation not found' });
  }
  return res.json({ conversation });
});

router.get('/:conversationId/messages', async (req, res) => {
  const { conversationId } = req.params;
  if (!(await isMember(conversationId, req.user.id))) {
    return res.status(404).json({ error: 'Conversation not found' });
  }
  const before = req.query.before;
  const messages = await listMessages(conversationId, { before });
  return res.json({ messages });
});

const FORMAT_CHOICES = ['text', 'markdown'];

const messageSchema = z.object({
  content: z.string().min(1).max(2000),
  format: z.enum(FORMAT_CHOICES).optional()
});

router.post('/:conversationId/messages', async (req, res) => {
  const { conversationId } = req.params;
  if (!(await isMember(conversationId, req.user.id))) {
    return res.status(404).json({ error: 'Conversation not found' });
  }
  const parse = messageSchema.safeParse(req.body);
  if (!parse.success) {
    return res.status(400).json({ error: 'Invalid payload' });
  }
  try {
    const message = await createMessage({
      conversationId,
      userId: req.user.id,
      content: parse.data.content.trim(),
      format: parse.data.format || 'text'
    });
    events.emit('message:created', { conversationId, message });
    return res.status(201).json({ message });
  } catch (error) {
    return res.status(400).json({ error: error.message || 'Failed to send message' });
  }
});

const thinkingSchema = z.object({
  thinking: z.boolean()
});

router.post('/:conversationId/thinking', async (req, res) => {
  const { conversationId } = req.params;
  if (!req.user.bot) {
    return res.status(403).json({ error: 'Only bots can use the thinking API' });
  }
  if (!(await isMember(conversationId, req.user.id))) {
    return res.status(404).json({ error: 'Conversation not found' });
  }
  const parse = thinkingSchema.safeParse(req.body);
  if (!parse.success) {
    return res.status(400).json({ error: 'Invalid payload' });
  }
  events.emit('thinking:broadcast', {
    conversationId,
    userId: req.user.id,
    displayName: req.user.displayName || req.user.username,
    thinking: parse.data.thinking
  });
  return res.json({ ok: true, thinking: parse.data.thinking });
});

const readSchema = z.object({
  messageId: z.string().uuid()
});

router.post('/:conversationId/read', async (req, res) => {
  const { conversationId } = req.params;
  if (!req.user.bot) {
    return res.status(403).json({ error: 'Only bots can use the read receipt API' });
  }
  if (!(await isMember(conversationId, req.user.id))) {
    return res.status(404).json({ error: 'Conversation not found' });
  }
  const parse = readSchema.safeParse(req.body);
  if (!parse.success) {
    return res.status(400).json({ error: 'Invalid payload' });
  }
  try {
    const receipt = await markMessagesRead(conversationId, req.user.id, parse.data.messageId);
    events.emit('read:receipt', {
      conversationId,
      userId: req.user.id,
      displayName: req.user.displayName || req.user.username,
      messageId: parse.data.messageId
    });
    return res.json({ ok: true, receipt });
  } catch (error) {
    return res.status(400).json({ error: error.message || 'Failed to mark as read' });
  }
});

router.get('/:conversationId/read-receipts', async (req, res) => {
  const { conversationId } = req.params;
  if (!(await isMember(conversationId, req.user.id))) {
    return res.status(404).json({ error: 'Conversation not found' });
  }
  const receipts = await getReadReceipts(conversationId);
  return res.json({ receipts });
});

module.exports = router;

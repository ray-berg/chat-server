const express = require('express');
const { z } = require('zod');
const { listMentionsForUser, markMentionsRead } = require('../db');
const { authenticateRequest } = require('../auth');

const router = express.Router();
router.use(authenticateRequest);

// Recent @mentions for the caller (read + unread, newest first) with enough
// context (room, author, message) to answer the ping or decide to join.
router.get('/', async (req, res) => {
  const mentions = await listMentionsForUser(req.user.id);
  return res.json({ mentions });
});

const readSchema = z.object({
  conversationId: z.string().uuid().optional(),
  mentionId: z.string().uuid().optional()
});

// Mark mentions read: all of mine, or scoped to a conversation / single mention.
router.post('/read', async (req, res) => {
  const parse = readSchema.safeParse(req.body || {});
  if (!parse.success) {
    return res.status(400).json({ error: 'Invalid payload' });
  }
  const count = await markMentionsRead(req.user.id, parse.data);
  return res.json({ ok: true, count });
});

module.exports = router;

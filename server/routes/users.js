const express = require('express');
const { z } = require('zod');
const {
  authenticateRequest,
  hashPassword,
  verifyPassword,
  validatePassword,
  generateApiKey,
  hashApiKey
} = require('../auth');
const {
  listUsers,
  updateUserProfile,
  getUserById,
  getUserWithPassword,
  resetUserPassword,
  createApiKey,
  listApiKeys,
  deleteApiKey,
  setActivityStatus
} = require('../db');
const events = require('../events');

const router = express.Router();
router.use(authenticateRequest);

router.get('/', async (req, res) => {
  const query = req.query.q || '';
  const users = await listUsers({ query, limit: 25 });
  return res.json({ users });
});

router.get('/me/profile', async (req, res) => {
  const profile = await getUserById(req.user.id);
  return res.json({ profile });
});

const birthdaySchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .optional()
  .nullable();

const managerTokenSchema = z
  .union([z.string().length(32), z.literal('')])
  .optional();

const profileSchema = z
  .object({
    displayName: z.string().min(1).max(64).optional(),
    bio: z.string().max(500).optional(),
    birthday: birthdaySchema,
    avatarUrl: z.string().max(255).optional().or(z.literal('')),
    profileTheme: z.string().max(32).optional(),
    accentColor: z.string().max(32).optional(),
    profilePhotoUrl: z.string().max(255).optional().or(z.literal('')),
    presenceStatus: z.enum(['online', 'idle', 'away', 'dnd', 'offline']).optional(),
    idleTimeoutMinutes: z.number().int().min(1).max(240).optional(),
    managerToken: managerTokenSchema
  })
  .strict();

router.put('/me/profile', async (req, res) => {
  const parse = profileSchema.safeParse(req.body);
  if (!parse.success) {
    return res.status(400).json({ error: 'Invalid profile data', details: parse.error.errors });
  }
  const updates = { ...parse.data };
  if (typeof updates.managerToken !== 'undefined') {
    if (!req.user.manager) {
      return res.status(403).json({ error: 'Only managers can set approval tokens' });
    }
  }
  const profile = await updateUserProfile(req.user.id, updates);
  return res.json({ profile });
});

const passwordSchema = z
  .object({
    currentPassword: z.string().min(8).max(128),
    newPassword: z.string().min(8).max(128)
  })
  .strict();

router.post('/me/password', async (req, res) => {
  const parse = passwordSchema.safeParse(req.body);
  if (!parse.success) {
    return res.status(400).json({ error: 'Invalid password data', details: parse.error.errors });
  }
  const { currentPassword, newPassword } = parse.data;

  // Validate new password complexity
  const passwordValidation = validatePassword(newPassword);
  if (!passwordValidation.valid) {
    return res.status(400).json({
      error: 'New password does not meet requirements',
      details: passwordValidation.errors
    });
  }

  const user = await getUserWithPassword(req.user.id);
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }
  const valid = await verifyPassword(currentPassword, user.password_hash);
  if (!valid) {
    return res.status(403).json({ error: 'Current password is incorrect' });
  }
  const newHash = await hashPassword(newPassword);
  await resetUserPassword(req.user.id, newHash);
  return res.json({ ok: true });
});

// ---- Activity status (agent orchestration) ----
// Self-only. Sits alongside presence; agents/their harness report it.
const activitySchema = z.object({
  status: z.enum(['ready', 'working', 'awaiting_review', 'awaiting_assignment', 'idle'])
});

router.post('/me/activity', async (req, res) => {
  const parse = activitySchema.safeParse(req.body || {});
  if (!parse.success) {
    return res.status(400).json({ error: 'Invalid payload', details: parse.error.errors });
  }
  const activityStatus = await setActivityStatus(req.user.id, parse.data.status);
  events.emit('activity:changed', { userId: req.user.id, activityStatus });
  return res.json({ activityStatus });
});

// ---- API keys ----
// Any authenticated user manages their OWN keys (self-scoped). A key
// authenticates as its owner and carries exactly that owner's role - so a
// non-admin/bot account gets a non-admin key. Admins can also provision keys
// for other accounts via /api/admin/users/:id/api-keys.

const apiKeyLabelSchema = z.object({ label: z.string().max(80).optional() });

async function issueKey(userId, label) {
  const key = generateApiKey();
  const meta = await createApiKey({
    userId,
    label: label || null,
    keyHash: hashApiKey(key),
    keyPrefix: key.slice(0, 12)
  });
  // Full key is returned exactly once and never stored in plaintext.
  return { ...meta, key };
}

router.get('/me/api-keys', async (req, res) => {
  const keys = await listApiKeys(req.user.id);
  return res.json({ keys });
});

router.post('/me/api-keys', async (req, res) => {
  const parse = apiKeyLabelSchema.safeParse(req.body || {});
  if (!parse.success) {
    return res.status(400).json({ error: 'Invalid payload' });
  }
  const created = await issueKey(req.user.id, parse.data.label);
  return res.status(201).json({ apiKey: created });
});

router.post('/me/api-keys/:id/rotate', async (req, res) => {
  const parse = apiKeyLabelSchema.safeParse(req.body || {});
  if (!parse.success) {
    return res.status(400).json({ error: 'Invalid payload' });
  }
  const removed = await deleteApiKey(req.params.id, req.user.id);
  if (!removed) {
    return res.status(404).json({ error: 'API key not found' });
  }
  const created = await issueKey(req.user.id, parse.data.label);
  return res.status(201).json({ apiKey: created });
});

router.delete('/me/api-keys/:id', async (req, res) => {
  const removed = await deleteApiKey(req.params.id, req.user.id);
  if (!removed) {
    return res.status(404).json({ error: 'API key not found' });
  }
  return res.status(204).send();
});

module.exports = router;

const express = require('express');
const { z } = require('zod');
const { authenticateRequest, hashPassword, verifyPassword, validatePassword } = require('../auth');
const { listUsers, updateUserProfile, getUserById, getUserWithPassword, resetUserPassword } = require('../db');

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

module.exports = router;

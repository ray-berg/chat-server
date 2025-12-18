const express = require('express');
const { z } = require('zod');
const { authenticateRequest, requireRole, hashPassword } = require('../auth');
const {
  listUsers,
  updateUserAccess,
  updateUserProfile,
  getStats,
  createUser,
  getUserByUsername,
  getUserById,
  resetUserPassword,
  deleteUser,
  recordAuditLog,
  listAuditLogs
} = require('../db');

const router = express.Router();
router.use(authenticateRequest);

const roleEnum = z.enum(['user', 'moderator', 'admin']);

router.get('/users', requireRole('admin', 'moderator'), async (req, res) => {
  const query = req.query.q || '';
  const users = await listUsers({ query, limit: 200 });
  return res.json({ users });
});

router.get('/users/:id', requireRole('admin', 'moderator'), async (req, res) => {
  const user = await getUserById(req.params.id);
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }
  if (req.user.role === 'moderator' && user.role === 'admin') {
    return res.status(403).json({ error: 'Cannot view administrator profiles' });
  }
  return res.json({ user });
});

const birthdaySchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .optional()
  .nullable();

const updateSchema = z.object({
  // Access control fields
  role: roleEnum.optional(),
  status: z.enum(['active', 'disabled']).optional(),
  manager: z.boolean().optional(),
  bot: z.boolean().optional(),
  // Profile fields
  displayName: z.string().min(1).max(64).optional(),
  bio: z.string().max(500).optional().nullable(),
  birthday: birthdaySchema,
  avatarUrl: z.string().max(255).optional().nullable(),
  profilePhotoUrl: z.string().max(255).optional().nullable(),
  profileTheme: z.enum(['light', 'dark']).optional(),
  accentColor: z.string().max(32).optional()
});

router.patch('/users/:id', requireRole('admin', 'moderator'), async (req, res) => {
  const parse = updateSchema.safeParse(req.body);
  if (!parse.success) {
    return res.status(400).json({ error: 'Invalid payload', details: parse.error.errors });
  }
  const target = await getUserById(req.params.id);
  if (!target) {
    return res.status(404).json({ error: 'User not found' });
  }
  if (req.user.role === 'moderator' && target.role === 'admin') {
    return res.status(403).json({ error: 'Cannot modify administrator accounts' });
  }

  // Separate access fields from profile fields
  const { role, status, manager, bot, ...profileFields } = parse.data;
  const accessPayload = {};
  if (role !== undefined && req.user.role === 'admin') accessPayload.role = role;
  if (status !== undefined) accessPayload.status = status;
  if (manager !== undefined) accessPayload.manager = manager;
  if (bot !== undefined) accessPayload.bot = bot;

  const hasAccessChanges = Object.keys(accessPayload).length > 0;
  const hasProfileChanges = Object.keys(profileFields).length > 0;

  if (!hasAccessChanges && !hasProfileChanges) {
    return res.status(400).json({ error: 'No changes provided' });
  }

  // Apply access changes
  if (hasAccessChanges) {
    await updateUserAccess(req.params.id, accessPayload);
  }

  // Apply profile changes
  if (hasProfileChanges) {
    await updateUserProfile(req.params.id, profileFields);
  }

  const updated = await getUserById(req.params.id);
  await recordAuditLog({
    actorId: req.user.id,
    action: 'admin.update_user',
    targetId: updated.id,
    metadata: { changes: parse.data }
  });
  return res.json({ user: updated });
});

const createSchema = z.object({
  username: z
    .string()
    .min(3)
    .max(32)
    .regex(/^[a-zA-Z0-9_\-.]+$/),
  password: z.string().min(8).max(128),
  displayName: z.string().min(1).max(64),
  role: roleEnum.default('user'),
  manager: z.boolean().optional(),
  bot: z.boolean().optional()
});

router.post('/users', requireRole('admin'), async (req, res) => {
  const parse = createSchema.safeParse(req.body);
  if (!parse.success) {
    return res.status(400).json({ error: 'Invalid payload', details: parse.error.errors });
  }
  const { username, password, displayName, role, manager, bot } = parse.data;
  const existing = await getUserByUsername(username);
  if (existing) {
    return res.status(409).json({ error: 'Username already exists' });
  }
  const passwordHash = await hashPassword(password);
  const user = await createUser({ username, passwordHash, displayName, role, manager, bot });
  await recordAuditLog({
    actorId: req.user.id,
    action: 'admin.create_user',
    targetId: user.id,
    metadata: { username, role, manager: Boolean(manager), bot: Boolean(bot) }
  });
  return res.status(201).json({ user });
});

const resetSchema = z.object({
  password: z.string().min(8).max(128)
});

router.post('/users/:id/reset-password', requireRole('admin', 'moderator'), async (req, res) => {
  const parse = resetSchema.safeParse(req.body);
  if (!parse.success) {
    return res.status(400).json({ error: 'Invalid payload' });
  }
  const target = await getUserById(req.params.id);
  if (!target) {
    return res.status(404).json({ error: 'User not found' });
  }
  if (req.user.role === 'moderator' && target.role === 'admin') {
    return res.status(403).json({ error: 'Cannot reset administrator credentials' });
  }
  const passwordHash = await hashPassword(parse.data.password);
  const user = await resetUserPassword(req.params.id, passwordHash);
  await recordAuditLog({
    actorId: req.user.id,
    action: 'admin.reset_password',
    targetId: user.id,
    metadata: { username: user.username }
  });
  return res.json({ user });
});

router.delete('/users/:id', requireRole('admin'), async (req, res) => {
  if (req.params.id === req.user.id) {
    return res.status(400).json({ error: 'You cannot delete your own account' });
  }
  const target = await getUserById(req.params.id);
  if (!target) {
    return res.status(404).json({ error: 'User not found' });
  }
  await deleteUser(req.params.id);
  await recordAuditLog({
    actorId: req.user.id,
    action: 'admin.delete_user',
    targetId: target.id,
    metadata: { username: target.username }
  });
  return res.status(204).send();
});

router.get('/stats', requireRole('admin', 'moderator'), async (req, res) => {
  const stats = await getStats();
  return res.json({ stats });
});

router.get('/audit-logs', requireRole('admin'), async (req, res) => {
  const logs = await listAuditLogs({ limit: 200 });
  return res.json({ logs });
});

module.exports = router;

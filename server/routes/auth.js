const express = require('express');
const { z } = require('zod');
const {
  createUser,
  getUserByUsername,
  getUserById,
  updateUserPresence,
  ensureUserInLobby
} = require('../db');
const {
  hashPassword,
  verifyPassword,
  createToken,
  authenticateRequest,
  sanitizeUser
} = require('../auth');
const { createRateLimiter } = require('../rateLimiter');

const router = express.Router();
const loginLimiter = createRateLimiter({ windowMs: 60 * 1000, max: 5 });
const registrationLimiter = createRateLimiter({ windowMs: 60 * 1000, max: 3 });

const registerSchema = z.object({
  username: z
    .string()
    .min(3)
    .max(32)
    .regex(/^[a-zA-Z0-9_\-.]+$/),
  password: z.string().min(8).max(128),
  displayName: z.string().min(1).max(64)
});

router.post('/register', registrationLimiter, async (req, res) => {
  const parse = registerSchema.safeParse(req.body);
  if (!parse.success) {
    return res.status(400).json({ error: 'Invalid payload', details: parse.error.errors });
  }
  const { username, password, displayName } = parse.data;
  const existing = await getUserByUsername(username);
  if (existing) {
    return res.status(409).json({ error: 'Username already in use' });
  }
  const passwordHash = await hashPassword(password);
  const user = await createUser({ username, passwordHash, displayName });
  await ensureUserInLobby(user.id);
  await updateUserPresence(user.id, 'online');
  const token = createToken(user);
  const hydrated = await getUserById(user.id);
  return res.status(201).json({ token, user: sanitizeUser(hydrated) });
});

const loginSchema = z.object({
  username: z.string(),
  password: z.string()
});

router.post('/login', loginLimiter, async (req, res) => {
  const parse = loginSchema.safeParse(req.body);
  if (!parse.success) {
    return res.status(400).json({ error: 'Invalid payload' });
  }
  const { username, password } = parse.data;
  const user = await getUserByUsername(username);
  if (!user) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }
  const valid = await verifyPassword(password, user.password_hash);
  if (!valid) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }
  if (user.status !== 'active') {
    return res.status(403).json({ error: 'Account is disabled' });
  }
  const token = createToken(user);
  await ensureUserInLobby(user.id);
  await updateUserPresence(user.id, 'online');
  const safeUser = await getUserById(user.id);
  return res.json({ token, user: sanitizeUser(safeUser) });
});

router.get('/me', authenticateRequest, (req, res) => {
  return res.json({ user: sanitizeUser(req.user) });
});

module.exports = router;

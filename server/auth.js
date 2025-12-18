const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const config = require('./config');
const { getUserById } = require('./db');

function hashPassword(password) {
  return bcrypt.hash(password, 10);
}

function verifyPassword(password, hash) {
  return bcrypt.compare(password, hash);
}

function createToken(user) {
  return jwt.sign(
    {
      sub: user.id,
      role: user.role
    },
    config.jwtSecret,
    { expiresIn: config.jwtExpiresIn }
  );
}

async function authenticateRequest(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing auth token' });
  }
  const token = header.slice(7);
  try {
    const payload = jwt.verify(token, config.jwtSecret);
    const user = await getUserById(payload.sub);
    if (!user) {
      return res.status(401).json({ error: 'Invalid token' });
    }
    if (user.status !== 'active') {
      return res.status(403).json({ error: 'Account is disabled' });
    }
    req.user = user;
    return next();
  } catch (error) {
    return res.status(401).json({ error: 'Invalid token' });
  }
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Insufficient privileges' });
    }
    return next();
  };
}

const requireAdmin = requireRole('admin');

function sanitizeUser(user) {
  if (!user) return null;
  return {
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    role: user.role,
    status: user.status,
    manager: Boolean(user.manager),
    avatarUrl: user.avatarUrl,
    bio: user.bio,
    birthday: user.birthday,
    profileTheme: user.profileTheme,
    accentColor: user.accentColor,
    presenceStatus: user.presenceStatus,
    lastSeenAt: user.lastSeenAt,
    profilePhotoUrl: user.profilePhotoUrl,
    lastRoomId: user.lastRoomId || null,
    createdAt: user.createdAt
  };
}

module.exports = {
  hashPassword,
  verifyPassword,
  createToken,
  authenticateRequest,
  requireAdmin,
  requireRole,
  sanitizeUser
};

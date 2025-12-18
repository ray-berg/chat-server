const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const config = require('./config');
const { getUserById } = require('./db');

// Token blacklist for logout (in-memory, consider Redis for production clusters)
const tokenBlacklist = new Map();

// Failed login attempts tracking (username -> { count, lockedUntil })
const failedAttempts = new Map();

// Common weak passwords to reject
const COMMON_PASSWORDS = new Set([
  'password', 'password1', 'password123', '12345678', '123456789',
  'qwerty123', 'letmein', 'welcome', 'admin123', 'changeme'
]);

function hashPassword(password) {
  return bcrypt.hash(password, 12); // Increased from 10 to 12 rounds
}

function verifyPassword(password, hash) {
  return bcrypt.compare(password, hash);
}

/**
 * Validate password against complexity requirements
 * @returns {{ valid: boolean, errors: string[] }}
 */
function validatePassword(password) {
  const errors = [];
  const { auth } = config;

  if (!password || typeof password !== 'string') {
    return { valid: false, errors: ['Password is required'] };
  }

  if (password.length < auth.passwordMinLength) {
    errors.push(`Password must be at least ${auth.passwordMinLength} characters`);
  }

  if (password.length > auth.passwordMaxLength) {
    errors.push(`Password must be at most ${auth.passwordMaxLength} characters`);
  }

  if (auth.passwordRequireUppercase && !/[A-Z]/.test(password)) {
    errors.push('Password must contain at least one uppercase letter');
  }

  if (auth.passwordRequireLowercase && !/[a-z]/.test(password)) {
    errors.push('Password must contain at least one lowercase letter');
  }

  if (auth.passwordRequireNumber && !/\d/.test(password)) {
    errors.push('Password must contain at least one number');
  }

  if (auth.passwordRequireSpecial && !/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) {
    errors.push('Password must contain at least one special character');
  }

  // Check against common passwords
  if (COMMON_PASSWORDS.has(password.toLowerCase())) {
    errors.push('Password is too common, please choose a stronger password');
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Check if account is locked due to failed attempts
 */
function isAccountLocked(username) {
  const record = failedAttempts.get(username.toLowerCase());
  if (!record) return false;

  if (record.lockedUntil && record.lockedUntil > Date.now()) {
    return true;
  }

  // Lock expired, reset
  if (record.lockedUntil && record.lockedUntil <= Date.now()) {
    failedAttempts.delete(username.toLowerCase());
  }

  return false;
}

/**
 * Get remaining lockout time in seconds
 */
function getLockoutRemaining(username) {
  const record = failedAttempts.get(username.toLowerCase());
  if (!record || !record.lockedUntil) return 0;
  return Math.max(0, Math.ceil((record.lockedUntil - Date.now()) / 1000));
}

/**
 * Record a failed login attempt
 */
function recordFailedAttempt(username) {
  const key = username.toLowerCase();
  const record = failedAttempts.get(key) || { count: 0, lockedUntil: null };
  record.count += 1;

  if (record.count >= config.auth.maxFailedAttempts) {
    record.lockedUntil = Date.now() + (config.auth.lockoutDurationMinutes * 60 * 1000);
    record.count = 0; // Reset count after lockout
  }

  failedAttempts.set(key, record);
  return record;
}

/**
 * Clear failed attempts on successful login
 */
function clearFailedAttempts(username) {
  failedAttempts.delete(username.toLowerCase());
}

/**
 * Add token to blacklist (for logout)
 */
function blacklistToken(token) {
  try {
    const payload = jwt.decode(token);
    if (payload && payload.exp) {
      // Store until token would naturally expire
      tokenBlacklist.set(token, payload.exp * 1000);
    }
  } catch (e) {
    // Invalid token, ignore
  }
}

/**
 * Check if token is blacklisted
 */
function isTokenBlacklisted(token) {
  return tokenBlacklist.has(token);
}

/**
 * Clean up expired tokens from blacklist
 */
function cleanupBlacklist() {
  const now = Date.now();
  for (const [token, expiry] of tokenBlacklist.entries()) {
    if (expiry < now) {
      tokenBlacklist.delete(token);
    }
  }
}

// Periodically clean up expired blacklisted tokens
setInterval(cleanupBlacklist, config.auth.tokenCleanupInterval);

function createToken(user) {
  return jwt.sign(
    {
      sub: user.id,
      role: user.role,
      iat: Math.floor(Date.now() / 1000)
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

  // Check if token has been blacklisted (logged out)
  if (isTokenBlacklisted(token)) {
    return res.status(401).json({ error: 'Token has been revoked' });
  }

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
    req.token = token; // Store token for potential logout
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
  validatePassword,
  createToken,
  authenticateRequest,
  requireAdmin,
  requireRole,
  sanitizeUser,
  // Account lockout
  isAccountLocked,
  getLockoutRemaining,
  recordFailedAttempt,
  clearFailedAttempts,
  // Token blacklist
  blacklistToken,
  isTokenBlacklisted
};

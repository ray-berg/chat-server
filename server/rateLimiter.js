function createRateLimiter({ windowMs = 60000, max = 20 } = {}) {
  const hits = new Map();

  const prune = () => {
    const now = Date.now();
    hits.forEach((entry, key) => {
      if (entry.expires <= now) {
        hits.delete(key);
      }
    });
  };

  setInterval(prune, windowMs).unref();

  return (req, res, next) => {
    const ip = req.ip || req.connection?.remoteAddress || req.socket?.remoteAddress || 'unknown';
    const now = Date.now();
    const entry = hits.get(ip) || { count: 0, expires: now + windowMs };
    if (now > entry.expires) {
      entry.count = 0;
      entry.expires = now + windowMs;
    }
    entry.count += 1;
    hits.set(ip, entry);

    if (entry.count > max) {
      const retryAfter = Math.ceil((entry.expires - now) / 1000);
      res.set('Retry-After', String(retryAfter));
      return res.status(429).json({ error: 'Too many requests, please try again later' });
    }
    return next();
  };
}

module.exports = {
  createRateLimiter
};

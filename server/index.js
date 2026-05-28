const path = require('path');
const http = require('http');
const https = require('https');
const fs = require('fs');
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const morgan = require('morgan');
const selfsigned = require('selfsigned');
const config = require('./config');
console.log(config.debug);
const { initDb } = require('./db');
const authRoutes = require('./routes/auth');
const conversationRoutes = require('./routes/conversations');
const userRoutes = require('./routes/users');
const adminRoutes = require('./routes/admin');
const approvalRoutes = require('./routes/approvals');
const roomRoutes = require('./routes/rooms');
const uploadRoutes = require('./routes/uploads');
const { setupWebsocket } = require('./ws');

async function start() {
  await initDb();

  const app = express();
  app.use(helmet());
  const configuredOrigins = (config.cors.allowedOrigins || [])
    .map((entry) => entry.trim())
    .filter(Boolean);
  const allowedOrigins = new Set(configuredOrigins.length ? configuredOrigins : ['*']);
  const isAllowedOrigin = (reqOrigin, hostHeader) => {
    if (!reqOrigin || allowedOrigins.has('*')) {
      return true;
    }
    if (allowedOrigins.has(reqOrigin)) {
      return true;
    }
    if (hostHeader) {
      try {
        const parsed = new URL(reqOrigin);
        if (parsed.host.toLowerCase() === hostHeader.toLowerCase()) {
          return true;
        }
      } catch (err) {
        return false;
      }
    }
    return false;
  };
  app.use((req, res, next) => {
    req._requestOrigin = req.header('Origin') || '';
    req._requestHost = req.header('Host') || '';
    return next();
  });
  app.use(
    cors((req, callback) => {
      const origin = req._requestOrigin;
      const hostHeader = req._requestHost;
      const allowed = allowedOrigins.has('*') || isAllowedOrigin(origin, hostHeader);
      const logLine = `[cors] ${allowed ? 'allowed' : 'blocked'} ${origin || 'unknown'} -> ${
        req.method
      } ${req.originalUrl} (host=${hostHeader || 'unknown'})`;
      if (allowed) {
        // eslint-disable-next-line no-console
        console.log(logLine);
        return callback(null, { origin: true, credentials: true });
      }
      // eslint-disable-next-line no-console
      console.warn(logLine);
      return callback(new Error('Not allowed by CORS'));
    })
  );
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: false }));
  app.use(morgan('dev'));
  app.use((err, req, res, next) => {
    if (err && err.message === 'Not allowed by CORS') {
      return res.status(403).json({ error: 'Origin not allowed' });
    }
    return next(err);
  });

  app.get('/health', (req, res) => {
    res.json({ ok: true, uptime: process.uptime() });
  });

  app.use('/api/auth', authRoutes);
  app.use('/api/conversations', conversationRoutes);
  app.use('/api/rooms', roomRoutes);
  app.use('/api/users', userRoutes);
  app.use('/api/admin', adminRoutes);
  app.use('/api/approvals', approvalRoutes);
  app.use('/api/uploads', uploadRoutes);

  const uploadsDir = path.join(__dirname, 'uploads');
  ensureDirectory(uploadsDir);
  app.use('/uploads', express.static(uploadsDir));

  const clientDir = path.join(__dirname, '..', 'client');
  app.use(express.static(clientDir));
  app.use((req, res, next) => {
    if (
      req.method === 'GET' &&
      !req.path.startsWith('/api') &&
      !req.path.startsWith('/ws') &&
      req.headers.accept &&
      req.headers.accept.includes('text/html')
    ) {
      return res.sendFile(path.join(clientDir, 'index.html'));
    }
    return next();
  });

  app.use((req, res) => res.status(404).json({ error: 'Not found' }));

  const server = createServer(app);
  // eslint-disable-next-line no-console
  console.log('[config] debugMode=%s logPath=%s port=%s env=%s', config.debug.enabled, config.debug.logPath, config.port, process.env.NODE_ENV || 'development');
  setupWebsocket(server);

  server.listen(config.port, () => {
    const protocol = server instanceof https.Server ? 'https' : 'http';
    // eslint-disable-next-line no-console
    console.log(`Secure chat server listening on ${protocol}://localhost:${config.port}`);
  });
}

function createServer(app) {
  if (config.ssl.enabled) {
    try {
      const options = loadSslOptions();
      return https.createServer(options, app);
    } catch (error) {
      // eslint-disable-next-line no-console
      console.warn('Failed to load provided SSL certs, falling back to self-signed:', error.message);
      const fallback = generateSelfSigned();
      return https.createServer(fallback, app);
    }
  }
  return http.createServer(app);
}

function loadSslOptions() {
  if (config.ssl.keyPath && config.ssl.certPath) {
    const options = {
      key: fs.readFileSync(config.ssl.keyPath),
      cert: fs.readFileSync(config.ssl.certPath)
    };
    if (config.ssl.caPath) {
      options.ca = fs.readFileSync(config.ssl.caPath);
    }
    return options;
  }
  return generateSelfSigned();
}

function generateSelfSigned() {
  const attrs = [{ name: 'commonName', value: config.ssl.commonName || 'localhost' }];
  const pems = selfsigned.generate(attrs, { days: 365, keySize: 2048 });
  return {
    key: pems.private,
    cert: pems.cert
  };
}

function ensureDirectory(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

start().catch((error) => {
  // eslint-disable-next-line no-console
  console.error('Failed to start server', error);
  process.exit(1);
});

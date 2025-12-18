const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

const loadedEnvFiles = [];

function loadEnvFile(filePath, { override } = { override: false }) {
  if (!filePath) {
    return;
  }
  const resolved = path.resolve(filePath);
  if (!fs.existsSync(resolved)) {
    return;
  }
  dotenv.config({ path: resolved, override });
  loadedEnvFiles.push(resolved);
}

const rootEnv = path.join(__dirname, '..', '.env');
loadEnvFile(rootEnv, { override: false });
loadEnvFile(path.join(__dirname, '.env'), { override: true });
if (process.env.CHAT_SERVER_ENV_FILE) {
  loadEnvFile(process.env.CHAT_SERVER_ENV_FILE, { override: true });
}

function parseOrigins(value) {
  return value
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
}

const defaultOrigins =
  process.env.ALLOWED_ORIGINS ||
  'http://localhost:3000,http://localhost:4000,https://localhost';

const defaultDebugLog =
  process.env.DEBUG_LOG_PATH || path.join(__dirname, '..', 'debug.log');

const config = {
  port: parseInt(process.env.PORT || '4433', 10),
  jwtSecret: process.env.JWT_SECRET || 'local-dev-secret',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '12h',
  adminUser: process.env.ADMIN_USER || 'admin',
  adminPassword: process.env.ADMIN_PASSWORD || 'ChangeMe!23',
  db: {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '3306', 10),
    user: process.env.DB_USER || 'chat_app',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'chat_app',
    connectionLimit: parseInt(process.env.DB_CONN_LIMIT || '10', 10)
  },
  ssl: {
    enabled: process.env.SSL_ENABLED !== 'false',
    keyPath: process.env.SSL_KEY_PATH || '',
    certPath: process.env.SSL_CERT_PATH || '',
    caPath: process.env.SSL_CA_PATH || '',
    commonName: process.env.SSL_COMMON_NAME || process.env.HOST || 'localhost'
  },
  cors: {
    allowedOrigins: parseOrigins(defaultOrigins)
  },
  debug: {
    enabled: process.env.DEBUG_MODE === 'true',
    logPath: defaultDebugLog
  },
  loadedEnvFiles
};

if (!process.env.JWT_SECRET) {
  // eslint-disable-next-line no-console
  console.warn('JWT_SECRET not set - falling back to insecure local default');
}

if (!process.env.DB_HOST) {
  // eslint-disable-next-line no-console
  console.warn('DB_HOST not set - defaulting to localhost (MariaDB)');
}

module.exports = config;

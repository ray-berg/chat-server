const fs = require('fs');
const path = require('path');
const config = require('./config');

let logStream = null;

function ensureStream() {
  if (!config.debug.enabled || !config.debug.logPath) {
    return null;
  }
  if (logStream) {
    return logStream;
  }
  try {
    fs.mkdirSync(path.dirname(config.debug.logPath), { recursive: true });
    logStream = fs.createWriteStream(config.debug.logPath, { flags: 'a' });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.warn(`Failed to open debug log at ${config.debug.logPath}: ${error.message}`);
    logStream = null;
  }
  return logStream;
}

function debugLog(message, meta = {}) {
  const stream = ensureStream();
  if (!stream) {
    return;
  }
  const entry = {
    timestamp: new Date().toISOString(),
    message,
    meta
  };
  stream.write(`${JSON.stringify(entry)}\n`);
}

module.exports = {
  debugLog
};

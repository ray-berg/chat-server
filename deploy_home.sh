#!/usr/bin/env bash
set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SERVER_DIR="$REPO_DIR/server"
LOG_DIR="$REPO_DIR/logs"
PID_FILE="$LOG_DIR/chat-server-home.pid"
LOG_FILE="$LOG_DIR/chat-server-home.log"

ENV_FILE=""
for candidate in "$REPO_DIR/.env.prod" "$REPO_DIR/.env" "$SERVER_DIR/.env"; do
  if [[ -f "$candidate" ]]; then
    ENV_FILE="$candidate"
    break
  fi
done

if [[ -z "$ENV_FILE" ]]; then
  echo "Error: Unable to find an environment file (.env.prod, .env, or server/.env)." >&2
  exit 1
fi

if ! command -v npm >/dev/null 2>&1; then
  echo "Error: npm is required but was not found in PATH." >&2
  exit 1
fi

echo "Using environment file: $ENV_FILE"

set -a
source "$ENV_FILE"
set +a

REQUIRED_VARS=(
  PORT
  JWT_SECRET
  ADMIN_USER
  ADMIN_PASSWORD
  DB_HOST
  DB_PORT
  DB_USER
  DB_PASSWORD
  DB_NAME
)

MISSING=()
for var in "${REQUIRED_VARS[@]}"; do
  value="${!var:-}"
  if [[ -z "$value" ]]; then
    MISSING+=("$var")
  fi
done

if [[ ${#MISSING[@]} -gt 0 ]]; then
  echo "Error: missing required variables:" >&2
  for var in "${MISSING[@]}"; do
    echo "  - $var" >&2
  done
  exit 1
fi

DEFAULT_DEBUG_LOG="$REPO_DIR/logs/debug.log"
if [[ -z "${DEBUG_LOG_PATH:-}" ]]; then
  DEBUG_LOG_PATH="$DEFAULT_DEBUG_LOG"
fi

printf '%s\n' "[environment summary]" \
  "  PORT=${PORT:-}" \
  "  DB_HOST=${DB_HOST:-}" \
  "  ALLOWED_ORIGINS=${ALLOWED_ORIGINS:-*}" \
  "  DEBUG_MODE=${DEBUG_MODE:-false}" \
  "  DEBUG_LOG_PATH=${DEBUG_LOG_PATH:-unset}"

echo "Ensuring local directories exist..."
install -d -m 755 "$SERVER_DIR"
install -d -m 755 "$LOG_DIR"

echo "Installing server dependencies..."
(
  cd "$SERVER_DIR"
  npm install --production --no-audit --no-fund
)

stop_existing() {
  if [[ -f "$PID_FILE" ]]; then
    local pid
    pid="$(cat "$PID_FILE")"
    if [[ -n "$pid" ]] && kill -0 "$pid" 2>/dev/null; then
      echo "Stopping running server process ($pid)..."
      kill "$pid" 2>/dev/null || true
      sleep 1
      if kill -0 "$pid" 2>/dev/null; then
        kill -9 "$pid" 2>/dev/null || true
      fi
    fi
    rm -f "$PID_FILE"
  fi
}

echo "Stopping any previous instance..."
stop_existing

echo "Starting server directly from $SERVER_DIR"
export CHAT_SERVER_ENV_FILE="$ENV_FILE"
export NODE_ENV="${NODE_ENV:-production}"
export DEBUG_MODE="${DEBUG_MODE:-false}"
export DEBUG_LOG_PATH="$DEBUG_LOG_PATH"

(
  cd "$SERVER_DIR"
  nohup npm run start >> "$LOG_FILE" 2>&1 &
  echo $! > "$PID_FILE"
)

cat <<EOF
Chat server is running from $SERVER_DIR
  - PID: $(cat "$PID_FILE")
  - App log: $LOG_FILE
  - Debug log: $DEBUG_LOG_PATH
  - Env file: $ENV_FILE
Stop the server with: kill \$(cat "$PID_FILE")
EOF

#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SERVER_DIR="$SCRIPT_DIR/server"
LOG_DIR="$SCRIPT_DIR/logs"
PID_FILE="$SERVER_DIR/local-debug.pid"
ENV_SRC="$SCRIPT_DIR/.env.prod"
ENV_DEST="$SERVER_DIR/.env"
LOCAL_PORT="${LOCAL_PORT:-4450}"
DEBUG_LOG_PATH="${DEBUG_LOG_PATH:-$SCRIPT_DIR/debug.log}"

if [[ ! -f "$ENV_SRC" ]]; then
  echo "Error: $ENV_SRC not found. Create .env.prod first." >&2
  exit 1
fi

echo "Preparing local debug environment..."
install -d -m 755 "$SERVER_DIR"
install -d -m 755 "$LOG_DIR"
cp "$ENV_SRC" "$ENV_DEST"

stop_local() {
  if [[ -f "$PID_FILE" ]]; then
    local pid
    pid="$(cat "$PID_FILE")"
    if [[ -n "$pid" ]]; then
      echo "Stopping previous local debug server ($pid)..."
      kill "$pid" 2>/dev/null || true
      sleep 1
    fi
    rm -f "$PID_FILE"
  fi
}

stop_local

echo "Installing server dependencies (local)..."
(
  cd "$SERVER_DIR"
  npm install --production --no-audit --no-fund
)

export DEBUG_MODE=true
export DEBUG_LOG_PATH="$DEBUG_LOG_PATH"
export NODE_ENV=production
export PORT="$LOCAL_PORT"

LOG_FILE="$LOG_DIR/local-debug.log"
echo "Starting local debug server on port $LOCAL_PORT"
(
  cd "$SERVER_DIR"
  nohup npm run start >> "$LOG_FILE" 2>&1 &
  echo $! > "$PID_FILE"
) 

echo "Local server running (PID $(cat "$PID_FILE"))."
echo "App log: $LOG_FILE"
echo "Debug log: $DEBUG_LOG_PATH"
echo "Stop with: kill \$(cat \"$PID_FILE\")"

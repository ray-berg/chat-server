#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TARGET_DIR="/opt/chat-server"
SERVER_DIR="$TARGET_DIR/server"
LOG_DIR="$TARGET_DIR/logs"
PID_FILE="$SERVER_DIR/chat-server.pid"

if [[ -f "$SCRIPT_DIR/.env.prod" ]]; then
  ENV_SRC="$SCRIPT_DIR/.env.prod"
elif [[ -f "$SCRIPT_DIR/env.prod" ]]; then
  ENV_SRC="$SCRIPT_DIR/env.prod"
else
  echo "Error: .env.prod (or env.prod) not found in $SCRIPT_DIR" >&2
  exit 1
fi
ENV_DEST="$SERVER_DIR/.env"

DEFAULT_OWNER="root"
DEFAULT_GROUP="root"
if [[ -n "${CHAT_SERVER_OWNER:-}" ]]; then
  DEFAULT_OWNER="$CHAT_SERVER_OWNER"
elif [[ -n "${SUDO_USER:-}" && "${SUDO_USER}" != "root" ]]; then
  DEFAULT_OWNER="$SUDO_USER"
fi

if [[ -n "${CHAT_SERVER_GROUP:-}" ]]; then
  DEFAULT_GROUP="$CHAT_SERVER_GROUP"
elif [[ -n "${SUDO_USER:-}" && "${SUDO_USER}" != "root" ]]; then
  DEFAULT_GROUP="$(id -gn "$SUDO_USER")"
fi

OWNER="$DEFAULT_OWNER"
GROUP="$DEFAULT_GROUP"

usage() {
  cat <<EOF
Usage: ./deploy_latest.sh [--owner user] [--group group]

Deploys the current repository to ${TARGET_DIR}, copies the production
environment file, installs dependencies, and starts the chat server
as a background process. Defaults for owner/group may be overridden
with CHAT_SERVER_OWNER/CHAT_SERVER_GROUP or the flags above.
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --owner=*)
      OWNER="${1#*=}"
      ;;
    --group=*)
      GROUP="${1#*=}"
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown option: $1" >&2
      usage
      exit 1
      ;;
  esac
  shift
done

if ! command -v npm >/dev/null 2>&1; then
  echo "Error: npm must be installed to continue." >&2
  exit 1
fi

if [[ $EUID -ne 0 ]]; then
  if ! command -v sudo >/dev/null 2>&1; then
    echo "Error: run as root or install sudo for privileged operations." >&2
    exit 1
  fi
  SUDO_CMD="sudo"
else
  SUDO_CMD=""
fi

run_root() {
  if [[ -n "$SUDO_CMD" ]]; then
    "$SUDO_CMD" "$@"
  else
    "$@"
  fi
}

run_as_owner() {
  if [[ "$OWNER" == "$(id -un)" && -z "${SUDO_CMD:-}" ]]; then
    "$@"
    return
  fi
  if [[ $EUID -eq 0 ]]; then
    if command -v runuser >/dev/null 2>&1; then
      runuser -u "$OWNER" -- "$@"
    else
      local cmd
      printf -v cmd '%q ' "$@"
      su - "$OWNER" -c "$cmd"
    fi
  else
    "$SUDO_CMD" -u "$OWNER" "$@"
  fi
}

if command -v git >/dev/null 2>&1; then
  if [[ -n "$(cd "$SCRIPT_DIR" && git status --short --untracked-files=no)" ]]; then
    echo "Error: repository has uncommitted changes. Commit/stash before deploying." >&2
    exit 1
  fi
else
  echo "Warning: git not available; cannot verify clean worktree."
fi

echo "Syncing repository to ${TARGET_DIR}..."
bash "$SCRIPT_DIR/deploy.sh" --owner="$OWNER" --group="$GROUP"

echo "Installing production environment file..."
run_root install -d -m 750 "$TARGET_DIR/server"
run_root install -m 600 "$ENV_SRC" "$ENV_DEST"
run_root chown "$OWNER:$GROUP" "$ENV_DEST"

echo "Ensuring log directory exists..."
run_root install -d -m 755 "$LOG_DIR"
run_root chown -R "$OWNER:$GROUP" "$LOG_DIR"

echo "Installing server dependencies..."
run_as_owner bash -c "cd '$SERVER_DIR' && npm install --production --no-audit --no-fund"

stop_existing() {
  if [[ -f "$PID_FILE" ]]; then
    local pid
    pid="$(cat "$PID_FILE")"
    if [[ -n "$pid" ]]; then
      echo "Stopping existing chat server process ($pid)..."
      run_root kill "$pid" 2>/dev/null || true
      sleep 2
      if run_root kill -0 "$pid" 2>/dev/null; then
        run_root kill -9 "$pid" 2>/dev/null || true
      fi
    fi
    run_root rm -f "$PID_FILE"
  fi
}

stop_existing

LOG_FILE="$LOG_DIR/chat-server.log"
echo "Starting chat server (logs: $LOG_FILE)..."
run_as_owner bash -c "cd '$SERVER_DIR' && nohup npm run start >> '$LOG_FILE' 2>&1 & echo \$! > '$PID_FILE'"

PID="$(run_root cat "$PID_FILE")"
echo "Chat server deployed and running in background (PID $PID)."

HEALTH_URL="${CHAT_SERVER_HEALTH_URL:-https://localhost:4433/health}"
if command -v curl >/dev/null 2>&1; then
  echo "Waiting for health check at $HEALTH_URL ..."
  for attempt in {1..10}; do
    if curl -sk --max-time 5 "$HEALTH_URL" >/dev/null 2>&1; then
      echo "Health check succeeded."
      break
    fi
    if [[ $attempt -eq 10 ]]; then
      echo "Warning: health check did not respond after $attempt attempts." >&2
    else
      sleep 2
    fi
  done
else
  echo "curl not available; skipping health verification."
fi

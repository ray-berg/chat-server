#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TARGET_DIR="/opt/chat-server"

if [[ -n "${CHAT_SERVER_OWNER:-}" ]]; then
  DEFAULT_OWNER="$CHAT_SERVER_OWNER"
elif [[ -n "${SUDO_USER:-}" ]]; then
  DEFAULT_OWNER="$SUDO_USER"
else
  DEFAULT_OWNER="root"
fi

if [[ -n "${CHAT_SERVER_GROUP:-}" ]]; then
  DEFAULT_GROUP="$CHAT_SERVER_GROUP"
elif [[ -n "${SUDO_USER:-}" ]]; then
  DEFAULT_GROUP="$(id -gn "$SUDO_USER")"
else
  DEFAULT_GROUP="root"
fi

OWNER="$DEFAULT_OWNER"
GROUP="$DEFAULT_GROUP"

usage() {
  cat <<EOF
Usage: ./deploy.sh [--owner user] [--group group]

Copies the current working tree to ${TARGET_DIR} and locks down permissions.
Defaults can be overridden with the CHAT_SERVER_OWNER / CHAT_SERVER_GROUP
environment variables or the flags above.
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

if ! command -v rsync >/dev/null 2>&1; then
  echo "Error: rsync is required for deployment." >&2
  exit 1
fi

SUDO_CMD=""
if [[ $EUID -ne 0 ]]; then
  if command -v sudo >/dev/null 2>&1; then
    SUDO_CMD="sudo"
  else
    echo "Error: Run as root or install sudo for permission elevation." >&2
    exit 1
  fi
fi

run() {
  if [[ -n "$SUDO_CMD" ]]; then
    "$SUDO_CMD" "$@"
  else
    "$@"
  fi
}

echo "Deploying chat server to ${TARGET_DIR}"
run install -d -m 755 "$TARGET_DIR"

RSYNC_FLAGS=(-rlptD --delete)
RSYNC_EXCLUDES=(
  --exclude '.git/'
  --exclude 'server/.env'
  --exclude 'server/certs/'
  --exclude 'server/uploads/'
  --exclude 'chat-server.tar.gz'
)

run rsync "${RSYNC_FLAGS[@]}" "${RSYNC_EXCLUDES[@]}" "$SCRIPT_DIR/" "$TARGET_DIR/"

run chown -R "${OWNER}:${GROUP}" "$TARGET_DIR"
run chmod 755 "$TARGET_DIR"
if [[ -d "$TARGET_DIR/server" ]]; then
  run chmod 750 "$TARGET_DIR/server"
fi
if [[ -f "$TARGET_DIR/server/.env" ]]; then
  run chmod 600 "$TARGET_DIR/server/.env"
fi
if [[ -d "$TARGET_DIR/server/certs" ]]; then
  run chmod 700 "$TARGET_DIR/server/certs"
fi

echo "Deployment complete. Service files are available at $TARGET_DIR."

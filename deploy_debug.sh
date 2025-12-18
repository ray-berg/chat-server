#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BASE_DEPLOY="$SCRIPT_DIR/deploy_latest.sh"
TARGET_DIR="/opt/chat-server"

if [[ ! -x "$BASE_DEPLOY" ]]; then
  echo "Error: deploy_latest.sh not found or not executable at $BASE_DEPLOY" >&2
  exit 1
fi

if [[ -f "$SCRIPT_DIR/.env.prod" ]]; then
  ENV_SRC="$SCRIPT_DIR/.env.prod"
elif [[ -f "$SCRIPT_DIR/env.prod" ]]; then
  ENV_SRC="$SCRIPT_DIR/env.prod"
else
  echo "Error: .env.prod (or env.prod) not found in $SCRIPT_DIR" >&2
  exit 1
fi

if [[ ! -r "$ENV_SRC" ]]; then
  echo "Error: Unable to read environment file at $ENV_SRC" >&2
  exit 1
fi

echo "Validating production environment file: $ENV_SRC"

set -a
source "$ENV_SRC"
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
  ALLOWED_ORIGINS
  DEBUG_MODE
  DEBUG_LOG_PATH
)

MISSING=()
for var in "${REQUIRED_VARS[@]}"; do
  value="${!var:-}"
  if [[ -z "$value" ]]; then
    MISSING+=("$var")
  fi
done

if [[ ${#MISSING[@]} -gt 0 ]]; then
  echo "Error: The following required environment variables are missing or empty:"
  for var in "${MISSING[@]}"; do
    echo "  - $var"
  done
  exit 1
fi

echo "Base environment variables detected."

if [[ "${DEBUG_MODE,,}" == "true" ]]; then
  if [[ -z "${DEBUG_LOG_PATH:-}" ]]; then
    echo "Error: DEBUG_MODE is true but DEBUG_LOG_PATH is not set." >&2
    exit 1
  fi
  LOG_PARENT="$(dirname "$DEBUG_LOG_PATH")"
  echo "Ensuring debug log directory exists at $LOG_PARENT"
  install -d -m 750 "$LOG_PARENT"
else
  echo "Debug logging is disabled (DEBUG_MODE=$DEBUG_MODE)"
fi

echo "Environment validation complete. Proceeding with deployment to $TARGET_DIR..."

exec "$BASE_DEPLOY" "$@"

#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$SCRIPT_DIR"
SERVER_DIR="$PROJECT_ROOT/server"
TARGET_ENV="$SERVER_DIR/.env"
PROD_ENV="/opt/chat-server/server/.env"
CERT_DIR="$SERVER_DIR/certs"
DEFAULT_KEY_PATH="$CERT_DIR/server.key"
DEFAULT_CERT_PATH="$CERT_DIR/server.crt"

if [[ ! -d "$SERVER_DIR" ]]; then
  echo "Error: could not locate server directory at $SERVER_DIR" >&2
  exit 1
fi

if [[ -f "$SCRIPT_DIR/env.prod" ]]; then
  echo "env.prod detected in $SCRIPT_DIR."
  echo "Copying env.prod to $PROD_ENV ..."
  sudo install -d -m 750 "$(dirname "$PROD_ENV")"
  sudo install -m 600 "$SCRIPT_DIR/env.prod" "$PROD_ENV"
  echo "Production .env installed at $PROD_ENV"
  exit 0
fi

if [[ -f "$TARGET_ENV" ]]; then
  echo "Existing environment file detected at $TARGET_ENV. Reusing stored values as defaults."
  set +u
  # shellcheck disable=SC1091
  source "$TARGET_ENV"
  set -u
fi

prompt() {
  local label="$1"
  local default="$2"
  local var
  read -r -p "$label [$default]: " var
  if [[ -z "$var" ]]; then
    var="$default"
  fi
  printf '%s' "$var"
}

random_secret() {
  if command -v openssl >/dev/null 2>&1; then
    openssl rand -hex 32
  else
    uuidgen | tr -d '-'
  fi
}

echo "Interactive environment setup"
echo "Press Enter to accept defaults."

PORT="$(prompt "HTTP/HTTPS port" "${PORT:-4433}")"
DB_HOST="$(prompt "Database host" "${DB_HOST:-127.0.0.1}")"
DB_PORT="$(prompt "Database port" "${DB_PORT:-3306}")"
DB_USER="$(prompt "Database user" "${DB_USER:-chat_app}")"
DB_PASSWORD="$(prompt "Database password" "${DB_PASSWORD:-changeme}")"
DB_NAME="$(prompt "Database name" "${DB_NAME:-chat_app}")"
ALLOWED_ORIGINS_DEFAULT="${ALLOWED_ORIGINS:-http://localhost:3000,http://localhost:4000,https://localhost}"
ALLOWED_ORIGINS="$(prompt "Allowed origins (comma separated)" "$ALLOWED_ORIGINS_DEFAULT")"

if [[ -n "${JWT_SECRET:-}" ]]; then
  JWT_DEFAULT="$JWT_SECRET"
else
  JWT_DEFAULT="$(random_secret)"
fi
JWT_SECRET="$(prompt "JWT secret" "$JWT_DEFAULT")"

ADMIN_USER="$(prompt "Admin username" "${ADMIN_USER:-admin}")"
ADMIN_PASSWORD="$(prompt "Admin password" "${ADMIN_PASSWORD:-ChangeMe!23}")"

SSL_KEY_PATH_VALUE="${SSL_KEY_PATH:-$DEFAULT_KEY_PATH}"
SSL_CERT_PATH_VALUE="${SSL_CERT_PATH:-$DEFAULT_CERT_PATH}"
SSL_CN_DEFAULT="${SSL_COMMON_NAME:-chat.local}"
SSL_PRECONFIGURED=false
if [[ "${SSL_ENABLED:-true}" == "false" ]]; then
  SSL_PRECONFIGURED=true
  echo "SSL disabled via configuration; skipping certificate prompts."
elif [[ -f "$SSL_KEY_PATH_VALUE" && -f "$SSL_CERT_PATH_VALUE" ]]; then
  SSL_PRECONFIGURED=true
  echo "Existing TLS material detected at $SSL_KEY_PATH_VALUE and $SSL_CERT_PATH_VALUE. Skipping certificate generation."
fi

if [[ "$SSL_PRECONFIGURED" == true ]]; then
  SSL_CN="$SSL_CN_DEFAULT"
else
  SSL_CN="$(prompt "SSL common name" "$SSL_CN_DEFAULT")"
  mkdir -p "$(dirname "$SSL_KEY_PATH_VALUE")"
  mkdir -p "$(dirname "$SSL_CERT_PATH_VALUE")"
  echo "Generating self-signed TLS certificate..."
  openssl req -x509 -nodes -newkey rsa:2048 -days 825 \
    -subj "/CN=$SSL_CN" \
    -keyout "$SSL_KEY_PATH_VALUE" \
    -out "$SSL_CERT_PATH_VALUE" >/dev/null 2>&1
  chmod 600 "$SSL_KEY_PATH_VALUE"
fi

cat >"$TARGET_ENV" <<EOF
PORT=$PORT
JWT_SECRET=$JWT_SECRET
ADMIN_USER=$ADMIN_USER
ADMIN_PASSWORD=$ADMIN_PASSWORD
DB_HOST=$DB_HOST
DB_PORT=$DB_PORT
DB_USER=$DB_USER
DB_PASSWORD=$DB_PASSWORD
DB_NAME=$DB_NAME
DB_CONN_LIMIT=10
ALLOWED_ORIGINS=$ALLOWED_ORIGINS
SSL_ENABLED=true
SSL_KEY_PATH=$SSL_KEY_PATH_VALUE
SSL_CERT_PATH=$SSL_CERT_PATH_VALUE
SSL_COMMON_NAME=$SSL_CN
EOF

echo ".env created at $TARGET_ENV"
echo "TLS key: $SSL_KEY_PATH_VALUE"
echo "TLS cert: $SSL_CERT_PATH_VALUE"
echo "Setup complete."

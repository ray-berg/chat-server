# Secure Chat Server

Modern messaging stack with role-aware administration, REST + WebSocket APIs, and a bundled web wrapper client for manual testing.

## Features

- JWT auth + hashed credentials for user accounts and direct messaging.
- Realtime delivery over WebSockets plus REST APIs for external integrations.
- Administration endpoints & UI for user provisioning (create/delete/reset passwords) and auditing.
- Rich user profiles with avatars, presence indicators, bios, birthdays, and self-service password resets.
- Manager designation with approval tokens so bots can request access and receive a 32-character secret via the approval workflow.
- Channel moderator role with limited powers (disable accounts, reset passwords, review stats) plus visual badges across the UI.
- Peer approval workflow so one user can request authorization from another (ask + approve/deny).
- MariaDB-backed persistence (no more JSON files) for production-ready storage.
- Markdown support in messages with full GFM rendering (code blocks, tables, lists, etc.).

## Security

The server implements authentication security best practices:

### Password Policy

All passwords must meet these requirements:
- Minimum 8 characters
- At least one uppercase letter
- At least one lowercase letter
- At least one number
- At least one special character (`!@#$%^&*()` etc.)
- Not in the common password blacklist

### Account Lockout

Failed login attempts are tracked per username:
- **5 failed attempts** triggers a temporary lockout
- **15 minute** lockout duration
- Lockout clears automatically after the timeout
- Successful login resets the failure counter

### Token Security

- **JWT_SECRET required in production** - server refuses to start without it
- Default token lifetime: **2 hours** (configurable via `JWT_EXPIRES_IN`)
- Logout endpoint (`POST /api/auth/logout`) blacklists tokens server-side
- Blacklisted tokens are rejected immediately
- Bcrypt with **12 rounds** for password hashing

### Rate Limiting

- Login: 10 requests per minute per IP
- Registration: 5 requests per minute per IP

### Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `JWT_SECRET` | **Production** | `local-dev-secret` | Secret for signing JWTs. Must be set in production. |
| `JWT_EXPIRES_IN` | No | `2h` | Token expiration time (e.g., `2h`, `1d`) |
| `ADMIN_PASSWORD` | No | `ChangeMe!23` | Initial admin password (must meet complexity requirements) |

## Getting Started

```bash
cd server
cp .env.example .env   # adjust secrets in production
npm install            # installs server dependencies
npm run start
```

### HTTPS / TLS

The server listens over HTTPS by default. Provide your own certificate by setting `SSL_KEY_PATH`, `SSL_CERT_PATH`, and (optionally) `SSL_CA_PATH` in `server/.env`. If those aren’t supplied, the process generates an ephemeral self-signed certificate at startup using the hostname in `SSL_COMMON_NAME` (defaults to `localhost`). To disable TLS entirely (not recommended for production), set `SSL_ENABLED=false`.

### Allowed Origins / CORS

Lock down cross-origin calls by setting `ALLOWED_ORIGINS` (comma-separated list). By default, local development URLs are allowed. You can set `ALLOWED_ORIGINS=*` to temporarily allow everything—helpful while gathering telemetry—but make sure to tighten this once you know the domains you actually need. When `*` is present, the server logs every request origin to help you audit usage.

### Bootstrap script

Run `./setup.sh` from the repo root to interactively create `server/.env` and generate a self-signed TLS certificate stored under `server/certs/`. If you already maintain a hardened environment file, place it next to the script as `env.prod`; the script will copy it straight to `/opt/chat-server/server/.env` and skip the prompts.
Re-running the script will reuse any existing TLS key/cert paths defined in `server/.env`, so previously configured SSL material is left intact.

### Deploying to `/opt/chat-server`

Deployments on host `chat` run from `/opt/chat-server`. Use `./deploy.sh` to rsync the current working tree into that directory (preserving `server/.env` and `server/certs/`) and adjust file ownership. By default, ownership is assigned to `root:root`, but you can provide a different account via `--owner` / `--group` or the `CHAT_SERVER_OWNER` and `CHAT_SERVER_GROUP` environment variables.

For a one-shot deployment that also copies `.env.prod`, runs `npm install --production`, and starts the API/background worker, run `./deploy_latest.sh`. It accepts the same owner/group overrides, writes logs to `/opt/chat-server/logs/chat-server.log`, and maintains a PID file under `/opt/chat-server/server/chat-server.pid`.

### Running directly from this repo (home-directory packaging)

When you want to run the service straight from your checked-out workspace without copying files into `/opt`, use `./deploy_home.sh`. The script:

- Picks the first environment file it finds (`.env.prod`, `.env`, or `server/.env`), validates required variables, and exports it through `CHAT_SERVER_ENV_FILE` so the server reports the exact config it loaded.
- Installs production dependencies in `server/`, ensures `logs/` exists under the repo, and stops any previously launched background copy (tracked via `logs/chat-server-home.pid`).
- Starts `npm run start` from the repo and tails into `logs/chat-server-home.log`, while the app itself still writes to the `DEBUG_LOG_PATH` defined in your env file (defaults to `logs/debug.log`).

After launching, the script prints a short configuration summary plus the log paths so you can immediately `tail -f` the right files. To stop the instance, run `kill $(cat logs/chat-server-home.pid)`.

### Database setup

Create a MariaDB instance (local or remote) and provision the schema credentials that match `.env`. Example using Docker:

```bash
docker run -d \
  --name chat-mariadb \
  -e MARIADB_USER=chat_app \
  -e MARIADB_PASSWORD=changeme \
  -e MARIADB_DATABASE=chat_app \
  -e MARIADB_ROOT_PASSWORD='m&u*St68' \
  -p 3307:3306 \
  mariadb:11
```

Then update `server/.env`:

```
DB_HOST=localhost
DB_PORT=3307
DB_USER=chat_app
DB_PASSWORD='StrongRandomPasswordHere'
DB_NAME=chat_app
```

The server automatically creates the tables (users, conversations, messages, approvals, etc.) and seeds the default admin on first launch.

The HTTP server defaults to `https://localhost:4433`. It also serves the `client/` SPA wrapper so you can log in, start direct messages, and exercise the admin UI without writing a custom client.

Default seeded admin:

- Username: `admin`
- Password: value from `ADMIN_PASSWORD` (`ChangeMe!23` by default)

## API Surface

- `POST /api/auth/register` – create a user account.
- `POST /api/auth/login` – exchange credentials for a JWT.
- `POST /api/auth/logout` – invalidate current token (requires auth).
- `GET /api/auth/me` – fetch current profile.
- `GET /api/conversations` – list joined threads.
- `POST /api/conversations/direct` – open/find a DM with another user.
- `GET/POST /api/conversations/:id/messages` – pull/send chat payloads.
- `GET /api/users` – lightweight lookup for DM bootstrapping.
- `GET /api/approvals?direction=incoming|outgoing|all` – fetch approval requests relevant to the authenticated user.
- `POST /api/approvals` – request approval from another user.
- `POST /api/approvals/:id/respond` – approve or deny a pending request (target user only).
- `GET/POST /ws` – WebSocket endpoint for realtime synchronization.
- Admin only:
  - `GET /api/admin/stats`
  - `GET /api/admin/users`
  - `POST /api/admin/users`
  - `PATCH /api/admin/users/:id`
  - `POST /api/admin/users/:id/reset-password`
  - `DELETE /api/admin/users/:id`

> Moderators have access to `/api/admin/users` + `/api/admin/stats`, can toggle user status, and reset non-admin passwords. Only full admins can create/delete accounts or promote/demote roles.

Clients that prefer HTTP can stick to the REST endpoints; the socket layer simply mirrors state updates in realtime.

## Web Wrapper Client

The SPA (`client/app.js`) consumes the same API as external clients:

- Handles login/registration flows.
- Presents a DM search box and conversation list.
- Streams live updates via WebSocket.
- Adds an approval center so you can send/answer peer approval requests inline.
- Exposes admin-only controls for provisioning, password resets, status changes, and platform stats.
- Highlights moderator/admin roles directly within the chat experience so privileged users stand out.
- Provides a dedicated profile page so every user can manage their avatar, bio, birthday, theme, and password.
- Shows live presence indicators for everyone in conversations and the user directory, plus a footer shortcut to the admin console for administrators.
- Managers gain a token input, and approving a request automatically sends that 32-character token back to the requester via DM.

Use it as a reference implementation when writing native or mobile front ends.

## Admin Console

Administrators and moderators can open `/admin.html` (or click the “Admin Console” link that appears in the lower-right corner once signed in) to review stats, provision accounts, reset passwords, and manage roles outside of the chat surface. The console reuses the browser’s existing session token, so make sure you’ve authenticated in the main client before launching it.

## Approval Workflow

Any authenticated user can request the approval of another user. The requester sends a short note, the target receives a pending item, and can approve or deny directly from the client (or via the API). Both parties receive realtime updates via WebSocket events.

## Docker Image

The repo includes a single image that bundles the API server and static client.

```bash
docker build -t secure-chat .
docker run -p 4433:4433 \
  -e JWT_SECRET=change-this \
  -e ADMIN_PASSWORD=Sup3rSecret! \
  -e DB_HOST=your-db-host \
  -e DB_PORT=3306 \
  -e DB_USER=chat_app \
  -e DB_PASSWORD=changeme \
  -e DB_NAME=chat_app \
  -e SSL_ENABLED=true \
  -e SSL_COMMON_NAME=chat.example.com \
  -e ALLOWED_ORIGINS=* \
  secure-chat
```

Point `DB_HOST` at a running MariaDB instance (local or managed). You can run MariaDB next to this container (e.g., another `docker run` or `docker compose`) as shown in the database section.

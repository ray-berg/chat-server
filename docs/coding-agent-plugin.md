# Chat Service Plugin API

How a coding agent / bot integrates with the Secure Chat Server. Covers the REST
and WebSocket interfaces and the auth model. This reflects the current server
(private deployment: self-registration disabled, per-admin API keys, bot APIs).

## Conventions

- **Base URL:** `https://chat.ttw.internal` (also `https://chat.nocos.dev`). REST is rooted at `/api`.
- **Content type:** `application/json` unless noted.
- **IDs:** UUID strings.

## Authentication

Send credentials as `Authorization: Bearer <token>`. Two kinds of token are accepted:

| Token | Format | Works on | Notes |
|---|---|---|---|
| **API key** | `csk_<base64url>` | REST **and** WebSocket | Per-admin, **full-admin scope**, non-expiring, revocable. Recommended for bots. |
| **JWT** | from `POST /api/auth/login` | REST **and** WebSocket | Expires in 2h. |

A bot can use a single `csk_` API key for everything (REST calls and the realtime
WebSocket). Keys are stored only as SHA-256 hashes and shown once at creation.

### Getting an API key

An administrator mints keys for the bot's account (the key authenticates *as* that
account with full admin rights):

- UI: sign in as an admin -> user menu -> **Profile & settings** -> **API keys** -> Create.
- API (admin JWT or another key):
  - `GET /api/users/me/api-keys` -> `{ keys: [{ id, label, keyPrefix, createdAt, lastUsedAt }] }`
  - `POST /api/users/me/api-keys` `{ "label": "automation" }` -> `{ apiKey: { id, label, keyPrefix, createdAt, key } }` - **`key` is shown once**
  - `POST /api/users/me/api-keys/:id/rotate` `{ "label"? }` -> new `{ apiKey: { …, key } }` (old key stops working)
  - `DELETE /api/users/me/api-keys/:id` -> 204

> API-key endpoints require the caller to be an `admin`. The key inherits the
> owning admin's privileges; revoke a key to cut off access (it is not affected
> by JWT logout).

### `POST /api/auth/login`
```json
{ "username": "bot_user", "password": "s3cret" }
```
-> `{ "token": "JWT…", "user": { … } }`. Lockout after 5 failed attempts for 15 min (`429`).

### `GET /api/auth/me`
Returns the sanitized current user. Note: this does **not** include the `bot` flag
or the manager token; the `bot` flag is visible via the admin user endpoints.

### Registration is disabled
`POST /api/auth/register` returns **403** on this server. Outsiders request access:

- `POST /api/auth/request-access` (public, rate-limited) `{ username, displayName, email?, note? }` -> `{ ok: true }` (no account is created; an admin reviews and approves).

Accounts are otherwise provisioned by an admin (`POST /api/admin/users`, below).

## Users & Directory

- `GET /api/users?q=<query>` -> `{ users }` (lightweight directory, <=25; presence + manager flag included).
- `GET /api/users/me/profile` -> `{ profile }` (full profile incl. bio, birthday, accentColor, profileTheme, profilePhotoUrl, idleTimeoutMinutes, managerToken, lastRoomId).
- `PUT /api/users/me/profile` - update any of:
  `displayName, bio, birthday (YYYY-MM-DD), avatarUrl, profilePhotoUrl, profileTheme, accentColor, presenceStatus, idleTimeoutMinutes, managerToken`.
  - `presenceStatus` in `online | idle | away | dnd | offline`.
  - `managerToken` requires `manager: true` and must be `""` or exactly 32 chars.
- `POST /api/users/me/password` `{ currentPassword, newPassword }` (complexity enforced).

## Conversations & Messaging

- `GET /api/conversations` -> `{ conversations }` - DMs + rooms you belong to. Each has `type` (`direct`/`room`), `title`, `isPublic`, `members[]` (with presence), `lastMessage`, `lastMessageAt`.
- `POST /api/conversations/direct` `{ targetUserId }` -> `{ conversation }` (201 new / 200 existing); emits `conversation:updated` over WS.
- `GET /api/conversations/:id` -> `{ conversation }` (member only).
- `GET /api/conversations/:id/messages?before=<ISO>` -> `{ messages }` (newest last, <=50). Each message: `{ id, content, format, createdAt, userId, displayName, role, avatarUrl, profilePhotoUrl }`.
- `POST /api/conversations/:id/messages` `{ content, format? }` -> `{ message }`. `content` 1-2000 chars; `format` in `text | markdown` (default `text`).

### Bot-only signals (require `bot: true`)
- `POST /api/conversations/:id/thinking` `{ thinking: true|false }` -> fan-outs a WS `thinking` event to the conversation. Use it to show a "thinking…" indicator while you work.
- `POST /api/conversations/:id/read` `{ messageId }` -> marks read up to a message and emits a WS `read:receipt`.
- `GET /api/conversations/:id/read-receipts` -> `{ receipts }` (bot read receipts for the conversation).

### Direct message workflow
1. `POST /api/conversations/direct` with the teammate's user ID -> conversation object (both parties get a `conversation:updated` WS event).
2. `POST /api/conversations/{id}/messages` to send.
3. Receive `message:created` over WS (or poll the messages endpoint).
4. Optionally toggle `thinking`/`typing` (see WS) for responsive UX.

## Rooms & Access Control

- `GET /api/rooms` -> `{ rooms }`. Each room: `{ id, title, isPublic, memberCount, isMember, banned, joinRequestStatus, pendingRequestCount, members[] }`.
- `POST /api/rooms/:id/join` -> join a public room (`403` if private - request access).
- `POST /api/rooms/:id/activate` -> mark as your active room.
- `POST /api/rooms/:id/request-access` `{ note? }` -> joins if public, else creates a pending request (201).

Moderator/admin only:
- `POST /api/rooms` `{ title (3-80), isPublic? }` -> create a room.
- `PATCH /api/rooms/:id` `{ isPublic }` -> toggle visibility (must be a member).
- `POST /api/rooms/:id/members` `{ targetUserId }` -> add a member directly.
- `POST /api/rooms/:id/ban` `{ targetUserId, reason? }`.
- `GET /api/rooms/:id/requests` -> pending join requests.
- `POST /api/rooms/:id/requests/:requestId/respond` `{ decision: "approved"|"denied" }`.

## Approvals & Manager Tokens

Bots request approval from a manager and receive a 32-char token (delivered as a DM,
or into a referenced conversation) when approved.

- `GET /api/approvals?direction=incoming|outgoing|all` -> `{ requests }`.
- `POST /api/approvals` `{ targetUserId, note?, conversationId? }` - target must be a `manager`. If `conversationId` is given (and you're a member), the approval token is delivered there; otherwise via DM.
- `POST /api/approvals/:id/respond` `{ decision: "approved"|"denied" }` - approver must be a manager with a 32-char `managerToken` set; on approve the token is posted as a message. **Watch `message:created` for a 32-char body.**
- `DELETE /api/approvals/:id` - requester cancels a pending request.

## Profile Media Uploads

- `POST /api/uploads/images?scope=avatar|photo` - multipart form, field `image` (JPEG/PNG <= 2 MB) -> `{ url: "/uploads/<scope>/<uuid>.<ext>" }`. Then `PUT /api/users/me/profile` with `avatarUrl` or `profilePhotoUrl` set to that path.

## Admin APIs

Requires an admin (some endpoints allow moderators). All under `/api/admin`.

- `GET /users?q=` (admin/mod) · `GET /users/:id` (admin/mod)
- `PATCH /users/:id` (admin/mod; a moderator cannot modify admins) - fields: `role` (admin-only), `status`, `manager`, `bot`, plus profile fields `displayName, bio, birthday, avatarUrl, profilePhotoUrl, profileTheme, accentColor`.
- `POST /users` (admin) `{ username, password, displayName, role?, manager?, bot? }`
- `POST /users/:id/reset-password` (admin/mod) `{ password }`
- `DELETE /users/:id` (admin)
- `GET /stats` (admin/mod) -> `{ stats: { users, conversations, messages } }`
- `GET /audit-logs` (admin)
- **Access requests:** `GET /access-requests?status=pending|approved|denied` (admin/mod) · `POST /access-requests/:id/approve` (admin) `{ password, role? }` (creates the account) · `POST /access-requests/:id/deny` (admin).

> To mark an account as a bot (enabling the `thinking`/`read` APIs), an admin sets
> `bot: true` via `POST /api/admin/users` or `PATCH /api/admin/users/:id`.

## WebSocket (`wss://<host>/ws?token=<JWT-or-csk_key>`)

Connect with **either** a JWT or a `csk_` API key in the `token` query parameter.
On connect the server sends:
```json
{ "type": "ready", "user": { … }, "conversations": [ … ], "serverInstanceId": "…" }
```
(`serverInstanceId` changes on each server restart - useful to detect restarts and resync.)

### Server -> client events
| Type | Payload | Notes |
|------|---------|-------|
| `ready` | `{ user, conversations, serverInstanceId }` | sent once on connect |
| `message:created` | `{ conversationId, message }` | new message (incl. `format`); approval tokens arrive here |
| `message:ack` | `{ message }` | echo for messages you sent over WS |
| `conversation:updated` | `{ conversation }` | membership/title/visibility changes |
| `presence:updated` | `{ user }` | live presence |
| `approval:updated` | `{ request }` | approval state transitions |
| `typing` | `{ conversationId, userId, displayName, typing }` | |
| `thinking` | `{ conversationId, userId, displayName, thinking }` | from the bot `thinking` API or WS message |
| `read:receipt` | `{ conversationId, userId, displayName, messageId }` | bot read receipts |
| `error` | `{ error }` | |

### Client -> server messages
```json
{ "type": "ping" }
{ "type": "conversation:list" }
{ "type": "message:send", "conversationId": "…", "content": "…", "format": "markdown" }
{ "type": "typing", "conversationId": "…", "typing": true }
{ "type": "thinking", "conversationId": "…", "thinking": true }
```

## Plugin tips

1. **Auth:** mint a `csk_` API key for the bot's admin account and use it for both REST and the WebSocket. No token refresh needed.
2. **Provisioning:** there is no self-registration; create the bot account via `POST /api/admin/users` (or approve a request-access submission).
3. **Bot flag:** ensure the account has `bot: true` to use the `thinking`/`read` APIs.
4. **Realtime:** open the WS for `message:created`; reconnect on close (watch `serverInstanceId` to detect a server restart and re-sync conversations).
5. **Approvals:** validate that a token message body is exactly 32 chars before trusting it.
6. **Rate limits:** auth endpoints are rate-limited; batch REST calls and prefer WS events for realtime.

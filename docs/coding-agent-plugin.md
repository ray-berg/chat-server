# Chat Service Plugin API

This document explains how a coding agent can integrate with the Secure Chat Server. It focuses on the REST/WebSocket interfaces that agents commonly use when building plugins or bot workers.

## Conventions

- **Base URL:** `https://chat.ttw.internal` (replace with your deployment host/port). All REST requests are rooted at `/api`.
- **Authentication:** Bearer JWT obtained via `POST /api/auth/login`. Include `Authorization: Bearer <token>` on every authenticated call and in the `token` query string when connecting to WebSocket.
- **Content type:** `application/json` unless otherwise noted.
- **IDs:** UUID strings.

## Authentication

### `POST /api/auth/login`
Request:
```json
{ "username": "bot_user", "password": "s3cret" }
```
Response:
```json
{
  "token": "JWT...",
  "user": {
    "id": "...",
    "username": "...",
    "displayName": "...",
    "role": "user|moderator|admin",
    "manager": false,
    "presenceStatus": "online",
    "idleTimeoutMinutes": 5
  }
}
```

### `GET /api/auth/me`
Returns the sanitized user object for the current token. Use this to confirm privileges (e.g., `manager: true`).

## User + Directory APIs

### `GET /api/users?q=<query>`
Search for users (used for DM bootstrap). Results include presence status and whether the user is a manager.

### `GET /api/users/me/profile`
Full profile (bio, avatar, manager token if role permits). Use this to cache your own manager token when acting as a manager.

### `PUT /api/users/me/profile`
Update profile fields. Payload example:
```json
{
  "displayName": "Bot Operator",
  "profileTheme": "dark",
  "profilePhotoUrl": "/uploads/photos/abc123.png",
  "avatarUrl": "/uploads/avatars/def456.png",
  "presenceStatus": "dnd",
  "idleTimeoutMinutes": 15,
  "managerToken": "N008G0NN4G1V3UP50E4SYMYPR3Y!!ASS"
}
```
- `presenceStatus` accepts `online`, `idle`, `away`, `dnd`, or `offline`.
- `idleTimeoutMinutes` controls when the server automatically marks the user idle (min 1, max 240, defaults to 5).
- `managerToken` requires `manager: true` and must be either `""` or exactly 32 characters. Bots should never mutate tokens; they read them from managers via approvals.
- `profilePhotoUrl` and `avatarUrl` typically reference files uploaded via the `/api/uploads/images` endpoint documented below. Store the returned path (e.g., `/uploads/photos/...`) so every client can resolve it without extra auth hops.

### `POST /api/users/me/password`
Self-service password reset. Requires current password + new password (>= 8 chars).

## Conversations + Messaging

### `GET /api/conversations`
List all conversations for the token holder. Room conversations include an `isPublic` boolean so workers know if they can join directly, and `members` contains presence metadata for each participant.

### `POST /api/conversations/direct`
Create or fetch a direct chat with someone.
```json
{ "targetUserId": "uuid" }
```

### `GET /api/conversations/:id`
Fetch metadata for a conversation (title, members).

### `GET /api/conversations/:id/messages?before=<ISO>`
Pull historical messages, newest last.
- Message objects expose `format` so your client knows whether to treat `content` as plain text or markdown.

### `POST /api/conversations/:id/messages`
Send a message.
```json
{ "content": "Hello!", "format": "markdown" }
```
Limits: 1–2000 characters.
- `format` is optional (`"text"` default). Set it to `"markdown"` to opt into markdown rendering on all clients.
- Every message payload (REST/WebSocket) now includes the chosen `format` so consumers can render accordingly.

### Direct Message Workflow
1. **Create or fetch the thread:** Call `POST /api/conversations/direct` with the teammate’s user ID. The API responds with the conversation object (existing or newly created) and simultaneously emits a `conversation:updated` WebSocket payload to both parties so the UI sidebar reflects the DM.
2. **Send the first message:** Use `POST /api/conversations/{conversationId}/messages` with the returned `id`. The UI keeps an optimistic “Sending…” placeholder until the server responds, then marks the message as “Delivered” (or “Failed” if the request errors). Your client should mimic this behavior for a responsive UX.
3. **Receive updates:** Both participants receive `message:created` events over WebSocket. Include the token in the `wss://host/ws?token=JWT` connection so you can merge these events into the transcript immediately.
4. **Typing/thinking signals (optional):** Clients may send `{type:"typing", conversationId, typing:true|false}` to show “typing…” and `{type:"thinking", conversationId, thinking:true|false}` to show “thinking…”. The server fan-outs these signals to the rest of the conversation only when the caller belongs to that thread.
5. **UI hooks:** The SPA exposes a **+ DM** button in the Direct Messages panel that opens a searchable dialog backed by the same APIs. Plugin or bot clients can follow the steps above to replicate the workflow programmatically.

### Profile Media Uploads

Upload endpoints accept multipart form data and return a CDN-safe URL that you can store in the user profile.

#### `POST /api/uploads/images?scope=photo|avatar`
Payload: `FormData` with a single field named `image` (JPEG or PNG, ≤ 2 MB).

Response:
```json
{ "url": "/uploads/photos/uuid-filename.png" }
```

- `scope=photo` stores the image under `/uploads/photos`, while `scope=avatar` stores it under `/uploads/avatars`.
- After receiving the URL, call `PUT /api/users/me/profile` with `profilePhotoUrl` or `avatarUrl` set to that path. The SPA already strings these together so other users immediately see the updated photo via standard `resolveAvatar` logic.

## Rooms & Access Control

Rooms carry an `isPublic` flag plus join request metadata on `/api/rooms` responses:

```json
{
  "id": "room-uuid",
  "title": "Lobby",
  "isPublic": true,
  "memberCount": 12,
  "isMember": true,
  "joinRequestStatus": "pending|approved|denied|null",
  "pendingRequestCount": 2,
  "members": [ ... ]
}
```

- Public rooms (`isPublic: true`) accept `POST /api/rooms/:id/join` from any user.
- Private rooms require a moderator to approve the request, or a moderator can add a user directly.

### `PATCH /api/rooms/:id`
Moderators in a given room can toggle visibility.
```json
{ "isPublic": false }
```

### `POST /api/rooms/:id/members`
Moderators may add a user without approval.
```json
{ "targetUserId": "user-uuid" }
```

### `POST /api/rooms/:id/request-access`
Request admission to a private room. If the room is public the server simply joins the user.
```json
{ "note": "Optional context" }
```

### `GET /api/rooms/:id/requests`
Room moderators can list pending join requests. Each request includes the requester metadata and current status.

### `POST /api/rooms/:id/requests/:requestId/respond`
Approve or deny a pending request. Approved requests automatically add the requester to the room and broadcast updated membership to all subscribers.
```json
{ "decision": "approved" }
```

## Approvals + Manager Tokens

Used by bots to request approval from managers and receive a 32-character token when approved.

### `GET /api/approvals?direction=incoming|outgoing|all`
Monitor pending/processed approvals.

### `POST /api/approvals`
Submit a request. Payload:
```json
{
  "targetUserId": "manager-uuid",
  "note": "Reason for approval",
  "conversationId": "room-or-dm-uuid"
}
```
Only managers can be targets; the API rejects non-manager IDs.
- `conversationId` is optional but recommended. When present the server verifies the requester is a
  member of that conversation and will echo the approval response back into that same channel. When
  omitted the legacy behavior (DM response) is used.

### `POST /api/approvals/:id/respond`
Managers approve or deny. Payload:
```json
{ "decision": "approved" } // or "denied"
```
If approved, the server posts a message that contains the manager’s stored token. When the approval
request referenced a `conversationId`, that message appears in that same room/DM so every member can
see the approval status. If no conversation was supplied the server falls back to opening (or
reusing) a direct message thread between the manager and requester. This token message is what bots
should watch for.

### Token Handling Workflow
1. Manager sets a 32-character token in their profile.
2. Bot calls `POST /api/approvals` targeting the manager’s user ID and (optionally) passes the
   conversation the request originated from.
3. Manager approves. API ensures a token exists and posts the approval response message (containing
   only the token string) back to that same conversation; if no `conversationId` was provided the
   message is delivered via DM.
4. Bot listens for the resulting `message:created` event (WebSocket or poll) in that conversation and
   extracts the token from the message body.

## WebSocket (`wss://host/ws?token=JWT`)

- Messages are JSON. Agent must authenticate via the `token` query parameter.
- On connect, server sends:
```json
{ "type": "ready", "user": {...}, "conversations": [...] }
```

### Events to listen for
| Type | Payload | Notes |
|------|---------|-------|
| `message:created` | `{ conversationId, message }` | New chat message (includes `format: "text"|"markdown"`). Token deliveries for approvals arrive here. |
| `message:ack` | `{ message }` | Echo for sent messages. |
| `conversation:updated` | `{ conversation }` | Membership/title changes. |
| `presence:updated` | `{ user }` | Live presence changes. |
| `approval:updated` | `{ request }` | Approval state transitions. |
| `thinking` | `{ conversationId, userId, thinking, displayName }` | Bots can toggle a “thinking…” indicator for other members of the chat. |
| `error` | `{ error }` | Invalid payloads, auth issues, etc. |

### Client → Server messages
Currently supported payloads:
```json
{ "type": "ping" }                // expect {type:"pong"}
{ "type": "conversation:list" }   // refresh conversation list
{ "type": "message:send", "conversationId": "...", "content": "...", "format": "markdown" }
{ "type": "typing", "conversationId": "...", "typing": true }
{ "type": "thinking", "conversationId": "...", "thinking": true }
```

## Admin APIs (Optional)

For automation that creates or manages accounts (requires admin/moderator token):

- `GET /api/admin/users`, `GET /api/admin/stats`
- `POST /api/admin/users` (fields: `username`, `displayName`, `password`, `role`, `manager`)
- `PATCH /api/admin/users/:id` (fields: `role`, `status`, `manager`)
- `POST /api/admin/users/:id/reset-password`
- `DELETE /api/admin/users/:id`

## Plugin Implementation Tips

1. **Session flow:** Log in → store token → open WebSocket (for live messages) → poll REST endpoints as needed.
2. **Approvals:** When acting as a bot requester, use `/api/approvals` + WebSocket `message:created` for token delivery. Validate that the message content is 32 characters before trusting it.
3. **Managers:** The manager flag comes across in `/api/users` results. Present UI or logic that only allows bots to request approval from users where `manager === true`.
4. **Rate limiting:** Keep REST calls efficient—batch requests where possible and rely on WebSocket events for realtime updates.
5. **Reconnection:** Implement retry logic for WebSocket (server expects clients to reconnect as implemented in the SPA).

This API surface is stable for plugin development; new fields (such as future metadata) appear additively. Monitor release notes for breaking changes.

const { WebSocketServer } = require('ws');
const jwt = require('jsonwebtoken');
const config = require('./config');
const events = require('./events');
const {
  getUserById,
  listConversationsForUser,
  createMessage,
  getConversationMembers,
  isMember,
  updateUserPresence,
  recordMentions,
  getActiveApiKeyByHash,
  touchApiKey,
  listManagerIds,
  getAgentAssignment
} = require('./db');
const { hashApiKey } = require('./auth');

const API_KEY_PREFIX = 'csk_';

// Server instance ID - changes on each restart
const SERVER_INSTANCE_ID = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

const clients = new Map(); // userId -> Set<ws>

function registerClient(userId, socket) {
  if (!clients.has(userId)) {
    clients.set(userId, new Set());
  }
  clients.get(userId).add(socket);
}

function unregisterClient(userId, socket) {
  const set = clients.get(userId);
  if (!set) return false;
  set.delete(socket);
  if (!set.size) {
    clients.delete(userId);
    return true;
  }
  return false;
}

function sendToUser(userId, payload) {
  const set = clients.get(userId);
  if (!set) return;
  const data = JSON.stringify(payload);
  set.forEach((socket) => {
    if (socket.readyState === socket.OPEN) {
      socket.send(data);
    }
  });
}

function broadcast(payload) {
  const data = JSON.stringify(payload);
  clients.forEach((sockets) => {
    sockets.forEach((socket) => {
      if (socket.readyState === socket.OPEN) {
        socket.send(data);
      }
    });
  });
}

async function authenticateFromRequest(req) {
  try {
    const url = new URL(req.url, 'http://localhost');
    const token = url.searchParams.get('token');
    if (!token) {
      return { error: 'Missing token' };
    }
    let user;
    if (token.startsWith(API_KEY_PREFIX)) {
      // API key path: same csk_ keys that authenticate REST also work here.
      const record = await getActiveApiKeyByHash(hashApiKey(token));
      if (!record) {
        return { error: 'Invalid API key' };
      }
      user = await getUserById(record.userId);
      if (user) {
        touchApiKey(record.id).catch(() => {});
      }
    } else {
      const payload = jwt.verify(token, config.jwtSecret);
      user = await getUserById(payload.sub);
    }
    if (!user || user.status !== 'active') {
      return { error: 'Account not available' };
    }
    return { user };
  } catch (error) {
    return { error: 'Invalid token' };
  }
}

function setupWebsocket(server) {
  const wss = new WebSocketServer({ server, path: '/ws' });

  wss.on('connection', async (socket, req) => {
    const { user, error } = await authenticateFromRequest(req);
    if (!user) {
      socket.close(4001, error);
      return;
    }
    socket.user = user;
    registerClient(user.id, socket);
    await updateUserPresence(user.id, 'online');
    const conversations = await listConversationsForUser(user.id);
    socket.send(JSON.stringify({ type: 'ready', user, conversations, serverInstanceId: SERVER_INSTANCE_ID }));

    socket.on('message', async (raw) => {
      try {
        const payload = JSON.parse(raw.toString());
        await handleSocketMessage(socket, payload);
      } catch (err) {
        socket.send(JSON.stringify({ type: 'error', error: 'Invalid payload' }));
      }
    });

    socket.on('close', async () => {
      const removed = unregisterClient(user.id, socket);
      if (removed) {
        await updateUserPresence(user.id, 'offline');
      }
    });
  });

  events.on('message:created', async ({ conversationId, message }) => {
    try {
      const members = await getConversationMembers(conversationId);
      members.forEach((member) => {
        sendToUser(member.id, {
          type: 'message:created',
          conversationId,
          message
        });
      });
      // @mention pings: notify mentioned users even when they are NOT members
      // (ping only, no auto-join). recordMentions enforces visibility (member or
      // public room; private/DM non-members are skipped).
      const { conversation, mentions } = await recordMentions(conversationId, message);
      if (mentions.length) {
        const room = {
          id: conversationId,
          title: conversation ? conversation.title || null : null,
          type: conversation ? conversation.type : undefined,
          isPublic: conversation ? Boolean(conversation.isPublic) : false
        };
        mentions.forEach((mn) => {
          sendToUser(mn.userId, {
            type: 'mention:created',
            mention: { id: mn.id, conversationId, room, message, isMember: mn.isMember }
          });
        });
      }
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('WS broadcast error', err);
    }
  });

  events.on('conversation:updated', async ({ conversation }) => {
    try {
      const payload = { type: 'conversation:updated', conversation };
      // Rooms share a global namespace: listRoomsForUser returns every room to
      // every user, so a room create / visibility change / membership change has
      // to reach all connected clients, not just current members - otherwise a
      // newly created channel only appears after a manual reload. (The client
      // turns this event into a refreshChannels().) Direct conversations stay
      // scoped to their members.
      if (conversation.type === 'room') {
        broadcast(payload);
        return;
      }
      const members = conversation.members || (await getConversationMembers(conversation.id));
      members.forEach((member) => {
        sendToUser(member.id, payload);
      });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('WS conversation broadcast error', err);
    }
  });

  events.on('approval:updated', ({ request }) => {
    [request.requesterId, request.targetId].forEach((userId) => {
      sendToUser(userId, {
        type: 'approval:updated',
        request
      });
    });
  });

  events.on('presence:updated', ({ user }) => {
    broadcast({
      type: 'presence:updated',
      user
    });
  });

  // Allow API-triggered thinking broadcasts (for bots)
  events.on('thinking:broadcast', async ({ conversationId, userId, displayName, thinking }) => {
    try {
      const members = await getConversationMembers(conversationId);
      members.forEach((member) => {
        if (member.id === userId) return;
        sendToUser(member.id, {
          type: 'thinking',
          conversationId,
          thinking: Boolean(thinking),
          userId,
          displayName
        });
      });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('WS thinking broadcast error', err);
    }
  });

  // Allow API-triggered read receipt broadcasts (for bots)
  events.on('read:receipt', async ({ conversationId, userId, displayName, messageId }) => {
    try {
      const members = await getConversationMembers(conversationId);
      members.forEach((member) => {
        if (member.id === userId) return;
        sendToUser(member.id, {
          type: 'read:receipt',
          conversationId,
          userId,
          displayName,
          messageId
        });
      });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('WS read receipt broadcast error', err);
    }
  });

  // ---- Agent orchestration events ----
  // profile:updated -> the agent + all managers.
  events.on('profile:updated', async ({ userId }) => {
    try {
      const recipients = new Set([userId, ...(await listManagerIds())]);
      recipients.forEach((id) => sendToUser(id, { type: 'profile:updated', userId }));
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('WS profile:updated error', err);
    }
  });

  // assign/release -> targeted: the assigned agent + the assigning manager.
  events.on('agent:assigned', ({ assignment }) => {
    [assignment.userId, assignment.assignedBy].forEach((id) => {
      if (id) sendToUser(id, { type: 'agent:assigned', assignment });
    });
  });

  events.on('agent:released', ({ assignment }) => {
    [assignment.userId, assignment.assignedBy].forEach((id) => {
      if (id) sendToUser(id, { type: 'agent:released', assignment });
    });
  });

  // Broadcast like presence: activity_status is low-sensitivity and the office UI
  // shows bot status to every viewer (directory, members, activity panel) and
  // updates it live. Widened from the contract-v1 managers+active-room scope on
  // 2026-05-29 with Mark's sign-off.
  events.on('activity:changed', ({ userId, activityStatus }) => {
    broadcast({ type: 'agent:status_changed', userId, activityStatus });
  });

  return wss;
}

async function handleSocketMessage(socket, payload) {
  if (!payload || typeof payload !== 'object') {
    socket.send(JSON.stringify({ type: 'error', error: 'Malformed event' }));
    return;
  }
  switch (payload.type) {
    case 'ping':
      socket.send(JSON.stringify({ type: 'pong', ts: Date.now() }));
      break;
    case 'conversation:list': {
      const conversations = await listConversationsForUser(socket.user.id);
      socket.send(JSON.stringify({ type: 'conversation:list', conversations }));
      break;
    }
    case 'message:send': {
      const { conversationId, content, format } = payload;
      if (!conversationId || typeof content !== 'string' || !content.trim()) {
        socket.send(JSON.stringify({ type: 'error', error: 'Invalid message payload' }));
        return;
      }
      if (format && format !== 'text' && format !== 'markdown') {
        socket.send(JSON.stringify({ type: 'error', error: 'Invalid format' }));
        return;
      }
      if (!(await isMember(conversationId, socket.user.id))) {
        socket.send(JSON.stringify({ type: 'error', error: 'Conversation not found' }));
        return;
      }
      const message = await createMessage({
        conversationId,
        userId: socket.user.id,
        content: content.trim().slice(0, 2000),
        format: format === 'markdown' ? 'markdown' : 'text'
      });
      events.emit('message:created', { conversationId, message });
      socket.send(JSON.stringify({ type: 'message:ack', message }));
      break;
    }
    case 'typing': {
      const { conversationId, typing } = payload;
      if (!conversationId) {
        socket.send(JSON.stringify({ type: 'error', error: 'Invalid typing payload' }));
        return;
      }
      if (!(await isMember(conversationId, socket.user.id))) {
        socket.send(JSON.stringify({ type: 'error', error: 'Conversation not found' }));
        return;
      }
      const members = await getConversationMembers(conversationId);
      members.forEach((member) => {
        if (member.id === socket.user.id) return;
        sendToUser(member.id, {
          type: 'typing',
          conversationId,
          typing: Boolean(typing),
          userId: socket.user.id,
          displayName: socket.user.displayName || socket.user.username
        });
      });
      break;
    }
    case 'thinking': {
      const { conversationId, thinking } = payload;
      if (!conversationId) {
        socket.send(JSON.stringify({ type: 'error', error: 'Invalid thinking payload' }));
        return;
      }
      if (!(await isMember(conversationId, socket.user.id))) {
        socket.send(JSON.stringify({ type: 'error', error: 'Conversation not found' }));
        return;
      }
      const members = await getConversationMembers(conversationId);
      members.forEach((member) => {
        if (member.id === socket.user.id) return;
        sendToUser(member.id, {
          type: 'thinking',
          conversationId,
          thinking: Boolean(thinking),
          userId: socket.user.id,
          displayName: socket.user.displayName || socket.user.username
        });
      });
      break;
    }
    default:
      socket.send(JSON.stringify({ type: 'error', error: 'Unknown event' }));
  }
}

module.exports = { setupWebsocket };

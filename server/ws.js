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
  updateUserPresence
} = require('./db');

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
    const payload = jwt.verify(token, config.jwtSecret);
    const user = await getUserById(payload.sub);
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
    socket.send(JSON.stringify({ type: 'ready', user, conversations }));

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
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('WS broadcast error', err);
    }
  });

  events.on('conversation:updated', async ({ conversation }) => {
    try {
      const members = conversation.members || (await getConversationMembers(conversation.id));
      members.forEach((member) => {
        sendToUser(member.id, {
          type: 'conversation:updated',
          conversation
        });
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

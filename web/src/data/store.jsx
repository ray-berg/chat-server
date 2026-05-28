import React from 'react';
import { api, getToken, setToken as persistToken } from './api.js';
import { connectSocket } from './socket.js';
import { mapUser, mapMessage, userFromMessage } from '../lib/format.js';

const ChatContext = React.createContext(null);
export function useChat() {
  return React.useContext(ChatContext);
}

function buildChannels(rooms, conversations, meId) {
  const channels = [];
  rooms.forEach((r) => {
    channels.push({
      id: r.id,
      name: r.title || 'room',
      section: (r.title || '').toLowerCase() === 'lobby' ? 'pinned' : 'channels',
      privacy: r.isPublic ? 'public' : 'private',
      type: 'room',
      unread: 0,
      memberCount: r.memberCount,
      isMember: r.isMember,
      members: (r.members || []).map((m) => m.id),
      raw: r,
    });
  });
  conversations
    .filter((c) => c.type === 'direct')
    .forEach((c) => {
      const others = (c.members || []).filter((m) => m.id !== meId);
      const isGroup = others.length > 1;
      channels.push({
        id: c.id,
        type: 'direct',
        section: 'direct',
        name: isGroup
          ? others.map((o) => o.displayName).join(', ')
          : others[0]?.displayName || 'Direct message',
        user: isGroup ? undefined : others[0]?.id,
        users: isGroup ? others.map((o) => o.id) : undefined,
        unread: 0,
        lastMessageAt: c.lastMessageAt,
        members: (c.members || []).map((m) => m.id),
        raw: c,
      });
    });
  return channels;
}

export function ChatProvider({ children }) {
  const [token, setTokenState] = React.useState(getToken());
  const [ready, setReady] = React.useState(false);
  const [bootError, setBootError] = React.useState(null);
  const [currentUser, setCurrentUser] = React.useState(null);
  const [usersById, setUsersById] = React.useState({});
  const [channels, setChannels] = React.useState([]);
  const [activeChannelId, setActiveChannelId] = React.useState(null);
  const [messagesByChannel, setMessagesByChannel] = React.useState({});
  const [typingByChannel, setTypingByChannel] = React.useState({});
  const [thinkingByChannel, setThinkingByChannel] = React.useState({});
  const [approvals, setApprovals] = React.useState({ incoming: [], outgoing: [] });
  const [connection, setConnection] = React.useState('idle');

  const socketRef = React.useRef(null);
  const channelsRef = React.useRef([]);
  const activeRef = React.useRef(null);
  const meRef = React.useRef(null);
  const typingTimers = React.useRef({});
  channelsRef.current = channels;
  activeRef.current = activeChannelId;
  meRef.current = currentUser;

  const mergeUsers = React.useCallback((list) => {
    setUsersById((prev) => {
      const next = { ...prev };
      list.forEach((u) => {
        if (!u || !u.id) return;
        const mapped = mapUser(u);
        next[u.id] = { ...next[u.id], ...mapped };
      });
      return next;
    });
  }, []);

  const refreshChannels = React.useCallback(async () => {
    const meId = meRef.current?.id;
    const [roomsRes, convRes] = await Promise.all([api.rooms(), api.conversations()]);
    const rooms = roomsRes.rooms || [];
    const conversations = convRes.conversations || [];
    rooms.forEach((r) => mergeUsers(r.members || []));
    conversations.forEach((c) => mergeUsers(c.members || []));
    setChannels(buildChannels(rooms, conversations, meId));
  }, [mergeUsers]);

  const refreshApprovals = React.useCallback(async () => {
    try {
      const res = await api.approvals('all');
      const meId = meRef.current?.id;
      const incoming = [];
      const outgoing = [];
      (res.requests || []).forEach((r) => {
        if (r.targetId === meId) incoming.push(r);
        else if (r.requesterId === meId) outgoing.push(r);
      });
      setApprovals({ incoming, outgoing });
    } catch {
      /* approvals are best-effort */
    }
  }, []);

  const loadMessages = React.useCallback(async (channelId, force = false) => {
    if (!channelId) return;
    if (!force && messagesByChannel[channelId]) return;
    try {
      const res = await api.messages(channelId);
      const rows = res.messages || [];
      mergeUsers(rows.map(userFromMessage));
      setMessagesByChannel((prev) => ({ ...prev, [channelId]: rows.map(mapMessage) }));
    } catch (e) {
      // Membership-gated rooms return 404 until joined.
      setMessagesByChannel((prev) => ({ ...prev, [channelId]: prev[channelId] || [] }));
    }
  }, [messagesByChannel, mergeUsers]);

  const selectChannel = React.useCallback(
    async (channelId) => {
      setActiveChannelId(channelId);
      const ch = channelsRef.current.find((c) => c.id === channelId);
      if (ch && ch.type === 'room' && !ch.isMember && ch.privacy === 'public') {
        try {
          await api.joinRoom(channelId);
          await refreshChannels();
        } catch {
          /* ignore */
        }
      }
      await loadMessages(channelId, true);
    },
    [loadMessages, refreshChannels],
  );

  const appendMessage = React.useCallback((channelId, msg) => {
    setMessagesByChannel((prev) => {
      const list = prev[channelId] || [];
      if (list.some((m) => m.id === msg.id)) return prev;
      return { ...prev, [channelId]: [...list, msg] };
    });
  }, []);

  const sendMessage = React.useCallback(
    async (text, format = 'text') => {
      const channelId = activeRef.current;
      const me = meRef.current;
      if (!channelId || !me || !text.trim()) return;
      const tempId = `temp-${crypto.randomUUID()}`;
      const optimistic = {
        id: tempId,
        author: me.id,
        at: new Date().toISOString(),
        text: text.trim(),
        format,
        pending: true,
      };
      appendMessage(channelId, optimistic);
      try {
        const res = await api.sendMessage(channelId, text.trim(), format);
        const real = mapMessage(res.message);
        setMessagesByChannel((prev) => {
          const list = (prev[channelId] || []).filter((m) => m.id !== tempId);
          if (list.some((m) => m.id === real.id)) return { ...prev, [channelId]: list };
          return { ...prev, [channelId]: [...list, real] };
        });
      } catch (e) {
        setMessagesByChannel((prev) => ({
          ...prev,
          [channelId]: (prev[channelId] || []).map((m) =>
            m.id === tempId ? { ...m, pending: false, failed: true } : m,
          ),
        }));
      }
    },
    [appendMessage],
  );

  const sendTyping = React.useCallback((typing) => {
    const channelId = activeRef.current;
    if (!channelId || !socketRef.current) return;
    socketRef.current.send({ type: 'typing', conversationId: channelId, typing });
  }, []);

  const setPresence = React.useCallback(async (status) => {
    try {
      const res = await api.setPresence(status);
      if (res.profile) {
        setCurrentUser((u) => ({ ...u, presence: status }));
        mergeUsers([{ ...res.profile, id: res.profile.id }]);
      }
    } catch {
      /* ignore */
    }
  }, [mergeUsers]);

  const respondApproval = React.useCallback(
    async (id, decision) => {
      try {
        await api.respondApproval(id, decision);
        await refreshApprovals();
      } catch (e) {
        /* surfaced by caller if needed */
      }
    },
    [refreshApprovals],
  );

  const updateProfile = React.useCallback(
    async (patch) => {
      const res = await api.updateProfile(patch);
      if (res.profile) {
        const mapped = mapUser(res.profile);
        setCurrentUser((u) => ({ ...u, ...mapped }));
        mergeUsers([res.profile]);
      }
      return res.profile;
    },
    [mergeUsers],
  );

  const uploadImage = React.useCallback((scope, file) => api.uploadImage(scope, file), []);
  const changePassword = React.useCallback((cur, next) => api.changePassword(cur, next), []);

  const setAccent = React.useCallback(async (accentColor) => {
    setCurrentUser((u) => (u ? { ...u, accentColor } : u));
    try {
      await api.updateProfile({ accentColor });
    } catch {
      /* non-fatal; UI already reflects the choice */
    }
  }, []);

  const startDirect = React.useCallback(
    async (targetUserId) => {
      try {
        const res = await api.startDirect(targetUserId);
        await refreshChannels();
        return res.conversation?.id || null;
      } catch {
        return null;
      }
    },
    [refreshChannels],
  );

  const createRoom = React.useCallback(
    async (title, isPublic) => {
      const res = await api.createRoom(title, isPublic);
      await refreshChannels();
      return res.room?.id || null;
    },
    [refreshChannels],
  );

  const setRoomVisibility = React.useCallback(
    async (id, isPublic) => {
      await api.setRoomVisibility(id, isPublic);
      await refreshChannels();
    },
    [refreshChannels],
  );

  const fetchRoomRequests = React.useCallback((id) => api.roomRequests(id).then((r) => r.requests || []), []);

  const respondRoomRequest = React.useCallback(
    async (roomId, requestId, decision) => {
      await api.respondRoomRequest(roomId, requestId, decision);
      await refreshChannels();
    },
    [refreshChannels],
  );

  const banFromRoom = React.useCallback(
    async (roomId, targetUserId, reason) => {
      await api.banFromRoom(roomId, targetUserId, reason);
      await refreshChannels();
    },
    [refreshChannels],
  );

  const fetchAccessRequests = React.useCallback(
    (status = 'pending') => api.accessRequests(status).then((r) => r.requests || []),
    [],
  );
  const approveAccessRequest = React.useCallback((id, password, role) => api.approveAccessRequest(id, password, role), []);
  const denyAccessRequest = React.useCallback((id) => api.denyAccessRequest(id), []);

  const searchUsers = React.useCallback(
    async (q) => {
      const res = await api.users(q).catch(() => ({ users: [] }));
      mergeUsers(res.users || []);
      return (res.users || []).map((u) => mapUser(u));
    },
    [mergeUsers],
  );

  const noteTyping = React.useCallback((cid, uid, name, active) => {
    const key = `${cid}:${uid}`;
    if (typingTimers.current[key]) {
      clearTimeout(typingTimers.current[key]);
      delete typingTimers.current[key];
    }
    setTypingByChannel((prev) => {
      const forChannel = { ...(prev[cid] || {}) };
      if (active) forChannel[uid] = name;
      else delete forChannel[uid];
      return { ...prev, [cid]: forChannel };
    });
    if (active) {
      typingTimers.current[key] = setTimeout(() => {
        setTypingByChannel((prev) => {
          const forChannel = { ...(prev[cid] || {}) };
          delete forChannel[uid];
          return { ...prev, [cid]: forChannel };
        });
      }, 6000);
    }
  }, []);

  const onSocketMessage = React.useCallback(
    (msg) => {
      switch (msg.type) {
        case 'ready':
          if (msg.user) {
            setCurrentUser((u) => ({ ...mapUser(msg.user), ...u, presence: msg.user.presenceStatus }));
            mergeUsers([msg.user]);
          }
          break;
        case 'message:created':
          if (msg.message) {
            mergeUsers([userFromMessage(msg.message)]);
            appendMessage(msg.conversationId, mapMessage(msg.message));
          }
          break;
        case 'presence:updated':
          if (msg.user) mergeUsers([msg.user]);
          break;
        case 'conversation:updated':
          refreshChannels();
          break;
        case 'approval:updated':
          refreshApprovals();
          break;
        case 'typing':
          noteTyping(msg.conversationId, msg.userId, msg.displayName, Boolean(msg.typing));
          break;
        case 'thinking':
          setThinkingByChannel((prev) => {
            const forChannel = { ...(prev[msg.conversationId] || {}) };
            if (msg.thinking) forChannel[msg.userId] = msg.displayName;
            else delete forChannel[msg.userId];
            return { ...prev, [msg.conversationId]: forChannel };
          });
          break;
        default:
          break;
      }
    },
    [appendMessage, mergeUsers, refreshChannels, refreshApprovals, noteTyping],
  );

  // Bootstrap once we have a token.
  React.useEffect(() => {
    if (!token) {
      setReady(false);
      return undefined;
    }
    let cancelled = false;
    setConnection('connecting');
    (async () => {
      try {
        const meRes = await api.me();
        if (cancelled) return;
        const me = mapUser(meRes.user);
        setCurrentUser(me);
        meRef.current = me;
        mergeUsers([meRes.user]);
        const dir = await api.users('').catch(() => ({ users: [] }));
        mergeUsers(dir.users || []);
        await refreshChannels();
        await refreshApprovals();
        if (cancelled) return;
        setReady(true);
        socketRef.current = connectSocket(token, {
          onStatus: setConnection,
          onMessage: onSocketMessage,
        });
      } catch (e) {
        if (cancelled) return;
        if (e.message === 'Unauthorized') {
          persistToken('');
          setTokenState('');
        } else {
          setBootError(e.message);
        }
      }
    })();
    return () => {
      cancelled = true;
      if (socketRef.current) {
        socketRef.current.close();
        socketRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const doLogin = React.useCallback((newToken) => {
    persistToken(newToken);
    setTokenState(newToken);
    setBootError(null);
  }, []);

  const logout = React.useCallback(() => {
    if (socketRef.current) {
      socketRef.current.close();
      socketRef.current = null;
    }
    persistToken('');
    setTokenState('');
    setReady(false);
    setCurrentUser(null);
    setChannels([]);
    setMessagesByChannel({});
    setActiveChannelId(null);
  }, []);

  const value = {
    token,
    ready,
    bootError,
    connection,
    currentUser,
    usersById,
    channels,
    activeChannelId,
    activeChannel: channels.find((c) => c.id === activeChannelId) || null,
    messages: messagesByChannel[activeChannelId] || [],
    messagesByChannel,
    typing: Object.values(typingByChannel[activeChannelId] || {}),
    thinking: Object.entries(thinkingByChannel[activeChannelId] || {}).map(([id, name]) => ({ id, name })),
    approvals,
    selectChannel,
    sendMessage,
    sendTyping,
    setPresence,
    setAccent,
    updateProfile,
    uploadImage,
    changePassword,
    respondApproval,
    startDirect,
    searchUsers,
    createRoom,
    setRoomVisibility,
    fetchRoomRequests,
    respondRoomRequest,
    banFromRoom,
    fetchAccessRequests,
    approveAccessRequest,
    denyAccessRequest,
    refreshChannels,
    doLogin,
    logout,
  };

  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>;
}

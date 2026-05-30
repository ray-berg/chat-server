// REST client for the chat-server API. Token lives in localStorage; all calls
// go through the Vite dev proxy (or same-origin in production).

const TOKEN_KEY = 'chat.token';

export function getToken() {
  return localStorage.getItem(TOKEN_KEY) || '';
}

export function setToken(token) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

export async function authFetch(path, options = {}) {
  const token = getToken();
  const headers = { ...(options.headers || {}) };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (options.body && !(options.body instanceof FormData) && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }
  return fetch(path, { ...options, headers });
}

async function asJson(res, method, path) {
  if (res.status === 401) {
    setToken('');
    throw new Error('Unauthorized');
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `${method} ${path} -> ${res.status}`);
  }
  return res.json().catch(() => ({}));
}

export async function apiGet(path) {
  const res = await authFetch(path);
  return asJson(res, 'GET', path);
}

export async function apiPost(path, body) {
  const res = await authFetch(path, {
    method: 'POST',
    body: body != null ? JSON.stringify(body) : undefined,
  });
  return asJson(res, 'POST', path);
}

export async function apiPut(path, body) {
  const res = await authFetch(path, { method: 'PUT', body: JSON.stringify(body) });
  return asJson(res, 'PUT', path);
}

export async function apiPatch(path, body) {
  const res = await authFetch(path, { method: 'PATCH', body: JSON.stringify(body) });
  return asJson(res, 'PATCH', path);
}

export async function apiDelete(path) {
  const res = await authFetch(path, { method: 'DELETE' });
  if (res.status === 204) return {};
  return asJson(res, 'DELETE', path);
}

export async function login(username, password) {
  const res = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Login failed');
  setToken(data.token);
  return data;
}

export const api = {
  me: () => apiGet('/api/auth/me'),
  logout: () => apiPost('/api/auth/logout'),
  refresh: async () => {
    const data = await apiPost('/api/auth/refresh');
    if (data && data.token) setToken(data.token);
    return data;
  },
  conversations: () => apiGet('/api/conversations'),
  rooms: () => apiGet('/api/rooms'),
  users: (q = '') => apiGet(`/api/users?q=${encodeURIComponent(q)}`),
  messages: (id, before) =>
    apiGet(`/api/conversations/${id}/messages${before ? `?before=${encodeURIComponent(before)}` : ''}`),
  sendMessage: (id, content, format) =>
    apiPost(`/api/conversations/${id}/messages`, { content, format }),
  startDirect: (targetUserId) => apiPost('/api/conversations/direct', { targetUserId }),
  joinRoom: (id) => apiPost(`/api/rooms/${id}/join`),
  activateRoom: (id) => apiPost(`/api/rooms/${id}/activate`),
  createRoom: (title, isPublic) => apiPost('/api/rooms', { title, isPublic }),
  setRoomVisibility: (id, isPublic) => apiPatch(`/api/rooms/${id}`, { isPublic }),
  archiveRoom: (id) => apiPost(`/api/rooms/${id}/archive`),
  restoreRoom: (id) => apiPost(`/api/rooms/${id}/restore`),
  deleteRoom: (id) => apiDelete(`/api/rooms/${id}`),
  archivedRooms: () => apiGet('/api/rooms/archived'),
  roomRequests: (id) => apiGet(`/api/rooms/${id}/requests`),
  respondRoomRequest: (roomId, requestId, decision) =>
    apiPost(`/api/rooms/${roomId}/requests/${requestId}/respond`, { decision }),
  banFromRoom: (roomId, targetUserId, reason) =>
    apiPost(`/api/rooms/${roomId}/ban`, { targetUserId, reason }),
  addRoomMember: (roomId, targetUserId) => apiPost(`/api/rooms/${roomId}/members`, { targetUserId }),
  mentions: () => apiGet('/api/mentions'),
  readMentions: (conversationId) => apiPost('/api/mentions/read', conversationId ? { conversationId } : {}),
  approvals: (direction = 'all') => apiGet(`/api/approvals?direction=${direction}`),
  respondApproval: (id, decision) => apiPost(`/api/approvals/${id}/respond`, { decision }),
  setPresence: (presenceStatus) => apiPut('/api/users/me/profile', { presenceStatus }),
  updateProfile: (patch) => apiPut('/api/users/me/profile', patch),
  myProfile: () => apiGet('/api/users/me/profile'),
  changePassword: (currentPassword, newPassword) =>
    apiPost('/api/users/me/password', { currentPassword, newPassword }),
  requestAccess: (payload) => apiPost('/api/auth/request-access', payload),
  accessRequests: (status = 'pending') =>
    apiGet(`/api/admin/access-requests${status ? `?status=${status}` : ''}`),
  approveAccessRequest: (id, password, role = 'user') =>
    apiPost(`/api/admin/access-requests/${id}/approve`, { password, role }),
  denyAccessRequest: (id) => apiPost(`/api/admin/access-requests/${id}/deny`),
  listMyApiKeys: () => apiGet('/api/users/me/api-keys'),
  createMyApiKey: (label) => apiPost('/api/users/me/api-keys', { label }),
  rotateMyApiKey: (id, label) => apiPost(`/api/users/me/api-keys/${id}/rotate`, { label }),
  revokeMyApiKey: (id) => apiDelete(`/api/users/me/api-keys/${id}`),
  adminStats: () => apiGet('/api/admin/stats'),
  adminUsers: (q = '') => apiGet(`/api/admin/users?q=${encodeURIComponent(q)}`),
  adminGetUser: (id) => apiGet(`/api/admin/users/${id}`),
  adminUpdateUser: (id, patch) => apiPatch(`/api/admin/users/${id}`, patch),
  adminCreateUser: (payload) => apiPost('/api/admin/users', payload),
  adminResetPassword: (id, password) => apiPost(`/api/admin/users/${id}/reset-password`, { password }),
  adminDeleteUser: (id) => apiDelete(`/api/admin/users/${id}`),
  uploadImage: async (scope, file) => {
    const fd = new FormData();
    fd.append('image', file);
    const res = await authFetch(`/api/uploads/images?scope=${scope}`, { method: 'POST', body: fd });
    return asJson(res, 'POST', '/api/uploads/images');
  },
};

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
  approvals: (direction = 'all') => apiGet(`/api/approvals?direction=${direction}`),
  respondApproval: (id, decision) => apiPost(`/api/approvals/${id}/respond`, { decision }),
  setPresence: (presenceStatus) => apiPut('/api/users/me/profile', { presenceStatus }),
  myProfile: () => apiGet('/api/users/me/profile'),
};

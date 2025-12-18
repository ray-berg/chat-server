const AVAILABLE_AVATARS = [
  '/assets/avatars/avatar-blue.svg',
  '/assets/avatars/avatar-green.svg',
  '/assets/avatars/avatar-purple.svg',
  '/assets/avatars/avatar-orange.svg',
  '/assets/avatars/avatar-teal.svg',
  '/assets/avatars/avatar-gray.svg'
];

const PRESENCE_LABELS = {
  online: 'Online',
  idle: 'Idle',
  away: 'Away',
  dnd: 'Do Not Disturb',
  offline: 'Offline'
};
const PRESENCE_CHOICES = ['online', 'idle', 'away', 'dnd', 'offline'];
const PRESENCE_RANK = PRESENCE_CHOICES.reduce((acc, status, index) => {
  acc[status] = index;
  return acc;
}, {});

const DEFAULT_CHAT_VOLUME = 0.7;
const storedVolume = Number(localStorage.getItem('chat_volume'));
const initialVolume = Number.isFinite(storedVolume) ? Math.min(1, Math.max(0, storedVolume)) : DEFAULT_CHAT_VOLUME;

function loadHiddenConversations() {
  try {
    const stored = localStorage.getItem('hidden_conversations');
    return stored ? new Set(JSON.parse(stored)) : new Set();
  } catch {
    return new Set();
  }
}

const state = {
  token: localStorage.getItem('chat_token'),
  user: null,
  conversations: [],
  rooms: [],
  roomRequests: new Map(),
  approvalsIncoming: [],
  approvalsOutgoing: [],
  activeConversationId: null,
  messageCache: new Map(),
  socket: null,
  reconnectDelay: 1500,
  reconnectTimer: null,
  presence: new Map(),
  typing: new Map(),
  thinking: new Map(),
  botReadReceipts: new Map(), // conversationId -> { oderId, messageId }
  chatVolume: initialVolume,
  view: 'chat',
  hiddenConversations: loadHiddenConversations(),
  showHiddenConversations: false,
  markdownMode: false,
  serverInstanceId: null
};

const ROLE_LABELS = {
  admin: 'Administrator',
  moderator: 'Channel Moderator',
  user: 'Member'
};
const BUILTIN_AVATARS = new Set(AVAILABLE_AVATARS);

const el = {
  authPanel: document.getElementById('authPanel'),
  chatApp: document.getElementById('chatApp'),
  loginForm: document.getElementById('loginForm'),
  currentUserName: document.getElementById('currentUserName'),
  currentUserRole: document.getElementById('currentUserRole'),
  currentUserAvatar: document.getElementById('currentUserAvatar'),
  currentUserPresence: document.getElementById('currentUserPresence'),
  mobileUserAvatar: document.getElementById('mobileUserAvatar'),
  menuToggle: document.getElementById('menuToggle'),
  closeSidebar: document.getElementById('closeSidebar'),
  sidebar: document.getElementById('sidebar'),
  sidebarBackdrop: document.getElementById('sidebarBackdrop'),
  logoutBtn: document.getElementById('logoutBtn'),
  openProfile: document.getElementById('openProfile'),
  conversationList: document.getElementById('conversationList'),
  chatTitle: document.getElementById('chatTitle'),
  chatMembers: document.getElementById('chatMembers'),
  typingIndicator: document.getElementById('typingIndicator'),
  thinkingIndicator: document.getElementById('thinkingIndicator'),
  addRoomMemberBtn: document.getElementById('addRoomMemberBtn'),
  messageList: document.getElementById('messageList'),
  messageForm: document.getElementById('messageForm'),
  messageInput: document.getElementById('messageInput'),
  markdownToggle: document.getElementById('markdownToggle'),
  userSearch: document.getElementById('userSearch'),
  userResults: document.getElementById('userResults'),
  connectionState: document.getElementById('connectionState'),
  refreshConversations: document.getElementById('refreshConversations'),
  refreshRooms: document.getElementById('refreshRooms'),
  roomsList: document.getElementById('roomsList'),
  newDmBtn: document.getElementById('newDmBtn'),
  createRoomBtn: document.getElementById('createRoomBtn'),
  chatPage: document.getElementById('chatPage'),
  profilePage: document.getElementById('profilePage'),
  tabChat: document.getElementById('tabChat'),
  tabProfile: document.getElementById('tabProfile'),
  profileForm: document.getElementById('profileForm'),
  passwordForm: document.getElementById('passwordForm'),
  avatarChoices: document.getElementById('avatarChoices'),
  managerTokenGroup: document.getElementById('managerTokenGroup'),
  adminLink: document.getElementById('adminLink'),
  profilePhotoUpload: document.getElementById('profilePhotoUpload'),
  profilePhotoPreview: document.getElementById('profilePhotoPreview'),
  profilePhotoField: document.getElementById('profilePhotoUrlField'),
  avatarUpload: document.getElementById('avatarUpload'),
  avatarPreview: document.getElementById('avatarPreview'),
  avatarUrlField: document.getElementById('avatarUrlField'),
  customAvatarOption: document.getElementById('customAvatarOption'),
  customAvatarPreview: document.getElementById('customAvatarPreview'),
  presenceStatusSelect: document.getElementById('presenceStatusSelect'),
  idleTimeoutInput: document.getElementById('idleTimeoutInput'),
  dndToggle: document.getElementById('toggleDnd'),
  pageFooter: document.getElementById('appFooter'),
  toast: document.getElementById('toast'),
  chatVolume: document.getElementById('chatVolume'),
  approvalsPanel: document.getElementById('approvalsPanel'),
  incomingApprovalCount: document.getElementById('incomingApprovalCount'),
  outgoingApprovalCount: document.getElementById('outgoingApprovalCount'),
  reviewApprovalsBtn: document.getElementById('reviewApprovalsBtn'),
  newApprovalBtn: document.getElementById('newApprovalBtn'),
  refreshApprovals: document.getElementById('refreshApprovals'),
  approvalsAlertBadge: document.getElementById('approvalsAlertBadge')
};

const TYPING_EXPIRATION_MS = 4000;
const THINKING_EXPIRATION_MS = 8000;
let selfTypingActive = false;
let selfTypingTimeout = null;
let selfTypingConversationId = null;
let audioContext = null;
let audioMasterGain = null;
let approvalsAlertTimer = null;

function escapeHtml(text = '') {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function renderRoleBadge(role) {
  if (!role || role === 'user') {
    return '';
  }
  const label = ROLE_LABELS[role] || role;
  return `<span class="role-badge role-${role}">${label}</span>`;
}

function isAdmin() {
  return Boolean(state.user && state.user.role === 'admin');
}

function canModerateRooms() {
  return Boolean(state.user && (state.user.role === 'moderator' || state.user.role === 'admin'));
}

function resolveAvatar(url, profilePhotoUrl) {
  if (url) {
    return url;
  }
  if (profilePhotoUrl) {
    return profilePhotoUrl;
  }
  return AVAILABLE_AVATARS[0];
}

function presenceClass(status) {
  return PRESENCE_CHOICES.includes(status) ? status : 'offline';
}

function formatPresence(status) {
  return PRESENCE_LABELS[status] || PRESENCE_LABELS.offline;
}

function presenceSortValue(status) {
  if (typeof PRESENCE_RANK[status] === 'number') {
    return PRESENCE_RANK[status];
  }
  return PRESENCE_RANK.offline;
}

function decodeEntities(text = '') {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function sanitizeUrl(url) {
  if (!url) return null;
  try {
    const parsed = new URL(url, window.location.origin);
    const protocol = parsed.protocol.toLowerCase();
    if (protocol === 'http:' || protocol === 'https:') {
      return parsed.href;
    }
  } catch (err) {
    return null;
  }
  return null;
}

function renderPlainTextContent(text = '') {
  const escaped = escapeHtml(text);
  const blocks = escaped.split(/\n{2,}/).map((block) => block.replace(/\n/g, '<br />'));
  return blocks.map((block) => `<p>${block || '&nbsp;'}</p>`).join('');
}

// Configure marked.js for safe rendering
if (typeof marked !== 'undefined') {
  marked.setOptions({
    breaks: true,
    gfm: true,
    headerIds: false,
    mangle: false
  });
}

function renderMarkdownContent(text = '') {
  if (typeof marked === 'undefined') {
    // Fallback if marked.js not loaded
    return renderPlainTextContent(text);
  }
  try {
    // Use marked.js to parse markdown
    const html = marked.parse(text);
    // Sanitize links to ensure they use safe protocols
    return html.replace(
      /<a\s+href="([^"]*)"([^>]*)>/g,
      (match, href, rest) => {
        const safeUrl = sanitizeUrl(href);
        if (!safeUrl) {
          return '<a' + rest + '>';
        }
        return `<a href="${escapeHtml(safeUrl)}" target="_blank" rel="noopener"${rest}>`;
      }
    );
  } catch (err) {
    // Fallback on error
    return renderPlainTextContent(text);
  }
}

function renderMessageContent(message) {
  const raw = message?.content || message?.message || '';
  const format = (message?.format || 'text').toLowerCase();
  if (format === 'markdown') {
    return renderMarkdownContent(raw);
  }
  return renderPlainTextContent(raw);
}

function describeMessageStatus(message) {
  if (!message || message.status === 'delivered') {
    return 'Delivered';
  }
  if (message.status === 'failed') {
    return message.error ? `Failed: ${message.error}` : 'Failed to send';
  }
  return 'Sending…';
}

function withDeliveryStatus(message) {
  if (!message) return message;
  if (state.user && message.userId === state.user.id) {
    return { ...message, status: message.status || 'delivered' };
  }
  return { ...message };
}

function showToast(message, variant = 'info') {
  if (!el.toast) return;
  el.toast.textContent = message;
  el.toast.dataset.variant = variant;
  el.toast.classList.remove('hidden');
  clearTimeout(el.toast._timer);
  el.toast._timer = setTimeout(() => el.toast.classList.add('hidden'), 3000);
}

function ensureAudioContext() {
  const AudioCtor = window.AudioContext || window.webkitAudioContext;
  if (!AudioCtor) return Promise.resolve();
  if (!audioContext) {
    audioContext = new AudioCtor();
    audioMasterGain = audioContext.createGain();
    audioMasterGain.gain.value = state.chatVolume;
    audioMasterGain.connect(audioContext.destination);
  }
  if (audioContext.state === 'suspended') {
    return audioContext.resume().catch(() => {});
  }
  return Promise.resolve();
}

function playMessageSound() {
  if (state.chatVolume <= 0) return;
  ensureAudioContext().then(() => {
    if (!audioContext || !audioMasterGain) return;
    const osc = audioContext.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = 880;
    const gain = audioContext.createGain();
    gain.gain.value = 0;
    gain.connect(audioMasterGain);
    osc.connect(gain);
    const now = audioContext.currentTime;
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.5, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
    osc.start(now);
    osc.stop(now + 0.4);
    osc.onended = () => {
      osc.disconnect();
      gain.disconnect();
    };
  });
}

function setChatVolume(value) {
  const clamped = Math.min(1, Math.max(0, Number(value) || 0));
  state.chatVolume = clamped;
  localStorage.setItem('chat_volume', clamped.toString());
  if (audioMasterGain) {
    audioMasterGain.gain.value = clamped;
  }
  if (el.chatVolume) {
    el.chatVolume.value = Math.round(clamped * 100);
  }
}

function handleVolumeInput(event) {
  const sliderValue = Number(event.target.value);
  setChatVolume(sliderValue / 100);
  ensureAudioContext();
}

function clearTypingState() {
  state.typing.forEach((userMap) => {
    userMap.forEach((entry) => {
      clearTimeout(entry.timeout);
    });
  });
  state.typing.clear();
  renderTypingIndicator();
}

function ensureTypingMap(conversationId) {
  if (!state.typing.has(conversationId)) {
    state.typing.set(conversationId, new Map());
  }
  return state.typing.get(conversationId);
}

function clearTypingEntry(conversationId, userId) {
  const map = state.typing.get(conversationId);
  if (!map) return;
  const entry = map.get(userId);
  if (entry?.timeout) {
    clearTimeout(entry.timeout);
  }
  map.delete(userId);
  if (!map.size) {
    state.typing.delete(conversationId);
  }
}

function renderTypingIndicator() {
  if (!el.typingIndicator) return;
  const conversationId = state.activeConversationId;
  const map = conversationId ? state.typing.get(conversationId) : null;
  if (!conversationId || !map || !map.size) {
    el.typingIndicator.textContent = '';
    el.typingIndicator.classList.add('hidden');
    return;
  }
  const names = Array.from(map.values())
    .map((entry) => entry.name)
    .filter(Boolean);
  if (!names.length) {
    el.typingIndicator.textContent = '';
    el.typingIndicator.classList.add('hidden');
    return;
  }
  const display = names.slice(0, 3);
  const remaining = names.length - display.length;
  const summary =
    remaining > 0
      ? `${display.join(', ')} and ${remaining} other${remaining > 1 ? 's' : ''}`
      : display.join(', ');
  const plural = remaining > 0 || display.length > 1;
  el.typingIndicator.textContent = `${summary} ${plural ? 'are' : 'is'} typing…`;
  el.typingIndicator.classList.remove('hidden');
}

function clearThinkingState() {
  state.thinking.forEach((userMap) => {
    userMap.forEach((entry) => clearTimeout(entry.timeout));
  });
  state.thinking.clear();
  renderThinkingIndicator();
}

function ensureThinkingMap(conversationId) {
  if (!state.thinking.has(conversationId)) {
    state.thinking.set(conversationId, new Map());
  }
  return state.thinking.get(conversationId);
}

function clearThinkingEntry(conversationId, userId) {
  const map = state.thinking.get(conversationId);
  if (!map) return;
  const entry = map.get(userId);
  if (entry?.timeout) {
    clearTimeout(entry.timeout);
  }
  map.delete(userId);
  if (!map.size) {
    state.thinking.delete(conversationId);
  }
}

function renderThinkingIndicator() {
  if (!el.thinkingIndicator) return;
  const conversationId = state.activeConversationId;
  const map = conversationId ? state.thinking.get(conversationId) : null;
  if (!conversationId || !map || !map.size) {
    el.thinkingIndicator.textContent = '';
    el.thinkingIndicator.classList.add('hidden');
    return;
  }
  const names = Array.from(map.values())
    .map((entry) => entry.name)
    .filter(Boolean);
  if (!names.length) {
    el.thinkingIndicator.textContent = '';
    el.thinkingIndicator.classList.add('hidden');
    return;
  }
  const display = names.slice(0, 3);
  const remaining = names.length - display.length;
  const summary =
    remaining > 0
      ? `${display.join(', ')} and ${remaining} other${remaining > 1 ? 's' : ''}`
      : display.join(', ');
  const plural = remaining > 0 || display.length > 1;
  el.thinkingIndicator.textContent = `${summary} ${plural ? 'are' : 'is'} thinking…`;
  el.thinkingIndicator.classList.remove('hidden');
}

function handleThinkingUpdate(payload) {
  if (!payload || !payload.conversationId || !payload.userId) {
    return;
  }
  if (state.user && payload.userId === state.user.id) {
    return;
  }
  const { conversationId, userId } = payload;
  if (!payload.thinking) {
    clearThinkingEntry(conversationId, userId);
  } else {
    const map = ensureThinkingMap(conversationId);
    clearThinkingEntry(conversationId, userId);
    const timeout = setTimeout(() => {
      clearThinkingEntry(conversationId, userId);
      if (state.activeConversationId === conversationId) {
        renderThinkingIndicator();
      }
    }, THINKING_EXPIRATION_MS);
    map.set(userId, {
      name: payload.displayName || payload.username || 'Someone',
      timeout
    });
  }
  if (state.activeConversationId === conversationId) {
    renderThinkingIndicator();
  }
}

function handleTypingUpdate(payload) {
  if (!payload || !payload.conversationId || !payload.userId) {
    return;
  }
  if (state.user && payload.userId === state.user.id) {
    return;
  }
  const { conversationId, userId } = payload;
  if (!payload.typing) {
    clearTypingEntry(conversationId, userId);
  } else {
    const map = ensureTypingMap(conversationId);
    clearTypingEntry(conversationId, userId);
    const timeout = setTimeout(() => {
      clearTypingEntry(conversationId, userId);
      if (state.activeConversationId === conversationId) {
        renderTypingIndicator();
      }
    }, TYPING_EXPIRATION_MS);
    map.set(userId, {
      name: payload.displayName || payload.username || 'Someone',
      timeout
    });
  }
  if (state.activeConversationId === conversationId) {
    renderTypingIndicator();
  }
}

function handleReadReceipt(payload) {
  if (!payload || !payload.conversationId || !payload.messageId) {
    return;
  }
  const { conversationId, userId, messageId } = payload;
  // Store the last read message ID for this bot in this conversation
  if (!state.botReadReceipts.has(conversationId)) {
    state.botReadReceipts.set(conversationId, new Map());
  }
  state.botReadReceipts.get(conversationId).set(userId, messageId);
  // Re-render messages if viewing this conversation
  if (state.activeConversationId === conversationId) {
    renderMessages();
  }
}

function getMessageReadStatus(conversationId, messageId, senderId) {
  // Only show read status for messages sent by the current user
  if (!state.user || senderId !== state.user.id) {
    return null;
  }
  const receipts = state.botReadReceipts.get(conversationId);
  if (!receipts || receipts.size === 0) {
    return 'sent'; // No bot has read any messages yet
  }
  // Check if any bot has read up to or past this message
  const messages = state.messageCache.get(conversationId) || [];
  const msgIndex = messages.findIndex((m) => m.id === messageId);
  if (msgIndex === -1) return 'sent';

  for (const [botId, lastReadId] of receipts) {
    const readIndex = messages.findIndex((m) => m.id === lastReadId);
    if (readIndex >= msgIndex) {
      return 'seen'; // Bot has read this message
    }
  }
  return 'sent';
}

function socketIsOpen() {
  return state.socket && state.socket.readyState === WebSocket.OPEN;
}

function sendTypingSignal(active, conversationId = state.activeConversationId) {
  if (!socketIsOpen() || !conversationId) return;
  state.socket.send(
    JSON.stringify({
      type: 'typing',
      conversationId,
      typing: Boolean(active)
    })
  );
}

function notifyTypingActivity() {
  if (!state.activeConversationId) return;
  if (!socketIsOpen()) return;
  const conversationId = state.activeConversationId;
  selfTypingConversationId = conversationId;
  if (!selfTypingActive) {
    selfTypingActive = true;
    sendTypingSignal(true, conversationId);
  }
  clearTimeout(selfTypingTimeout);
  selfTypingTimeout = setTimeout(() => {
    if (!selfTypingActive) return;
    sendTypingSignal(false, conversationId);
    selfTypingActive = false;
    if (selfTypingConversationId === conversationId) {
      selfTypingConversationId = null;
    }
  }, TYPING_EXPIRATION_MS);
}

function resetSelfTyping(forceConversationId) {
  const targetConversationId = forceConversationId || selfTypingConversationId || state.activeConversationId;
  if (selfTypingActive && targetConversationId) {
    sendTypingSignal(false, targetConversationId);
  }
  selfTypingActive = false;
  selfTypingConversationId = null;
  clearTimeout(selfTypingTimeout);
}

function setToken(token) {
  state.token = token;
  if (token) {
    localStorage.setItem('chat_token', token);
  } else {
    localStorage.removeItem('chat_token');
  }
}

function authFetch(path, options = {}) {
  const headers = { ...(options.headers || {}) };
  if (state.token) {
    headers.Authorization = `Bearer ${state.token}`;
  }
  if (!(options.body instanceof FormData) && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }
  return fetch(path, {
    ...options,
    headers
  }).then(async (res) => {
    if (res.status === 401) {
      logout();
      throw new Error('Session expired');
    }
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || 'Request failed');
    }
    return res.json();
  });
}

function validateImageFile(file) {
  if (!file) return false;
  const validTypes = ['image/jpeg', 'image/png'];
  if (!validTypes.includes(file.type)) {
    showToast('Only JPEG or PNG files are allowed', 'error');
    return false;
  }
  if (file.size > 2 * 1024 * 1024) {
    showToast('Images must be 2 MB or smaller', 'error');
    return false;
  }
  return true;
}

function uploadImage(scope, file) {
  const formData = new FormData();
  formData.append('image', file);
  return authFetch(`/api/uploads/images?scope=${scope}`, {
    method: 'POST',
    body: formData
  });
}

async function handleImageUpload(event, scope) {
  const file = event.target.files?.[0];
  if (!file || !validateImageFile(file)) {
    event.target.value = '';
    return;
  }
  try {
    showToast('Uploading image...', 'info');
    const { url } = await uploadImage(scope, file);
    if (scope === 'photo') {
      if (el.profilePhotoField) {
        el.profilePhotoField.value = url;
      }
      if (el.profilePhotoPreview) {
        el.profilePhotoPreview.src = url;
        el.profilePhotoPreview.classList.remove('placeholder');
      }
    } else {
      if (el.avatarUrlField) {
        el.avatarUrlField.value = url;
      }
      if (el.avatarPreview) {
        el.avatarPreview.src = url;
        el.avatarPreview.classList.remove('placeholder');
      }
      if (el.customAvatarPreview) {
        el.customAvatarPreview.src = url;
      }
      if (el.customAvatarOption) {
        el.customAvatarOption.classList.remove('hidden');
        const input = el.customAvatarOption.querySelector('input');
        if (input) {
          input.value = url;
          input.checked = true;
        }
      }
      highlightAvatarChoice();
    }
    showToast('Image uploaded', 'success');
  } catch (error) {
    showToast(error.message || 'Unable to upload image', 'error');
  } finally {
    event.target.value = '';
  }
}

async function setPresenceStatus(status, showFeedback = false) {
  if (!PRESENCE_CHOICES.includes(status)) return;
  try {
    const res = await authFetch('/api/users/me/profile', {
      method: 'PUT',
      body: JSON.stringify({ presenceStatus: status })
    });
    state.user = res.profile;
    updateUserCard();
    if (showFeedback) {
      showToast(`Status set to ${PRESENCE_LABELS[status]}`, 'success');
    }
  } catch (error) {
    showToast(error.message || 'Unable to update status', 'error');
  }
}

function toggleDndMode() {
  const next = state.user?.presenceStatus === 'dnd' ? 'online' : 'dnd';
  setPresenceStatus(next, true);
}

function updateShellVisibility() {
  const authenticated = Boolean(state.user && state.token);
  el.authPanel.classList.toggle('hidden', authenticated);
  el.chatApp.classList.toggle('hidden', !authenticated);
}

function updateTheme() {
  if (!state.user) return;
  const theme = state.user.profileTheme || 'light';
  document.body.dataset.theme = theme;
  const accent = state.user.accentColor || '#2563eb';
  document.documentElement.style.setProperty('--accent-color', accent);
  document.documentElement.style.setProperty('--accent-color-dark', accent);
}

function updatePresenceBadge(status) {
  if (!el.currentUserPresence) return;
  const cls = presenceClass(status);
  el.currentUserPresence.className = `presence-dot ${cls}`;
  el.currentUserPresence.title = formatPresence(status);
}

function updateUserCard() {
  if (!state.user) return;
  document.body.dataset.role = state.user.role;
  el.currentUserName.textContent = state.user.displayName;
  el.currentUserRole.innerHTML = `@${escapeHtml(state.user.username)} ${renderRoleBadge(state.user.role)}`;
  el.currentUserAvatar.src = resolveAvatar(state.user.avatarUrl, state.user.profilePhotoUrl);
  if (el.mobileUserAvatar) {
    el.mobileUserAvatar.src = resolveAvatar(state.user.avatarUrl, state.user.profilePhotoUrl);
  }
  updatePresenceBadge(state.user.presenceStatus);
  if (el.dndToggle) {
    const dndActive = state.user.presenceStatus === 'dnd';
    el.dndToggle.classList.toggle('active', dndActive);
    el.dndToggle.textContent = dndActive ? 'DND Enabled' : 'Do Not Disturb';
  }
  updateAdminLink();
  updateRoomControls();
  updateProfileForm();
  updateTheme();
  applyPresenceSnapshot(state.user);
}

function updateAdminLink() {
  if (!el.adminLink) return;
  const show = isAdmin();
  el.adminLink.classList.toggle('hidden', !show);
}

function updateRoomControls() {
  if (!el.createRoomBtn) return;
  el.createRoomBtn.classList.toggle('hidden', !canModerateRooms());
}

function setView(view) {
  state.view = view;
  if (el.chatPage && el.profilePage) {
    el.chatPage.classList.toggle('hidden', view !== 'chat');
    el.profilePage.classList.toggle('hidden', view !== 'profile');
  }
  if (el.tabChat && el.tabProfile) {
    el.tabChat.classList.toggle('active', view === 'chat');
    el.tabProfile.classList.toggle('active', view === 'profile');
  }
  if (view === 'profile') {
    loadProfile(true);
  }
  // Close sidebar on mobile when view changes
  closeSidebar();
}

function populateAvatarChoices() {
  if (!el.avatarChoices) return;
  const defaultOptions = AVAILABLE_AVATARS.map(
    (url, idx) => `
      <label class="avatar-option" data-avatar="${url}">
        <input type="radio" name="avatarChoice" value="${url}" />
        <img src="${url}" alt="Avatar ${idx + 1}" />
        <span>Icon ${idx + 1}</span>
      </label>
    `
  ).join('');
  el.avatarChoices.innerHTML = `
    ${defaultOptions}
    <label class="avatar-option hidden" id="customAvatarOption">
      <input type="radio" name="avatarChoice" value="" />
      <img src="/assets/avatars/avatar-blue.svg" alt="Custom avatar" id="customAvatarPreview" />
      <span>Uploaded</span>
    </label>
  `;
  el.customAvatarOption = document.getElementById('customAvatarOption');
  el.customAvatarPreview = document.getElementById('customAvatarPreview');
  el.avatarChoices.addEventListener('change', (event) => {
    const target = event.target;
    if (target && target.name === 'avatarChoice' && el.avatarUrlField) {
      el.avatarUrlField.value = target.value;
      if (el.avatarPreview && target.value) {
        el.avatarPreview.src = target.value;
        el.avatarPreview.classList.remove('placeholder');
      }
      highlightAvatarChoice();
    }
  });
}

function highlightAvatarChoice() {
  if (!el.avatarChoices || !el.avatarUrlField) return;
  const current = el.avatarUrlField.value || '';
  const options = el.avatarChoices.querySelectorAll('.avatar-option');
  options.forEach((option) => {
    const input = option.querySelector('input');
    if (!input) return;
    const selected = current && input.value === current;
    option.classList.toggle('selected', selected);
    input.checked = selected;
  });
  const hasCustom = current && !BUILTIN_AVATARS.has(current);
  if (el.customAvatarOption) {
    el.customAvatarOption.classList.toggle('hidden', !hasCustom);
    const customInput = el.customAvatarOption.querySelector('input');
    if (customInput) {
      customInput.value = current;
      customInput.checked = hasCustom;
    }
  }
  if (hasCustom && el.customAvatarPreview) {
    el.customAvatarPreview.src = current;
  }
  if (el.avatarPreview) {
    const fallback =
      current ||
      state.user?.avatarUrl ||
      state.user?.profilePhotoUrl ||
      AVAILABLE_AVATARS[0];
    el.avatarPreview.src = fallback;
    el.avatarPreview.classList.toggle('placeholder', !current);
  }
}

function updateProfileForm() {
  if (!state.user || !el.profileForm) return;
  const form = el.profileForm;
  form.displayName.value = state.user.displayName || '';
  form.bio.value = state.user.bio || '';
  form.birthday.value = state.user.birthday || '';
  form.profileTheme.value = state.user.profileTheme || 'light';
  form.accentColor.value = state.user.accentColor || '#2563eb';
  if (form.profilePhotoUrl) {
    form.profilePhotoUrl.value = state.user.profilePhotoUrl || '';
  }
  if (el.profilePhotoField) {
    el.profilePhotoField.value = state.user.profilePhotoUrl || '';
  }
  if (el.profilePhotoPreview) {
    const photoSrc = state.user.profilePhotoUrl || state.user.avatarUrl || AVAILABLE_AVATARS[0];
    el.profilePhotoPreview.src = photoSrc;
    el.profilePhotoPreview.classList.toggle('placeholder', !state.user.profilePhotoUrl);
  }
  if (form.avatarUrl) {
    form.avatarUrl.value = state.user.avatarUrl || '';
  }
  if (el.avatarUrlField) {
    el.avatarUrlField.value = state.user.avatarUrl || '';
  }
  if (el.avatarPreview) {
    const avatarSrc =
      state.user.avatarUrl || state.user.profilePhotoUrl || AVAILABLE_AVATARS[0];
    el.avatarPreview.src = avatarSrc;
    el.avatarPreview.classList.toggle('placeholder', !state.user.avatarUrl);
  }
  if (el.managerTokenGroup) {
    el.managerTokenGroup.classList.toggle('hidden', !state.user.manager);
  }
  if (form.managerToken) {
    form.managerToken.value = state.user.manager ? state.user.managerToken || '' : '';
  }
  if (el.presenceStatusSelect) {
    el.presenceStatusSelect.value = state.user.presenceStatus || 'online';
  }
  if (el.idleTimeoutInput) {
    el.idleTimeoutInput.value = state.user.idleTimeoutMinutes || 5;
  }
  highlightAvatarChoice();
}

async function handleLogin(event) {
  event.preventDefault();
  const form = new FormData(event.target);
  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: form.get('username'),
        password: form.get('password')
      })
    }).then(async (resp) => {
      if (!resp.ok) {
        const body = await resp.json().catch(() => ({}));
        throw new Error(body.error || 'Login failed');
      }
      return resp.json();
    });
    await bootstrapSession(res.token, res.user);
  } catch (error) {
    showToast(error.message || 'Unable to log in', 'error');
  }
}

async function bootstrapSession(token, user) {
  setToken(token);
  state.user = user;
  updateUserCard();
  updateShellVisibility();
  await Promise.all([loadConversations(), loadRooms(), loadApprovalsPanel(false)]);
  await loadProfile(true);
  connectSocket();
}

async function fetchCurrentUser() {
  if (!state.token) return;
  try {
    const res = await authFetch('/api/auth/me');
    state.user = res.user;
    updateUserCard();
    updateShellVisibility();
    await Promise.all([loadConversations(), loadRooms(), loadApprovalsPanel(false)]);
    await loadProfile(true);
    connectSocket();
  } catch (error) {
    showToast(error.message || 'Failed to resume session', 'error');
  }
}

function logout() {
  setToken(null);
  state.user = null;
  state.conversations = [];
  state.rooms = [];
  state.activeConversationId = null;
  state.approvalsIncoming = [];
  state.approvalsOutgoing = [];
  state.messageCache.clear();
  state.presence.clear();
  resetSelfTyping();
  clearTypingState();
  clearThinkingState();
  closeDirectMessageDialog();
  clearTimeout(state.reconnectTimer);
  if (state.socket) {
    state.socket.close();
    state.socket = null;
  }
  updateConnectionBadge(false);
  document.body.removeAttribute('data-role');
  updateShellVisibility();
  renderConversationList();
  renderRoomList();
  if (el.adminLink) {
    el.adminLink.classList.add('hidden');
  }
  if (el.managerTokenGroup) {
    el.managerTokenGroup.classList.add('hidden');
  }
  clearApprovalsAlert();
  renderApprovalsPanel();
  closeSidebar();
}

async function loadConversations() {
  if (!state.token) return;
  try {
    const res = await authFetch('/api/conversations');
    state.conversations = res.conversations || [];
    ingestPresenceFromConversations();
    renderConversationList();
    syncRoomMembershipFromConversations();
    ensureInitialConversation();
  } catch (error) {
    showToast(error.message || 'Unable to load conversations', 'error');
  }
}

function ensureInitialConversation() {
  if (
    state.activeConversationId &&
    state.conversations.some((conversation) => conversation.id === state.activeConversationId)
  ) {
    updateChatHeader();
    return;
  }
  if (state.user?.lastRoomId) {
    const preferred = state.conversations.find((conversation) => conversation.id === state.user.lastRoomId);
    if (preferred) {
      setActiveConversation(preferred.id, { silentRoomActivate: true });
      return;
    }
  }
  const fallback = state.conversations[0];
  if (fallback) {
    setActiveConversation(fallback.id, { silentRoomActivate: fallback.type === 'room' });
  } else {
    state.activeConversationId = null;
    updateChatHeader();
  }
}

function ingestPresenceFromConversations() {
  state.conversations.forEach((conversation) => {
    (conversation.members || []).forEach((member) => applyPresenceSnapshot(member));
  });
}

function applyPresenceSnapshot(user) {
  if (!user || !user.id) return;
  state.presence.set(user.id, {
    presenceStatus: user.presenceStatus || 'offline',
    lastSeenAt: user.lastSeenAt || null,
    avatarUrl: user.avatarUrl || '',
    profilePhotoUrl: user.profilePhotoUrl || ''
  });
}

async function loadRooms() {
  if (!state.token) return;
  try {
    const res = await authFetch('/api/rooms');
    const previousRequests = state.roomRequests || new Map();
    state.rooms = res.rooms || [];
    const preserved = new Map();
    state.rooms.forEach((room) => {
      const existing = previousRequests.get(room.id);
      if (existing) {
        preserved.set(room.id, existing);
      }
    });
    state.roomRequests = preserved;
    state.rooms.forEach((room) => {
      (room.members || []).forEach((member) => applyPresenceSnapshot(member));
    });
    syncRoomMembershipFromConversations();
  } catch (error) {
    showToast(error.message || 'Unable to load rooms', 'error');
  }
}

function syncRoomMembershipFromConversations() {
  const memberIds = new Set(
    state.conversations.filter((c) => c.type === 'room').map((conversation) => conversation.id)
  );
  state.rooms = state.rooms.map((room) => ({
    ...room,
    isMember: memberIds.has(room.id)
  }));
  renderRoomList();
}

async function loadProfile(silent = false) {
  if (!state.token) return;
  try {
    const res = await authFetch('/api/users/me/profile');
    state.user = { ...(state.user || {}), ...(res.profile || {}) };
    updateUserCard();
  } catch (error) {
    if (!silent) {
      showToast(error.message || 'Unable to load profile', 'error');
    }
  }
}

function saveHiddenConversations() {
  try {
    localStorage.setItem('hidden_conversations', JSON.stringify([...state.hiddenConversations]));
  } catch {
    // Ignore storage errors
  }
}

function hideConversation(conversationId) {
  state.hiddenConversations.add(conversationId);
  saveHiddenConversations();
  renderConversationList();
  showToast('Conversation hidden', 'info');
}

function unhideConversation(conversationId) {
  state.hiddenConversations.delete(conversationId);
  saveHiddenConversations();
  renderConversationList();
  showToast('Conversation restored', 'info');
}

function toggleShowHiddenConversations() {
  state.showHiddenConversations = !state.showHiddenConversations;
  renderConversationList();
}

function renderConversationList() {
  if (!state.user) {
    el.conversationList.innerHTML = '';
    return;
  }
  const threads = state.conversations.filter((conversation) => conversation.type !== 'room');
  const hiddenCount = threads.filter((c) => state.hiddenConversations.has(c.id)).length;
  const visibleThreads = state.showHiddenConversations
    ? threads
    : threads.filter((c) => !state.hiddenConversations.has(c.id));
  const list = visibleThreads
    .slice()
    .sort((a, b) => {
      const aTime = new Date(a.lastMessageAt || a.createdAt).getTime();
      const bTime = new Date(b.lastMessageAt || b.createdAt).getTime();
      return bTime - aTime;
    })
    .map((conversation) => {
      const isHidden = state.hiddenConversations.has(conversation.id);
      const peers = (conversation.members || []).filter((member) => member.id !== state.user.id);
      const target = conversation.type === 'direct' ? peers[0] : null;
      const title =
        conversation.type === 'direct'
          ? peers.map((member) => member.displayName || member.username).join(', ') || 'Direct message'
          : conversation.title || 'Group chat';
      const preview = conversation.lastMessage
        ? `${conversation.lastMessage.slice(0, 60)}${
            conversation.lastMessage.length > 60 ? '…' : ''
          }`
        : 'No messages yet';
      const active = conversation.id === state.activeConversationId ? 'active' : '';
      const avatarTarget = target || peers[0];
      const avatarUrl = resolveAvatar(avatarTarget?.avatarUrl, avatarTarget?.profilePhotoUrl);
      const presenceCls = target ? presenceClass(target.presenceStatus) : 'offline';
      const presenceText = target ? formatPresence(target.presenceStatus) : '';
      const hideBtn = isHidden
        ? `<button class="conversation-action unhide-dm" data-id="${conversation.id}" title="Show conversation">↩</button>`
        : `<button class="conversation-action hide-dm" data-id="${conversation.id}" title="Hide conversation">✕</button>`;
      const hiddenClass = isHidden ? ' hidden-conversation' : '';
      return `
        <div class="conversation ${active}${hiddenClass}" data-id="${conversation.id}">
          <img class="conversation-avatar" src="${avatarUrl}" alt="${escapeHtml(
        (avatarTarget && avatarTarget.displayName) || 'Conversation'
      )}" />
          <div class="conversation-details">
            <h4>${escapeHtml(title)} ${target ? renderRoleBadge(target.role) : ''}</h4>
            <p>${escapeHtml(preview)}</p>
            ${target ? `<span class="presence-pill ${presenceCls}">${presenceText}</span>` : ''}
          </div>
          ${hideBtn}
        </div>
      `;
    })
    .join('');
  const hiddenToggle = hiddenCount > 0
    ? `<button class="toggle-hidden-btn ghost small" id="toggleHiddenDMs">${
        state.showHiddenConversations ? 'Hide' : 'Show'
      } ${hiddenCount} hidden</button>`
    : '';
  el.conversationList.innerHTML = (list || '<p class="muted">No conversations yet.</p>') + hiddenToggle;
}

function renderRoomList() {
  if (!el.roomsList) return;
  if (!state.rooms.length) {
    el.roomsList.innerHTML = '<p class="muted">No rooms are available.</p>';
    return;
  }
  const cards = state.rooms
    .map((room) => {
      const isActive = state.activeConversationId === room.id;
      const count = room.memberCount || 0;
      const countLabel = `${count} member${count === 1 ? '' : 's'}`;
      const membershipBadge = room.banned
        ? '<span class="room-badge banned">Banned</span>'
        : room.isMember
        ? '<span class="room-badge member">Joined</span>'
        : '';
      let actions = '';
      if (!room.banned) {
        if (room.isMember) {
          actions = `<button class="ghost tiny enter-room" data-room="${room.id}">Open</button>`;
        } else if (room.isPublic) {
          actions = `<button class="ghost tiny join-room" data-room="${room.id}">Join</button>`;
        } else {
          const status = room.joinRequestStatus || '';
          if (status === 'pending') {
            actions = '<button class="ghost tiny" disabled>Requested</button>';
          } else {
            const label = status === 'denied' ? 'Request again' : 'Request access';
            actions = `<button class="ghost tiny request-room" data-room-action="request-access" data-room="${room.id}">${label}</button>`;
          }
        }
      }
      const visibilityBadge = `<span class="room-visibility ${room.isPublic ? 'public' : 'private'}">${
        room.isPublic ? 'Public' : 'Private'
      }</span>`;
      const pendingCount =
        canModerateRooms() && room.isMember && room.pendingRequestCount
          ? `<span class="room-badge requests">${room.pendingRequestCount} pending</span>`
          : '';
      const badgeGroup = [visibilityBadge, membershipBadge, pendingCount].filter(Boolean).join('');
      let detailsMarkup = '';
      if (isActive) {
        const members = Array.isArray(room.members) ? room.members.slice() : [];
        members.sort((a, b) => {
          const rankDiff = presenceSortValue(a.presenceStatus) - presenceSortValue(b.presenceStatus);
          if (rankDiff !== 0) {
            return rankDiff;
          }
          return (a.displayName || '').localeCompare(b.displayName || '');
        });
        const memberChips = members.length
          ? members
              .map((member) => {
                const statusCls = presenceClass(member.presenceStatus);
                const statusText = formatPresence(member.presenceStatus);
                const label = escapeHtml(member.displayName || 'Member');
                const botBadge = member.bot ? '<span class="bot-badge">BOT</span>' : '';
                const dmButton =
                  member.id && member.id !== state.user?.id
                    ? `<button type="button" class="ghost tiny dm-user" data-user="${member.id}" title="Message ${label}">Message</button>`
                    : '';
                return `
                  <div class="room-member-chip">
                    <span class="chip-name">${label}${botBadge}</span>
                    <span class="presence-pill ${statusCls}">${statusText}</span>
                    ${dmButton}
                  </div>
                `;
              })
              .join('')
          : '<p class="muted small">No members yet.</p>';
        const moderatorTools =
          canModerateRooms() && room.isMember
            ? `<div class="room-moderation">
                <button type="button" class="ghost tiny" data-room-action="add-member" data-room="${room.id}">Add member</button>
                <button type="button" class="ghost tiny" data-room-action="toggle-visibility" data-room="${
                  room.id
                }" data-public="${room.isPublic ? 'true' : 'false'}">${
                room.isPublic ? 'Make private' : 'Make public'
              }</button>
                <button type="button" class="ghost tiny" data-room-action="view-requests" data-room="${room.id}">Requests${
                room.pendingRequestCount ? ` (${room.pendingRequestCount})` : ''
              }</button>
              </div>`
            : '';
        const requestsSection = renderRoomRequestsSection(room);
        const detailSections = [
          `<div class="room-member-list">${memberChips}</div>`,
          moderatorTools,
          requestsSection
        ].filter(Boolean);
        if (detailSections.length) {
          detailsMarkup = `<div class="room-row-details">${detailSections.join('')}</div>`;
        }
      }
      const rowClasses = ['room-row'];
      if (room.isMember) {
        rowClasses.push('joinable');
      }
      if (isActive) {
        rowClasses.push('active', 'expanded');
      }
      return `
        <div class="${rowClasses.join(' ')}" data-room="${room.id}" aria-expanded="${
        isActive ? 'true' : 'false'
      }">
          <div class="room-row-main">
            <div class="room-row-info">
              <span class="room-name" title="${escapeHtml(room.title || 'Room')}">${escapeHtml(
        room.title || 'Room'
      )}</span>
              <span class="room-count">${countLabel}</span>
              ${badgeGroup}
            </div>
            <div class="room-row-actions">
              ${actions || ''}
            </div>
          </div>
          ${detailsMarkup}
        </div>
      `;
    })
    .join('');
  el.roomsList.innerHTML = cards;
}

function renderRoomRequestsSection(room) {
  if (!canModerateRooms() || !room.isMember) {
    return '';
  }
  if (!state.roomRequests.has(room.id)) {
    return '';
  }
  const requests = state.roomRequests.get(room.id) || [];
  if (!requests.length) {
    return '<div class="room-request-list empty"><p class="muted small">No pending requests.</p></div>';
  }
  const items = requests
    .map((request) => {
      const requester = request.requester || {};
      const name = escapeHtml(requester.displayName || requester.username || 'User');
      const username = requester.username ? `@${escapeHtml(requester.username)}` : '';
      const presenceCls = presenceClass(requester.presenceStatus);
      return `
        <div class="room-request-item">
          <div>
            <strong>${name}</strong>
            <span class="muted small">${username}</span>
            <span class="presence-pill ${presenceCls}">${formatPresence(requester.presenceStatus)}</span>
          </div>
          <div class="room-request-actions">
            <button type="button" class="ghost tiny" data-room-action="respond-request" data-room="${room.id}" data-request="${
        request.id
      }" data-decision="approved">Approve</button>
            <button type="button" class="ghost tiny danger" data-room-action="respond-request" data-room="${room.id}" data-request="${
        request.id
      }" data-decision="denied">Deny</button>
          </div>
        </div>
      `;
    })
    .join('');
  return `<div class="room-request-list">${items}</div>`;
}

function setActiveConversation(conversationId, options = {}) {
  if (!conversationId) return;
  if (state.activeConversationId && state.activeConversationId !== conversationId) {
    resetSelfTyping(state.activeConversationId);
  }
  state.activeConversationId = conversationId;
  const conversation = state.conversations.find((c) => c.id === conversationId);
  if (conversation && conversation.type === 'room' && !options.silentRoomActivate) {
    activateRoomSelection(conversationId);
  }
  updateChatHeader();
  renderConversationList();
  renderRoomList();
  renderTypingIndicator();
  renderThinkingIndicator();
  loadMessages(conversationId);
  // Close sidebar on mobile when conversation is selected
  closeSidebar();
}

async function activateRoomSelection(roomId) {
  try {
    await authFetch(`/api/rooms/${roomId}/activate`, { method: 'POST' });
    state.user = { ...(state.user || {}), lastRoomId: roomId };
  } catch (error) {
    showToast(error.message || 'Unable to activate room', 'error');
  }
}

async function loadMessages(conversationId) {
  if (!conversationId) return;
  try {
    const [messagesRes, receiptsRes] = await Promise.all([
      authFetch(`/api/conversations/${conversationId}/messages`),
      authFetch(`/api/conversations/${conversationId}/read-receipts`).catch(() => ({ receipts: [] }))
    ]);
    const normalized = (messagesRes.messages || []).map((message) => withDeliveryStatus(message));
    state.messageCache.set(conversationId, normalized);

    // Store bot read receipts
    if (receiptsRes.receipts && receiptsRes.receipts.length > 0) {
      if (!state.botReadReceipts.has(conversationId)) {
        state.botReadReceipts.set(conversationId, new Map());
      }
      const receiptMap = state.botReadReceipts.get(conversationId);
      receiptsRes.receipts.forEach((r) => {
        receiptMap.set(r.userId, r.lastReadMessageId);
      });
    }

    if (state.activeConversationId === conversationId) {
      renderMessages();
    }
  } catch (error) {
    showToast(error.message || 'Unable to load messages', 'error');
  }
}

function renderMessages() {
  if (!state.user) return;
  const conversationId = state.activeConversationId;
  const messages = state.messageCache.get(conversationId) || [];
  const conversation = state.conversations.find((c) => c.id === conversationId);
  const hasBot = conversation?.members?.some((m) => m.bot) || false;

  el.messageList.innerHTML = messages
    .map((msg) => {
      const mine = msg.userId === state.user.id;
      const mineClass = mine ? 'me' : '';
      const time = new Date(msg.createdAt).toLocaleTimeString();
      const displayName = escapeHtml(msg.displayName || 'Unknown');
      const badge = renderRoleBadge(msg.role);
      const botBadge = msg.bot ? '<span class="bot-badge">BOT</span>' : '';
      const contentHtml = renderMessageContent(msg);
      const snapshot = state.presence.get(msg.userId);
      const avatarUrl = resolveAvatar(msg.avatarUrl || snapshot?.avatarUrl, msg.profilePhotoUrl || snapshot?.profilePhotoUrl);
      const statusCls = presenceClass(snapshot?.presenceStatus);

      // Build delivery status for messages to bots
      let deliveryIcon = '';
      if (mine && hasBot && !msg.pending) {
        const readStatus = getMessageReadStatus(conversationId, msg.id, msg.userId);
        if (readStatus === 'seen') {
          deliveryIcon = '<span class="delivery-icon seen" title="Seen by bot">✓✓</span>';
        } else {
          deliveryIcon = '<span class="delivery-icon sent" title="Sent">✓</span>';
        }
      } else if (mine && msg.pending) {
        deliveryIcon = '<span class="delivery-icon sending" title="Sending...">○</span>';
      }

      const statusText = mine && !hasBot ? describeMessageStatus(msg) : '';
      const statusMarkup = statusText
        ? `<div class="message-status ${msg.status || ''}">${escapeHtml(statusText)}</div>`
        : '';
      return `
        <div class="message ${mineClass}">
          <div class="message-avatar-wrapper">
            <img class="message-avatar" src="${avatarUrl}" alt="${displayName}" />
            <span class="presence-dot ${statusCls}"></span>
          </div>
          <div class="message-body">
            <strong class="message-author">${displayName}${botBadge}${badge ? ` ${badge}` : ''}</strong>
            <div class="message-content" data-format="${msg.format || 'text'}">${contentHtml}</div>
            <small>${time}${deliveryIcon}</small>
            ${statusMarkup}
          </div>
        </div>
      `;
    })
    .join('');
  el.messageList.scrollTop = el.messageList.scrollHeight;
}

function updateChatHeader() {
  if (!state.user) return;
  const conversation = state.conversations.find((c) => c.id === state.activeConversationId);
  if (el.addRoomMemberBtn) {
    const allowInvite = Boolean(conversation && conversation.type === 'room' && canModerateRooms());
    el.addRoomMemberBtn.classList.toggle('hidden', !allowInvite);
    el.addRoomMemberBtn.dataset.roomId = allowInvite ? conversation.id : '';
  }
  if (!conversation) {
    el.chatTitle.textContent = 'Select a conversation';
    el.chatMembers.textContent = '';
    return;
  }
  const peers = (conversation.members || []).filter((member) => member.id !== state.user.id);
  const title =
    conversation.type === 'direct'
      ? peers.map((m) => m.displayName).join(', ') || 'Direct message'
      : conversation.title || 'Group chat';
  el.chatTitle.textContent = title;
  const chips = peers
    .map((member) => {
      const badge = renderRoleBadge(member.role);
      const botBadge = member.bot ? '<span class="bot-badge">BOT</span>' : '';
      const presence = `<span class="presence-pill ${presenceClass(
        member.presenceStatus
      )}">${formatPresence(member.presenceStatus)}</span>`;
      const allowBan =
        conversation.type === 'room' &&
        canModerateRooms() &&
        member.id !== state.user.id &&
        member.role !== 'admin';
      const banButton = allowBan
        ? `<button class="chip-action" data-action="ban" data-user="${member.id}">Ban</button>`
        : '';
      return `<span class="member-chip" data-user="${member.id}">
        ${escapeHtml(member.displayName || 'Member')}${botBadge} ${badge || ''} ${presence}
        ${banButton}
      </span>`;
    })
    .join('');
  el.chatMembers.innerHTML = chips;
}


async function handleMessageSend(event) {
  event.preventDefault();
  if (!state.activeConversationId) {
    showToast('Select a conversation first', 'error');
    return;
  }
  const content = el.messageInput.value.trim();
  if (!content) return;
  const conversationId = state.activeConversationId;
  const tempId = `local-${Date.now()}`;
  const format = state.markdownMode ? 'markdown' : 'text';
  const optimisticMessage = {
    id: tempId,
    content,
    format,
    createdAt: new Date().toISOString(),
    userId: state.user.id,
    displayName: state.user.displayName || state.user.username,
    role: state.user.role,
    avatarUrl: state.user.avatarUrl,
    profilePhotoUrl: state.user.profilePhotoUrl,
    status: 'sending',
    pending: true
  };
  addOptimisticMessage(conversationId, optimisticMessage);
  el.messageInput.value = '';
  resetSelfTyping();
  try {
    const res = await authFetch(`/api/conversations/${conversationId}/messages`, {
      method: 'POST',
      body: JSON.stringify({ content, format })
    });
    finalizeOptimisticMessage(conversationId, tempId, res.message);
  } catch (error) {
    failOptimisticMessage(conversationId, tempId, error.message);
    showToast(error.message || 'Failed to send message', 'error');
  }
}

function addOptimisticMessage(conversationId, message) {
  const cache = [...(state.messageCache.get(conversationId) || [])];
  cache.push(message);
  state.messageCache.set(conversationId, cache);
  if (state.activeConversationId === conversationId) {
    renderMessages();
  }
}

function finalizeOptimisticMessage(conversationId, tempId, persistedMessage) {
  const cache = [...(state.messageCache.get(conversationId) || [])].filter((msg) => msg.id !== tempId);
  const delivered = withDeliveryStatus(persistedMessage);
  const existingIndex = cache.findIndex((msg) => msg.id === delivered.id);
  if (existingIndex >= 0) {
    cache[existingIndex] = { ...cache[existingIndex], ...delivered };
  } else {
    cache.push(delivered);
  }
  state.messageCache.set(conversationId, cache);
  if (state.activeConversationId === conversationId) {
    renderMessages();
  }
}

function failOptimisticMessage(conversationId, tempId, errorMessage) {
  const cache = [...(state.messageCache.get(conversationId) || [])];
  const index = cache.findIndex((msg) => msg.id === tempId);
  if (index >= 0) {
    cache[index] = {
      ...cache[index],
      status: 'failed',
      pending: false,
      error: errorMessage || 'Unable to send'
    };
    state.messageCache.set(conversationId, cache);
    if (state.activeConversationId === conversationId) {
      renderMessages();
    }
    return;
  }
  state.messageCache.set(conversationId, cache);
}

function mergeMessage(message, conversationId) {
  const normalized = withDeliveryStatus(message);
  const cache = state.messageCache.get(conversationId) || [];
  const exists = cache.some((entry) => entry.id === normalized.id);
  if (!exists) {
    cache.push(normalized);
    if (state.user && normalized.userId !== state.user.id) {
      playMessageSound();
    }
  }
  state.messageCache.set(conversationId, cache);
  if (!exists && state.activeConversationId === conversationId) {
    renderMessages();
  }
  const index = state.conversations.findIndex((c) => c.id === conversationId);
  if (index >= 0) {
    state.conversations[index].lastMessage = normalized.content || normalized.message || '';
    state.conversations[index].lastMessageAt = normalized.createdAt;
    renderConversationList();
  }
}

function connectSocket() {
  if (!state.token) return;
  if (state.socket) {
    state.socket.close();
  }
  const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
  const socket = new WebSocket(`${protocol}://${window.location.host}/ws?token=${state.token}`);
  state.socket = socket;

  socket.addEventListener('open', () => {
    updateConnectionBadge(true);
  });

  socket.addEventListener('close', () => {
    updateConnectionBadge(false);
    resetSelfTyping();
    clearTypingState();
    clearThinkingState();
    if (state.token) {
      clearTimeout(state.reconnectTimer);
      state.reconnectTimer = setTimeout(connectSocket, state.reconnectDelay);
    }
  });

  socket.addEventListener('message', (event) => {
    try {
      const payload = JSON.parse(event.data);
      handleSocketPayload(payload);
    } catch {
      // ignore invalid payload
    }
  });
}

function renderApprovalsPanel() {
  if (!el.approvalsPanel) return;
  const visible = Boolean(state.user && state.token);
  el.approvalsPanel.classList.toggle('hidden', !visible);
  if (!visible) {
    return;
  }
  const incomingPending = state.approvalsIncoming.filter((req) => req.status === 'pending').length;
  const outgoingPending = state.approvalsOutgoing.filter((req) => req.status === 'pending').length;
  if (el.incomingApprovalCount) {
    const totalIncoming = state.approvalsIncoming.length;
    el.incomingApprovalCount.textContent = `Incoming: ${incomingPending} pending`;
    el.incomingApprovalCount.title = `${incomingPending} pending of ${totalIncoming} total`;
  }
  if (el.outgoingApprovalCount) {
    const totalOutgoing = state.approvalsOutgoing.length;
    el.outgoingApprovalCount.textContent = `Outgoing: ${outgoingPending} pending`;
    el.outgoingApprovalCount.title = `${outgoingPending} pending of ${totalOutgoing} total`;
  }
}

async function loadApprovalsPanel(showErrors = true) {
  if (!state.token) {
    state.approvalsIncoming = [];
    state.approvalsOutgoing = [];
    renderApprovalsPanel();
    return;
  }
  try {
    const [incomingRes, outgoingRes] = await Promise.all([
      authFetch('/api/approvals?direction=incoming'),
      authFetch('/api/approvals?direction=outgoing')
    ]);
    state.approvalsIncoming = incomingRes.requests || [];
    state.approvalsOutgoing = outgoingRes.requests || [];
    renderApprovalsPanel();
  } catch (error) {
    if (showErrors) {
      showToast(error.message || 'Unable to load approvals', 'error');
    }
  }
}

function triggerApprovalsAlert() {
  if (!el.approvalsPanel) return;
  el.approvalsPanel.classList.add('has-alert');
  if (el.approvalsAlertBadge) {
    el.approvalsAlertBadge.classList.remove('hidden');
  }
  clearTimeout(approvalsAlertTimer);
  approvalsAlertTimer = setTimeout(clearApprovalsAlert, 5000);
}

function clearApprovalsAlert() {
  if (!el.approvalsPanel) return;
  el.approvalsPanel.classList.remove('has-alert');
  if (el.approvalsAlertBadge) {
    el.approvalsAlertBadge.classList.add('hidden');
  }
  clearTimeout(approvalsAlertTimer);
  approvalsAlertTimer = null;
}

function updateConnectionBadge(online) {
  el.connectionState.textContent = online ? 'Online' : 'Offline';
  el.connectionState.classList.toggle('online', online);
  el.connectionState.classList.toggle('offline', !online);
}

function handleSocketPayload(payload) {
  switch (payload.type) {
    case 'ready':
      // Check if server restarted - reload page to get fresh assets
      if (state.serverInstanceId && payload.serverInstanceId && state.serverInstanceId !== payload.serverInstanceId) {
        console.log('[ws] Server restarted, reloading page...');
        window.location.reload();
        return;
      }
      state.serverInstanceId = payload.serverInstanceId;
      state.user = payload.user;
      updateUserCard();
      clearTypingState();
      clearThinkingState();
      state.conversations = payload.conversations || [];
      ingestPresenceFromConversations();
      renderConversationList();
       syncRoomMembershipFromConversations();
       ensureInitialConversation();
      updateConnectionBadge(true);
      break;
    case 'conversation:list':
      state.conversations = payload.conversations || [];
      ingestPresenceFromConversations();
      renderConversationList();
      syncRoomMembershipFromConversations();
      ensureInitialConversation();
      break;
    case 'conversation:updated':
      upsertConversation(payload.conversation);
      break;
    case 'message:created':
      mergeMessage(payload.message, payload.conversationId);
      break;
    case 'message:ack':
      break;
    case 'approval:updated':
      handleApprovalNotification(payload.request);
      break;
    case 'presence:updated':
      handlePresenceUpdate(payload.user);
      break;
    case 'typing':
      handleTypingUpdate(payload);
      break;
    case 'thinking':
      handleThinkingUpdate(payload);
      break;
    case 'read:receipt':
      handleReadReceipt(payload);
      break;
    case 'error':
      showToast(payload.error || 'Socket error', 'error');
      break;
    default:
      break;
  }
}

function handlePresenceUpdate(user) {
  if (!user || !user.id) return;
  applyPresenceSnapshot(user);
  if (state.user && user.id === state.user.id) {
    state.user = { ...state.user, ...user };
    updateUserCard();
  }
  state.conversations = state.conversations.map((conversation) => ({
    ...conversation,
    members: (conversation.members || []).map((member) =>
      member.id === user.id ? { ...member, ...user } : member
    )
  }));
  state.rooms = state.rooms.map((room) => ({
    ...room,
    members: (room.members || []).map((member) =>
      member.id === user.id ? { ...member, ...user } : member
    )
  }));
  renderConversationList();
  renderMessages();
  renderRoomList();
}

function upsertConversation(conversation) {
  if (!conversation) return;
  const idx = state.conversations.findIndex((c) => c.id === conversation.id);
  if (idx >= 0) {
    state.conversations[idx] = { ...state.conversations[idx], ...conversation };
  } else {
    state.conversations.unshift(conversation);
  }
  ingestPresenceFromConversations();
  if (state.activeConversationId === conversation.id) {
    updateChatHeader();
  }
  renderConversationList();
  syncRoomMembershipFromConversations();
}

let searchTimer;
function handleUserSearch(event) {
  clearTimeout(searchTimer);
  const query = event.target.value.trim();
  if (!query) {
    el.userResults.innerHTML = '';
    return;
  }
  searchTimer = setTimeout(async () => {
    try {
      const res = await authFetch(`/api/users?q=${encodeURIComponent(query)}`);
      renderUserResults(res.users || []);
    } catch (error) {
      showToast(error.message || 'Search failed', 'error');
    }
  }, 300);
}

function renderUserResults(users) {
  el.userResults.innerHTML = users
    .filter((user) => user.id !== state.user.id)
    .map((user) => {
      const badge = renderRoleBadge(user.role);
      const presenceCls = presenceClass(user.presenceStatus);
      const managerTag = user.manager ? '<span class="manager-chip">Manager</span>' : '';
      const canRequest = Boolean(user.manager);
      const requestAttrs = canRequest
        ? ''
        : 'disabled title="Only managers can approve access tokens"';
      return `
        <li data-user="${user.id}" data-manager="${user.manager ? 'true' : 'false'}">
          <img class="user-result-avatar" src="${resolveAvatar(user.avatarUrl, user.profilePhotoUrl)}" alt="${escapeHtml(
            user.displayName
          )}" />
          <div class="user-result-body">
            <div class="user-result-header">
              <strong>${escapeHtml(user.displayName)}</strong>
              ${badge || ''}
            </div>
            <div>@${escapeHtml(user.username)}</div>
            ${managerTag}
            <span class="presence-pill ${presenceCls}">${formatPresence(user.presenceStatus)}</span>
            <div class="user-result-actions">
              <button class="ghost start-dm">Message</button>
              <button class="ghost request-approval" ${requestAttrs}>Request approval</button>
            </div>
          </div>
        </li>
      `;
    })
    .join('');
}

async function startDirectMessage(userId) {
  if (!userId) return;
  try {
    const res = await authFetch('/api/conversations/direct', {
      method: 'POST',
      body: JSON.stringify({ targetUserId: userId })
    });
    upsertConversation(res.conversation);
    setActiveConversation(res.conversation.id);
    el.userResults.innerHTML = '';
    el.userSearch.value = '';
    return res.conversation;
  } catch (error) {
    showToast(error.message || 'Unable to start direct message', 'error');
    return null;
  }
}

async function requestApproval(userId) {
  if (!userId) return;
  try {
    const conversationId = state.activeConversationId || null;
    await authFetch('/api/approvals', {
      method: 'POST',
      body: JSON.stringify({ targetUserId: userId, conversationId })
    });
    showToast('Approval request sent', 'success');
    await loadApprovalsPanel(false);
  } catch (error) {
    showToast(error.message || 'Unable to send request', 'error');
  }
}

function focusApprovalRequestShortcut() {
  if (!el.userSearch) return;
  el.userSearch.scrollIntoView({ behavior: 'smooth', block: 'center' });
  el.userSearch.focus();
  showToast('Search for a manager and click “Request approval”.', 'info');
}

function handleApprovalNotification(request) {
  if (!request || !state.user) return;
  loadApprovalsPanel(false);
  const status = request.status || 'updated';
  const variant = status === 'approved' ? 'success' : status === 'denied' ? 'error' : 'info';
  if (request.targetId === state.user.id) {
    const name = request.requesterName || request.requesterId || 'Requester';
    const message =
      status === 'pending'
        ? `${name} sent an approval request`
        : `Approval request from ${name} was ${status}`;
    showToast(message, variant);
    if (status === 'pending') {
      triggerApprovalsAlert();
    }
    return;
  }
  if (request.requesterId === state.user.id) {
    showToast(`Your approval request was ${status}`, variant);
  }
}

async function joinRoomChannel(roomId) {
  if (!roomId) return;
  try {
    const res = await authFetch(`/api/rooms/${roomId}/join`, {
      method: 'POST'
    });
    if (res.room) {
      upsertConversation(res.room);
      state.user = { ...(state.user || {}), lastRoomId: roomId };
      syncRoomMembershipFromConversations();
      setActiveConversation(roomId, { silentRoomActivate: true });
    }
    await loadRooms();
    showToast('Joined room', 'success');
  } catch (error) {
    showToast(error.message || 'Unable to join room', 'error');
  }
}

async function requestRoomAccess(roomId) {
  if (!roomId) return;
  try {
    const res = await authFetch(`/api/rooms/${roomId}/request-access`, {
      method: 'POST',
      body: JSON.stringify({})
    });
    if (res.room) {
      upsertConversation(res.room);
      setActiveConversation(res.room.id, { silentRoomActivate: true });
      showToast('Joined room', 'success');
    } else {
      showToast('Request sent to moderators', 'success');
    }
    await loadRooms();
  } catch (error) {
    showToast(error.message || 'Unable to request access', 'error');
  }
}

async function toggleRoomVisibility(roomId, makePublic) {
  if (!roomId) return;
  try {
    const res = await authFetch(`/api/rooms/${roomId}`, {
      method: 'PATCH',
      body: JSON.stringify({ isPublic: makePublic })
    });
    if (res.room) {
      upsertConversation(res.room);
    }
    await loadRooms();
    showToast(makePublic ? 'Room is now public' : 'Room is now private', 'success');
  } catch (error) {
    showToast(error.message || 'Unable to update room', 'error');
  }
}

function getRoomById(roomId) {
  return (
    state.rooms.find((room) => room.id === roomId) ||
    state.conversations.find((conversation) => conversation.id === roomId)
  );
}

let dmDialog = null;
let dmSearchTimer = null;
let addMemberDialog = null;
let addMemberSearchTimer = null;
let approvalReviewDialog = null;

function openDirectMessageDialog() {
  if (!state.user) {
    showToast('Sign in to start a conversation', 'error');
    return;
  }
  closeDirectMessageDialog();
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay dm-overlay';
  overlay.innerHTML = `
    <div class="modal-card dm-modal">
      <div class="modal-header">
        <h3>Start a direct message</h3>
        <button class="ghost close-modal" type="button" aria-label="Close">✕</button>
      </div>
      <div class="modal-body">
        <p class="muted small">Search for a teammate or administrator to open a private conversation.</p>
        <input type="search" class="modal-search dm-search" placeholder="Search by display name or username" autocomplete="off" />
        <div class="dm-results muted small">Start typing to search users.</div>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  const input = overlay.querySelector('.dm-search');
  const results = overlay.querySelector('.dm-results');
  dmDialog = { overlay, input, results };
  overlay.addEventListener('click', (event) => {
    if (event.target === overlay || event.target.closest('.close-modal')) {
      closeDirectMessageDialog();
    }
  });
  results.addEventListener('click', handleDirectMessageResultClick);
  input.addEventListener('input', handleDirectMessageSearch);
  input.focus();
}

function closeDirectMessageDialog() {
  if (dmDialog?.overlay) {
    dmDialog.overlay.remove();
  }
  dmDialog = null;
  clearTimeout(dmSearchTimer);
}

function handleDirectMessageSearch(event) {
  if (!dmDialog) return;
  const query = event.target.value.trim();
  clearTimeout(dmSearchTimer);
  if (!query) {
    dmDialog.results.innerHTML = '<p class="muted small">Start typing to search users.</p>';
    return;
  }
  dmDialog.results.innerHTML = '<p class="muted small">Searching…</p>';
  dmSearchTimer = setTimeout(() => performDirectMessageSearch(query), 250);
}

async function performDirectMessageSearch(query) {
  if (!dmDialog) return;
  try {
    const res = await authFetch(`/api/users?q=${encodeURIComponent(query)}`);
    const filtered = (res.users || []).filter((user) => user.id !== state.user?.id);
    renderDirectMessageResults(filtered);
  } catch (error) {
    dmDialog.results.innerHTML = `<p class="muted small">${escapeHtml(error.message || 'Unable to search')}</p>`;
  }
}

function renderDirectMessageResults(users) {
  if (!dmDialog) return;
  if (!users.length) {
    dmDialog.results.innerHTML = '<p class="muted small">No matching users found.</p>';
    return;
  }
  dmDialog.results.innerHTML = users
    .map((user) => {
      const avatarUrl = resolveAvatar(user.avatarUrl, user.profilePhotoUrl);
      const presenceCls = presenceClass(user.presenceStatus);
      const presenceText = formatPresence(user.presenceStatus);
      const badge = renderRoleBadge(user.role);
      return `
        <div class="dm-result-item">
          <div class="dm-result-user">
            <img src="${avatarUrl}" alt="${escapeHtml(user.displayName || user.username)}" class="dm-result-avatar" />
            <div class="dm-result-meta">
              <strong>${escapeHtml(user.displayName || user.username)}${badge ? ` ${badge}` : ''}</strong>
              <span class="muted small">@${escapeHtml(user.username)}</span>
              <span class="presence-pill ${presenceCls}">${presenceText}</span>
            </div>
          </div>
          <button type="button" class="ghost tiny dm-start" data-user="${user.id}">Message</button>
        </div>
      `;
    })
    .join('');
}

async function handleDirectMessageResultClick(event) {
  const button = event.target.closest('.dm-start[data-user]');
  if (!button || !dmDialog) return;
  const userId = button.dataset.user;
  button.disabled = true;
  const conversation = await startDirectMessage(userId);
  if (conversation) {
    closeDirectMessageDialog();
  } else {
    button.disabled = false;
  }
}


function openAddMemberDialog(roomId) {
  if (!roomId) return;
  closeAddMemberDialog();
  const room = getRoomById(roomId);
  if (!room) {
    showToast('Room not found', 'error');
    return;
  }
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay add-member-overlay';
  overlay.innerHTML = `
    <div class="modal-card add-member-modal">
      <div class="modal-header">
        <h3>Add member to ${escapeHtml(room.title || 'Room')}</h3>
        <button class="ghost close-modal" type="button" aria-label="Close">✕</button>
      </div>
      <div class="modal-body">
        <input type="search" class="modal-search add-member-search" placeholder="Search by display name or username" autocomplete="off" />
        <div class="add-member-results muted small">Start typing to search users.</div>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  const input = overlay.querySelector('.add-member-search');
  const results = overlay.querySelector('.add-member-results');
  addMemberDialog = { overlay, input, results, roomId: room.id, room };
  overlay.addEventListener('click', (event) => {
    if (event.target === overlay || event.target.closest('.close-modal')) {
      closeAddMemberDialog();
    }
  });
  results.addEventListener('click', handleAddMemberResultClick);
  input.addEventListener('input', handleAddMemberSearch);
  input.focus();
}

function closeAddMemberDialog() {
  if (addMemberDialog?.overlay) {
    addMemberDialog.overlay.remove();
  }
  addMemberDialog = null;
  clearTimeout(addMemberSearchTimer);
}

function handleAddMemberSearch(event) {
  const query = event.target.value.trim();
  clearTimeout(addMemberSearchTimer);
  if (!addMemberDialog) return;
  if (!query) {
    addMemberDialog.results.innerHTML = '<p class="muted small">Start typing to search users.</p>';
    return;
  }
  addMemberDialog.results.innerHTML = '<p class="muted small">Searching…</p>';
  addMemberSearchTimer = setTimeout(() => performAddMemberSearch(query), 250);
}

async function performAddMemberSearch(query) {
  if (!addMemberDialog) return;
  try {
    const res = await authFetch(`/api/users?q=${encodeURIComponent(query)}`);
    const members = new Set(getRoomById(addMemberDialog.roomId)?.members?.map((member) => member.id) || []);
    const filtered = (res.users || [])
      .filter((user) => user.id !== state.user?.id && !members.has(user.id));
    renderAddMemberResults(filtered);
  } catch (error) {
    addMemberDialog.results.innerHTML = `<p class="muted small">${escapeHtml(
      error.message || 'Unable to search'
    )}</p>`;
  }
}

function renderAddMemberResults(users) {
  if (!addMemberDialog) return;
  if (!users.length) {
    addMemberDialog.results.innerHTML = '<p class="muted small">No matching users found.</p>';
    return;
  }
  addMemberDialog.results.innerHTML = users
    .map((user) => {
      const presenceCls = presenceClass(user.presenceStatus);
      return `
        <div class="add-member-item" data-user="${user.id}">
          <div>
            <strong>${escapeHtml(user.displayName || user.username)}</strong>
            <span class="muted small">@${escapeHtml(user.username)}</span>
            <span class="presence-pill ${presenceCls}">${formatPresence(user.presenceStatus)}</span>
          </div>
          <button type="button" class="ghost tiny add-member-action" data-user="${user.id}">Add</button>
        </div>
      `;
    })
    .join('');
}

async function handleAddMemberResultClick(event) {
  const button = event.target.closest('.add-member-action[data-user]');
  if (!button || !addMemberDialog) return;
  const userId = button.dataset.user;
  if (!userId) return;
  button.disabled = true;
  try {
    await addUserToRoom(addMemberDialog.roomId, userId);
    closeAddMemberDialog();
  } catch (error) {
    showToast(error.message || 'Unable to add user', 'error');
    button.disabled = false;
  }
}

async function addUserToRoom(roomId, userId) {
  const resolvedRoomId = String(getRoomById(roomId)?.id || roomId || addMemberDialog?.room?.id || '').trim();
  if (!resolvedRoomId || !userId) {
    showToast('Room context missing for addition', 'error');
    return;
  }
  await authFetch(`/api/rooms/${encodeURIComponent(resolvedRoomId)}/members`, {
    method: 'POST',
    body: JSON.stringify({ targetUserId: userId })
  });
  showToast('User added to room', 'success');
  await Promise.all([loadRooms(), loadConversations()]);
}

function openApprovalReviewModal() {
  if (!state.user) {
    showToast('Sign in to review approvals', 'error');
    return;
  }
  closeApprovalReviewModal();
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay approval-review-overlay';
  overlay.innerHTML = `
    <div class="modal-card approval-review-modal">
      <div class="modal-header">
        <h3>Review Approval Requests</h3>
        <button class="ghost close-modal" type="button" aria-label="Close">\u2715</button>
      </div>
      <div class="modal-body">
        <div class="approval-review-list"></div>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  const listContainer = overlay.querySelector('.approval-review-list');
  approvalReviewDialog = { overlay, listContainer };
  overlay.addEventListener('click', (event) => {
    if (event.target === overlay || event.target.closest('.close-modal')) {
      closeApprovalReviewModal();
    }
  });
  listContainer.addEventListener('click', handleApprovalReviewAction);
  renderApprovalReviewList();
}

function closeApprovalReviewModal() {
  if (approvalReviewDialog?.overlay) {
    approvalReviewDialog.overlay.remove();
  }
  approvalReviewDialog = null;
}

function renderApprovalReviewList() {
  if (!approvalReviewDialog) return;
  const { listContainer } = approvalReviewDialog;
  const pending = state.approvalsIncoming.filter((req) => req.status === 'pending');
  if (!pending.length) {
    listContainer.innerHTML = '<p class="muted">No pending approval requests to review.</p>';
    return;
  }
  listContainer.innerHTML = pending
    .map((request) => {
      const name = request.requesterName || 'Unknown';
      const role = request.requesterRole;
      const badge = renderRoleBadge(role);
      const note = request.note
        ? `<p class="approval-note muted small">"${escapeHtml(request.note)}"</p>`
        : '';
      return `
        <div class="approval-review-item" data-id="${request.id}">
          <div class="approval-review-header">
            <strong>${escapeHtml(name)}${badge ? ` ${badge}` : ''}</strong>
          </div>
          ${note}
          <div class="approval-actions">
            <button class="ghost small approval-review-action" data-id="${request.id}" data-decision="approved">Approve</button>
            <button class="ghost small danger approval-review-action" data-id="${request.id}" data-decision="denied">Deny</button>
          </div>
        </div>
      `;
    })
    .join('');
}

async function handleApprovalReviewAction(event) {
  const button = event.target.closest('.approval-review-action');
  if (!button) return;
  const { id, decision } = button.dataset;
  if (!id || !decision) return;
  button.disabled = true;
  try {
    await authFetch(`/api/approvals/${id}/respond`, {
      method: 'POST',
      body: JSON.stringify({ decision })
    });
    showToast(`Request ${decision}`, 'success');
    await loadApprovalsPanel(false);
    const remaining = state.approvalsIncoming.filter((req) => req.status === 'pending');
    if (remaining.length === 0) {
      closeApprovalReviewModal();
    } else {
      renderApprovalReviewList();
    }
  } catch (error) {
    showToast(error.message || 'Unable to respond', 'error');
    button.disabled = false;
  }
}

async function loadRoomRequests(roomId) {
  if (!roomId) return;
  try {
    const res = await authFetch(`/api/rooms/${roomId}/requests`);
    state.roomRequests.set(roomId, res.requests || []);
    renderRoomList();
  } catch (error) {
    showToast(error.message || 'Unable to load requests', 'error');
  }
}

async function respondToJoinRequest(roomId, requestId, decision) {
  if (!roomId || !requestId) return;
  try {
    await authFetch(`/api/rooms/${roomId}/requests/${requestId}/respond`, {
      method: 'POST',
      body: JSON.stringify({ decision })
    });
    showToast(`Request ${decision}`, 'success');
    await Promise.all([loadRoomRequests(roomId), loadRooms()]);
  } catch (error) {
    showToast(error.message || 'Unable to update request', 'error');
  }
}


async function handleProfileSubmit(event) {
  event.preventDefault();
  if (!el.profileForm) return;
  const form = new FormData(el.profileForm);
  const payload = {
    displayName: form.get('displayName'),
    bio: form.get('bio'),
    birthday: form.get('birthday') || null,
    profileTheme: form.get('profileTheme'),
    accentColor: form.get('accentColor'),
    profilePhotoUrl: form.get('profilePhotoUrl') || '',
    avatarUrl: form.get('avatarUrl') || ''
  };
  const presenceValue = form.get('presenceStatus');
  if (presenceValue && PRESENCE_CHOICES.includes(presenceValue)) {
    payload.presenceStatus = presenceValue;
  }
  const idleValue = Number(form.get('idleTimeoutMinutes'));
  if (Number.isFinite(idleValue)) {
    payload.idleTimeoutMinutes = Math.max(1, Math.min(240, Math.round(idleValue)));
  }
  if (state.user?.manager && form.get('managerToken') !== null) {
    const tokenValue = (form.get('managerToken') || '').trim();
    if (tokenValue && tokenValue.length !== 32) {
      showToast('Manager token must be exactly 32 characters', 'error');
      return;
    }
    payload.managerToken = tokenValue;
  }
  try {
    const res = await authFetch('/api/users/me/profile', {
      method: 'PUT',
      body: JSON.stringify(payload)
    });
    state.user = res.profile;
    updateUserCard();
    showToast('Profile updated', 'success');
  } catch (error) {
    showToast(error.message || 'Unable to update profile', 'error');
  }
}

async function handleCreateRoom() {
  if (!canModerateRooms()) return;
  const name = prompt('Room name (3-80 characters)');
  if (!name) return;
  const trimmed = name.trim();
  if (trimmed.length < 3) {
    showToast('Room name must be at least 3 characters', 'error');
    return;
  }
  try {
    const res = await authFetch('/api/rooms', {
      method: 'POST',
      body: JSON.stringify({ title: trimmed })
    });
    if (res.room) {
      upsertConversation(res.room);
      state.user = { ...(state.user || {}), lastRoomId: res.room.id };
      syncRoomMembershipFromConversations();
      setActiveConversation(res.room.id, { silentRoomActivate: true });
    }
    await loadRooms();
    showToast('Room created', 'success');
  } catch (error) {
    showToast(error.message || 'Unable to create room', 'error');
  }
}

function handleRoomListClick(event) {
  const dmBtn = event.target.closest('.dm-user');
  if (dmBtn) {
    event.stopPropagation();
    const targetId = dmBtn.dataset.user;
    if (targetId && targetId !== state.user?.id) {
      startDirectMessage(targetId);
    }
    return;
  }
  const actionBtn = event.target.closest('[data-room-action]');
  if (actionBtn) {
    const roomId = actionBtn.dataset.room;
    const action = actionBtn.dataset.roomAction;
    switch (action) {
      case 'request-access':
        requestRoomAccess(roomId);
        break;
      case 'add-member':
        openAddMemberDialog(roomId);
        break;
      case 'toggle-visibility':
        toggleRoomVisibility(roomId, actionBtn.dataset.public !== 'true');
        break;
      case 'view-requests':
        loadRoomRequests(roomId);
        break;
      case 'respond-request':
        respondToJoinRequest(roomId, actionBtn.dataset.request, actionBtn.dataset.decision);
        break;
      default:
        break;
    }
    event.stopPropagation();
    return;
  }
  const joinBtn = event.target.closest('.join-room');
  if (joinBtn) {
    joinRoomChannel(joinBtn.dataset.room);
    event.stopPropagation();
    return;
  }
  const enterBtn = event.target.closest('.enter-room');
  if (enterBtn) {
    setActiveConversation(enterBtn.dataset.room);
    event.stopPropagation();
    return;
  }
  const card = event.target.closest('.room-row');
  if (!card) return;
  const room = state.rooms.find((item) => item.id === card.dataset.room);
  if (!room || room.banned) return;
  if (room.isMember) {
    setActiveConversation(room.id);
  } else {
    joinRoomChannel(room.id);
  }
}

async function banRoomMember(targetUserId) {
  const conversation = state.conversations.find((c) => c.id === state.activeConversationId);
  if (!conversation || conversation.type !== 'room' || !canModerateRooms()) {
    return;
  }
  if (targetUserId === state.user?.id) {
    showToast('You cannot ban yourself', 'error');
    return;
  }
  const reasonInput = prompt('Reason for ban? (optional)');
  const payload = { targetUserId };
  if (reasonInput && reasonInput.trim().length) {
    payload.reason = reasonInput.trim();
  }
  try {
    await authFetch(`/api/rooms/${conversation.id}/ban`, {
      method: 'POST',
      body: JSON.stringify(payload)
    });
    showToast('User banned from room', 'success');
    await Promise.all([loadConversations(), loadRooms()]);
  } catch (error) {
    showToast(error.message || 'Unable to ban user', 'error');
  }
}

async function handlePasswordChange(event) {
  event.preventDefault();
  const form = new FormData(event.target);
  const currentPassword = form.get('currentPassword');
  const newPassword = form.get('newPassword');
  if (!newPassword || newPassword.length < 8) {
    showToast('Password must be at least 8 characters', 'error');
    return;
  }
  try {
    await authFetch('/api/users/me/password', {
      method: 'POST',
      body: JSON.stringify({ currentPassword, newPassword })
    });
    event.target.reset();
    showToast('Password updated', 'success');
  } catch (error) {
    showToast(error.message || 'Unable to change password', 'error');
  }
}

// Mobile sidebar toggle functions
function openSidebar() {
  if (el.sidebar) {
    el.sidebar.classList.add('open');
  }
  if (el.sidebarBackdrop) {
    el.sidebarBackdrop.classList.add('visible');
  }
  document.body.style.overflow = 'hidden';
}

function closeSidebar() {
  if (el.sidebar) {
    el.sidebar.classList.remove('open');
  }
  if (el.sidebarBackdrop) {
    el.sidebarBackdrop.classList.remove('visible');
  }
  document.body.style.overflow = '';
}

function wireEvents() {
  // Mobile navigation
  if (el.menuToggle) {
    el.menuToggle.addEventListener('click', openSidebar);
  }
  if (el.closeSidebar) {
    el.closeSidebar.addEventListener('click', closeSidebar);
  }
  if (el.sidebarBackdrop) {
    el.sidebarBackdrop.addEventListener('click', closeSidebar);
  }

  el.loginForm.addEventListener('submit', handleLogin);
  el.logoutBtn.addEventListener('click', logout);
  el.messageForm.addEventListener('submit', handleMessageSend);
  if (el.messageInput) {
    el.messageInput.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        el.messageForm.requestSubmit();
      }
    });
    el.messageInput.addEventListener('input', notifyTypingActivity);
    el.messageInput.addEventListener('blur', () => resetSelfTyping());
  }
  if (el.markdownToggle) {
    el.markdownToggle.addEventListener('click', () => {
      state.markdownMode = !state.markdownMode;
      el.markdownToggle.classList.toggle('active', state.markdownMode);
      el.markdownToggle.title = state.markdownMode ? 'Markdown enabled' : 'Toggle Markdown';
      el.messageInput.placeholder = state.markdownMode ? 'Type markdown...' : 'Type a message...';
    });
  }
  el.userSearch.addEventListener('input', handleUserSearch);
  el.userResults.addEventListener('click', (event) => {
    const li = event.target.closest('li[data-user]');
    if (!li) return;
    if (event.target.closest('.start-dm')) {
      startDirectMessage(li.dataset.user);
      return;
    }
    if (event.target.closest('.request-approval')) {
      if (event.target.disabled) {
        showToast('Only managers can share approval tokens', 'error');
        return;
      }
      requestApproval(li.dataset.user);
    }
  });
  el.conversationList.addEventListener('click', (event) => {
    // Handle hide button
    const hideBtn = event.target.closest('.hide-dm');
    if (hideBtn) {
      event.stopPropagation();
      hideConversation(hideBtn.dataset.id);
      return;
    }
    // Handle unhide button
    const unhideBtn = event.target.closest('.unhide-dm');
    if (unhideBtn) {
      event.stopPropagation();
      unhideConversation(unhideBtn.dataset.id);
      return;
    }
    // Handle toggle hidden button
    const toggleBtn = event.target.closest('#toggleHiddenDMs');
    if (toggleBtn) {
      event.stopPropagation();
      toggleShowHiddenConversations();
      return;
    }
    // Handle conversation selection
    const div = event.target.closest('.conversation');
    if (div) {
      setActiveConversation(div.dataset.id);
    }
  });
  if (el.newDmBtn) {
    el.newDmBtn.addEventListener('click', openDirectMessageDialog);
  }
  el.refreshConversations.addEventListener('click', loadConversations);
  if (el.refreshRooms) {
    el.refreshRooms.addEventListener('click', loadRooms);
  }
  if (el.refreshApprovals) {
    el.refreshApprovals.addEventListener('click', () => loadApprovalsPanel(true));
  }
  if (el.reviewApprovalsBtn) {
    el.reviewApprovalsBtn.addEventListener('click', openApprovalReviewModal);
  }
  if (el.newApprovalBtn) {
    el.newApprovalBtn.addEventListener('click', focusApprovalRequestShortcut);
  }
  if (el.roomsList) {
    el.roomsList.addEventListener('click', handleRoomListClick);
  }
  if (el.approvalsPanel) {
    el.approvalsPanel.addEventListener('mouseenter', clearApprovalsAlert);
  }
  if (el.createRoomBtn) {
    el.createRoomBtn.addEventListener('click', handleCreateRoom);
  }
  if (el.chatMembers) {
    el.chatMembers.addEventListener('click', (event) => {
      const button = event.target.closest('button[data-action="ban"][data-user]');
      if (!button) return;
      banRoomMember(button.dataset.user);
    });
  }
  if (el.addRoomMemberBtn) {
    el.addRoomMemberBtn.addEventListener('click', () => {
      const roomId = el.addRoomMemberBtn.dataset.roomId;
      if (roomId) {
        openAddMemberDialog(roomId);
      }
    });
  }
  if (el.profileForm) {
    el.profileForm.addEventListener('submit', handleProfileSubmit);
  }
  if (el.passwordForm) {
    el.passwordForm.addEventListener('submit', handlePasswordChange);
  }
  if (el.profilePhotoUpload) {
    el.profilePhotoUpload.addEventListener('change', (event) => handleImageUpload(event, 'photo'));
  }
  if (el.avatarUpload) {
    el.avatarUpload.addEventListener('change', (event) => handleImageUpload(event, 'avatar'));
  }
  if (el.chatVolume) {
    el.chatVolume.value = Math.round(state.chatVolume * 100);
    el.chatVolume.addEventListener('input', handleVolumeInput);
  }
  if (el.dndToggle) {
    el.dndToggle.addEventListener('click', toggleDndMode);
  }
  if (el.tabChat && el.tabProfile) {
    el.tabChat.addEventListener('click', () => setView('chat'));
    el.tabProfile.addEventListener('click', () => setView('profile'));
  }
  if (el.openProfile) {
    el.openProfile.addEventListener('click', () => setView('profile'));
  }
}

function init() {
  populateAvatarChoices();
  wireEvents();
  if (state.token) {
    fetchCurrentUser();
  }
}

window.addEventListener(
  'pointerdown',
  () => {
    ensureAudioContext();
  },
  { once: true }
);

init();

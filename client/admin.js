const state = {
  token: localStorage.getItem('chat_token'),
  user: null,
  users: [],
  auditLogs: [],
  approvalsIncoming: [],
  approvalsOutgoing: [],
  activePanel: 'overview'
};

const ROLE_LABELS = {
  admin: 'Administrator',
  moderator: 'Channel Moderator',
  user: 'Member'
};

const el = {
  adminApp: document.getElementById('adminApp'),
  adminWarning: document.getElementById('adminAuthWarning'),
  adminStats: document.getElementById('adminStats'),
  adminUsers: document.getElementById('adminUsers'),
  addUserBtn: document.getElementById('addUserBtn'),
  refreshAdmin: document.getElementById('refreshAdmin'),
  adminAuditLogs: document.getElementById('adminAuditLogs'),
  auditPanel: document.getElementById('auditPanel'),
  adminMenu: document.getElementById('adminMenu'),
  adminPanels: Array.from(document.querySelectorAll('[data-panel]')),
  menuButtons: Array.from(document.querySelectorAll('[data-panel-target]')),
  auditMenuBtn: document.querySelector('[data-panel-target="audit"]'),
  approvalsIncoming: document.getElementById('adminIncomingApprovals'),
  approvalsOutgoing: document.getElementById('adminOutgoingApprovals'),
  toast: document.getElementById('toast')
};

function showToast(message, variant = 'info') {
  if (!el.toast) return;
  el.toast.textContent = message;
  el.toast.dataset.variant = variant;
  el.toast.classList.remove('hidden');
  clearTimeout(el.toast._timer);
  el.toast._timer = setTimeout(() => el.toast.classList.add('hidden'), 2500);
}

function hasModerationAccess() {
  return Boolean(state.user && (state.user.role === 'admin' || state.user.role === 'moderator'));
}

function isAdmin() {
  return Boolean(state.user && state.user.role === 'admin');
}

function authFetch(path, options = {}) {
  if (!state.token) {
    return Promise.reject(new Error('Not authenticated'));
  }
  return fetch(path, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
      Authorization: `Bearer ${state.token}`
    }
  }).then(async (res) => {
    if (res.status === 401) {
      throw new Error('Session expired');
    }
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || 'Request failed');
    }
    return res.json();
  });
}

async function ensureAccess() {
  if (!state.token) {
    el.adminWarning.classList.remove('hidden');
    return false;
  }
  try {
    const res = await authFetch('/api/auth/me');
    state.user = res.user;
    if (!hasModerationAccess()) {
      el.adminWarning.classList.remove('hidden');
      return false;
    }
    el.adminWarning.classList.add('hidden');
    el.adminApp.classList.remove('hidden');
    if (el.addUserBtn) {
      el.addUserBtn.classList.toggle('hidden', !isAdmin());
    }
    configureMenuAccess();
    return true;
  } catch (error) {
    showToast(error.message || 'Unable to verify session', 'error');
    el.adminWarning.classList.remove('hidden');
    return false;
  }
}

async function loadAdminData() {
  if (!hasModerationAccess()) return;
  try {
    const approvalsPromise = loadApprovalsData(false);
    const [statsRes, usersRes, auditRes] = await Promise.all([
      authFetch('/api/admin/stats'),
      authFetch('/api/admin/users'),
      isAdmin() ? authFetch('/api/admin/audit-logs').catch(() => ({ logs: [] })) : Promise.resolve({ logs: [] })
    ]);
    await approvalsPromise;
    el.adminStats.innerHTML = `
      <div><h4>Users</h4><p>${statsRes.stats.users}</p></div>
      <div><h4>Conversations</h4><p>${statsRes.stats.conversations}</p></div>
      <div><h4>Messages</h4><p>${statsRes.stats.messages}</p></div>
    `;
    state.users = usersRes.users || [];
    renderAdminUsers();
    state.auditLogs = auditRes.logs || [];
    renderAuditLogs();
  } catch (error) {
    showToast(error.message || 'Unable to load admin data', 'error');
  }
}

function renderRoleBadge(role) {
  if (!role || role === 'user') {
    return '<span class="role-badge role-user">Member</span>';
  }
  const label = ROLE_LABELS[role] || role;
  return `<span class="role-badge role-${role}">${label}</span>`;
}

function renderAdminUsers() {
  const adminView = isAdmin();
  const rows = state.users
    .map(
      (user) => `
      <tr data-id="${user.id}">
        <td>${escapeHtml(user.displayName)}${user.bot ? ' <span class="bot-badge">BOT</span>' : ''}</td>
        <td>@${escapeHtml(user.username)}</td>
        <td>
          ${
            adminView
              ? `<select class="role-select">
            <option value="user" ${user.role === 'user' ? 'selected' : ''}>Member</option>
            <option value="moderator" ${user.role === 'moderator' ? 'selected' : ''}>Moderator</option>
            <option value="admin" ${user.role === 'admin' ? 'selected' : ''}>Administrator</option>
          </select>`
              : `${renderRoleBadge(user.role)}`
          }
        </td>
        <td>
          <select class="status-select" ${
            !adminView && user.role === 'admin' ? 'disabled' : ''
          }>
            <option value="active" ${user.status === 'active' ? 'selected' : ''}>Active</option>
            <option value="disabled" ${user.status === 'disabled' ? 'selected' : ''}>Disabled</option>
          </select>
        </td>
        <td>
          <label class="manager-flag">
            <input type="checkbox" class="manager-toggle" ${user.manager ? 'checked' : ''} ${
        adminView || user.role !== 'admin' ? '' : 'disabled'
      } />
            <span>Manager</span>
          </label>
        </td>
        <td>
          <label class="bot-flag">
            <input type="checkbox" class="bot-toggle" ${user.bot ? 'checked' : ''} ${
        adminView || user.role !== 'admin' ? '' : 'disabled'
      } />
            <span>Bot</span>
          </label>
        </td>
        <td class="actions">
          <button class="ghost edit-profile" ${
            !adminView && user.role === 'admin' ? 'disabled' : ''
          }>Edit Profile</button>
          <button class="ghost save-user" ${
            !adminView && user.role === 'admin' ? 'disabled' : ''
          }>Save</button>
          <button class="ghost reset-password" ${
            !adminView && user.role === 'admin' ? 'disabled' : ''
          }>Reset password</button>
          ${
            adminView && user.id !== state.user.id
              ? '<button class="ghost danger delete-user">Delete</button>'
              : ''
          }
        </td>
      </tr>`
    )
    .join('');
  el.adminUsers.innerHTML = `
    <table>
      <thead>
        <tr>
          <th>Name</th>
          <th>Username</th>
          <th>Role</th>
          <th>Status</th>
          <th>Manager</th>
          <th>Bot</th>
          <th>Actions</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}

function renderAuditLogs() {
  if (!el.adminAuditLogs || !isAdmin()) {
    return;
  }
  if (!state.auditLogs.length) {
    el.adminAuditLogs.innerHTML = '<p class="muted">No audit events have been recorded yet.</p>';
    return;
  }
  const rows = state.auditLogs
    .map((log) => {
      const timestamp = log.createdAt ? new Date(log.createdAt).toLocaleString() : '—';
      const metadata = log.metadata ? escapeHtml(JSON.stringify(log.metadata)) : '';
      return `
        <tr>
          <td>${escapeHtml(log.actorName || log.actorId || 'Unknown')}</td>
          <td>${escapeHtml(log.action)}</td>
          <td>${escapeHtml(log.targetName || log.targetId || '')}</td>
          <td>${metadata}</td>
          <td>${timestamp}</td>
        </tr>
      `;
    })
    .join('');
  el.adminAuditLogs.innerHTML = `
    <table>
      <thead>
        <tr>
          <th>Actor</th>
          <th>Action</th>
          <th>Target</th>
          <th>Metadata</th>
          <th>Time</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}

function renderAdminApprovals() {
  renderApprovalColumn(el.approvalsIncoming, state.approvalsIncoming, true);
  renderApprovalColumn(el.approvalsOutgoing, state.approvalsOutgoing, false);
}

function renderApprovalColumn(container, requests, incoming) {
  if (!container) return;
  if (!requests.length) {
    container.innerHTML = `<p class="muted">No ${incoming ? 'incoming' : 'outgoing'} requests.</p>`;
    return;
  }
  container.innerHTML = requests
    .map((request) => {
      const name = incoming ? request.requesterName : request.targetName;
      const role = incoming ? request.requesterRole : request.targetRole;
      const statusClass = `approval-status ${request.status}`;
      const note = request.note ? `<p>"${escapeHtml(request.note)}"</p>` : '';
      const actions =
        incoming && request.status === 'pending'
          ? `<div class="approval-actions">
              <button class="ghost approval-action" data-id="${request.id}" data-decision="approved">Approve</button>
              <button class="ghost danger approval-action" data-id="${request.id}" data-decision="denied">Deny</button>
            </div>`
          : '';
      return `
        <div class="approval-item" data-id="${request.id}">
          <strong>${escapeHtml(name)}${
        renderRoleBadge(role) ? ` ${renderRoleBadge(role)}` : ''
      }</strong>
          ${note}
          <div class="${statusClass}">${request.status}</div>
          ${actions}
        </div>
      `;
    })
    .join('');
}

function configureMenuAccess() {
  const showAudit = isAdmin();
  if (el.auditMenuBtn) {
    el.auditMenuBtn.classList.toggle('hidden', !showAudit);
  }
  if (!showAudit && state.activePanel === 'audit') {
    setAdminPanel('overview');
  } else {
    setAdminPanel(state.activePanel);
  }
}

function setAdminPanel(panel) {
  if (panel === 'audit' && !isAdmin()) {
    showToast('Audit log is limited to administrators', 'error');
    panel = 'overview';
  }
  state.activePanel = panel;
  if (el.adminPanels?.length) {
    el.adminPanels.forEach((panelEl) => {
      panelEl.classList.toggle('hidden', panelEl.dataset.panel !== panel);
    });
  }
  if (el.menuButtons?.length) {
    el.menuButtons.forEach((button) => {
      button.classList.toggle('active', button.dataset.panelTarget === panel);
    });
  }
}

function handleMenuClick(event) {
  const button = event.target.closest('[data-panel-target]');
  if (!button || button.classList.contains('hidden')) return;
  const panel = button.dataset.panelTarget;
  if (!panel) return;
  setAdminPanel(panel);
}

function escapeHtml(text = '') {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Create User Modal
let createUserOverlay = null;

function closeCreateUserModal() {
  if (createUserOverlay) {
    createUserOverlay.remove();
    createUserOverlay = null;
  }
}

function openCreateUserModal() {
  if (!isAdmin()) return;
  closeCreateUserModal();

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay create-user-overlay';
  overlay.innerHTML = `
    <div class="modal-card create-user-modal">
      <div class="modal-header">
        <h3>Create New User</h3>
        <button class="ghost close-modal" type="button" aria-label="Close">\u2715</button>
      </div>
      <div class="modal-body">
        <form id="createUserModalForm" class="create-user-form">
          <label>
            Display name
            <input name="displayName" type="text" required placeholder="Full name" />
          </label>
          <label>
            Username
            <input name="username" type="text" required placeholder="login_name" />
          </label>
          <label>
            Temporary password
            <input name="password" type="text" minlength="8" required placeholder="Min 8 characters" />
          </label>
          <label>
            Role
            <select name="role">
              <option value="user">Member</option>
              <option value="moderator">Channel moderator</option>
              <option value="admin">Administrator</option>
            </select>
          </label>
          <div class="checkbox-row">
            <label class="manager-flag">
              <input name="manager" type="checkbox" />
              <span>Manager</span>
            </label>
            <label class="bot-flag">
              <input name="bot" type="checkbox" />
              <span>Bot</span>
            </label>
          </div>
          <div class="modal-actions">
            <button type="button" class="ghost cancel-create">Cancel</button>
            <button type="submit" class="primary">Create User</button>
          </div>
        </form>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);
  createUserOverlay = overlay;

  overlay.addEventListener('click', (event) => {
    if (event.target === overlay) closeCreateUserModal();
  });
  overlay.querySelector('.close-modal').addEventListener('click', closeCreateUserModal);
  overlay.querySelector('.cancel-create').addEventListener('click', closeCreateUserModal);
  overlay.querySelector('#createUserModalForm').addEventListener('submit', handleCreateUser);
  overlay.querySelector('input[name="displayName"]').focus();
}

async function handleCreateUser(event) {
  event.preventDefault();
  if (!isAdmin()) return;
  const form = new FormData(event.target);
  const payload = {
    displayName: form.get('displayName'),
    username: form.get('username'),
    password: form.get('password'),
    role: form.get('role'),
    manager: form.get('manager') === 'on',
    bot: form.get('bot') === 'on'
  };
  if (!payload.password || payload.password.length < 8) {
    showToast('Password must be at least 8 characters', 'error');
    return;
  }
  try {
    await authFetch('/api/admin/users', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
    closeCreateUserModal();
    showToast('User created', 'success');
    loadAdminData();
  } catch (error) {
    showToast(error.message || 'Unable to create user', 'error');
  }
}

async function handleAdminAction(event) {
  const button = event.target.closest('button');
  if (!button || button.disabled) return;
  const row = button.closest('tr');
  const userId = row?.dataset.id;
  if (!userId) return;
  if (button.classList.contains('edit-profile')) {
    openEditProfileModal(userId);
    return;
  }
  if (button.classList.contains('save-user')) {
    await saveUser(row, userId);
    return;
  }
  if (button.classList.contains('reset-password')) {
    handleResetPassword(userId);
    return;
  }
  if (button.classList.contains('delete-user')) {
    handleDeleteUser(userId);
  }
}

async function saveUser(row, userId) {
  const payload = {};
  const roleSelect = row.querySelector('.role-select');
  if (roleSelect) {
    payload.role = roleSelect.value;
  }
  const statusSelect = row.querySelector('.status-select');
  if (statusSelect) {
    payload.status = statusSelect.value;
  }
  const managerToggle = row.querySelector('.manager-toggle');
  if (managerToggle) {
    payload.manager = managerToggle.checked;
  }
  const botToggle = row.querySelector('.bot-toggle');
  if (botToggle) {
    payload.bot = botToggle.checked;
  }
  try {
    await authFetch(`/api/admin/users/${userId}`, {
      method: 'PATCH',
      body: JSON.stringify(payload)
    });
    showToast('User updated', 'success');
    loadAdminData();
  } catch (error) {
    showToast(error.message || 'Unable to update user', 'error');
  }
}

async function handleResetPassword(userId) {
  const password = prompt('Enter a new temporary password (min 8 characters)');
  if (!password) return;
  if (password.length < 8) {
    showToast('Password must be at least 8 characters', 'error');
    return;
  }
  try {
    await authFetch(`/api/admin/users/${userId}/reset-password`, {
      method: 'POST',
      body: JSON.stringify({ password })
    });
    showToast('Password reset', 'success');
  } catch (error) {
    showToast(error.message || 'Unable to reset password', 'error');
  }
}

async function handleDeleteUser(userId) {
  const confirmed = confirm('Delete this user account? This cannot be undone.');
  if (!confirmed) return;
  try {
    await authFetch(`/api/admin/users/${userId}`, { method: 'DELETE' });
    showToast('User deleted', 'success');
    loadAdminData();
  } catch (error) {
    showToast(error.message || 'Unable to delete user', 'error');
  }
}

// Edit Profile Modal
let editProfileOverlay = null;

const AVAILABLE_AVATARS = [
  '/assets/avatars/avatar-blue.svg',
  '/assets/avatars/avatar-green.svg',
  '/assets/avatars/avatar-purple.svg',
  '/assets/avatars/avatar-orange.svg',
  '/assets/avatars/avatar-teal.svg',
  '/assets/avatars/avatar-gray.svg'
];

function closeEditProfileModal() {
  if (editProfileOverlay) {
    editProfileOverlay.remove();
    editProfileOverlay = null;
  }
}

async function openEditProfileModal(userId) {
  closeEditProfileModal();

  let user;
  try {
    const res = await authFetch(`/api/admin/users/${userId}`);
    user = res.user;
  } catch (error) {
    showToast(error.message || 'Unable to load user profile', 'error');
    return;
  }

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay edit-profile-overlay';
  overlay.innerHTML = `
    <div class="modal-card edit-profile-modal">
      <div class="modal-header">
        <h3>Edit Profile: ${escapeHtml(user.displayName)}</h3>
        <button class="ghost close-modal" type="button" aria-label="Close">\u2715</button>
      </div>
      <div class="modal-body">
        <form id="adminEditProfileForm" class="admin-edit-profile-form">
          <input type="hidden" name="userId" value="${user.id}" />

          <label>
            Display name
            <input name="displayName" type="text" required maxlength="64"
                   value="${escapeHtml(user.displayName || '')}" />
          </label>

          <label>
            Bio
            <textarea name="bio" rows="3" maxlength="500"
                      placeholder="User bio">${escapeHtml(user.bio || '')}</textarea>
          </label>

          <label>
            Birthday
            <input name="birthday" type="date" value="${user.birthday || ''}" />
          </label>

          <div class="profile-preferences">
            <label>
              Theme
              <select name="profileTheme">
                <option value="light" ${user.profileTheme === 'light' ? 'selected' : ''}>Light</option>
                <option value="dark" ${user.profileTheme === 'dark' ? 'selected' : ''}>Dark</option>
              </select>
            </label>
            <label>
              Accent color
              <input name="accentColor" type="color" value="${user.accentColor || '#2563eb'}" />
            </label>
          </div>

          <div class="media-upload-section">
            <div class="media-upload-row">
              <div class="media-upload">
                <h4>Avatar</h4>
                <img class="media-preview admin-avatar-preview"
                     src="${user.avatarUrl || '/assets/avatars/avatar-blue.svg'}"
                     alt="Avatar preview" />
                <label class="file-input">
                  <span>Upload (max 2 MB)</span>
                  <input type="file" class="admin-avatar-upload" accept="image/png,image/jpeg" />
                </label>
                <input type="hidden" name="avatarUrl" value="${user.avatarUrl || ''}" />
              </div>
              <div class="media-upload">
                <h4>Profile Photo</h4>
                <img class="media-preview admin-photo-preview"
                     src="${user.profilePhotoUrl || '/assets/avatars/avatar-gray.svg'}"
                     alt="Profile photo preview" />
                <label class="file-input">
                  <span>Upload (max 2 MB)</span>
                  <input type="file" class="admin-photo-upload" accept="image/png,image/jpeg" />
                </label>
                <input type="hidden" name="profilePhotoUrl" value="${user.profilePhotoUrl || ''}" />
              </div>
            </div>
          </div>

          <div class="avatar-selector">
            <p class="muted small">Or pick a preset avatar:</p>
            <div class="avatar-grid admin-avatar-choices">
              ${generateAvatarChoices(user.avatarUrl)}
            </div>
          </div>

          <div class="modal-actions">
            <button type="button" class="ghost cancel-edit">Cancel</button>
            <button type="submit" class="primary">Save Changes</button>
          </div>
        </form>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);
  editProfileOverlay = overlay;
  wireEditProfileModalEvents(overlay);
}

function generateAvatarChoices(currentAvatar) {
  return AVAILABLE_AVATARS.map((url) => `
    <label class="avatar-option ${currentAvatar === url ? 'selected' : ''}">
      <input type="radio" name="avatarChoice" value="${url}"
             ${currentAvatar === url ? 'checked' : ''} />
      <img src="${url}" alt="Avatar option" />
    </label>
  `).join('');
}

function wireEditProfileModalEvents(overlay) {
  overlay.addEventListener('click', (event) => {
    if (event.target === overlay) {
      closeEditProfileModal();
    }
  });

  overlay.querySelector('.close-modal').addEventListener('click', closeEditProfileModal);
  overlay.querySelector('.cancel-edit')?.addEventListener('click', closeEditProfileModal);

  // Avatar upload
  const avatarUpload = overlay.querySelector('.admin-avatar-upload');
  const avatarPreview = overlay.querySelector('.admin-avatar-preview');
  const avatarField = overlay.querySelector('input[name="avatarUrl"]');

  avatarUpload.addEventListener('change', async (event) => {
    const file = event.target.files?.[0];
    if (!file || !validateImageFile(file)) {
      event.target.value = '';
      return;
    }
    try {
      showToast('Uploading avatar...', 'info');
      const { url } = await uploadImage('avatar', file);
      avatarField.value = url;
      avatarPreview.src = url;
      overlay.querySelectorAll('.admin-avatar-choices input[type="radio"]')
        .forEach((r) => (r.checked = false));
      overlay.querySelectorAll('.admin-avatar-choices .avatar-option')
        .forEach((opt) => opt.classList.remove('selected'));
      showToast('Avatar uploaded', 'success');
    } catch (error) {
      showToast(error.message || 'Upload failed', 'error');
    }
  });

  // Profile photo upload
  const photoUpload = overlay.querySelector('.admin-photo-upload');
  const photoPreview = overlay.querySelector('.admin-photo-preview');
  const photoField = overlay.querySelector('input[name="profilePhotoUrl"]');

  photoUpload.addEventListener('change', async (event) => {
    const file = event.target.files?.[0];
    if (!file || !validateImageFile(file)) {
      event.target.value = '';
      return;
    }
    try {
      showToast('Uploading photo...', 'info');
      const { url } = await uploadImage('photos', file);
      photoField.value = url;
      photoPreview.src = url;
      showToast('Photo uploaded', 'success');
    } catch (error) {
      showToast(error.message || 'Upload failed', 'error');
    }
  });

  // Preset avatar selection
  overlay.querySelector('.admin-avatar-choices').addEventListener('change', (event) => {
    const radio = event.target.closest('input[type="radio"]');
    if (radio) {
      avatarField.value = radio.value;
      avatarPreview.src = radio.value;
      overlay.querySelectorAll('.admin-avatar-choices .avatar-option')
        .forEach((opt) => opt.classList.remove('selected'));
      radio.closest('.avatar-option')?.classList.add('selected');
    }
  });

  // Form submission
  overlay.querySelector('#adminEditProfileForm').addEventListener('submit', handleEditProfileSubmit);
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
  return fetch(`/api/uploads/images?scope=${scope}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${state.token}` },
    body: formData
  }).then(async (res) => {
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || 'Upload failed');
    }
    return res.json();
  });
}

async function handleEditProfileSubmit(event) {
  event.preventDefault();
  const form = new FormData(event.target);
  const userId = form.get('userId');

  const payload = {
    displayName: form.get('displayName'),
    bio: form.get('bio') || null,
    birthday: form.get('birthday') || null,
    profileTheme: form.get('profileTheme'),
    accentColor: form.get('accentColor'),
    avatarUrl: form.get('avatarUrl') || null,
    profilePhotoUrl: form.get('profilePhotoUrl') || null
  };

  try {
    await authFetch(`/api/admin/users/${userId}`, {
      method: 'PATCH',
      body: JSON.stringify(payload)
    });
    showToast('Profile updated', 'success');
    closeEditProfileModal();
    loadAdminData();
  } catch (error) {
    showToast(error.message || 'Unable to update profile', 'error');
  }
}

async function loadApprovalsData(showErrors = true) {
  if (!hasModerationAccess()) return;
  try {
    const [incomingRes, outgoingRes] = await Promise.all([
      authFetch('/api/approvals?direction=incoming'),
      authFetch('/api/approvals?direction=outgoing')
    ]);
    state.approvalsIncoming = incomingRes.requests || [];
    state.approvalsOutgoing = outgoingRes.requests || [];
    renderAdminApprovals();
  } catch (error) {
    state.approvalsIncoming = [];
    state.approvalsOutgoing = [];
    renderAdminApprovals();
    if (showErrors) {
      showToast(error.message || 'Unable to load approvals', 'error');
    }
  }
}

async function respondToApproval(id, decision) {
  try {
    await authFetch(`/api/approvals/${id}/respond`, {
      method: 'POST',
      body: JSON.stringify({ decision })
    });
    showToast(`Request ${decision}`, 'success');
    loadApprovalsData(false);
  } catch (error) {
    showToast(error.message || 'Unable to respond', 'error');
  }
}

function handleApprovalAction(event) {
  const button = event.target.closest('.approval-action');
  if (!button) return;
  const { id, decision } = button.dataset;
  if (!id || !decision) return;
  respondToApproval(id, decision);
}

function wireEvents() {
  if (el.addUserBtn) {
    el.addUserBtn.addEventListener('click', openCreateUserModal);
  }
  if (el.refreshAdmin) {
    el.refreshAdmin.addEventListener('click', loadAdminData);
  }
  if (el.adminUsers) {
    el.adminUsers.addEventListener('click', handleAdminAction);
  }
  if (el.approvalsIncoming) {
    el.approvalsIncoming.addEventListener('click', handleApprovalAction);
  }
  if (el.adminMenu) {
    el.adminMenu.addEventListener('click', handleMenuClick);
  }
}

async function init() {
  wireEvents();
  setAdminPanel(state.activePanel);
  const allowed = await ensureAccess();
  if (allowed) {
    loadAdminData();
  }
}

init();

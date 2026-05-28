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
  createUserForm: document.getElementById('createUserForm'),
  moderatorHelp: document.getElementById('moderatorHelp'),
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
    if (el.createUserForm) {
      el.createUserForm.classList.toggle('hidden', !isAdmin());
    }
    if (el.moderatorHelp) {
      el.moderatorHelp.classList.toggle('hidden', isAdmin());
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
        <td>${escapeHtml(user.displayName)}</td>
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
        <td class="actions">
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

async function handleCreateUser(event) {
  event.preventDefault();
  if (!isAdmin()) return;
  const form = new FormData(event.target);
  const payload = {
    displayName: form.get('displayName'),
    username: form.get('username'),
    password: form.get('password'),
    role: form.get('role'),
    manager: form.get('manager') === 'on'
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
    event.target.reset();
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
  if (el.createUserForm) {
    el.createUserForm.addEventListener('submit', handleCreateUser);
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

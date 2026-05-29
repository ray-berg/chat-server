import React from 'react';
import { Icon } from '../icons.jsx';
import { Avatar, Button, RoleBadge, BotPill, Pill, Eyebrow } from '../components/atoms.jsx';
import { api } from '../data/api.js';

const field = {
  width: '100%',
  padding: '8px 10px',
  background: 'var(--gray-950)',
  border: '1px solid var(--border-default)',
  borderRadius: 6,
  color: 'var(--fg-1)',
  fontSize: 13,
  outline: 'none',
  fontFamily: 'var(--font-sans)',
};
const labelStyle = { fontSize: 11, color: 'var(--fg-4)', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600, marginBottom: 5, display: 'block' };
const ROLES = ['user', 'moderator', 'admin'];
const ACCENTS = ['#3b82f6', '#c9a548', '#22d3ee', '#d946ef'];

function Note({ tone, children }) {
  if (!children) return null;
  const error = tone === 'error';
  return (
    <div style={{ fontSize: 12, color: error ? 'var(--urgent-300)' : 'var(--ok-300)', background: error ? 'var(--tone-urgent-soft)' : 'var(--tone-ok-soft)', border: `1px solid ${error ? 'rgba(239,68,68,0.4)' : 'rgba(34,197,94,0.4)'}`, borderRadius: 6, padding: '6px 10px' }}>
      {children}
    </div>
  );
}

function EditUser({ userId, currentUserId, onBack, onChanged }) {
  const [u, setU] = React.useState(null);
  const [form, setForm] = React.useState(null);
  const [msg, setMsg] = React.useState(null);
  const [busy, setBusy] = React.useState(false);
  const [pw, setPw] = React.useState('');

  React.useEffect(() => {
    api
      .adminGetUser(userId)
      .then((res) => {
        setU(res.user);
        setForm({
          displayName: res.user.displayName || '',
          bio: res.user.bio || '',
          role: res.user.role,
          status: res.user.status,
          manager: !!res.user.manager,
          bot: !!res.user.bot,
          birthday: res.user.birthday || '',
          accentColor: res.user.accentColor || '#3b82f6',
        });
      })
      .catch((e) => setMsg({ tone: 'error', text: e.message }));
  }, [userId]);

  if (!form) return <div style={{ padding: 8, color: 'var(--fg-4)' }}>Loading…</div>;
  const isSelf = userId === currentUserId;

  async function save() {
    setBusy(true);
    setMsg(null);
    try {
      await api.adminUpdateUser(userId, {
        displayName: form.displayName.trim(),
        bio: form.bio,
        role: form.role,
        status: form.status,
        manager: form.manager,
        bot: form.bot,
        accentColor: form.accentColor,
        ...(form.birthday ? { birthday: form.birthday } : {}),
      });
      setMsg({ tone: 'ok', text: 'Saved.' });
      onChanged();
    } catch (e) {
      setMsg({ tone: 'error', text: e.message });
    } finally {
      setBusy(false);
    }
  }

  async function resetPassword() {
    if (pw.length < 8) return setMsg({ tone: 'error', text: 'Password must be at least 8 characters.' });
    setBusy(true);
    setMsg(null);
    try {
      await api.adminResetPassword(userId, pw);
      setPw('');
      setMsg({ tone: 'ok', text: 'Password reset.' });
    } catch (e) {
      setMsg({ tone: 'error', text: e.message });
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!window.confirm(`Delete ${u.displayName} (@${u.username})? This cannot be undone.`)) return;
    setBusy(true);
    setMsg(null);
    try {
      await api.adminDeleteUser(userId);
      onChanged();
      onBack();
    } catch (e) {
      setMsg({ tone: 'error', text: e.message });
      setBusy(false);
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <button onClick={onBack} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: 'none', border: 'none', color: 'var(--fg-4)', cursor: 'pointer', fontSize: 12, padding: 0, alignSelf: 'flex-start' }}>
        <Icon name="chevLeft" size={12} /> Back to users
      </button>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <Avatar user={{ ...u, name: u.displayName, initials: (u.displayName || u.username || '?').slice(0, 2).toUpperCase(), avatarColor: 'var(--gray-700)', avatarUrl: u.profilePhotoUrl }} size={40} presence={false} />
        <div>
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--fg-1)' }}>{u.displayName}</div>
          <div style={{ fontSize: 12, color: 'var(--fg-5)', fontFamily: 'var(--font-mono)' }}>@{u.username}</div>
        </div>
      </div>

      <label>
        <span style={labelStyle}>Display name</span>
        <input style={field} value={form.displayName} maxLength={64} onChange={(e) => setForm((f) => ({ ...f, displayName: e.target.value }))} />
      </label>
      <label>
        <span style={labelStyle}>Bio</span>
        <textarea style={{ ...field, resize: 'vertical', minHeight: 52 }} value={form.bio} maxLength={500} onChange={(e) => setForm((f) => ({ ...f, bio: e.target.value }))} />
      </label>
      <div style={{ display: 'flex', gap: 12 }}>
        <label style={{ flex: 1 }}>
          <span style={labelStyle}>Role</span>
          <select style={field} value={form.role} onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}>
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </label>
        <label style={{ flex: 1 }}>
          <span style={labelStyle}>Status</span>
          <select style={field} value={form.status} onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}>
            <option value="active">active</option>
            <option value="disabled">disabled</option>
          </select>
        </label>
      </div>
      <div style={{ display: 'flex', gap: 18 }}>
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--fg-2)' }}>
          <input type="checkbox" checked={form.manager} onChange={(e) => setForm((f) => ({ ...f, manager: e.target.checked }))} /> Manager
        </label>
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--fg-2)' }}>
          <input type="checkbox" checked={form.bot} onChange={(e) => setForm((f) => ({ ...f, bot: e.target.checked }))} /> AI / bot
        </label>
      </div>
      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end' }}>
        <label style={{ flex: 1 }}>
          <span style={labelStyle}>Birthday</span>
          <input style={field} type="date" value={form.birthday || ''} onChange={(e) => setForm((f) => ({ ...f, birthday: e.target.value }))} />
        </label>
        <div>
          <span style={labelStyle}>Accent</span>
          <div style={{ display: 'flex', gap: 8 }}>
            {ACCENTS.map((c) => {
              const active = (form.accentColor || '').toLowerCase() === c.toLowerCase();
              return (
                <button
                  key={c}
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, accentColor: c }))}
                  style={{ width: 24, height: 24, borderRadius: '50%', background: c, cursor: 'pointer', padding: 0, border: active ? '2px solid var(--fg-1)' : '2px solid transparent', boxShadow: active ? `0 0 0 1px ${c}` : 'none' }}
                />
              );
            })}
          </div>
        </div>
      </div>

      <Note tone={msg?.tone}>{msg?.text}</Note>

      <div style={{ display: 'flex', gap: 8 }}>
        <Button variant="primary" size="md" onClick={save} disabled={busy}>
          Save changes
        </Button>
      </div>

      <div style={{ height: 1, background: 'var(--border-subtle)' }} />
      <Eyebrow>Reset password</Eyebrow>
      <div style={{ display: 'flex', gap: 8 }}>
        <input type="password" style={field} value={pw} onChange={(e) => setPw(e.target.value)} placeholder="New password" />
        <Button variant="flat" size="md" onClick={resetPassword} disabled={busy}>
          Reset
        </Button>
      </div>

      {!isSelf && (
        <>
          <div style={{ height: 1, background: 'var(--border-subtle)' }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ flex: 1, fontSize: 12, color: 'var(--fg-5)' }}>Permanently delete this account.</span>
            <Button variant="danger" size="md" onClick={remove} disabled={busy}>
              Delete user
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

function CreateUser({ onBack, onChanged }) {
  const [form, setForm] = React.useState({ username: '', displayName: '', password: '', role: 'user' });
  const [msg, setMsg] = React.useState(null);
  const [busy, setBusy] = React.useState(false);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function create() {
    setBusy(true);
    setMsg(null);
    try {
      await api.adminCreateUser({
        username: form.username.trim(),
        displayName: form.displayName.trim(),
        password: form.password,
        role: form.role,
      });
      onChanged();
      onBack();
    } catch (e) {
      setMsg({ tone: 'error', text: e.message });
      setBusy(false);
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <button onClick={onBack} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: 'none', border: 'none', color: 'var(--fg-4)', cursor: 'pointer', fontSize: 12, padding: 0, alignSelf: 'flex-start' }}>
        <Icon name="chevLeft" size={12} /> Back to users
      </button>
      <Eyebrow>New user</Eyebrow>
      <label>
        <span style={labelStyle}>Username</span>
        <input style={field} value={form.username} onChange={set('username')} />
      </label>
      <label>
        <span style={labelStyle}>Display name</span>
        <input style={field} value={form.displayName} onChange={set('displayName')} />
      </label>
      <label>
        <span style={labelStyle}>Password</span>
        <input style={field} type="password" value={form.password} onChange={set('password')} />
      </label>
      <label>
        <span style={labelStyle}>Role</span>
        <select style={field} value={form.role} onChange={set('role')}>
          {ROLES.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
      </label>
      <Note tone={msg?.tone}>{msg?.text}</Note>
      <Button variant="primary" size="md" onClick={create} disabled={busy}>
        Create user
      </Button>
    </div>
  );
}

function UserList({ currentUserId, onPick, onNew }) {
  const [q, setQ] = React.useState('');
  const [users, setUsers] = React.useState([]);
  const [loading, setLoading] = React.useState(false);

  React.useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const t = setTimeout(() => {
      api
        .adminUsers(q)
        .then((res) => {
          if (!cancelled) setUsers(res.users || []);
        })
        .catch(() => {})
        .finally(() => !cancelled && setLoading(false));
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [q]);

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        <input style={field} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search users…" autoFocus />
        <Button variant="primary" size="md" icon="plus" onClick={onNew}>
          New
        </Button>
      </div>
      {loading && <div style={{ color: 'var(--fg-4)', fontSize: 13 }}>Loading…</div>}
      {!loading && users.length === 0 && <div style={{ color: 'var(--fg-5)', fontSize: 13 }}>No users.</div>}
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {users.map((u) => (
          <button
            key={u.id}
            onClick={() => onPick(u.id)}
            style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 6px', background: 'transparent', border: 'none', borderBottom: '1px solid var(--border-subtle)', cursor: 'pointer', textAlign: 'left', width: '100%' }}
            onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-surface-2)')}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
          >
            <Avatar user={{ name: u.displayName, initials: (u.displayName || u.username || '?').slice(0, 2).toUpperCase(), avatarColor: 'var(--gray-700)', avatarUrl: u.profilePhotoUrl && u.profilePhotoUrl.startsWith('/uploads') ? u.profilePhotoUrl : null }} size={28} presence={false} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <span style={{ fontSize: 13, color: 'var(--fg-1)' }}>{u.displayName}</span>
                {u.bot && <BotPill />}
                <RoleBadge role={u.role} />
              </div>
              <div style={{ fontSize: 11, color: 'var(--fg-5)', fontFamily: 'var(--font-mono)' }}>@{u.username}</div>
            </div>
            <Pill tone={u.status === 'active' ? 'ok' : 'urgent'} size="xs">
              {u.status}
            </Pill>
          </button>
        ))}
      </div>
    </div>
  );
}

export function AdminUsers({ open, onClose, currentUserId }) {
  const [view, setView] = React.useState({ mode: 'list', userId: null });
  const [nonce, setNonce] = React.useState(0);

  React.useEffect(() => {
    if (open) setView({ mode: 'list', userId: null });
  }, [open]);

  if (!open) return null;
  const changed = () => setNonce((n) => n + 1);

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 100, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', paddingTop: '8vh' }}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="nocos-scrollbar"
        style={{ width: 'min(560px, 94vw)', maxHeight: '84vh', overflowY: 'auto', background: 'var(--bg-surface)', border: '1px solid var(--border-default)', borderRadius: 12, boxShadow: 'var(--shadow-lg)' }}
      >
        <header style={{ position: 'sticky', top: 0, background: 'var(--bg-surface)', padding: '14px 18px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', gap: 10, zIndex: 1 }}>
          <Icon name="users" size={16} style={{ color: 'var(--fg-3)' }} />
          <span style={{ flex: 1, fontSize: 15, fontWeight: 600, color: 'var(--fg-1)' }}>Manage users</span>
          <Button variant="ghost" size="sm" onClick={onClose}>
            Close
          </Button>
        </header>
        <div style={{ padding: 18 }}>
          {view.mode === 'list' && (
            <UserList key={nonce} currentUserId={currentUserId} onPick={(userId) => setView({ mode: 'edit', userId })} onNew={() => setView({ mode: 'create' })} />
          )}
          {view.mode === 'edit' && (
            <EditUser userId={view.userId} currentUserId={currentUserId} onBack={() => setView({ mode: 'list' })} onChanged={changed} />
          )}
          {view.mode === 'create' && <CreateUser onBack={() => setView({ mode: 'list' })} onChanged={changed} />}
        </div>
      </div>
    </div>
  );
}

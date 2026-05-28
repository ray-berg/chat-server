import React from 'react';
import { login, api } from './data/api.js';
import { useChat } from './data/store.jsx';
import { Button } from './components/atoms.jsx';

const field = {
  width: '100%',
  padding: '9px 11px',
  background: 'var(--gray-950)',
  border: '1px solid var(--border-default)',
  borderRadius: 6,
  color: 'var(--fg-1)',
  fontSize: 14,
  outline: 'none',
};
const labelText = { fontSize: 11, color: 'var(--fg-4)', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600 };

function SignIn() {
  const { doLogin } = useChat();
  const [username, setUsername] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [error, setError] = React.useState(null);
  const [busy, setBusy] = React.useState(false);

  async function submit(e) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const data = await login(username.trim(), password);
      doLogin(data.token);
    } catch (err) {
      setError(err.message || 'Login failed');
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <label style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
        <span style={labelText}>Username</span>
        <input style={field} value={username} onChange={(e) => setUsername(e.target.value)} autoFocus autoComplete="username" />
      </label>
      <label style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
        <span style={labelText}>Password</span>
        <input style={field} type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
      </label>
      {error && (
        <div style={{ fontSize: 12, color: 'var(--urgent-300)', background: 'var(--tone-urgent-soft)', border: '1px solid rgba(239,68,68,0.4)', borderRadius: 6, padding: '6px 10px' }}>{error}</div>
      )}
      <Button variant="primary" size="lg" type="submit" style={{ justifyContent: 'center' }}>
        {busy ? 'Signing in…' : 'Sign in'}
      </Button>
    </form>
  );
}

function RequestAccess() {
  const [form, setForm] = React.useState({ username: '', displayName: '', email: '', note: '' });
  const [error, setError] = React.useState(null);
  const [done, setDone] = React.useState(false);
  const [busy, setBusy] = React.useState(false);

  function set(k) {
    return (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  }

  async function submit(e) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await api.requestAccess({
        username: form.username.trim(),
        displayName: form.displayName.trim(),
        email: form.email.trim() || undefined,
        note: form.note.trim() || undefined,
      });
      setDone(true);
    } catch (err) {
      setError(err.message || 'Could not submit request');
      setBusy(false);
    }
  }

  if (done) {
    return (
      <div style={{ fontSize: 13, color: 'var(--ok-300)', background: 'var(--tone-ok-soft)', border: '1px solid rgba(34,197,94,0.4)', borderRadius: 8, padding: '12px 14px' }}>
        Request submitted. An administrator will review it and set up your account.
      </div>
    );
  }

  return (
    <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <label style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
        <span style={labelText}>Desired username</span>
        <input style={field} value={form.username} onChange={set('username')} autoFocus />
      </label>
      <label style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
        <span style={labelText}>Your name</span>
        <input style={field} value={form.displayName} onChange={set('displayName')} />
      </label>
      <label style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
        <span style={labelText}>Email (optional)</span>
        <input style={field} type="email" value={form.email} onChange={set('email')} />
      </label>
      <label style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
        <span style={labelText}>Why do you need access? (optional)</span>
        <textarea style={{ ...field, resize: 'vertical', minHeight: 56 }} maxLength={500} value={form.note} onChange={set('note')} />
      </label>
      {error && (
        <div style={{ fontSize: 12, color: 'var(--urgent-300)', background: 'var(--tone-urgent-soft)', border: '1px solid rgba(239,68,68,0.4)', borderRadius: 6, padding: '6px 10px' }}>{error}</div>
      )}
      <Button variant="primary" size="lg" type="submit" style={{ justifyContent: 'center' }}>
        {busy ? 'Submitting…' : 'Request access'}
      </Button>
    </form>
  );
}

export default function Login() {
  const [mode, setMode] = React.useState('signin');

  return (
    <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-app)' }}>
      <div
        style={{
          width: 340,
          background: 'var(--bg-surface)',
          border: '1px solid var(--border-subtle)',
          borderRadius: 12,
          padding: 24,
          display: 'flex',
          flexDirection: 'column',
          gap: 16,
          boxShadow: 'var(--shadow-lg)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <img src="/nocos-brain.png" alt="NOCOS" width={32} height={32} style={{ filter: 'drop-shadow(0 0 8px rgba(34,211,238,0.4))' }} />
          <div>
            <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--fg-1)' }}>Chat Server</div>
            <div style={{ fontSize: 11, color: 'var(--fg-5)', fontFamily: 'var(--font-mono)' }}>
              NOCOS · {mode === 'signin' ? 'sign in' : 'request access'}
            </div>
          </div>
        </div>

        {mode === 'signin' ? <SignIn /> : <RequestAccess />}

        <div style={{ fontSize: 12, color: 'var(--fg-5)', textAlign: 'center' }}>
          {mode === 'signin' ? (
            <>
              Need an account?{' '}
              <button type="button" onClick={() => setMode('request')} style={{ background: 'none', border: 'none', color: 'var(--accent-color, var(--blue-400))', cursor: 'pointer', padding: 0, fontSize: 12 }}>
                Request access
              </button>
            </>
          ) : (
            <>
              Have an account?{' '}
              <button type="button" onClick={() => setMode('signin')} style={{ background: 'none', border: 'none', color: 'var(--accent-color, var(--blue-400))', cursor: 'pointer', padding: 0, fontSize: 12 }}>
                Sign in
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

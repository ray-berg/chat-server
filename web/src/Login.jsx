import React from 'react';
import { login } from './data/api.js';
import { useChat } from './data/store.jsx';
import { Button } from './components/atoms.jsx';

export default function Login() {
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

  return (
    <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-app)' }}>
      <form
        onSubmit={submit}
        style={{
          width: 340,
          background: 'var(--bg-surface)',
          border: '1px solid var(--border-subtle)',
          borderRadius: 12,
          padding: 24,
          display: 'flex',
          flexDirection: 'column',
          gap: 14,
          boxShadow: 'var(--shadow-lg)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
          <img src="/nocos-brain.png" alt="NOCOS" width={32} height={32} style={{ filter: 'drop-shadow(0 0 8px rgba(34,211,238,0.4))' }} />
          <div>
            <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--fg-1)' }}>Chat Server</div>
            <div style={{ fontSize: 11, color: 'var(--fg-5)', fontFamily: 'var(--font-mono)' }}>NOCOS · sign in</div>
          </div>
        </div>

        <label style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          <span style={{ fontSize: 11, color: 'var(--fg-4)', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600 }}>Username</span>
          <input style={field} value={username} onChange={(e) => setUsername(e.target.value)} autoFocus autoComplete="username" />
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          <span style={{ fontSize: 11, color: 'var(--fg-4)', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600 }}>Password</span>
          <input style={field} type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
        </label>

        {error && (
          <div style={{ fontSize: 12, color: 'var(--urgent-300)', background: 'var(--tone-urgent-soft)', border: '1px solid rgba(239,68,68,0.4)', borderRadius: 6, padding: '6px 10px' }}>
            {error}
          </div>
        )}

        <Button variant="primary" size="lg" type="submit" style={{ justifyContent: 'center' }}>
          {busy ? 'Signing in…' : 'Sign in'}
        </Button>
      </form>
    </div>
  );
}

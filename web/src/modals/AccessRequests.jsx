import React from 'react';
import { Icon } from '../icons.jsx';
import { Button, Eyebrow } from '../components/atoms.jsx';
import { relTime } from '../lib/format.js';

function RequestRow({ req, onApprove, onDeny, onChanged }) {
  const [password, setPassword] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState(null);

  async function approve() {
    if (password.length < 8) return setError('Password must be at least 8 characters.');
    setBusy(true);
    setError(null);
    try {
      await onApprove(req.id, password);
      onChanged();
    } catch (e) {
      setError(e.message);
      setBusy(false);
    }
  }
  async function deny() {
    setBusy(true);
    setError(null);
    try {
      await onDeny(req.id);
      onChanged();
    } catch (e) {
      setError(e.message);
      setBusy(false);
    }
  }

  return (
    <div style={{ border: '1px solid var(--border-subtle)', borderRadius: 8, padding: 12, marginBottom: 8, background: 'var(--bg-surface)' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
        <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--fg-1)' }}>{req.displayName}</span>
        <span style={{ fontSize: 12, color: 'var(--fg-5)', fontFamily: 'var(--font-mono)' }}>@{req.username}</span>
        <span style={{ flex: 1 }} />
        <span style={{ fontSize: 11, color: 'var(--fg-5)', fontFamily: 'var(--font-mono)' }}>{relTime(req.createdAt)}</span>
      </div>
      {req.email && <div style={{ fontSize: 12, color: 'var(--fg-4)', marginTop: 2 }}>{req.email}</div>}
      {req.note && <div style={{ fontSize: 13, color: 'var(--fg-3)', marginTop: 6 }}>{req.note}</div>}
      <div style={{ display: 'flex', gap: 8, marginTop: 10, alignItems: 'center' }}>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Set initial password"
          style={{ flex: 1, padding: '7px 9px', background: 'var(--gray-950)', border: '1px solid var(--border-default)', borderRadius: 6, color: 'var(--fg-1)', fontSize: 13, outline: 'none' }}
        />
        <Button variant="primary" size="sm" onClick={approve} disabled={busy}>
          Approve
        </Button>
        <Button variant="danger" size="sm" onClick={deny} disabled={busy}>
          Deny
        </Button>
      </div>
      {error && <div style={{ fontSize: 12, color: 'var(--urgent-300)', marginTop: 6 }}>{error}</div>}
    </div>
  );
}

export function AccessRequests({ open, onClose, fetchAccessRequests, onApprove, onDeny }) {
  const [requests, setRequests] = React.useState([]);
  const [loading, setLoading] = React.useState(false);

  const reload = React.useCallback(() => {
    setLoading(true);
    fetchAccessRequests('pending')
      .then(setRequests)
      .catch(() => setRequests([]))
      .finally(() => setLoading(false));
  }, [fetchAccessRequests]);

  React.useEffect(() => {
    if (open) reload();
  }, [open, reload]);

  if (!open) return null;

  return (
    <div
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, zIndex: 100, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', paddingTop: '10vh' }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="nocos-scrollbar"
        style={{ width: 'min(540px, 94vw)', maxHeight: '78vh', overflowY: 'auto', background: 'var(--bg-surface)', border: '1px solid var(--border-default)', borderRadius: 12, boxShadow: 'var(--shadow-lg)' }}
      >
        <header style={{ position: 'sticky', top: 0, background: 'var(--bg-surface)', padding: '14px 18px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', gap: 10, zIndex: 1 }}>
          <Icon name="inbox" size={16} style={{ color: 'var(--fg-3)' }} />
          <span style={{ flex: 1, fontSize: 15, fontWeight: 600, color: 'var(--fg-1)' }}>Access requests</span>
          <Button variant="ghost" size="sm" onClick={onClose}>
            Close
          </Button>
        </header>
        <div style={{ padding: 18 }}>
          <Eyebrow style={{ marginBottom: 10 }}>Pending · {requests.length}</Eyebrow>
          {loading && <div style={{ color: 'var(--fg-4)', fontSize: 13 }}>Loading…</div>}
          {!loading && requests.length === 0 && <div style={{ color: 'var(--fg-5)', fontSize: 13 }}>No pending requests.</div>}
          {requests.map((req) => (
            <RequestRow key={req.id} req={req} onApprove={onApprove} onDeny={onDeny} onChanged={reload} />
          ))}
        </div>
      </div>
    </div>
  );
}

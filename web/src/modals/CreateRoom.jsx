import React from 'react';
import { Icon } from '../icons.jsx';
import { Button } from '../components/atoms.jsx';

export function CreateRoom({ open, onClose, onCreate }) {
  const [title, setTitle] = React.useState('');
  const [isPublic, setIsPublic] = React.useState(true);
  const [error, setError] = React.useState(null);
  const [busy, setBusy] = React.useState(false);
  const inputRef = React.useRef(null);

  React.useEffect(() => {
    if (open) {
      setTitle('');
      setIsPublic(true);
      setError(null);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  if (!open) return null;

  async function submit(e) {
    e.preventDefault();
    const name = title.trim();
    if (name.length < 3) return setError('Channel name must be at least 3 characters.');
    setBusy(true);
    setError(null);
    try {
      const id = await onCreate(name, isPublic);
      onClose();
      return id;
    } catch (err) {
      setError(err.message || 'Could not create channel');
      setBusy(false);
      return null;
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
    <div
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, zIndex: 100, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', paddingTop: '14vh' }}
    >
      <form
        onClick={(e) => e.stopPropagation()}
        onSubmit={submit}
        style={{ width: 'min(440px, 92vw)', background: 'var(--bg-surface)', border: '1px solid var(--border-default)', borderRadius: 10, boxShadow: 'var(--shadow-lg)', padding: 18, display: 'flex', flexDirection: 'column', gap: 14 }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Icon name="hash" size={16} style={{ color: 'var(--fg-3)' }} />
          <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--fg-1)' }}>Create a channel</span>
        </div>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          <span style={{ fontSize: 11, color: 'var(--fg-4)', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600 }}>Name</span>
          <input ref={inputRef} style={field} value={title} maxLength={80} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. incidents" />
        </label>
        <div style={{ display: 'flex', gap: 8 }}>
          {[
            { v: true, label: 'Public', desc: 'Anyone can join', icon: 'hash' },
            { v: false, label: 'Private', desc: 'Approval required', icon: 'lock' },
          ].map((o) => (
            <button
              key={String(o.v)}
              type="button"
              onClick={() => setIsPublic(o.v)}
              style={{
                flex: 1,
                textAlign: 'left',
                padding: '10px 12px',
                borderRadius: 8,
                cursor: 'pointer',
                background: isPublic === o.v ? 'color-mix(in oklab, var(--accent-color, var(--blue-500)) 14%, var(--bg-surface))' : 'var(--bg-surface-2)',
                border: `1px solid ${isPublic === o.v ? 'color-mix(in oklab, var(--accent-color, var(--blue-500)) 45%, transparent)' : 'var(--border-subtle)'}`,
                color: 'var(--fg-2)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600, color: 'var(--fg-1)' }}>
                <Icon name={o.icon} size={13} />
                {o.label}
              </div>
              <div style={{ fontSize: 11, color: 'var(--fg-5)', marginTop: 2 }}>{o.desc}</div>
            </button>
          ))}
        </div>
        {error && (
          <div style={{ fontSize: 12, color: 'var(--urgent-300)', background: 'var(--tone-urgent-soft)', border: '1px solid rgba(239,68,68,0.4)', borderRadius: 6, padding: '6px 10px' }}>{error}</div>
        )}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <Button variant="ghost" size="md" type="button" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" size="md" type="submit" icon="plus">
            {busy ? 'Creating…' : 'Create channel'}
          </Button>
        </div>
      </form>
    </div>
  );
}

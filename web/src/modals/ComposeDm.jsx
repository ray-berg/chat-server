import React from 'react';
import { Icon } from '../icons.jsx';
import { Avatar, BotPill, PresenceDot } from '../components/atoms.jsx';

export function ComposeDm({ open, onClose, searchUsers, currentUserId, onPicked }) {
  const [query, setQuery] = React.useState('');
  const [results, setResults] = React.useState([]);
  const [busy, setBusy] = React.useState(false);
  const inputRef = React.useRef(null);

  React.useEffect(() => {
    if (open) {
      setQuery('');
      setResults([]);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  React.useEffect(() => {
    if (!open) return undefined;
    let cancelled = false;
    const t = setTimeout(async () => {
      const users = await searchUsers(query);
      if (!cancelled) setResults(users.filter((u) => u.id !== currentUserId));
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [query, open, searchUsers, currentUserId]);

  async function pick(u) {
    setBusy(true);
    const id = await onPicked(u.id);
    setBusy(false);
    onClose();
    return id;
  }

  if (!open) return null;
  return (
    <div
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, zIndex: 100, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', paddingTop: '14vh' }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ width: 'min(480px, 92vw)', background: 'var(--bg-surface)', border: '1px solid var(--border-default)', borderRadius: 10, boxShadow: 'var(--shadow-lg)', overflow: 'hidden' }}
      >
        <div style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 10, borderBottom: '1px solid var(--border-subtle)' }}>
          <Icon name="pencil" size={16} style={{ color: 'var(--fg-4)' }} />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Escape' && onClose()}
            placeholder="Start a direct message — search people…"
            style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', color: 'var(--fg-1)', fontFamily: 'var(--font-sans)', fontSize: 14 }}
          />
        </div>
        <div className="nocos-scrollbar" style={{ maxHeight: 320, overflowY: 'auto', padding: 6, opacity: busy ? 0.6 : 1 }}>
          {results.length === 0 && (
            <div style={{ padding: 20, textAlign: 'center', color: 'var(--fg-5)', fontSize: 13 }}>
              {query ? 'No people found.' : 'Type a name to search.'}
            </div>
          )}
          {results.map((u) => (
            <div
              key={u.id}
              onClick={() => pick(u)}
              style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderRadius: 6, cursor: 'pointer' }}
              onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-surface-2)')}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
            >
              <Avatar user={u} size={28} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                  <span style={{ fontSize: 13, color: 'var(--fg-1)' }}>{u.name}</span>
                  {u.bot && <BotPill inline />}
                </div>
                <div style={{ fontSize: 11, color: 'var(--fg-5)', fontFamily: 'var(--font-mono)' }}>@{u.handle}</div>
              </div>
              <PresenceDot status={u.presence} size={8} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

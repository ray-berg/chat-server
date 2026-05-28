import React from 'react';
import { Icon } from '../icons.jsx';

const miniKbd = {
  fontFamily: 'var(--font-mono)',
  fontSize: 10,
  padding: '1px 4px',
  margin: '0 2px',
  border: '1px solid var(--border-subtle)',
  borderRadius: 3,
  color: 'var(--fg-4)',
};

function iconForKind(kind) {
  if (kind === 'channel') return 'hash';
  if (kind === 'dm' || kind === 'people') return 'user';
  if (kind === 'search') return 'search';
  return 'spark';
}

export function CommandPalette({ open, onClose, palette, onJump }) {
  const [query, setQuery] = React.useState('');
  const [idx, setIdx] = React.useState(0);
  const inputRef = React.useRef(null);

  React.useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 50);
  }, [open]);
  React.useEffect(() => {
    setQuery('');
    setIdx(0);
  }, [open]);

  const filtered = palette.filter((p) => p.label.toLowerCase().includes(query.toLowerCase()));

  function onKey(e) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setIdx((i) => Math.min(filtered.length - 1, i + 1));
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      setIdx((i) => Math.max(0, i - 1));
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      const item = filtered[idx];
      if (item) onJump(item);
      onClose();
    }
    if (e.key === 'Escape') onClose();
  }

  if (!open) return null;
  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 100,
        background: 'rgba(0,0,0,0.55)',
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'center',
        paddingTop: '12vh',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 'min(640px, 92vw)',
          background: 'var(--bg-surface)',
          border: '1px solid var(--border-default)',
          borderRadius: 10,
          boxShadow: 'var(--shadow-lg)',
          overflow: 'hidden',
        }}
      >
        <div style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 10, borderBottom: '1px solid var(--border-subtle)' }}>
          <Icon name="search" size={18} style={{ color: 'var(--fg-4)' }} />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setIdx(0);
            }}
            onKeyDown={onKey}
            placeholder="Jump to a channel, person, or action…"
            style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', color: 'var(--fg-1)', fontFamily: 'var(--font-sans)', fontSize: 15 }}
          />
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, padding: '2px 6px', border: '1px solid var(--border-subtle)', borderRadius: 3, color: 'var(--fg-5)' }}>ESC</span>
        </div>
        <div className="nocos-scrollbar" style={{ maxHeight: 320, overflowY: 'auto', padding: 6 }}>
          {filtered.length === 0 && (
            <div style={{ padding: 24, textAlign: 'center', color: 'var(--fg-5)', fontSize: 13 }}>No matches. Try a different keyword.</div>
          )}
          {filtered.map((p, i) => (
            <div
              key={`${p.kind}-${p.id}`}
              onMouseEnter={() => setIdx(i)}
              onClick={() => {
                onJump(p);
                onClose();
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '8px 10px',
                borderRadius: 6,
                cursor: 'pointer',
                background: i === idx ? 'var(--bg-surface-2)' : 'transparent',
                borderLeft: `2px solid ${i === idx ? 'var(--accent-color, var(--blue-500))' : 'transparent'}`,
              }}
            >
              <Icon name={iconForKind(p.kind)} size={14} style={{ color: 'var(--fg-4)' }} />
              <span style={{ flex: 1, color: 'var(--fg-1)', fontSize: 14 }}>{p.label}</span>
              <span style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--fg-5)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{p.hint}</span>
              {i === idx && (
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, padding: '1px 5px', border: '1px solid var(--border-subtle)', borderRadius: 3, color: 'var(--fg-5)' }}>↵</span>
              )}
            </div>
          ))}
        </div>
        <div style={{ padding: '6px 12px', borderTop: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', gap: 12, fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--fg-5)' }}>
          <span>
            <kbd style={miniKbd}>↑↓</kbd> navigate
          </span>
          <span>
            <kbd style={miniKbd}>↵</kbd> open
          </span>
          <span>
            <kbd style={miniKbd}>#</kbd> channels
          </span>
          <span>
            <kbd style={miniKbd}>@</kbd> people
          </span>
        </div>
      </div>
    </div>
  );
}

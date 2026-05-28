import React from 'react';
import { Icon } from '../icons.jsx';
import { Avatar, IconButton } from '../components/atoms.jsx';

const huddleBtn = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: 36,
  height: 28,
  background: 'var(--bg-surface)',
  border: '1px solid var(--border-subtle)',
  borderRadius: 6,
  color: 'var(--fg-2)',
  cursor: 'pointer',
  fontFamily: 'var(--font-sans)',
  fontSize: 11,
  fontWeight: 500,
  padding: '0 8px',
};

function elapsed(startMs) {
  const s = Math.max(0, Math.floor((Date.now() - startMs) / 1000));
  const hh = String(Math.floor(s / 3600)).padStart(2, '0');
  const mm = String(Math.floor((s % 3600) / 60)).padStart(2, '0');
  const ss = String(s % 60).padStart(2, '0');
  return `${hh}:${mm}:${ss}`;
}

// Affordance only - no real WebRTC. Participants seeded from the channel.
export function HuddleFloater({ open, onClose, channel, participants = [] }) {
  const [, force] = React.useState(0);
  const startRef = React.useRef(Date.now());

  React.useEffect(() => {
    if (!open) return undefined;
    startRef.current = Date.now();
    const t = setInterval(() => force((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, [open]);

  if (!open) return null;
  const people = participants.slice(0, 4);

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 24,
        right: 24,
        zIndex: 50,
        width: 280,
        background: 'var(--bg-surface-2)',
        border: '1px solid var(--ok-500)',
        borderRadius: 10,
        boxShadow: 'var(--shadow-lg)',
        overflow: 'hidden',
      }}
    >
      <div style={{ padding: '8px 10px', display: 'flex', alignItems: 'center', gap: 8, background: 'linear-gradient(180deg, rgba(34,197,94,0.12) 0%, transparent 100%)' }}>
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 5,
            padding: '2px 7px',
            background: 'rgba(34,197,94,0.18)',
            border: '1px solid rgba(34,197,94,0.40)',
            borderRadius: 3,
            color: 'var(--ok-300)',
            fontSize: 10,
            fontFamily: 'var(--font-mono)',
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
          }}
        >
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--ok-500)', animation: 'chat-pulse 1.5s ease-in-out infinite' }} />
          LIVE
        </span>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--fg-1)' }}>{channel ? channel.name : 'Huddle'}</div>
          <div style={{ fontSize: 10, color: 'var(--fg-4)', fontFamily: 'var(--font-mono)' }}>
            {elapsed(startRef.current)} · {people.length} in call
          </div>
        </div>
        <IconButton icon="close" label="Hide" onClick={onClose} />
      </div>
      <div style={{ padding: 10, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {people.map((p) => (
          <div key={p.id} style={{ textAlign: 'center' }}>
            <div style={{ position: 'relative' }}>
              <Avatar user={p} size={40} square presence={false} />
              <span style={{ position: 'absolute', bottom: 2, right: 2, background: 'rgba(0,0,0,0.7)', borderRadius: 3, padding: '0 3px', fontSize: 8, color: 'white' }}>🎙</span>
            </div>
            <div style={{ fontSize: 10, color: 'var(--fg-3)', marginTop: 3 }}>{p.name}</div>
          </div>
        ))}
        {people.length === 0 && <div style={{ fontSize: 11, color: 'var(--fg-5)', padding: '4px 2px' }}>Waiting for others…</div>}
      </div>
      <div style={{ padding: '6px 10px 10px', display: 'flex', gap: 6, justifyContent: 'center' }}>
        <button title="Mute" style={huddleBtn}>
          <Icon name="phone" size={14} />
        </button>
        <button title="Camera" style={huddleBtn}>
          <Icon name="video" size={14} />
        </button>
        <button title="Share" style={huddleBtn}>
          <Icon name="share" size={14} />
        </button>
        <button title="Leave" onClick={onClose} style={{ ...huddleBtn, background: 'var(--urgent-500)', borderColor: 'var(--urgent-500)', color: 'white' }}>
          End
        </button>
      </div>
    </div>
  );
}

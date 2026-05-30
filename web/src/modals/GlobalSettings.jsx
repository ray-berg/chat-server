import React from 'react';
import { Icon } from '../icons.jsx';
import { Button, Eyebrow } from '../components/atoms.jsx';
import { soundEnabled, soundUnfocusedOnly, setSoundPrefs, playDing } from '../lib/sound.js';

function Toggle({ checked, onChange, disabled }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => !disabled && onChange(!checked)}
      style={{
        flexShrink: 0,
        width: 38,
        height: 22,
        borderRadius: 999,
        padding: 2,
        border: '1px solid var(--border-default)',
        background: checked ? 'var(--accent-color, var(--blue-500))' : 'var(--gray-800)',
        opacity: disabled ? 0.45 : 1,
        cursor: disabled ? 'default' : 'pointer',
        display: 'inline-flex',
        alignItems: 'center',
        transition: 'background 150ms',
      }}
    >
      <span
        style={{
          width: 16,
          height: 16,
          borderRadius: '50%',
          background: 'white',
          transform: checked ? 'translateX(16px)' : 'translateX(0)',
          transition: 'transform 150ms',
        }}
      />
    </button>
  );
}

function Row({ title, desc, children }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0' }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, color: 'var(--fg-1)' }}>{title}</div>
        {desc && <div style={{ fontSize: 11, color: 'var(--fg-5)', marginTop: 2 }}>{desc}</div>}
      </div>
      {children}
    </div>
  );
}

function ArchivedChannels({ isMod, isAdmin, fetchArchivedRooms, onRestore, onDelete }) {
  const [rooms, setRooms] = React.useState([]);
  const [loading, setLoading] = React.useState(true);

  const reload = React.useCallback(() => {
    setLoading(true);
    fetchArchivedRooms()
      .then((r) => setRooms(r || []))
      .finally(() => setLoading(false));
  }, [fetchArchivedRooms]);

  React.useEffect(() => {
    reload();
  }, [reload]);

  if (!isMod) return null;

  return (
    <div style={{ marginTop: 26 }}>
      <Eyebrow style={{ marginBottom: 2 }}>Archived channels</Eyebrow>
      <div style={{ fontSize: 11, color: 'var(--fg-5)', marginBottom: 8 }}>
        Restore an archived channel for everyone{isAdmin ? ', or delete it permanently.' : '.'}
      </div>
      {loading && <div style={{ fontSize: 12, color: 'var(--fg-5)' }}>Loading…</div>}
      {!loading && rooms.length === 0 && (
        <div style={{ fontSize: 12, color: 'var(--fg-5)' }}>No archived channels.</div>
      )}
      {!loading &&
        rooms.map((r) => (
          <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 0', borderTop: '1px solid var(--border-subtle)' }}>
            <Icon name="hash" size={12} style={{ color: 'var(--fg-5)' }} />
            <span style={{ flex: 1, minWidth: 0, fontSize: 13, color: 'var(--fg-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {r.title}
            </span>
            <Button
              variant="flat"
              size="sm"
              onClick={async () => {
                await onRestore(r.id);
                reload();
              }}
            >
              Restore
            </Button>
            {isAdmin && (
              <Button
                variant="danger"
                size="sm"
                onClick={async () => {
                  if (window.confirm(`Permanently delete #${r.title}? This erases all of its messages and cannot be undone.`)) {
                    await onDelete(r.id);
                    reload();
                  }
                }}
              >
                Delete
              </Button>
            )}
          </div>
        ))}
    </div>
  );
}

export function GlobalSettings({ open, onClose, isMod, isAdmin, fetchArchivedRooms, onRestore, onDelete }) {
  const [enabled, setEnabled] = React.useState(true);
  const [unfocused, setUnfocused] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    setEnabled(soundEnabled());
    setUnfocused(soundUnfocusedOnly());
  }, [open]);

  if (!open) return null;

  const toggleEnabled = (v) => {
    setEnabled(v);
    setSoundPrefs({ enabled: v });
  };
  const toggleUnfocused = (v) => {
    setUnfocused(v);
    setSoundPrefs({ unfocusedOnly: v });
  };

  return (
    <div
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, zIndex: 100, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', paddingTop: '8vh' }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="nocos-scrollbar"
        style={{ width: 'min(480px, 94vw)', maxHeight: '84vh', overflowY: 'auto', background: 'var(--bg-surface)', border: '1px solid var(--border-default)', borderRadius: 12, boxShadow: 'var(--shadow-lg)' }}
      >
        <header style={{ position: 'sticky', top: 0, background: 'var(--bg-surface)', padding: '14px 18px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', gap: 10, zIndex: 1 }}>
          <Icon name="settings" size={16} style={{ color: 'var(--fg-3)' }} />
          <span style={{ flex: 1, fontSize: 15, fontWeight: 600, color: 'var(--fg-1)' }}>Workspace settings</span>
          <Button variant="ghost" size="sm" onClick={onClose}>
            Close
          </Button>
        </header>
        <div style={{ padding: 18 }}>
          <Eyebrow style={{ marginBottom: 2 }}>Notifications</Eyebrow>
          <Row title="New-message sound" desc="Chime when a new post arrives in the conversation you're viewing.">
            <Toggle checked={enabled} onChange={toggleEnabled} />
          </Row>
          <div style={{ height: 1, background: 'var(--border-subtle)' }} />
          <Row title="Only when in the background" desc="Stay silent while this tab is focused; only chime when it isn't.">
            <Toggle checked={unfocused} onChange={toggleUnfocused} disabled={!enabled} />
          </Row>
          <div style={{ marginTop: 12 }}>
            <Button variant="flat" size="sm" onClick={() => playDing()} disabled={!enabled}>
              Test sound
            </Button>
          </div>
          {isMod && (
            <ArchivedChannels
              isMod={isMod}
              isAdmin={isAdmin}
              fetchArchivedRooms={fetchArchivedRooms}
              onRestore={onRestore}
              onDelete={onDelete}
            />
          )}
          <div style={{ marginTop: 22, fontSize: 11, color: 'var(--fg-5)', lineHeight: 1.5 }}>
            These preferences are stored on this device. Your profile, accent color, and password live in{' '}
            <strong style={{ color: 'var(--fg-3)' }}>Profile &amp; settings</strong>.
          </div>
        </div>
      </div>
    </div>
  );
}

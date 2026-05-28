// Workspace rail + channel list. Ported from chat-sidebar.jsx, wired to the store.
import React from 'react';
import { Icon } from '../icons.jsx';
import { Avatar, PresenceDot, BotPill, RoleBadge, IconButton } from '../components/atoms.jsx';

const railAddBtn = {
  width: 40,
  height: 40,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  background: 'transparent',
  border: '1px dashed var(--border-subtle)',
  borderRadius: 8,
  color: 'var(--fg-5)',
  cursor: 'pointer',
  padding: 0,
};
const railIconBtn = {
  width: 40,
  height: 32,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  background: 'transparent',
  border: 'none',
  color: 'var(--fg-4)',
  cursor: 'pointer',
  padding: 0,
};

export function WorkspaceRail({ workspaces, active, onSelect }) {
  return (
    <div
      style={{
        width: 56,
        background: 'var(--gray-950)',
        borderRight: '1px solid var(--border-subtle)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        padding: '10px 0',
        gap: 6,
        flexShrink: 0,
      }}
    >
      <div
        style={{
          width: 36,
          height: 36,
          borderRadius: 8,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: 6,
        }}
      >
        <img
          src="/nocos-brain.png"
          alt="NOCOS"
          width={28}
          height={28}
          style={{ filter: 'drop-shadow(0 0 8px rgba(34,211,238,0.4))' }}
        />
      </div>

      <div style={{ width: 24, height: 1, background: 'var(--border-subtle)', margin: '2px 0 6px' }} />

      {workspaces.map((w) => (
        <button
          key={w.id}
          onClick={() => onSelect && onSelect(w.id)}
          title={w.name}
          style={{
            position: 'relative',
            width: 40,
            height: 40,
            padding: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: w.id === active ? 'var(--bg-surface)' : 'transparent',
            border: `1px solid ${w.id === active ? w.accent : 'transparent'}`,
            borderRadius: 8,
            cursor: 'pointer',
            color: 'var(--fg-2)',
            fontFamily: 'var(--font-mono)',
            fontWeight: 600,
            fontSize: 12,
            letterSpacing: '0.04em',
            transition: 'background 150ms, border-color 150ms',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'var(--bg-surface)';
          }}
          onMouseLeave={(e) => {
            if (w.id !== active) e.currentTarget.style.background = 'transparent';
          }}
        >
          <span style={{ color: w.id === active ? w.accent : 'var(--fg-3)' }}>{w.short}</span>
          {w.id === active && (
            <span
              style={{
                position: 'absolute',
                left: -8,
                top: 8,
                bottom: 8,
                width: 3,
                borderRadius: '0 3px 3px 0',
                background: w.accent,
              }}
            />
          )}
        </button>
      ))}

      <button title="Add workspace" style={railAddBtn}>
        <Icon name="plus" size={14} />
      </button>

      <div style={{ flex: 1 }} />

      <button title="Activity" style={railIconBtn}>
        <Icon name="activity" size={14} />
      </button>
      <button title="Settings" style={railIconBtn}>
        <Icon name="settings" size={14} />
      </button>
    </div>
  );
}

function Section({ label, items, renderItem, actionIcon, onAction }) {
  const [open, setOpen] = React.useState(true);
  if (!items || items.length === 0) return null;
  return (
    <div style={{ marginTop: 10 }}>
      <div
        style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 8px', cursor: 'pointer' }}
        onClick={() => setOpen(!open)}
      >
        <Icon name={open ? 'chevDown' : 'chevRight'} size={10} style={{ color: 'var(--fg-5)' }} />
        <span
          style={{
            flex: 1,
            fontSize: 10,
            fontWeight: 600,
            textTransform: 'uppercase',
            letterSpacing: 'var(--tracking-eyebrow)',
            color: 'var(--fg-5)',
          }}
        >
          {label}
        </span>
        {actionIcon && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onAction && onAction();
            }}
            style={{ background: 'transparent', border: 'none', color: 'var(--fg-5)', cursor: 'pointer', padding: 2, borderRadius: 3 }}
            title="Add"
          >
            <Icon name={actionIcon} size={12} />
          </button>
        )}
      </div>
      {open && <div style={{ display: 'flex', flexDirection: 'column' }}>{items.map(renderItem)}</div>}
    </div>
  );
}

function QuickRow({ icon, label, badge, tone, active, onClick }) {
  return (
    <div
      onClick={onClick}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '6px 8px',
        borderRadius: 5,
        cursor: 'pointer',
        color: active ? 'var(--fg-1)' : 'var(--fg-3)',
        background: active ? 'var(--bg-surface-2)' : 'transparent',
        fontSize: 13,
      }}
      onMouseEnter={(e) => {
        if (!active) e.currentTarget.style.background = 'var(--bg-surface-2)';
      }}
      onMouseLeave={(e) => {
        if (!active) e.currentTarget.style.background = 'transparent';
      }}
    >
      <Icon name={icon} size={14} style={{ color: 'var(--fg-4)' }} />
      <span style={{ flex: 1 }}>{label}</span>
      {badge ? (
        <span
          style={{
            minWidth: 16,
            height: 16,
            padding: '0 5px',
            borderRadius: 999,
            background: tone === 'urgent' ? 'var(--urgent-500)' : 'var(--brass-400)',
            color: tone === 'urgent' ? 'white' : 'var(--gray-950)',
            fontSize: 10,
            fontWeight: 700,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontFamily: 'var(--font-mono)',
          }}
        >
          {badge}
        </span>
      ) : null}
    </div>
  );
}

function ChannelRow({ ch, active, onSelect }) {
  const icon = ch.privacy === 'private' ? 'lock' : 'hash';
  const muted = ch.muted;
  const unread = (ch.unread || 0) > 0;
  return (
    <div
      onClick={() => onSelect && onSelect(ch.id)}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 7,
        padding: '5px 8px',
        borderRadius: 5,
        cursor: 'pointer',
        color: active ? 'var(--fg-1)' : unread ? 'var(--fg-2)' : muted ? 'var(--fg-5)' : 'var(--fg-3)',
        background: active ? 'color-mix(in oklab, var(--accent-color, var(--blue-500)) 18%, transparent)' : 'transparent',
        borderLeft: active ? '2px solid var(--accent-color, var(--blue-500))' : '2px solid transparent',
        paddingLeft: 14,
        position: 'relative',
        fontWeight: unread ? 600 : 400,
        fontSize: 13,
      }}
      onMouseEnter={(e) => {
        if (!active) e.currentTarget.style.background = 'var(--bg-surface-2)';
      }}
      onMouseLeave={(e) => {
        if (!active) e.currentTarget.style.background = 'transparent';
      }}
    >
      <Icon name={icon} size={13} style={{ color: active ? 'var(--accent-color, var(--blue-400))' : 'var(--fg-5)' }} />
      <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ch.name}</span>
      {ch.mentions ? (
        <span
          style={{
            minWidth: 16,
            height: 16,
            padding: '0 5px',
            borderRadius: 999,
            background: 'var(--urgent-500)',
            color: 'white',
            fontSize: 10,
            fontWeight: 700,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontFamily: 'var(--font-mono)',
          }}
        >
          {ch.mentions}
        </span>
      ) : unread ? (
        <span style={{ fontSize: 11, color: 'var(--fg-4)', fontFamily: 'var(--font-mono)' }}>{ch.unread}</span>
      ) : null}
      {muted && <Icon name="bellOff" size={11} style={{ color: 'var(--fg-6)' }} />}
    </div>
  );
}

function DirectRow({ ch, active, onSelect, usersById }) {
  const u = ch.user ? usersById[ch.user] : null;
  const isGroup = Array.isArray(ch.users);
  const unread = (ch.unread || 0) > 0;
  return (
    <div
      onClick={() => onSelect && onSelect(ch.id)}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '5px 8px 5px 14px',
        borderRadius: 5,
        cursor: 'pointer',
        background: active ? 'color-mix(in oklab, var(--accent-color, var(--blue-500)) 18%, transparent)' : 'transparent',
        borderLeft: active ? '2px solid var(--accent-color, var(--blue-500))' : '2px solid transparent',
        paddingLeft: active ? 12 : 14,
        color: active ? 'var(--fg-1)' : unread ? 'var(--fg-2)' : 'var(--fg-3)',
        fontSize: 13,
        fontWeight: unread ? 600 : 400,
      }}
      onMouseEnter={(e) => {
        if (!active) e.currentTarget.style.background = 'var(--bg-surface-2)';
      }}
      onMouseLeave={(e) => {
        if (!active) e.currentTarget.style.background = 'transparent';
      }}
    >
      {isGroup ? (
        <span style={{ width: 18, height: 18, position: 'relative', flexShrink: 0 }}>
          <Avatar user={usersById[ch.users[0]]} size={14} presence={false} />
          <span style={{ position: 'absolute', right: -2, bottom: -2 }}>
            <Avatar user={usersById[ch.users[1]]} size={12} presence={false} />
          </span>
        </span>
      ) : (
        <Avatar user={u} size={18} presence />
      )}
      <span
        style={{
          flex: 1,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          display: 'inline-flex',
          alignItems: 'center',
          gap: 4,
        }}
      >
        {ch.name}
        {u && u.bot && <BotPill inline />}
      </span>
      {unread ? (
        <span
          style={{
            minWidth: 16,
            height: 16,
            padding: '0 5px',
            borderRadius: 999,
            background: 'var(--urgent-500)',
            color: 'white',
            fontSize: 10,
            fontWeight: 700,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontFamily: 'var(--font-mono)',
          }}
        >
          {ch.unread}
        </span>
      ) : null}
    </div>
  );
}

const PRESENCE_LABEL = { online: 'Online', idle: 'Idle', away: 'Away', dnd: 'Do not disturb', offline: 'Offline' };

const ACCENT_SWATCHES = [
  { name: 'Blue', value: '#3b82f6' },
  { name: 'Brass', value: '#c9a548' },
  { name: 'Cyan', value: '#22d3ee' },
  { name: 'Magenta', value: '#d946ef' },
];

const menuItemStyle = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  padding: '6px 8px',
  background: 'transparent',
  border: 'none',
  color: 'var(--fg-3)',
  cursor: 'pointer',
  borderRadius: 4,
  fontSize: 12,
  textAlign: 'left',
  width: '100%',
};

function UserFooter({ user, onSetPresence, onLogout, onSetAccent, currentAccent, isAdmin, onOpenSettings }) {
  const [open, setOpen] = React.useState(false);
  if (!user) return null;
  return (
    <div
      style={{
        padding: 10,
        borderTop: '1px solid var(--border-subtle)',
        background: 'var(--gray-950)',
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        position: 'relative',
      }}
    >
      <Avatar user={user} size={32} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--fg-1)' }}>{user.name}</span>
          <RoleBadge role={user.role} />
        </div>
        <button
          onClick={() => setOpen(!open)}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
            background: 'transparent',
            border: 'none',
            padding: 0,
            color: 'var(--fg-4)',
            cursor: 'pointer',
            fontSize: 11,
          }}
        >
          <PresenceDot status={user.presence} size={7} />
          <span>{PRESENCE_LABEL[user.presence] || 'Offline'}</span>
          <Icon name="chevDown" size={10} />
        </button>
        {open && (
          <div
            style={{
              position: 'absolute',
              bottom: '100%',
              left: 8,
              right: 8,
              marginBottom: 6,
              background: 'var(--bg-surface-2)',
              border: '1px solid var(--border-default)',
              borderRadius: 8,
              padding: 4,
              boxShadow: 'var(--shadow-md)',
              zIndex: 20,
              display: 'flex',
              flexDirection: 'column',
              gap: 1,
            }}
          >
            {['online', 'idle', 'away', 'dnd', 'offline'].map((s) => (
              <button
                key={s}
                onClick={() => {
                  setOpen(false);
                  onSetPresence && onSetPresence(s);
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '6px 8px',
                  background: 'transparent',
                  border: 'none',
                  color: 'var(--fg-2)',
                  cursor: 'pointer',
                  borderRadius: 4,
                  fontSize: 12,
                  textAlign: 'left',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'var(--bg-surface)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'transparent';
                }}
              >
                <PresenceDot status={s} size={8} />
                <span>{PRESENCE_LABEL[s]}</span>
              </button>
            ))}
            <div style={{ height: 1, background: 'var(--border-subtle)', margin: '4px 0' }} />
            <div style={{ padding: '4px 8px 6px' }}>
              <div style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 'var(--tracking-eyebrow)', color: 'var(--fg-5)', marginBottom: 6 }}>Accent</div>
              <div style={{ display: 'flex', gap: 8 }}>
                {ACCENT_SWATCHES.map((a) => {
                  const active = (currentAccent || '').toLowerCase() === a.value.toLowerCase();
                  return (
                    <button
                      key={a.value}
                      title={a.name}
                      onClick={() => onSetAccent && onSetAccent(a.value)}
                      style={{
                        width: 20,
                        height: 20,
                        borderRadius: '50%',
                        background: a.value,
                        cursor: 'pointer',
                        padding: 0,
                        border: active ? '2px solid var(--fg-1)' : '2px solid transparent',
                        boxShadow: active ? `0 0 0 1px ${a.value}` : 'none',
                      }}
                    />
                  );
                })}
              </div>
            </div>
            <div style={{ height: 1, background: 'var(--border-subtle)', margin: '4px 0' }} />
            <button onClick={() => { setOpen(false); onOpenSettings && onOpenSettings(); }} style={menuItemStyle}>
              <Icon name="user" size={12} />
              Profile &amp; settings
            </button>
            {isAdmin && (
              <a href="/admin.html" target="_blank" rel="noopener noreferrer" style={{ ...menuItemStyle, textDecoration: 'none' }}>
                <Icon name="settings" size={12} />
                Admin console
              </a>
            )}
            <button onClick={() => { setOpen(false); onLogout && onLogout(); }} style={menuItemStyle}>
              <Icon name="logout" size={12} />
              Sign out
            </button>
          </div>
        )}
      </div>
      <IconButton icon="settings" label="Settings" onClick={onOpenSettings} />
    </div>
  );
}

export function ChannelList({
  workspace,
  channels,
  usersById,
  currentUser,
  activeId,
  onSelect,
  onCmdK,
  onComposeDm,
  onSetPresence,
  onLogout,
  onSetAccent,
  currentAccent,
  isAdmin,
  onOpenSettings,
  onCreateRoom,
  approvalsCount = 0,
  onQuick,
}) {
  const pinned = channels.filter((c) => c.section === 'pinned');
  const chans = channels.filter((c) => c.section === 'channels');
  const voice = channels.filter((c) => c.section === 'voice');
  const direct = channels.filter((c) => c.section === 'direct');

  return (
    <aside
      style={{
        width: 264,
        background: 'var(--bg-surface)',
        borderRight: '1px solid var(--border-subtle)',
        display: 'flex',
        flexDirection: 'column',
        flexShrink: 0,
        minHeight: 0,
      }}
    >
      <header
        style={{
          padding: '14px 14px 12px',
          borderBottom: '1px solid var(--border-subtle)',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
        }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <h2 style={{ fontSize: 14, fontWeight: 600, color: 'var(--fg-1)', margin: 0, letterSpacing: '-0.005em' }}>
              {workspace.name}
            </h2>
            <Icon name="chevDown" size={12} style={{ color: 'var(--fg-4)' }} />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 2 }}>
            <PresenceDot status="online" size={6} />
            <span style={{ fontSize: 11, color: 'var(--fg-4)' }}>{channels.length} conversations</span>
          </div>
        </div>
        <IconButton icon="pencil" label="Compose" onClick={onComposeDm} />
      </header>

      <button
        onClick={onCmdK}
        style={{
          margin: '10px 12px 6px',
          padding: '7px 10px',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          background: 'var(--gray-950)',
          border: '1px solid var(--border-subtle)',
          borderRadius: 6,
          color: 'var(--fg-4)',
          cursor: 'pointer',
          fontSize: 12,
          textAlign: 'left',
        }}
      >
        <Icon name="search" size={13} />
        <span style={{ flex: 1 }}>Search &amp; jump…</span>
        <span
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 10,
            padding: '1px 5px',
            border: '1px solid var(--border-subtle)',
            borderRadius: 3,
            color: 'var(--fg-5)',
          }}
        >
          ⌘K
        </span>
      </button>

      <div style={{ display: 'flex', flexDirection: 'column', padding: '4px 6px 0' }}>
        <QuickRow icon="activity" label="Activity" onClick={() => onQuick && onQuick('activity')} />
        <QuickRow
          icon="inbox"
          label="Approvals"
          badge={approvalsCount || undefined}
          tone="urgent"
          onClick={() => onQuick && onQuick('approvals')}
        />
        <QuickRow icon="bookmark" label="Saved" onClick={() => onQuick && onQuick('saved')} />
        <QuickRow icon="thread" label="Threads" onClick={() => onQuick && onQuick('threads')} />
        <QuickRow icon="file" label="Files" onClick={() => onQuick && onQuick('files')} />
      </div>

      <div className="nocos-scrollbar" style={{ flex: 1, overflowY: 'auto', padding: '8px 6px 16px', minHeight: 0 }}>
        <Section
          label="Pinned"
          items={pinned}
          renderItem={(c) => <ChannelRow key={c.id} ch={c} active={c.id === activeId} onSelect={onSelect} />}
        />
        <Section
          label="Channels"
          actionIcon={onCreateRoom ? 'plus' : undefined}
          onAction={onCreateRoom}
          items={chans}
          renderItem={(c) => <ChannelRow key={c.id} ch={c} active={c.id === activeId} onSelect={onSelect} />}
        />
        <Section
          label="Voice"
          items={voice}
          renderItem={(c) => <ChannelRow key={c.id} ch={c} active={c.id === activeId} onSelect={onSelect} />}
        />
        <Section
          label="Direct messages"
          actionIcon="plus"
          onAction={onComposeDm}
          items={direct}
          renderItem={(c) => (
            <DirectRow key={c.id} ch={c} active={c.id === activeId} onSelect={onSelect} usersById={usersById} />
          )}
        />
      </div>

      <UserFooter
        user={currentUser}
        onSetPresence={onSetPresence}
        onLogout={onLogout}
        onSetAccent={onSetAccent}
        currentAccent={currentAccent}
        isAdmin={isAdmin}
        onOpenSettings={onOpenSettings}
      />
    </aside>
  );
}

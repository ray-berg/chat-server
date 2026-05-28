import React from 'react';
import { Icon } from '../icons.jsx';
import { Pill, IconButton, Button, Divider } from '../components/atoms.jsx';

export function ChatHeader({ channel, memberCount = 0, onlineCount = 0, topic, railMode, onToggleRail, onSearch, onMembers, onPinned, onHuddle }) {
  const privacyIcon = channel.privacy === 'private' ? 'lock' : channel.type === 'direct' ? 'user' : 'hash';
  return (
    <header
      style={{
        borderBottom: '1px solid var(--border-subtle)',
        background: 'color-mix(in oklab, var(--bg-app) 90%, transparent)',
        backdropFilter: 'blur(8px)',
        padding: '10px 16px',
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        minHeight: 56,
        flexShrink: 0,
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Icon name={privacyIcon} size={15} style={{ color: 'var(--fg-3)' }} />
          <h1 style={{ fontSize: 15, fontWeight: 600, color: 'var(--fg-1)', margin: 0 }}>{channel.name}</h1>
          {channel.privacy === 'private' && (
            <Pill tone="neutral" size="xs">
              Private
            </Pill>
          )}
          <button
            onClick={onMembers}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              background: 'transparent',
              border: '1px solid var(--border-subtle)',
              borderRadius: 4,
              padding: '1px 6px',
              color: 'var(--fg-3)',
              cursor: 'pointer',
              fontSize: 11,
            }}
            onMouseEnter={(e) => (e.currentTarget.style.borderColor = 'var(--border-default)')}
            onMouseLeave={(e) => (e.currentTarget.style.borderColor = 'var(--border-subtle)')}
          >
            <Icon name="users" size={11} />
            <span style={{ fontFamily: 'var(--font-mono)' }}>{memberCount}</span>
          </button>
          {onlineCount > 0 && (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'var(--fg-4)', fontFamily: 'var(--font-mono)' }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--ok-500)', animation: 'chat-pulse 2s ease-in-out infinite' }} />
              {onlineCount} online
            </span>
          )}
        </div>
        {topic && (
          <div style={{ marginTop: 2, fontSize: 11, color: 'var(--fg-4)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{topic}</div>
        )}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        <Button onClick={onHuddle} variant="ghost" size="sm" icon="phone">
          Huddle
        </Button>
        <Divider vertical />
        <IconButton icon="search" label="Search in channel" onClick={onSearch} />
        <IconButton icon="pin" label="Pinned" active={railMode === 'pinned'} onClick={onPinned} />
        <IconButton icon="file" label="Files" active={railMode === 'files'} onClick={() => onToggleRail('files')} />
        <IconButton icon="users" label="Members" active={railMode === 'members'} onClick={() => onToggleRail('members')} />
        <IconButton icon="inbox" label="Details" active={railMode === 'details'} onClick={() => onToggleRail('details')} />
        <IconButton icon="bell" label="Notifications" />
        <IconButton icon="moreH" label="More" />
      </div>
    </header>
  );
}

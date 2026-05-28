// Compact right rail: Details / Members / Approvals wired to real data;
// thread/files/pinned/activity are scaffolded placeholders (Phase 2 wire-in).
import React from 'react';
import { Icon } from '../icons.jsx';
import { Avatar, Eyebrow, Pill, Button, IconButton, RoleBadge, BotPill } from '../components/atoms.jsx';
import { relTime } from '../lib/format.js';

const TITLES = {
  details: 'Details',
  members: 'Members',
  approvals: 'Approvals',
  thread: 'Thread',
  files: 'Files',
  pinned: 'Pinned',
  activity: 'Activity',
};

function MembersPane({ members, usersById }) {
  const users = members.map((id) => usersById[id]).filter(Boolean);
  const online = users.filter((u) => u.presence === 'online');
  const offline = users.filter((u) => u.presence !== 'online');
  const Row = (u) => (
    <div key={u.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 4px' }}>
      <Avatar user={u} size={28} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <span style={{ fontSize: 13, color: 'var(--fg-1)' }}>{u.name}</span>
          {u.bot && <BotPill inline />}
          <RoleBadge role={u.role} />
        </div>
        <div style={{ fontSize: 11, color: 'var(--fg-5)', fontFamily: 'var(--font-mono)' }}>@{u.handle}</div>
      </div>
    </div>
  );
  return (
    <div>
      {online.length > 0 && (
        <>
          <Eyebrow style={{ margin: '4px 0 2px' }}>Online — {online.length}</Eyebrow>
          {online.map(Row)}
        </>
      )}
      {offline.length > 0 && (
        <>
          <Eyebrow style={{ margin: '12px 0 2px' }}>Offline — {offline.length}</Eyebrow>
          {offline.map(Row)}
        </>
      )}
      {users.length === 0 && <div style={{ color: 'var(--fg-5)', fontSize: 12 }}>No members loaded.</div>}
    </div>
  );
}

function DetailsPane({ channel, members }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div>
        <Eyebrow>Topic</Eyebrow>
        <div style={{ fontSize: 13, color: 'var(--fg-3)', marginTop: 4 }}>No topic set.</div>
      </div>
      <div>
        <Eyebrow>Properties</Eyebrow>
        <div style={{ marginTop: 6, display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '6px 12px', fontSize: 12 }}>
          <span style={{ color: 'var(--fg-5)' }}>Type</span>
          <span style={{ color: 'var(--fg-2)' }}>{channel.type === 'direct' ? 'Direct message' : 'Channel'}</span>
          <span style={{ color: 'var(--fg-5)' }}>Visibility</span>
          <span style={{ color: 'var(--fg-2)' }}>{channel.privacy === 'private' ? 'Private' : channel.type === 'direct' ? '—' : 'Public'}</span>
          <span style={{ color: 'var(--fg-5)' }}>Members</span>
          <span style={{ color: 'var(--fg-2)', fontFamily: 'var(--font-mono)' }}>{members.length}</span>
        </div>
      </div>
    </div>
  );
}

function ApprovalsPane({ approvals, usersById, onRespond }) {
  const { incoming = [], outgoing = [] } = approvals || {};
  const Card = (a, mine) => (
    <div key={a.id} style={{ border: '1px solid var(--border-subtle)', borderLeft: '3px solid var(--brass-400)', borderRadius: 6, padding: 10, marginBottom: 8, background: 'var(--bg-surface)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--fg-1)', flex: 1 }}>{a.note || 'Approval request'}</span>
        <Pill tone={a.status === 'approved' ? 'ok' : a.status === 'denied' ? 'urgent' : 'warn'} size="xs">
          {a.status}
        </Pill>
      </div>
      <div style={{ fontSize: 11, color: 'var(--fg-5)', fontFamily: 'var(--font-mono)', marginBottom: mine ? 8 : 0 }}>
        {mine ? `from ${a.requesterName || a.requesterId}` : `to ${a.targetName || a.targetId}`} · {relTime(a.createdAt)}
      </div>
      {mine && a.status === 'pending' && (
        <div style={{ display: 'flex', gap: 6 }}>
          <Button variant="primary" size="sm" onClick={() => onRespond(a.id, 'approved')}>
            Approve
          </Button>
          <Button variant="danger" size="sm" onClick={() => onRespond(a.id, 'denied')}>
            Deny
          </Button>
        </div>
      )}
    </div>
  );
  return (
    <div>
      <Eyebrow style={{ marginBottom: 6 }}>Awaiting your review — {incoming.filter((a) => a.status === 'pending').length}</Eyebrow>
      {incoming.length ? incoming.map((a) => Card(a, true)) : <div style={{ color: 'var(--fg-5)', fontSize: 12, marginBottom: 12 }}>Nothing awaiting you.</div>}
      <Eyebrow style={{ margin: '12px 0 6px' }}>Sent</Eyebrow>
      {outgoing.length ? outgoing.map((a) => Card(a, false)) : <div style={{ color: 'var(--fg-5)', fontSize: 12 }}>No sent requests.</div>}
    </div>
  );
}

function Placeholder({ mode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '60%', gap: 8, color: 'var(--fg-5)', textAlign: 'center' }}>
      <Icon name={mode === 'thread' ? 'thread' : mode === 'files' ? 'file' : mode === 'pinned' ? 'pin' : 'activity'} size={22} />
      <div style={{ fontSize: 12 }}>{TITLES[mode]} view is coming next.</div>
    </div>
  );
}

export function RightRail({ mode, channel, members, usersById, approvals, onRespondApproval, onClose }) {
  if (!mode) return null;
  return (
    <aside
      style={{
        width: 360,
        background: 'var(--bg-surface)',
        borderLeft: '1px solid var(--border-subtle)',
        display: 'flex',
        flexDirection: 'column',
        flexShrink: 0,
        minHeight: 0,
      }}
    >
      <header style={{ padding: '12px 14px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--fg-1)', flex: 1 }}>{TITLES[mode] || 'Panel'}</span>
        {channel && <span style={{ fontSize: 11, color: 'var(--fg-5)', fontFamily: 'var(--font-mono)' }}>{channel.name}</span>}
        <IconButton icon="close" label="Close" onClick={onClose} />
      </header>
      <div className="nocos-scrollbar" style={{ flex: 1, overflowY: 'auto', padding: 14, minHeight: 0 }}>
        {mode === 'members' && <MembersPane members={members} usersById={usersById} />}
        {mode === 'details' && <DetailsPane channel={channel} members={members} />}
        {mode === 'approvals' && <ApprovalsPane approvals={approvals} usersById={usersById} onRespond={onRespondApproval} />}
        {['thread', 'files', 'pinned', 'activity'].includes(mode) && <Placeholder mode={mode} />}
      </div>
    </aside>
  );
}

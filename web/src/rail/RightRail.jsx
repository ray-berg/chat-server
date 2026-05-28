// Right rail: thread / details / members / files / pinned / activity / approvals.
// Ported from chat-rail.jsx, wired to real data where the backend supports it;
// files/pinned/activity show empty states (no backend yet) but keep the design.
import React from 'react';
import { Icon } from '../icons.jsx';
import { Avatar, Eyebrow, Pill, Button, IconButton, RoleBadge, BotPill } from '../components/atoms.jsx';
import { relTime } from '../lib/format.js';
import { MessageRun } from '../main/messages.jsx';

const TITLES = {
  thread: 'Thread',
  details: 'Details',
  members: 'Members',
  files: 'Files',
  pinned: 'Pinned',
  activity: 'Activity',
  approvals: 'Approvals',
};

const radioRow = { display: 'inline-flex', alignItems: 'center', gap: 8, color: 'var(--fg-2)' };

function RailHeader({ mode, channel, onClose }) {
  return (
    <header style={{ padding: '10px 14px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--fg-1)' }}>{TITLES[mode]}</div>
        {channel && (
          <div style={{ fontSize: 11, color: 'var(--fg-4)', display: 'flex', alignItems: 'center', gap: 4 }}>
            <Icon name={channel.privacy === 'private' ? 'lock' : channel.type === 'direct' ? 'user' : 'hash'} size={10} />
            <span>{channel.name}</span>
          </div>
        )}
      </div>
      <IconButton icon="moreH" label="More" />
      <IconButton icon="close" label="Close" onClick={onClose} />
    </header>
  );
}

function DetailSection({ title, actionLabel, children }) {
  return (
    <section style={{ marginBottom: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        <Eyebrow style={{ flex: 1 }}>{title}</Eyebrow>
        {actionLabel && (
          <button style={{ background: 'transparent', border: 'none', color: 'var(--accent-color, var(--blue-400))', fontSize: 11, cursor: 'pointer', padding: 0 }}>
            {actionLabel}
          </button>
        )}
      </div>
      {children}
    </section>
  );
}

function MemberRow({ user, expanded }) {
  if (!user) return null;
  return (
    <div
      style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '5px 6px', borderRadius: 5, cursor: 'pointer' }}
      onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-surface-2)')}
      onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
    >
      <Avatar user={user} size={26} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <span style={{ fontSize: 13, color: 'var(--fg-1)', fontWeight: 500 }}>{user.name}</span>
          {user.bot && <BotPill />}
          {user.role !== 'user' && <RoleBadge role={user.role} />}
        </div>
        {expanded && (
          <div style={{ fontSize: 11, color: 'var(--fg-5)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {user.bot && user.model ? user.model : `@${user.handle}`} {user.title ? `· ${user.title}` : ''}
          </div>
        )}
      </div>
      <IconButton icon="user" label="View profile" />
    </div>
  );
}

function ThreadComposer({ channel, onSend }) {
  const [text, setText] = React.useState('');
  return (
    <div style={{ padding: '8px 12px 12px', borderTop: '1px solid var(--border-subtle)' }}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (text.trim()) {
            onSend && onSend(text);
            setText('');
          }
        }}
        style={{ background: 'var(--gray-950)', border: '1px solid var(--border-default)', borderRadius: 8, padding: 8 }}
      >
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Reply in thread…"
          rows={2}
          style={{ display: 'block', width: '100%', background: 'transparent', border: 'none', outline: 'none', resize: 'none', color: 'var(--fg-1)', fontFamily: 'var(--font-sans)', fontSize: 13, lineHeight: 1.5 }}
        />
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 4 }}>
          <IconButton icon="paperclip" label="Attach" />
          <IconButton icon="smile" label="Emoji" />
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'var(--fg-4)', marginLeft: 6 }}>
            <input type="checkbox" defaultChecked style={{ accentColor: 'var(--accent-color, var(--blue-500))' }} />
            Also send to <span style={{ fontFamily: 'var(--font-mono)' }}>{channel ? `#${channel.name}` : 'channel'}</span>
          </label>
          <span style={{ flex: 1 }} />
          <Button variant="primary" size="sm" icon="send" type="submit">
            Reply
          </Button>
        </div>
      </form>
    </div>
  );
}

function ThreadPane({ source, usersById, channel, onThreadSend }) {
  return (
    <>
      <div className="nocos-scrollbar" style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
        {source ? (
          <div style={{ padding: '12px 4px 0' }}>
            <MessageRun msg={source} usersById={usersById} isFirst density="comfortable" />
          </div>
        ) : (
          <div style={{ padding: 24, color: 'var(--fg-5)', textAlign: 'center', fontSize: 12 }}>Open a message&apos;s reply action to start a thread.</div>
        )}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 16px' }}>
          <span style={{ flex: 1, height: 1, background: 'var(--border-subtle)' }} />
          <span style={{ fontSize: 11, color: 'var(--fg-4)', fontFamily: 'var(--font-mono)' }}>0 replies</span>
          <span style={{ flex: 1, height: 1, background: 'var(--border-subtle)' }} />
        </div>
        <div style={{ padding: '0 16px', color: 'var(--fg-5)', fontSize: 12 }}>Threaded replies aren&apos;t stored server-side yet. Replies post to the channel.</div>
      </div>
      <ThreadComposer channel={channel} onSend={onThreadSend} />
    </>
  );
}

function DetailsPane({ channel, members, usersById }) {
  const memberUsers = members.map((id) => usersById[id]).filter(Boolean);
  return (
    <div className="nocos-scrollbar" style={{ flex: 1, overflowY: 'auto', minHeight: 0, padding: '12px 14px' }}>
      <DetailSection title="Topic" actionLabel="edit">
        <p style={{ margin: 0, fontSize: 13, color: 'var(--fg-3)' }}>No topic set.</p>
      </DetailSection>
      <DetailSection title="Properties">
        <div style={{ display: 'grid', gridTemplateColumns: '90px 1fr', rowGap: 6, columnGap: 12, fontSize: 12 }}>
          <span style={{ color: 'var(--fg-5)' }}>Type</span>
          <span style={{ color: 'var(--fg-2)' }}>{channel.type === 'direct' ? 'Direct message' : 'Channel'}</span>
          <span style={{ color: 'var(--fg-5)' }}>Visibility</span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, color: 'var(--fg-2)' }}>
            <Icon name={channel.privacy === 'private' ? 'lock' : 'hash'} size={11} />
            {channel.privacy === 'private' ? 'Private' : channel.type === 'direct' ? 'Direct' : 'Public'}
          </span>
          <span style={{ color: 'var(--fg-5)' }}>Members</span>
          <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--fg-2)' }}>{members.length}</span>
        </div>
      </DetailSection>
      <DetailSection title="Notifications">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12 }}>
          <label style={radioRow}>
            <input type="radio" name="not" defaultChecked /> All new messages
          </label>
          <label style={radioRow}>
            <input type="radio" name="not" /> @mentions &amp; threads I follow
          </label>
          <label style={radioRow}>
            <input type="radio" name="not" /> Mute
          </label>
        </div>
      </DetailSection>
      <DetailSection title="Members" actionLabel="add">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {memberUsers.map((u) => (
            <MemberRow key={u.id} user={u} />
          ))}
          {memberUsers.length === 0 && <div style={{ color: 'var(--fg-5)', fontSize: 12 }}>No members loaded.</div>}
        </div>
      </DetailSection>
      <div style={{ marginTop: 10, display: 'flex', gap: 6 }}>
        <Button variant="ghost" size="sm" icon="bellOff">
          Mute channel
        </Button>
        <Button variant="danger" size="sm">
          Leave channel
        </Button>
      </div>
    </div>
  );
}

function MembersPane({ members, usersById }) {
  const [q, setQ] = React.useState('');
  const list = members.map((id) => usersById[id]).filter(Boolean).filter((u) => u.name.toLowerCase().includes(q.toLowerCase()));
  const online = list.filter((u) => u.presence === 'online');
  const offline = list.filter((u) => u.presence !== 'online');
  return (
    <div className="nocos-scrollbar" style={{ flex: 1, overflowY: 'auto', minHeight: 0, padding: '12px 14px' }}>
      <div style={{ marginBottom: 10, display: 'flex', alignItems: 'center', gap: 8 }}>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Find a member…"
          style={{ flex: 1, padding: '6px 10px', background: 'var(--gray-950)', border: '1px solid var(--border-subtle)', borderRadius: 6, color: 'var(--fg-1)', fontSize: 12, outline: 'none', fontFamily: 'var(--font-sans)' }}
        />
        <Button variant="primary" size="sm" icon="plus">
          Add
        </Button>
      </div>
      <Eyebrow style={{ marginBottom: 6 }}>Online · {online.length}</Eyebrow>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 1, marginBottom: 14 }}>
        {online.map((u) => (
          <MemberRow key={u.id} user={u} expanded />
        ))}
      </div>
      <Eyebrow style={{ marginBottom: 6 }}>Offline · {offline.length}</Eyebrow>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
        {offline.map((u) => (
          <MemberRow key={u.id} user={u} expanded />
        ))}
      </div>
    </div>
  );
}

function EmptyPane({ icon, lines }) {
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, color: 'var(--fg-5)', textAlign: 'center', padding: 24 }}>
      <Icon name={icon} size={22} />
      {lines.map((l, i) => (
        <div key={i} style={{ fontSize: 12, maxWidth: 240 }}>
          {l}
        </div>
      ))}
    </div>
  );
}

function ActivityFilters() {
  return (
    <div style={{ padding: '8px 14px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', gap: 6, flexWrap: 'wrap' }}>
      <Pill tone="info" size="xs">All</Pill>
      <Pill tone="neutral" size="xs">Mentions</Pill>
      <Pill tone="neutral" size="xs">Threads</Pill>
      <Pill tone="neutral" size="xs">Reactions</Pill>
      <Pill tone="neutral" size="xs">Approvals</Pill>
    </div>
  );
}

function ApprovalsPane({ approvals, usersById, onRespond }) {
  const { incoming = [], outgoing = [] } = approvals || {};
  return (
    <div className="nocos-scrollbar" style={{ flex: 1, overflowY: 'auto', minHeight: 0, padding: 14 }}>
      <Eyebrow style={{ marginBottom: 6 }}>Awaiting your review · {incoming.filter((a) => a.status === 'pending').length}</Eyebrow>
      {incoming.length ? (
        incoming.map((a) => (
          <div key={a.id} style={{ padding: 12, marginBottom: 8, background: 'var(--bg-surface)', border: '1px solid color-mix(in oklab, var(--brass-400) 40%, transparent)', borderLeft: '3px solid var(--brass-400)', borderRadius: 6 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
              <Pill tone={a.status === 'approved' ? 'ok' : a.status === 'denied' ? 'urgent' : 'warn'} size="xs">
                {a.status}
              </Pill>
              <span style={{ flex: 1 }} />
              <span style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--fg-5)' }}>{a.id.slice(0, 8)}</span>
            </div>
            <div style={{ fontSize: 13, color: 'var(--fg-1)', fontWeight: 500, marginBottom: 4 }}>{a.note || 'Approval request'}</div>
            <div style={{ fontSize: 11, color: 'var(--fg-4)', marginBottom: 8 }}>
              from <span style={{ color: 'var(--fg-2)' }}>{a.requesterName || (usersById[a.requesterId] || {}).name || a.requesterId}</span> · {relTime(a.createdAt)}
            </div>
            {a.status === 'pending' && (
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
        ))
      ) : (
        <div style={{ color: 'var(--fg-5)', fontSize: 12, marginBottom: 12 }}>Nothing awaiting you.</div>
      )}

      <Eyebrow style={{ marginTop: 14, marginBottom: 6 }}>Sent · {outgoing.length}</Eyebrow>
      {outgoing.length ? (
        outgoing.map((a) => (
          <div key={a.id} style={{ padding: 10, marginBottom: 6, background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 6 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
              <Pill tone={a.status === 'approved' ? 'ok' : a.status === 'denied' ? 'urgent' : 'warn'} size="xs">
                {a.status}
              </Pill>
              <span style={{ flex: 1 }} />
              <span style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--fg-5)' }}>{relTime(a.createdAt)}</span>
            </div>
            <div style={{ fontSize: 13, color: 'var(--fg-2)' }}>{a.note || 'Approval request'}</div>
            <div style={{ fontSize: 11, color: 'var(--fg-5)' }}>to <span style={{ color: 'var(--fg-3)' }}>{a.targetName || (usersById[a.targetId] || {}).name || a.targetId}</span></div>
          </div>
        ))
      ) : (
        <div style={{ color: 'var(--fg-5)', fontSize: 12 }}>No sent requests.</div>
      )}
    </div>
  );
}

export function RightRail({ mode, channel, members = [], usersById, approvals, messages = [], threadSourceId, onRespondApproval, onThreadSend, onClose }) {
  if (!mode) return null;
  const threadSource = threadSourceId ? messages.find((m) => m.id === threadSourceId) : null;
  return (
    <aside style={{ width: 360, background: 'var(--bg-surface)', borderLeft: '1px solid var(--border-subtle)', display: 'flex', flexDirection: 'column', flexShrink: 0, minHeight: 0 }}>
      <RailHeader mode={mode} channel={channel} onClose={onClose} />
      {mode === 'thread' && <ThreadPane source={threadSource} usersById={usersById} channel={channel} onThreadSend={onThreadSend} />}
      {mode === 'details' && <DetailsPane channel={channel} members={members} usersById={usersById} />}
      {mode === 'members' && <MembersPane members={members} usersById={usersById} />}
      {mode === 'approvals' && <ApprovalsPane approvals={approvals} usersById={usersById} onRespond={onRespondApproval} />}
      {mode === 'files' && <EmptyPane icon="file" lines={['No files indexed yet.', 'Uploaded images and attachments will appear here.']} />}
      {mode === 'pinned' && <EmptyPane icon="pin" lines={['No pinned messages.', 'Pin a message from its hover toolbar.']} />}
      {mode === 'activity' && (
        <>
          <ActivityFilters />
          <EmptyPane icon="activity" lines={['No recent activity.', 'Mentions, replies, and reactions will show up here.']} />
        </>
      )}
    </aside>
  );
}

// Message rendering: inline/rich markdown, runs, cards, list. Ported from chat-main.jsx.
import React from 'react';
import { Icon } from '../icons.jsx';
import {
  Avatar,
  BotPill,
  RoleBadge,
  Pill,
  IconButton,
  Button,
  StreamCursor,
} from '../components/atoms.jsx';
import { timeShort, timeFull, relTime } from '../lib/format.js';

const UNKNOWN = { name: 'Unknown', initials: '?', avatarColor: 'var(--gray-700)', role: 'user' };

function isSameRun(a, b) {
  if (!a || !b) return false;
  if (a.author !== b.author) return false;
  if (a.system || b.system) return false;
  if (a.thinking || b.thinking) return false;
  const dt = Math.abs(new Date(b.at) - new Date(a.at));
  return dt < 1000 * 60 * 5;
}

const inlineCodeStyle = {
  fontFamily: 'var(--font-mono)',
  fontSize: '0.85em',
  padding: '0px 5px',
  background: 'var(--gray-950)',
  border: '1px solid var(--border-subtle)',
  borderRadius: 3,
  color: 'var(--brass-300)',
};

function renderInline(text) {
  const parts = [];
  const remaining = text || '';
  const tokenRe = /(\*\*([^*]+)\*\*)|(`([^`]+)`)|(@(\w+))|(https?:\/\/[^\s]+)/g;
  let last = 0;
  let m;
  // eslint-disable-next-line no-cond-assign
  while ((m = tokenRe.exec(remaining)) !== null) {
    if (m.index > last) parts.push({ type: 'text', value: remaining.slice(last, m.index) });
    if (m[1]) parts.push({ type: 'bold', value: m[2] });
    else if (m[3]) parts.push({ type: 'code', value: m[4] });
    else if (m[5]) parts.push({ type: 'mention', value: m[6] });
    else if (m[7]) parts.push({ type: 'link', value: m[7] });
    last = m.index + m[0].length;
  }
  if (last < remaining.length) parts.push({ type: 'text', value: remaining.slice(last) });

  return parts.map((p, i) => {
    if (p.type === 'bold')
      return (
        <strong key={i} style={{ color: 'var(--fg-1)', fontWeight: 600 }}>
          {p.value}
        </strong>
      );
    if (p.type === 'code')
      return (
        <code key={i} style={inlineCodeStyle}>
          {p.value}
        </code>
      );
    if (p.type === 'mention')
      return (
        <span
          key={i}
          style={{
            display: 'inline-flex',
            alignItems: 'baseline',
            gap: 3,
            padding: '0 5px',
            borderRadius: 3,
            background: 'color-mix(in oklab, var(--accent-color, var(--blue-500)) 18%, transparent)',
            color: 'var(--accent-color, var(--blue-300))',
            fontWeight: 500,
            cursor: 'pointer',
          }}
        >
          @{p.value}
        </span>
      );
    if (p.type === 'link')
      return (
        <a
          key={i}
          href={p.value}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            color: 'var(--accent-color, var(--blue-400))',
            textDecoration: 'underline',
            textDecorationColor: 'color-mix(in oklab, var(--accent-color, var(--blue-500)) 40%, transparent)',
          }}
        >
          {p.value}
        </a>
      );
    return <React.Fragment key={i}>{p.value}</React.Fragment>;
  });
}

function renderRich(text) {
  const blocks = (text || '').split(/\n\n+/);
  return blocks.map((block, bi) => {
    const lines = block.split('\n');
    if (lines.every((l) => /^[-*]\s+/.test(l) || l.trim() === '')) {
      const items = lines.filter((l) => l.trim()).map((l) => l.replace(/^[-*]\s+/, ''));
      return (
        <ul key={bi} style={{ margin: '4px 0 6px', paddingLeft: 22, color: 'var(--fg-2)' }}>
          {items.map((it, i) => (
            <li key={i} style={{ marginBottom: 1 }}>
              {renderInline(it)}
            </li>
          ))}
        </ul>
      );
    }
    return (
      <p key={bi} style={{ margin: bi === 0 ? '0 0 4px' : '4px 0', color: 'var(--fg-2)' }}>
        {lines.map((line, i) => (
          <React.Fragment key={i}>
            {renderInline(line)}
            {i < lines.length - 1 && <br />}
          </React.Fragment>
        ))}
      </p>
    );
  });
}

function syntaxHighlight(body) {
  const lines = body.split('\n');
  return lines.map((line, i) => {
    let parts;
    if (line.startsWith('$') || line.startsWith('→')) {
      parts = [
        <span key="p" style={{ color: line.startsWith('$') ? 'var(--brass-300)' : 'var(--ok-400)' }}>
          {line.slice(0, 1)}
        </span>,
        <span key="r">{line.slice(1)}</span>,
      ];
    } else if (/^\s*#/.test(line)) {
      parts = [
        <span key="c" style={{ color: 'var(--fg-5)' }}>
          {line}
        </span>,
      ];
    } else {
      parts = [line];
    }
    return <div key={i}>{parts}</div>;
  });
}

function CodeBlock({ code }) {
  return (
    <div style={{ marginTop: 6, background: 'var(--gray-950)', border: '1px solid var(--border-subtle)', borderRadius: 6, overflow: 'hidden' }}>
      <div
        style={{
          padding: '4px 10px',
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          borderBottom: '1px solid var(--border-subtle)',
          background: 'var(--bg-surface)',
        }}
      >
        <Icon name="code" size={11} style={{ color: 'var(--fg-5)' }} />
        <span style={{ fontSize: 10, color: 'var(--fg-5)', fontFamily: 'var(--font-mono)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
          {code.lang}
        </span>
        <span style={{ flex: 1 }} />
        <button
          type="button"
          onClick={() => navigator.clipboard?.writeText(code.body)}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: 'transparent', border: 'none', color: 'var(--fg-4)', cursor: 'pointer', fontSize: 10, padding: '2px 4px' }}
        >
          Copy
        </button>
      </div>
      <pre style={{ margin: 0, padding: '10px 12px', fontSize: 12, lineHeight: 1.5, fontFamily: 'var(--font-mono)', color: 'var(--fg-2)', overflow: 'auto', whiteSpace: 'pre' }}>
        {syntaxHighlight(code.body)}
      </pre>
    </div>
  );
}

function ToolCallCard({ tc }) {
  const [open, setOpen] = React.useState(false);
  const isOk = tc.status === 'ok';
  return (
    <div
      style={{
        marginTop: 6,
        background: 'var(--bg-surface)',
        border: '1px solid color-mix(in oklab, var(--cyan-500) 25%, transparent)',
        borderLeft: '3px solid var(--cyan-500)',
        borderRadius: 6,
        overflow: 'hidden',
        maxWidth: 560,
      }}
    >
      <div onClick={() => setOpen(!open)} style={{ padding: '7px 10px', display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
        <Icon name="zap" size={13} style={{ color: 'var(--cyan-400)' }} />
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--fg-1)' }}>{tc.name}</span>
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 3,
            fontSize: 10,
            fontFamily: 'var(--font-mono)',
            color: isOk ? 'var(--ok-300)' : 'var(--urgent-300)',
            padding: '0 5px',
            borderRadius: 3,
            background: isOk ? 'var(--tone-ok-soft)' : 'var(--tone-urgent-soft)',
            border: `1px solid ${isOk ? 'rgba(34,197,94,0.30)' : 'rgba(239,68,68,0.30)'}`,
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
          }}
        >
          {tc.status}
        </span>
        <span style={{ flex: 1 }} />
        <span style={{ fontSize: 10, color: 'var(--fg-5)', fontFamily: 'var(--font-mono)' }}>{tc.durationMs}ms</span>
        <Icon name={open ? 'chevDown' : 'chevRight'} size={12} style={{ color: 'var(--fg-4)' }} />
      </div>
      <div style={{ padding: '0 10px 8px', fontSize: 12, color: 'var(--fg-3)' }}>{tc.summary}</div>
      {open && (
        <div style={{ borderTop: '1px solid var(--border-subtle)', padding: 10, background: 'var(--gray-950)', fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--fg-3)' }}>
          <div style={{ color: 'var(--fg-5)', marginBottom: 4 }}># arguments</div>
          <pre style={{ margin: 0, whiteSpace: 'pre-wrap', color: 'var(--brass-300)' }}>{JSON.stringify(tc.args, null, 2)}</pre>
        </div>
      )}
    </div>
  );
}

function ApprovalCard({ apr, usersById = {}, onRespond }) {
  return (
    <div
      style={{
        marginTop: 8,
        background: 'var(--bg-surface)',
        border: '1px solid color-mix(in oklab, var(--brass-400) 45%, transparent)',
        borderLeft: '3px solid var(--brass-400)',
        borderRadius: 6,
        maxWidth: 560,
      }}
    >
      <div style={{ padding: '8px 12px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', gap: 8 }}>
        <Icon name="check" size={13} style={{ color: 'var(--brass-300)' }} />
        <span style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--brass-300)' }}>Approval requested</span>
        <span style={{ flex: 1 }} />
        <span style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--fg-5)' }}>{apr.id}</span>
      </div>
      <div style={{ padding: '10px 12px' }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--fg-1)', marginBottom: 4 }}>{apr.title}</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
          {apr.target && (
            <Pill tone="neutral" size="xs">
              target: <span style={{ fontFamily: 'var(--font-mono)', marginLeft: 3 }}>{apr.target}</span>
            </Pill>
          )}
          {apr.scope && (
            <Pill tone="warn" size="xs">
              {apr.scope}
            </Pill>
          )}
          {apr.requestedAt && (
            <Pill tone="neutral" size="xs">
              requested {relTime(apr.requestedAt)}
            </Pill>
          )}
          {(apr.reviewers || []).map((r) => {
            const u = usersById[r];
            return (
              <span key={r} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'var(--fg-4)' }}>
                <span>reviewer:</span>
                <Avatar user={u} size={14} presence={false} />
                <span style={{ color: 'var(--fg-2)' }}>{u ? u.name : r}</span>
              </span>
            );
          })}
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <Button variant="primary" size="sm" onClick={() => onRespond && onRespond(apr.id, 'approved')}>
            Approve
          </Button>
          <Button variant="danger" size="sm" onClick={() => onRespond && onRespond(apr.id, 'denied')}>
            Deny
          </Button>
          <Button variant="ghost" size="sm">
            Discuss in thread
          </Button>
        </div>
      </div>
    </div>
  );
}

const addReactionBtn = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 2,
  height: 22,
  padding: '0 6px',
  background: 'transparent',
  border: '1px dashed var(--border-subtle)',
  borderRadius: 12,
  color: 'var(--fg-5)',
  cursor: 'pointer',
};

function AttachmentCard({ att }) {
  const icons = { csv: 'file', md: 'file', pdf: 'file', sh: 'code' };
  const iconName = icons[att.kind] || 'file';
  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 10, padding: '8px 10px', background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 6, maxWidth: 340 }}>
      <div style={{ width: 32, height: 32, borderRadius: 6, background: 'var(--bg-surface-3)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--brass-300)', flexShrink: 0 }}>
        <Icon name={iconName} size={16} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--fg-1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: 'var(--font-mono)' }}>{att.name}</div>
        <div style={{ fontSize: 10, color: 'var(--fg-5)', fontFamily: 'var(--font-mono)', textTransform: 'uppercase' }}>
          {att.kind} · {att.size}
        </div>
      </div>
      <IconButton icon="download" label="Download" />
    </div>
  );
}

export function MessageRun({ msg, usersById, isFirst, onOpenThread, onReact, onRespondApproval, density }) {
  const author = usersById[msg.author] || UNKNOWN;
  const [hovering, setHovering] = React.useState(false);

  if (msg.system) {
    return (
      <div style={{ padding: '6px 64px', display: 'flex', alignItems: 'center', gap: 8, color: 'var(--fg-5)', fontSize: 11 }}>
        <Icon name={msg.kind === 'pin' ? 'pin' : msg.kind === 'join' ? 'plus' : 'fork'} size={12} />
        <span style={{ flex: 1, fontStyle: 'italic' }}>{msg.text}</span>
        <span style={{ fontFamily: 'var(--font-mono)' }}>{timeShort(msg.at)}</span>
      </div>
    );
  }

  if (msg.thinking) {
    return (
      <div style={{ padding: '6px 16px 6px 64px', display: 'flex', alignItems: 'center', gap: 8 }}>
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            padding: '4px 10px',
            background: 'color-mix(in oklab, var(--cyan-500) 8%, transparent)',
            border: '1px solid color-mix(in oklab, var(--cyan-500) 30%, transparent)',
            borderRadius: 999,
            color: 'var(--cyan-300)',
            fontSize: 11,
            fontFamily: 'var(--font-mono)',
          }}
        >
          <span className="thinking-dot" style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--cyan-400)' }} />
          <span className="thinking-dot" style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--cyan-400)', animationDelay: '0.15s' }} />
          <span className="thinking-dot" style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--cyan-400)', animationDelay: '0.30s' }} />
          <span style={{ marginLeft: 4 }}>{author.name} is thinking…</span>
        </span>
      </div>
    );
  }

  const padY = density === 'compact' ? 1 : 2;

  return (
    <div
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => setHovering(false)}
      style={{
        position: 'relative',
        padding: isFirst ? `8px 16px ${padY}px 16px` : `${padY}px 16px ${padY}px 16px`,
        marginTop: isFirst ? 6 : 0,
        background: hovering ? 'var(--bg-surface-2)' : 'transparent',
        transition: 'background 100ms',
        opacity: msg.pending ? 0.6 : 1,
      }}
    >
      <div style={{ display: 'flex', gap: 12 }}>
        <div style={{ width: 36, flexShrink: 0, paddingTop: isFirst ? 2 : 0, textAlign: 'right' }}>
          {isFirst ? (
            <Avatar user={author} size={36} square presence={false} />
          ) : (
            <span style={{ fontSize: 10, color: 'var(--fg-5)', fontFamily: 'var(--font-mono)', opacity: hovering ? 1 : 0 }}>{timeShort(msg.at)}</span>
          )}
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          {isFirst && (
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 2 }}>
              <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--fg-1)' }}>{author.name}</span>
              {author.bot && <BotPill />}
              {author.role !== 'user' && <RoleBadge role={author.role} />}
              {author.bot && author.model && <span style={{ fontSize: 10, color: 'var(--fg-5)', fontFamily: 'var(--font-mono)' }}>{author.model}</span>}
              <span style={{ fontSize: 11, color: 'var(--fg-5)', fontFamily: 'var(--font-mono)' }} title={timeFull(msg.at)}>
                {timeShort(msg.at)}
              </span>
              {msg.pending && <span style={{ fontSize: 10, color: 'var(--fg-5)' }}>Sending…</span>}
              {msg.failed && <span style={{ fontSize: 10, color: 'var(--urgent-300)' }}>Failed to send</span>}
            </div>
          )}

          <div style={{ fontSize: 14, lineHeight: 1.5, color: 'var(--fg-2)' }}>
            {msg.text && renderRich(msg.text)}
            {msg.streaming && <StreamCursor />}
          </div>

          {msg.code && <CodeBlock code={msg.code} />}
          {msg.toolCall && <ToolCallCard tc={msg.toolCall} />}
          {msg.approval && <ApprovalCard apr={msg.approval} usersById={usersById} onRespond={onRespondApproval} />}

          {msg.approvalActionFor && (
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                marginTop: 6,
                padding: '4px 10px',
                background: 'var(--tone-ok-soft)',
                border: '1px solid color-mix(in oklab, var(--ok-500) 40%, transparent)',
                borderRadius: 4,
                fontSize: 11,
                color: 'var(--ok-300)',
                fontFamily: 'var(--font-mono)',
              }}
            >
              <Icon name="check" size={11} /> APPROVED · {msg.approvalActionFor}
            </div>
          )}

          {msg.attachments && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 6 }}>
              {msg.attachments.map((a, i) => (
                <AttachmentCard key={i} att={a} />
              ))}
            </div>
          )}

          {msg.reactions && msg.reactions.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 6 }}>
              {msg.reactions.map((r, i) => (
                <button
                  key={i}
                  onClick={() => onReact && onReact(msg.id, r.e)}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 5,
                    padding: '1px 7px',
                    height: 22,
                    background: r.mine ? 'color-mix(in oklab, var(--accent-color, var(--blue-500)) 20%, transparent)' : 'var(--bg-surface)',
                    border: r.mine ? '1px solid color-mix(in oklab, var(--accent-color, var(--blue-500)) 55%, transparent)' : '1px solid var(--border-subtle)',
                    borderRadius: 12,
                    color: r.mine ? 'var(--fg-1)' : 'var(--fg-3)',
                    fontSize: 12,
                    cursor: 'pointer',
                  }}
                >
                  <span style={{ fontSize: 13 }}>{r.e}</span>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11 }}>{r.count}</span>
                </button>
              ))}
              <button title="Add reaction" style={addReactionBtn}>
                <Icon name="smile" size={12} />
                <Icon name="plus" size={9} style={{ marginLeft: -2 }} />
              </button>
            </div>
          )}

          {msg.threadCount ? (
            <button
              onClick={() => onOpenThread && onOpenThread(msg.id)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                marginTop: 8,
                padding: '4px 8px',
                background: 'transparent',
                border: '1px solid transparent',
                borderRadius: 4,
                cursor: 'pointer',
                color: 'var(--accent-color, var(--blue-400))',
                fontSize: 12,
                fontWeight: 500,
              }}
            >
              <span style={{ display: 'inline-flex', marginRight: 2 }}>
                {(msg.threadPreviewAvatars || []).map((uid, i) => (
                  <span key={uid} style={{ marginLeft: i === 0 ? 0 : -6 }}>
                    <Avatar user={usersById[uid]} size={18} square presence={false} />
                  </span>
                ))}
              </span>
              <span>{msg.threadCount} replies</span>
              <span style={{ color: 'var(--fg-5)', fontWeight: 400, fontSize: 11 }}>Last reply {relTime(msg.threadLastAt)}</span>
              <Icon name="chevRight" size={11} />
            </button>
          ) : null}
        </div>
      </div>

      {hovering && !msg.system && (
        <div
          style={{
            position: 'absolute',
            top: -10,
            right: 16,
            display: 'flex',
            alignItems: 'center',
            gap: 1,
            padding: 2,
            background: 'var(--bg-surface-2)',
            border: '1px solid var(--border-default)',
            borderRadius: 6,
            boxShadow: 'var(--shadow-md)',
            zIndex: 5,
          }}
        >
          <IconButton icon="smile" label="React" />
          <IconButton icon="reply" label="Reply in thread" onClick={() => onOpenThread && onOpenThread(msg.id)} />
          <IconButton icon="share" label="Share" />
          <IconButton icon="bookmark" label="Save" />
          <IconButton icon="pin" label="Pin" />
          <span style={{ width: 1, alignSelf: 'stretch', background: 'var(--border-subtle)', margin: '2px 2px' }} />
          <IconButton icon="moreH" label="More" />
        </div>
      )}
    </div>
  );
}

function ChannelIntro({ channel }) {
  if (!channel) return null;
  const icon = channel.privacy === 'private' ? 'lock' : 'hash';
  return (
    <div style={{ borderLeft: '2px solid var(--brass-400)', padding: '8px 14px', marginBottom: 6 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <Icon name={icon} size={14} style={{ color: 'var(--brass-300)' }} />
        <h2 style={{ fontSize: 16, margin: 0, color: 'var(--fg-1)' }}>Welcome to #{channel.name}</h2>
      </div>
      <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--fg-4)', maxWidth: 540 }}>
        This is the start of #{channel.name}. Send a message to kick it off, or use / to run a command.
      </p>
    </div>
  );
}

function DayDivider({ day }) {
  const d = new Date(day);
  const fmt = d.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
  return (
    <div style={{ position: 'sticky', top: 0, zIndex: 2, display: 'flex', alignItems: 'center', gap: 10, padding: '6px 16px' }}>
      <span style={{ flex: 1, height: 1, background: 'var(--border-subtle)' }} />
      <span
        style={{
          padding: '2px 10px',
          fontSize: 10,
          fontFamily: 'var(--font-mono)',
          color: 'var(--fg-4)',
          background: 'var(--bg-surface)',
          border: '1px solid var(--border-subtle)',
          borderRadius: 999,
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
        }}
      >
        {fmt}
      </span>
      <span style={{ flex: 1, height: 1, background: 'var(--border-subtle)' }} />
    </div>
  );
}

function DotsRow({ label }) {
  return (
    <div style={{ padding: '4px 16px 4px 64px', display: 'flex', alignItems: 'center', gap: 8 }}>
      <span style={{ display: 'inline-flex', gap: 2 }}>
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="thinking-dot"
            style={{ display: 'inline-block', width: 4, height: 4, borderRadius: '50%', background: 'var(--fg-4)', animationDelay: `${i * 0.15}s` }}
          />
        ))}
      </span>
      <span style={{ fontSize: 11, color: 'var(--fg-4)' }}>{label}</span>
    </div>
  );
}

export function MessageList({ channel, messages, usersById, onOpenThread, onReact, onRespondApproval, typing = [], thinking = [], density }) {
  const scrollerRef = React.useRef(null);
  React.useEffect(() => {
    const s = scrollerRef.current;
    if (s) s.scrollTop = s.scrollHeight;
  }, [messages.length]);

  let lastDay = null;
  const out = [];
  messages.forEach((msg, i) => {
    const day = new Date(msg.at).toDateString();
    if (day !== lastDay) {
      out.push(<DayDivider key={`day-${i}`} day={day} />);
      lastDay = day;
    }
    const prev = messages[i - 1];
    const isFirst = !isSameRun(prev, msg);
    out.push(
      <MessageRun
        key={msg.id}
        msg={msg}
        usersById={usersById}
        isFirst={isFirst}
        onOpenThread={onOpenThread}
        onReact={onReact}
        onRespondApproval={onRespondApproval}
        density={density}
      />,
    );
  });

  return (
    <div ref={scrollerRef} className="nocos-scrollbar" style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', minHeight: 0 }}>
      <div style={{ padding: '20px 16px 8px' }}>
        <ChannelIntro channel={channel} />
      </div>
      {out}
      {thinking.map((t) => (
        <DotsRow key={`think-${t.id}`} label={`${t.name} is thinking…`} />
      ))}
      {typing.length > 0 && <DotsRow label={`${typing.join(', ')} ${typing.length > 1 ? 'are' : 'is'} typing…`} />}
      <div style={{ height: 12 }} />
    </div>
  );
}

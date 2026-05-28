import React from 'react';
import { Icon } from '../icons.jsx';
import { Avatar, PresenceDot, BotPill, IconButton, Button } from '../components/atoms.jsx';

const SLASH = [
  { cmd: '/approval', desc: 'Request approval inline', hint: '[title] @reviewer' },
  { cmd: '/remind', desc: 'Set a reminder', hint: 'me at 15:00 …' },
  { cmd: '/poll', desc: 'Quick poll', hint: '"Question" "A" "B"' },
  { cmd: '/code', desc: 'Send a code block', hint: '```bash …```' },
  { cmd: '/huddle', desc: 'Start a War Room voice huddle', hint: '' },
  { cmd: '/ai', desc: 'Summon an AI agent', hint: '@claude how…' },
  { cmd: '/dnd', desc: 'Pause notifications', hint: '30m | 2h | until tomorrow' },
];

const kbdStyle = {
  fontFamily: 'var(--font-mono)',
  fontSize: 10,
  padding: '1px 4px',
  border: '1px solid var(--border-subtle)',
  borderRadius: 3,
  color: 'var(--fg-4)',
};

const popItemStyle = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  padding: '5px 8px',
  cursor: 'pointer',
  fontSize: 13,
  color: 'var(--fg-2)',
};

function PopList({ title, children }) {
  return (
    <div
      style={{
        position: 'absolute',
        bottom: 'calc(100% + 6px)',
        left: 0,
        right: 0,
        background: 'var(--bg-surface-2)',
        border: '1px solid var(--border-default)',
        borderRadius: 8,
        boxShadow: 'var(--shadow-md)',
        padding: 4,
        maxHeight: 240,
        overflow: 'auto',
        zIndex: 10,
      }}
    >
      <div style={{ padding: '4px 8px', fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--fg-5)' }}>{title}</div>
      {children}
    </div>
  );
}

export function Composer({ channel, usersById, onSend, onTyping }) {
  const [text, setText] = React.useState('');
  const [showSlash, setShowSlash] = React.useState(false);
  const [showMention, setShowMention] = React.useState(false);
  const typingActive = React.useRef(false);
  const idleTimer = React.useRef(null);

  React.useEffect(() => {
    setShowSlash(text.startsWith('/') && !text.includes(' '));
    setShowMention(/@(\w*)$/.test(text));
  }, [text]);

  // Reset draft + typing when switching channels.
  React.useEffect(() => {
    setText('');
  }, [channel.id]);

  function signalTyping(active) {
    if (active === typingActive.current) return;
    typingActive.current = active;
    onTyping && onTyping(active);
  }

  function handleChange(e) {
    const v = e.target.value;
    setText(v);
    if (v.trim()) {
      signalTyping(true);
      if (idleTimer.current) clearTimeout(idleTimer.current);
      idleTimer.current = setTimeout(() => signalTyping(false), 4000);
    } else {
      signalTyping(false);
    }
  }

  const matchedSlash = showSlash ? SLASH.filter((s) => s.cmd.startsWith(text)).slice(0, 5) : [];
  const mentionQuery = showMention ? (/@(\w*)$/.exec(text) || ['', ''])[1] : '';
  const matchedMentions = showMention
    ? Object.values(usersById)
        .filter((u) => u && (u.name.toLowerCase().startsWith(mentionQuery.toLowerCase()) || u.handle.toLowerCase().startsWith(mentionQuery.toLowerCase())))
        .slice(0, 6)
    : [];

  function send(e) {
    if (e) e.preventDefault();
    if (!text.trim()) return;
    onSend && onSend(text);
    setText('');
    if (idleTimer.current) clearTimeout(idleTimer.current);
    signalTyping(false);
  }

  function onKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }

  return (
    <div style={{ padding: '0 16px 16px', flexShrink: 0 }}>
      <form
        onSubmit={send}
        style={{ position: 'relative', background: 'var(--bg-surface)', border: '1px solid var(--border-default)', borderRadius: 8, overflow: 'visible' }}
      >
        {matchedSlash.length > 0 && (
          <PopList title="Commands">
            {matchedSlash.map((s) => (
              <div key={s.cmd} style={popItemStyle} onMouseDown={(e) => { e.preventDefault(); setText(`${s.cmd} `); }}>
                <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--brass-300)', minWidth: 88 }}>{s.cmd}</span>
                <span style={{ flex: 1, color: 'var(--fg-3)' }}>{s.desc}</span>
                <span style={{ fontSize: 10, color: 'var(--fg-5)', fontFamily: 'var(--font-mono)' }}>{s.hint}</span>
              </div>
            ))}
          </PopList>
        )}
        {matchedMentions.length > 0 && (
          <PopList title="Mentions">
            {matchedMentions.map((u) => (
              <div key={u.id} style={popItemStyle} onMouseDown={(e) => { e.preventDefault(); setText(text.replace(/@\w*$/, `@${u.handle} `)); }}>
                <Avatar user={u} size={20} presence={false} />
                <span style={{ flex: 1, color: 'var(--fg-1)', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  {u.name}
                  {u.bot && <BotPill inline />}
                  <span style={{ color: 'var(--fg-5)', fontFamily: 'var(--font-mono)', fontSize: 11 }}>@{u.handle}</span>
                </span>
                <PresenceDot status={u.presence} size={7} />
              </div>
            ))}
          </PopList>
        )}

        <div style={{ padding: '4px 8px', display: 'flex', alignItems: 'center', gap: 1, borderBottom: '1px solid var(--border-subtle)' }}>
          <IconButton icon="bold" label="Bold" />
          <IconButton icon="italic" label="Italic" />
          <IconButton icon="strike" label="Strike" />
          <IconButton icon="link" label="Link" />
          <span style={{ width: 1, alignSelf: 'stretch', background: 'var(--border-subtle)', margin: '4px 4px' }} />
          <IconButton icon="list" label="List" />
          <IconButton icon="code" label="Code" />
          <span style={{ flex: 1 }} />
          <span style={{ fontSize: 10, color: 'var(--fg-5)', marginRight: 8, fontFamily: 'var(--font-mono)' }}>
            <span style={{ color: text.length > 0 ? 'var(--ok-400)' : 'var(--fg-6)' }}>●</span> draft
          </span>
        </div>

        <textarea
          value={text}
          onChange={handleChange}
          onKeyDown={onKeyDown}
          rows={Math.min(8, Math.max(1, text.split('\n').length))}
          placeholder={`Message ${channel.type === 'direct' ? channel.name : `#${channel.name}`}…  use / for commands, @ to mention`}
          style={{
            display: 'block',
            width: '100%',
            border: 'none',
            outline: 'none',
            resize: 'none',
            padding: '10px 12px 6px',
            background: 'transparent',
            color: 'var(--fg-1)',
            fontFamily: 'var(--font-sans)',
            fontSize: 14,
            lineHeight: 1.5,
            minHeight: 40,
          }}
        />

        <div style={{ padding: '4px 8px 6px', display: 'flex', alignItems: 'center', gap: 1 }}>
          <IconButton icon="paperclip" label="Attach" />
          <IconButton icon="image" label="Image" />
          <IconButton icon="smile" label="Emoji" />
          <IconButton icon="slash" label="Commands" />
          <IconButton icon="clock" label="Schedule send" />
          <span style={{ flex: 1 }} />
          <span style={{ fontSize: 11, color: 'var(--fg-5)', marginRight: 8 }}>
            <kbd style={kbdStyle}>↵</kbd> send · <kbd style={kbdStyle}>⇧↵</kbd> newline
          </span>
          <Button variant="primary" size="md" icon="send" type="submit">
            Send
          </Button>
        </div>
      </form>
    </div>
  );
}

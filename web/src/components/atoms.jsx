// Atoms ported from the design handoff (chat-components.jsx).
import React from 'react';
import { Icon } from '../icons.jsx';

export const PRESENCE_COLOR = {
  online: 'var(--ok-500)',
  idle: 'var(--warn-400)',
  away: 'var(--hold-400)',
  dnd: 'var(--urgent-500)',
  offline: 'var(--gray-600)',
};

export function Avatar({ user, size = 28, ring = false, square = false, presence = true }) {
  if (!user) {
    return (
      <div
        style={{ width: size, height: size, borderRadius: square ? 6 : '50%', background: 'var(--gray-800)' }}
      />
    );
  }
  const radius = square ? 6 : '50%';
  const showDot = presence && user.presence && !user.bot;
  return (
    <div style={{ position: 'relative', display: 'inline-block', flexShrink: 0 }}>
      <div
        style={{
          width: size,
          height: size,
          borderRadius: radius,
          background: user.avatarColor,
          color: 'white',
          fontSize: Math.max(9, size * 0.36),
          fontWeight: 600,
          letterSpacing: '0.02em',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: ring ? '0 0 0 2px var(--bg-app), 0 0 0 3px var(--blue-500)' : 'none',
          textShadow: '0 1px 0 rgba(0,0,0,0.2)',
          fontFamily: 'var(--font-sans)',
          overflow: 'hidden',
        }}
      >
        {user.avatarUrl ? (
          <img
            src={user.avatarUrl}
            alt=""
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          />
        ) : (
          user.initials
        )}
      </div>
      {showDot && (
        <span
          style={{
            position: 'absolute',
            right: -1,
            bottom: -1,
            width: Math.max(8, size * 0.32),
            height: Math.max(8, size * 0.32),
            borderRadius: '50%',
            background: PRESENCE_COLOR[user.presence],
            boxShadow: '0 0 0 2px var(--bg-surface)',
          }}
        />
      )}
    </div>
  );
}

export function PresenceDot({ status = 'offline', size = 8 }) {
  return (
    <span
      style={{
        display: 'inline-block',
        width: size,
        height: size,
        borderRadius: '50%',
        background: PRESENCE_COLOR[status],
        flexShrink: 0,
      }}
    />
  );
}

export function BotPill({ inline = false }) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        padding: '1px 5px',
        fontSize: 9,
        lineHeight: 1.4,
        fontWeight: 600,
        letterSpacing: '0.08em',
        textTransform: 'uppercase',
        borderRadius: 3,
        color: 'var(--cyan-300)',
        background: 'color-mix(in oklab, var(--cyan-500) 18%, transparent)',
        border: '1px solid color-mix(in oklab, var(--cyan-500) 45%, transparent)',
        marginLeft: inline ? 6 : 0,
        fontFamily: 'var(--font-mono)',
        verticalAlign: 'middle',
      }}
    >
      AI
    </span>
  );
}

export function RoleBadge({ role }) {
  if (!role || role === 'user') return null;
  const map = {
    admin: { label: 'ADMIN', fg: 'var(--urgent-300)', bg: 'rgba(239,68,68,0.10)', border: 'rgba(239,68,68,0.40)' },
    moderator: { label: 'MOD', fg: 'var(--ok-300)', bg: 'rgba(34,197,94,0.10)', border: 'rgba(34,197,94,0.40)' },
  };
  const s = map[role];
  if (!s) return null;
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        padding: '1px 5px',
        fontSize: 9,
        lineHeight: 1.4,
        fontWeight: 600,
        letterSpacing: '0.08em',
        borderRadius: 3,
        color: s.fg,
        background: s.bg,
        border: `1px solid ${s.border}`,
        fontFamily: 'var(--font-mono)',
        verticalAlign: 'middle',
        marginLeft: 6,
      }}
    >
      {s.label}
    </span>
  );
}

export function Pill({ children, tone = 'neutral', size = 'sm', icon, style }) {
  const tones = {
    neutral: { fg: 'var(--fg-3)', bg: 'rgba(255,255,255,0.04)', bd: 'var(--border-subtle)' },
    info: { fg: 'var(--info-400)', bg: 'var(--tone-info-soft)', bd: 'color-mix(in oklab, var(--info-500) 40%, transparent)' },
    ok: { fg: 'var(--ok-300)', bg: 'var(--tone-ok-soft)', bd: 'color-mix(in oklab, var(--ok-500) 40%, transparent)' },
    warn: { fg: 'var(--warn-300)', bg: 'var(--tone-warn-soft)', bd: 'color-mix(in oklab, var(--warn-500) 40%, transparent)' },
    urgent: { fg: 'var(--urgent-300)', bg: 'var(--tone-urgent-soft)', bd: 'color-mix(in oklab, var(--urgent-500) 40%, transparent)' },
    accent: { fg: 'var(--brass-300)', bg: 'var(--tone-accent-soft)', bd: 'color-mix(in oklab, var(--brass-400) 40%, transparent)' },
    ai: { fg: 'var(--cyan-300)', bg: 'color-mix(in oklab, var(--cyan-500) 12%, transparent)', bd: 'color-mix(in oklab, var(--cyan-500) 35%, transparent)' },
  };
  const t = tones[tone] || tones.neutral;
  const pad = size === 'xs' ? '1px 6px' : size === 'lg' ? '4px 10px' : '2px 7px';
  const fs = size === 'xs' ? 10 : size === 'lg' ? 12 : 11;
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        padding: pad,
        fontSize: fs,
        lineHeight: 1.4,
        borderRadius: 3,
        color: t.fg,
        background: t.bg,
        border: `1px solid ${t.bd}`,
        fontWeight: 500,
        whiteSpace: 'nowrap',
        ...style,
      }}
    >
      {icon}
      {children}
    </span>
  );
}

export function IconButton({ icon, label, onClick, active, badge, size = 28, style, title }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title || label}
      aria-label={label}
      style={{
        position: 'relative',
        width: size,
        height: size,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: active ? 'var(--bg-surface-2)' : 'transparent',
        border: '1px solid transparent',
        borderColor: active ? 'var(--border-subtle)' : 'transparent',
        color: active ? 'var(--fg-1)' : 'var(--fg-4)',
        borderRadius: 6,
        cursor: 'pointer',
        padding: 0,
        transition: 'background 150ms, color 150ms, border-color 150ms',
        ...style,
      }}
      onMouseEnter={(e) => {
        if (!active) {
          e.currentTarget.style.background = 'var(--bg-surface-2)';
          e.currentTarget.style.color = 'var(--fg-2)';
        }
      }}
      onMouseLeave={(e) => {
        if (!active) {
          e.currentTarget.style.background = 'transparent';
          e.currentTarget.style.color = 'var(--fg-4)';
        }
      }}
    >
      <Icon name={icon} size={size >= 32 ? 16 : 14} />
      {badge ? (
        <span
          style={{
            position: 'absolute',
            top: 2,
            right: 2,
            minWidth: 14,
            height: 14,
            padding: '0 3px',
            borderRadius: 999,
            background: 'var(--urgent-500)',
            color: 'white',
            fontSize: 9,
            fontWeight: 700,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontFamily: 'var(--font-mono)',
            boxShadow: '0 0 0 2px var(--bg-surface)',
          }}
        >
          {badge}
        </span>
      ) : null}
    </button>
  );
}

export function Button({ children, onClick, variant = 'ghost', size = 'md', icon, type = 'button', style, ...rest }) {
  const variants = {
    primary: { bg: 'var(--accent-color, var(--blue-500))', fg: 'white', bd: 'var(--accent-color, var(--blue-500))' },
    ghost: { bg: 'transparent', fg: 'var(--fg-2)', bd: 'var(--border-subtle)' },
    flat: { bg: 'var(--bg-surface-2)', fg: 'var(--fg-2)', bd: 'var(--border-subtle)' },
    danger: { bg: 'rgba(239,68,68,0.10)', fg: 'var(--urgent-300)', bd: 'rgba(239,68,68,0.40)' },
  };
  const sizes = {
    sm: { pad: '3px 8px', fs: 11, h: 24 },
    md: { pad: '5px 12px', fs: 12, h: 28 },
    lg: { pad: '8px 16px', fs: 13, h: 36 },
  };
  const v = variants[variant];
  const s = sizes[size];
  return (
    <button
      type={type}
      onClick={onClick}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        padding: s.pad,
        minHeight: s.h,
        fontSize: s.fs,
        fontWeight: 500,
        fontFamily: 'var(--font-sans)',
        color: v.fg,
        background: v.bg,
        border: `1px solid ${v.bd}`,
        borderRadius: 6,
        cursor: 'pointer',
        transition: 'filter 150ms, background 150ms',
        ...style,
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.filter = 'brightness(1.12)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.filter = 'none';
      }}
      {...rest}
    >
      {icon && <Icon name={icon} size={12} />}
      {children}
    </button>
  );
}

export function Eyebrow({ children, style }) {
  return (
    <div
      style={{
        fontSize: 10,
        fontWeight: 600,
        textTransform: 'uppercase',
        letterSpacing: 'var(--tracking-eyebrow)',
        color: 'var(--fg-5)',
        ...style,
      }}
    >
      {children}
    </div>
  );
}

export function Divider({ vertical, label }) {
  if (vertical) {
    return <span style={{ width: 1, alignSelf: 'stretch', background: 'var(--border-subtle)' }} />;
  }
  if (label) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--fg-5)', padding: '8px 0' }}>
        <span style={{ flex: 1, height: 1, background: 'var(--border-subtle)' }} />
        <span style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em' }}>{label}</span>
        <span style={{ flex: 1, height: 1, background: 'var(--border-subtle)' }} />
      </div>
    );
  }
  return <div style={{ height: 1, background: 'var(--border-subtle)' }} />;
}

export function StreamCursor() {
  return (
    <span
      style={{
        display: 'inline-block',
        width: 7,
        height: 14,
        marginLeft: 2,
        background: 'var(--cyan-400)',
        verticalAlign: '-2px',
        animation: 'chat-blink 1s steps(2, start) infinite',
      }}
    />
  );
}

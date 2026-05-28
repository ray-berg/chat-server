// Formatting + backend->design mapping helpers.

const AVATAR_PALETTE = [
  '#3b82f6', '#a855f7', '#22c55e', '#f97316', '#14b8a6', '#d97757',
  '#22d3ee', '#e879f9', '#eab308', '#ec4899', '#8b5cf6', '#0ea5e9',
];

export function avatarColor(seed = '') {
  let h = 0;
  for (let i = 0; i < seed.length; i += 1) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return AVATAR_PALETTE[h % AVATAR_PALETTE.length];
}

export function initials(name = '') {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

// Prefer a real uploaded photo (served via the /uploads proxy). The legacy
// /assets/avatars/*.svg paths aren't served by this app, so fall back to a
// colored initials tile (matches the NOCOS design anyway).
export function resolveAvatar(u = {}) {
  const photo = u.profilePhotoUrl || '';
  if (photo && photo.startsWith('/uploads')) return photo;
  return null;
}

// Map a backend user object (sanitized API shape) to the design's user shape.
export function mapUser(u) {
  if (!u) return null;
  const name = u.displayName || u.username || 'Unknown';
  return {
    id: u.id,
    name,
    handle: u.username || u.id,
    avatarColor: avatarColor(u.id || name),
    initials: initials(name),
    role: u.role || 'user',
    presence: u.presenceStatus || u.presence || 'offline',
    bot: Boolean(u.bot),
    model: u.bot ? u.botModel || u.model || null : null,
    manager: Boolean(u.manager),
    title: u.bio || '',
    avatarUrl: resolveAvatar(u),
    accentColor: u.accentColor || '#3b82f6',
  };
}

// A message row carries denormalized author fields; use them to learn about
// authors we might not have in the directory yet.
export function userFromMessage(m) {
  return {
    id: m.userId,
    displayName: m.displayName,
    role: m.role,
    avatarUrl: m.avatarUrl,
    profilePhotoUrl: m.profilePhotoUrl,
  };
}

export function mapMessage(m) {
  return {
    id: m.id,
    author: m.userId,
    at: m.createdAt,
    text: m.content,
    format: m.format || 'text',
  };
}

export function timeShort(iso) {
  const d = new Date(iso);
  return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
}

export function timeFull(iso) {
  const d = new Date(iso);
  return d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false });
}

export function relTime(iso) {
  const ms = Date.now() - new Date(iso).getTime();
  const mins = Math.round(ms / 60000);
  if (Math.abs(mins) < 1) return 'now';
  if (Math.abs(mins) < 60) return `${mins < 0 ? 'in ' : ''}${Math.abs(mins)}m${mins < 0 ? '' : ' ago'}`;
  const hrs = Math.round(mins / 60);
  if (Math.abs(hrs) < 24) return `${Math.abs(hrs)}h ago`;
  const days = Math.round(hrs / 24);
  return `${Math.abs(days)}d ago`;
}

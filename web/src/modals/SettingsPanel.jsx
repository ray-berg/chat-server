import React from 'react';
import { Icon } from '../icons.jsx';
import { Avatar, Button, Eyebrow } from '../components/atoms.jsx';
import { api } from '../data/api.js';

const ACCENTS = [
  { name: 'Blue', value: '#3b82f6' },
  { name: 'Brass', value: '#c9a548' },
  { name: 'Cyan', value: '#22d3ee' },
  { name: 'Magenta', value: '#d946ef' },
];

const field = {
  width: '100%',
  padding: '8px 10px',
  background: 'var(--gray-950)',
  border: '1px solid var(--border-default)',
  borderRadius: 6,
  color: 'var(--fg-1)',
  fontSize: 13,
  outline: 'none',
  fontFamily: 'var(--font-sans)',
};

const labelStyle = { fontSize: 11, color: 'var(--fg-4)', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600, marginBottom: 5, display: 'block' };

function Note({ tone, children }) {
  if (!children) return null;
  const color = tone === 'error' ? 'var(--urgent-300)' : 'var(--ok-300)';
  const bg = tone === 'error' ? 'var(--tone-urgent-soft)' : 'var(--tone-ok-soft)';
  const bd = tone === 'error' ? 'rgba(239,68,68,0.4)' : 'rgba(34,197,94,0.4)';
  return <div style={{ fontSize: 12, color, background: bg, border: `1px solid ${bd}`, borderRadius: 6, padding: '6px 10px' }}>{children}</div>;
}

export function SettingsPanel({ open, onClose, user, updateProfile, uploadImage, changePassword, setAccent }) {
  const [form, setForm] = React.useState(null);
  const [savingProfile, setSavingProfile] = React.useState(false);
  const [profileMsg, setProfileMsg] = React.useState(null);
  const [uploading, setUploading] = React.useState(false);
  const [pw, setPw] = React.useState({ current: '', next: '', confirm: '' });
  const [pwMsg, setPwMsg] = React.useState(null);
  const [pwBusy, setPwBusy] = React.useState(false);
  const fileRef = React.useRef(null);

  React.useEffect(() => {
    if (!open) return;
    setProfileMsg(null);
    setPwMsg(null);
    setPw({ current: '', next: '', confirm: '' });
    api
      .myProfile()
      .then((res) => {
        const p = res.profile || {};
        setForm({
          displayName: p.displayName || '',
          bio: p.bio || '',
          birthday: p.birthday || '',
          accentColor: p.accentColor || '#3b82f6',
          profilePhotoUrl: p.profilePhotoUrl || '',
        });
      })
      .catch((e) => setProfileMsg({ tone: 'error', text: e.message }));
  }, [open]);

  if (!open) return null;

  async function onPickPhoto(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setProfileMsg(null);
    try {
      const { url } = await uploadImage('photo', file);
      await updateProfile({ profilePhotoUrl: url });
      setForm((f) => ({ ...f, profilePhotoUrl: url }));
      setProfileMsg({ tone: 'ok', text: 'Photo updated.' });
    } catch (err) {
      setProfileMsg({ tone: 'error', text: err.message });
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  async function saveProfile(e) {
    e.preventDefault();
    setSavingProfile(true);
    setProfileMsg(null);
    try {
      const patch = { displayName: form.displayName.trim(), bio: form.bio };
      if (form.birthday) patch.birthday = form.birthday;
      await updateProfile(patch);
      setProfileMsg({ tone: 'ok', text: 'Profile saved.' });
    } catch (err) {
      setProfileMsg({ tone: 'error', text: err.message });
    } finally {
      setSavingProfile(false);
    }
  }

  function pickAccent(value) {
    setForm((f) => ({ ...f, accentColor: value }));
    setAccent(value);
  }

  async function submitPassword(e) {
    e.preventDefault();
    setPwMsg(null);
    if (pw.next.length < 8) return setPwMsg({ tone: 'error', text: 'New password must be at least 8 characters.' });
    if (pw.next !== pw.confirm) return setPwMsg({ tone: 'error', text: 'New passwords do not match.' });
    setPwBusy(true);
    try {
      await changePassword(pw.current, pw.next);
      setPwMsg({ tone: 'ok', text: 'Password changed.' });
      setPw({ current: '', next: '', confirm: '' });
    } catch (err) {
      setPwMsg({ tone: 'error', text: err.message });
    } finally {
      setPwBusy(false);
    }
  }

  return (
    <div
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, zIndex: 100, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', paddingTop: '8vh' }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="nocos-scrollbar"
        style={{ width: 'min(520px, 94vw)', maxHeight: '84vh', overflowY: 'auto', background: 'var(--bg-surface)', border: '1px solid var(--border-default)', borderRadius: 12, boxShadow: 'var(--shadow-lg)' }}
      >
        <header style={{ position: 'sticky', top: 0, background: 'var(--bg-surface)', padding: '14px 18px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', gap: 10, zIndex: 1 }}>
          <Icon name="settings" size={16} style={{ color: 'var(--fg-3)' }} />
          <span style={{ flex: 1, fontSize: 15, fontWeight: 600, color: 'var(--fg-1)' }}>Profile &amp; settings</span>
          <Button variant="ghost" size="sm" onClick={onClose}>
            Close
          </Button>
        </header>

        {!form ? (
          <div style={{ padding: 24, color: 'var(--fg-4)' }}>Loading…</div>
        ) : (
          <div style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 20 }}>
            {/* Identity */}
            <section style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <Avatar user={{ ...user, avatarUrl: form.profilePhotoUrl || user.avatarUrl }} size={56} presence={false} />
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <input ref={fileRef} type="file" accept="image/png,image/jpeg" onChange={onPickPhoto} style={{ display: 'none' }} />
                <Button variant="flat" size="sm" icon="image" onClick={() => fileRef.current?.click()}>
                  {uploading ? 'Uploading…' : 'Upload photo'}
                </Button>
                <span style={{ fontSize: 11, color: 'var(--fg-5)' }}>JPEG or PNG, max 2 MB.</span>
              </div>
            </section>

            {/* Profile form */}
            <form onSubmit={saveProfile} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <Eyebrow>Profile</Eyebrow>
              <label>
                <span style={labelStyle}>Display name</span>
                <input style={field} value={form.displayName} maxLength={64} onChange={(e) => setForm((f) => ({ ...f, displayName: e.target.value }))} />
              </label>
              <label>
                <span style={labelStyle}>Bio</span>
                <textarea style={{ ...field, resize: 'vertical', minHeight: 64 }} value={form.bio} maxLength={500} onChange={(e) => setForm((f) => ({ ...f, bio: e.target.value }))} />
              </label>
              <label>
                <span style={labelStyle}>Birthday</span>
                <input style={field} type="date" value={form.birthday || ''} onChange={(e) => setForm((f) => ({ ...f, birthday: e.target.value }))} />
              </label>
              <div>
                <span style={labelStyle}>Accent</span>
                <div style={{ display: 'flex', gap: 8 }}>
                  {ACCENTS.map((a) => {
                    const active = (form.accentColor || '').toLowerCase() === a.value.toLowerCase();
                    return (
                      <button
                        key={a.value}
                        type="button"
                        title={a.name}
                        onClick={() => pickAccent(a.value)}
                        style={{ width: 24, height: 24, borderRadius: '50%', background: a.value, cursor: 'pointer', padding: 0, border: active ? '2px solid var(--fg-1)' : '2px solid transparent', boxShadow: active ? `0 0 0 1px ${a.value}` : 'none' }}
                      />
                    );
                  })}
                </div>
              </div>
              <Note tone={profileMsg?.tone}>{profileMsg?.text}</Note>
              <div>
                <Button variant="primary" size="md" type="submit">
                  {savingProfile ? 'Saving…' : 'Save profile'}
                </Button>
              </div>
            </form>

            <div style={{ height: 1, background: 'var(--border-subtle)' }} />

            {/* Password */}
            <form onSubmit={submitPassword} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <Eyebrow>Change password</Eyebrow>
              <label>
                <span style={labelStyle}>Current password</span>
                <input style={field} type="password" autoComplete="current-password" value={pw.current} onChange={(e) => setPw((p) => ({ ...p, current: e.target.value }))} />
              </label>
              <label>
                <span style={labelStyle}>New password</span>
                <input style={field} type="password" autoComplete="new-password" value={pw.next} onChange={(e) => setPw((p) => ({ ...p, next: e.target.value }))} />
              </label>
              <label>
                <span style={labelStyle}>Confirm new password</span>
                <input style={field} type="password" autoComplete="new-password" value={pw.confirm} onChange={(e) => setPw((p) => ({ ...p, confirm: e.target.value }))} />
              </label>
              <Note tone={pwMsg?.tone}>{pwMsg?.text}</Note>
              <div>
                <Button variant="flat" size="md" type="submit">
                  {pwBusy ? 'Updating…' : 'Update password'}
                </Button>
              </div>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}

// Lightweight notification sounds via WebAudio (no asset files).
// A single shared AudioContext is created lazily and resumed on demand to
// satisfy browser autoplay policies; any failure (blocked autoplay, no audio
// device) is swallowed so callers never need to guard.

// User preferences (per-device, localStorage). Sound is on by default.
const PREF_ENABLED = 'chat.sound.enabled';
const PREF_UNFOCUSED = 'chat.sound.unfocusedOnly';

export function soundEnabled() {
  return localStorage.getItem(PREF_ENABLED) !== 'false';
}
export function soundUnfocusedOnly() {
  return localStorage.getItem(PREF_UNFOCUSED) === 'true';
}
export function setSoundPrefs({ enabled, unfocusedOnly } = {}) {
  if (enabled !== undefined) localStorage.setItem(PREF_ENABLED, enabled ? 'true' : 'false');
  if (unfocusedOnly !== undefined) localStorage.setItem(PREF_UNFOCUSED, unfocusedOnly ? 'true' : 'false');
}

let ctx = null;

function getContext() {
  if (ctx) return ctx;
  const Ctor = window.AudioContext || window.webkitAudioContext;
  if (!Ctor) return null;
  try {
    ctx = new Ctor();
  } catch {
    ctx = null;
  }
  return ctx;
}

// Single decaying sine "blip" at the given frequency/volume.
function blip(freq, startAt, duration, peakGain) {
  const ac = getContext();
  if (!ac) return;
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  osc.type = 'sine';
  osc.frequency.value = freq;
  const t0 = ac.currentTime + startAt;
  gain.gain.setValueAtTime(0, t0);
  gain.gain.linearRampToValueAtTime(peakGain, t0 + 0.008);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
  osc.connect(gain).connect(ac.destination);
  osc.start(t0);
  osc.stop(t0 + duration + 0.02);
}

function resumeThen(fn) {
  const ac = getContext();
  if (!ac) return;
  if (ac.state === 'suspended') {
    ac.resume().then(fn).catch(() => {});
  } else {
    fn();
  }
}

// Normal "ding": a gentle two-tone blip. Use when the tab is unfocused.
export function playDing() {
  if (!soundEnabled()) return;
  resumeThen(() => {
    blip(880, 0, 0.18, 0.16);
    blip(1320, 0.09, 0.18, 0.12);
  });
}

// Quiet "tick": a short, low click. Use when the tab is focused so an active
// conversation stays unobtrusive.
export function playTick() {
  if (!soundEnabled()) return;
  resumeThen(() => {
    blip(660, 0, 0.04, 0.05);
  });
}

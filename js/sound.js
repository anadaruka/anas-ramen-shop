// ============================================================
// Tiny synthesized sound effects — no audio files.
// AudioContext is created lazily on the first user gesture
// (browsers block audio before interaction).
// ============================================================

let ctx = null;
let muted = false;

export function setMuted(m) { muted = m; }
export function isMuted() { return muted; }

function ac() {
  if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

// Call once from any pointerdown so the context is unlocked before we need it.
export function unlockAudio() {
  try { ac(); } catch (e) { /* no audio available */ }
}

function tone(freq, t0, dur, type = 'triangle', peak = 0.18) {
  const c = ac();
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.value = freq;
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(peak, t0 + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g).connect(c.destination);
  o.start(t0);
  o.stop(t0 + dur + 0.05);
}

// The cashier: drawer click + bell. "Ca-CHING."
export function caChing() {
  if (muted) return;
  try {
    const c = ac(), t0 = c.currentTime;
    // drawer click — a short high-passed noise burst
    const len = 0.05;
    const buf = c.createBuffer(1, Math.floor(c.sampleRate * len), c.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
    const src = c.createBufferSource();
    src.buffer = buf;
    const hp = c.createBiquadFilter();
    hp.type = 'highpass'; hp.frequency.value = 2500;
    const g = c.createGain(); g.gain.value = 0.22;
    src.connect(hp); hp.connect(g); g.connect(c.destination);
    src.start(t0);
    // the bell
    tone(1975, t0 + 0.05, 0.40, 'triangle', 0.22);
    tone(2637, t0 + 0.10, 0.50, 'triangle', 0.16);
    tone(3951, t0 + 0.10, 0.22, 'sine', 0.07);
  } catch (e) { /* ignore */ }
}

// Soft tactile tick when a topping lands in a bowl.
export function dropTick() {
  if (muted) return;
  try {
    const c = ac(), t0 = c.currentTime;
    tone(320, t0, 0.07, 'sine', 0.10);
    tone(190, t0 + 0.03, 0.08, 'sine', 0.08);
  } catch (e) { /* ignore */ }
}

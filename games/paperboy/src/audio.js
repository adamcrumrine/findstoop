// All sound is synthesised at runtime -- no samples to download, and the
// thin square/triangle voices land in roughly the right era.

export class Audio {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.sfxGain = null;
    this.musicGain = null;
    this.muted = false;
    this.noiseBuffer = null;
    this.musicTimer = null;
    this.nextNoteTime = 0;
    this.step = 0;
  }

  start() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    this.ctx = new Ctx();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.85;
    this.master.connect(this.ctx.destination);

    this.sfxGain = this.ctx.createGain();
    this.sfxGain.gain.value = 0.5;
    this.sfxGain.connect(this.master);

    this.musicGain = this.ctx.createGain();
    this.musicGain.gain.value = 0.0;
    this.musicGain.connect(this.master);

    const len = this.ctx.sampleRate * 1.2;
    this.noiseBuffer = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = this.noiseBuffer.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  }

  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.setTargetAtTime(m ? 0 : 0.85, this.ctx.currentTime, 0.02);
  }

  // ------------------------------------------------------------- primitives

  tone(freq, dur, type, gain, slideTo, delay) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime + (delay || 0);
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type || 'square';
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain == null ? 0.3 : gain, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g);
    g.connect(this.sfxGain);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  noise(dur, gain, filterType, freq, sweepTo, delay) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime + (delay || 0);
    const s = this.ctx.createBufferSource();
    s.buffer = this.noiseBuffer;
    const f = this.ctx.createBiquadFilter();
    f.type = filterType || 'bandpass';
    f.frequency.setValueAtTime(freq, t);
    if (sweepTo) f.frequency.exponentialRampToValueAtTime(Math.max(40, sweepTo), t + dur);
    f.Q.value = 1.1;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(this.sfxGain);
    s.start(t);
    s.stop(t + dur + 0.02);
  }

  // ------------------------------------------------------------------- cues

  throwPaper() { this.noise(0.16, 0.16, 'bandpass', 900, 2600); }
  deliver() { this.tone(523, 0.09, 'square', 0.22); this.tone(784, 0.14, 'square', 0.2, null, 0.07); }
  bullseye() {
    this.tone(659, 0.08, 'square', 0.24);
    this.tone(988, 0.09, 'square', 0.24, null, 0.07);
    this.tone(1319, 0.22, 'triangle', 0.26, null, 0.14);
  }
  smash() {
    this.noise(0.34, 0.3, 'highpass', 2600, 900);
    this.noise(0.12, 0.2, 'bandpass', 5200, 3000, 0.02);
  }
  thud() { this.noise(0.22, 0.22, 'lowpass', 420, 140); }
  crash() {
    this.noise(0.55, 0.34, 'lowpass', 900, 90);
    this.tone(160, 0.4, 'sawtooth', 0.18, 48);
    this.noise(0.3, 0.14, 'bandpass', 3200, 1200, 0.05);
  }
  pickup() { this.tone(660, 0.07, 'square', 0.2); this.tone(1046, 0.12, 'square', 0.18, null, 0.06); }
  miss() { this.tone(330, 0.22, 'sawtooth', 0.16, 150); }
  empty() { this.noise(0.06, 0.1, 'bandpass', 1800); }
  jump() { this.tone(420, 0.18, 'triangle', 0.18, 900); }
  land() { this.noise(0.14, 0.18, 'lowpass', 700, 220); }
  soak() { this.noise(0.4, 0.2, 'bandpass', 1400, 500); }
  combo(n) { this.tone(523 * Math.pow(1.12, Math.min(n, 8)), 0.1, 'triangle', 0.18); }
  fanfare() {
    const n = [523, 659, 784, 1046];
    n.forEach((f, i) => this.tone(f, i === 3 ? 0.5 : 0.13, 'square', 0.22, null, i * 0.11));
  }
  gameOver() {
    const n = [523, 466, 415, 349];
    n.forEach((f, i) => this.tone(f, i === 3 ? 0.7 : 0.18, 'triangle', 0.22, null, i * 0.17));
  }

  // ------------------------------------------------------------------ music

  // A four-bar loop: walking bass, an offbeat triad stab, and a noise hat.
  startMusic() {
    if (!this.ctx || this.musicTimer) return;
    this.musicGain.gain.setTargetAtTime(0.16, this.ctx.currentTime, 0.6);
    this.nextNoteTime = this.ctx.currentTime + 0.08;
    this.step = 0;
    this.musicTimer = setInterval(() => this.pump(), 25);
  }

  stopMusic() {
    if (this.musicTimer) clearInterval(this.musicTimer);
    this.musicTimer = null;
    if (this.musicGain) this.musicGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.3);
  }

  setTempoScale(s) { this.tempoScale = s; }

  pump() {
    if (!this.ctx) return;
    const spb = 60 / (128 * (this.tempoScale || 1)) / 4; // sixteenth notes
    while (this.nextNoteTime < this.ctx.currentTime + 0.2) {
      this.playStep(this.step, this.nextNoteTime, spb);
      this.nextNoteTime += spb;
      this.step = (this.step + 1) % 64;
    }
  }

  playStep(step, t, spb) {
    const bar = Math.floor(step / 16);
    const s = step % 16;
    // D minor -> Bb -> F -> C, the friendliest four chords in the world.
    const roots = [73.42, 58.27, 87.31, 65.41];
    const chords = [[293.66, 349.23, 440.0], [233.08, 293.66, 349.23], [349.23, 440.0, 523.25], [261.63, 329.63, 392.0]];
    const root = roots[bar];

    if (s % 4 === 0 || s === 6 || s === 14) {
      const f = s === 6 ? root * 1.5 : root;
      this.mNote(f, spb * (s % 4 === 0 ? 3.2 : 1.6), 'triangle', 0.5, t);
    }
    if (s === 4 || s === 12 || s === 10) {
      const ch = chords[bar];
      ch.forEach((f, i) => this.mNote(f, spb * 1.8, 'square', 0.09, t + i * 0.004));
    }
    if (s % 2 === 1) this.mHat(t, s % 8 === 7 ? 0.055 : 0.03, spb);
    if (s === 0 || s === 8 || s === 11) this.mKick(t);
  }

  mNote(freq, dur, type, gain, t) {
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(this.musicGain);
    o.start(t); o.stop(t + dur + 0.02);
  }

  mHat(t, gain, spb) {
    const s = this.ctx.createBufferSource();
    s.buffer = this.noiseBuffer;
    const f = this.ctx.createBiquadFilter();
    f.type = 'highpass';
    f.frequency.value = 7000;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + spb * 0.7);
    s.connect(f); f.connect(g); g.connect(this.musicGain);
    s.start(t); s.stop(t + spb);
  }

  mKick(t) {
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(150, t);
    o.frequency.exponentialRampToValueAtTime(46, t + 0.12);
    g.gain.setValueAtTime(0.34, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
    o.connect(g); g.connect(this.musicGain);
    o.start(t); o.stop(t + 0.2);
  }
}

// Solmar Bay 3D — audio: full WebAudio synth. Engine hum, 2 procedural radio
// stations (Q to switch), siren, gunshots, punches, jingles. No audio files —
// everything is synthesized. Written fresh for the gta6-01 3D rebuild
// (branch v12-3d, systems build).

const midi = (m) => 440 * Math.pow(2, (m - 69) / 12);

// 16-step patterns. Station 0: chillwave chords (Am F C G). Station 1: funk
// bass + hats. Each step: [{m, t, g, d}] — midi, wave type, gain, beats.
const STATIONS = [
  {
    name: 'SOLMAR FM', bpm: 96,
    steps: [
      [{ m: 57, t: 'triangle', g: 0.05, d: 4 }, { m: 60, t: 'triangle', g: 0.04, d: 4 }, { m: 64, t: 'triangle', g: 0.04, d: 4 }, { m: 45, t: 'sine', g: 0.07, d: 2 }],
      [], [], [],
      [{ m: 53, t: 'triangle', g: 0.05, d: 4 }, { m: 57, t: 'triangle', g: 0.04, d: 4 }, { m: 60, t: 'triangle', g: 0.04, d: 4 }, { m: 41, t: 'sine', g: 0.07, d: 2 }],
      [], [{ m: 69, t: 'sine', g: 0.03, d: 1 }], [],
      [{ m: 48, t: 'triangle', g: 0.05, d: 4 }, { m: 52, t: 'triangle', g: 0.04, d: 4 }, { m: 55, t: 'triangle', g: 0.04, d: 4 }, { m: 36, t: 'sine', g: 0.07, d: 2 }],
      [], [{ m: 67, t: 'sine', g: 0.03, d: 1 }], [],
      [{ m: 55, t: 'triangle', g: 0.05, d: 4 }, { m: 59, t: 'triangle', g: 0.04, d: 4 }, { m: 62, t: 'triangle', g: 0.04, d: 4 }, { m: 43, t: 'sine', g: 0.07, d: 2 }],
      [], [{ m: 71, t: 'sine', g: 0.03, d: 1 }], [],
    ],
  },
  {
    name: 'VICE BEATS', bpm: 112,
    steps: [
      [{ m: 36, t: 'square', g: 0.06, d: 0.5 }, { n: 'hat', g: 0.02 }],
      [{ n: 'hat', g: 0.015 }],
      [{ m: 36, t: 'square', g: 0.05, d: 0.5 }],
      [{ n: 'hat', g: 0.015 }],
      [{ m: 41, t: 'square', g: 0.06, d: 0.5 }, { n: 'snare', g: 0.05 }],
      [{ n: 'hat', g: 0.015 }],
      [{ m: 43, t: 'square', g: 0.05, d: 0.5 }],
      [{ n: 'hat', g: 0.02 }],
      [{ m: 36, t: 'square', g: 0.06, d: 0.5 }, { n: 'hat', g: 0.02 }],
      [{ n: 'hat', g: 0.015 }],
      [{ m: 39, t: 'square', g: 0.05, d: 0.5 }],
      [{ n: 'hat', g: 0.015 }],
      [{ m: 41, t: 'square', g: 0.06, d: 0.5 }, { n: 'snare', g: 0.05 }],
      [{ n: 'hat', g: 0.015 }],
      [{ m: 46, t: 'square', g: 0.06, d: 0.75 }],
      [{ n: 'hat', g: 0.02 }],
    ],
  },
];

export class AudioStub {
  constructor() {
    this.ctx = null;
    this.engineOsc = null;
    this.engineGain = null;
    this.master = null;
    this.muted = false;
    this.station = 0;
    this.radioGain = null;
    this.sirenGain = null;
    this.step = 0;
    this.nextStepT = 0;
    this.schedTimer = null;
    this.noiseBuf = null;
  }

  // Call from a user gesture (start button). Safe to call repeatedly.
  ensure() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {}); return; }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 1;
      this.master.connect(this.ctx.destination);
      // Noise buffer (hats, snares, gunshots).
      const len = this.ctx.sampleRate;
      this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const data = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
      // Engine hum: sawtooth through a lowpass, pitch follows speed.
      this.engineOsc = this.ctx.createOscillator();
      this.engineOsc.type = 'sawtooth';
      this.engineOsc.frequency.value = 55;
      const lp = this.ctx.createBiquadFilter();
      lp.type = 'lowpass'; lp.frequency.value = 420;
      this.engineGain = this.ctx.createGain();
      this.engineGain.gain.value = 0;
      this.engineOsc.connect(lp); lp.connect(this.engineGain); this.engineGain.connect(this.master);
      this.engineOsc.start();
      // Quiet ambient pad (always on, low).
      const padGain = this.ctx.createGain();
      padGain.gain.value = 0.02;
      padGain.connect(this.master);
      for (const f of [220, 277.2, 329.6]) {
        const o = this.ctx.createOscillator();
        o.type = 'triangle'; o.frequency.value = f;
        o.connect(padGain); o.start();
      }
      // Radio bus.
      this.radioGain = this.ctx.createGain();
      this.radioGain.gain.value = 0;
      this.radioGain.connect(this.master);
      // Siren: two-tone wail (LFO on frequency), gain 0 until wanted.
      const sirenOsc = this.ctx.createOscillator();
      sirenOsc.type = 'sawtooth';
      sirenOsc.frequency.value = 820;
      const lfo = this.ctx.createOscillator();
      lfo.frequency.value = 0.7;
      const lfoGain = this.ctx.createGain();
      lfoGain.gain.value = 150;
      lfo.connect(lfoGain); lfoGain.connect(sirenOsc.frequency);
      const sirenFilter = this.ctx.createBiquadFilter();
      sirenFilter.type = 'lowpass'; sirenFilter.frequency.value = 1600;
      this.sirenGain = this.ctx.createGain();
      this.sirenGain.gain.value = 0;
      sirenOsc.connect(sirenFilter); sirenFilter.connect(this.sirenGain); this.sirenGain.connect(this.master);
      sirenOsc.start(); lfo.start();
      // Radio step scheduler.
      this.nextStepT = this.ctx.currentTime + 0.1;
      this.schedTimer = setInterval(() => this.scheduleRadio(), 120);
    } catch {
      this.ctx = null;
    }
  }

  scheduleRadio() {
    if (!this.ctx || this.ctx.state !== 'running') return;
    const st = STATIONS[this.station];
    const stepDur = 60 / st.bpm / 4;
    while (this.nextStepT < this.ctx.currentTime + 0.35) {
      const notes = st.steps[this.step % 16];
      for (const n of notes) {
        if (n.n === 'hat' || n.n === 'snare') this.playNoise(n.n, this.nextStepT, n.g);
        else this.playTone(midi(n.m), n.t, this.nextStepT, stepDur * n.d, n.g, this.radioGain);
      }
      this.nextStepT += stepDur;
      this.step++;
    }
  }

  playTone(freq, type, when, dur, gain, dest) {
    const o = this.ctx.createOscillator();
    o.type = type; o.frequency.value = freq;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0, when);
    g.gain.linearRampToValueAtTime(gain, when + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
    o.connect(g); g.connect(dest || this.master);
    o.start(when); o.stop(when + dur + 0.05);
  }

  playNoise(kind, when, gain) {
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const f = this.ctx.createBiquadFilter();
    f.type = kind === 'hat' ? 'highpass' : 'bandpass';
    f.frequency.value = kind === 'hat' ? 7000 : 1800;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(gain, when);
    g.gain.exponentialRampToValueAtTime(0.0001, when + (kind === 'hat' ? 0.05 : 0.18));
    src.connect(f); f.connect(g); g.connect(this.radioGain);
    src.start(when); src.stop(when + 0.25);
  }

  // One-shot SFX (guarded: no-ops before ensure()).
  playShot() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass'; f.frequency.value = 2400;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.5, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.14);
    src.connect(f); f.connect(g); g.connect(this.master);
    src.start(t); src.stop(t + 0.16);
    const o = this.ctx.createOscillator();
    o.type = 'square';
    o.frequency.setValueAtTime(170, t);
    o.frequency.exponentialRampToValueAtTime(55, t + 0.1);
    const og = this.ctx.createGain();
    og.gain.setValueAtTime(0.22, t);
    og.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
    o.connect(og); og.connect(this.master);
    o.start(t); o.stop(t + 0.14);
  }

  playPunch() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(150, t);
    o.frequency.exponentialRampToValueAtTime(55, t + 0.12);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.4, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.14);
    o.connect(g); g.connect(this.master);
    o.start(t); o.stop(t + 0.16);
  }

  playThud() { this.playPunch(); }

  playClick() {
    if (!this.ctx) return;
    this.playTone(1200, 'square', this.ctx.currentTime, 0.04, 0.08);
  }

  playReload() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.playTone(900, 'square', t, 0.04, 0.08);
    this.playTone(600, 'square', t + 0.25, 0.04, 0.08);
  }

  playJingle() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    [72, 76, 79, 84].forEach((m, i) => this.playTone(midi(m), 'triangle', t + i * 0.1, 0.22, 0.12));
  }

  playCash() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.playTone(1320, 'sine', t, 0.09, 0.1);
    this.playTone(1760, 'sine', t + 0.09, 0.14, 0.1);
  }

  playFail() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    [69, 65, 62].forEach((m, i) => this.playTone(midi(m), 'triangle', t + i * 0.16, 0.25, 0.09));
  }

  nextStation() {
    this.station = (this.station + 1) % STATIONS.length;
    this.step = 0;
    if (this.ctx) this.nextStepT = this.ctx.currentTime + 0.05;
    return STATIONS[this.station].name;
  }

  setSiren(on) {
    if (!this.ctx || !this.sirenGain) return;
    this.sirenGain.gain.setTargetAtTime(on && !this.muted ? 0.03 : 0, this.ctx.currentTime, 0.2);
  }

  // speedKmh 0..200 — hum rises with speed, silent on foot; radio on in car.
  setEngine(speedKmh, driving) {
    if (!this.ctx || !this.engineGain) return;
    const target = driving ? 0.05 + Math.min(0.09, speedKmh / 2200) : 0;
    this.engineGain.gain.setTargetAtTime(this.muted ? 0 : target, this.ctx.currentTime, 0.1);
    this.engineOsc.frequency.setTargetAtTime(55 + speedKmh * 0.9, this.ctx.currentTime, 0.08);
    if (this.radioGain) {
      this.radioGain.gain.setTargetAtTime(driving && !this.muted ? 0.05 : 0, this.ctx.currentTime, 0.3);
    }
  }

  toggleMute() {
    this.muted = !this.muted;
    if (this.ctx && this.master) {
      this.master.gain.setTargetAtTime(this.muted ? 0 : 1, this.ctx.currentTime, 0.05);
    }
    return this.muted;
  }
}

// Solmar Bay 3D — procedural WebAudio (v5, written from the brief).
// No audio files: engine hum, sirens, thuds, clicks and a tiny radio
// sequencer are all synthesized. Everything is guarded: no AudioContext
// until the first user gesture, and every call is try/catch so a missing
// context can never throw into the game loop.

import { RADIO } from './config.js';

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.muted = false;
    this.station = 0;
    this.radioTimer = 0;
    this.radioStep = 0;
    this.radioOn = false;
    this.engineOsc = null;
    this.engineGain = null;
    this.sub = null;
    this.sirenOsc = null;
    this.sirenGain = null;
  }

  // Call from a user gesture (Play button). Safe to call repeatedly.
  ensure() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {}); return; }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.5;
      this.master.connect(this.ctx.destination);
      // Engine hum: two detuned saws through a lowpass, gain follows speed.
      this.engineOsc = this.ctx.createOscillator();
      this.engineOsc.type = 'sawtooth';
      this.engineOsc.frequency.value = 55;
      this.sub = this.ctx.createOscillator();
      this.sub.type = 'sawtooth'; this.sub.frequency.value = 28;
      this.engineGain = this.ctx.createGain();
      this.engineGain.gain.value = 0.0;
      const lp = this.ctx.createBiquadFilter();
      lp.type = 'lowpass'; lp.frequency.value = 420;
      this.engineOsc.connect(lp); this.sub.connect(lp);
      lp.connect(this.engineGain); this.engineGain.connect(this.master);
      this.engineOsc.start(); this.sub.start();
      // Police siren: triangle sweeping 700<->1100 Hz, quiet until wanted.
      this.sirenOsc = this.ctx.createOscillator();
      this.sirenOsc.type = 'triangle';
      this.sirenOsc.frequency.value = 800;
      this.sirenGain = this.ctx.createGain();
      this.sirenGain.gain.value = 0.0;
      this.sirenOsc.connect(this.sirenGain); this.sirenGain.connect(this.master);
      this.sirenOsc.start();
    } catch (e) { /* audio unavailable: game stays silent, never throws */ }
  }

  setMuted(m) {
    this.muted = !!m;
    try { if (this.master) this.master.gain.value = this.muted ? 0 : 0.5; } catch (e) {}
  }

  // Per-frame update: engine pitch from speed, siren wail when wanted.
  update(dt, speedMs, wanted, driving) {
    if (!this.ctx) return;
    try {
      const t = this.ctx.currentTime;
      if (this.engineOsc && this.engineGain) {
        const rpm = driving ? 55 + Math.abs(speedMs) * 4.2 : 50;
        this.engineOsc.frequency.setTargetAtTime(rpm, t, 0.08);
        if (this.sub) this.sub.frequency.setTargetAtTime(rpm * 0.5, t, 0.08);
        this.engineGain.gain.setTargetAtTime(driving ? 0.05 + Math.min(0.06, Math.abs(speedMs) * 0.0016) : 0.02, t, 0.1);
      }
      if (this.sirenOsc && this.sirenGain) {
        if (wanted > 0) {
          const wail = 800 + Math.sin(t * 2.4) * 320;
          this.sirenOsc.frequency.setTargetAtTime(wail, t, 0.05);
          this.sirenGain.gain.setTargetAtTime(0.035, t, 0.2);
        } else {
          this.sirenGain.gain.setTargetAtTime(0.0, t, 0.2);
        }
      }
      // Radio: a tiny sequencer, one note per 16th at the station bpm.
      if (!this.muted && this.radioOn) {
        this.radioTimer += dt;
        const stepDur = 60 / RADIO[this.station].bpm / 4;
        while (this.radioTimer >= stepDur) {
          this.radioTimer -= stepDur;
          this._radioNote(this.radioStep++);
        }
      }
    } catch (e) {}
  }

  _radioNote(step) {
    try {
      const st = RADIO[this.station];
      const scale = st.scale;
      const root = 110; // A2
      const deg = scale[step % scale.length] + 12 * Math.floor((step % 16) / 8);
      const freq = root * Math.pow(2, deg / 12);
      const o = this.ctx.createOscillator();
      o.type = step % 4 === 0 ? 'square' : 'triangle';
      o.frequency.value = freq;
      const g = this.ctx.createGain();
      const t = this.ctx.currentTime;
      g.gain.setValueAtTime(0.05, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
      o.connect(g); g.connect(this.master);
      o.start(t); o.stop(t + 0.25);
    } catch (e) {}
  }

  setRadioOn(on) { this.radioOn = !!on; }
  nextStation() {
    this.station = (this.station + 1) % RADIO.length;
    this.radioStep = 0;
    return RADIO[this.station].name;
  }
  stationName() { return RADIO[this.station].name; }

  click() { this._blip(880, 0.05, 0.04); }
  thud() { this._blip(70, 0.25, 0.12); }
  cash() { this._blip(1320, 0.12, 0.06); setTimeout(() => this._blip(1760, 0.12, 0.06), 90); }
  gunshot() { this._noise(0.09, 0.16); }
  punch() { this._noise(0.06, 0.1); }

  _blip(freq, dur, vol) {
    if (!this.ctx || this.muted) return;
    try {
      const o = this.ctx.createOscillator();
      o.type = 'sine'; o.frequency.value = freq;
      const g = this.ctx.createGain();
      const t = this.ctx.currentTime;
      g.gain.setValueAtTime(vol, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + dur);
      o.connect(g); g.connect(this.master);
      o.start(t); o.stop(t + dur + 0.02);
    } catch (e) {}
  }
  _noise(dur, vol) {
    if (!this.ctx || this.muted) return;
    try {
      const len = Math.floor(this.ctx.sampleRate * dur);
      const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
      const src = this.ctx.createBufferSource();
      src.buffer = buf;
      const g = this.ctx.createGain();
      g.gain.value = vol;
      const f = this.ctx.createBiquadFilter();
      f.type = 'lowpass'; f.frequency.value = 900;
      src.connect(f); f.connect(g); g.connect(this.master);
      src.start();
    } catch (e) {}
  }
}

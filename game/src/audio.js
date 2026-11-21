// Solmar Bay 3D — audio STUB: WebAudio engine hum + a soft synth pad loop.
// The systems builder fills this in (radio stations, sirens, gunshots).
// Written fresh for the gta6-01 3D rebuild (branch v12-3d).

export class AudioStub {
  constructor() {
    this.ctx = null;
    this.engineOsc = null;
    this.engineGain = null;
    this.muted = false;
  }

  // Call from a user gesture (start button). Safe to call repeatedly.
  ensure() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {}); return; }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      // Engine hum: sawtooth through a lowpass, pitch follows speed.
      this.engineOsc = this.ctx.createOscillator();
      this.engineOsc.type = 'sawtooth';
      this.engineOsc.frequency.value = 55;
      const lp = this.ctx.createBiquadFilter();
      lp.type = 'lowpass'; lp.frequency.value = 420;
      this.engineGain = this.ctx.createGain();
      this.engineGain.gain.value = 0;
      this.engineOsc.connect(lp); lp.connect(this.engineGain); this.engineGain.connect(this.ctx.destination);
      this.engineOsc.start();
      // Radio pad: two detuned triangles, slow LFO on the gain — a lazy loop.
      const padGain = this.ctx.createGain();
      padGain.gain.value = 0.035;
      padGain.connect(this.ctx.destination);
      for (const f of [220, 277.2, 329.6]) {
        const o = this.ctx.createOscillator();
        o.type = 'triangle'; o.frequency.value = f;
        o.connect(padGain); o.start();
      }
      const lfo = this.ctx.createOscillator();
      lfo.frequency.value = 0.12;
      const lfoGain = this.ctx.createGain();
      lfoGain.gain.value = 0.015;
      lfo.connect(lfoGain); lfoGain.connect(padGain.gain);
      lfo.start();
    } catch {
      this.ctx = null;
    }
  }

  // speedKmh 0..200 — hum rises with speed, silent on foot.
  setEngine(speedKmh, driving) {
    if (!this.ctx || !this.engineGain) return;
    const target = driving ? 0.05 + Math.min(0.09, speedKmh / 2200) : 0;
    this.engineGain.gain.setTargetAtTime(this.muted ? 0 : target, this.ctx.currentTime, 0.1);
    this.engineOsc.frequency.setTargetAtTime(55 + speedKmh * 0.9, this.ctx.currentTime, 0.08);
  }

  toggleMute() {
    this.muted = !this.muted;
    if (this.engineGain && this.ctx) {
      this.engineGain.gain.setTargetAtTime(this.muted ? 0 : 0.05, this.ctx.currentTime, 0.05);
    }
    return this.muted;
  }
}

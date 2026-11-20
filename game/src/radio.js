// v15 clean re-record (01a1f673).
// Solmar Bay: Heatwave — all sound is synthesized with the Web Audio API:
// no audio files, no network. Five radio stations share one 16-step
// scheduler (eighth-note steps; each station brings its own bassline, hat
// and kick patterns), and one-shot effects cover gunshots, punches,
// pickups, sirens, the engine hum, the police helicopter rotor and
// explosions. Audio starts on the first user gesture (browser policy).
//
// NOTE (v3): this is the original v2 audio module. The 3D game plays its
// audio through audio.js, which mirrors these same five station
// definitions (patterns, names, DJs, tracks in config.js) — keep the two
// in sync when a station changes.

import { RADIO_STATIONS } from './config.js';

// 16-step patterns (0 = rest). Bass values are frequencies in Hz; hat/kick
// values are 0/1 triggers. All five stations are A-minor flavoured so the
// station switch never clashes with the engine or siren layers.
const STATIONS = [
  {
    // Coastal Groove — 96 bpm, laid-back A-minor bassline + off-beat hats.
    bpm: 96,
    bass: [55, 0, 55, 65.41, 0, 55, 49, 0, 55, 0, 55, 65.41, 82.41, 0, 73.42, 0],
    hat: [0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1],
    kick: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    wave: 'triangle',
  },
  {
    // Night Drive — 112 bpm, driving minor synth arpeggio + four-on-floor kick.
    bpm: 112,
    bass: [55, 0, 110, 0, 65.41, 0, 110, 0, 55, 0, 130.81, 0, 82.41, 0, 98, 0],
    hat: [1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0],
    kick: [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0],
    wave: 'sawtooth',
  },
  {
    // Latin Heat — 124 bpm, syncopated bass + clave hats.
    bpm: 124,
    bass: [55, 0, 0, 55, 0, 65.41, 0, 0, 55, 0, 0, 49, 0, 0, 82.41, 0],
    hat: [1, 0, 0, 1, 0, 0, 1, 0, 0, 0, 1, 0, 1, 0, 0, 0],
    kick: [1, 0, 0, 0, 0, 0, 1, 0, 1, 0, 0, 0, 0, 0, 1, 0],
    wave: 'triangle',
  },
  {
    // Bay FM — 140 bpm, funk: square-wave bass stabs + four-on-floor kick.
    bpm: 140,
    bass: [55, 0, 65.41, 0, 82.41, 0, 65.41, 0, 55, 0, 65.41, 0, 98, 0, 82.41, 0],
    hat: [0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1],
    kick: [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0],
    wave: 'square',
  },
  {
    // Vice Classics — 100 bpm, old-school funk: syncopated bass + off-beat hats.
    bpm: 100,
    bass: [55, 0, 65.41, 0, 0, 55, 0, 49, 0, 0, 82.41, 0, 65.41, 0, 55, 0],
    hat: [0, 1, 1, 0, 0, 1, 0, 1, 0, 1, 1, 0, 0, 1, 0, 1],
    kick: [1, 0, 0, 0, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1],
    wave: 'triangle',
  },
];

export function createAudio() {
  let ctx = null;
  let master = null;
  let musicGain = null;
  let engineOsc = null;
  let engineGain = null;
  let sirenOsc = null;
  let sirenGain = null;
  let rotorGain = null;
  let rotorWanted = false;
  let rainGain = null;
  let rainWanted = false;
  let muted = false;
  let musicTimer = null;
  let step = 0;
  let station = 0;

  function stepSeconds() {
    return 60 / STATIONS[station].bpm / 2;
  }

  function ensure() {
    if (ctx) return true;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = muted ? 0 : 0.5;
      master.connect(ctx.destination);
      musicGain = ctx.createGain();
      musicGain.gain.value = 0.16;
      musicGain.connect(master);
      engineGain = ctx.createGain();
      engineGain.gain.value = 0;
      engineGain.connect(master);
      engineOsc = ctx.createOscillator();
      engineOsc.type = 'sawtooth';
      engineOsc.frequency.value = 55;
      engineOsc.connect(engineGain);
      engineOsc.start();
      sirenGain = ctx.createGain();
      sirenGain.gain.value = 0;
      sirenGain.connect(master);
      sirenOsc = ctx.createOscillator();
      sirenOsc.type = 'sine';
      sirenOsc.frequency.value = 700;
      sirenOsc.connect(sirenGain);
      sirenOsc.start();
      buildRotor();
      buildRain();
      return true;
    } catch {
      return false;
    }
  }

  // Steady rain: looped filtered noise. Gain follows rain(on); built once
  // in ensure(), next to the rotor loop.
  function buildRain() {
    rainGain = ctx.createGain();
    rainGain.gain.value = rainWanted && !muted ? 0.05 : 0;
    rainGain.connect(master);
    const len = ctx.sampleRate;
    const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i += 1) data[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 1200;
    const noiseGain = ctx.createGain();
    noiseGain.gain.value = 0.5;
    src.connect(filter);
    filter.connect(noiseGain);
    noiseGain.connect(rainGain);
    src.start();
  }

  // Helicopter rotor: looped low noise + a low hum, amplitude-modulated by
  // a ~13 Hz LFO so it chops. Gain follows rotor(on); built once in ensure().
  function buildRotor() {
    rotorGain = ctx.createGain();
    rotorGain.gain.value = rotorWanted && !muted ? 0.08 : 0;
    rotorGain.connect(master);
    const len = ctx.sampleRate;
    const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i += 1) data[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 320;
    const noiseGain = ctx.createGain();
    noiseGain.gain.value = 0.6;
    src.connect(filter);
    filter.connect(noiseGain);
    noiseGain.connect(rotorGain);
    src.start();
    const hum = ctx.createOscillator();
    hum.type = 'sawtooth';
    hum.frequency.value = 52;
    const humGain = ctx.createGain();
    humGain.gain.value = 0.25;
    hum.connect(humGain);
    humGain.connect(rotorGain);
    hum.start();
    // 13 Hz LFO -> rotor gain, for the chop.
    const lfo = ctx.createOscillator();
    lfo.type = 'sine';
    lfo.frequency.value = 13;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 0.045;
    lfo.connect(lfoGain);
    lfoGain.connect(rotorGain.gain);
    lfo.start();
  }

  function tone(freq, dur, type, vol, when = 0, slideTo = 0) {
    if (!ctx || muted) return;
    const t0 = ctx.currentTime + when;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t0 + dur);
    gain.gain.setValueAtTime(vol, t0);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    osc.connect(gain);
    gain.connect(master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  function noise(dur, vol, filterFreq) {
    if (!ctx || muted) return;
    const t0 = ctx.currentTime;
    const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
    const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = filterFreq;
    const gain = ctx.createGain();
    gain.gain.value = vol;
    src.connect(filter);
    filter.connect(gain);
    gain.connect(master);
    src.start(t0);
  }

  function scheduleMusicStep() {
    const pat = STATIONS[station];
    if (!ctx || muted) { step = (step + 1) % 16; return; }
    const dur = stepSeconds();
    const freq = pat.bass[step % 16];
    if (freq) {
      const t0 = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = pat.wave;
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(pat.wave === 'sawtooth' ? 0.22 : 0.5, t0);
      gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur * 0.95);
      osc.connect(gain);
      gain.connect(musicGain);
      osc.start(t0);
      osc.stop(t0 + dur);
    }
    if (pat.hat[step % 16]) noise(0.03, 0.12, 8000);
    if (pat.kick[step % 16]) tone(120, 0.12, 'sine', 0.5, 0, 40);
    step = (step + 1) % 16;
  }

  function startScheduler() {
    if (musicTimer) window.clearInterval(musicTimer);
    musicTimer = window.setInterval(scheduleMusicStep, stepSeconds() * 1000);
  }

  return {
    // Call from any user gesture (click / keypress) to unlock audio.
    unlock() {
      if (ensure() && ctx.state === 'suspended') ctx.resume().catch(() => {});
      if (ctx && !musicTimer) startScheduler();
    },
    setMuted(value) {
      muted = value;
      if (master) master.gain.value = muted ? 0 : 0.5;
      if (rotorGain && ctx) {
        rotorGain.gain.setTargetAtTime(rotorWanted && !muted ? 0.08 : 0, ctx.currentTime, 0.1);
      }
      if (rainGain && ctx) {
        rainGain.gain.setTargetAtTime(rainWanted && !muted ? 0.05 : 0, ctx.currentTime, 0.1);
      }
    },
    isMuted() { return muted; },
    // Cycle to the next radio station (0..3); returns the new station name.
    nextStation() {
      station = (station + 1) % STATIONS.length;
      step = 0;
      if (ctx && musicTimer) startScheduler();
      return RADIO_STATIONS[station].name;
    },
    stationName() {
      return RADIO_STATIONS[station] ? RADIO_STATIONS[station].name : STATIONS[station].name;
    },
    // Engine hum follows the player's car speed (0..1).
    setEngine(ratio) {
      if (!ctx) return;
      const target = muted ? 0 : ratio * 0.06;
      engineGain.gain.setTargetAtTime(target, ctx.currentTime, 0.1);
      engineOsc.frequency.setTargetAtTime(50 + ratio * 140, ctx.currentTime, 0.1);
    },
    // Two-tone police siren while any wanted star is active.
    setSiren(on, time) {
      if (!ctx) return;
      if (!on) { sirenGain.gain.setTargetAtTime(0, ctx.currentTime, 0.2); return; }
      sirenGain.gain.setTargetAtTime(muted ? 0 : 0.05, ctx.currentTime, 0.2);
      const hi = Math.floor(time * 2) % 2 === 0;
      sirenOsc.frequency.setTargetAtTime(hi ? 950 : 650, ctx.currentTime, 0.05);
    },
    // Police helicopter rotor loop; call with true while the heli is up.
    rotor(on) {
      rotorWanted = !!on;
      if (!ctx || !rotorGain) return;
      rotorGain.gain.setTargetAtTime(rotorWanted && !muted ? 0.08 : 0, ctx.currentTime, 0.15);
    },
    // Rain noise loop; call with true while it is raining or storming.
    rain(on) {
      rainWanted = !!on;
      if (!ctx || !rainGain) return;
      rainGain.gain.setTargetAtTime(rainWanted && !muted ? 0.05 : 0, ctx.currentTime, 0.3);
    },
    gunshot() { noise(0.12, 0.5, 3000); tone(180, 0.08, 'square', 0.25, 0, 60); },
    enemyShot() { noise(0.1, 0.25, 2200); },
    punch() { noise(0.08, 0.4, 500); tone(90, 0.1, 'sine', 0.4, 0, 45); },
    crash() { noise(0.25, 0.5, 900); },
    explosion() {
      noise(0.9, 0.6, 400);
      tone(120, 0.8, 'sine', 0.5, 0, 30);
      tone(60, 0.5, 'triangle', 0.3, 0.05, 25);
    },
    pickup() { tone(660, 0.09, 'sine', 0.35); tone(990, 0.14, 'sine', 0.35, 0.09); },
    cash() { tone(880, 0.08, 'triangle', 0.3); tone(1174, 0.1, 'triangle', 0.3, 0.08); tone(1568, 0.18, 'triangle', 0.3, 0.16); },
    missionDone() {
      [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.22, 'triangle', 0.35, i * 0.12));
    },
    busted() { [392, 330, 262].forEach((f, i) => tone(f, 0.3, 'sawtooth', 0.25, i * 0.18)); },
    carDoor() { noise(0.06, 0.3, 1200); },
    skid() { noise(0.15, 0.12, 1500); },
  };
}

// Solmar Bay 3D — all sound is synthesized with the Web Audio API: no
// audio files, no network. Four radio stations share one 16-step
// scheduler (eighth-note steps; each station brings its own bassline, hat
// and kick patterns), and one-shot effects cover gunshots, punches,
// pickups, sirens, the engine hum, the police helicopter rotor and
// explosions. Audio starts on the first user gesture (browser policy);
// main.js calls nextStation() on R and reads stationName() for the HUD.
// The radio keeps playing on foot — like listening through the phone.

import { RADIO_STATIONS, RADIO_TRACKS } from './config.js';

let ctx = null;
let master = null;
let radioGain = null;
let sfxGain = null;
let engineNodes = null;
let station = 0;
let trackIdx = 0;
let step = 0;
let nextStepTime = 0;
let schedulerTimer = null;
let muted = false;
let sirenNodes = null;

const PATTERNS = [
  // Coastal Groove — chillwave: soft bass, lazy kick, open hats.
  { bass: [0, 0, 7, 0, 5, 0, 7, 10, 0, 0, 7, 0, 12, 10, 7, 5], root: 55, kick: [1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0, 0], hat: [0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 1, 1], wave: 'sine' },
  // Night Drive — synthwave: driving bass, four-on-the-floor.
  { bass: [0, 0, 12, 0, 0, 10, 0, 7, 0, 0, 12, 0, 15, 12, 10, 7], root: 49, kick: [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0], hat: [0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 1, 0, 0], wave: 'sawtooth' },
  // Latin Heat — reggaeton: syncopated bass, dembow kick.
  { bass: [0, 3, 0, 7, 0, 0, 5, 0, 0, 3, 0, 7, 10, 0, 7, 5], root: 58.27, kick: [1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 1, 0], hat: [0, 1, 0, 0, 1, 0, 1, 0, 0, 1, 0, 0, 1, 0, 1, 1], wave: 'triangle' },
  // Bay FM — talk + hits: bright bass, busy hats, a little lead line.
  { bass: [0, 0, 5, 7, 0, 5, 0, 3, 0, 0, 5, 7, 10, 7, 5, 3], root: 65.41, kick: [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 1, 0], hat: [1, 0, 1, 0, 1, 0, 1, 1, 1, 0, 1, 0, 1, 0, 1, 0], wave: 'square' },
];

function ensureCtx() {
  if (ctx) return ctx;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  ctx = new AC();
  master = ctx.createGain();
  master.gain.value = muted ? 0 : 0.9;
  master.connect(ctx.destination);
  radioGain = ctx.createGain();
  radioGain.gain.value = 0.16;
  radioGain.connect(master);
  sfxGain = ctx.createGain();
  sfxGain.gain.value = 0.5;
  sfxGain.connect(master);
  return ctx;
}

export function initAudio() {
  const c = ensureCtx();
  if (!c) return;
  if (c.state === 'suspended') c.resume();
  if (schedulerTimer) return;
  nextStepTime = c.currentTime + 0.1;
  schedulerTimer = setInterval(schedule, 40);
}

function noteFreq(root, semitone) {
  return root * Math.pow(2, semitone / 12);
}

function schedule() {
  if (!ctx) return;
  const bpm = RADIO_STATIONS[station].bpm;
  const stepDur = 60 / bpm / 2; // eighth notes
  while (nextStepTime < ctx.currentTime + 0.15) {
    playStep(step, nextStepTime);
    step = (step + 1) % 16;
    if (step === 0) {
      // A new bar: occasionally advance the track name.
      if (Math.random() < 0.25) trackIdx = (trackIdx + 1) % 3;
    }
    nextStepTime += stepDur;
  }
}

function playStep(s, t) {
  const p = PATTERNS[station];
  if (p.kick[s]) {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(120, t);
    o.frequency.exponentialRampToValueAtTime(40, t + 0.12);
    g.gain.setValueAtTime(0.5, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.14);
    o.connect(g).connect(radioGain);
    o.start(t);
    o.stop(t + 0.16);
  }
  if (p.hat[s]) {
    const len = 0.03;
    const buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * len), ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const f = ctx.createBiquadFilter();
    f.type = 'highpass';
    f.frequency.value = 7000;
    const g = ctx.createGain();
    g.gain.value = 0.12;
    src.connect(f).connect(g).connect(radioGain);
    src.start(t);
  }
  const semi = p.bass[s];
  if (semi !== 0 || s % 4 === 0) {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = p.wave;
    o.frequency.value = noteFreq(p.root, semi);
    g.gain.setValueAtTime(0.22, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 900;
    o.connect(f).connect(g).connect(radioGain);
    o.start(t);
    o.stop(t + 0.24);
  }
  // Station 4 (Bay FM) adds a sparse lead pluck.
  if (station === 3 && s % 4 === 2) {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = 'sine';
    o.frequency.value = noteFreq(p.root * 4, [0, 7, 10, 12][(s / 4) | 0]);
    g.gain.setValueAtTime(0.08, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
    o.connect(g).connect(radioGain);
    o.start(t);
    o.stop(t + 0.32);
  }
}

export function nextStation() {
  station = (station + 1) % RADIO_STATIONS.length;
  trackIdx = 0;
  return station;
}

export function prevStation() {
  station = (station + RADIO_STATIONS.length - 1) % RADIO_STATIONS.length;
  trackIdx = 0;
  return station;
}

export function stationName() {
  return RADIO_STATIONS[station].name;
}

export function stationDj() {
  return RADIO_STATIONS[station].dj;
}

export function trackName() {
  return RADIO_TRACKS[station][trackIdx];
}

export function toggleMute() {
  muted = !muted;
  if (master) master.gain.value = muted ? 0 : 0.9;
  return muted;
}

export function isMuted() {
  return muted;
}

function blip(freq, dur, type, vol, when = 0) {
  if (!ctx || !sfxGain) return;
  const t = ctx.currentTime + when;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.value = freq;
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g).connect(sfxGain);
  o.start(t);
  o.stop(t + dur + 0.02);
}

function noiseBurst(dur, vol, filterFreq, type = 'lowpass') {
  if (!ctx || !sfxGain) return;
  const t = ctx.currentTime;
  const len = Math.floor(ctx.sampleRate * dur);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.frequency.value = filterFreq;
  const g = ctx.createGain();
  g.gain.value = vol;
  src.connect(f).connect(g).connect(sfxGain);
  src.start(t);
}

export function sfxShoot(kind) {
  if (!ctx) return;
  if (kind === 'shotgun') { noiseBurst(0.18, 0.7, 900); blip(90, 0.12, 'sine', 0.5); }
  else if (kind === 'rifle') { noiseBurst(0.08, 0.5, 2500, 'highpass'); blip(180, 0.06, 'square', 0.25); }
  else if (kind === 'smg') { noiseBurst(0.05, 0.35, 3000, 'highpass'); }
  else { noiseBurst(0.09, 0.5, 1800, 'highpass'); blip(140, 0.07, 'square', 0.3); }
}

export function sfxHit() { blip(220, 0.08, 'square', 0.3); }
export function sfxPickup() { blip(660, 0.09, 'sine', 0.35); blip(990, 0.12, 'sine', 0.3, 0.08); }
export function sfxCash() { blip(880, 0.08, 'sine', 0.3); blip(1320, 0.12, 'sine', 0.3, 0.07); }
export function sfxCrash(strength) {
  noiseBurst(0.15 + Math.min(0.2, strength * 0.01), 0.3 + Math.min(0.5, strength * 0.02), 500);
  blip(70, 0.2, 'sine', 0.5);
}
export function sfxExplosion() {
  noiseBurst(0.7, 0.9, 300);
  blip(50, 0.6, 'sine', 0.8);
  blip(35, 0.8, 'sine', 0.6, 0.1);
}
export function sfxSkid() { noiseBurst(0.12, 0.12, 1200, 'bandpass'); }
export function sfxDoor() { blip(180, 0.06, 'square', 0.2); noiseBurst(0.05, 0.15, 800); }
export function sfxPhone() { blip(1046, 0.12, 'sine', 0.25); blip(1318, 0.12, 'sine', 0.25, 0.15); }
export function sfxWasted() {
  blip(392, 0.3, 'sine', 0.4);
  blip(311, 0.3, 'sine', 0.4, 0.3);
  blip(233, 0.6, 'sine', 0.4, 0.6);
}
export function sfxBusted() {
  blip(440, 0.2, 'square', 0.3);
  blip(440, 0.2, 'square', 0.3, 0.25);
}

/** Engine hum: two detuned saws through a low-pass, pitch by speed. */
export function updateEngine(speedRatio, on) {
  if (!ctx) return;
  if (!on) {
    if (engineNodes) {
      try { engineNodes.gain.gain.setTargetAtTime(0, ctx.currentTime, 0.1); } catch (e) { /* ignore */ }
    }
    return;
  }
  if (!engineNodes) {
    const o1 = ctx.createOscillator();
    const o2 = ctx.createOscillator();
    const f = ctx.createBiquadFilter();
    const g = ctx.createGain();
    o1.type = 'sawtooth';
    o2.type = 'sawtooth';
    o1.frequency.value = 70;
    o2.frequency.value = 72;
    f.type = 'lowpass';
    f.frequency.value = 500;
    g.gain.value = 0;
    o1.connect(f);
    o2.connect(f);
    f.connect(g).connect(master);
    o1.start();
    o2.start();
    engineNodes = { o1, o2, f, gain: g };
  }
  const t = ctx.currentTime;
  const rpm = 60 + speedRatio * 140;
  engineNodes.o1.frequency.setTargetAtTime(rpm, t, 0.05);
  engineNodes.o2.frequency.setTargetAtTime(rpm * 1.01, t, 0.05);
  engineNodes.f.frequency.setTargetAtTime(400 + speedRatio * 900, t, 0.1);
  engineNodes.gain.gain.setTargetAtTime(0.05 + speedRatio * 0.05, t, 0.1);
}

/** Police siren: two alternating tones, starts/stops with the wanted level. */
export function updateSiren(on) {
  if (!ctx) return;
  if (!on) {
    if (sirenNodes) {
      try { sirenNodes.gain.gain.setTargetAtTime(0, ctx.currentTime, 0.2); } catch (e) { /* ignore */ }
      sirenNodes = null;
    }
    return;
  }
  if (sirenNodes) return;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = 'triangle';
  o.frequency.value = 700;
  g.gain.value = 0.05;
  o.connect(g).connect(master);
  o.start();
  const lfo = ctx.createOscillator();
  const lfoGain = ctx.createGain();
  lfo.frequency.value = 0.8;
  lfoGain.gain.value = 250;
  lfo.connect(lfoGain).connect(o.frequency);
  lfo.start();
  sirenNodes = { o, lfo, gain: g };
}

/** Helicopter rotor: looped low thump while the heli is up. */
export function updateHeliRotor(on) {
  // Reuse the siren slot pattern with a dedicated node is overkill;
  // the rotor is a slow noise pulse driven from the same helpers.
  if (!ctx) return;
  if (!on) return;
  // One soft pulse every call while active (main.js calls at 4 Hz).
  noiseBurst(0.06, 0.08, 200);
}

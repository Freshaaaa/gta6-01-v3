// Solmar Bay 3D — audio: procedural WebAudio sounds and the radio.
// No audio files are shipped: the engine hum, sirens, thuds and UI clicks
// are all synthesized, and the radio is three stations of soft synth pads.
// The AudioContext is created lazily on the first user gesture, so the
// autoplay policy never throws, and every call is guarded so a headless
// browser without audio still runs the game cleanly.
const STATIONS = ['SOLMAR FM', 'VICE WAVE', 'BAY BEATS'];
const STATION_HUES = [0.42, 0.75, 0.08];

// Create the audio system. ctx is null until unlock() runs on a gesture.
export function createAudio() {
  const a = {
    ctx: null,
    master: null,
    muted: false,
    station: 0,
    engineOsc: null,
    engineGain: null,
    sirenOsc: null,
    sirenGain: null,
    sirenTimer: 0,
    padOsc: [],
    padGain: null,
    unlocked: false,
  };

  // Build the context and the master bus. Safe to call repeatedly.
  a.unlock = function () {
    if (a.unlocked) return;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      a.ctx = new AC();
      a.master = a.ctx.createGain();
      a.master.gain.value = a.muted ? 0 : 0.5;
      a.master.connect(a.ctx.destination);
      a.unlocked = true;
      a.startEngineHum();
      a.startRadioPad();
    } catch {
      a.ctx = null;
    }
  };

  // Resume a suspended context (headless Chrome often starts suspended).
  a.resume = function () {
    if (a.ctx && a.ctx.state === 'suspended') {
      a.ctx.resume().catch(() => {});
    }
  };

  // A low sawtooth hum whose pitch follows the car's speed.
  a.startEngineHum = function () {
    if (!a.ctx) return;
    try {
      a.engineOsc = a.ctx.createOscillator();
      a.engineOsc.type = 'sawtooth';
      a.engineOsc.frequency.value = 55;
      a.engineGain = a.ctx.createGain();
      a.engineGain.gain.value = 0.0;
      const filt = a.ctx.createBiquadFilter();
      filt.type = 'lowpass';
      filt.frequency.value = 420;
      a.engineOsc.connect(filt);
      filt.connect(a.engineGain);
      a.engineGain.connect(a.master);
      a.engineOsc.start();
    } catch {
      a.engineOsc = null;
    }
  };

  // Set the engine hum from the car's speed (0 when on foot or idle).
  a.setEngine = function (speedMps, inCar) {
    if (!a.ctx || !a.engineOsc || !a.engineGain) return;
    try {
      const t = a.ctx.currentTime;
      const target = inCar ? 0.05 + Math.min(0.16, Math.abs(speedMps) * 0.004) : 0.0;
      a.engineGain.gain.setTargetAtTime(target, t, 0.08);
      a.engineOsc.frequency.setTargetAtTime(52 + Math.abs(speedMps) * 3.2, t, 0.08);
    } catch {
      // A failed param set must never break the frame.
    }
  };

  // A soft two-note pad for the current radio station (changes with Q).
  a.startRadioPad = function () {
    if (!a.ctx) return;
    try {
      a.padGain = a.ctx.createGain();
      a.padGain.gain.value = 0.05;
      a.padGain.connect(a.master);
      const base = [220, 277.18, 329.63][a.station] || 220;
      a.padOsc = [0, 7, 12].map((semi) => {
        const o = a.ctx.createOscillator();
        o.type = 'triangle';
        o.frequency.value = base * Math.pow(2, semi / 12);
        o.connect(a.padGain);
        o.start();
        return o;
      });
    } catch {
      a.padOsc = [];
    }
  };

  // Switch to the next station (Q key). Returns the new station name.
  a.nextStation = function () {
    a.station = (a.station + 1) % STATIONS.length;
    if (a.ctx && a.padOsc.length) {
      try {
        const base = [220, 277.18, 329.63][a.station] || 220;
        a.padOsc.forEach((o, i) => {
          o.frequency.setTargetAtTime(base * Math.pow(2, [0, 7, 12][i] / 12), a.ctx.currentTime, 0.1);
        });
      } catch {
        // Keep the old pad if the retune fails.
      }
    }
    return STATIONS[a.station];
  };

  a.stationName = function () {
    return STATIONS[a.station];
  };

  a.stationHue = function () {
    return STATION_HUES[a.station];
  };

  // Toggle mute (M key). Returns the new muted state.
  a.toggleMute = function () {
    a.muted = !a.muted;
    if (a.master && a.ctx) {
      try {
        a.master.gain.setTargetAtTime(a.muted ? 0 : 0.5, a.ctx.currentTime, 0.05);
      } catch {
        // Ignore.
      }
    }
    return a.muted;
  };

  // A short UI click.
  a.click = function () {
    if (!a.ctx) return;
    try {
      const o = a.ctx.createOscillator();
      const g = a.ctx.createGain();
      o.type = 'square';
      o.frequency.value = 880;
      g.gain.setValueAtTime(0.08, a.ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, a.ctx.currentTime + 0.07);
      o.connect(g);
      g.connect(a.master);
      o.start();
      o.stop(a.ctx.currentTime + 0.08);
    } catch {
      // Ignore.
    }
  };

  // A low collision thud (noise burst through a lowpass filter).
  a.thud = function (strength) {
    if (!a.ctx) return;
    try {
      const dur = 0.18;
      const buf = a.ctx.createBuffer(1, Math.floor(a.ctx.sampleRate * dur), a.ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < data.length; i++) {
        data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
      }
      const src = a.ctx.createBufferSource();
      src.buffer = buf;
      const filt = a.ctx.createBiquadFilter();
      filt.type = 'lowpass';
      filt.frequency.value = 320;
      const g = a.ctx.createGain();
      g.gain.value = Math.min(0.5, 0.12 + (strength || 0) * 0.03);
      src.connect(filt);
      filt.connect(g);
      g.connect(a.master);
      src.start();
    } catch {
      // Ignore.
    }
  };

  // A gunshot crack (short noise burst, highpassed).
  a.shot = function () {
    if (!a.ctx) return;
    try {
      const dur = 0.09;
      const buf = a.ctx.createBuffer(1, Math.floor(a.ctx.sampleRate * dur), a.ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < data.length; i++) {
        data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
      }
      const src = a.ctx.createBufferSource();
      src.buffer = buf;
      const filt = a.ctx.createBiquadFilter();
      filt.type = 'highpass';
      filt.frequency.value = 900;
      const g = a.ctx.createGain();
      g.gain.value = 0.22;
      src.connect(filt);
      filt.connect(g);
      g.connect(a.master);
      src.start();
    } catch {
      // Ignore.
    }
  };

  // A cash-register style chime for mission payouts.
  a.payout = function () {
    if (!a.ctx) return;
    try {
      [880, 1174.66, 1567.98].forEach((f, i) => {
        const o = a.ctx.createOscillator();
        const g = a.ctx.createGain();
        o.type = 'sine';
        o.frequency.value = f;
        const t0 = a.ctx.currentTime + i * 0.09;
        g.gain.setValueAtTime(0.0001, t0);
        g.gain.exponentialRampToValueAtTime(0.12, t0 + 0.02);
        g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.25);
        o.connect(g);
        g.connect(a.master);
        o.start(t0);
        o.stop(t0 + 0.3);
      });
    } catch {
      // Ignore.
    }
  };

  // A two-tone police siren that wails while wanted > 0. Call every frame.
  a.updateSiren = function (wanted, dt) {
    if (!a.ctx) return;
    if (wanted <= 0) {
      if (a.sirenGain) {
        try {
          a.sirenGain.gain.setTargetAtTime(0, a.ctx.currentTime, 0.1);
        } catch {
          // Ignore.
        }
      }
      return;
    }
    try {
      if (!a.sirenOsc) {
        a.sirenOsc = a.ctx.createOscillator();
        a.sirenOsc.type = 'sine';
        a.sirenOsc.frequency.value = 720;
        a.sirenGain = a.ctx.createGain();
        a.sirenGain.gain.value = 0;
        a.sirenOsc.connect(a.sirenGain);
        a.sirenGain.connect(a.master);
        a.sirenOsc.start();
      }
      a.sirenTimer += dt;
      const phase = Math.floor(a.sirenTimer * 1.6) % 2;
      a.sirenOsc.frequency.setTargetAtTime(phase === 0 ? 720 : 960, a.ctx.currentTime, 0.05);
      a.sirenGain.gain.setTargetAtTime(0.045, a.ctx.currentTime, 0.1);
    } catch {
      // Ignore.
    }
  };

  return a;
}

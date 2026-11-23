// Solmar Bay 3D — small helpers (v5, written from the brief).
// Seeded RNG (deterministic per seed=7), math helpers, DOM helpers.

export function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
export function lerp(a, b, t) { return a + (b - a) * t; }
export function dist2(ax, az, bx, bz) { const dx = ax - bx, dz = az - bz; return dx * dx + dz * dz; }
export function dist(ax, az, bx, bz) { return Math.sqrt(dist2(ax, az, bx, bz)); }

// Mulberry32 seeded RNG — deterministic, so ?seed=7 always builds the same city.
export function makeRng(seed) {
  let s = (seed >>> 0) || 1;
  return function rng() {
    s |= 0; s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function pick(rng, arr) { return arr[Math.floor(rng() * arr.length)]; }
export function range(rng, a, b) { return a + rng() * (b - a); }
export function rangeInt(rng, a, b) { return a + Math.floor(rng() * (b - a + 1)); }

// Angle helpers (heading: 0 = +z, -PI/2 = -x, PI/2 = +x, PI = -z).
export function headingToDir(h) { return { x: Math.sin(h), z: Math.cos(h) }; }
export function angleDiff(a, b) {
  let d = a - b;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}
export function turnToward(cur, target, maxStep) {
  const d = angleDiff(target, cur);
  return cur + clamp(d, -maxStep, maxStep);
}

// Format helpers for the HUD.
export function fmtMoney(n) { return '$' + Math.round(n).toLocaleString('en-US'); }
export function fmtClock(hours) {
  const h = Math.floor(hours) % 24;
  const m = Math.floor((hours % 1) * 60);
  return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0');
}
export function fmtTimer(sec) {
  const s = Math.max(0, Math.ceil(sec));
  return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');
}

// Tiny DOM helper: set text only when it changed (avoids layout churn).
export function setText(el, txt) {
  if (el && el.textContent !== txt) el.textContent = txt;
}

// Seeded pick of a street coordinate (used for spawn positions).
export function nearestStreet(v) {
  const s = [-156, -104, -52, 0, 52, 104, 156];
  let best = s[0], bd = Infinity;
  for (const x of s) { const d = Math.abs(x - v); if (d < bd) { bd = d; best = x; } }
  return best;
}

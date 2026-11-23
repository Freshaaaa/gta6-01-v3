// Solmar Bay 3D — engine (v5, from the brief).
// Renderer (ACES tone mapping, exposure 1.35), a fixed timestep loop
// (dt cap 0.2, max 12 substeps — the v4 "wall-clock freeze" fix), keyboard
// input, and the localStorage save (key solmar-bay-save-v1).

import * as THREE from '../vendor/three.module.min.js';
import { ENGINE } from './config.js';

export function createRenderer(container, antialias = true) {
  const renderer = new THREE.WebGLRenderer({ antialias, powerPreference: 'high-performance' });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.35;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  container.appendChild(renderer.domElement);
  return renderer;
}

export function createCamera() {
  const camera = new THREE.PerspectiveCamera(65, window.innerWidth / window.innerHeight, 0.1, 1200);
  camera.position.set(0, 2.4, -8);
  return camera;
}

// Fixed timestep: the sim never takes a step bigger than 0.2 sim-seconds,
// and never more than 12 substeps per frame (a background tab can't
// accumulate a huge debt and teleport the world).
export class FixedLoop {
  constructor(stepFn) {
    this.stepFn = stepFn;
    this.last = performance.now();
    this.accum = 0;
  }
  frame(now) {
    let dt = (now - this.last) / 1000;
    this.last = now;
    dt = Math.min(dt, ENGINE.dtCap);
    this.accum += dt;
    let steps = 0;
    while (this.accum >= ENGINE.fixedDt && steps < ENGINE.maxSubsteps) {
      this.stepFn(ENGINE.fixedDt);
      this.accum -= ENGINE.fixedDt;
      steps++;
    }
    if (steps === ENGINE.maxSubsteps) this.accum = 0; // drop debt, don't spiral
  }
}

// Keyboard input (WASD + arrows, E enter/exit, F punch, Q radio, M mute,
// Space handbrake, 1–5 weapons, Z/X/C crew, Tab map, Esc menu, Shift run).
export class Input {
  constructor() {
    this.keys = new Set();
    this.pressed = new Set(); // edge-triggered, consumed per frame
    this.forward = false; this.back = false;
    this.left = false; this.right = false;
    this.run = false; this.handbrake = false;
    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      this.keys.add(e.code);
      this.pressed.add(e.code);
      if (e.code === 'Tab') e.preventDefault();
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());
  }
  update() {
    const k = this.keys;
    this.forward = k.has('KeyW') || k.has('ArrowUp');
    this.back = k.has('KeyS') || k.has('ArrowDown');
    this.left = k.has('KeyA') || k.has('ArrowLeft');
    this.right = k.has('KeyD') || k.has('ArrowRight');
    this.run = k.has('ShiftLeft') || k.has('ShiftRight');
    this.handbrake = k.has('Space');
  }
  // Returns true once per physical press (until the next frame consumes it).
  wasPressed(code) {
    if (this.pressed.has(code)) { this.pressed.delete(code); return true; }
    return false;
  }
  endFrame() { this.pressed.clear(); }
}

// (Save / load lives in save.js — this module is renderer + loop + input.)

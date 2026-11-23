// Solmar Bay 3D — car models (v5, written from the brief).
// One factory builds every car: the hero Comet (luxury: chrome trim, spoke
// wheels, reflective glass, side skirts, dual exhausts), traffic cars,
// police interceptors and the taxi. Blob shadows keep cars grounded
// (no shadow maps — fast under SwiftShader).

import * as THREE from '../vendor/three.module.min.js';
import { COMET, POLICE } from './config.js';

const BOX = new THREE.BoxGeometry(1, 1, 1);
const CYL = new THREE.CylinderGeometry(1, 1, 1, 12);

function lam(color, extra = {}) { return new THREE.MeshLambertMaterial({ color, ...extra }); }
function basic(color, extra = {}) { return new THREE.MeshBasicMaterial({ color, ...extra }); }

function box(mat, w, h, d, x, y, z) {
  const m = new THREE.Mesh(BOX, mat);
  m.scale.set(w, h, d);
  m.position.set(x, y, z);
  return m;
}

// A wheel with a spoke pattern: dark tire + light hub + 5 thin spokes.
// Returns a group whose local origin is the wheel centre; spin by rotating
// the group on its local X axis (the axle).
export function makeWheel(radius = 0.42) {
  const g = new THREE.Group();
  const tire = new THREE.Mesh(CYL, lam(COMET.tire));
  tire.rotation.z = Math.PI / 2; // axle along X
  tire.scale.set(radius, 0.3, radius);
  g.add(tire);
  const hub = new THREE.Mesh(CYL, lam(COMET.hub, { emissive: COMET.hubGlow, emissiveIntensity: 0.5 }));
  hub.rotation.z = Math.PI / 2;
  hub.scale.set(radius * 0.58, 0.32, radius * 0.58);
  g.add(hub);
  // 5 spokes (thin boxes radiating in the wheel plane).
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    const sp = box(lam(0xc8ccd2), 0.08, radius * 0.95, 0.06, 0, 0, 0);
    sp.position.set(0, Math.sin(a) * radius * 0.28, Math.cos(a) * radius * 0.28);
    sp.rotation.x = -a;
    sp.position.x = 0.17; // outer face so the spokes read
    g.add(sp);
  }
  return g;
}

// Blob shadow: a dark ellipse under the car (cheap, no shadow map).
function blobShadow(w, d) {
  const m = new THREE.Mesh(
    new THREE.CircleGeometry(1, 20),
    new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.32, depthWrite: false }),
  );
  m.rotation.x = -Math.PI / 2;
  m.scale.set(w, d, 1);
  m.position.y = 0.03;
  return m;
}

// Generic car body. opts: { color, isVan, isPolice, isTaxi, luxury }.
// Returns { group, wheels[4], front (Vector3-ish local +z), length }.
export function makeCar(opts = {}) {
  const color = opts.color ?? 0xd82828;
  const isVan = !!opts.isVan;
  const isPolice = !!opts.isPolice;
  const isTaxi = !!opts.isTaxi;
  const luxury = !!opts.luxury; // parked luxury cars: chrome trim
  const g = new THREE.Group();
  const bodyMat = lam(color);
  const len = isVan ? 5.2 : 4.4;
  const wid = 1.9;
  const bodyH = isVan ? 1.5 : 0.62;

  // Main body.
  const body = box(bodyMat, wid, bodyH, len, 0, 0.62, 0);
  g.add(body);
  // Cabin / glasshouse.
  if (isVan) {
    const cab = box(lam(color), wid * 0.96, 0.9, len * 0.55, 0, 1.7, -0.3);
    g.add(cab);
    const shield = box(lam(COMET.glass), wid * 0.9, 0.7, 0.1, 0, 1.65, len * 0.28);
    g.add(shield);
  } else {
    const cab = box(lam(COMET.glass), wid * 0.82, 0.5, len * 0.42, 0, 1.12, -0.25);
    g.add(cab);
    // Roof panel over the glass.
    const roof = box(bodyMat, wid * 0.8, 0.1, len * 0.4, 0, 1.4, -0.25);
    g.add(roof);
    // Rear window (dark glass panel, visible from chase cam).
    const rearGlass = box(lam(0x2a3440), wid * 0.7, 0.42, 0.08, 0, 1.05, -len / 2 + 0.32);
    g.add(rearGlass);
  }
  // Chrome trim (luxury / Comet): thin light strips along the sides + windows.
  if (luxury || opts.comet) {
    const chrome = lam(COMET.chrome);
    g.add(box(chrome, 0.06, 0.08, len * 0.92, -wid / 2 - 0.01, 0.78, 0));
    g.add(box(chrome, 0.06, 0.08, len * 0.92, wid / 2 + 0.01, 0.78, 0));
    g.add(box(chrome, wid * 0.8, 0.06, 0.06, 0, 1.38, len * 0.22));
    // Side skirts (thin dark strips under the doors).
    g.add(box(lam(0x1a1a1e), 0.1, 0.16, len * 0.7, -wid / 2 - 0.02, 0.32, 0));
    g.add(box(lam(0x1a1a1e), 0.1, 0.16, len * 0.7, wid / 2 + 0.02, 0.32, 0));
  }
  // Rear bumper (darker strip) + spoiler (Comet / sports).
  g.add(box(lam(0x222226), wid * 0.98, 0.22, 0.18, 0, 0.42, -len / 2 - 0.02));
  if (opts.comet || opts.sport) {
    g.add(box(bodyMat, wid * 0.9, 0.07, 0.5, 0, 1.12, -len / 2 + 0.15));
    g.add(box(lam(0x1a1a1e), 0.08, 0.22, 0.08, -wid * 0.3, 0.98, -len / 2 + 0.15));
    g.add(box(lam(0x1a1a1e), 0.08, 0.22, 0.08, wid * 0.3, 0.98, -len / 2 + 0.15));
  }
  // Taillights: red/orange emissive horizontal bars (NOT pale rectangles).
  const tailMat = basic(COMET.tail);
  g.add(box(tailMat, wid * 0.32, 0.14, 0.08, -wid * 0.28, 0.78, -len / 2 - 0.06));
  g.add(box(tailMat, wid * 0.32, 0.14, 0.08, wid * 0.28, 0.78, -len / 2 - 0.06));
  // Headlights (warm).
  const headMat = basic(COMET.head);
  g.add(box(headMat, 0.34, 0.14, 0.08, -wid * 0.3, 0.72, len / 2 + 0.02));
  g.add(box(headMat, 0.34, 0.14, 0.08, wid * 0.3, 0.72, len / 2 + 0.02));
  // Side mirrors.
  g.add(box(lam(0x1a1a1e), 0.16, 0.12, 0.22, -wid / 2 - 0.12, 1.05, len * 0.18));
  g.add(box(lam(0x1a1a1e), 0.16, 0.12, 0.22, wid / 2 + 0.12, 1.05, len * 0.18));
  // Dual exhausts (Comet): 2 small dark cylinders at the rear.
  if (opts.comet) {
    for (const sx of [-0.5, 0.5]) {
      const ex = new THREE.Mesh(CYL, lam(0x3a3a3e));
      ex.rotation.x = Math.PI / 2;
      ex.scale.set(0.11, 0.3, 0.11);
      ex.position.set(sx, 0.32, -len / 2 - 0.08);
      g.add(ex);
    }
  }
  // Police livery: white body + blue cheatline + light bar.
  if (isPolice) {
    g.add(box(lam(POLICE.cheat), wid + 0.02, 0.22, len * 0.9, 0, 0.62, 0));
    const bar = box(lam(0x1a1a1e), wid * 0.6, 0.16, 0.5, 0, 1.52, -0.2);
    g.add(bar);
    g.add(box(basic(POLICE.lightRed), 0.4, 0.14, 0.4, -0.32, 1.64, -0.2));
    g.add(box(basic(POLICE.lightBlue), 0.4, 0.14, 0.4, 0.32, 1.64, -0.2));
  }
  // Taxi sign.
  if (isTaxi) {
    g.add(box(basic(0xffe828), 0.7, 0.22, 0.4, 0, 1.55, -0.1));
  }
  // Wheels (4, visible at the corners, sticking out slightly).
  const wheels = [];
  const wy = 0.42, wx = wid / 2 + 0.02, wzF = len / 2 - 0.95, wzR = -len / 2 + 0.95;
  for (const [x, z] of [[-wx, wzF], [wx, wzF], [-wx, wzR], [wx, wzR]]) {
    const w = makeWheel(0.42);
    w.position.set(x, wy, z);
    g.add(w);
    wheels.push(w);
  }
  g.add(blobShadow(wid * 0.85, len * 0.62));
  return { group: g, wheels, length: len, width: wid };
}

// The hero Comet (Dante's car): bright green + full luxury trim.
export function makeComet() {
  return makeCar({ color: COMET.body, comet: true, sport: true, luxury: true });
}

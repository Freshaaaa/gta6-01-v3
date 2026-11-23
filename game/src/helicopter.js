// Solmar Bay 3D — the BBPD police helicopter (v5, from the brief).
// The heli only appears at wanted ≥ 3. It orbits the player at ~48 m
// ahead and ~12 m up. The searchlight cone is STAGED-ONLY: it renders
// only in ?shot=chase (the cover shot), never in normal play — the v4
// lesson (a spotlight that follows the player ruined night shots).

import * as THREE from '../vendor/three.module.min.js';
import { HELI } from './config.js';
import { headingToDir, clamp } from './util.js';

const BOX = new THREE.BoxGeometry(1, 1, 1);
function lam(c) { return new THREE.MeshLambertMaterial({ color: c }); }
function basic(c) { return new THREE.MeshBasicMaterial({ color: c }); }
function box(mat, w, h, d, x, y, z) {
  const m = new THREE.Mesh(BOX, mat);
  m.scale.set(w, h, d); m.position.set(x, y, z);
  return m;
}

export class Helicopter {
  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    // Body (police white) + blue cheatline.
    this.group.add(box(lam(HELI.body), 2.2, 1.4, 4.4, 0, 0, 0));
    // Cockpit glass (light blue with a warm emissive so it reads at dusk).
    const glass = new THREE.MeshLambertMaterial({ color: 0x8ab0cc, emissive: 0x3a5a7a, emissiveIntensity: 0.7 });
    this.group.add(box(glass, 1.8, 0.9, 1.0, 0, 0.1, 2.0));
    // Tail boom + fin.
    this.group.add(box(lam(HELI.body), 0.5, 0.5, 4.0, 0, 0.3, -3.6));
    this.group.add(box(lam(HELI.body), 0.15, 1.4, 1.0, 0, 0.8, -5.4));
    // Skids.
    this.group.add(box(lam(0x222226), 0.18, 0.12, 3.4, -0.9, -0.95, 0));
    this.group.add(box(lam(0x222226), 0.18, 0.12, 3.4, 0.9, -0.95, 0));
    // BBPD stripe.
    this.group.add(box(lam(HELI.stripe), 2.26, 0.3, 4.0, 0, 0.2, 0));
    // Red beacon on top + a soft halo so it reads as a police light.
    const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 8), basic(HELI.beacon));
    beacon.position.set(0, 0.85, 0.6);
    this.group.add(beacon);
    const beaconHalo = new THREE.Mesh(new THREE.SphereGeometry(0.5, 10, 8), new THREE.MeshBasicMaterial({ color: HELI.beacon, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false }));
    beaconHalo.position.set(0, 0.85, 0.6);
    this.group.add(beaconHalo);
    this.beacon = beacon; this.beaconHalo = beaconHalo;
    // Main rotor (spins) + a translucent blur disc so the rotor reads at speed.
    this.rotor = new THREE.Group();
    this.rotor.add(box(lam(0xb8bec6), 0.3, 0.08, 11, 0, 0, 0));
    this.rotor.add(box(lam(0xb8bec6), 11, 0.08, 0.3, 0, 0, 0));
    const blur = new THREE.Mesh(new THREE.CircleGeometry(5.5, 24), new THREE.MeshBasicMaterial({ color: 0xb8bec6, transparent: true, opacity: 0.14, side: THREE.DoubleSide, depthWrite: false }));
    blur.rotation.x = -Math.PI / 2;
    blur.position.y = -0.05;
    this.rotor.add(blur);
    this.rotor.position.y = 1.0;
    this.group.add(this.rotor);
    // Tail rotor.
    this.tailRotor = new THREE.Group();
    this.tailRotor.add(box(lam(0x1a1a1e), 0.12, 2.2, 0.1, 0, 0, 0));
    this.tailRotor.add(box(lam(0x1a1a1e), 0.12, 0.1, 2.2, 0, 0, 0));
    this.tailRotor.position.set(0.35, 0.6, -5.4);
    this.group.add(this.tailRotor);
    // Searchlight cone — STAGED-ONLY (visible only in ?shot=chase).
    const coneGeo = new THREE.ConeGeometry(3.2, 14, 16, 1, true);
    this.spotCone = new THREE.Mesh(coneGeo, new THREE.MeshBasicMaterial({
      color: HELI.spot, transparent: true, opacity: 0.22,
      blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
    }));
    this.spotCone.rotation.x = Math.PI; // apex up at the heli, opening down
    this.spotCone.position.y = -7;
    this.spotCone.visible = false;
    this.group.add(this.spotCone);
    // Ground pool of light at the staged target (additive disc).
    this.spotPool = new THREE.Mesh(new THREE.CircleGeometry(3.0, 20), new THREE.MeshBasicMaterial({
      color: HELI.spot, transparent: true, opacity: 0.35,
      blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    this.spotPool.rotation.x = -Math.PI / 2;
    this.spotPool.visible = false;
    this.scene.add(this.spotPool);

    this.group.visible = false;
    this.scene.add(this.group);
    this.active = false;
    this.staged = false;
    this.angle = 0;
  }

  // staged = true only in ?shot=chase (the cover shot).
  setStaged(staged) {
    this.staged = staged;
    this.spotCone.visible = staged && this.active;
    this.spotPool.visible = staged && this.active;
  }

  setActive(active) {
    this.active = active;
    this.group.visible = active;
    this.spotCone.visible = this.staged && active;
    this.spotPool.visible = this.staged && active;
  }

  update(dt, t, playerPos, playerHeading) {
    if (!this.active) return;
    // Orbit: stay ~48 m ahead of the player, ~12 m up.
    const d = headingToDir(playerHeading);
    this.angle += dt * 0.25;
    const orbitX = Math.cos(this.angle) * 6;
    const orbitZ = Math.sin(this.angle) * 6;
    const tx = playerPos.x + d.x * HELI.ahead + orbitX;
    const tz = playerPos.z + d.z * HELI.ahead + orbitZ;
    const k = 1 - Math.pow(0.001, dt);
    this.group.position.x += (tx - this.group.position.x) * k;
    this.group.position.y += (HELI.height - this.group.position.y) * k;
    this.group.position.z += (tz - this.group.position.z) * k;
    this.group.rotation.y = Math.atan2(playerPos.x - this.group.position.x, playerPos.z - this.group.position.z);
    // Rotors spin; the red beacon pulses.
    this.rotor.rotation.y += dt * 18;
    this.tailRotor.rotation.x += dt * 22;
    const pulse = 0.55 + Math.sin(t * 6) * 0.45;
    if (this.beaconHalo) this.beaconHalo.material.opacity = 0.15 + pulse * 0.3;
    // Staged spotlight: the cone points straight down at the player;
    // the pool sits on the ground under the heli.
    if (this.staged) {
      this.spotPool.position.set(playerPos.x, 0.05, playerPos.z);
    }
  }
}

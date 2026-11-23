// Solmar Bay 3D — the player (v5, written from the brief).
// Dante on foot (walk/run, punch) and the Comet (arcade driving physics:
// accelerate, brake, reverse, handbrake, steering, gears). Chase camera
// lives here too (chaseDist 5.5, chaseLateral 1.0). Collision is a cheap
// AABB push-out against the city's building boxes.

import * as THREE from '../vendor/three.module.min.js';
import { ENGINE, SAFEHOUSE } from './config.js';
import { clamp, dist, headingToDir, turnToward } from './util.js';

const BOX = new THREE.BoxGeometry(1, 1, 1);
function lam(c) { return new THREE.MeshLambertMaterial({ color: c }); }
function box(mat, w, h, d, x, y, z) {
  const m = new THREE.Mesh(BOX, mat);
  m.scale.set(w, h, d); m.position.set(x, y, z);
  return m;
}

// Dante on foot: simple box figure (jacket, head, legs), ~1.8m tall.
function makeDanteMesh() {
  const g = new THREE.Group();
  g.add(box(lam(0x2a4a7a), 0.55, 0.75, 0.32, 0, 1.15, 0)); // jacket
  g.add(box(lam(0xd8b088), 0.34, 0.34, 0.34, 0, 1.72, 0)); // head
  g.add(box(lam(0x2a2a30), 0.22, 0.7, 0.24, -0.14, 0.45, 0)); // leg L
  g.add(box(lam(0x2a2a30), 0.22, 0.7, 0.24, 0.14, 0.45, 0)); // leg R
  g.add(box(lam(0x2a4a7a), 0.16, 0.6, 0.16, -0.36, 1.15, 0)); // arm L
  g.add(box(lam(0x2a4a7a), 0.16, 0.6, 0.16, 0.36, 1.15, 0)); // arm R
  // Blob shadow.
  const sh = new THREE.Mesh(new THREE.CircleGeometry(0.5, 16),
    new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.3, depthWrite: false }));
  sh.rotation.x = -Math.PI / 2; sh.position.y = 0.03;
  g.add(sh);
  return g;
}

export class Player {
  constructor(scene, cityBoxes) {
    this.boxes = cityBoxes; // building AABBs for push-out
    this.x = 0; this.z = 0;
    this.heading = 0; // 0 = +z (north)
    this.inCar = false;
    this.car = null; // { group, wheels, length, width, speed, heading }
    this.speed = 0; // m/s (car) — on foot uses walkSpeed
    this.walkSpeed = 0;
    this.health = 100;
    this.money = 0;
    this.boostTimer = 0; // Rico ram boost
    this.mesh = makeDanteMesh();
    this.mesh.position.set(0, 0.06, 0);
    scene.add(this.mesh);
    // Dante's own Comet is a parked car owned by Traffic (parked at 6,-6);
    // the player enters it like any other car. No second Comet lives here.
  }

  // --- car state -------------------------------------------------------------
  enterCar(car) {
    // car: a traffic/parked car object { group, wheels, length, model, x, z, heading }
    this.inCar = true;
    this.car = car;
    this.speed = 0;
    car.speed = 0;
    this.mesh.visible = false;
    return true;
  }
  exitCar() {
    if (!this.inCar || !this.car) return;
    const d = headingToDir(this.car.heading);
    this.x = this.car.x + d.x * 2.5;
    this.z = this.car.z + d.z * 2.5;
    this.heading = this.car.heading;
    this.car.speed = 0;
    this.speed = 0;
    this.inCar = false;
    this.car = null;
    this.mesh.visible = true;
    this.mesh.position.set(this.x, 0.06, this.z);
    this.mesh.rotation.y = this.heading;
  }
  // Position of the player (car pos when driving, foot pos otherwise).
  pos() {
    if (this.inCar && this.car) return { x: this.car.x, z: this.car.z };
    return { x: this.x, z: this.z };
  }
  teleport(x, z) {
    if (this.inCar && this.car) {
      this.car.x = x; this.car.z = z;
      this.car.group.position.set(x, 0.02, z);
    } else {
      this.x = x; this.z = z;
      this.mesh.position.set(x, 0.06, z);
    }
  }
  setHeading(h) {
    if (this.inCar && this.car) {
      this.car.heading = h;
      this.car.group.rotation.y = h;
    } else {
      this.heading = h;
      this.mesh.rotation.y = h;
    }
  }

  // --- per-frame update -------------------------------------------------------
  update(dt, input, autoDrive) {
    if (this.inCar && this.car) this._updateCar(dt, input, autoDrive);
    else this._updateFoot(dt, input);
    if (this.boostTimer > 0) this.boostTimer -= dt;
  }

  _updateFoot(dt, input) {
    const walk = 4.2, run = 7.0;
    let mx = 0, mz = 0;
    if (input.forward) mz += 1;
    if (input.back) mz -= 1;
    if (input.left) mx -= 1;
    if (input.right) mx += 1;
    const mag = Math.hypot(mx, mz);
    if (mag > 0) {
      const sp = input.run ? run : walk;
      // Move relative to the camera heading (behind the player).
      const fwd = { x: Math.sin(this.heading), z: Math.cos(this.heading) };
      const rgt = { x: Math.cos(this.heading), z: -Math.sin(this.heading) };
      const dx = (fwd.x * mz + rgt.x * mx) / mag * sp * dt;
      const dz = (fwd.z * mz + rgt.z * mx) / mag * sp * dt;
      const nx = this.x + dx, nz = this.z + dz;
      if (!this._hitsBuilding(nx, nz, 0.6)) { this.x = nx; this.z = nz; }
      // Face the movement direction.
      const target = Math.atan2(dx, dz);
      this.heading = turnToward(this.heading, target, 10 * dt);
      this.walkSpeed = sp;
    } else this.walkSpeed = 0;
    this.mesh.position.set(this.x, 0.06, this.z);
    this.mesh.rotation.y = this.heading;
    // Walk bob.
    this.mesh.position.y = 0.06 + (this.walkSpeed > 0 ? Math.abs(Math.sin(performance.now() * 0.012)) * 0.05 : 0);
  }

  _updateCar(dt, input, autoDrive) {
    const c = this.car;
    const top = ENGINE.playerTopSpeed + (this.boostTimer > 0 ? 10 : 0);
    let accel = 0;
    if (autoDrive || input.forward) accel = 14;
    if (input.back) accel = -10;
    if (input.handbrake) { this.speed *= Math.max(0, 1 - 4 * dt); }
    this.speed += accel * dt;
    // Drag + rolling resistance.
    this.speed -= this.speed * 0.35 * dt;
    if (!autoDrive && !input.forward && !input.back) this.speed -= Math.sign(this.speed) * Math.min(Math.abs(this.speed), 6 * dt);
    this.speed = clamp(this.speed, -9, top);
    if (Math.abs(this.speed) < 0.05 && !input.forward && !input.back) this.speed = 0;
    // Steering (stronger at low speed, weaker at high speed).
    const steerInput = (input.left ? 1 : 0) - (input.right ? 1 : 0);
    const steerAuthority = clamp(Math.abs(this.speed) / 8, 0, 1) * 1.9;
    c.heading += steerInput * steerAuthority * dt * Math.sign(this.speed || 1) * (this.speed < 0 ? -1 : 1);
    const d = headingToDir(c.heading);
    const nx = c.x + d.x * this.speed * dt;
    const nz = c.z + d.z * this.speed * dt;
    if (!this._hitsBuilding(nx, nz, 1.4)) {
      c.x = nx; c.z = nz;
    } else {
      // Bump: kill most of the speed, small thud handled by the caller.
      this.speed *= 0.25;
      c.bumped = true;
    }
    // Keep inside the world.
    c.x = clamp(c.x, -205, 205);
    c.z = clamp(c.z, -205, 300);
    c.group.position.set(c.x, 0.02, c.z);
    c.group.rotation.y = c.heading;
    // Sync the driven speed back onto the car object (the HUD + the
    // __solmar.car API read c.speed, not this.speed).
    c.speed = this.speed;
    // Wheel spin.
    const spin = (this.speed * dt) / 0.42;
    for (const w of c.wheels) w.rotation.x += spin;
  }

  _hitsBuilding(x, z, r) {
    for (const b of this.boxes) {
      if (x + r > b.minX && x - r < b.maxX && z + r > b.minZ && z - r < b.maxZ) return true;
    }
    return false;
  }

  gear() {
    const s = Math.abs(this.speed);
    if (s < 0.5) return 'N';
    if (this.speed < 0) return 'R';
    if (s < 8) return 'G1';
    if (s < 16) return 'G2';
    if (s < 26) return 'G3';
    return 'G4';
  }

  respawn() {
    this.health = 100;
    if (this.inCar) {
      // Leave the car where it is; Dante steps out at the safehouse.
      if (this.car) this.car.speed = 0;
      this.car = null;
      this.inCar = false;
      this.mesh.visible = true;
    }
    this.x = SAFEHOUSE.x; this.z = SAFEHOUSE.z;
    this.heading = 0;
    this.speed = 0;
    this.mesh.position.set(this.x, 0.06, this.z);
    this.mesh.rotation.y = 0;
  }
}

// --- chase camera -------------------------------------------------------------
export function updateChaseCamera(camera, player, dt) {
  const p = player.pos();
  let heading, speed;
  if (player.inCar && player.car) {
    heading = player.car.heading;
    speed = Math.abs(player.speed);
  } else {
    heading = player.heading;
    speed = player.walkSpeed;
  }
  const d = headingToDir(heading);
  const rx = Math.cos(heading), rz = -Math.sin(heading); // right vector
  const lat = ENGINE.chaseLateral;
  const distBack = ENGINE.chaseDist + speed * 0.03;
  const tx = p.x - d.x * distBack + rx * lat;
  const tz = p.z - d.z * distBack + rz * lat;
  const ty = 2.4 + speed * 0.008;
  // Smooth follow (lerp, frame-rate independent-ish).
  const k = 1 - Math.pow(0.001, dt);
  camera.position.x += (tx - camera.position.x) * k;
  camera.position.y += (ty - camera.position.y) * k;
  camera.position.z += (tz - camera.position.z) * k;
  camera.lookAt(p.x + d.x * 8, 1.2, p.z + d.z * 8);
}

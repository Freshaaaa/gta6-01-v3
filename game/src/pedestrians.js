// Solmar Bay 3D — pedestrians + foot cops (v5, from the brief).
// 24 peds wander the sidewalks. Peds flee gunshots, fall to punches and
// pistol fire. Foot cops chase Dante on foot and bust him (0.6 s grab).
// Peds witness car thefts and raise the wanted level.

import * as THREE from '../vendor/three.module.min.js';
import { ENGINE } from './config.js';
import { makeRng, pick, range, clamp, dist, headingToDir } from './util.js';

const BOX = new THREE.BoxGeometry(1, 1, 1);
function lam(c) { return new THREE.MeshLambertMaterial({ color: c }); }
function box(mat, w, h, d, x, y, z) {
  const m = new THREE.Mesh(BOX, mat);
  m.scale.set(w, h, d); m.position.set(x, y, z);
  return m;
}

const SHIRTS = [0xd84a4a, 0x4a7ad8, 0x4ad84a, 0xe8d84a, 0x9a4ad8, 0xe8e8e8, 0x2a2a2a, 0xd88a2a];
const PANTS = [0x2a2a30, 0x3a4a6a, 0x5a4a3a, 0x4a4a4a];

function makePedMesh(shirt, pants) {
  const g = new THREE.Group();
  g.add(box(lam(shirt), 0.5, 0.7, 0.3, 0, 1.1, 0));
  g.add(box(lam(0xd8b088), 0.32, 0.32, 0.32, 0, 1.65, 0));
  g.add(box(lam(pants), 0.2, 0.65, 0.22, -0.13, 0.42, 0));
  g.add(box(lam(pants), 0.2, 0.65, 0.22, 0.13, 0.42, 0));
  g.add(box(lam(shirt), 0.14, 0.55, 0.14, -0.33, 1.1, 0));
  g.add(box(lam(shirt), 0.14, 0.55, 0.14, 0.33, 1.1, 0));
  return g;
}

function makeCopMesh() {
  const g = new THREE.Group();
  g.add(box(lam(0x1e3a6a), 0.55, 0.75, 0.32, 0, 1.15, 0)); // navy uniform
  g.add(box(lam(0xd8b088), 0.34, 0.34, 0.34, 0, 1.72, 0));
  g.add(box(lam(0x1e3a6a), 0.36, 0.12, 0.36, 0, 1.92, 0)); // cap
  g.add(box(lam(0x14161c), 0.22, 0.7, 0.24, -0.14, 0.45, 0));
  g.add(box(lam(0x14161c), 0.22, 0.7, 0.24, 0.14, 0.45, 0));
  // Badge glint.
  g.add(box(new THREE.MeshBasicMaterial({ color: 0xffd828 }), 0.1, 0.1, 0.05, -0.15, 1.35, 0.18));
  return g;
}

export class Pedestrians {
  constructor(scene, cityBoxes, rng) {
    this.scene = scene;
    this.boxes = cityBoxes;
    this.rng = rng;
    this.peds = []; // { group, x, z, heading, speed, state, fleeTimer }
    this.cops = []; // foot cops { group, x, z, heading, grabTimer }
    this.threat = null; // {x, z, until} — gunshot scares peds within 16m
    this._spawnInitial();
  }

  _spawnInitial() {
    for (let i = 0; i < 24; i++) {
      const x = range(this.rng, -160, 160);
      const z = range(this.rng, -160, 170);
      this.spawnPed(x, z);
    }
  }

  spawnPed(x, z) {
    const g = makePedMesh(pick(this.rng, SHIRTS), pick(this.rng, PANTS));
    g.position.set(x, 0.06, z);
    this.scene.add(g);
    const ped = {
      group: g, x, z,
      heading: range(this.rng, 0, Math.PI * 2),
      speed: range(this.rng, 0.9, 1.6),
      state: 'walk', fleeTimer: 0, retarget: range(this.rng, 2, 6),
    };
    this.peds.push(ped);
    return ped;
  }

  spawnPedNear(x, z) {
    const px = x + range(this.rng, -2, 2), pz = z + range(this.rng, -2, 2);
    return this.spawnPed(px, pz);
  }

  spawnPedAhead(x, z, heading, distAhead) {
    const d = headingToDir(heading);
    return this.spawnPed(x + d.x * distAhead, z + d.z * distAhead);
  }

  spawnCop(x, z) {
    const g = makeCopMesh();
    g.position.set(x, 0.06, z);
    this.scene.add(g);
    const cop = { group: g, x, z, heading: 0, grabTimer: 0 };
    this.cops.push(cop);
    return cop;
  }

  removePed(ped) {
    this.scene.remove(ped.group);
    this.peds = this.peds.filter((p) => p !== ped);
  }
  removeCop(cop) {
    this.scene.remove(cop.group);
    this.cops = this.cops.filter((c) => c !== cop);
  }

  count() { return this.peds.length; }
  copCount() { return this.cops.length; }

  // A gunshot at (x,z): peds within 16m flee at 3.6 m/s for 1.5 sim-s.
  gunshotThreat(x, z, now) {
    this.threat = { x, z, until: now + 1.5 };
  }

  update(dt, now, playerPos, wanted) {
    // Peds.
    for (const p of [...this.peds]) {
      let speed = p.speed;
      let fleeing = false;
      if (this.threat && now < this.threat.until && dist(p.x, p.z, this.threat.x, this.threat.z) < 16) {
        fleeing = true;
        speed = 3.6;
        p.heading = Math.atan2(p.x - this.threat.x, p.z - this.threat.z);
      }
      if (!fleeing) {
        p.retarget -= dt;
        if (p.retarget <= 0) {
          p.heading = range(this.rng, 0, Math.PI * 2);
          p.retarget = range(this.rng, 2, 7);
        }
      }
      const d = headingToDir(p.heading);
      let nx = p.x + d.x * speed * dt;
      let nz = p.z + d.z * speed * dt;
      // Keep peds in the city (bounce at the edges) and out of buildings.
      if (nx < -175 || nx > 175 || nz < -175 || nz > 250 || this._hitsBuilding(nx, nz, 0.5)) {
        p.heading += Math.PI / 2 + range(this.rng, -0.4, 0.4);
        p.retarget = range(this.rng, 1, 3);
      } else {
        p.x = nx; p.z = nz;
      }
      p.group.position.set(p.x, 0.06, p.z);
      p.group.rotation.y = p.heading;
    }
    if (this.threat && now >= this.threat.until) this.threat = null;
    // Foot cops chase the player on foot — but ONLY while wanted > 0.
    // (The playtest spawns cops before setting wanted; a cop that chases
    // at wanted 0 would bust the player before the test sets the heat.)
    for (const c of [...this.cops]) {
      if (wanted <= 0) { c.grabTimer = 0; continue; }
      const d = dist(c.x, c.z, playerPos.x, playerPos.z);
      const target = Math.atan2(playerPos.x - c.x, playerPos.z - c.z);
      c.heading = target;
      const dir = headingToDir(c.heading);
      c.x += dir.x * ENGINE.copSpeed * dt;
      c.z += dir.z * ENGINE.copSpeed * dt;
      c.group.position.set(c.x, 0.06, c.z);
      c.group.rotation.y = c.heading;
      // Grab: within 2.2m for 0.6s -> busted (handled by main via grabTimer).
      if (d < 2.2) c.grabTimer += dt;
      else c.grabTimer = 0;
    }
  }

  // Punch: fells a ped within 2.4m in front of the player. Returns the ped or null.
  punch(x, z, heading) {
    const d = headingToDir(heading);
    let best = null, bd = 2.4;
    for (const p of this.peds) {
      const dx = p.x - x, dz = p.z - z;
      const along = dx * d.x + dz * d.z;
      const side = Math.abs(dx * d.z - dz * d.x);
      if (along > 0 && along < 2.6 && side < 1.2) {
        const dd = Math.hypot(dx, dz);
        if (dd < bd) { bd = dd; best = p; }
      }
    }
    if (best) this.removePed(best);
    return best;
  }

  // Shot: hits the nearest ped roughly along the aim ray (within 3m of the line).
  shoot(x, z, heading, rangeMax) {
    const d = headingToDir(heading);
    let best = null, bd = rangeMax;
    for (const p of this.peds) {
      const dx = p.x - x, dz = p.z - z;
      const along = dx * d.x + dz * d.z;
      const side = Math.abs(dx * d.z - dz * d.x);
      if (along > 0 && along < rangeMax && side < 3) {
        if (along < bd) { bd = along; best = p; }
      }
    }
    if (best) this.removePed(best);
    return best;
  }

  // Any ped within radius r of (x,z) (witness check for car theft).
  witnessNear(x, z, r) {
    for (const p of this.peds) {
      if (dist(p.x, p.z, x, z) < r) return true;
    }
    return false;
  }

  _hitsBuilding(x, z, r) {
    for (const b of this.boxes) {
      if (x + r > b.minX && x - r < b.maxX && z + r > b.minZ && z - r < b.maxZ) return true;
    }
    return false;
  }
}

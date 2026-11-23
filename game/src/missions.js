// Solmar Bay 3D — missions, wanted level, coins, shop (v5, from the brief).
// 8 missions. Each mission: a name, a marker position, a per-step check
// function run by main.js. Wanted level decays 3 s/star and escalates with
// crimes (car theft witnessed, punching peds, gunfire). Sun coins: one
// collectible glows at (0, 270), +$250. Shop: weapons (GATOR $1,900,
// RPG $9,000) and crew calls (Z/X/C).

import { ENGINE, SUN_COIN, MISSIONS } from './config.js';
import { dist } from './util.js';

// The canonical 8-mission list lives in config.js (name / payout / brief /
// marker). Re-exported here so mission code has one import point.
export { MISSIONS };

// --- wanted level -------------------------------------------------------------
// Decays 1 star per 3 sim-seconds, but ONLY when every cop is far away
// (>45 m) — while the law is on your tail, the heat stays. forceDecay()
// (used by the escape test) bypasses the distance rule and drops a star
// every 0.3 s until the heat is gone.
export class Wanted {
  constructor() {
    this.level = 0;
    this.decayTimer = 0;
    this.forced = false;
  }
  add(n) {
    this.level = Math.min(5, this.level + n);
    this.decayTimer = ENGINE.wantedDecayPerStar;
  }
  set(n) {
    this.level = Math.max(0, Math.min(5, n));
    this.decayTimer = ENGINE.wantedDecayPerStar;
    if (this.level === 0) this.forced = false;
  }
  forceDecay() {
    this.forced = true;
    this.decayTimer = 0.05;
  }
  update(dt, nearestCopDist) {
    if (this.level <= 0) { this.forced = false; return; }
    if (this.forced) {
      this.decayTimer -= dt;
      if (this.decayTimer <= 0) {
        this.level -= 1;
        this.decayTimer = 0.3;
        if (this.level <= 0) this.forced = false;
      }
      return;
    }
    // Natural decay: only when the cops have lost you (>45 m away, or none).
    const clear = nearestCopDist == null || nearestCopDist > 45;
    if (!clear) { this.decayTimer = ENGINE.wantedDecayPerStar; return; }
    this.decayTimer -= dt;
    if (this.decayTimer <= 0) {
      this.level -= 1;
      this.decayTimer = ENGINE.wantedDecayPerStar;
    }
  }
  // How many police cars / foot cops should be active for this level.
  policeTarget() {
    if (this.level <= 0) return { cars: 0, cops: 0 };
    return { cars: Math.min(this.level + 1, 4), cops: Math.min(this.level, 3) };
  }
}

// --- sun coin -----------------------------------------------------------------
// One collectible coin on the beach road (0, 270). Collected once per save
// (save.coinCollected flags it), +$250, respawns after a fresh start.
export class SunCoin {
  constructor(scene, THREE) {
    this.scene = scene;
    this.x = SUN_COIN.x; this.z = SUN_COIN.z;
    this.taken = false;
    this.mesh = new THREE.Group();
    const disc = new THREE.Mesh(
      new THREE.CylinderGeometry(0.6, 0.6, 0.1, 20),
      new THREE.MeshBasicMaterial({ color: 0xffd828 }),
    );
    disc.rotation.x = Math.PI / 2;
    this.mesh.add(disc);
    const inner = new THREE.Mesh(
      new THREE.CylinderGeometry(0.35, 0.35, 0.14, 20),
      new THREE.MeshBasicMaterial({ color: 0xfff0a0 }),
    );
    inner.rotation.x = Math.PI / 2;
    this.mesh.add(inner);
    // Glow halo (additive).
    const halo = new THREE.Mesh(
      new THREE.CircleGeometry(1.4, 20),
      new THREE.MeshBasicMaterial({ color: 0xffd828, transparent: true, opacity: 0.25, blending: THREE.AdditiveBlending, depthWrite: false }),
    );
    this.mesh.add(halo);
    this.mesh.position.set(this.x, 1.4, this.z);
    scene.add(this.mesh);
  }
  update(dt, t) {
    if (this.taken) return;
    this.mesh.rotation.y += dt * 1.2;
    this.mesh.position.y = 1.4 + Math.sin(t * 2) * 0.15;
  }
  collectIfNear(x, z) {
    if (this.taken) return false;
    if (dist(x, z, this.x, this.z) < 2.5) {
      this.taken = true;
      this.mesh.visible = false;
      return true;
    }
    return false;
  }
  setTaken(taken) {
    this.taken = taken;
    this.mesh.visible = !taken;
  }
}

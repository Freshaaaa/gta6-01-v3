// Solmar Bay 3D — police + wanted: 0–5 stars, chasing police cars with
// flashing light bars, foot cops at 3+ stars, decay when out of sight,
// busted / wasted hooks. Written fresh for the gta6-01 3D rebuild
// (branch v12-3d, systems build).
import * as THREE from 'three';
import { Vehicle, MODELS } from './vehicles.js';
import { makePersonMesh } from './pedestrians.js';
import { PITCH } from './city.js';
import { mulberry32 } from './engine.js';

function angleDiff(a, b) {
  let d = a - b;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

// Shared radial-gradient texture for the police light-bar glow sprites.
let _glowTex = null;
function makeGlowTexture() {
  if (_glowTex) return _glowTex;
  const c = document.createElement('canvas');
  c.width = 64; c.height = 64;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(32, 32, 2, 32, 32, 30);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.4, 'rgba(255,255,255,0.5)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  _glowTex = new THREE.CanvasTexture(c);
  return _glowTex;
}

export class Police {
  constructor(scene, city, ctx) {
    this.scene = scene;
    this.city = city;
    this.ctx = ctx; // {getPlayer: () => {x, z, inCar, car}, damagePlayer(n), onBusted(), audio}
    this.rng = mulberry32(77);
    this.wanted = 0;
    this.time = 0;
    this.lastCrimeT = -100;
    this.decayT = 0;
    this.cars = []; // {car, redMat, blueMat, hp, ramCooldown, leaving}
    this.cops = []; // {mesh, x, z, heading, bustT}
    this.spawnT = 0;
    this.flashT = 0;
  }

  addWanted(n) {
    if (n <= 0) return;
    this.wanted = Math.min(5, this.wanted + n);
    this.lastCrimeT = this.time;
    this.decayT = 0;
  }

  setWanted(n) {
    this.wanted = Math.max(0, Math.min(5, n));
    this.lastCrimeT = this.time;
    this.decayT = 0;
  }

  desiredCars() {
    if (this.wanted === 0) return 0;
    return Math.min(1 + this.wanted, 4);
  }

  spawnPoliceCar(nearX, nearZ, fast = false) {
    const modelKey = fast ? 'coupe' : 'sedan';
    const car = new Vehicle(this.scene, modelKey, nearX, nearZ, 0, 0x111318);
    car.police = true;
    // Police top speed is capped below a sedan's: the player can outrun the
    // law in a normal car, but not in a slow van — and never on foot.
    car.model = { ...car.model, top: 30, accel: 12 };
    // White doors: a pale box slab on each side of the body.
    const doorMat = new THREE.MeshStandardMaterial({ color: 0xe8e8e8, roughness: 0.4, metalness: 0.3 });
    for (const sx of [-1, 1]) {
      const door = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.5, 1.9), doorMat);
      door.position.set(sx * (car.model.w / 2 + 0.01), 0.55, 0);
      car.group.add(door);
    }
    // Light bar: bigger, brighter red + blue emissive boxes on the roof,
    // with additive glow sprites so the car reads as police at a glance
    // (polish: the cover shot showed the old small bars as dark blobs).
    const redMat = new THREE.MeshStandardMaterial({ color: 0x330000, emissive: 0xff2020, emissiveIntensity: 4 });
    const blueMat = new THREE.MeshStandardMaterial({ color: 0x000033, emissive: 0x2244ff, emissiveIntensity: 0.5 });
    const barGeo = new THREE.BoxGeometry(0.8, 0.3, 0.7);
    const red = new THREE.Mesh(barGeo, redMat);
    red.position.set(-0.45, car.model.h * 1.25, 0);
    const blue = new THREE.Mesh(barGeo, blueMat);
    blue.position.set(0.45, car.model.h * 1.25, 0);
    car.group.add(red, blue);
    // White roof panel + hood stripe: the near-black body reads as a
    // civilian car from the front, the white panels say police.
    const whiteMat = new THREE.MeshStandardMaterial({ color: 0xe8e8e8, roughness: 0.4, metalness: 0.3 });
    const roofPanel = new THREE.Mesh(new THREE.BoxGeometry(car.model.w * 0.82, 0.05, car.model.l * 0.34), whiteMat);
    roofPanel.position.set(0, car.model.h * 1.125, 0);
    car.group.add(roofPanel);
    const hood = new THREE.Mesh(new THREE.BoxGeometry(car.model.w * 0.8, 0.05, car.model.l * 0.3), whiteMat);
    hood.position.set(0, 0.55 + car.model.h * 0.275 + 0.03, car.model.l * 0.28);
    car.group.add(hood);
    // Glow sprites (cheap additive quads, no extra lights).
    const glowTex = makeGlowTexture();
    const redGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xff2a2a, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }));
    redGlow.scale.set(2.6, 1.5, 1);
    redGlow.position.copy(red.position);
    const blueGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0x2a55ff, transparent: true, opacity: 0.15, blending: THREE.AdditiveBlending, depthWrite: false }));
    blueGlow.scale.set(2.6, 1.5, 1);
    blueGlow.position.copy(blue.position);
    car.group.add(redGlow, blueGlow);
    this.scene.add(car.group); // Vehicle already added it; add() again is a no-op move
    const pc = { car, redMat, blueMat, redGlow, blueGlow, hp: 100, ramCooldown: 0, leaving: false };
    this.cars.push(pc);
    return pc;
  }

  // Spawn a police car on a road near (x, z), heading roughly toward the player.
  spawnNear(x, z, fast = false) {
    const ang = this.rng() * Math.PI * 2;
    const dist = 45 + this.rng() * 25;
    let sx = x + Math.cos(ang) * dist;
    let sz = z + Math.sin(ang) * dist;
    sx = Math.max(-260, Math.min(260, sx));
    sz = Math.max(-260, Math.min(260, sz));
    const road = this.city.nearestRoad(sx, sz);
    if (road.alongX) { sx = road.x; sz = road.z; }
    else { sx = road.x; sz = road.z; }
    const pc = this.spawnPoliceCar(sx, sz, fast);
    pc.car.heading = Math.atan2(x - sx, z - sz);
    pc.car.group.rotation.y = pc.car.heading;
    return pc;
  }

  spawnCop(x, z) {
    const mesh = makePersonMesh(0x1a2a5a, 0xd8a878, 0x1a2a5a);
    this.scene.add(mesh.group);
    const cop = { mesh, x, z, heading: 0, bustT: 0 };
    mesh.group.position.set(x, 0, z);
    this.cops.push(cop);
    return cop;
  }

  // Stage a chase for the cover screenshot: n police cars right behind a spot.
  spawnChase(x, z, n = 2) {
    this.setWanted(3);
    for (let i = 0; i < n; i++) {
      const pc = this.spawnPoliceCar(x + (i === 0 ? -5 : 5), z - 16 - i * 6, i === 1);
      pc.car.heading = 0;
      pc.car.group.rotation.y = 0;
    }
  }

  damageCar(car, amount) {
    const pc = this.cars.find((c) => c.car === car);
    if (!pc || pc.hp <= 0) return false;
    pc.hp -= amount;
    if (pc.hp <= 0) {
      pc.car.speed = 0;
      pc.redMat.emissiveIntensity = 0.1;
      pc.blueMat.emissiveIntensity = 0.1;
      pc.redGlow.material.opacity = 0.05;
      pc.blueGlow.material.opacity = 0.05;
      this.addWanted(1);
      return true;
    }
    return false;
  }

  // Remove every police unit at once (respawn after busted/wasted).
  clearAll() {
    for (const pc of this.cars) this.scene.remove(pc.car.group);
    this.cars.length = 0;
    for (const c of this.cops) this.scene.remove(c.mesh.group);
    this.cops.length = 0;
    this.wanted = 0;
  }

  // Test hook: pretend the player hid long ago and the cops lost the trail,
  // so the real decay path runs.
  debugForceDecay() {
    this.lastCrimeT = this.time - 30;
    for (const pc of this.cars) {
      pc.car.x += 120; pc.car.z += 120;
      pc.car.group.position.set(pc.car.x, 0, pc.car.z);
    }
  }

  nearestPoliceDist(x, z) {
    let bd = Infinity;
    for (const pc of this.cars) bd = Math.min(bd, Math.hypot(pc.car.x - x, pc.car.z - z));
    for (const c of this.cops) bd = Math.min(bd, Math.hypot(c.x - x, c.z - z));
    return bd;
  }

  update(dt) {
    this.time += dt;
    this.flashT += dt;
    const p = this.ctx.getPlayer();
    const px = p.x, pz = p.z;

    // Flash the light bars (alternate red/blue).
    const phase = Math.floor(this.flashT / 0.35) % 2 === 0;
    for (const pc of this.cars) {
      if (pc.hp <= 0) continue;
      pc.redMat.emissiveIntensity = phase ? 4 : 0.5;
      pc.blueMat.emissiveIntensity = phase ? 0.5 : 4;
      pc.redGlow.material.opacity = phase ? 0.9 : 0.15;
      pc.blueGlow.material.opacity = phase ? 0.15 : 0.9;
      if (pc.ramCooldown > 0) pc.ramCooldown -= dt;
    }

    // Wanted decay: only when the trail is cold (no crime recently) and no
    // police unit is close.
    if (this.wanted > 0 && this.time - this.lastCrimeT > 12 && this.nearestPoliceDist(px, pz) > 45) {
      this.decayT += dt;
      if (this.decayT >= 6) { this.decayT = 0; this.wanted = Math.max(0, this.wanted - 1); }
    }

    // Spawn replacements only while the heat is fresh — once the trail is
    // cold, no new units arrive, so the player can actually escape.
    const want = this.desiredCars();
    this.spawnT -= dt;
    const heatFresh = this.time - this.lastCrimeT < 12;
    if (heatFresh && this.cars.filter((c) => !c.leaving && c.hp > 0).length < want && this.spawnT <= 0) {
      this.spawnT = 2;
      this.spawnNear(px, pz, this.wanted >= 4 && this.cars.length % 2 === 1);
    }
    if (this.wanted === 0) {
      for (const pc of this.cars) pc.leaving = true;
    }
    // Leaving cars drive away from the player, then get removed.
    for (let i = this.cars.length - 1; i >= 0; i--) {
      const pc = this.cars[i];
      if (!pc.leaving) continue;
      const away = Math.atan2(pc.car.x - px, pc.car.z - pz);
      const steer = Math.max(-1, Math.min(1, angleDiff(away, pc.car.heading) * 2));
      pc.car.update(dt, { throttle: 1, steer, handbrake: false }, this.city);
      if (Math.hypot(pc.car.x - px, pc.car.z - pz) > 110) {
        this.scene.remove(pc.car.group);
        this.cars.splice(i, 1);
      }
    }

    // Chase: steer each active police car at the player, ram when close.
    for (const pc of this.cars) {
      if (pc.leaving || pc.hp <= 0) continue;
      const car = pc.car;
      const dist = Math.hypot(px - car.x, pz - car.z);
      // Give up: if the player stays far away, this unit breaks off.
      if (dist > 110) {
        pc.farT = (pc.farT || 0) + dt;
        if (pc.farT > 4) { pc.leaving = true; continue; }
      } else {
        pc.farT = 0;
      }
      // Stuck recovery: if we are not closing on the player, reverse out.
      pc.stuckT = (pc.stuckT || 0) + dt;
      if (pc.stuckT > 1) {
        pc.stuckT = 0;
        if (dist > (pc.lastDist ?? Infinity) - 0.5) pc.stuckN = (pc.stuckN || 0) + 1;
        else pc.stuckN = 0;
        pc.lastDist = dist;
        if ((pc.stuckN || 0) >= 3) { pc.stuckN = 0; pc.reverseT = 1.0; }
      }
      let throttle = 1, steer;
      const desired = Math.atan2(px - car.x, pz - car.z);
      if (pc.reverseT > 0) {
        pc.reverseT -= dt;
        throttle = -1;
        steer = Math.max(-1, Math.min(1, -angleDiff(desired, car.heading) * 2));
      } else {
        steer = Math.max(-1, Math.min(1, angleDiff(desired, car.heading) * 2.2));
      }
      car.update(dt, { throttle, steer, handbrake: false }, this.city);
      if (dist < 2.6 && pc.ramCooldown <= 0) {
        pc.ramCooldown = 1.0;
        if (p.inCar && p.car) {
          p.car.speed *= 0.75; // rammed: lose speed
          this.ctx.audio?.playThud?.();
        } else {
          this.ctx.damagePlayer(20, 'ram');
        }
      }
    }

    // Foot cops at 3+ stars.
    const wantCops = this.wanted >= 3 ? Math.min(2, this.wanted - 1) : 0;
    if (this.cops.length < wantCops && this.wanted >= 3) {
      const ang = this.rng() * Math.PI * 2;
      this.spawnCop(px + Math.cos(ang) * 25, pz + Math.sin(ang) * 25);
    }
    if (this.wanted < 2) {
      for (const c of this.cops) this.scene.remove(c.mesh.group);
      this.cops.length = 0;
    }
    for (const c of this.cops) {
      const dx = px - c.x, dz = pz - c.z;
      const d = Math.hypot(dx, dz) || 1;
      const sp = 4.6;
      const nx = c.x + (dx / d) * sp * dt;
      const nz = c.z + (dz / d) * sp * dt;
      const hit = this.city.collideCircle(nx, nz, 0.5);
      c.x = hit.x; c.z = hit.z;
      c.heading = Math.atan2(dx, dz);
      c.mesh.group.position.set(c.x, 0, c.z);
      c.mesh.group.rotation.y = c.heading;
      // Walk swing.
      const swing = Math.sin(this.time * 9) * 0.5;
      c.mesh.legL.rotation.x = swing;
      c.mesh.legR.rotation.x = -swing;
      if (d < 1.4 && !p.inCar) {
        c.bustT += dt;
        if (c.bustT > 1.2) { this.ctx.onBusted(); c.bustT = 0; }
      } else {
        c.bustT = Math.max(0, c.bustT - dt);
      }
    }

    // Siren while wanted.
    this.ctx.audio?.setSiren?.(this.wanted > 0);
  }

  get count() { return this.cars.filter((c) => !c.leaving).length; }
  get positions() {
    return {
      cars: this.cars.filter((c) => !c.leaving && c.hp > 0).map((c) => ({ x: c.car.x, z: c.car.z })),
      cops: this.cops.map((c) => ({ x: c.x, z: c.z })),
    };
  }
}

// Solmar Bay 3D — pedestrians: low-poly people walking the sidewalks, fleeing
// from danger, falling when hit. Written fresh for the gta6-01 3D rebuild
// (branch v12-3d, systems build).
import * as THREE from 'three';
import { PITCH, CITY_R, ROAD_HALF } from './city.js';
import { mulberry32 } from './engine.js';

const SHIRTS = [0xd84a4a, 0x4a7ad8, 0x37c878, 0xe8a23a, 0x9a5ad8, 0xe8e8e8, 0x2a2a2a, 0xff7eb8];
const SKINS = [0xd8a878, 0xb87a4a, 0x8a5a30, 0xf0c8a0];
const HAIRS = [0x2a1a12, 0x4a2a18, 0x1a1a1a, 0x8a6a3a, 0x6a6a6a];
const SIDEWALK = ROAD_HALF + 2.5; // distance from a road centre line

// Shared rounded person: capsule torso, sphere head, cylinder limbs that
// swing, arms. Returns the group plus the limb meshes so walkers can
// animate them. No box-people: every form is round.
export function makePersonMesh(shirt, skin, pants = 0x2c3550, rng = Math.random) {
  const g = new THREE.Group();
  const mat = (c, rough = 0.6) => new THREE.MeshStandardMaterial({ color: c, roughness: rough });
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.25, 0.18, 6, 14), mat(shirt));
  torso.position.y = 1.08; torso.castShadow = true; g.add(torso);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.21, 18, 14), mat(skin, 0.55));
  head.position.y = 1.62; head.castShadow = true; g.add(head);
  // Hair: a flattened dark sphere on top of the head (varied per person).
  if (rng() < 0.6) {
    const hair = new THREE.Mesh(new THREE.SphereGeometry(0.22, 14, 10), mat(HAIRS[Math.floor(rng() * HAIRS.length)], 0.7));
    hair.scale.y = 0.5;
    hair.position.y = 1.74;
    g.add(hair);
  }
  const legL = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.085, 0.68, 12), mat(pants, 0.7));
  const legR = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.085, 0.68, 12), mat(pants, 0.7));
  legL.geometry.translate(0, -0.34, 0); legR.geometry.translate(0, -0.34, 0);
  legL.position.set(-0.15, 0.7, 0); legR.position.set(0.15, 0.7, 0);
  legL.castShadow = true; legR.castShadow = true; g.add(legL, legR);
  const armL = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.065, 0.6, 10), mat(shirt));
  const armR = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.065, 0.6, 10), mat(shirt));
  armL.geometry.translate(0, -0.3, 0); armR.geometry.translate(0, -0.3, 0);
  armL.position.set(-0.39, 1.38, 0); armR.position.set(0.39, 1.38, 0);
  g.add(armL, armR);
  return { group: g, legL, legR, armL, armR };
}

export class Pedestrians {
  constructor(scene, city, seed = 47) {
    this.scene = scene;
    this.city = city;
    this.rng = mulberry32(seed);
    this.peds = []; // {mesh, x, z, heading, speed, state, phase, fallT, fleeT, wait}
    for (let i = 0; i < 32; i++) this.spawnPed(true);
  }

  spawnPed(anywhere, x = 0, z = 0) {
    const shirt = SHIRTS[Math.floor(this.rng() * SHIRTS.length)];
    const skin = SKINS[Math.floor(this.rng() * SKINS.length)];
    const mesh = makePersonMesh(shirt, skin, 0x2c3550, this.rng);
    // Slight height variety so the crowd does not read as clones.
    mesh.group.scale.setScalar(0.94 + this.rng() * 0.12);
    this.scene.add(mesh.group);
    const p = { mesh, x, z, heading: 0, speed: 1.1 + this.rng() * 0.9, state: 'walk', phase: this.rng() * 6, fallT: 0, fleeT: 0, lane: 'v', line: 0, off: SIDEWALK, dir: 1 };
    if (anywhere) this.placeOnSidewalk(p);
    else { p.x = x; p.z = z; }
    p.mesh.group.position.set(p.x, 0, p.z);
    this.peds.push(p);
    return p;
  }

  // Put a ped on a random sidewalk lane: a line parallel to a road.
  placeOnSidewalk(p) {
    const lane = this.rng() < 0.5 ? 'v' : 'h';
    const line = (Math.floor(this.rng() * (CITY_R * 2 + 1)) - CITY_R) * PITCH;
    const dir = this.rng() < 0.5 ? 1 : -1;
    const along = (this.rng() - 0.5) * 520;
    const off = (this.rng() < 0.5 ? 1 : -1) * SIDEWALK;
    p.lane = lane; p.line = line; p.off = off; p.dir = dir;
    if (lane === 'v') { p.x = line + off; p.z = along; p.heading = dir > 0 ? 0 : Math.PI; }
    else { p.x = along; p.z = line + off; p.heading = dir > 0 ? Math.PI / 2 : -Math.PI / 2; }
    p.state = 'walk';
    p.mesh.group.position.set(p.x, 0, p.z);
    p.mesh.group.rotation.set(0, p.heading, 0);
  }

  // Turn onto the cross sidewalk at an intersection (30% chance).
  maybeTurn(p, along) {
    const nearest = Math.round(along / PITCH) * PITCH;
    if (Math.abs(along - nearest) > 2.5) return;
    if (p.lastTurnAt === nearest) return;
    p.lastTurnAt = nearest;
    if (this.rng() > 0.3) return;
    const newLane = p.lane === 'v' ? 'h' : 'v';
    const newDir = this.rng() < 0.5 ? 1 : -1;
    if (newLane === 'h') { p.z = nearest + (newDir > 0 ? SIDEWALK : -SIDEWALK); p.heading = newDir > 0 ? Math.PI / 2 : -Math.PI / 2; }
    else { p.x = nearest + (newDir > 0 ? SIDEWALK : -SIDEWALK); p.heading = newDir > 0 ? 0 : Math.PI; }
    p.lane = newLane; p.dir = newDir; p.line = nearest; p.off = newDir > 0 ? SIDEWALK : -SIDEWALK;
    p.mesh.group.rotation.y = p.heading;
  }

  update(dt, ctx) {
    const px = ctx.px, pz = ctx.pz;
    const carX = ctx.carX, carZ = ctx.carZ, carSpeed = ctx.carSpeed || 0;
    const threat = ctx.threat; // {x, z} of a gunshot, or null
    for (const p of this.peds) {
      if (p.state === 'fallen') {
        p.fallT -= dt;
        if (p.fallT <= 0) { // get back up elsewhere
          p.mesh.group.rotation.x = 0;
          p.mesh.group.position.y = 0;
          this.placeOnSidewalk(p);
        }
        continue;
      }
      // Flee: a fast car close by, or a gunshot nearby.
      if (p.state !== 'flee') {
        let flee = false;
        if (carSpeed > 6 && carX !== null) {
          const d = Math.hypot(p.x - carX, p.z - carZ);
          if (d < 9) flee = true;
        }
        if (threat) {
          const d = Math.hypot(p.x - threat.x, p.z - threat.z);
          if (d < 16) flee = true;
        }
        if (flee) { p.state = 'flee'; p.fleeT = 3; }
      }
      if (p.state === 'flee') {
        p.fleeT -= dt;
        const dx = p.x - px, dz = p.z - pz;
        const len = Math.hypot(dx, dz) || 1;
        const sp = 3.6;
        p.x += (dx / len) * sp * dt;
        p.z += (dz / len) * sp * dt;
        p.heading = Math.atan2(dx, dz);
        p.phase += dt * 11;
        if (p.fleeT <= 0) { p.state = 'walk'; this.placeOnSidewalk(p); }
      } else {
        // Walk the sidewalk lane.
        const sp = p.speed;
        const along = p.lane === 'v' ? p.z : p.x;
        this.maybeTurn(p, along);
        if (p.lane === 'v') p.z += p.dir * sp * dt;
        else p.x += p.dir * sp * dt;
        p.phase += dt * 7;
        // Respawn far-away peds near the player.
        if (Math.hypot(p.x - px, p.z - pz) > 200) this.placeOnSidewalk(p);
        // Wrap at the city edge.
        if (Math.abs(p.x) > 285 || Math.abs(p.z) > 285) this.placeOnSidewalk(p);
      }
      // Animate + place.
      const swing = Math.sin(p.phase) * 0.5;
      p.mesh.legL.rotation.x = swing;
      p.mesh.legR.rotation.x = -swing;
      p.mesh.armL.rotation.x = -swing * 0.7;
      p.mesh.armR.rotation.x = swing * 0.7;
      p.mesh.group.position.set(p.x, 0, p.z);
      p.mesh.group.rotation.y = p.heading;
    }
  }

  // Knock a ped down (hit by a car, punched, shot). Returns true if it fell.
  knockDown(p) {
    if (!p || p.state === 'fallen') return false;
    p.state = 'fallen';
    p.fallT = 4;
    p.mesh.group.rotation.x = -Math.PI / 2; // lying on the back
    p.mesh.group.position.y = 0.25;
    return true;
  }

  nearestPed(x, z, maxDist) {
    let best = null, bd = maxDist;
    for (const p of this.peds) {
      if (p.state === 'fallen') continue;
      const d = Math.hypot(p.x - x, p.z - z);
      if (d < bd) { bd = d; best = p; }
    }
    return best;
  }

  // A driven car ploughing through peds: returns the peds it hit this frame.
  checkCarHit(car) {
    const hit = [];
    if (Math.abs(car.speed) < 3) return hit;
    for (const p of this.peds) {
      if (p.state === 'fallen') continue;
      if (Math.hypot(p.x - car.x, p.z - car.z) < 1.7) {
        if (this.knockDown(p)) hit.push(p);
      }
    }
    return hit;
  }

  get count() { return this.peds.filter((p) => p.state !== 'fallen').length; }
}

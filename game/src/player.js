// Solmar Bay 3D — player: Dante on foot and behind the wheel.
// On foot Dante walks with WASD (3.8 m/s, 4.6 m/s sprinting with Shift),
// turns to face his movement, and can steal the nearest parked car with E.
// In a car the Comet accelerates, brakes, steers and handbrakes; the chase
// camera follows it. The player's logical position is what the missions,
// the wanted system and the save all read.
import * as THREE from 'three';
import { buildCar, CAR_COLORS } from './vehicles.js';

const WALK_SPEED = 3.8;
const SPRINT_SPEED = 5.6;
const CAR_ACCEL = 14;
const CAR_BRAKE = 26;
const CAR_MAX_SPEED = 42;
const CAR_REVERSE_MAX = 10;
const STEER_RATE = 1.9;

// Build Dante's on-foot figure: a simple box person with a jacket, head
// and legs, plus a blob shadow. He must read as a person at a glance.
function buildDante(G) {
  const group = new THREE.Group();
  const jacket = new THREE.MeshLambertMaterial({ color: 0x2e4a7a });
  const skin = new THREE.MeshLambertMaterial({ color: 0xd8a878 });
  const pants = new THREE.MeshLambertMaterial({ color: 0x2a2a30 });
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.78, 0.36), jacket);
  torso.position.y = 1.15;
  torso.castShadow = !G.lowfx;
  group.add(torso);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.42, 0.42), skin);
  head.position.y = 1.78;
  group.add(head);
  const hair = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.14, 0.44),
    new THREE.MeshLambertMaterial({ color: 0x1a1410 }));
  hair.position.y = 2.02;
  group.add(hair);
  for (const sx of [-0.16, 0.16]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.72, 0.26), pants);
    leg.position.set(sx, 0.38, 0);
    group.add(leg);
  }
  for (const sx of [-0.4, 0.4]) {
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.62, 0.2), jacket);
    arm.position.set(sx, 1.15, 0);
    group.add(arm);
  }
  return group;
}

export function createPlayer(G) {
  const mesh = buildDante(G);
  mesh.position.set(G.player.x, 0, G.player.z);
  G.scene.add(mesh);

  const player = {
    mesh,
    // The Comet: Dante's own car, spawned for staged shots and as the
    // parked hero car the player can steal near the start.
    comet: null,

    // Give Dante his Comet (used by the staged cover/beach shots).
    giveComet(x, z, heading) {
      if (this.comet) {
        G.scene.remove(this.comet.group);
      }
      const car = buildCar(G, { color: CAR_COLORS.comet, model: 'Comet', spoiler: true });
      car.x = x;
      car.z = z;
      car.heading = heading;
      car.sync();
      G.scene.add(car.group);
      this.comet = car;
      return car;
    },

    // Step into a car: Dante's mesh hides, the car becomes his.
    enterCar(car) {
      G.player.car = car;
      G.player.inCar = true;
      mesh.visible = false;
      G.audio.setEngine(car.speed, true);
      return true;
    },

    // Step out: Dante appears beside the car, the car stays parked.
    exitCar() {
      if (!G.player.inCar || !G.player.car) {
        G.player.inCar = false;
        return false;
      }
      const car = G.player.car;
      const sx = Math.cos(car.heading);
      const sz = -Math.sin(car.heading);
      G.player.x = car.x + sx * 2.2;
      G.player.z = car.z + sz * 2.2;
      G.player.heading = car.heading;
      G.player.car = null;
      G.player.inCar = false;
      mesh.visible = true;
      mesh.position.set(G.player.x, 0, G.player.z);
      G.audio.setEngine(0, false);
      return true;
    },

    // One fixed step of movement: on foot or driving.
    update(dt) {
      const keys = G.keys;
      if (G.player.inCar && G.player.car) {
        this.drive(dt, keys);
      } else {
        this.walk(dt, keys);
      }
      mesh.position.set(G.player.x, 0, G.player.z);
      mesh.rotation.y = G.player.heading;
    },

    walk(dt, keys) {
      let mx = 0;
      let mz = 0;
      if (keys.has('KeyW')) mz += 1;
      if (keys.has('KeyS')) mz -= 1;
      if (keys.has('KeyA')) mx -= 1;
      if (keys.has('KeyD')) mx += 1;
      if (mx === 0 && mz === 0) return;
      // Camera-relative: W walks away from the camera (the heading way).
      const h = G.player.heading;
      const fx = Math.sin(h);
      const fz = Math.cos(h);
      const rx = Math.cos(h);
      const rz = -Math.sin(h);
      let dx = fx * mz + rx * mx;
      let dz = fz * mz + rz * mx;
      const len = Math.hypot(dx, dz) || 1;
      dx /= len;
      dz /= len;
      const speed = keys.has('ShiftLeft') || keys.has('ShiftRight') ? SPRINT_SPEED : WALK_SPEED;
      G.player.x += dx * speed * dt;
      G.player.z += dz * speed * dt;
      G.player.heading = Math.atan2(dx, dz);
      this.clampToWorld();
    },

    drive(dt, keys) {
      const car = G.player.car;
      if (!car) return;
      const auto = G.autoDrive;
      const fwd = auto || keys.has('KeyW') || keys.has('ArrowUp');
      const back = keys.has('KeyS') || keys.has('ArrowDown');
      const hand = keys.has('Space');
      if (fwd) car.speed += CAR_ACCEL * dt;
      if (back) car.speed -= (car.speed > 0.5 ? CAR_BRAKE : CAR_ACCEL * 0.7) * dt;
      if (!fwd && !back) {
        // Coast down gently.
        car.speed -= Math.sign(car.speed) * 6 * dt;
        if (Math.abs(car.speed) < 0.2) car.speed = 0;
      }
      if (hand) car.speed *= Math.max(0, 1 - 3.2 * dt);
      // Rico's ram boost: a temporary higher top speed.
      const top = G.crew.rico.boostT > 0 ? CAR_MAX_SPEED + 10 : CAR_MAX_SPEED;
      car.speed = Math.max(-CAR_REVERSE_MAX, Math.min(top, car.speed));
      // Steering scales with speed (no turning while parked).
      let steer = 0;
      if (keys.has('KeyA') || keys.has('ArrowLeft')) steer += 1;
      if (keys.has('KeyD') || keys.has('ArrowRight')) steer -= 1;
      if (auto) steer = G.autoSteer || 0;
      const spd = Math.abs(car.speed);
      if (spd > 0.2 && steer !== 0) {
        car.heading += steer * STEER_RATE * dt * Math.min(1, spd / 8) * Math.sign(car.speed);
      }
      car.x += Math.sin(car.heading) * car.speed * dt;
      car.z += Math.cos(car.heading) * car.speed * dt;
      // Keep the car on the island (city + beach, not the open ocean).
      car.x = Math.max(-268, Math.min(268, car.x));
      car.z = Math.max(-268, Math.min(304, car.z));
      G.player.x = car.x;
      G.player.z = car.z;
      G.player.heading = car.heading;
      car.sync();
      car.spin(dt);
      G.audio.setEngine(car.speed, true);
      // Collisions with traffic are soft: a thud and a speed cut.
      for (const other of G.trafficCars) {
        if (other === car || other.staged) continue;
        const d = Math.hypot(other.x - car.x, other.z - car.z);
        if (d < 3.4 && Math.abs(car.speed) > 3) {
          G.audio.thud(Math.abs(car.speed));
          car.speed *= 0.55;
          other.speed = Math.max(other.speed, 4);
        }
      }
    },

    clampToWorld() {
      // On foot Dante stays on the island too (city + beach, z <= 308).
      G.player.x = Math.max(-268, Math.min(268, G.player.x));
      G.player.z = Math.max(-268, Math.min(306, G.player.z));
    },
  };

  return player;
}

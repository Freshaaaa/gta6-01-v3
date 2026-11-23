// Solmar Bay 3D — police: the wanted system, the chase cars, the foot
// cops and the helicopter's ground game. Wanted runs 0–5 stars. Stealing a
// car in view, ramming, or shooting raises it; it decays 3 seconds a star,
// but only while no police are within 45 m — so the player has to actually
// get away. forceDecay() makes every cop lose the trail at once (the
// playtest's escape lever). Foot cops walk to Dante at 4.6 m/s and grab him
// in 0.6 s once they are close, which is how the busted state is reached.
import * as THREE from 'three';
import { buildCar, CAR_COLORS } from './vehicles.js';

const DECAY_SECONDS_PER_STAR = 3;
const CHASE_SPEED = 30;
const COP_WALK_SPEED = 4.6;
const BUST_RANGE = 2.2;
const BUST_TIME = 0.6;
const NEAR_RANGE = 45;

export function createPolice(G) {
  const rng = G.rng;
  const police = {
    cars: [],
    cops: [],
    decayTimer: 0,

    // Raise the wanted level (clamped to 5) and spawn the chase.
    raiseWanted(n) {
      const before = G.wanted;
      G.wanted = Math.max(0, Math.min(5, G.wanted + n));
      if (G.wanted > before) {
        this.ensureCars();
        if (G.wanted >= 3) G.heliSystem.show();
      }
      G.hud.setWanted(G.wanted);
    },

    setWanted(n) {
      G.wanted = Math.max(0, Math.min(5, n));
      if (G.wanted > 0) {
        this.ensureCars();
        if (G.wanted >= 3) G.heliSystem.show();
      }
      G.hud.setWanted(G.wanted);
    },

    // Keep one chase car per wanted star (up to five) on the road.
    ensureCars() {
      while (this.cars.length < G.wanted) {
        const car = buildCar(G, { color: CAR_COLORS.white, model: 'Police', police: true, spoiler: false });
        const ang = rng() * Math.PI * 2;
        car.x = G.player.x + Math.sin(ang) * (40 + rng() * 30);
        car.z = G.player.z + Math.cos(ang) * (40 + rng() * 30);
        car.x = Math.max(-260, Math.min(260, car.x));
        car.z = Math.max(-260, Math.min(260, car.z));
        car.heading = Math.atan2(G.player.x - car.x, G.player.z - car.z);
        car.speed = 12;
        car.sync();
        car.userData = { lost: false, lostT: 0 };
        G.scene.add(car.group);
        this.cars.push(car);
      }
      G.policeCars = this.cars;
    },

    // Spawn a foot cop near Dante (the busted test spawns several, from
    // different angles, so at least one has a clear path).
    spawnCopNear() {
      const cop = this.makeCop();
      const ang = rng() * Math.PI * 2;
      const dist = 10 + rng() * 10;
      cop.x = G.player.x + Math.sin(ang) * dist;
      cop.z = G.player.z + Math.cos(ang) * dist;
      cop.x = Math.max(-260, Math.min(260, cop.x));
      cop.z = Math.max(-260, Math.min(300, cop.z));
      cop.mesh.position.set(cop.x, 0, cop.z);
      G.scene.add(cop.mesh);
      this.cops.push(cop);
      return cop;
    },

    makeCop() {
      const group = new THREE.Group();
      const navy = new THREE.MeshLambertMaterial({ color: 0x1e2a4a });
      const skin = new THREE.MeshLambertMaterial({ color: 0xd8a878 });
      const torso = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.78, 0.36), navy);
      torso.position.y = 1.15;
      group.add(torso);
      const head = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.42, 0.42), skin);
      head.position.y = 1.78;
      group.add(head);
      const cap = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.12, 0.46), navy);
      cap.position.y = 2.02;
      group.add(cap);
      for (const sx of [-0.16, 0.16]) {
        const leg = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.72, 0.26), navy);
        leg.position.set(sx, 0.38, 0);
        group.add(leg);
      }
      return { mesh: group, x: 0, z: 0, grabT: 0 };
    },

    // Make every cop lose the trail: they stop chasing and drive away, so
    // the decay can run. The playtest calls this, then waits for wanted 0.
    forceDecay() {
      for (const car of this.cars) {
        car.userData.lost = true;
        car.userData.lostT = 0;
        // Send them far away so the 45 m rule is satisfied at once.
        const ang = Math.atan2(car.x - G.player.x, car.z - G.player.z);
        car.x = G.player.x + Math.sin(ang) * 260;
        car.z = G.player.z + Math.cos(ang) * 260;
        car.x = Math.max(-260, Math.min(260, car.x));
        car.z = Math.max(-260, Math.min(260, car.z));
        car.sync();
      }
      for (const cop of this.cops) {
        const ang = Math.atan2(cop.x - G.player.x, cop.z - G.player.z);
        cop.x = G.player.x + Math.sin(ang) * 120;
        cop.z = G.player.z + Math.cos(ang) * 120;
        cop.mesh.position.set(cop.x, 0, cop.z);
      }
      this.decayTimer = 0;
    },

    // Is any police car or foot cop within NEAR_RANGE of the player?
    anyNear() {
      for (const car of this.cars) {
        if (Math.hypot(car.x - G.player.x, car.z - G.player.z) < NEAR_RANGE) return true;
      }
      for (const cop of this.cops) {
        if (Math.hypot(cop.x - G.player.x, cop.z - G.player.z) < NEAR_RANGE) return true;
      }
      return false;
    },

    // One fixed step: chase cars pursue, foot cops walk to Dante and grab
    // him, and the wanted level decays while the heat is off.
    update(dt) {
      // Wanted decay: 3 s a star, only while no police are near.
      if (G.wanted > 0 && !this.anyNear()) {
        this.decayTimer += dt;
        if (this.decayTimer >= DECAY_SECONDS_PER_STAR) {
          this.decayTimer = 0;
          G.wanted -= 1;
          G.hud.setWanted(G.wanted);
          if (G.wanted === 0) {
            this.clearCars();
            G.heliSystem.hide();
          }
        }
      } else {
        this.decayTimer = 0;
      }

      // Chase cars: steer toward the player, at 30 m/s, unless lost.
      const px = G.player.x;
      const pz = G.player.z;
      for (const car of this.cars) {
        if (car.userData.lost) {
          car.userData.lostT += dt;
          car.speed = Math.max(6, car.speed - 4 * dt);
          if (car.userData.lostT > 25) {
            G.scene.remove(car.group);
            this.cars.splice(this.cars.indexOf(car), 1);
            continue;
          }
        } else {
          const want = Math.atan2(px - car.x, pz - car.z);
          let dh = want - car.heading;
          while (dh > Math.PI) dh -= Math.PI * 2;
          while (dh < -Math.PI) dh += Math.PI * 2;
          car.heading += Math.max(-1.6 * dt, Math.min(1.6 * dt, dh));
          car.speed = Math.min(CHASE_SPEED, car.speed + 10 * dt);
        }
        car.x += Math.sin(car.heading) * car.speed * dt;
        car.z += Math.cos(car.heading) * car.speed * dt;
        car.x = Math.max(-268, Math.min(268, car.x));
        car.z = Math.max(-268, Math.min(304, car.z));
        car.sync();
        car.spin(dt);
        // A chase car that rams the player's car slows them both.
        const pc = G.player.car;
        if (pc && Math.hypot(car.x - pc.x, car.z - pc.z) < 3.6) {
          pc.speed *= 0.7;
          G.audio.thud(6);
        }
      }

      // Foot cops: walk to Dante; grab him in 0.6 s once close.
      // They only spawn at wanted 3+, and only while Dante is on foot —
      // a cop cannot pull him out of a moving car.
      if (G.wanted >= 3 && !G.player.inCar && G.state === 'playing') {
        if (this.cops.length < 2 && rng() < dt * 0.25) this.spawnCopNear();
      }
      for (const cop of [...this.cops]) {
        const d = Math.hypot(px - cop.x, pz - cop.z);
        if (G.player.inCar) {
          cop.grabT = 0;
          continue;
        }
        if (d < BUST_RANGE) {
          cop.grabT += dt;
          if (cop.grabT >= BUST_TIME) {
            G.events.busted();
            return;
          }
        } else {
          cop.grabT = 0;
          const ang = Math.atan2(px - cop.x, pz - cop.z);
          cop.x += Math.sin(ang) * COP_WALK_SPEED * dt;
          cop.z += Math.cos(ang) * COP_WALK_SPEED * dt;
          cop.x = Math.max(-260, Math.min(260, cop.x));
          cop.z = Math.max(-260, Math.min(300, cop.z));
          cop.mesh.position.set(cop.x, 0, cop.z);
          cop.mesh.rotation.y = ang;
        }
      }
    },

    // Clear the chase (wanted back to 0): remove the cars and the cops.
    clearCars() {
      for (const car of this.cars) G.scene.remove(car.group);
      this.cars = [];
      G.policeCars = [];
      for (const cop of this.cops) G.scene.remove(cop.mesh);
      this.cops = [];
    },
  };

  return police;
}

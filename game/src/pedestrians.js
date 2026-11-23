// Solmar Bay 3D — pedestrians: the people on the sidewalks. Twenty-four
// walk the city at the start, wandering along the sidewalks and crossing
// at the corners. A gunshot makes nearby peds flee; a punch or a pistol
// shot can fell one. They stay on the island (city + beach, z <= 308) so
// they never wander out of the combat tests' reach.
import * as THREE from 'three';

export const PED_COUNT = 24;
const PED_WALK_SPEED = 1.4;
const PED_FLEE_SPEED = 3.6;
const FLEE_RANGE = 16;
const FLEE_TIME = 1.5;

const SHIRTS = [0xc23b2e, 0x2e8a8a, 0xe8b83a, 0x7a4a9a, 0x4a7a3a, 0xd8d8d8, 0x2e4a7a];

export function createPedestrians(G) {
  const rng = G.rng;
  const peds = {
    list: [],

    // A simple box person: torso, head, legs, a coloured shirt.
    makePed(x, z) {
      const group = new THREE.Group();
      const shirt = new THREE.MeshLambertMaterial({ color: SHIRTS[Math.floor(rng() * SHIRTS.length)] });
      const skin = new THREE.MeshLambertMaterial({ color: [0xd8a878, 0x8a5a38, 0xe8c8a0][Math.floor(rng() * 3)] });
      const pants = new THREE.MeshLambertMaterial({ color: 0x2a2a30 });
      const torso = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.72, 0.34), shirt);
      torso.position.y = 1.1;
      group.add(torso);
      const head = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.4, 0.4), skin);
      head.position.y = 1.7;
      group.add(head);
      for (const sx of [-0.15, 0.15]) {
        const leg = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.68, 0.24), pants);
        leg.position.set(sx, 0.36, 0);
        group.add(leg);
      }
      group.position.set(x, 0, z);
      G.scene.add(group);
      const ped = {
        mesh: group,
        x,
        z,
        heading: rng() * Math.PI * 2,
        speed: PED_WALK_SPEED * (0.8 + rng() * 0.4),
        fleeT: 0,
        walkT: 0,
      };
      this.list.push(ped);
      return ped;
    },

    // Spawn the starting crowd on sidewalks across the city.
    spawnCrowd() {
      for (let i = 0; i < PED_COUNT; i++) {
        const street = Math.floor(rng() * 9 - 4) * 52;
        const along = (rng() * 2 - 1) * 230;
        const side = (rng() < 0.5 ? 1 : -1) * 8.5;
        if (rng() < 0.5) {
          this.makePed(along, street + side);
        } else {
          this.makePed(street + side, along);
        }
      }
      G.pedsList = this.list;
    },

    // Spawn one ped right next to a point (the wanted test's witness).
    spawnNear(x, z) {
      return this.makePed(x + (rng() - 0.5) * 2, z + (rng() - 0.5) * 2);
    },

    // Spawn one ped ahead of the player, in the direction he faces, at
    // the given distance (the combat tests' target).
    spawnAhead(dist) {
      const h = G.player.heading;
      const x = G.player.x + Math.sin(h) * dist;
      const z = G.player.z + Math.cos(h) * dist;
      return this.makePed(x, z);
    },

    // Remove a ped from the world (felled by a punch or a shot).
    remove(ped) {
      G.scene.remove(ped.mesh);
      const i = this.list.indexOf(ped);
      if (i >= 0) this.list.splice(i, 1);
    },

    // The nearest ped to a point, with its distance.
    nearest(x, z, maxD) {
      let best = null;
      let bestD = maxD || Infinity;
      for (const ped of this.list) {
        const d = Math.hypot(ped.x - x, ped.z - z);
        if (d < bestD) {
          bestD = d;
          best = ped;
        }
      }
      return best ? { ped: best, dist: bestD } : null;
    },

    // A gunshot threat: every ped within 16 m flees for 1.5 sim-seconds.
    scare(x, z) {
      for (const ped of this.list) {
        if (Math.hypot(ped.x - x, ped.z - z) < FLEE_RANGE) {
          ped.fleeT = FLEE_TIME;
        }
      }
    },

    // One fixed step: wander along the sidewalks, flee when scared.
    update(dt) {
      for (const ped of this.list) {
        let speed = ped.speed;
        let heading = ped.heading;
        if (ped.fleeT > 0) {
          ped.fleeT -= dt;
          speed = PED_FLEE_SPEED;
          // Run away from the player.
          heading = Math.atan2(ped.x - G.player.x, ped.z - G.player.z);
        } else {
          ped.walkT -= dt;
          if (ped.walkT <= 0) {
            ped.walkT = 2 + rng() * 4;
            // Pick a new heading: mostly along a street, sometimes a turn.
            const axis = rng() < 0.5 ? 0 : Math.PI / 2;
            heading = axis + (rng() < 0.5 ? 0 : Math.PI) + (rng() - 0.5) * 0.4;
          }
        }
        ped.heading = heading;
        ped.x += Math.sin(heading) * speed * dt;
        ped.z += Math.cos(heading) * speed * dt;
        // Stay on the island: city streets plus the beach (z <= 308).
        ped.x = Math.max(-264, Math.min(264, ped.x));
        ped.z = Math.max(-264, Math.min(306, ped.z));
        ped.mesh.position.set(ped.x, 0, ped.z);
        ped.mesh.rotation.y = heading;
      }
    },
  };

  return peds;
}

// Solmar Bay 3D — traffic, police, taxi, parked cars (v5, from the brief).
// 14 AI traffic cars cruise the grid (lane following, intersection turns).
// Police interceptors chase the player when wanted. Parked cars (incl. 2-3
// luxury cars on the curb) are stealable. The yellow taxi runs fares.
// Staged cars (parkSpots) sit frozen for the cover shot.

import * as THREE from '../vendor/three.module.min.js';
import { STREETS, PITCH, ROAD_HALF, TRAFFIC_COLORS, POLICE, ENGINE, COMET } from './config.js';
import { makeRng, pick, range, clamp, dist, headingToDir, turnToward, angleDiff } from './util.js';
import { makeCar } from './vehicles.js';

// Staged cover-shot spots: 5 separate cars ahead of the Comet on the x=0 road.
export const PARK_SPOTS = [[-3.5, 58], [7, 24], [0, 72], [-6, 40], [5, 90]];

export class Traffic {
  constructor(scene, cityBoxes, rng) {
    this.scene = scene;
    this.boxes = cityBoxes;
    this.rng = rng;
    this.cars = []; // AI traffic { group, wheels, x, z, heading, speed, model, color, lane, isTaxi, staged, police }
    this.police = []; // police interceptors chasing the player
    this.parked = []; // stealable parked cars { group, wheels, x, z, heading, model, color, length, taken }
    this.taxi = null; // the taxi car object
    this.taxiState = 'idle'; // idle | toPickup | toDrop
    this.taxiFare = null; // {x,z} marker
    this._buildTraffic();
    this._buildParked();
  }

  _laneFor(street, dir) {
    // Right-hand traffic: lane offset +3.5 or -3.5 from the centre line.
    return street + (dir > 0 ? 3.5 : -3.5);
  }

  _buildTraffic() {
    // 14 AI cars on the grid, each on a street, driving a lane.
    const models = ['Coupe', 'Sport', 'Van', 'Sedan', 'Hatch'];
    for (let i = 0; i < 14; i++) {
      const horizontal = this.rng() < 0.5;
      const street = pick(this.rng, STREETS);
      const dir = this.rng() < 0.5 ? 1 : -1;
      const lane = this._laneFor(street, dir);
      const along = range(this.rng, -150, 150);
      const x = horizontal ? along : lane;
      const z = horizontal ? lane : along;
      const heading = horizontal ? (dir > 0 ? Math.PI / 2 : -Math.PI / 2) : (dir > 0 ? 0 : Math.PI);
      const model = models[i % models.length];
      const color = TRAFFIC_COLORS.find((c) => c.name === model)?.color ?? 0xd82828;
      const isVan = model === 'Van';
      const made = makeCar({ color, isVan, sport: model === 'Sport' });
      made.group.position.set(x, 0.02, z);
      made.group.rotation.y = heading;
      this.scene.add(made.group);
      this.cars.push({
        ...made, x, z, heading, speed: range(this.rng, 8, 12),
        model, color, horizontal, street, dir, isTaxi: false, staged: false, police: false,
        turnCooldown: 0,
      });
    }
    // The taxi: one yellow cab that runs fares.
    const tx = this._spawnOne('Taxi', 0xf8c828, false, true);
    this.taxi = tx;
    this.cars.push(tx);
  }

  _spawnOne(model, color, isVan, isTaxi) {
    const horizontal = this.rng() < 0.5;
    const street = pick(this.rng, STREETS);
    const dir = this.rng() < 0.5 ? 1 : -1;
    const lane = this._laneFor(street, dir);
    const along = range(this.rng, -150, 150);
    const x = horizontal ? along : lane;
    const z = horizontal ? lane : along;
    const heading = horizontal ? (dir > 0 ? Math.PI / 2 : -Math.PI / 2) : (dir > 0 ? 0 : Math.PI);
    const made = makeCar({ color, isVan, isTaxi });
    made.group.position.set(x, 0.02, z);
    made.group.rotation.y = heading;
    this.scene.add(made.group);
    return { ...made, x, z, heading, speed: range(this.rng, 8, 12), model, color, horizontal, street, dir, isTaxi: !!isTaxi, staged: false, police: false, turnCooldown: 0 };
  }

  _buildParked() {
    // Parked cars (stealable). They sit on the SIDEWALK lines (x = +/-11.5)
    // just off the road — clear of the traffic lanes (no AI car passes
    // through them) and clear of buildings (the strip between the road and
    // the block fronts is building-free), facing north along the sidewalk
    // so driving out of the spot is a clean run. The first entry is
    // Dante's own green Comet — stealing your own car never raises heat.
    const spots = [
      { x: 11.5, z: -6, heading: 0, model: 'Comet', color: COMET.body, comet: true },
      { x: -11.5, z: 14, heading: 0, model: 'Sedan', color: 0x28408a },
      { x: 11.5, z: -30, heading: 0, model: 'Coupe', color: 0xd82828 },
      { x: -11.5, z: -50, heading: 0, model: 'Hatch', color: 0xe8a028 },
      { x: 11.5, z: 30, heading: 0, model: 'Sport', color: 0x189098 },
      // Luxury curb cars (white / black / red, chrome trim) — on roads.
      { x: 11.5, z: 52, heading: Math.PI / 2, model: 'Luxury', color: 0xf0f0f0, luxury: true },
      { x: 52, z: 11.5, heading: 0, model: 'Luxury', color: 0x14141a, luxury: true },
      { x: -11.5, z: -52, heading: Math.PI / 2, model: 'Luxury', color: 0xb02020, luxury: true },
    ];
    for (const s of spots) {
      const made = makeCar({ color: s.color, luxury: !!s.luxury, sport: s.model === 'Sport', comet: !!s.comet });
      const heading = s.heading ?? (Math.abs(s.x) > 10 ? 0 : Math.PI / 2);
      made.group.position.set(s.x, 0.02, s.z);
      made.group.rotation.y = heading;
      this.scene.add(made.group);
      this.parked.push({ ...made, x: s.x, z: s.z, heading, speed: 0, model: s.model, color: s.color, taken: false });
    }
  }

  // Staged cars for the cover shot: frozen, skipped by the chase loop.
  stageCars() {
    const staged = [];
    const defs = [
      { x: -3.5, z: 58, model: 'Coupe', color: 0xd82828 },
      { x: 7, z: 24, model: 'Sport', color: 0x189098 },
      { x: 0, z: 72, model: 'Van', color: 0x9a9a9a },
      { x: -6, z: 40, model: 'Sedan', color: 0x28408a },
      { x: 5, z: 90, model: 'Hatch', color: 0xe8a028 },
    ];
    for (const d of defs) {
      const made = makeCar({ color: d.color, isVan: d.model === 'Van', sport: d.model === 'Sport' });
      made.group.position.set(d.x, 0.02, d.z);
      made.group.rotation.y = 0; // facing north, same as the Comet
      this.scene.add(made.group);
      const car = { ...made, x: d.x, z: d.z, heading: 0, speed: 0, model: d.model, color: d.color, staged: true, police: false };
      this.cars.push(car);
      staged.push(car);
    }
    return staged;
  }

  // --- police ---------------------------------------------------------------
  spawnPolice(x, z) {
    const made = makeCar({ color: POLICE.body, isPolice: true, sport: true });
    made.group.position.set(x, 0.02, z);
    const heading = Math.atan2(-x, -z);
    made.group.rotation.y = heading;
    this.scene.add(made.group);
    const car = { ...made, x, z, heading, speed: 0, model: 'Police', color: POLICE.body, staged: false, police: true };
    this.police.push(car);
    return car;
  }
  removePolice(car) {
    this.scene.remove(car.group);
    this.police = this.police.filter((p) => p !== car);
  }
  policeCount() { return this.police.length; }

  // --- per-frame update -------------------------------------------------------
  update(dt, playerPos, playerInCar, wanted) {
    // Traffic cruise.
    for (const c of this.cars) {
      if (c.staged) continue;
      if (c.taken) continue; // stolen by the player (driven by player.js)
      this._driveTraffic(c, dt, playerPos, playerInCar);
    }
    // Police chase.
    for (const p of [...this.police]) {
      this._chase(p, dt, playerPos);
    }
    // Taxi fare logic.
    this._updateTaxi(dt, playerPos, playerInCar);
  }

  _driveTraffic(c, dt, playerPos, playerInCar) {
    // Cruise along the current street; at an intersection, sometimes turn.
    // The cab pulls over for a passenger on foot: if Dante is on foot
    // within 12 m, the taxi stops so it can actually be entered — a moving
    // cab outruns the enter check between CDP round-trips.
    let speed = c.speed;
    if (c.isTaxi && !playerInCar && playerPos && dist(c.x, c.z, playerPos.x, playerPos.z) < 12) {
      speed = 0;
    }
    const d = headingToDir(c.heading);
    let nx = c.x + d.x * speed * dt;
    let nz = c.z + d.z * speed * dt;
    // Intersection check: near a crossing street centre?
    c.turnCooldown -= dt;
    const nearX = STREETS.some((s) => Math.abs(nx - s) < 2.5);
    const nearZ = STREETS.some((s) => Math.abs(nz - s) < 2.5);
    if (c.turnCooldown <= 0 && ((c.horizontal && nearX) || (!c.horizontal && nearZ))) {
      if (this.rng() < 0.45) {
        // Turn 90 degrees.
        const turn = this.rng() < 0.5 ? Math.PI / 2 : -Math.PI / 2;
        c.heading += turn;
        c.horizontal = !c.horizontal;
        c.turnCooldown = 4;
        // Snap onto the new lane.
        if (c.horizontal) { c.z = this._laneFor(c.z, Math.cos(c.heading) > 0 ? 1 : -1); }
        else { c.x = this._laneFor(c.x, Math.sin(c.heading) > 0 ? 1 : -1); }
      } else {
        c.turnCooldown = 2;
      }
    }
    // Wrap around the city edge (loop the traffic).
    if (nx > 200) nx = -200; if (nx < -200) nx = 200;
    if (nz > 200) nz = -200; if (nz < -200) nz = 200;
    c.x = nx; c.z = nz;
    c.group.position.set(c.x, 0.02, c.z);
    c.group.rotation.y = c.heading;
    const spin = (speed * dt) / 0.42;
    for (const w of c.wheels) w.rotation.x += spin;
  }

  _chase(p, dt, playerPos) {
    const target = Math.atan2(playerPos.x - p.x, playerPos.z - p.z);
    p.heading = turnToward(p.heading, target, 2.2 * dt);
    p.speed = Math.min(p.speed + 12 * dt, ENGINE.policeTopSpeed);
    const d = headingToDir(p.heading);
    p.x += d.x * p.speed * dt;
    p.z += d.z * p.speed * dt;
    p.group.position.set(p.x, 0.02, p.z);
    p.group.rotation.y = p.heading;
    const spin = (p.speed * dt) / 0.42;
    for (const w of p.wheels) w.rotation.x += spin;
  }

  // The taxi fare state machine lives in main.js (it owns the player and
  // the money). Traffic only drives the cab around until it is taken.
  _updateTaxi(dt, playerPos, playerInCar) {}

  // Nearest stealable car (parked or traffic) to a point — a pure nearest
  // search over both lists. (An earlier version preferred parked cars and
  // only fell back to traffic beyond 30 m; that broke the taxi test: the
  // player teleports onto the cab, but a parked car 12 m away won the
  // search and the 4.5 m enter check then failed.)
  nearestCarPos(x, z) {
    const c = this.nearestCar(x, z);
    if (!c) return null;
    return { model: c.model, x: c.x, z: c.z };
  }
  nearestCar(x, z) {
    let best = null, bd = Infinity;
    const consider = (c) => {
      if (c.taken || c.staged || c.police) return;
      const d = dist(x, z, c.x, c.z);
      if (d < bd) { bd = d; best = c; }
    };
    for (const c of this.parked) consider(c);
    for (const c of this.cars) consider(c);
    return best;
  }
}

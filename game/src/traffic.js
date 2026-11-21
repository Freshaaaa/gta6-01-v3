// Solmar Bay 3D — traffic: AI cars driving the lane graph, car-following,
// intersection turns, despawn/respawn near the player. Written fresh for the
// gta6-01 3D rebuild (branch v12-3d, systems build).
import * as THREE from 'three';
import { Vehicle, MODELS } from './vehicles.js';
import { PITCH, CITY_R, ROAD_HALF } from './city.js';
import { mulberry32 } from './engine.js';

const LANE = 2.2; // right-hand lane offset from the road centre line

function headingFrom(axis, dir) {
  if (axis === 'z') return dir > 0 ? 0 : Math.PI;
  return dir > 0 ? Math.PI / 2 : -Math.PI / 2;
}

const TRAFFIC_COLORS = [0xb8bcc4, 0x8a94a8, 0xd8d0c0, 0x5a7a8a, 0xa88a5a, 0x7a5a8a, 0x4a6a4a, 0xc8c8c8];

export class Traffic {
  constructor(scene, city, seed = 31) {
    this.scene = scene;
    this.city = city;
    this.rng = mulberry32(seed);
    this.cars = []; // {car, axis, dir, road, speed, targetSpeed, disabled}
    this.keys = Object.keys(MODELS).filter((k) => k !== 'taxi');
    for (let i = 0; i < 14; i++) this.spawnCar(true);
  }

  randomRoad() {
    return (Math.floor(this.rng() * (CITY_R * 2 + 1)) - CITY_R) * PITCH;
  }

  placeOnRoad(tc, nearX = 0, nearZ = 0) {
    const axis = this.rng() < 0.5 ? 'x' : 'z';
    const dir = this.rng() < 0.5 ? 1 : -1;
    const road = this.randomRoad();
    const along = (this.rng() - 0.5) * 520;
    tc.axis = axis; tc.dir = dir; tc.road = road;
    if (axis === 'z') { tc.car.x = road + (dir > 0 ? -LANE : LANE); tc.car.z = along; }
    else { tc.car.x = along; tc.car.z = road + (dir > 0 ? LANE : -LANE); }
    tc.car.heading = headingFrom(axis, dir);
    tc.car.speed = 0;
    tc.car.group.position.set(tc.car.x, 0, tc.car.z);
    tc.car.group.rotation.y = tc.car.heading;
    tc.lastTurnAt = null;
  }

  spawnCar(anywhere) {
    const key = this.keys[Math.floor(this.rng() * this.keys.length)];
    const color = TRAFFIC_COLORS[Math.floor(this.rng() * TRAFFIC_COLORS.length)];
    const car = new Vehicle(this.scene, key, 0, 0, 0, color);
    car.traffic = true;
    const tc = { car, axis: 'z', dir: 1, road: 0, speed: 0, targetSpeed: 9 + this.rng() * 5, disabled: false, lastTurnAt: null, turnCooldown: 0 };
    this.placeOnRoad(tc);
    this.cars.push(tc);
    return tc;
  }

  // A car ahead in the same lane within `dist` metres (or null).
  carAhead(tc, dist) {
    let best = null, bd = dist;
    for (const o of this.cars) {
      if (o === tc || o.axis !== tc.axis || o.road !== tc.road || o.dir !== tc.dir) continue;
      const d = tc.axis === 'z' ? (o.car.z - tc.car.z) * tc.dir : (o.car.x - tc.car.x) * tc.dir;
      if (d > 0 && d < bd) { bd = d; best = o; }
    }
    return best;
  }

  // Try to turn at an intersection. `along` is the moving coordinate.
  maybeTurn(tc, along) {
    if (tc.turnCooldown > 0) return;
    const nearest = Math.round(along / PITCH) * PITCH;
    if (Math.abs(along - nearest) > 3) return;
    if (tc.lastTurnAt === nearest && tc.axis === tc.lastAxis) return;
    tc.lastTurnAt = nearest; tc.lastAxis = tc.axis;
    if (this.rng() > 0.3) return; // 70% go straight
    tc.turnCooldown = 2.0; // don't roll again at the same corner
    const left = this.rng() < 0.5;
    // Turn onto the cross road: the cross road's line is `nearest`.
    const newAxis = tc.axis === 'z' ? 'x' : 'z';
    let newDir;
    if (tc.axis === 'z') newDir = (tc.dir > 0) === left ? 1 : -1; // facing +z: left is +x
    else newDir = (tc.dir > 0) === left ? -1 : 1; // facing +x: left is -z
    // Snap onto the new lane.
    if (newAxis === 'x') { tc.car.z = nearest + (newDir > 0 ? LANE : -LANE); }
    else { tc.car.x = nearest + (newDir > 0 ? -LANE : LANE); }
    tc.axis = newAxis; tc.dir = newDir; tc.road = nearest;
    tc.car.heading = headingFrom(newAxis, newDir);
    tc.car.group.rotation.y = tc.car.heading;
  }

  update(dt, ctx) {
    const px = ctx.px, pz = ctx.pz;
    const driven = ctx.drivenCar || null;
    for (const tc of this.cars) {
      const car = tc.car;
      if (tc.disabled) continue;
      if (tc.turnCooldown > 0) tc.turnCooldown -= dt;
      // Respawn far-away cars near the player so the streets stay alive.
      const dPlayer = Math.hypot(car.x - px, car.z - pz);
      if (dPlayer > 220) { this.placeOnRoad(tc); continue; }
      // Turn at intersections.
      const along = tc.axis === 'z' ? car.z : car.x;
      this.maybeTurn(tc, along);
      // Car-following: slow/stop for a car ahead, or for the player's car.
      let target = tc.targetSpeed;
      const ahead = this.carAhead(tc, 12);
      if (ahead) {
        const gap = tc.axis === 'z' ? Math.abs(ahead.car.z - car.z) : Math.abs(ahead.car.x - car.x);
        if (gap < 6) target = 0;
        else if (gap < 12) target = Math.min(target, ahead.car.speed * 0.9);
      }
      if (driven) {
        const dx = driven.x - car.x, dz = driven.z - car.z;
        const dist = Math.hypot(dx, dz);
        if (dist < 8) {
          // Is the player car ahead of us (in our driving direction)?
          const fx = Math.sin(car.heading), fz = Math.cos(car.heading);
          const dot = (dx * fx + dz * fz) / Math.max(dist, 0.01);
          if (dot > 0.5 && dist < 7) target = 0;
        }
      }
      // Throttle toward the target speed.
      let throttle = 0;
      if (car.speed < target - 0.5) throttle = 0.8;
      else if (car.speed > target + 0.5) throttle = -0.9;
      car.update(dt, { throttle, steer: 0, handbrake: false }, this.city);
      // Keep the lane offset exact (the physics only moves forward).
      if (tc.axis === 'z') car.x = tc.road + (tc.dir > 0 ? -LANE : LANE);
      else car.z = tc.road + (tc.dir > 0 ? LANE : -LANE);
      car.group.position.set(car.x, 0, car.z);
      // Wrap at the city edge instead of driving into the sea/desert.
      if (Math.abs(car.x) > 285 || Math.abs(car.z) > 285) this.placeOnRoad(tc);
    }
  }

  // Shooting a traffic car disables it (driver bails). Returns the car or null.
  damageCar(car, amount) {
    const tc = this.cars.find((t) => t.car === car);
    if (!tc || tc.disabled) return null;
    tc.disabled = true;
    tc.car.speed = 0;
    return car;
  }

  nearestTrafficCar(x, z, maxDist) {
    let best = null, bd = maxDist;
    for (const tc of this.cars) {
      if (tc.disabled) continue;
      const d = Math.hypot(tc.car.x - x, tc.car.z - z);
      if (d < bd) { bd = d; best = tc.car; }
    }
    return best;
  }

  get count() { return this.cars.filter((t) => !t.disabled).length; }
}

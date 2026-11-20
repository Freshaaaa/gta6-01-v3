// v16 clean re-record (01a1f6c1-0eeb-7191-b67c-e5c3196775d3).
// v16: sand and off-road cost acceleration and loosen the slide (surface grip).
// Solmar Bay 3D — arcade car physics. A bicycle model per car, integrated
// at 60 Hz: engine force along the heading, lateral grip that bleeds the
// slide away (loosened by the handbrake or by hard steering at speed, which
// is the drift), and yaw from the front axle. Cars collide as two circles
// (front and rear axle) against building AABBs and against each other, so
// a car can scrape a wall and keep going instead of sticking to it.
//
// Forward = (sin yaw, 0, cos yaw); right = (-cos yaw, 0, sin yaw).

import { WORLD_SIZE } from './config.js';
import { surfaceAt } from './city.js';
import { clamp, lerp } from './rng.js';

/**
 * Integrate one car for dt seconds.
 * car: {x, z, yaw, vF, vL, steer, model, throttle, steerIn, handbrake, hp, state}
 * slick: 1 = dry, >1 = rain/storm multiplier on slide and braking.
 * Returns nothing; mutates the car (also sets car.speed, car.drifting, car.slip).
 */
export function stepCar(car, dt, slick) {
  const m = car.model;
  // Mara's driving (v13): when the crew driver rides along, the
  // player's car is faster and turns sharper. The flag lives on the
  // car (set by updateCars); police and traffic never get it.
  const boost = car.crewBoost ? 1.1 : 1;
  const turnBoost = car.crewBoost ? 1.15 : 1;
  const maxSpeed = 42 * m.maxSpeed * boost;
  // Surface grip (v16): sand and off-road cost acceleration and loosen
  // the slide, so the beach drive feels different from the asphalt —
  // the same surfaceAt the HUD grip readout uses. Boats skip it: the
  // water is their element.
  const surface = car.isBoat ? 'water' : surfaceAt(car.x, car.z);
  const surfFactor = car.isBoat ? 1 : surface === 'sand' ? 0.75 : surface === 'offroad' ? 0.9 : 1;
  const gripBase = car.isBoat ? 11 : surface === 'sand' ? 7 : 11;
  const accel = 9.5 * m.accel * surfFactor;
  const steerMax = 0.62 * (1 - 0.45 * clamp(Math.abs(car.vF) / maxSpeed, 0, 1)) * m.turn * turnBoost;

  // Steering eases toward the input; faster at low speed, lazier at speed.
  const steerRate = 6 * (1 - 0.35 * clamp(Math.abs(car.vF) / maxSpeed, 0, 1));
  car.steer += clamp(car.steerIn * steerMax - car.steer, -steerRate * dt, steerRate * dt);

  // Longitudinal force.
  const throttle = car.throttle;
  if (throttle > 0) {
    const nearTop = clamp(1 - car.vF / maxSpeed, 0, 1);
    car.vF += throttle * accel * (0.25 + 0.75 * nearTop) * dt;
  } else if (throttle < 0) {
    if (car.vF > 0.5) {
      car.vF -= 16 * slick * dt * -throttle; // braking (longer on slick roads)
    } else {
      car.vF += throttle * 6 * m.accel * dt; // reverse
    }
  }
  // Drag + rolling resistance.
  car.vF -= car.vF * (0.35 + 0.0016 * Math.abs(car.vF)) * dt;
  car.vF = clamp(car.vF, -9, maxSpeed);

  // Lateral grip: the slide bleeds away; handbrake or hard steering at
  // speed loosens it into a drift.
  const speedRatio = clamp(Math.abs(car.vF) / maxSpeed, 0, 1);
  const wantDrift = car.handbrake || (Math.abs(car.steerIn) > 0.85 && speedRatio > 0.55 && Math.abs(car.vF) > 14);
  const grip = wantDrift ? 2.2 * (slick > 1 ? 0.75 : 1) : gripBase;
  car.vL *= Math.max(0, 1 - grip * dt);
  if (wantDrift) {
    // Slide builds from steering while drifting.
    car.vL += car.steerIn * Math.abs(car.vF) * 1.6 * dt * (slick > 1 ? 1.3 : 1);
    car.vL = clamp(car.vL, -12, 12);
  }
  car.drifting = wantDrift && Math.abs(car.vL) > 3;
  car.slip = Math.abs(car.vL);

  // Yaw from the front axle; drifting swings the nose a little wider.
  const wheelbase = m.len * 0.55;
  let yawRate = (car.vF / wheelbase) * Math.tan(car.steer);
  if (car.drifting) yawRate *= 1.35;
  car.yaw += yawRate * dt;

  // Move: forward + lateral.
  const fx = Math.sin(car.yaw);
  const fz = Math.cos(car.yaw);
  const rx = -fz;
  const rz = fx;
  car.x += (fx * car.vF + rx * car.vL) * dt;
  car.z += (fz * car.vF + rz * car.vL) * dt;

  // Soft world boundary.
  const margin = 4;
  if (car.x < margin) { car.x = margin; car.vF *= 0.5; }
  if (car.x > WORLD_SIZE - margin) { car.x = WORLD_SIZE - margin; car.vF *= 0.5; }
  if (car.z < margin) { car.z = margin; car.vF *= 0.5; }
  if (car.z > WORLD_SIZE - margin) { car.z = WORLD_SIZE - margin; car.vF *= 0.5; }

  car.speed = Math.hypot(car.vF, car.vL);
}

/** Axle circle centres for a car (front and rear), for collision. */
export function carAxles(car) {
  const fx = Math.sin(car.yaw);
  const fz = Math.cos(car.yaw);
  const half = car.model.len * 0.32;
  return [
    { x: car.x + fx * half, z: car.z + fz * half },
    { x: car.x - fx * half, z: car.z - fz * half },
  ];
}

/**
 * Resolve a car against building AABBs (two axle circles vs boxes).
 * Returns the strongest impact speed this step (0 when nothing hit).
 */
export function collideCarBuildings(city, car) {
  let impact = 0;
  const axles = carAxles(car);
  const r = car.model.wid * 0.55 + 0.15;
  const fx = Math.sin(car.yaw);
  const fz = Math.cos(car.yaw);
  for (const a of axles) {
    for (const b of city.buildings) {
      const hw = b.w / 2;
      const hd = b.d / 2;
      const cx = clamp(a.x, b.x - hw, b.x + hw);
      const cz = clamp(a.z, b.z - hd, b.z + hd);
      let dx = a.x - cx;
      let dz = a.z - cz;
      let d2 = dx * dx + dz * dz;
      if (d2 >= r * r) continue;
      let nx;
      let nz;
      let depth;
      if (d2 > 1e-6) {
        const d = Math.sqrt(d2);
        nx = dx / d;
        nz = dz / d;
        depth = r - d;
      } else {
        const px = hw + r - Math.abs(a.x - b.x);
        const pz = hd + r - Math.abs(a.z - b.z);
        if (px < pz) { nx = a.x >= b.x ? 1 : -1; nz = 0; depth = px; }
        else { nx = 0; nz = a.z >= b.z ? 1 : -1; depth = pz; }
      }
      // Push the whole car out along the normal.
      car.x += nx * depth;
      car.z += nz * depth;
      // Kill the velocity component into the wall, keep the tangential one.
      const vnx = fx * car.vF + (-fz) * car.vL;
      const vnz = fz * car.vF + fx * car.vL;
      const vn = vnx * nx + vnz * nz;
      if (vn < 0) {
        impact = Math.max(impact, -vn);
        const bounce = -vn * 1.25;
        const tx = vnx - vn * nx;
        const tz = vnz - vn * nz;
        const vnx2 = tx + nx * bounce * 0.25;
        const vnz2 = tz + nz * bounce * 0.25;
        // Back to (vF, vL): vF = v·fwd, vL = v·right.
        car.vF = vnx2 * fx + vnz2 * fz;
        car.vL = vnx2 * (-fz) + vnz2 * fx;
        car.vF *= 0.92;
        car.vL *= 0.7;
      }
      // Recompute the axle after the push-out so the second axle uses
      // the corrected position.
      const ax2 = carAxles(car);
      a.x = ax2[axles.indexOf(a)].x;
      a.z = ax2[axles.indexOf(a)].z;
    }
  }
  return impact;
}

/**
 * Resolve two cars (circle-circle on their axle circles). Returns the
 * impact speed, or 0. Heavier cars (more hp) push lighter ones more.
 */
export function collideCars(a, b) {
  let impact = 0;
  const aa = carAxles(a);
  const bb = carAxles(b);
  const ra = a.model.wid * 0.55 + 0.15;
  const rb = b.model.wid * 0.55 + 0.15;
  const ma = a.model.hp;
  const mb = b.model.hp;
  for (const p of aa) {
    for (const q of bb) {
      const dx = q.x - p.x;
      const dz = q.z - p.z;
      const d2 = dx * dx + dz * dz;
      const rr = ra + rb;
      if (d2 >= rr * rr || d2 < 1e-9) continue;
      const d = Math.sqrt(d2);
      const nx = dx / d;
      const nz = dz / d;
      const depth = rr - d;
      const total = ma + mb;
      a.x -= nx * depth * (mb / total);
      a.z -= nz * depth * (mb / total);
      b.x += nx * depth * (ma / total);
      b.z += nz * depth * (ma / total);
      // Exchange the normal component of velocity.
      const avx = Math.sin(a.yaw) * a.vF + (-Math.cos(a.yaw)) * a.vL;
      const avz = Math.cos(a.yaw) * a.vF + Math.sin(a.yaw) * a.vL;
      const bvx = Math.sin(b.yaw) * b.vF + (-Math.cos(b.yaw)) * b.vL;
      const bvz = Math.cos(b.yaw) * b.vF + Math.sin(b.yaw) * b.vL;
      const rvn = (bvx - avx) * nx + (bvz - avz) * nz;
      if (rvn < 0) {
        impact = Math.max(impact, -rvn);
        const imp = -(1 + 0.3) * rvn / 2;
        const avx2 = avx - imp * nx * (mb / total) * 2;
        const avz2 = avz - imp * nz * (mb / total) * 2;
        const bvx2 = bvx + imp * nx * (ma / total) * 2;
        const bvz2 = bvz + imp * nz * (ma / total) * 2;
        a.vF = avx2 * Math.sin(a.yaw) + avz2 * Math.cos(a.yaw);
        a.vL = avx2 * (-Math.cos(a.yaw)) + avz2 * Math.sin(a.yaw);
        b.vF = bvx2 * Math.sin(b.yaw) + bvz2 * Math.cos(b.yaw);
        b.vL = bvx2 * (-Math.cos(b.yaw)) + bvz2 * Math.sin(b.yaw);
      }
    }
  }
  return impact;
}

/** Push a foot circle (x, z, r) out of buildings; returns corrected {x, z, hit}. */
export function collideFootBuildings(city, x, z, r) {
  let hit = false;
  for (const b of city.buildings) {
    const hw = b.w / 2;
    const hd = b.d / 2;
    const cx = clamp(x, b.x - hw, b.x + hw);
    const cz = clamp(z, b.z - hd, b.z + hd);
    const dx = x - cx;
    const dz = z - cz;
    const d2 = dx * dx + dz * dz;
    if (d2 >= r * r) continue;
    hit = true;
    if (d2 > 1e-6) {
      const d = Math.sqrt(d2);
      const push = (r - d) / d;
      x += dx * push;
      z += dz * push;
    } else {
      const px = hw + r - Math.abs(x - b.x);
      const pz = hd + r - Math.abs(z - b.z);
      if (px < pz) x += (x >= b.x ? px : -px);
      else z += (z >= b.z ? pz : -pz);
    }
  }
  return { x, z, hit };
}

export { lerp };

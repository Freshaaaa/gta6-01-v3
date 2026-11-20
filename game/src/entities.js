// v15 clean re-record (01a1f673).
// Solmar Bay 3D — the living city. Factories for the player, cars,
// pedestrians and goons, plus the per-population updates: traffic
// following the lane graph, pedestrians walking and fleeing, goons hunting
// the player, hitscan shooting resolving against buildings and bodies,
// and the particle / tracer / skid bookkeeping the board reads every
// frame. Police inputs are set by police.js; this file integrates every
// car and resolves every collision.

import {
  BOAT_MODELS, CAR_MODELS, PED_PANTS, PED_SHIRTS, PED_SKINS, PLAYER_MAX_HEALTH,
  PLAYER_RADIUS, PLAYER_RUN_SPEED, PLAYER_WALK_SPEED, PED_TOPUP_MIN, SHORE_Z,
  WATER_Z_MAX, WATER_Z_MIN, crewUnlocked,
  ROAD_WIDTH, WEAPONS, WORLD_SIZE,
} from './config.js';
import { collideCarBuildings, collideCars, collideFootBuildings, stepCar } from './physics.js';
import { collideCircleBuildings, isOnRoad, lanePoint, nearestLane, roadLines, segmentBlocked } from './city.js';
import { clamp, dist2, lerpAngle, pick, rand, randInt, yawFromDir } from './rng.js';
import { sfxCrash, sfxExplosion, sfxHit, sfxShoot, sfxSkid } from './audio.js';

let carId = 0;

export function createPlayer(x, z) {
  return {
    x, z, yaw: Math.PI, onFoot: true, car: null, boat: null, health: PLAYER_MAX_HEALTH,
    walkPhase: 0, moving: false, speed: 0, aimX: x, aimZ: z + 5,
    firing: false, fireCooldown: 0, weapon: 'pistol', ammo: { pistol: Infinity, smg: 0, shotgun: 0, rifle: 0, ar9: 0, breaker: 0 },
    weaponsOwned: ['pistol'], money: 0, rep: 0, armour: 0, punchCooldown: 0,
    mouseMovedAt: -10, bustedTimer: 0,
  };
}

export function modelByName(name) {
  return CAR_MODELS.find((m) => m.name === name) || CAR_MODELS[1];
}

export function spawnCar(state, modelName, x, z, yaw, opts = {}) {
  const model = typeof modelName === 'string' ? modelByName(modelName) : modelName;
  const car = {
    id: ++carId,
    model, x, z, yaw, vF: 0, vL: 0, steer: 0, steerIn: 0, throttle: 0,
    handbrake: false, hp: opts.hp || model.hp, maxHp: model.hp,
    state: opts.state || 'parked', police: !!opts.police, taxi: !!model.taxi,
    lane: -1, laneT: 0, cruise: 0, stuckTimer: 0, driverFled: false,
    speed: 0, drifting: false, slip: 0, wheelSpin: 0, accelVis: 0,
    burnTimer: 0, smokeTimer: 0, engine: opts.engine || 0, armor: 0,
    color: opts.color || model.color, removed: false, stoppedTimer: 0,
    lastX: x, lastZ: z,
    // The base model is kept so tuning (v14) never compounds:
    // applyTune recomputes from here, and the garage stores the levels.
    baseModel: model, tune: { engine: opts.engine || 0, armor: 0, wheels: 0 },
  };
  state.cars.push(car);
  return car;
}

export function spawnParkedCars(state, count) {
  const spots = [...state.city.parking];
  for (let i = 0; i < count && spots.length > 0; i++) {
    const spot = spots.splice(Math.floor(Math.random() * spots.length), 1)[0];
    const model = pick(state.rng, CAR_MODELS.filter((m) => !m.taxi && m.name !== 'Hauler'));
    spawnCar(state, model, spot.x, spot.z, spot.yaw, { state: 'parked' });
  }
  // One Aurora is always parked near the Strip for the taking.
  spawnCar(state, 'Aurora', 470, 386, Math.PI / 2, { state: 'parked' });
}

export function spawnTraffic(state, count) {
  for (let i = 0; i < count; i++) {
    const laneIdx = Math.floor(Math.random() * state.city.lanes.length);
    const lane = state.city.lanes[laneIdx];
    const t = rand(state.rng, 0, lane.len);
    const pt = lanePoint(state.city, laneIdx, t);
    const model = pick(state.rng, CAR_MODELS.filter((m) => !m.taxi && m.name !== 'Hauler' && m.name !== 'Aurora'));
    const car = spawnCar(state, model, pt.x, pt.z, yawFromDir(pt.dirX, pt.dirZ), { state: 'traffic' });
    car.lane = laneIdx;
    car.laneT = t;
    car.cruise = rand(state.rng, 8, 13);
  }
}

/** A point on a sidewalk: beside a road centre line, just outside the
 * asphalt (ROAD_WIDTH/2 + 1.5..5 m), so peds are visible from the road
 * instead of hidden inside a block. Seeded via rng — same seed, same spots. */
function sidewalkPoint(rng) {
  const road = roadLines[Math.floor(rand(rng, 0, roadLines.length))];
  const along = rand(rng, 40, WORLD_SIZE - 40);
  const side = rand(rng, 0, 1) < 0.5 ? -1 : 1;
  const off = ROAD_WIDTH / 2 + rand(rng, 1.5, 5);
  const horizontal = rand(rng, 0, 1) < 0.5;
  return horizontal
    ? { x: along, z: clamp(road + side * off, 20, WORLD_SIZE - 20) }
    : { x: clamp(road + side * off, 20, WORLD_SIZE - 20), z: along };
}

function makePed(state, x, z) {
  return {
    x, z, yaw: rand(state.rng, 0, Math.PI * 2), speed: 0, walkPhase: rand(state.rng, 0, 6),
    state: 'wander', targetX: x, targetZ: z, waitTimer: rand(state.rng, 0, 4),
    shirt: pick(state.rng, PED_SHIRTS),
    pants: pick(state.rng, PED_PANTS),
    skin: pick(state.rng, PED_SKINS),
    moving: false, fleeTimer: 0, called: false,
  };
}

export function spawnPeds(state, count) {
  for (let i = 0; i < count; i++) {
    const pt = sidewalkPoint(state.rng);
    state.peds.push(makePed(state, pt.x, pt.z));
  }
}

/** Scene peds for staged screenshots: pedestrians on sidewalks near
 * (cx, cz) (8–40 m away), wandering toward the player's area, so the
 * frame reads as a living street. Constructed on the roads bracketing
 * the player (not sampled city-wide, which almost never lands near
 * the player). Staging only — same ped objects as normal gameplay. */
export function spawnScenePeds(state, count, cx, cz) {
  const cands = [];
  for (const r of roadLines) {
    if (Math.abs(r - cz) < 45) cands.push({ road: r, axis: 'x' }); // horizontal road (constant z)
    if (Math.abs(r - cx) < 45) cands.push({ road: r, axis: 'z' }); // vertical road (constant x)
  }
  if (cands.length === 0) return;
  for (let i = 0; i < count; i++) {
    const c = cands[Math.floor(rand(state.rng, 0, cands.length))];
    const side = rand(state.rng, 0, 1) < 0.5 ? -1 : 1;
    const off = ROAD_WIDTH / 2 + rand(state.rng, 1.5, 5);
    let x, z;
    if (c.axis === 'x') {
      x = clamp(cx + rand(state.rng, -40, 40), 20, WORLD_SIZE - 20);
      z = clamp(c.road + side * off, 20, WORLD_SIZE - 20);
    } else {
      x = clamp(c.road + side * off, 20, WORLD_SIZE - 20);
      z = clamp(cz + rand(state.rng, -40, 40), 20, WORLD_SIZE - 20);
    }
    // Keep a little distance so nobody stands on the player.
    if (Math.hypot(x - cx, z - cz) < 8) continue;
    const ped = makePed(state, x, z);
    // Wander toward the player's area so they stay in frame.
    ped.targetX = clamp(cx + rand(state.rng, -30, 30), 20, WORLD_SIZE - 20);
    ped.targetZ = clamp(cz + rand(state.rng, -30, 30), 20, WORLD_SIZE - 20);
    ped.waitTimer = rand(state.rng, 2, 6);
    state.peds.push(ped);
  }
}

/** Beachgoers for staged screenshots (v15, re-recorded): pedestrians standing and
 * wandering on the sand (z 513–525) near (cx, cz), so the beach reads
 * as crowded from the boat and the beach road — same ped objects as
 * normal gameplay, just placed on the sand instead of a sidewalk. */
export function spawnBeachPeds(state, count, cx, cz) {
  for (let i = 0; i < count; i++) {
    const x = clamp(cx + rand(state.rng, -45, 45), 20, WORLD_SIZE - 20);
    const z = clamp(rand(state.rng, 513, 525), 513, 525);
    if (Math.hypot(x - cx, z - cz) < 6) continue;
    const ped = makePed(state, x, z);
    ped.targetX = clamp(x + rand(state.rng, -12, 12), 20, WORLD_SIZE - 20);
    ped.targetZ = clamp(z + rand(state.rng, -4, 4), 513, 525);
    ped.waitTimer = rand(state.rng, 2, 8);
    state.peds.push(ped);
  }
}

export function spawnGoon(state, x, z) {
  const goon = {
    x, z, yaw: 0, speed: 0, walkPhase: 0, hp: 50, state: 'hunt',
    shirt: '#2c3e50', pants: '#1a1a1a', skin: pick(state.rng, ['#e8b98a', '#c98d5f', '#8d5524']),
    moving: false, shootTimer: rand(state.rng, 0.3, 1), targetX: x, targetZ: z,
  };
  state.goons.push(goon);
  return goon;
}

// ---- particles / tracers ----

export function spawnParticles(state, x, y, z, opts = {}) {
  const count = opts.count || 8;
  const color = opts.color || '#ffaa33';
  const speed = opts.speed || 6;
  const life = opts.life || 0.7;
  const up = opts.up || 2;
  for (let i = 0; i < count; i++) {
    const slot = state.particles.findIndex((p) => !p || p.life <= 0);
    if (slot < 0) return;
    const a = Math.random() * Math.PI * 2;
    const v = rand(state.rng, speed * 0.3, speed);
    state.particles[slot] = {
      x, y, z,
      vx: Math.cos(a) * v, vy: rand(state.rng, 0, up), vz: Math.sin(a) * v,
      life, maxLife: life, color, gravity: opts.gravity ?? 6,
    };
  }
}

export function addTracer(state, x0, y0, z0, x1, y1, z1) {
  const slot = state.tracers.findIndex((t) => !t || t.life <= 0);
  if (slot < 0) return;
  state.tracers[slot] = { x0, y0, z0, x1, y1, z1, life: 0.12 };
}

export function updateParticles(state, dt) {
  for (let i = 0; i < state.particles.length; i++) {
    const p = state.particles[i];
    if (!p || p.life <= 0) continue;
    p.life -= dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.z += p.vz * dt;
    p.vy -= p.gravity * dt;
    if (p.y < 0.05) { p.y = 0.05; p.vy = 0; p.vx *= 0.7; p.vz *= 0.7; }
  }
  for (let i = 0; i < state.tracers.length; i++) {
    const t = state.tracers[i];
    if (t && t.life > 0) t.life -= dt;
  }
}

// ---- hitscan shooting ----

/** Nearest building hit along a 3D segment, or null. Returns {t, x, y, z}. */
export function segmentHitBuilding(city, x0, y0, z0, x1, y1, z1) {
  let best = null;
  let bestT = 1;
  const dx = x1 - x0;
  const dy = y1 - y0;
  const dz = z1 - z0;
  for (const b of city.buildings) {
    const minX = b.x - b.w / 2;
    const maxX = b.x + b.w / 2;
    const minY = 0;
    const maxY = b.h;
    const minZ = b.z - b.d / 2;
    const maxZ = b.z + b.d / 2;
    let tmin = 0;
    let tmax = 1;
    let ok = true;
    const axes = [
      [x0, dx, minX, maxX],
      [y0, dy, minY, maxY],
      [z0, dz, minZ, maxZ],
    ];
    for (const [o, d, mn, mx] of axes) {
      if (Math.abs(d) < 1e-9) {
        if (o < mn || o > mx) { ok = false; break; }
      } else {
        let t1 = (mn - o) / d;
        let t2 = (mx - o) / d;
        if (t1 > t2) [t1, t2] = [t2, t1];
        tmin = Math.max(tmin, t1);
        tmax = Math.min(tmax, t2);
        if (tmin > tmax) { ok = false; break; }
      }
    }
    if (ok && tmin < bestT) {
      bestT = tmin;
      best = { t: tmin, x: x0 + dx * tmin, y: y0 + dy * tmin, z: z0 + dz * tmin };
    }
  }
  return best;
}

/** Distance from a point to a segment (3D), squared. */
function pointSegDist2(px, py, pz, x0, y0, z0, x1, y1, z1) {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const dz = z1 - z0;
  const len2 = dx * dx + dy * dy + dz * dz;
  let t = len2 > 0 ? ((px - x0) * dx + (py - y0) * dy + (pz - z0) * dz) / len2 : 0;
  t = clamp(t, 0, 1);
  const cx = x0 + dx * t;
  const cy = y0 + dy * t;
  const cz = z0 + dz * t;
  return (px - cx) * (px - cx) + (py - cy) * (py - cy) + (pz - cz) * (pz - cz);
}

export function fireWeapon(state, shooter, aimX, aimY, aimZ) {
  const p = state.player;
  const w = WEAPONS[p.weapon];
  if (!w) return;
  if (p.ammo[p.weapon] !== Infinity && p.ammo[p.weapon] < w.ammoPerShot) {
    // Click — out of ammo.
    return;
  }
  if (p.ammo[p.weapon] !== Infinity) p.ammo[p.weapon] -= w.ammoPerShot;
  sfxShoot(p.weapon);
  const mx = shooter.x;
  const my = 1.35;
  const mz = shooter.z;
  const range = p.weapon === 'rifle' ? 120 : p.weapon === 'shotgun' ? 42 : p.weapon === 'smg' ? 70 : 60;
  for (let pellet = 0; pellet < w.pellets; pellet++) {
    const spread = w.spread * (Math.random() - 0.5) * 2;
    // Aim point with spread applied in the horizontal plane.
    const dx = aimX - mx;
    const dz = aimZ - mz;
    const baseYaw = Math.atan2(dx, dz);
    const yaw = baseYaw + spread;
    const ex = mx + Math.sin(yaw) * range;
    const ez = mz + Math.cos(yaw) * range;
    const ey = aimY + (Math.random() - 0.5) * 0.4;
    // Nearest building hit caps the shot.
    const wall = segmentHitBuilding(state.city, mx, my, mz, ex, ey, ez);
    let endX = ex;
    let endY = ey;
    let endZ = ez;
    let maxT = 1;
    if (wall) {
      endX = wall.x;
      endY = wall.y;
      endZ = wall.z;
      maxT = wall.t;
      spawnParticles(state, wall.x, wall.y, wall.z, { count: 4, color: '#cccccc', speed: 3, life: 0.4 });
    }
    // Goons first (they are the targets that matter).
    let hitAny = false;
    for (const goon of state.goons) {
      if (goon.state === 'dead') continue;
      const d2 = pointSegDist2(goon.x, 1.0, goon.z, mx, my, mz, ex, ey, ez);
      if (d2 < 0.9) {
        const t = Math.sqrt(dist2(mx, mz, goon.x, goon.z)) / range;
        if (t <= maxT) {
          hitAny = true;
          damageGoon(state, goon, w.damage);
          spawnParticles(state, goon.x, 1.2, goon.z, { count: 6, color: '#cc2222', speed: 4, life: 0.5 });
          break;
        }
      }
    }
    if (!hitAny) {
      // Peds (a crime — witnesses will call it in).
      for (const ped of state.peds) {
        const d2 = pointSegDist2(ped.x, 1.0, ped.z, mx, my, mz, ex, ey, ez);
        if (d2 < 0.9) {
          const t = Math.sqrt(dist2(mx, mz, ped.x, ped.z)) / range;
          if (t <= maxT) {
            hitAny = true;
            ped.state = 'flee';
            ped.fleeTimer = 6;
            addWantedHeat(state, 15);
            spawnParticles(state, ped.x, 1.2, ped.z, { count: 6, color: '#cc2222', speed: 4, life: 0.5 });
            break;
          }
        }
      }
    }
    if (!hitAny) {
      // Cars (not the one the player is standing in).
      for (const car of state.cars) {
        if (car === p.car) continue;
        const d2 = pointSegDist2(car.x, 0.8, car.z, mx, my, mz, ex, ey, ez);
        if (d2 < 2.4) {
          const t = Math.sqrt(dist2(mx, mz, car.x, car.z)) / range;
          if (t <= maxT) {
            damageCar(state, car, w.damage, car.x, car.z);
            spawnParticles(state, car.x, 1, car.z, { count: 5, color: '#ffcc33', speed: 5, life: 0.4 });
            break;
          }
        }
      }
    }
    addTracer(state, mx, my, mz, endX, endY, endZ);
    if (hitAny) sfxHit();
  }
  // Gunfire is loud: nearby peds flee, heat rises a little.
  for (const ped of state.peds) {
    if (dist2(ped.x, ped.z, mx, mz) < 30 * 30 && ped.state !== 'flee') {
      ped.state = 'flee';
      ped.fleeTimer = 5;
    }
  }
  addWantedHeat(state, 2);
}

export function damageGoon(state, goon, amount) {
  goon.hp -= amount;
  if (goon.hp <= 0 && goon.state !== 'dead') {
    goon.state = 'dead';
    state.stepState.kills = (state.stepState.kills || 0) + 1;
    state.player.rep += 2;
    spawnParticles(state, goon.x, 1, goon.z, { count: 14, color: '#aa2222', speed: 5, life: 0.8 });
  }
}

export function damageCar(state, car, amount, hx, hz) {
  if (car.state === 'wreck' || car.state === 'burning') return;
  car.hp -= amount;
  if (car.hp <= 0) {
    car.state = 'burning';
    car.burnTimer = 3;
    if (car === state.player.car) {
      // Bail out before it blows.
      state.toast = 'Your car is on fire — get out!';
      state.toastTimer = 3;
    }
  }
}

export function explodeCar(state, car) {
  car.state = 'wreck';
  car.hp = 0;
  sfxExplosion();
  state.camShake = Math.max(state.camShake, 1.2);
  spawnParticles(state, car.x, 1, car.z, { count: 40, color: '#ff7722', speed: 12, life: 1.1, up: 8 });
  spawnParticles(state, car.x, 1.5, car.z, { count: 24, color: '#333333', speed: 6, life: 1.6, up: 7, gravity: 1 });
  // Splash damage.
  for (const other of state.cars) {
    if (other === car) continue;
    if (dist2(other.x, other.z, car.x, car.z) < 64) damageCar(state, other, 40, car.x, car.z);
  }
  for (const goon of state.goons) {
    if (goon.state !== 'dead' && dist2(goon.x, goon.z, car.x, car.z) < 49) damageGoon(state, goon, 60);
  }
  const p = state.player;
  if (p.onFoot && dist2(p.x, p.z, car.x, car.z) < 36) {
    hurtPlayer(state, 30);
  }
}

export function hurtPlayer(state, amount) {
  const p = state.player;
  // Body armour (v13) absorbs damage before health does — a real
  // mechanic, not a display number: buy it at the Hideout shop.
  const absorbed = Math.min(p.armour || 0, amount);
  p.armour = (p.armour || 0) - absorbed;
  p.health -= (amount - absorbed);
  if (p.health <= 0) {
    p.health = 0;
    state.mode = 'wasted';
    state.wastedAt = state.realTime ?? state.time;
  }
}

export function addWantedHeat(state, amount) {
  state.wantedHeat = clamp((state.wantedHeat || 0) + amount, 0, 150);
  const stars = Math.min(6, Math.floor(state.wantedHeat / 25));
  if (stars > state.wantedStars) {
    state.wantedStars = stars;
    if (state.wantedState === 'none' || state.wantedState === 'escaping') {
      state.wantedState = 'chasing';
      state.lastSeen = { x: state.player.x, z: state.player.z };
      state.evadeTimer = 0;
    }
  }
}

// ---- player update ----

export function updatePlayer(state, input, dt) {
  const p = state.player;
  const city = state.city;
  if (p.onFoot) {
    // Camera-relative movement: forward is the camera/player yaw.
    let mx = 0;
    let mz = 0;
    if (input.forward) { mx += Math.sin(p.yaw); mz += Math.cos(p.yaw); }
    if (input.back) { mx -= Math.sin(p.yaw); mz -= Math.cos(p.yaw); }
    if (input.left) { mx -= Math.cos(p.yaw); mz += Math.sin(p.yaw); }
    if (input.right) { mx += Math.cos(p.yaw); mz -= Math.sin(p.yaw); }
    const len = Math.hypot(mx, mz);
    const running = input.run;
    const speed = running ? PLAYER_RUN_SPEED : PLAYER_WALK_SPEED;
    p.moving = len > 0.01;
    if (p.moving) {
      mx /= len;
      mz /= len;
      const targetYaw = yawFromDir(mx, mz);
      // Face the aim point while firing or right after the mouse moved.
      const aimRecent = state.time - p.mouseMovedAt < 0.6 || p.firing;
      if (aimRecent) {
        const adx = p.aimX - p.x;
        const adz = p.aimZ - p.z;
        if (Math.hypot(adx, adz) > 0.5) p.yaw = lerpAngle(p.yaw, yawFromDir(adx, adz), 1 - Math.exp(-14 * dt));
      } else {
        p.yaw = lerpAngle(p.yaw, targetYaw, 1 - Math.exp(-10 * dt));
      }
      p.x += mx * speed * dt;
      p.z += mz * speed * dt;
      p.walkPhase += dt * speed * 1.6;
      p.speed = speed;
    } else {
      // Idle: face the aim point if it was moved recently.
      const aimRecent = state.time - p.mouseMovedAt < 0.6 || p.firing;
      if (aimRecent) {
        const adx = p.aimX - p.x;
        const adz = p.aimZ - p.z;
        if (Math.hypot(adx, adz) > 0.5) p.yaw = lerpAngle(p.yaw, yawFromDir(adx, adz), 1 - Math.exp(-14 * dt));
      }
      p.speed = 0;
    }
    // Buildings + world bounds.
    const r = collideFootBuildings(city, p.x, p.z, PLAYER_RADIUS);
    p.x = clamp(r.x, 3, WORLD_SIZE - 3);
    p.z = clamp(r.z, 3, WORLD_SIZE - 3);
    // The shore (v14): on foot the player wades to the waterline but
    // never walks on the sea — the boats are boarded from the sand.
    p.z = Math.min(p.z, SHORE_Z + 1);
    // Peds are soft obstacles.
    for (const ped of state.peds) {
      const dx = p.x - ped.x;
      const dz = p.z - ped.z;
      const d2 = dx * dx + dz * dz;
      if (d2 < 1 && d2 > 1e-6) {
        const d = Math.sqrt(d2);
        p.x += (dx / d) * (1 - d) * 0.5;
        p.z += (dz / d) * (1 - d) * 0.5;
      }
    }
    // Shooting.
    p.fireCooldown -= dt;
    if (p.firing && p.fireCooldown <= 0) {
      const w = WEAPONS[p.weapon];
      p.fireCooldown = w.rate;
      fireWeapon(state, p, p.aimX, 1.2, p.aimZ);
    }
    // Melee.
    p.punchCooldown -= dt;
    if (input.punch && p.punchCooldown <= 0) {
      p.punchCooldown = 0.45;
      punch(state);
    }
  } else if (p.car) {
    const car = p.car;
    car.throttle = input.forward ? 1 : input.back ? -1 : 0;
    car.steerIn = (input.left ? -1 : 0) + (input.right ? 1 : 0);
    car.handbrake = !!input.handbrake;
  } else if (p.boat) {
    // Driving a boat (v14): same inputs as a car, no drift — the water
    // does the sliding. The boat's own physics runs in updateBoats.
    const boat = p.boat;
    boat.throttle = input.forward ? 1 : input.back ? -0.6 : 0;
    boat.steerIn = (input.left ? -1 : 0) + (input.right ? 1 : 0);
    boat.handbrake = !!input.handbrake;
  }
}

function punch(state) {
  const p = state.player;
  const fx = Math.sin(p.yaw);
  const fz = Math.cos(p.yaw);
  let hit = null;
  let bestD = 2.4;
  for (const goon of state.goons) {
    if (goon.state === 'dead') continue;
    const d = Math.hypot(goon.x - p.x, goon.z - p.z);
    if (d < bestD) { bestD = d; hit = goon; }
  }
  if (!hit) {
    for (const ped of state.peds) {
      const d = Math.hypot(ped.x - p.x, ped.z - p.z);
      if (d < bestD) { bestD = d; hit = ped; }
    }
  }
  if (hit) {
    hit.x += fx * 1.5;
    hit.z += fz * 1.5;
    if (hit.hp !== undefined) damageGoon(state, hit, 25);
    else {
      hit.state = 'flee';
      hit.fleeTimer = 6;
      addWantedHeat(state, 8);
    }
    spawnParticles(state, hit.x, 1.2, hit.z, { count: 5, color: '#ffcc33', speed: 4, life: 0.4 });
    sfxHit();
  }
}

export function tryEnterCar(state) {
  const p = state.player;
  if (!p.onFoot) return false;
  let best = null;
  let bestD = 4.2;
  for (const car of state.cars) {
    if (car.state === 'wreck' || car.state === 'burning') continue;
    const d = Math.hypot(car.x - p.x, car.z - p.z) - car.model.len / 2;
    if (d < bestD) { bestD = d; best = car; }
  }
  if (!best) return false;
  p.onFoot = false;
  p.car = best;
  if (best.state === 'traffic') {
    // The driver bails and flees; stealing a manned car is a crime.
    best.state = 'player';
    addWantedHeat(state, 10);
    state.stats.stolen++;
    spawnFleeingPed(state, best.x, best.z);
  } else {
    best.state = 'player';
    state.stats.stolen++;
    if (best.model.name === 'Aurora') state.toast = 'The Aurora — the fastest car in the Bay. Yours now.';
  }
  best.throttle = 0;
  best.steerIn = 0;
  return true;
}

function spawnFleeingPed(state, x, z) {
  state.peds.push({
    x: x + 2, z: z + 2, yaw: 0, speed: 0, walkPhase: 0, state: 'flee',
    targetX: x, targetZ: z, waitTimer: 0, fleeTimer: 6,
    shirt: pick(state.rng, ['#e74c3c', '#3498db', '#2ecc71']),
    pants: '#2c3e50', skin: '#e8b98a', moving: false, called: false,
  });
}

export function exitCar(state) {
  const p = state.player;
  if (p.onFoot || !p.car) return false;
  const car = p.car;
  const fx = Math.sin(car.yaw);
  const fz = Math.cos(car.yaw);
  const rx = -fz;
  const rz = fx;
  p.x = car.x + rx * (car.model.wid / 2 + 0.9);
  p.z = car.z + rz * (car.model.wid / 2 + 0.9);
  p.yaw = car.yaw;
  p.onFoot = true;
  p.car = null;
  car.state = car.hp <= 0 ? 'wreck' : 'parked';
  car.throttle = 0;
  car.steerIn = 0;
  car.handbrake = false;
  const r = collideFootBuildings(state.city, p.x, p.z, PLAYER_RADIUS);
  p.x = r.x;
  p.z = r.z;
  return true;
}

// ---- boats (v14): drivable on the south sea strip ----

let boatId = 0;

export function boatModelByName(name) {
  return BOAT_MODELS.find((m) => m.name === name) || BOAT_MODELS[0];
}

export function spawnBoat(state, modelName, x, z, yaw) {
  const model = typeof modelName === 'string' ? boatModelByName(modelName) : modelName;
  const boat = {
    id: ++boatId,
    model, baseModel: model, x, z, yaw, vF: 0, vL: 0, steer: 0, steerIn: 0, throttle: 0,
    handbrake: false, hp: model.hp, maxHp: model.hp,
    state: 'docked', isBoat: true, removed: false,
    speed: 0, drifting: false, slip: 0, wheelSpin: 0, accelVis: 0,
    wakeTimer: 0, crewBoost: false,
  };
  state.boats.push(boat);
  return boat;
}

/** Nearest boat to (x, z) within maxD metres, or null. */
export function nearestBoat(state, x, z, maxD) {
  let best = null;
  let bestD = maxD;
  for (const boat of state.boats || []) {
    if (boat.removed) continue;
    const d = Math.hypot(boat.x - x, boat.z - z);
    if (d < bestD) { bestD = d; best = boat; }
  }
  return best;
}

export function tryEnterBoat(state) {
  const p = state.player;
  if (!p.onFoot) return false;
  const boat = nearestBoat(state, p.x, p.z, 8);
  if (!boat) return false;
  p.onFoot = false;
  p.boat = boat;
  boat.state = 'player';
  boat.throttle = 0;
  boat.steerIn = 0;
  state.toast = boat.model.name === 'Speedboat'
    ? 'The Speedboat — the fastest thing on the water. Hold W to open it up.'
    : 'The Dinghy — slow, steady, and nobody looks twice.';
  state.toastTimer = 3;
  return true;
}

export function exitBoat(state) {
  const p = state.player;
  if (p.onFoot || !p.boat) return false;
  const boat = p.boat;
  // Step ashore: the player lands on the sand at the waterline, facing
  // the boat they just left.
  p.x = boat.x;
  p.z = Math.min(boat.z, SHORE_Z);
  p.yaw = boat.yaw;
  p.onFoot = true;
  p.boat = null;
  boat.state = 'docked';
  boat.throttle = 0;
  boat.steerIn = 0;
  boat.handbrake = false;
  return true;
}

export function updateBoats(state, dt) {
  for (const boat of state.boats || []) {
    if (boat.removed || boat.state !== 'player') continue;
    const prevVF = boat.vF;
    stepCar(boat, dt, 1);
    boat.wheelSpin += (boat.vF / 0.34) * dt;
    boat.accelVis = (boat.vF - prevVF) / dt;
    // The sea band is the boat's world: clamp to the water and damp the
    // push into the shore so a boat slides along the beach instead of
    // beaching itself on the sand.
    if (boat.z < WATER_Z_MIN) { boat.z = WATER_Z_MIN; boat.vF *= 0.9; }
    if (boat.z > WATER_Z_MAX) { boat.z = WATER_Z_MAX; boat.vF *= 0.9; }
    if (boat.x < 4) { boat.x = 4; boat.vF *= 0.5; }
    if (boat.x > WORLD_SIZE - 4) { boat.x = WORLD_SIZE - 4; boat.vF *= 0.5; }
    // Wake: white spray off the stern while the boat is moving.
    boat.wakeTimer -= dt;
    if (Math.abs(boat.vF) > 5 && boat.wakeTimer <= 0) {
      boat.wakeTimer = 0.12;
      const fx = Math.sin(boat.yaw);
      const fz = Math.cos(boat.yaw);
      spawnParticles(state, boat.x - fx * boat.model.len * 0.45, 0.25, boat.z - fz * boat.model.len * 0.45,
        { count: 2, color: '#dff3ff', speed: 1.5, life: 0.8, up: 1, gravity: 0.5 });
    }
    // The player rides the boat they drive — the same sync cars use.
    if (boat === state.player.boat && !state.player.onFoot) {
      state.player.x = boat.x;
      state.player.z = boat.z;
      state.player.yaw = boat.yaw;
    }
  }
}

// ---- traffic AI (lane following, pure pursuit) ----

export function updateTraffic(state, dt) {
  const city = state.city;
  const player = state.player;
  for (const car of state.cars) {
    if (car.state !== 'traffic') continue;
    // Re-acquire the lane if pushed off it.
    const lane = city.lanes[car.lane];
    if (!lane) {
      const near = nearestLane(city, car.x, car.z);
      car.lane = near.lane;
      car.laneT = near.t;
      continue;
    }
    const lookahead = 6 + Math.abs(car.vF) * 0.9;
    const pt = lanePoint(city, car.lane, car.laneT + lookahead);
    const dx = pt.x - car.x;
    const dz = pt.z - car.z;
    const desiredYaw = yawFromDir(dx, dz);
    let dyaw = desiredYaw - car.yaw;
    while (dyaw > Math.PI) dyaw -= Math.PI * 2;
    while (dyaw < -Math.PI) dyaw += Math.PI * 2;
    car.steerIn = clamp(dyaw * 1.8, -1, 1);
    // Slow near the lane end (intersection) and for cars ahead.
    let targetSpeed = car.cruise;
    // The money van stops when the player walks up to it on foot — that
    // is the only way the 3-second crack is ever possible.
    if (car.isVan && player.onFoot && dist2(car.x, car.z, player.x, player.z) < 15 * 15) {
      targetSpeed = 0;
    }
    const distToEnd = lane.len - car.laneT;
    if (distToEnd < 12) targetSpeed = Math.min(targetSpeed, 5);
    // Car ahead: same lane, in front, slower.
    for (const other of state.cars) {
      if (other === car || other.state === 'wreck') continue;
      const relX = other.x - car.x;
      const relZ = other.z - car.z;
      const fx = Math.sin(car.yaw);
      const fz = Math.cos(car.yaw);
      const ahead = relX * fx + relZ * fz;
      const side = relX * (-fz) + relZ * fx;
      if (ahead > 1 && ahead < 16 && Math.abs(side) < 2.6) {
        const otherSpeed = Math.abs(other.vF || 0);
        if (otherSpeed < targetSpeed) targetSpeed = Math.min(targetSpeed, otherSpeed * 0.8);
        if (ahead < 6) targetSpeed = 0;
      }
    }
    // Intersection yield: another car inside the next intersection square.
    if (distToEnd < 10) {
      const endX = lane.x1;
      const endZ = lane.z1;
      for (const other of state.cars) {
        if (other === car) continue;
        if (Math.abs(other.x - endX) < 9 && Math.abs(other.z - endZ) < 9) {
          const relX = other.x - car.x;
          const relZ = other.z - car.z;
          const fx = Math.sin(car.yaw);
          const fz = Math.cos(car.yaw);
          if (relX * fx + relZ * fz > 0) { targetSpeed = 0; break; }
        }
      }
    }
    car.throttle = Math.abs(car.vF) < targetSpeed ? 0.7 : (car.vF > targetSpeed + 1 ? -0.6 : 0);
    car.handbrake = false;
    // Advance along the lane.
    car.laneT += Math.abs(car.vF) * dt;
    if (car.laneT >= lane.len) {
      const outs = city.nodeOut[lane.to];
      const options = outs.filter((li) => city.lanes[li].to !== lane.from);
      const next = options.length > 0 ? pick(state.rng, options) : outs[0];
      if (next === undefined) {
        car.laneT = lane.len;
        continue;
      }
      car.lane = next;
      car.laneT = 0;
    }
    // If shaken by a hard hit, stop for a while.
    if (car.stoppedTimer > 0) {
      car.stoppedTimer -= dt;
      car.throttle = 0;
    }
    // Recycle far-away traffic back near the player.
    const pd = dist2(car.x, car.z, player.x, player.z);
    if (pd > 280 * 280) {
      const near = nearestLane(city, player.x + rand(state.rng, -120, 120), player.z + rand(state.rng, -120, 120));
      const pt2 = lanePoint(city, near.lane, near.t);
      car.x = pt2.x;
      car.z = pt2.z;
      car.yaw = yawFromDir(city.lanes[near.lane].x1 - city.lanes[near.lane].x0, city.lanes[near.lane].z1 - city.lanes[near.lane].z0);
      car.lane = near.lane;
      car.laneT = near.t;
      car.vF = 0;
      car.vL = 0;
    }
  }
}

// ---- peds + goons ----

export function updatePeds(state, dt) {
  const p = state.player;
  for (const ped of state.peds) {
    if (ped.state === 'flee') {
      ped.fleeTimer -= dt;
      const dx = ped.x - p.x;
      const dz = ped.z - p.z;
      const d = Math.hypot(dx, dz) || 1;
      const speed = 4.6;
      ped.x += (dx / d) * speed * dt;
      ped.z += (dz / d) * speed * dt;
      ped.yaw = lerpAngle(ped.yaw, yawFromDir(dx, dz), 1 - Math.exp(-8 * dt));
      ped.walkPhase += dt * speed * 1.8;
      ped.moving = true;
      if (ped.fleeTimer <= 0) ped.state = 'wander';
    } else {
      ped.waitTimer -= dt;
      if (ped.waitTimer <= 0) {
        // Pick a new wander target on a sidewalk near a road.
        const rx = Math.round(rand(state.rng, 1, 8)) * 60 - 30 + rand(state.rng, -14, 14);
        const rz = Math.round(rand(state.rng, 1, 8)) * 60 - 30 + rand(state.rng, -14, 14);
        ped.targetX = clamp(rx, 20, WORLD_SIZE - 20);
        ped.targetZ = clamp(rz, 20, WORLD_SIZE - 20);
        ped.waitTimer = rand(state.rng, 4, 10);
      }
      const dx = ped.targetX - ped.x;
      const dz = ped.targetZ - ped.z;
      const d = Math.hypot(dx, dz);
      if (d > 2) {
        const speed = 1.4;
        ped.x += (dx / d) * speed * dt;
        ped.z += (dz / d) * speed * dt;
        ped.yaw = lerpAngle(ped.yaw, yawFromDir(dx, dz), 1 - Math.exp(-6 * dt));
        ped.walkPhase += dt * speed * 1.8;
        ped.moving = true;
      } else {
        ped.moving = false;
      }
    }
    const r = collideFootBuildings(state.city, ped.x, ped.z, 0.4);
    ped.x = clamp(r.x, 3, WORLD_SIZE - 3);
    ped.z = clamp(r.z, 3, WORLD_SIZE - 3);
  }
  // Prune fleeing peds that ran far away (keep the pool bounded).
  if (state.peds.length > 80) {
    state.peds = state.peds.filter((ped) => dist2(ped.x, ped.z, p.x, p.z) < 300 * 300).slice(0, 80);
  }
  // Top-up: keep the streets alive near the player. When the pool drops
  // below the floor, bring one ped back on a sidewalk 70–130 m away
  // (outside the immediate view, no visible pop-in), wandering toward
  // the player's area. One per step at most, so the refill is gradual.
  if (state.peds.length < PED_TOPUP_MIN) {
    let pt = null;
    for (let tries = 0; tries < 8; tries++) {
      const cand = sidewalkPoint(state.rng);
      const d = Math.hypot(cand.x - p.x, cand.z - p.z);
      if (d >= 70 && d <= 130) { pt = cand; break; }
    }
    if (pt) {
      const ped = makePed(state, pt.x, pt.z);
      for (let tries = 0; tries < 8; tries++) {
        const near = sidewalkPoint(state.rng);
        if (Math.hypot(near.x - p.x, near.z - p.z) < 50) {
          ped.targetX = near.x; ped.targetZ = near.z; break;
        }
      }
      state.peds.push(ped);
    }
  }
}

export function updateGoons(state, dt) {
  const p = state.player;
  for (const goon of state.goons) {
    if (goon.state === 'dead') continue;
    const dx = p.x - goon.x;
    const dz = p.z - goon.z;
    const d = Math.hypot(dx, dz);
    goon.yaw = lerpAngle(goon.yaw, yawFromDir(dx, dz), 1 - Math.exp(-6 * dt));
    if (d > 14) {
      const speed = 4.2;
      goon.x += (dx / d) * speed * dt;
      goon.z += (dz / d) * speed * dt;
      goon.walkPhase += dt * speed * 1.8;
      goon.moving = true;
    } else {
      goon.moving = false;
      // Shoot at the player when in range and in line of sight.
      goon.shootTimer -= dt;
      if (goon.shootTimer <= 0 && d < 30 && !segmentBlocked(state.city, goon.x, goon.z, p.x, p.z)) {
        goon.shootTimer = rand(state.rng, 0.8, 1.4);
        addTracer(state, goon.x, 1.3, goon.z, p.x, 1.2, p.z);
        if (Math.random() < 0.4) {
          hurtPlayer(state, randInt(state.rng, 6, 11));
          spawnParticles(state, p.x, 1.2, p.z, { count: 4, color: '#cc2222', speed: 3, life: 0.4 });
        }
        // Return fire is a crime the player committed, not the goon.
      }
    }
    const r = collideFootBuildings(state.city, goon.x, goon.z, 0.4);
    goon.x = clamp(r.x, 3, WORLD_SIZE - 3);
    goon.z = clamp(r.z, 3, WORLD_SIZE - 3);
  }
}

// ---- car integration + collisions + damage ----

export function updateCars(state, dt) {
  const slick = state.weather === 'storm' ? 1.6 : state.weather === 'rain' ? 1.3 : 1;
  // Crew (v13): Mara's driving and Lio's repairs are real mechanics,
  // not flavour text — they only apply once the crew member has
  // actually joined (see crewUnlocked in config.js).
  const crew = crewUnlocked(state.missionIndex, state.storyDone);
  for (const car of state.cars) {
    if (car.state === 'wreck') continue;
    if (car.state === 'burning') {
      car.burnTimer -= dt;
      car.smokeTimer -= dt;
      if (car.smokeTimer <= 0) {
        car.smokeTimer = 0.12;
        spawnParticles(state, car.x, 1.2, car.z, { count: 3, color: '#333333', speed: 2, life: 1.2, up: 5, gravity: -1 });
        spawnParticles(state, car.x, 1, car.z, { count: 2, color: '#ff7722', speed: 3, life: 0.5, up: 4 });
      }
      if (car.burnTimer <= 0) explodeCar(state, car);
      continue;
    }
    // Rolling resistance for parked cars.
    if (car.state === 'parked') {
      car.vF *= Math.max(0, 1 - 2 * dt);
      car.vL *= Math.max(0, 1 - 2 * dt);
      if (Math.abs(car.vF) < 0.05 && Math.abs(car.vL) < 0.05) continue;
    }
    const prevX = car.x;
    const prevZ = car.z;
    const prevVF = car.vF;
    car.crewBoost = car === state.player.car && crew.mara;
    if (car === state.player.car && crew.lio && car.state !== 'wreck' && car.state !== 'burning' && car.hp < car.maxHp) {
      car.hp = Math.min(car.maxHp, car.hp + 3 * dt);
    }
    stepCar(car, dt, slick);
    car.wheelSpin += (car.vF / 0.34) * dt;
    car.accelVis = (car.vF - prevVF) / dt;
    // Drift skids + squeal + smoke.
    if (car.drifting && Math.abs(car.vF) > 8) {
      const fx = Math.sin(car.yaw);
      const fz = Math.cos(car.yaw);
      const rx = -fz;
      const rz = fx;
      const halfLen = car.model.len * 0.32;
      const halfWid = car.model.wid / 2;
      state.board.addSkid(
        prevX - fx * halfLen + rx * halfWid, prevZ - fz * halfLen + rz * halfWid,
        car.x - fx * halfLen + rx * halfWid, car.z - fz * halfLen + rz * halfWid, 0.35,
      );
      if (Math.random() < 0.3) {
        spawnParticles(state, car.x - fx * halfLen, 0.3, car.z - fz * halfLen, { count: 2, color: '#bbbbbb', speed: 1.5, life: 0.6, up: 1, gravity: 0.5 });
      }
      if (car === state.player.car && Math.random() < 0.1) sfxSkid();
    }
    // Buildings.
    const impact = collideCarBuildings(state.city, car);
    if (impact > 3) {
      const dmg = (impact - 3) * 2.2;
      if (car === state.player.car) {
        state.camShake = Math.max(state.camShake, Math.min(0.9, impact * 0.06));
        sfxCrash(impact);
      }
      damageCar(state, car, dmg, car.x, car.z);
      spawnParticles(state, car.x, 0.8, car.z, { count: Math.min(10, Math.floor(impact)), color: '#ffcc33', speed: 5, life: 0.5 });
      if (car.state === 'traffic') car.stoppedTimer = Math.max(car.stoppedTimer, 2);
    }
    // Smoke when hurt.
    if (car.hp < car.maxHp * 0.6 && car.hp > 0) {
      car.smokeTimer -= dt;
      if (car.smokeTimer <= 0) {
        car.smokeTimer = car.hp < car.maxHp * 0.3 ? 0.1 : 0.25;
        spawnParticles(state, car.x, 1.1, car.z, { count: 2, color: car.hp < car.maxHp * 0.3 ? '#222222' : '#aaaaaa', speed: 1.5, life: 1.1, up: 4, gravity: -1 });
      }
    }
    car.lastX = prevX;
    car.lastZ = prevZ;
    // THE FIX (v14): the player rides the car they drive. Before this
    // the car moved but p.x/p.z/p.yaw never followed it, so the chase
    // camera stayed at the entry point, `goto` steps in a car never
    // completed by driving, and the police chased the entry point.
    // Synced after step + collision, so the player IS where their car
    // is — the same sync boats use.
    if (car === state.player.car && !state.player.onFoot) {
      state.player.x = car.x;
      state.player.z = car.z;
      state.player.yaw = car.yaw;
    }
  }
  // Car vs car.
  const cars = state.cars;
  for (let i = 0; i < cars.length; i++) {
    for (let j = i + 1; j < cars.length; j++) {
      const a = cars[i];
      const b = cars[j];
      if (a.state === 'wreck' && b.state === 'wreck') continue;
      const rr = (a.model.wid + b.model.wid) * 0.55 + 0.3;
      const d2 = dist2(a.x, a.z, b.x, b.z);
      if (d2 > (rr + 3) * (rr + 3)) continue;
      const impact = collideCars(a, b);
      if (impact > 4) {
        damageCar(state, a, (impact - 4) * 1.5, b.x, b.z);
        damageCar(state, b, (impact - 4) * 1.5, a.x, a.z);
        if (a === state.player.car || b === state.player.car) {
          state.camShake = Math.max(state.camShake, Math.min(0.8, impact * 0.05));
          sfxCrash(impact);
        }
        if (a.state === 'traffic') a.stoppedTimer = Math.max(a.stoppedTimer, 3);
        if (b.state === 'traffic') b.stoppedTimer = Math.max(b.stoppedTimer, 3);
      }
    }
  }
  // Remove wrecks far from the player (keep the pool bounded).
  if (state.cars.length > 70) {
    state.cars = state.cars.filter((car) => car.state !== 'wreck' || dist2(car.x, car.z, state.player.x, state.player.z) < 250 * 250);
  }
}

// ---- coins ----

export function updateCoins(state) {
  const p = state.player;
  for (const coin of state.city.coins) {
    if (coin.taken) continue;
    if (dist2(p.x, p.z, coin.x, coin.z) < 4) {
      coin.taken = true;
      state.coinsCollected++;
      p.money += 75;
      state.toast = 'Sun coin! +$75';
      state.toastTimer = 2;
    }
  }
}

export { isOnRoad };

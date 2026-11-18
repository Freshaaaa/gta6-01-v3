// Solmar Bay: Heatwave — the living city. Factories for the player, cars,
// pedestrians and goons, plus the per-population updates: traffic following
// the street grid, pedestrians walking and fleeing, goons hunting the
// player, bullets resolving against everything they can hit, and the
// particle / skid / wanted-heat bookkeeping the renderer and main loop
// read every frame.
//
// Upgrades over the v1 simulation: cars carry their model's real tuning
// (accel / top speed / turn as multipliers on the base values) instead of
// sharing one flat profile, police Interceptors are tougher (200 hp),
// destroyed cars explode instead of just smoking, bullets use their own
// damage value and can wreck cars, goons fire through the shared
// fireWeapon path, pedestrians get a skin tone, and car ids actually
// increment (v1 reused id 1 for every car).

import {
  CAR_ACCEL, CAR_MAX_SPEED, CAR_MODELS, CAR_TURN_RATE, PED_PANTS,
  PED_SHIRTS, PED_SKINS, PLAYER_MAX_HEALTH, PLAYER_RADIUS, ROAD_WIDTH,
  WANTED_HEAT_PER_STAR,
} from './config.js';
import {
  collideCircleBuildings, nearestRoad, rectHitsBuilding,
} from './city.js';
import { floatBetween, pick } from './rng.js';
import { fireWeapon } from './weapons.js';

export { intBetween } from './rng.js';

// ---- small math helpers ----

// Shortest-arc interpolation between two headings.
export function angleLerp(a, b, t) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

export function dist(ax, ay, bx, by) {
  return Math.hypot(ax - bx, ay - by);
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

let nextCarId = 1;

// ---- factories ----

export function createPlayer(x, y) {
  return {
    x, y, angle: -Math.PI / 2, speed: 0,
    onFoot: true, car: null,
    health: PLAYER_MAX_HEALTH,
    punchCooldown: 0, shootCooldown: 0, invuln: 0,
    arrestTimer: 0, moving: false,
  };
}

// A car with its model's tuning baked in. Model accel / maxSpeed / turn
// are multipliers on the base arcade values (see config.js); a model the
// table does not know — the police Interceptor — falls back to the base
// tuning with a small pursuit boost.
export function makeCar(x, y, angle, kind, rng) {
  // The money van: an armored box truck that never drives — it parks and
  // waits to be cracked (see activities.js). 400 hp, so it takes real
  // firepower to blow up.
  if (kind === 'van') {
    return {
      id: nextCarId++,
      x, y, angle, speed: 0,
      color: '#2e4053',
      model: 'Money Van',
      kind,
      hp: 400,
      maxHp: 400,
      routeAxis: 'x', routeDir: 1, targetSpeed: 0, turnCooldown: 0,
      sirenPhase: 0, accel: 0, maxSpeed: 0, turn: 0,
    };
  }
  const isPolice = kind === 'police';
  const model = isPolice ? null : pick(rng, CAR_MODELS);
  const accel = isPolice
    ? CAR_ACCEL * 1.2
    : CAR_ACCEL * (model ? model.accel : 1);
  const maxSpeed = isPolice
    ? CAR_MAX_SPEED * 1.05
    : CAR_MAX_SPEED * (model ? model.maxSpeed : 1);
  const turn = isPolice
    ? CAR_TURN_RATE * 1.1
    : CAR_TURN_RATE * (model ? model.turn : 1);
  const hp = isPolice ? 200 : (model ? model.hp : 140);
  return {
    id: nextCarId++,
    x, y, angle, speed: 0,
    color: isPolice ? '#1c2733' : model.color,
    model: isPolice ? 'Interceptor' : model.name,
    kind, // 'traffic' | 'parked' | 'police' | 'player'
    hp,
    maxHp: hp,
    routeAxis: rng() < 0.5 ? 'x' : 'y',
    routeDir: rng() < 0.5 ? 1 : -1,
    targetSpeed: floatBetween(rng, 90, 150),
    turnCooldown: 0,
    sirenPhase: rng() * Math.PI * 2,
    accel,
    maxSpeed,
    turn,
  };
}

// Spawn a traffic car on a road near (nearX, nearY) — or anywhere in the
// city when no anchor is given. The car sits in a lane (offset 22 px from
// the centre line) and already rolls at its target speed.
export function spawnTrafficCar(state, nearX, nearY) {
  const { rng, city, cars } = state;
  for (let tries = 0; tries < 12; tries += 1) {
    const cx = nearX === undefined
      ? floatBetween(rng, 300, 3300)
      : nearX + floatBetween(rng, -700, 700);
    const cy = nearY === undefined
      ? floatBetween(rng, 300, 3300)
      : nearY + floatBetween(rng, -700, 700);
    const rx = nearestRoad(cx);
    const ry = nearestRoad(cy);
    const onVertical = Math.abs(cx - rx) < Math.abs(cy - ry);
    const x = onVertical
      ? rx + (rng() < 0.5 ? -22 : 22)
      : floatBetween(rng, 300, 3300);
    const y = onVertical
      ? floatBetween(rng, 300, 3300)
      : ry + (rng() < 0.5 ? -22 : 22);
    if (x < 150 || x > 3450 || y < 150 || y > 3450) continue;
    if (state.player && dist(x, y, state.player.x, state.player.y) < 220) continue;
    if (cars.some((c) => dist(x, y, c.x, c.y) < 90)) continue;
    const car = makeCar(x, y, 0, 'traffic', rng);
    car.routeAxis = onVertical ? 'y' : 'x';
    car.routeDir = rng() < 0.5 ? 1 : -1;
    car.angle = car.routeAxis === 'x'
      ? (car.routeDir > 0 ? 0 : Math.PI)
      : (car.routeDir > 0 ? Math.PI / 2 : -Math.PI / 2);
    car.speed = car.targetSpeed;
    cars.push(car);
    return car;
  }
  void city;
  return null;
}

export function spawnParkedCar(state, x, y, angle) {
  const car = makeCar(x, y, angle, 'parked', state.rng);
  state.cars.push(car);
  return car;
}

export function spawnPed(state, nearX, nearY) {
  const { rng, peds } = state;
  const x = nearX === undefined
    ? floatBetween(rng, 300, 3300)
    : nearX + floatBetween(rng, -500, 500);
  const y = nearY === undefined
    ? floatBetween(rng, 300, 3300)
    : nearY + floatBetween(rng, -500, 500);
  const ped = {
    x: clamp(x, 120, 3480),
    y: clamp(y, 120, 3480),
    angle: floatBetween(rng, 0, Math.PI * 2),
    speed: floatBetween(rng, 30, 60),
    skin: pick(rng, PED_SKINS),
    shirt: pick(rng, PED_SHIRTS),
    pants: pick(rng, PED_PANTS),
    state: 'walk', // 'walk' | 'flee' | 'down'
    hp: 20,
    retarget: 0,
    panic: 0,
  };
  peds.push(ped);
  return ped;
}

export function spawnGoon(state, x, y) {
  const goon = {
    x, y, angle: 0, hp: 50,
    shootCooldown: floatBetween(state.rng, 0.5, 1.5),
    state: 'guard', // 'guard' | 'chase' | 'down'
    speed: 120,
  };
  state.goons.push(goon);
  return goon;
}

// ---- particles, skids and screen shake ----

export function addParticle(state, x, y, vx, vy, life, color, size) {
  state.particles.push({ x, y, vx, vy, life, maxLife: life, color, size });
  if (state.particles.length > 500) {
    state.particles.splice(0, state.particles.length - 500);
  }
}

export function burstBlood(state, x, y) {
  for (let i = 0; i < 10; i += 1) {
    const a = state.rng() * Math.PI * 2;
    const s = floatBetween(state.rng, 40, 160);
    addParticle(state, x, y, Math.cos(a) * s, Math.sin(a) * s, 0.5, '#c0392b', 3);
  }
}

export function burstSmoke(state, x, y, n = 6) {
  for (let i = 0; i < n; i += 1) {
    addParticle(state, x, y,
      floatBetween(state.rng, -20, 20),
      floatBetween(state.rng, -40, -5),
      0.9, '#7f8c8d', 5);
  }
}

export function burstSparks(state, x, y) {
  for (let i = 0; i < 8; i += 1) {
    const a = state.rng() * Math.PI * 2;
    const s = floatBetween(state.rng, 80, 240);
    addParticle(state, x, y, Math.cos(a) * s, Math.sin(a) * s, 0.3, '#f1c40f', 2);
  }
}

// A burning car: hot embers that rise and fade fast.
export function burstFire(state, x, y) {
  const colors = ['#ff9f1c', '#ff6b1a', '#e63946', '#ffd166'];
  for (let i = 0; i < 8; i += 1) {
    const a = state.rng() * Math.PI * 2;
    const s = floatBetween(state.rng, 20, 90);
    addParticle(state, x, y,
      Math.cos(a) * s, Math.sin(a) * s - 40,
      floatBetween(state.rng, 0.3, 0.7),
      pick(state.rng, colors), floatBetween(state.rng, 3, 5));
  }
}

// Full destruction: fire, smoke and sparks together.
export function burstExplosion(state, x, y) {
  burstFire(state, x, y);
  burstSmoke(state, x, y, 10);
  burstSparks(state, x, y);
  for (let i = 0; i < 6; i += 1) {
    const a = state.rng() * Math.PI * 2;
    const s = floatBetween(state.rng, 120, 260);
    addParticle(state, x, y, Math.cos(a) * s, Math.sin(a) * s, 0.6, '#ff9f1c', 4);
  }
}

// A burst of green cash for the money-van payout.
export function burstCash(state, x, y) {
  for (let i = 0; i < 12; i += 1) {
    const a = state.rng() * Math.PI * 2;
    const s = floatBetween(state.rng, 30, 130);
    addParticle(state, x, y, Math.cos(a) * s, Math.sin(a) * s - 30, 0.8, '#2ecc71', 3);
  }
}

export function addSkid(state, x1, y1, x2, y2) {
  state.skids.push({ x1, y1, x2, y2, life: 6 });
  if (state.skids.length > 240) state.skids.shift();
}

export function addShake(state, amount) {
  state.shake = Math.max(state.shake, amount);
}

// ---- wanted helpers (state carries wantedHeat; stars derive from it) ----

export function wantedStarsOf(heat) {
  return Math.max(0, Math.min(5, Math.floor(heat / WANTED_HEAT_PER_STAR)));
}

export function addWanted(state, heat) {
  const before = wantedStarsOf(state.wantedHeat);
  state.wantedHeat = clamp(state.wantedHeat + heat, 0, 125);
  const after = wantedStarsOf(state.wantedHeat);
  // Fresh crime: the heat holds for 5 s so the cops have time to respond.
  if (heat > 0) state.heatGrace = 5;
  if (after > before) state.events.push({ type: 'wanted-up', stars: after });
}

// ---- damage ----

// Damage a car: sparks on every hit, and once its health is gone it blows
// up (fire + smoke + sparks, a camera shake, and a 'car-destroyed' event
// for the main loop). Already-wrecked cars take no further damage.
export function damageCar(state, car, amount) {
  if (!car || car.hp <= 0) return;
  car.hp -= amount;
  burstSparks(state, car.x, car.y);
  if (car.hp <= 0) {
    car.hp = 0;
    burstExplosion(state, car.x, car.y);
    addShake(state, 10);
    state.events.push({ type: 'car-destroyed', car });
  }
}

export function damagePlayer(state, amount, source) {
  const player = state.player;
  if (player.invuln > 0 || player.health <= 0) return;
  player.health -= amount;
  player.invuln = 0.25;
  state.events.push({ type: 'hurt', source });
  if (player.health <= 0) {
    player.health = 0;
    state.events.push({ type: 'player-down' });
  }
}

// ---- per-population updates ----

function carAheadBlocked(state, car) {
  for (const other of state.cars) {
    if (other === car || other.kind === 'parked' || other.hp <= 0) continue;
    const dx = other.x - car.x;
    const dy = other.y - car.y;
    const forward = dx * Math.cos(car.angle) + dy * Math.sin(car.angle);
    const side = Math.abs(-dx * Math.sin(car.angle) + dy * Math.cos(car.angle));
    if (forward > 0 && forward < 70 && side < 26) return true;
  }
  return false;
}

export function updateTraffic(state, dt) {
  const { cars } = state;
  for (const car of cars) {
    if (car.kind !== 'traffic') continue;
    car.turnCooldown -= dt;
    // Follow the current road; at an intersection, sometimes turn.
    const onXRoad = Math.abs(car.y - nearestRoad(car.y)) < ROAD_WIDTH / 2 - 12;
    const onYRoad = Math.abs(car.x - nearestRoad(car.x)) < ROAD_WIDTH / 2 - 12;
    if (car.turnCooldown <= 0 && onXRoad && onYRoad && state.rng() < 0.35) {
      car.routeAxis = car.routeAxis === 'x' ? 'y' : 'x';
      car.routeDir = state.rng() < 0.5 ? 1 : -1;
      car.turnCooldown = 2;
    }
    const targetAngle = car.routeAxis === 'x'
      ? (car.routeDir > 0 ? 0 : Math.PI)
      : (car.routeDir > 0 ? Math.PI / 2 : -Math.PI / 2);
    car.angle = angleLerp(car.angle, targetAngle, Math.min(1, dt * 3));
    // Slow down if a moving car is right ahead (parked cars sit in the
    // roadside bay, out of the lane, so traffic passes them).
    const want = carAheadBlocked(state, car) ? 0 : car.targetSpeed;
    car.speed += (want - car.speed) * Math.min(1, dt * 1.5);
    car.x += Math.cos(car.angle) * car.speed * dt;
    car.y += Math.sin(car.angle) * car.speed * dt;
    // Stay inside the city; turn around at the edge roads.
    if (car.x < 200 || car.x > 3400 || car.y < 200 || car.y > 3400) {
      car.routeDir *= -1;
      car.angle += Math.PI;
      car.x = clamp(car.x, 200, 3400);
      car.y = clamp(car.y, 200, 3400);
    }
  }
}

export function updatePeds(state, dt) {
  const { peds, player, city } = state;
  for (const ped of peds) {
    if (ped.state === 'down') continue;
    ped.retarget -= dt;
    ped.panic = Math.max(0, ped.panic - dt);
    const dPlayer = dist(ped.x, ped.y, player.x, player.y);
    const gunfire = state.gunfireTimer > 0;
    if (ped.state === 'walk' && (dPlayer < 60 || gunfire || ped.panic > 0)) {
      ped.state = 'flee';
      ped.panic = 2;
    }
    if (ped.state === 'flee') {
      const away = Math.atan2(ped.y - player.y, ped.x - player.x);
      ped.angle = angleLerp(ped.angle, away, Math.min(1, dt * 5));
      ped.speed = 150;
      if (ped.panic <= 0 && dPlayer > 260 && !gunfire) {
        ped.state = 'walk';
        ped.speed = 45;
      }
    } else if (ped.retarget <= 0) {
      // Wander: prefer the street grid, turn at intersections.
      ped.angle = Math.floor(state.rng() * 4) * (Math.PI / 2);
      ped.retarget = floatBetween(state.rng, 2, 6);
      ped.speed = floatBetween(state.rng, 30, 60);
    }
    const nx = ped.x + Math.cos(ped.angle) * ped.speed * dt;
    const ny = ped.y + Math.sin(ped.angle) * ped.speed * dt;
    const fixed = collideCircleBuildings(city, nx, ny, 10);
    ped.x = clamp(fixed.x, 100, 3500);
    ped.y = clamp(fixed.y, 100, 3500);
  }
}

export function updateGoons(state, dt) {
  const { goons, player, city } = state;
  for (const goon of goons) {
    if (goon.state === 'down') continue;
    goon.shootCooldown -= dt;
    const d = dist(goon.x, goon.y, player.x, player.y);
    if (d < 420) {
      goon.state = 'chase';
      goon.angle = Math.atan2(player.y - goon.y, player.x - goon.x);
      if (d > 180) {
        const nx = goon.x + Math.cos(goon.angle) * goon.speed * dt;
        const ny = goon.y + Math.sin(goon.angle) * goon.speed * dt;
        const fixed = collideCircleBuildings(city, nx, ny, 12);
        goon.x = fixed.x;
        goon.y = fixed.y;
      }
      if (goon.shootCooldown <= 0 && d < 380) {
        goon.shootCooldown = floatBetween(state.rng, 1.1, 2.0);
        if (fireWeapon(state, goon.x, goon.y, goon.angle, 'pistol', 'enemy', 9)) {
          state.events.push({ type: 'enemy-shot' });
        }
      }
    } else {
      goon.state = 'guard';
    }
  }
}

// Point (bullet) against a car's top-down footprint: rotate the offset
// into the car's local frame and test the 48 x 26 px rectangle.
function bulletHitsCar(bullet, car) {
  const dx = bullet.x - car.x;
  const dy = bullet.y - car.y;
  const cos = Math.cos(car.angle);
  const sin = Math.sin(car.angle);
  const lx = dx * cos + dy * sin;
  const ly = -dx * sin + dy * cos;
  return Math.abs(lx) < 24 && Math.abs(ly) < 13;
}

export function updateBullets(state, dt) {
  const { bullets, city, player } = state;
  for (let i = bullets.length - 1; i >= 0; i -= 1) {
    const b = bullets[i];
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    b.life -= dt;
    let dead = b.life <= 0;
    // Hit a building?
    if (!dead && rectHitsBuilding(city, b.x, b.y, 2, 2)) {
      burstSparks(state, b.x, b.y);
      dead = true;
    }
    if (!dead && b.from === 'player') {
      const dmg = b.damage !== undefined && b.damage !== null ? b.damage : 25;
      for (const goon of state.goons) {
        if (goon.state !== 'down' && dist(b.x, b.y, goon.x, goon.y) < 16) {
          goon.hp -= dmg;
          burstBlood(state, goon.x, goon.y);
          if (goon.hp <= 0) {
            goon.state = 'down';
            state.stats.kills += 1;
            addWanted(state, 12);
            state.events.push({ type: 'goon-down' });
          }
          dead = true;
          break;
        }
      }
      if (!dead) {
        for (const unit of state.police) {
          if (dist(b.x, b.y, unit.x, unit.y) < 16) {
            unit.hp -= dmg;
            burstBlood(state, unit.x, unit.y);
            addWanted(state, 10);
            if (unit.hp <= 0) {
              if (unit.car) {
                const idx = state.cars.indexOf(unit.car);
                if (idx >= 0) state.cars.splice(idx, 1);
              }
              state.police.splice(state.police.indexOf(unit), 1);
              state.stats.kills += 1;
            }
            dead = true;
            break;
          }
        }
      }
      if (!dead) {
        for (const ped of state.peds) {
          if (ped.state !== 'down' && dist(b.x, b.y, ped.x, ped.y) < 14) {
            ped.hp -= dmg;
            burstBlood(state, ped.x, ped.y);
            if (ped.hp <= 0) {
              ped.state = 'down';
              addWanted(state, 15);
            }
            dead = true;
            break;
          }
        }
      }
      if (!dead) {
        // Cars: any live car except the player's own ride. A wrecked car
        // is pulled out of the world (and its cop, if any, bails out on
        // foot) so it cannot be shot — or driven — twice.
        for (const car of [...state.cars]) {
          if (car === player.car || car.hp <= 0) continue;
          if (bulletHitsCar(b, car)) {
            damageCar(state, car, 8);
            burstSparks(state, b.x, b.y);
            if (car.hp <= 0) {
              const idx = state.cars.indexOf(car);
              if (idx >= 0) state.cars.splice(idx, 1);
              const unit = state.police.find((u) => u.car === car);
              if (unit) {
                unit.car = null;
                unit.inCar = false;
                unit.x = car.x;
                unit.y = car.y;
                unit.speed = 0;
              }
            }
            dead = true;
            break;
          }
        }
      }
    } else if (!dead && b.from === 'enemy') {
      if (dist(b.x, b.y, player.x, player.y) < PLAYER_RADIUS + 2) {
        damagePlayer(state, b.damage !== undefined && b.damage !== null ? b.damage : 9, 'bullet');
        dead = true;
      }
    }
    if (dead) bullets.splice(i, 1);
  }
}

export function updateParticles(state, dt) {
  for (let i = state.particles.length - 1; i >= 0; i -= 1) {
    const p = state.particles[i];
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vx *= 0.92;
    p.vy *= 0.92;
    p.life -= dt;
    if (p.life <= 0) state.particles.splice(i, 1);
  }
  for (let i = state.skids.length - 1; i >= 0; i -= 1) {
    state.skids[i].life -= dt;
    if (state.skids[i].life <= 0) state.skids.splice(i, 1);
  }
}

// ---- stealing cars ----

// The nearest car the player can steal: on foot, within 70 px, and not
// already the player's ride. The money van is armored and never
// stealable — it is cracked, not driven.
export function nearestStealableCar(state) {
  const { player, cars } = state;
  if (!player.onFoot) return null;
  let best = null;
  let bestD = 70;
  for (const car of cars) {
    if (car.kind === 'player' || car.kind === 'van' || car.hp <= 0) continue;
    const d = dist(player.x, player.y, car.x, car.y);
    if (d < bestD) { bestD = d; best = car; }
  }
  return best;
}

export function enterCar(state, car) {
  const { player } = state;
  player.onFoot = false;
  player.car = car;
  car.kind = 'player';
  car.driver = 'player';
  player.x = car.x;
  player.y = car.y;
  player.angle = car.angle;
  state.events.push({ type: 'car-enter' });
}

export function exitCar(state) {
  const { player } = state;
  if (!player.car) return;
  const car = player.car;
  car.kind = 'parked';
  car.driver = null;
  car.speed = 0;
  // Step out to the driver's side.
  const side = player.angle + Math.PI / 2;
  player.x = car.x + Math.cos(side) * 26;
  player.y = car.y + Math.sin(side) * 26;
  player.onFoot = true;
  player.car = null;
  player.angle = car.angle;
  state.events.push({ type: 'car-exit' });
}

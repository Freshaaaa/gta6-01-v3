// Solmar Bay: Heatwave — the police. Cruisers and foot cops that chase
// the player, ram the player's car, and get out on foot when they catch
// up; plus the helicopter that joins at 3 stars, shadows the player from
// ~450 px, and opens fire in 3-round bursts at 4 stars and up.
//
// The heli never collides with buildings — it flies above the city — and
// while it is active state.heliLock stays true so main.js never lets the
// heat fade out from under it.

import { CAR_TURN_RATE } from './config.js';
import { collideCircleBuildings, nearestRoad } from './city.js';
import {
  angleLerp, burstSparks, damageCar, damagePlayer, dist, makeCar,
} from './entities.js';
import { fireWeapon } from './weapons.js';

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

// A police unit. In a car when the player drives or the heat is high;
// on foot otherwise. The unit's position follows its car while driving.
export function spawnPolice(state) {
  const { rng, player } = state;
  const inCar = !player.onFoot || state.wantedStars() >= 2;
  // Spawn ~750 px away, snapped onto a road centre line so the cruiser
  // starts on tarmac instead of inside a block. A few bearings are tried
  // so the snap never lands the unit on top of the player.
  let sx = player.x;
  let sy = player.y;
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const dir = rng() * Math.PI * 2;
    let px = player.x + Math.cos(dir) * 750;
    let py = player.y + Math.sin(dir) * 750;
    const rx = nearestRoad(px);
    const ry = nearestRoad(py);
    if (Math.abs(px - rx) <= Math.abs(py - ry)) px = rx;
    else py = ry;
    px = clamp(px, 120, 3480);
    py = clamp(py, 120, 3480);
    if (dist(px, py, player.x, player.y) < 420) continue;
    sx = px;
    sy = py;
    break;
  }
  const unit = {
    x: sx,
    y: sy,
    angle: Math.atan2(player.y - sy, player.x - sx),
    speed: 0, hp: 60, inCar, car: null,
    attackCooldown: 0, ramCooldown: 0,
  };
  if (inCar) {
    const car = makeCar(unit.x, unit.y, unit.angle, 'police', rng);
    car.speed = 200;
    state.cars.push(car);
    unit.car = car;
  }
  state.police.push(unit);
  return unit;
}

export function updatePolice(state, dt) {
  const { police, player, city } = state;
  const stars = state.wantedStars();
  for (const unit of police) {
    unit.attackCooldown -= dt;
    unit.ramCooldown -= dt;
    const tx = player.x;
    const ty = player.y;
    const d = dist(unit.x, unit.y, tx, ty);
    if (unit.inCar && unit.car) {
      const car = unit.car;
      // The cruiser this unit drove was wrecked elsewhere (a bullet blew
      // it up): the cop is on foot now, standing where the wreck was.
      if (!state.cars.includes(car)) {
        unit.inCar = false;
        unit.car = null;
        unit.x = car.x;
        unit.y = car.y;
        unit.speed = 0;
        continue;
      }
      // If the player is on foot and the cruiser catches up, the cop gets
      // out and chases on foot so an arrest stays possible.
      if (player.onFoot && d < 70) {
        const idx = state.cars.indexOf(car);
        if (idx >= 0) state.cars.splice(idx, 1);
        unit.inCar = false;
        unit.car = null;
        unit.x = car.x;
        unit.y = car.y;
        unit.speed = 0;
      } else {
        // At 3 stars and up the lead cruiser cuts the player off: it aims
        // at where the player will be in 0.6 s, not where they are now —
        // so a straight-line getaway down a long road gets intercepted.
        let aimX = tx;
        let aimY = ty;
        if (stars >= 3 && state.police[0] === unit && player.car) {
          aimX += Math.cos(player.car.angle) * player.car.speed * 0.6;
          aimY += Math.sin(player.car.angle) * player.car.speed * 0.6;
        }
        const wantAngle = Math.atan2(aimY - car.y, aimX - car.x);
        const steer = Math.sin(wantAngle - car.angle);
        car.angle += clamp(steer * 2.4, -1, 1) * CAR_TURN_RATE * 0.7 * dt
          * Math.min(1, Math.abs(car.speed) / 120 + 0.3);
        // A touch slower than the player's top speed, so a good driver can
        // actually lose them on the straights — but at 5 stars the
        // interceptors close the gap (480 instead of 440).
        const topSpeed = stars >= 5 ? 480 : 440;
        const targetSpeed = Math.min(topSpeed, 240 + d * 0.25);
        car.speed += (targetSpeed - car.speed) * Math.min(1, dt * 0.8);
        car.x += Math.cos(car.angle) * car.speed * dt;
        car.y += Math.sin(car.angle) * car.speed * dt;
        // Ram the player's car on contact (a nudge, not a wrecking ball).
        if (player.car && d < 46 && unit.ramCooldown <= 0) {
          unit.ramCooldown = 1.2;
          damageCar(state, player.car, 3);
          state.events.push({ type: 'ram' });
          burstSparks(state, (car.x + player.car.x) / 2, (car.y + player.car.y) / 2);
        }
        // A police car that clips a building is pushed out along the face
        // instead of wedging in the corner.
        const pushed = collideCircleBuildings(city, car.x, car.y, 22);
        if (dist(pushed.x, pushed.y, car.x, car.y) > 0.5) {
          car.x = pushed.x;
          car.y = pushed.y;
          car.speed = Math.min(car.speed, 120);
        }
        unit.x = car.x;
        unit.y = car.y;
        unit.angle = car.angle;
        unit.speed = car.speed;
      }
    } else {
      // On foot: run at the player, punch when close. A cop who is close
      // sprints (220) instead of jogging (185), so a foot chase stays
      // dangerous right up to the arrest.
      const wantAngle = Math.atan2(ty - unit.y, tx - unit.x);
      unit.angle = angleLerp(unit.angle, wantAngle, Math.min(1, dt * 6));
      const speed = d < 150 ? 220 : 185;
      const nx = unit.x + Math.cos(unit.angle) * speed * dt;
      const ny = unit.y + Math.sin(unit.angle) * speed * dt;
      const fixed = collideCircleBuildings(city, nx, ny, 12);
      unit.x = fixed.x;
      unit.y = fixed.y;
      if (d < 30 && unit.attackCooldown <= 0) {
        unit.attackCooldown = 0.9;
        damagePlayer(state, 7, 'police');
      }
    }
  }
}

// ---- the helicopter (3 stars and up) ----

export function spawnHeli(state) {
  state.heli = {
    x: state.player.x,
    y: state.player.y - 600,
    angle: 0,
    rotor: 0,
    shootCooldown: 2,
    leaving: false,
  };
  state.heliLock = true;
  return state.heli;
}

export function updateHeli(state, dt) {
  const heli = state.heli;
  if (!heli) {
    state.heliLock = false;
    return;
  }
  state.heliLock = true;
  const { player } = state;
  const stars = state.wantedStars();
  heli.rotor += dt * 20;

  if (stars < 3) heli.leaving = true;

  if (heli.leaving) {
    // Heat's off: fly north until well clear of the player, then leave.
    heli.y -= 320 * dt;
    heli.angle = angleLerp(heli.angle, -Math.PI / 2, Math.min(1, dt * 2));
    if (dist(heli.x, heli.y, player.x, player.y) > 1200) {
      state.heli = null;
      state.heliLock = false;
    }
    return;
  }

  // Shadow the player, holding roughly 450 px: close in when far away,
  // back off when too close, hover in between.
  const d = dist(heli.x, heli.y, player.x, player.y);
  const wantAngle = Math.atan2(player.y - heli.y, player.x - heli.x);
  heli.angle = angleLerp(heli.angle, wantAngle, Math.min(1, dt * 2.5));
  let speed = 0;
  if (d > 470) speed = 300;
  else if (d < 380) speed = -140;
  heli.x += Math.cos(heli.angle) * speed * dt;
  heli.y += Math.sin(heli.angle) * speed * dt;

  // At 4 stars and up the door gunner fires a 3-round burst every 1.6 s.
  heli.shootCooldown -= dt;
  if (stars >= 4 && heli.shootCooldown <= 0) {
    heli.shootCooldown = 1.6;
    for (let i = 0; i < 3; i += 1) {
      const a = Math.atan2(player.y - heli.y, player.x - heli.x)
        + (state.rng() - 0.5) * 0.16;
      fireWeapon(state, heli.x, heli.y, a, 'pistol', 'enemy', 6);
    }
  }
}

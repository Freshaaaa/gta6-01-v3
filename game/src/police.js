// v16 clean re-record (01a1f6c1-0eeb-7191-b67c-e5c3196775d3).
// v16: no functional change — policeCountFor already brings 9 cruisers
// at 6 stars (the finale's 9 units), and RAMMING/PURSUIT/FLANKING/
// ROADBLOCK roles are the real behaviour the HUD reads.
// Solmar Bay 3D — the police. Cruisers that chase with interception
// (aim where the player will be), separation (so they fan out instead of
// bunching single-file), rubber-band speed (a gap that opens still
// closes, but never faster than the player can escape) and re-leashing
// (a cop that falls 200 m behind reappears as a fresh interceptor on a
// street near the player, never on top of them). The wanted system is
// line-of-sight: a cop that sees the player re-centres the search on
// them; unseen, the heat cools and the stars flash; survive outside the
// search circle and the heat drops. The helicopter joins at 3 stars,
// shadows from above, and opens fire in bursts at 4 stars and up. Foot
// cops get out and arrest a slow player on foot.

import { HELI_MIN_STARS, SHORE_Z, WANTED_MAX } from './config.js';
import { clamp, dist2, lerpAngle, pick, rand, randInt, yawFromDir } from './rng.js';
import { lanePoint, nearestLane, segmentBlocked } from './city.js';
import { spawnCar, spawnGoon, addWantedHeat, hurtPlayer, addTracer } from './entities.js';
import { sfxBusted } from './audio.js';

function policeCountFor(stars) {
  // v13: a 4-star chase now brings 6 cruisers (plus the heli), and a
  // full 6-star manhunt brings 9 — the way the top entries' dispatch
  // boards read. The escape test still passes: the cops search the
  // last-seen spot, they never magically know where the player hides.
  return [0, 2, 3, 4, 6, 8, 9][stars] || 0;
}

// Solmar PD unit callsigns (invented for this game, one per cruiser,
// assigned in spawn order so the HUD's police-response list can name
// each unit — "GULL-2 · RAMMING · 24 m" — the way a real dispatch board
// does. Numbers keep rising through the session; names never repeat in
// one chase because the pool is longer than the max 9 cruisers.
const CALLSIGN_WORDS = ['GULL', 'TIDE', 'REEF', 'PIER', 'DOCK', 'PALM', 'BAY', 'HARBOR', 'STRIP', 'SURF'];

function nextCallsign(state) {
  const n = (state.policeCallIdx = (state.policeCallIdx || 0) + 1);
  return `${CALLSIGN_WORDS[(n - 1) % CALLSIGN_WORDS.length]}-${n}`;
}

function spawnPoliceCar(state) {
  const p = state.player;
  // On a street 100–140 m away, in a random direction, never on top.
  for (let tries = 0; tries < 8; tries++) {
    const a = Math.random() * Math.PI * 2;
    const d = rand(state.rng, 100, 140);
    const x = clamp(p.x + Math.cos(a) * d, 25, 515);
    const z = clamp(p.z + Math.sin(a) * d, 25, 515);
    const near = nearestLane(state.city, x, z);
    if (!near) continue;
    const pt = lanePoint(state.city, near.lane, near.t);
    const car = spawnCar(state, { name: 'Interceptor', color: '#f0f2f4', accel: 1.25, maxSpeed: 1.15, turn: 1.1, hp: 200, len: 4.5, wid: 2.0 }, pt.x, pt.z, yawFromDir(state.city.lanes[near.lane].x1 - state.city.lanes[near.lane].x0, state.city.lanes[near.lane].z1 - state.city.lanes[near.lane].z0), { state: 'police', police: true });
    car.lane = near.lane;
    car.laneT = near.t;
    car.cruise = 30;
    car.callsign = nextCallsign(state);
    return car;
  }
  return null;
}

function anyCopSeesPlayer(state) {
  const p = state.player;
  for (const car of state.cars) {
    if (!car.police || car.state === 'wreck' || car.state === 'burning') continue;
    const d = Math.hypot(car.x - p.x, car.z - p.z);
    if (d < 130 && !segmentBlocked(state.city, car.x, car.z, p.x, p.z)) return true;
  }
  for (const goon of state.goons) {
    if (goon.isCop && goon.state !== 'dead') {
      const d = Math.hypot(goon.x - p.x, goon.z - p.z);
      if (d < 60 && !segmentBlocked(state.city, goon.x, goon.z, p.x, p.z)) return true;
    }
  }
  return false;
}

/** The roadblock point (v15, re-recorded): ~75 m ahead of the player's heading,
 * snapped to the nearest road, with the road's direction — the two
 * roadblock cruisers park across it, perpendicular to traffic. It is
 * anchored on lastSeen, not on the live player: while the player is
 * seen, lastSeen updates every frame so the point tracks the chase;
 * once the player breaks sight, lastSeen freezes and the roadblock
 * stays put — a live-tracking roadblock would park on top of a hiding
 * player and pin them forever (the cops would keep them 'seen' and
 * the heat would never drain). */
function roadblockPoint(state) {
  const p = state.player;
  const anchor = state.lastSeen || { x: p.x, z: p.z, yaw: p.yaw };
  const heading = anchor.yaw !== undefined ? anchor.yaw : p.yaw;
  const px = anchor.x + Math.sin(heading) * 75;
  const pz = anchor.z + Math.cos(heading) * 75;
  const near = nearestLane(state.city, px, pz);
  if (!near) return null;
  const pt = lanePoint(state.city, near.lane, near.t);
  return { x: pt.x, z: pt.z, yaw: yawFromDir(pt.dirX, pt.dirZ) };
}

export function updateWanted(state, dt) {
  const p = state.player;
  const stars = Math.min(WANTED_MAX, Math.floor((state.wantedHeat || 0) / 25));
  state.wantedStars = stars;
  if (stars === 0) {
    if (state.wantedState !== 'none') {
      state.wantedState = 'none';
      state.toast = 'You lost the cops.';
      state.toastTimer = 2.5;
    }
    // Despawn police gradually once the heat is gone.
    for (const car of state.cars) {
      if (car.police && Math.random() < dt * 0.25) car.removed = true;
    }
    state.cars = state.cars.filter((c) => !c.removed);
    if (state.heli) state.heli.active = false;
    return;
  }
  if (state.wantedState === 'none') {
    state.wantedState = 'chasing';
    state.lastSeen = { x: p.x, z: p.z, yaw: p.yaw };
    state.evadeTimer = 0;
  }
  const seen = anyCopSeesPlayer(state);
  state.playerSeen = seen;
  if (seen) {
    state.lastSeen = { x: p.x, z: p.z, yaw: p.yaw };
    state.evadeTimer = 0;
    if (state.wantedState === 'escaping') {
      state.wantedState = 'chasing';
      state.toast = 'Spotted again!';
      state.toastTimer = 2;
    }
  } else {
    state.evadeTimer += dt;
    if (state.wantedState === 'chasing' && state.evadeTimer > 4) {
      state.wantedState = 'escaping';
      state.toast = 'Lose them — stay out of the search circle!';
      state.toastTimer = 3;
    }
    if (state.wantedState === 'escaping') {
      const d = Math.hypot(p.x - state.lastSeen.x, p.z - state.lastSeen.z);
      // Outside the circle and unseen: the heat drains fast.
      if (d > 55) {
        state.wantedHeat = Math.max(0, state.wantedHeat - dt * 12);
        if (state.wantedHeat <= 0) {
          state.wantedStars = 0;
          state.wantedState = 'none';
          state.toast = 'You lost the cops.';
          state.toastTimer = 2.5;
        }
      }
    }
  }
  // Spawn cruisers up to the level's count.
  const want = policeCountFor(stars);
  let have = state.cars.filter((c) => c.police && c.state !== 'wreck' && c.state !== 'burning').length;
  state.spawnTimer = (state.spawnTimer || 0) - dt;
  if (have < want && state.spawnTimer <= 0) {
    state.spawnTimer = 2.5;
    if (spawnPoliceCar(state)) have++;
  }
  // Helicopter at 3+ stars.
  if (stars >= HELI_MIN_STARS) {
    if (!state.heli) state.heli = { active: false, x: p.x, y: 42, z: p.z - 60, yaw: 0, mode: 'chase', lightX: p.x, lightZ: p.z, shootTimer: 2, searchAngle: 0 };
    if (!state.heli.active) {
      state.heli.active = true;
      state.heli.x = p.x + rand(state.rng, -60, 60);
      state.heli.z = p.z + rand(state.rng, -60, 60);
      state.heli.y = 42;
      state.toast = 'Police helicopter overhead!';
      state.toastTimer = 3;
    }
  } else if (state.heli) {
    state.heli.active = false;
  }
  // Roadblock (v15): at 4+ stars, two cruisers break off and park
  // across the road ahead — the way the top entries' dispatch boards
  // show ROADBLOCK. The point sits ~75 m ahead of the player's
  // heading, snapped to the nearest road, and re-tracks every 3 s. It
  // releases when the heat drops, the player breaks sight (escaping),
  // or after 25 s — a parked roadblock must never pin a hiding
  // player forever.
  if (state.roadblock) {
    const rb = state.roadblock;
    rb.age = (rb.age || 0) + dt;
    rb.retarget = (rb.retarget || 0) - dt;
    const passed = Math.hypot(p.x - rb.x, p.z - rb.z) < 25;
    if (stars < 4 || state.wantedState !== 'chasing' || passed || rb.age > 25) {
      for (const car of state.cars) car.roadblock = false;
      state.roadblock = null;
    } else if (rb.retarget <= 0) {
      rb.retarget = 3;
      const pt = roadblockPoint(state);
      if (pt) { rb.x = pt.x; rb.z = pt.z; rb.yaw = pt.yaw; }
    }
  } else if (stars >= 4 && state.wantedState === 'chasing') {
    const pt = roadblockPoint(state);
    if (pt) {
      const cops = state.cars
        .filter((c) => c.police && c.state !== 'wreck' && c.state !== 'burning' && !c.roadblock)
        .sort((a, b) => (Math.hypot(b.x - p.x, b.z - p.z) - Math.hypot(a.x - p.x, a.z - p.z)));
      if (cops.length >= 2) {
        cops[0].roadblock = true;
        cops[1].roadblock = true;
        state.roadblock = { x: pt.x, z: pt.z, yaw: pt.yaw, age: 0, retarget: 3 };
      }
    }
  }
  // Busted: on foot, slow, surrounded by foot cops.
  if (p.onFoot && (p.speed || 0) < 1) {
    let near = 0;
    let closest = Infinity;
    for (const goon of state.goons) {
      if (!goon.isCop || goon.state === 'dead') continue;
      const d = Math.hypot(goon.x - p.x, goon.z - p.z);
      if (d < 9) near++;
      closest = Math.min(closest, d);
    }
    if (near >= 2 && closest < 4) {
      p.bustedTimer += dt;
      if (p.bustedTimer > 2) {
        state.mode = 'busted';
        state.bustedAt = state.realTime ?? state.time;
        sfxBusted();
      }
    } else {
      p.bustedTimer = Math.max(0, p.bustedTimer - dt * 2);
    }
  } else {
    p.bustedTimer = Math.max(0, p.bustedTimer - dt * 2);
  }
}

export function updatePolice(state, dt) {
  const p = state.player;
  // The vehicle the player is driving (car or boat) — the pursuit
  // reads speed and heading from it, so a boat chase works too.
  const veh = !p.onFoot ? (p.car || p.boat) : null;
  const pSpeed = p.onFoot ? (p.speed || 0) : Math.abs(veh ? veh.vF : 0);
  // While the player is escaping, the cops search the last-seen spot —
  // they do not magically know where the player is.
  const searching = state.wantedState === 'escaping' && state.lastSeen;
  let tpX = searching ? state.lastSeen.x : p.x;
  let tpZ = searching ? state.lastSeen.z : p.z;
  // The shore (v14): cruisers cannot follow a boat onto the water, so
  // when the player is afloat the ground cops hold the shoreline and
  // watch — the boat is the escape. (The helicopter still follows.)
  const onWater = !p.onFoot && !!p.boat;
  if (onWater && !searching) tpZ = Math.min(tpZ, SHORE_Z);
  for (const car of state.cars) {
    if (!car.police || car.state === 'wreck' || car.state === 'burning') continue;
    // Roadblock (v15): a designated cruiser drives to the roadblock
    // point and parks across the road, perpendicular to traffic. It
    // does not chase, does not re-leash, and its role reads ROADBLOCK
    // on the dispatch board.
    if (car.roadblock && state.roadblock) {
      const rb = state.roadblock;
      const rdx = rb.x - car.x;
      const rdz = rb.z - car.z;
      const rgap = Math.hypot(rdx, rdz);
      car.role = 'ROADBLOCK';
      if (rgap < 10) {
        car.throttle = 0;
        car.vF *= Math.max(0, 1 - 4 * dt);
        car.yaw = lerpAngle(car.yaw, rb.yaw + Math.PI / 2, 1 - Math.exp(-4 * dt));
        car.steerIn = 0;
      } else {
        const rYaw = yawFromDir(rdx, rdz);
        let rdyaw = rYaw - car.yaw;
        while (rdyaw > Math.PI) rdyaw -= Math.PI * 2;
        while (rdyaw < -Math.PI) rdyaw += Math.PI * 2;
        car.steerIn = clamp(rdyaw * 2.2, -1, 1);
        car.throttle = Math.abs(car.vF) < 34 ? 1 : 0;
      }
      car.handbrake = false;
      continue;
    }
    const dx = tpX - car.x;
    const dz = tpZ - car.z;
    const gap = Math.hypot(dx, dz);
    // Re-leash: a cop that fell 220 m behind reappears near the LAST-SEEN
    // spot — never on top of the player. Teleporting cops onto a hiding
    // player made escaping by distance impossible (they would spot the
    // player the moment they arrived).
    if (gap > 220) {
      const anchor = state.lastSeen || { x: p.x, z: p.z };
      const near = nearestLane(state.city, anchor.x + rand(state.rng, -110, 110), anchor.z + rand(state.rng, -110, 110));
      const pt = lanePoint(state.city, near.lane, near.t);
      car.x = pt.x;
      car.z = pt.z;
      car.vF = 0;
      car.vL = 0;
      car.lane = near.lane;
      car.laneT = near.t;
      continue;
    }
    // Interception: aim where the target will be (no lead while searching).
    const pvx = searching ? 0 : (p.onFoot ? Math.sin(p.yaw) * pSpeed : Math.sin(veh.yaw) * veh.vF);
    const pvz = searching ? 0 : (p.onFoot ? Math.cos(p.yaw) * pSpeed : Math.cos(veh.yaw) * veh.vF);
    const leadT = Math.min(1.2, gap / (Math.abs(car.vF) + pSpeed + 1));
    const tx = tpX + pvx * leadT;
    const tz = tpZ + pvz * leadT;
    let desiredYaw = yawFromDir(tx - car.x, tz - car.z);
    // Separation: push away from nearby cops so they fan out.
    let sepX = 0;
    let sepZ = 0;
    for (const other of state.cars) {
      if (other === car || !other.police) continue;
      const ox = car.x - other.x;
      const oz = car.z - other.z;
      const od2 = ox * ox + oz * oz;
      if (od2 < 30 * 30 && od2 > 0.01) {
        const w = 1 / od2;
        sepX += (ox / Math.sqrt(od2)) * w;
        sepZ += (oz / Math.sqrt(od2)) * w;
      }
    }
    if (sepX !== 0 || sepZ !== 0) {
      desiredYaw = yawFromDir(Math.sin(desiredYaw) + sepX * 8, Math.cos(desiredYaw) + sepZ * 8);
    }
    // RAMMING (v15): a cruiser right on the player's bumper stops
    // intercepting and drives straight into them — full throttle,
    // no separation swerve, role reads RAMMING on the dispatch board.
    // Only against a vehicle (never a player on foot, never a boat —
    // cruisers cannot ram across the water).
    const ramming = !searching && !p.onFoot && !onWater && gap < 15;
    if (ramming) desiredYaw = yawFromDir(dx, dz);
    let dyaw = desiredYaw - car.yaw;
    while (dyaw > Math.PI) dyaw -= Math.PI * 2;
    while (dyaw < -Math.PI) dyaw += Math.PI * 2;
    car.steerIn = clamp(dyaw * 2.2, -1, 1);
    // Rubber-band speed: ramps with the gap, capped just under the
    // player's top speed so the chase stays escapable.
    const chaseSpeed = clamp(30 + gap * 0.12, 30, 46);
    const onFoot = p.onFoot && !searching;
    if (onFoot && gap < 10) {
      // Stop and send a foot cop after the player.
      car.throttle = gap > 6 ? 0.5 : 0;
      if (gap < 8 && state.goons.filter((g) => g.isCop && g.state !== 'dead').length < 2 && Math.random() < dt * 0.5) {
        const cop = spawnGoon(state, car.x + 2, car.z + 2);
        cop.isCop = true;
        cop.shirt = '#1c2733';
        cop.hp = 80;
      }
    } else {
      car.throttle = Math.abs(car.vF) < chaseSpeed ? 1 : 0;
      if (gap < 8 && !onFoot) car.throttle = 1; // ram
    }
    car.handbrake = false;
    // The dispatch role is the car's real behaviour this frame, not a
    // distance guess — the HUD reads car.role.
    car.role = ramming ? 'RAMMING' : gap < 40 ? 'PURSUIT' : gap < 100 ? 'FLANKING' : 'RESPONDING';
  }
  // Foot cops chase and arrest (they never shoot). While searching they
  // head for the last-seen spot, like the cruisers.
  for (const goon of state.goons) {
    if (!goon.isCop || goon.state === 'dead') continue;
    const dx = tpX - goon.x;
    const dz = tpZ - goon.z;
    const d = Math.hypot(dx, dz);
    goon.yaw = lerpAngle(goon.yaw, yawFromDir(dx, dz), 1 - Math.exp(-6 * dt));
    if (d > 1.6) {
      const speed = 5.2;
      goon.x += (dx / d) * speed * dt;
      goon.z += (dz / d) * speed * dt;
      goon.walkPhase += dt * speed * 1.8;
      goon.moving = true;
    } else {
      goon.moving = false;
    }
  }
}

export function updateHeli(state, dt) {
  const h = state.heli;
  if (!h || !h.active) return;
  const p = state.player;
  // The heli follows what the ground cops can actually see: while the
  // player is hidden it searches the last-seen spot instead of magically
  // tracking them.
  const seen = state.playerSeen === true;
  h.mode = seen ? 'chase' : 'search';
  const targetX = seen ? p.x : state.lastSeen.x;
  const targetZ = seen ? p.z : state.lastSeen.z;
  if (h.mode === 'search') {
    h.searchAngle += dt * 0.6;
    const ox = Math.cos(h.searchAngle) * 40;
    const oz = Math.sin(h.searchAngle) * 40;
    h.x += ((targetX + ox) - h.x) * (1 - Math.exp(-0.8 * dt));
    h.z += ((targetZ + oz) - h.z) * (1 - Math.exp(-0.8 * dt));
    // Searchlight sweeps around the last-seen point.
    h.lightX = targetX + Math.cos(h.searchAngle * 1.7) * 30;
    h.lightZ = targetZ + Math.sin(h.searchAngle * 1.7) * 30;
  } else {
    // Shadow the player from above, lagging behind their motion.
    h.x += (p.x - h.x) * (1 - Math.exp(-1.1 * dt));
    h.z += (p.z - h.z) * (1 - Math.exp(-1.1 * dt));
    h.lightX = p.x;
    h.lightZ = p.z;
  }
  h.y = 42;
  const dx = targetX - h.x;
  const dz = targetZ - h.z;
  if (Math.hypot(dx, dz) > 2) h.yaw = lerpAngle(h.yaw, yawFromDir(dx, dz), 1 - Math.exp(-2 * dt));
  // Open fire in bursts at 4+ stars while chasing.
  if (state.wantedStars >= 4 && h.mode === 'chase' && !p.onFoot) {
    h.shootTimer -= dt;
    if (h.shootTimer <= 0) {
      h.shootTimer = 1.4;
      h.burstLeft = 3;
      h.burstTimer = 0;
    }
  }
  if (h.burstLeft > 0) {
    h.burstTimer -= dt;
    if (h.burstTimer <= 0) {
      h.burstTimer = 0.13;
      h.burstLeft--;
      addTracer(state, h.x, h.y - 1, h.z, p.x + rand(state.rng, -2, 2), 1.2, p.z + rand(state.rng, -2, 2));
      if (Math.random() < 0.3) hurtPlayer(state, randInt(state.rng, 4, 8));
    }
  }
}

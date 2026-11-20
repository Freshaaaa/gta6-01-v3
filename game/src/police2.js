// Solmar Bay — police escalation, second wave (v17).
//
// Three new systems that sit on top of the base pursuit in police.js
// without touching it. The base file still owns the cruiser chase,
// the helicopter, the roadblock and the wanted heat; this file only
// adds what happens when the heat gets serious:
//
//   1. MANHUNT (6 stars). While the player is wanted at six stars
//      and the chase is live, two extra interceptors join the hunt
//      on top of the nine cruisers the base game already fields.
//      They are ordinary police cars in every way that matters —
//      they carry .police, so updatePolice chases, re-leashes and
//      rams with them exactly like any other cruiser — except they
//      are tagged .manhunt, they answer to the MANHUNT-1 / MANHUNT-2
//      callsigns, and they cruise a touch faster than a standard
//      unit. The moment the heat falls below six stars they are
//      stood down and removed. If one is wrecked mid-manhunt a
//      replacement rolls in, so the pair is kept whole until the
//      heat itself drops.
//
//   2. SPIKE UNITS (4+ stars). Once the heat reaches four stars, one
//      live cruiser is picked as the spike unit: it keeps chasing
//      like any other cop, but when it gets within 25 metres of the
//      player's car and is roughly ahead of the player's heading —
//      the dot product of the heading and the direction to the unit
//      is above 0.5 — it drops a spike strip on the road at its own
//      position. A unit rearms 8 seconds after each drop. A strip
//      lives 12 seconds, is 6 metres across, and is spent the first
//      time the player's car rolls over it: the car loses 20 hp and
//      half its forward speed on the spot.
//
//      Strips are plain state, so the renderer can draw them however
//      it likes. The shape the render hook should expect is:
//        state.spikes = [ { x, z, radius: 6, life: 12 }, ... ]
//      with x/z in world metres, radius in metres, and life counting
//      down in seconds. This module owns the whole lifecycle:
//      creating strips, ageing them, spending them on a hit, and
//      filtering the dead ones out every frame.
//
//   3. RADIO CHATTER. While any heat is on the board, dispatch talks
//      every 10 seconds: a toast prefixed with the radio glyph plus
//      a matching line in the phone feed, cycling through twelve
//      dispatch lines written for this file. The timer lives on the
//      state as chatterTimer and resets whenever the heat clears, so
//      a fresh chase always starts with a fresh line.
//
// State owned by this file (all lazily created on state):
//   state.manhuntCars  [car, car] the live manhunt interceptors
//   state.spikes       [{ x, z, radius, life }] live spike strips
//   state.chatterTimer seconds until the next dispatch line
//   state.chatterIndex which chatter line comes next
//
// Integration note: call updatePolice2 after updatePolice each
// frame, so the SPIKE role this file stamps on the spike unit is
// not overwritten by the base pursuit's per-frame role labels, and
// call updateChatter once per frame alongside it.

import { spawnCar, spawnParticles } from './entities.js';
import { lanePoint, nearestLane } from './city.js';
import { clamp, rand, yawFromDir } from './rng.js';
import { pushFeed } from './activities.js';

// ---- tuning: every number this file uses, in one place ----

// MANHUNT: two extra interceptors at six stars, cruising at 34 m/s.
// The interceptor spec is deliberately a step up from the standard
// cruiser — quicker off the line, a higher top end, sharper turn-in,
// and 220 hp instead of 200 — because a six-star chase should feel
// like the whole department has come to town.
export const MANHUNT_MIN_STARS = 6;
export const MANHUNT_COUNT = 2;
export const MANHUNT_CRUISE = 34;
export const MANHUNT_SPEC = {
  name: 'Interceptor',
  color: '#f0f2f4',
  accel: 1.35,
  maxSpeed: 1.22,
  turn: 1.15,
  hp: 220,
  len: 4.5,
  wid: 2.0,
};
export const MANHUNT_SPAWN_MIN = 90;
export const MANHUNT_SPAWN_MAX = 130;

// SPIKE UNITS: designated at four stars and up. A strip drops only
// when the unit is close (25 m) and ahead of the player (the heading
// dot product above 0.5, about a 60-degree cone in front of the car),
// so the player can see the unit coming and has a chance to swerve.
// One drop per unit every 8 seconds; a strip is 6 m across, lives
// 12 seconds, costs 20 hp and halves forward speed on a hit.
export const SPIKE_MIN_STARS = 4;
export const SPIKE_RANGE = 25;
export const SPIKE_AHEAD_DOT = 0.5;
export const SPIKE_RADIUS = 6;
export const SPIKE_LIFE = 12;
export const SPIKE_DAMAGE = 20;
export const SPIKE_SLOW = 0.5;
export const SPIKE_REARM_SECONDS = 8;

// CHATTER: one dispatch line every 10 seconds while wanted.
export const CHATTER_INTERVAL = 10;

// ---- dispatch chatter: twelve lines written for this file ----
//
// New callsigns for the second wave — MARLIN, ANCHOR, JETTY, LAGOON,
// BREAKWATER and CURRENT — none of which the base game's dispatch
// board uses. The lines are written to sound like a department that
// is losing a chase in real time: requests for backup, lost visuals,
// the mayor asking questions, and the bridge the suspect must never
// reach.

export const CHATTER_LINES = [
  'MARLIN-2 to dispatch, the suspect just ran the Marina lights — requesting a second unit on Ocean Drive.',
  'ANCHOR-7 here, I have eyes on a pink sports car weaving through the Strip. Moving to intercept.',
  'Dispatch to all units: the suspect is using the side streets. Seal the Coral Row exits.',
  'JETTY-4, I lost visual near the lighthouse. Somebody check the beach road.',
  'LAGOON-1 to dispatch: the helicopter is burning fuel — get ground units on that car now.',
  'BREAKWATER-9 here, spike strips are authorised. Mind the taxi drivers.',
  'Dispatch: the suspect just clipped a lamppost on Palm Court. He is rattled — press him.',
  'CURRENT-3 to MARLIN-2, I am coming up behind him on the coast road. Keep him in the open.',
  'ANCHOR-7 again — he doubled back through Downtown. Do not let him reach the hideout side.',
  'Dispatch to all units: the mayor is asking questions. End this chase before the evening news.',
  'JETTY-4, the suspect is heading for the docks. Block the harbour mouth.',
  'LAGOON-1: if he makes the bridge, we lose him. Somebody get ahead of him.',
];

// ---- manhunt ----

// A live manhunt car: still in the world, still a police car, not a
// wreck and not burning. Anything else is a slot that needs a
// replacement — or, once the heat drops, a car to stand down.
function manhuntAlive(car) {
  return !!car && !car.removed && car.state !== 'wreck' && car.state !== 'burning';
}

// Roll one manhunt interceptor onto a lane near the player. The spot
// is picked the way the base game picks a cruiser spawn — a random
// bearing, 90 to 130 metres out, snapped to the nearest lane — so a
// manhunt unit never appears on top of the player, only down the
// road where a real response unit would arrive from.
function spawnManhuntCar(state, callsign) {
  const p = state.player;
  for (let attempt = 0; attempt < 6; attempt++) {
    const bearing = Math.random() * Math.PI * 2;
    const distance = rand(state.rng, MANHUNT_SPAWN_MIN, MANHUNT_SPAWN_MAX);
    const x = clamp(p.x + Math.cos(bearing) * distance, 25, 515);
    const z = clamp(p.z + Math.sin(bearing) * distance, 25, 515);
    const near = nearestLane(state.city, x, z);
    if (!near) continue;
    const spot = lanePoint(state.city, near.lane, near.t);
    const lane = state.city.lanes[near.lane];
    const car = spawnCar(
      state,
      MANHUNT_SPEC,
      spot.x,
      spot.z,
      yawFromDir(lane.x1 - lane.x0, lane.z1 - lane.z0),
      { state: 'police', police: true },
    );
    car.lane = near.lane;
    car.laneT = near.t;
    car.cruise = MANHUNT_CRUISE;
    car.callsign = callsign;
    car.manhunt = true;
    return car;
  }
  return null;
}

// Keep the manhunt pair whole while the chase is at six stars: any
// callsign slot without a live car gets a fresh interceptor. The
// callsigns are stable per slot, so the dispatch board never shows
// two MANHUNT-1s or a MANHUNT-3.
function ensureManhunt(state) {
  if (!state.manhuntCars) state.manhuntCars = [];
  state.manhuntCars = state.manhuntCars.filter(manhuntAlive);
  for (let slot = 0; slot < MANHUNT_COUNT; slot++) {
    const callsign = `MANHUNT-${slot + 1}`;
    const present = state.manhuntCars.some((c) => c.callsign === callsign);
    if (present) continue;
    const car = spawnManhuntCar(state, callsign);
    if (car) state.manhuntCars.push(car);
  }
}

// Stand the manhunt down: every tracked interceptor is flagged
// removed and taken out of the car pool, and the tracking list is
// cleared so the next six-star chase starts from a clean pair.
function releaseManhunt(state) {
  if (!state.manhuntCars || state.manhuntCars.length === 0) return;
  for (const car of state.manhuntCars) {
    if (car) car.removed = true;
  }
  state.cars = state.cars.filter((c) => !(c.manhunt && c.removed));
  state.manhuntCars = [];
}

// ---- spike units ----

// Is this car fit to carry spikes: a live police cruiser that is not
// a manhunt interceptor (those are pursuit specialists) and not
// parked on roadblock duty (a parked car cannot lay a strip ahead of
// a moving player).
function spikeCandidate(car) {
  return !!car && car.police && !car.removed && !car.manhunt && !car.roadblock &&
    car.state !== 'wreck' && car.state !== 'burning';
}

// Pick the spike unit for this chase: keep the current one while it
// is still fit, otherwise hand the job to the live cruiser nearest
// the player. Exactly one unit carries spikes at a time, so the road
// never fills with strips from every direction at once.
function designateSpikeUnit(state) {
  const p = state.player;
  const current = state.cars.find((c) => c.spike && spikeCandidate(c));
  if (current) {
    current.role = 'SPIKE';
    return current;
  }
  let best = null;
  let bestD = Infinity;
  for (const car of state.cars) {
    if (!spikeCandidate(car)) continue;
    const d = (car.x - p.x) * (car.x - p.x) + (car.z - p.z) * (car.z - p.z);
    if (d < bestD) { bestD = d; best = car; }
  }
  if (!best) return null;
  best.spike = true;
  best.role = 'SPIKE';
  best.spikeTimer = 0;
  return best;
}

// Take the spike job away from every car (the heat fell below four
// stars). The role label is left for the base pursuit to rewrite on
// its next pass; only the spike flag matters here.
function clearSpikeUnits(state) {
  for (const car of state.cars) {
    if (car.spike) {
      car.spike = false;
      car.spikeTimer = 0;
    }
  }
}

// The drop itself: the spike unit may only lay a strip when the
// player is driving, the unit is close, it is roughly ahead of the
// player's heading, and its 8-second rearm has finished. The strip
// lands where the unit is standing — right in the player's path —
// and the rearm clock restarts whether or not the strip ever hits.
function updateSpikeDrops(state, dt) {
  const unit = state.cars.find((c) => c.spike && spikeCandidate(c));
  if (!unit) return;
  unit.spikeTimer = Math.max(0, (unit.spikeTimer || 0) - dt);
  const p = state.player;
  if (p.onFoot || !p.car) return;
  const car = p.car;
  if (car.state === 'wreck' || car.state === 'burning') return;
  if (unit.spikeTimer > 0) return;
  const dx = unit.x - p.x;
  const dz = unit.z - p.z;
  const gap = Math.hypot(dx, dz);
  if (gap > SPIKE_RANGE || gap < 0.01) return;
  // Ahead check: the unit must sit inside a cone in front of the
  // player's heading, not behind them where a strip could never be
  // driven over. A dot product above 0.5 is roughly a 60-degree cone.
  const headingX = Math.sin(p.yaw);
  const headingZ = Math.cos(p.yaw);
  const dot = headingX * (dx / gap) + headingZ * (dz / gap);
  if (dot <= SPIKE_AHEAD_DOT) return;
  if (!state.spikes) state.spikes = [];
  state.spikes.push({ x: unit.x, z: unit.z, radius: SPIKE_RADIUS, life: SPIKE_LIFE });
  unit.spikeTimer = SPIKE_REARM_SECONDS;
}

// Age every live strip and resolve hits. A strip is spent the first
// time the player's car rolls inside it: 20 hp off the car, forward
// speed halved, a shredded-tires toast, a shake and a puff of rubber
// smoke — and then the strip is gone, so one strip can never hit the
// same car twice.
function updateSpikeStrips(state, dt) {
  if (!state.spikes) state.spikes = [];
  const p = state.player;
  const car = !p.onFoot ? p.car : null;
  for (const strip of state.spikes) {
    strip.life -= dt;
    if (strip.life <= 0) continue;
    if (!car || car.state === 'wreck' || car.state === 'burning') continue;
    const d2 = (car.x - strip.x) * (car.x - strip.x) + (car.z - strip.z) * (car.z - strip.z);
    if (d2 > strip.radius * strip.radius) continue;
    car.hp = Math.max(0, car.hp - SPIKE_DAMAGE);
    car.vF *= SPIKE_SLOW;
    strip.life = 0;
    state.camShake = Math.max(state.camShake || 0, 0.4);
    spawnParticles(state, car.x, 0.4, car.z, { count: 10, color: '#555555', speed: 3, life: 0.7, up: 2 });
    state.toast = 'Spike strip! Tires shredded.';
    state.toastTimer = 2.5;
    // A car reduced to zero health by the spikes catches fire the
    // same way any other fatal damage would — the burning state is
    // what the rest of the game watches for, so it is set here
    // rather than leaving a 0-hp car driving around.
    if (car.hp <= 0) {
      car.state = 'burning';
      car.burnTimer = 3;
      state.toast = 'Spike strip! Tires shredded — and the car is on fire.';
      state.toastTimer = 3;
    }
  }
  // Tidy up: drop every strip that expired or was spent, so the list
  // never grows past the handful that can be live at once.
  state.spikes = state.spikes.filter((s) => s.life > 0);
}

// ---- the per-frame escalation update ----

export function updatePolice2(state, dt) {
  if (!state.spikes) state.spikes = [];
  if (!state.manhuntCars) state.manhuntCars = [];
  const stars = state.wantedStars || 0;

  // MANHUNT: two extra interceptors while the chase sits at six
  // stars. Replacements roll in while the chase is live; the pair is
  // stood down the moment the heat falls below six stars.
  if (stars >= MANHUNT_MIN_STARS) {
    if (state.wantedState === 'chasing') ensureManhunt(state);
    // Prune the tracking list even when the chase is not live, so a
    // wrecked manhunt car never lingers as a ghost entry.
    state.manhuntCars = state.manhuntCars.filter(manhuntAlive);
  } else {
    releaseManhunt(state);
  }

  // SPIKE UNITS: one designated cruiser at four stars and up, laying
  // strips ahead of the player; the designation is lifted entirely
  // when the heat falls back below four stars.
  if (stars >= SPIKE_MIN_STARS) {
    designateSpikeUnit(state);
    updateSpikeDrops(state, dt);
  } else {
    clearSpikeUnits(state);
  }
  updateSpikeStrips(state, dt);
}

// ---- radio chatter ----

// One dispatch line every 10 seconds while the player is wanted.
// The toast carries the radio glyph so it reads as dispatch traffic
// at a glance, and the same line lands in the phone feed under the
// Solmar PD name. When the heat clears the timer resets, so the
// next chase opens with a fresh line instead of resuming mid-count.
export function updateChatter(state, dt) {
  if (state.chatterTimer === undefined || state.chatterTimer === null) {
    state.chatterTimer = CHATTER_INTERVAL;
  }
  if (state.chatterIndex === undefined || state.chatterIndex === null) {
    state.chatterIndex = 0;
  }
  const stars = state.wantedStars || 0;
  if (stars <= 0) {
    state.chatterTimer = CHATTER_INTERVAL;
    return;
  }
  state.chatterTimer -= dt;
  if (state.chatterTimer > 0) return;
  state.chatterTimer = CHATTER_INTERVAL;
  const line = CHATTER_LINES[state.chatterIndex % CHATTER_LINES.length];
  state.chatterIndex++;
  state.toast = `📻 PD: ${line}`;
  state.toastTimer = 4;
  pushFeed(state, 'Solmar PD', line);
}

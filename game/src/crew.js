// Solmar Bay — crew abilities, second wave (v17).
//
// This file is the active-crew layer: the three original crew members
// (Mara, Lio, Kiki) plus three late-story recruits (Rook, Juno, Vera)
// each get one ability the player fires with a digit key, 5 through 0.
// The abilities are real state changes, not flavour text:
//
//   * WHEELMAN (Mara, key 5) — for 12 seconds the player's car gets a
//     forward shove every frame, up to 25% past its normal top speed.
//     The physics step still owns braking, steering and collisions;
//     this module only adds the impulse, so the boost can never
//     teleport the car or break the collision code.
//   * FIXER (Lio, key 6) — the driven car is repaired to full health
//     on the spot. It does nothing on foot, and it does not spend its
//     cooldown when there is no car to fix.
//   * LOOKOUT (Kiki, key 7) — for 20 seconds the minimap shows every
//     police unit and the money van. The flag lives on the state as
//     abilityRevealUntil; the minimap reads it, this file only owns
//     the timer.
//   * STRONG-ARM (Rook, key 8) — Rook leans on the chase: wanted heat
//     drops by 50 at once, and every cruiser within 40 metres gives
//     up, turns back into ordinary traffic and stops chasing.
//   * SCOUT (Juno, key 9) — Juno rides ahead and marks the nearest
//     live activity on the map with a marker and a GPS route for 20
//     seconds: the money van first, then the Stadium, then the Docks
//     chop shop, then the nearest landmark as a safety net.
//   * CLOSER (Vera, key 0) — Vera finishes whatever the player is
//     doing: a kill step is completed outright, a timed step gets all
//     its checkpoints ticked plus 25 extra seconds, a hold step is
//     done instantly, and any other step pays a $500 closer bonus
//     and sheds 25 heat.
//
// Keys, cooldowns and unlock rules all live in the ABILITIES and
// NEW_CREW tables below, so the HUD bar and the unlock checks read
// the same numbers the effects use. Digit keys are only honoured
// while the game is in 'play' mode with no menu open — the garage,
// tuning and phone menus own digits 0-7 for their own lists, and
// this module never steals a press from them.
//
// State owned by this file (all lazily created on state):
//   state.abilities        { abilityId -> readyAt time } (cooldowns)
//   state.abilityBoostUntil  time the WHEELMAN shove expires (0 = off)
//   state.abilityBoostMult   the top-speed multiplier while boosting
//   state.abilityRevealUntil time the LOOKOUT reveal expires (0 = off)
//   state.abilityScoutUntil  time the SCOUT marker expires (0 = off)
//   state.abilityScoutTarget { x, z } the point SCOUT marked, so the
//                            expiry only clears the marker if nothing
//                            else has replaced it since.

import { CAR_MAX_SPEED, LANDMARKS, crewUnlocked } from './config.js';
import { addWantedHeat } from './entities.js';
import { gpsRoute } from './city.js';
import { pushFeed } from './activities.js';

// ---- tuning: every number an ability uses, in one place ----

// WHEELMAN: +25% top speed for 12 s, recharged after 45 s. The shove
// is 6 m/s of extra forward speed per second of boost, capped at the
// boosted top speed — a gentle push, not a rocket.
export const WHEELMAN_DURATION = 12;
export const WHEELMAN_MULT = 1.25;
export const WHEELMAN_IMPULSE = 6;
export const WHEELMAN_COOLDOWN = 45;

// FIXER: instant full repair, recharged after 60 s.
export const FIXER_COOLDOWN = 60;

// LOOKOUT: full police + van reveal for 20 s, recharged after 60 s.
export const LOOKOUT_DURATION = 20;
export const LOOKOUT_COOLDOWN = 60;

// STRONG-ARM: heat cut of 50 (two stars) and every cruiser inside
// 40 m stands down. Recharged after 75 s.
export const STRONGARM_HEAT_CUT = 50;
export const STRONGARM_RANGE = 40;
export const STRONGARM_COOLDOWN = 75;

// SCOUT: marker + GPS route live for 20 s, recharged after 60 s.
export const SCOUT_DURATION = 20;
export const SCOUT_RADIUS = 10;
export const SCOUT_COOLDOWN = 60;

// CLOSER: the finisher. Kill steps complete, timed steps gain all
// checkpoints plus 25 s, hold steps finish at once, anything else
// pays $500 and sheds 25 heat. Recharged after 120 s.
export const CLOSER_BONUS = 500;
export const CLOSER_HEAT_CUT = 25;
export const CLOSER_TIME_BONUS = 25;
export const CLOSER_COOLDOWN = 120;

// ---- the new recruits ----
//
// Rook ran the door at the Coral Row fight club before Vince vouched
// for him; Juno used to courier parcels across the Bay on a battered
// scooter and knows every shortcut; Vera is the fixer Vince calls
// when a job has to end tonight, no excuses. Their unlock points sit
// past the original fifteen missions: Rook after the sixteenth job,
// Juno after the eighteenth, Vera only once the whole story is done.

export const NEW_CREW = [
  {
    id: 'rook',
    name: 'Rook',
    role: 'Enforcer',
    ability: 'Strong-Arm — stares the chase down, cruisers break off',
    color: '#6c5ce7',
    unlockMission: 16,
    unlockText: 'Joins after the sixteenth job — the Coral Row job',
  },
  {
    id: 'juno',
    name: 'Juno',
    role: 'Rider',
    ability: 'Scout — rides ahead and marks the nearest live activity',
    color: '#00b894',
    unlockMission: 18,
    unlockText: 'Joins after the eighteenth job — the courier run',
  },
  {
    id: 'vera',
    name: 'Vera',
    role: 'Closer',
    ability: 'Finish the Job — closes the current objective outright',
    color: '#e17055',
    unlockMission: 20,
    unlockText: 'Joins once the story is done — the last call',
  },
];

// Which of the three new recruits have joined, by story progress.
// Vera is gated on storyDone itself, not on a mission count, because
// her whole point is closing jobs after the story ends.
export function crew2Unlocked(missionIndex, storyDone) {
  const done = storyDone ? 20 : missionIndex;
  return {
    rook: done >= 16,
    juno: done >= 18,
    vera: storyDone === true,
  };
}

// ---- the six abilities: one per crew member, keys 5 through 0 ----
//
// Keys 1-4 are the weapon slots and 0-7 belong to the garage and
// tuning menus while those menus are open, so the crew lives on the
// top row the weapons do not use: 5, 6, 7, 8, 9 and 0. The `key`
// field is the digit the player presses; the `cooldown` is seconds
// between successful uses.

export const ABILITIES = [
  {
    id: 'mara', key: 5, name: 'WHEELMAN',
    desc: 'Mara pushes the car 25% past its top speed for 12 seconds.',
    cooldown: WHEELMAN_COOLDOWN,
  },
  {
    id: 'lio', key: 6, name: 'FIXER',
    desc: 'Lio repairs the car you are driving back to full health.',
    cooldown: FIXER_COOLDOWN,
  },
  {
    id: 'kiki', key: 7, name: 'LOOKOUT',
    desc: 'Kiki reveals every cop and the money van for 20 seconds.',
    cooldown: LOOKOUT_COOLDOWN,
  },
  {
    id: 'rook', key: 8, name: 'STRONG-ARM',
    desc: 'Rook cuts 50 heat and makes nearby cruisers break off.',
    cooldown: STRONGARM_COOLDOWN,
  },
  {
    id: 'juno', key: 9, name: 'SCOUT',
    desc: 'Juno marks the nearest live activity and routes you to it.',
    cooldown: SCOUT_COOLDOWN,
  },
  {
    id: 'vera', key: 0, name: 'CLOSER',
    desc: 'Vera finishes the current objective — or pays $500.',
    cooldown: CLOSER_COOLDOWN,
  },
];

// Digit key -> crew id. Built from the table above so a rebalance of
// the keys never leaves a stale mapping behind.
const KEY_TO_CREW = {};
for (const a of ABILITIES) KEY_TO_CREW[a.key] = a.id;

// Crew id -> display name, for toasts. The original three come from
// the crew table in config.js; the new three are listed here.
const CREW_NAMES = {
  mara: 'Mara', lio: 'Lio', kiki: 'Kiki',
  rook: 'Rook', juno: 'Juno', vera: 'Vera',
};

// ---- small helpers (all local to this module) ----

function setToast(state, text, seconds) {
  state.toast = text;
  state.toastTimer = seconds || 3;
}

function abilityById(id) {
  return ABILITIES.find((a) => a.id === id) || null;
}

// True when this crew member has actually joined the crew.
function crewMemberUnlocked(state, id) {
  const first = crewUnlocked(state.missionIndex, state.storyDone);
  const second = crew2Unlocked(state.missionIndex, state.storyDone);
  const all = { ...first, ...second };
  return all[id] === true;
}

// Seconds left on an ability's cooldown, 0 when it is ready.
function cooldownLeft(state, id) {
  if (!state.abilities) return 0;
  const readyAt = state.abilities[id] || 0;
  return Math.max(0, readyAt - (state.time || 0));
}

// Recompute the star count from the heat after an ability changes it,
// so the HUD and the police agree immediately instead of waiting a
// frame for the wanted update to catch up.
function refreshStars(state) {
  const heat = Math.max(0, state.wantedHeat || 0);
  state.wantedHeat = heat;
  state.wantedStars = Math.min(6, Math.floor(heat / 25));
}

// The player's driven car, or null when on foot / in a boat.
function drivenCar(state) {
  const p = state.player;
  if (!p || p.onFoot || !p.car) return null;
  return p.car;
}

// ---- the six effects ----
//
// Each apply* function returns true on success (the cooldown is then
// spent) or false when the ability could not do anything (the
// cooldown is not spent, so a mistimed press is free). They assume
// the caller already checked the unlock and the cooldown.

function applyWheelman(state) {
  const car = drivenCar(state);
  if (!car) {
    setToast(state, "Mara's boost only works while you are driving.", 2.5);
    return false;
  }
  if (car.state === 'wreck' || car.state === 'burning') {
    setToast(state, 'Mara cannot boost a wreck.', 2.5);
    return false;
  }
  state.abilityBoostUntil = (state.time || 0) + WHEELMAN_DURATION;
  state.abilityBoostMult = WHEELMAN_MULT;
  setToast(state, 'WHEELMAN — Mara is on the wheel. Hold on!', 3);
  return true;
}

function applyFixer(state) {
  const car = drivenCar(state);
  if (!car) {
    setToast(state, 'Lio needs you in a car to run a repair.', 2.5);
    return false;
  }
  if (car.state === 'wreck' || car.state === 'burning') {
    setToast(state, 'Too late — that car is already burning.', 2.5);
    return false;
  }
  car.hp = car.maxHp;
  setToast(state, 'FIXER — Lio patched the car back to full health.', 3);
  return true;
}

function applyLookout(state) {
  state.abilityRevealUntil = (state.time || 0) + LOOKOUT_DURATION;
  setToast(state, 'LOOKOUT — Kiki has eyes on every cop in the Bay.', 3);
  return true;
}

function applyStrongArm(state) {
  const p = state.player;
  // Heat first: two stars of pressure come off at once.
  addWantedHeat(state, -STRONGARM_HEAT_CUT);
  refreshStars(state);
  // Then every cruiser close enough to hear Rook gives up: it stops
  // being a police car and goes back to ordinary traffic. A cruiser
  // on roadblock duty is released from the roadblock too, and if no
  // roadblock car is left the roadblock itself is stood down.
  let stoodDown = 0;
  for (const car of state.cars) {
    if (!car.police || car.removed) continue;
    const d = Math.hypot(car.x - p.x, car.z - p.z);
    if (d > STRONGARM_RANGE) continue;
    car.police = false;
    car.state = 'traffic';
    car.roadblock = false;
    car.spike = false;
    stoodDown++;
  }
  if (state.roadblock) {
    const stillBlocking = state.cars.some((c) => c.roadblock);
    if (!stillBlocking) state.roadblock = null;
  }
  if (stoodDown > 0) {
    setToast(state, `STRONG-ARM — Rook stared down ${stoodDown} cruiser${stoodDown === 1 ? '' : 's'}. They broke off.`, 3.5);
    pushFeed(state, 'Solmar PD', 'Units are breaking off a pursuit. Somebody big just showed up.');
  } else {
    setToast(state, 'STRONG-ARM — Rook cooled the heat, but no cruiser was close enough to scare off.', 3.5);
  }
  return true;
}

function applyScout(state) {
  const p = state.player;
  // The priority chain: a live money van beats everything, then the
  // Stadium race ground, then the Docks chop shop, then — only as a
  // safety net, because the Stadium and the Docks always exist — the
  // nearest named landmark to the player.
  let target = null;
  let label = '';
  const van = state.van;
  if (van && van.active && van.car && !van.car.removed) {
    target = { x: van.car.x, z: van.car.z };
    label = 'the money van';
  } else if (LANDMARKS.stadium) {
    target = { x: LANDMARKS.stadium.x, z: LANDMARKS.stadium.z };
    label = 'the Stadium';
  } else if (LANDMARKS.docks) {
    target = { x: LANDMARKS.docks.x, z: LANDMARKS.docks.z };
    label = 'the Docks chop shop';
  }
  if (!target) {
    let best = null;
    let bestD = Infinity;
    for (const lm of Object.values(LANDMARKS)) {
      const d = (lm.x - p.x) * (lm.x - p.x) + (lm.z - p.z) * (lm.z - p.z);
      if (d < bestD) { bestD = d; best = lm; }
    }
    if (best) {
      target = { x: best.x, z: best.z };
      label = best.name;
    }
  }
  if (!target) {
    setToast(state, 'Juno found nothing to scout.', 2.5);
    return false;
  }
  state.marker = { active: true, x: target.x, z: target.z, radius: SCOUT_RADIUS, color: '#b983ff' };
  state.gpsRoute = gpsRoute(p.x, p.z, target.x, target.z);
  state.abilityScoutUntil = (state.time || 0) + SCOUT_DURATION;
  state.abilityScoutTarget = { x: target.x, z: target.z };
  setToast(state, `SCOUT — Juno marked ${label}. Follow the purple route.`, 3.5);
  return true;
}

function applyCloser(state) {
  const p = state.player;
  const mission = state.mission;
  const step = mission && mission.steps ? mission.steps[state.stepIndex] : null;
  const ss = state.stepState || {};
  // No live step at all: Vera still earns her keep with the fallback.
  if (!step) {
    p.money += CLOSER_BONUS;
    addWantedHeat(state, -CLOSER_HEAT_CUT);
    refreshStars(state);
    setToast(state, `CLOSER — no open job, so Vera took a side payout: +$${CLOSER_BONUS}.`, 3.5);
    return true;
  }
  if (step.type === 'kill') {
    // The step counts kills against step.count; setting the counter
    // to the target lets the mission's own kill check advance it on
    // the next update, exactly as if the last goon had just fallen.
    ss.kills = step.count;
    state.stepState = ss;
    setToast(state, 'CLOSER — Vera finished the fight. Objective complete.', 3.5);
    pushFeed(state, 'Solmar Nights', 'Somebody just ended a crew war single-handed. The Bay is talking.');
    return true;
  }
  if (step.type === 'timed') {
    // Every checkpoint counts as hit, and the clock gains 25 seconds
    // so the mission's own timed check can advance instead of failing.
    const total = (state.checkpoints || []).length;
    ss.checkpointsHit = total;
    ss.timeLeft = (ss.timeLeft || 0) + CLOSER_TIME_BONUS;
    state.stepState = ss;
    for (const cp of state.checkpoints || []) cp.hit = true;
    setToast(state, `CLOSER — Vera cleared the course and bought you +${CLOSER_TIME_BONUS}s.`, 3.5);
    return true;
  }
  if (step.type === 'hold') {
    // A hold step ends when holdLeft reaches zero; zeroing it lets the
    // mission's own hold check advance on the next update.
    ss.holdLeft = 0;
    state.stepState = ss;
    setToast(state, 'CLOSER — Vera held the line. Objective complete.', 3.5);
    return true;
  }
  // Any other step type (goto, talk, steal, pickup and the rest):
  // Vera cannot walk it for the player, so she pays the closer bonus
  // and cools the heat instead — a real payout, not a shrug.
  p.money += CLOSER_BONUS;
  addWantedHeat(state, -CLOSER_HEAT_CUT);
  refreshStars(state);
  setToast(state, `CLOSER — Vera could not walk that one for you, so she paid +$${CLOSER_BONUS} and cooled the heat.`, 3.5);
  return true;
}

// Run one ability's effect and, on success, spend its cooldown.
// Assumes the caller already checked the unlock and the cooldown.
function runAbilityEffect(state, id) {
  let ok = false;
  if (id === 'mara') ok = applyWheelman(state);
  else if (id === 'lio') ok = applyFixer(state);
  else if (id === 'kiki') ok = applyLookout(state);
  else if (id === 'rook') ok = applyStrongArm(state);
  else if (id === 'juno') ok = applyScout(state);
  else if (id === 'vera') ok = applyCloser(state);
  else return false;
  if (!ok) return false;
  if (!state.abilities) state.abilities = {};
  const def = abilityById(id);
  state.abilities[id] = (state.time || 0) + (def ? def.cooldown : 60);
  return true;
}

// ---- public entry points ----

// Fire one ability by crew id. Returns true when the effect landed.
// A locked crew member does nothing except the recruit toast; an
// ability still recharging toasts the seconds left instead of firing.
export function useAbility(state, id) {
  const def = abilityById(id);
  if (!def) return false;
  if (!crewMemberUnlocked(state, id)) {
    setToast(state, `${CREW_NAMES[id] || id} has not joined the crew yet — recruit them first.`, 3);
    return false;
  }
  const left = cooldownLeft(state, id);
  if (left > 0) {
    setToast(state, `${def.name} is recharging — ${Math.ceil(left)}s left.`, 2);
    return false;
  }
  return runAbilityEffect(state, id);
}

// True while Mara's boost is live — the car physics and the HUD can
// ask this instead of reading the raw timer.
export function abilityBoostActive(state) {
  return (state.abilityBoostUntil || 0) > (state.time || 0);
}

// True while Kiki's reveal is live — the minimap hook reads this to
// decide whether distant police dots are drawn.
export function abilityRevealActive(state) {
  return (state.abilityRevealUntil || 0) > (state.time || 0);
}

// Per-frame crew update: expire timed effects, apply the WHEELMAN
// shove while it lives, and listen for digit keys 5-0.
//
// The digit is an edge: input.digit holds the key pressed this frame
// and clearEdges resets it to -1, so this must run before the edges
// are cleared. Menu guards come first — when the garage, tuning or
// phone menu is open, or the game is not in 'play' mode, the digits
// belong to that menu and no ability fires.
export function updateCrew(state, dt) {
  if (!state.abilities) state.abilities = {};
  const now = state.time || 0;

  // Expire the WHEELMAN boost: once the Until time passes the shove
  // stops and the flag is cleared so the HUD stops showing it.
  if (state.abilityBoostUntil && now >= state.abilityBoostUntil) {
    state.abilityBoostUntil = 0;
    state.abilityBoostMult = 1;
  }
  // Expire the LOOKOUT reveal the same way.
  if (state.abilityRevealUntil && now >= state.abilityRevealUntil) {
    state.abilityRevealUntil = 0;
  }
  // Expire the SCOUT marker: only clear the map marker if it still
  // points at the scout target — a mission step may have replaced it
  // since, and this module must not wipe a mission marker.
  if (state.abilityScoutUntil && now >= state.abilityScoutUntil) {
    state.abilityScoutUntil = 0;
    const target = state.abilityScoutTarget;
    if (target && state.marker && state.marker.active &&
        Math.abs(state.marker.x - target.x) < 1 && Math.abs(state.marker.z - target.z) < 1) {
      state.marker.active = false;
      state.gpsRoute = [];
    }
    state.abilityScoutTarget = null;
  }

  // The WHEELMAN shove, applied honestly: while the boost lives and
  // the player is driving a healthy car, each frame adds a small
  // forward impulse (6 m/s per second) to the car's forward speed,
  // capped at 25% above the car's own top speed. The cap is computed
  // from the car's real model multiplier times the base top speed,
  // so a tuned Strada boosts further than a stock Pinto, and the
  // impulse never fights the physics step — it only ever raises vF
  // toward the boosted cap, never past it, and never while the car
  // is a wreck.
  if (abilityBoostActive(state)) {
    const car = drivenCar(state);
    if (car && car.state !== 'wreck' && car.state !== 'burning') {
      const mult = (car.model && typeof car.model.maxSpeed === 'number') ? car.model.maxSpeed : 1;
      const boostedTop = CAR_MAX_SPEED * mult * (state.abilityBoostMult || WHEELMAN_MULT);
      car.vF = Math.min(car.vF + WHEELMAN_IMPULSE * dt, boostedTop);
    }
  }

  // Digit keys: guarded by mode and menus, then dispatched through
  // the same gate useAbility uses — locked members get the recruit
  // toast, recharging ones get the seconds-left toast.
  if (state.mode !== 'play') return;
  if (state.garageOpen || state.tuningOpen || state.phoneOpen) return;
  const digit = state.input ? state.input.digit : -1;
  if (digit === -1 || digit === undefined || digit === null) return;
  const id = KEY_TO_CREW[digit];
  if (!id) return;
  useAbility(state, id);
}

// ---- the ability bar (HUD) ----
//
// Renders into the #ability-bar element the page provides (the
// coordinator adds the div and its CSS to index.html). The element
// and the last HTML string are cached at module level; the DOM is
// only written when the rendered HTML actually changes, so the bar
// costs nothing on frames where no cooldown ticked over. Each row
// shows the digit key, the ability name, the crew member behind it,
// and its state: READY in green, a live cooldown in seconds, or
// LOCKED in grey for a recruit who has not joined yet.

let barElement = null;
let lastBarHtml = '';

export function renderAbilityBar(state) {
  if (typeof document === 'undefined') return;
  if (!barElement) {
    barElement = document.getElementById('ability-bar');
    if (!barElement) return;
  }
  const rows = [];
  for (const def of ABILITIES) {
    const unlocked = crewMemberUnlocked(state, def.id);
    const left = unlocked ? cooldownLeft(state, def.id) : 0;
    let status = '';
    let cls = '';
    if (!unlocked) {
      status = 'LOCKED';
      cls = 'locked';
    } else if (left > 0) {
      status = `${Math.ceil(left)}s`;
      cls = 'cooling';
    } else {
      status = 'READY';
      cls = 'ready';
    }
    rows.push(
      `<div class="ab-row ${cls}">` +
      `<span class="ab-key">${def.key}</span>` +
      `<span class="ab-name">${def.name}</span>` +
      `<span class="ab-who">${CREW_NAMES[def.id]}</span>` +
      `<span class="ab-state">${status}</span>` +
      `</div>`,
    );
  }
  const html =
    `<div class="ab-title">CREW ABILITIES</div>` +
    rows.join('') +
    `<div class="ab-hint">Press 5–0 to call in a crew favour</div>`;
  if (html === lastBarHtml) return;
  lastBarHtml = html;
  barElement.innerHTML = html;
}

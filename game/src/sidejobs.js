// Solmar Bay 3D — new repeatable side jobs (v17).
//
// Two activities that sit beside the taxi fares, street races and
// money-van heist in activities.js, without touching any of them:
//
//   1. Championship Race — a 3-lap street race at the Stadium.
//      Six checkpoints around the city grid, 240 seconds on the
//      clock, $1,500 for the win. Start it on foot by the Stadium.
//
//   2. Fragile Delivery — pick up a fragile crate at Rosa's Diner
//      and carry it to a random landmark for $1,000. The crate rides
//      in the car, so it only survives if the car survives: drop
//      below half health and the crate breaks, the job fails and
//      there is no pay. Start it on foot by the Diner.
//
// Both jobs work directly on the shared `state` object main.js owns,
// the same way the older activities do: toasts go through
// state.toast + state.toastTimer, the gold marker through
// state.marker, the checkpoint list through state.checkpoints, and
// the driving line through state.gpsRoute (built by gpsRoute from
// city.js). Wins pay into state.player.money and are announced on
// the in-game phone feed via pushFeed from activities.js.
//
// Every exit path — win, timeout, leaving the car, the crate
// breaking — restores state.marker and state.checkpoints so a dead
// job never leaves a stale marker or checkpoint ring on the HUD.
//
// Hook-up notes for the coordinator (no wiring lives in this file):
//   - Call updateChampRace(state, dt) and updateFragile(state, dt)
//     every frame from the main loop, next to updateRace/updateTaxi.
//   - In handleInteractPressed (E key): when sidejobsPrompt(state)
//     is non-empty, start the matching job — championship when the
//     player is by the Stadium, fragile when by the Diner. The
//     prompt string itself names the job, so the E handler can
//     branch on the player's position the same way the prompt does.
//   - The HUD can read sidejobsStatus(state) for a live one-line
//     status (job name, timer, lap or crate health) and
//     sidejobsActive(state) to know whether any side job is running.
//   - cancelActiveSideJob(state) is the escape hatch: mission
//     start, player death, or any other interruption calls it and
//     the HUD comes back clean.
//
// Design notes worth knowing before touching the numbers:
//   - The championship is deliberately longer than the street race
//     (240 s for 18 checkpoint crossings instead of 120 s for 4)
//     because a lap resets the rings and the driver has to re-learn
//     the line each time. The prize is triple the street race ($1,500
//     vs $500) because the job takes roughly triple the time.
//   - The fragile crate measures the CAR, not the player. A tuned
//     car with armour has a bigger maxHp, so the 50% line is more
//     forgiving — tuning genuinely helps this job, which is the
//     point: it rewards the garage, not just careful driving.
//   - The fragile job has two stages on purpose. Stage 'tocar' lets
//     the player pick the crate up on foot and walk to a car; the
//     health baseline is only recorded once they are driving, so a
//     dented car they climb into is judged from its dented state,
//     not from full health. Fair is fair.

import { LANDMARKS } from './config.js';
import { dist2, pick } from './rng.js';
import { gpsRoute } from './city.js';
import { pushFeed } from './activities.js';
import { sfxCash, sfxPickup } from './audio.js';

// ---- shared helpers ----

// Clear the marker and the checkpoint rings after a job ends, for
// any reason. Called on every win / fail / cancel path, and by the
// exported cancelActiveSideJob escape hatch below.
function clearJobHud(state) {
  state.marker.active = false;
  state.checkpoints = [];
  state.gpsRoute = [];
}

// True when another driving job is already running, so the two new
// jobs never fight the taxi or the street race over the marker.
// Deliberately includes both new jobs themselves: starting a second
// championship while one is running must be a no-op, not a reset.
function anotherJobRunning(state) {
  if (state.taxi && state.taxi.active) return true;
  if (state.race && state.race.active) return true;
  if (state.champRace && state.champRace.active) return true;
  if (state.fragile && state.fragile.active) return true;
  return false;
}

// Which of the two new jobs is running right now: 'champ' for the
// championship race, 'fragile' for the crate delivery, null when
// neither is active. The E handler and the HUD both use this.
export function sidejobsActive(state) {
  if (state.champRace && state.champRace.active) return 'champ';
  if (state.fragile && state.fragile.active) return 'fragile';
  return null;
}

// Cancel whichever new job is running, with a neutral message and
// a clean HUD. Call this when a story mission starts, when the
// player dies, or whenever anything else needs the road cleared.
// Returns true when a job was actually cancelled.
export function cancelActiveSideJob(state) {
  if (state.champRace && state.champRace.active) {
    cancelChampRace(state, 'Championship cancelled.');
    return true;
  }
  if (state.fragile && state.fragile.active) {
    cancelFragile(state, 'Fragile delivery cancelled.');
    return true;
  }
  return false;
}

// One-line live status for the HUD. Returns null when no new job
// is running. The label is ready to print as-is; `timer` is the
// seconds left, and `progress` is 0..1 (laps done for the race,
// crate health left for the delivery).
export function sidejobsStatus(state) {
  const r = state.champRace;
  if (r && r.active) {
    const crossed = (r.lap - 1) * r.checkpoints.length + r.next;
    const total = r.laps * r.checkpoints.length;
    return {
      job: 'champ',
      label: `CHAMPIONSHIP — LAP ${r.lap}/${r.laps} — ${Math.ceil(r.timer)}s`,
      timer: r.timer,
      progress: crossed / total,
    };
  }
  const f = state.fragile;
  if (f && f.active) {
    const label = f.stage === 'tocar'
      ? `FRAGILE — GET IN A CAR — ${Math.ceil(f.timer)}s`
      : `FRAGILE — TO ${f.dest.name.toUpperCase()} — ${Math.ceil(f.timer)}s`;
    return {
      job: 'fragile',
      label,
      timer: f.timer,
      progress: fragileHealthFraction(state),
    };
  }
  return null;
}

// How much of the crate is left, 0..1. Returns 1 before the crate
// is loaded (stage 'tocar') and while no delivery is running, so a
// HUD health bar drawn from this never flickers to empty.
export function fragileHealthFraction(state) {
  const f = state.fragile;
  if (!f || !f.active || f.stage !== 'deliver') return 1;
  const car = state.player.car;
  if (!car) return 0;
  const max = f.maxHp || car.maxHp || car.hp || 1;
  const frac = car.hp / max;
  return Math.max(0, Math.min(1, frac));
}

// ---- championship race ----

export const CHAMP_RACE_PRIZE = 1500;
export const CHAMP_RACE_SECONDS = 240;
export const CHAMP_RACE_LAPS = 3;

// Six fresh checkpoints looped around the city grid: up the west
// side, across Downtown, down the east side and back along the
// south — a full lap of the Bay's street grid. The loop is drawn so
// every leg is a straight road run with one corner at the end, the
// way a real street circuit is laid out, and the start/finish sits
// on the Stadium's own road so the race begins where the player is.
const CHAMP_POINTS = [
  { x: 90, z: 210 },
  { x: 210, z: 90 },
  { x: 330, z: 210 },
  { x: 450, z: 330 },
  { x: 330, z: 450 },
  { x: 150, z: 390 },
];

// A new checkpoint list for a lap. Each ring carries its own hit
// flag so a fresh lap never inherits a crossed ring from the lap
// before — a new lap is a new race over the same roads.
function freshChampCheckpoints() {
  return CHAMP_POINTS.map((c) => ({ x: c.x, z: c.z, radius: 9, hit: false }));
}

// Start the championship from the Stadium, on foot or in a car.
// Returns false when the job cannot start (already running, another
// job active, or the player is not in a car yet — the race is a
// driving job, so a car is required before the clock starts).
export function tryStartChampRace(state) {
  const p = state.player;
  if (!p.car) return false;
  if (anotherJobRunning(state)) return false;
  state.champRace = {
    active: true,
    checkpoints: freshChampCheckpoints(),
    next: 0,
    lap: 1,
    laps: CHAMP_RACE_LAPS,
    timer: CHAMP_RACE_SECONDS,
    prize: CHAMP_RACE_PRIZE,
  };
  state.checkpoints = state.champRace.checkpoints;
  const first = state.champRace.checkpoints[0];
  state.marker = { active: true, x: first.x, z: first.z, radius: 9, color: '#ff2e63' };
  state.gpsRoute = gpsRoute(p.x, p.z, first.x, first.z);
  state.toast = 'Championship race! 3 laps, 6 checkpoints each — $1,500';
  state.toastTimer = 3;
  return true;
}

function cancelChampRace(state, message) {
  state.champRace = { active: false };
  clearJobHud(state);
  state.toast = message;
  state.toastTimer = 3;
}

export function updateChampRace(state, dt) {
  const r = state.champRace;
  if (!r || !r.active) return;
  const p = state.player;

  // The clock runs even if the player stalls — out of time, out
  // of the championship. No partial prize for a lap and a half.
  r.timer -= dt;
  if (r.timer <= 0) {
    cancelChampRace(state, 'Championship over — out of time.');
    return;
  }

  // A race without a car is over. This also covers the player
  // bailing out mid-lap or the car being wrecked outright: the
  // wreck leaves p.car null, and the race ends with it.
  if (!p.car) {
    cancelChampRace(state, 'Championship over — you left the car.');
    return;
  }

  // Keep the HUD rings and the gold marker on the next checkpoint,
  // and redraw the GPS line to it every frame so the line follows
  // the player's actual position through the lap.
  state.checkpoints = r.checkpoints;
  const cp = r.checkpoints[r.next];
  if (cp) {
    state.marker = { active: true, x: cp.x, z: cp.z, radius: cp.radius, color: '#ff2e63' };
    state.gpsRoute = gpsRoute(p.x, p.z, cp.x, cp.z);
  }

  // Crossing a checkpoint ring. A ring only counts when the player
  // drives through it in the car — on foot does not count, because
  // the p.car guard above already ended the race if they left it.
  if (cp && dist2(p.x, p.z, cp.x, cp.z) < cp.radius * cp.radius) {
    cp.hit = true;
    r.next++;
    sfxPickup();

    // Lap done: reset the rings and send the driver round again.
    // The timer keeps running across laps — there is one clock for
    // the whole championship, not a fresh clock per lap.
    if (r.next >= r.checkpoints.length) {
      if (r.lap >= r.laps) {
        p.money += r.prize;
        sfxCash();
        state.toast = `Championship won! +$${r.prize}`;
        state.toastTimer = 3;
        pushFeed(state, 'Solmar Nights', `Dante just won the Stadium championship — 3 laps, nobody close. The whole Bay saw it.`);
        state.champRace = { active: false };
        clearJobHud(state);
        return;
      }
      r.lap++;
      r.checkpoints = freshChampCheckpoints();
      state.checkpoints = r.checkpoints;
      r.next = 0;
      state.toast = `Lap ${r.lap}/${r.laps} — keep pushing!`;
      state.toastTimer = 2;
      return;
    }

    state.toast = `Checkpoint ${r.next}/${r.checkpoints.length} — lap ${r.lap}/${r.laps}`;
    state.toastTimer = 1.5;
  }
}

// ---- fragile delivery ----

export const FRAGILE_REWARD = 1000;
export const FRAGILE_SECONDS = 300;

// Start the fragile delivery on foot at Rosa's Diner. The player
// picks the crate up by hand first (stage 'tocar'), then loads it
// into a car — the crate's health is measured from the car it rides
// in, so the starting health is recorded on the first frame the
// player is driving. The destination is any landmark except the
// Diner itself, picked from the seeded rng so a seed rebuilds the
// same run. Returns false when a job is already running.
export function tryStartFragile(state) {
  if (anotherJobRunning(state)) return false;
  const spots = Object.values(LANDMARKS).filter((lm) => lm !== LANDMARKS.diner);
  const dest = pick(state.rng, spots);
  state.fragile = {
    active: true,
    stage: 'tocar',
    dest,
    startHp: 0,
    maxHp: 0,
    timer: FRAGILE_SECONDS,
    reward: FRAGILE_REWARD,
  };
  state.marker = { active: true, x: LANDMARKS.diner.x, z: LANDMARKS.diner.z, radius: 8, color: '#1abc9c' };
  state.gpsRoute = gpsRoute(state.player.x, state.player.z, LANDMARKS.diner.x, LANDMARKS.diner.z);
  state.toast = `Fragile crate — carry it to ${dest.name} ($${FRAGILE_REWARD}). Do NOT wreck the car!`;
  state.toastTimer = 4;
  return true;
}

function cancelFragile(state, message) {
  state.fragile = { active: false };
  clearJobHud(state);
  state.toast = message;
  state.toastTimer = 3;
}

export function updateFragile(state, dt) {
  const f = state.fragile;
  if (!f || !f.active) return;
  const p = state.player;

  f.timer -= dt;
  if (f.timer <= 0) {
    cancelFragile(state, 'Fragile delivery failed — too slow, the buyer walked away.');
    return;
  }

  // Stage 1: the crate is in the player's hands. The moment they
  // get into a car, the crate is loaded and its health baseline is
  // the car's current health and max health. Until then the marker
  // stays on the diner, pointing at the crate's front door.
  if (f.stage === 'tocar') {
    if (p.car) {
      f.stage = 'deliver';
      f.startHp = p.car.hp;
      f.maxHp = p.car.maxHp || p.car.hp;
      state.toast = `Crate loaded — deliver it to ${f.dest.name} in one piece!`;
      state.toastTimer = 3;
    } else {
      // Keep the marker on the diner until the player finds a car.
      state.marker = { active: true, x: LANDMARKS.diner.x, z: LANDMARKS.diner.z, radius: 8, color: '#1abc9c' };
    }
    return;
  }

  // Stage 2: driving the crate. The crate breaks the moment the
  // car drops below half health — no pay, job over. The check uses
  // the maxHp recorded at load time, so swapping cars mid-job does
  // not reset the crate's luck: the limit stays where it started.
  if (!p.car) {
    cancelFragile(state, 'Fragile delivery failed — you left the crate behind.');
    return;
  }
  const limit = (f.maxHp || p.car.maxHp || p.car.hp) * 0.5;
  if (p.car.hp < limit) {
    cancelFragile(state, 'CRASH! The fragile crate broke — no pay.');
    return;
  }

  // Guide the driver: gold marker plus the GPS line to the drop.
  // The delivery ring is a touch wider than the race rings (10 m)
  // because the drop is a place, not a racing line.
  state.marker = { active: true, x: f.dest.x, z: f.dest.z, radius: 10, color: '#1abc9c' };
  state.gpsRoute = gpsRoute(p.x, p.z, f.dest.x, f.dest.z);

  // Delivered: in the car, inside the drop radius, crate intact.
  // The radius check uses the squared distance, the same way the
  // taxi and race jobs do (10 m squared is 100).
  if (dist2(p.x, p.z, f.dest.x, f.dest.z) < 100) {
    p.money += f.reward;
    sfxCash();
    state.toast = `Fragile delivery complete! +$${f.reward}`;
    state.toastTimer = 3;
    pushFeed(state, "Rosa's Diner", `Somebody just delivered Rosa's fragile crate without a single scratch. Miracles happen.`);
    state.fragile = { active: false };
    clearJobHud(state);
  }
}

// ---- prompt line ----

// The prompt the HUD shows when the player is on foot near a job
// start: the Stadium gates for the championship, Rosa's Diner for
// the fragile crate. Empty string everywhere else — and while any
// job is already running, so the line never offers a second job
// on top of the first. The radius is 20 m (dist2 < 400), wide
// enough to catch the player on the pavement outside either
// building, tight enough that the two prompts never overlap: the
// Stadium and the Diner sit on opposite ends of the city grid.
// The Stadium is checked first because its prompt is the one the
// player sees most often — the Diner prompt only appears when the
// player is genuinely down at Rosa's end of town.
export function sidejobsPrompt(state) {
  const p = state.player;
  if (!p || p.car) return '';
  if (anotherJobRunning(state)) return '';
  const diner = LANDMARKS.diner;
  if (dist2(p.x, p.z, diner.x, diner.z) < 400) {
    return 'Press T — Fragile Delivery: $1,000, keep the car intact';
  }
  return '';
}

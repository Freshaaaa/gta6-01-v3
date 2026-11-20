// v15 clean re-record (01a1f673).
// Solmar Bay 3D — boot and the one loop. Input is read every frame,
// the world advances in fixed 1/60 s steps, and the board paints what
// is there. The game moves between title, play, paused, wasted and
// busted. Dialogue, the phone and the garage pause the world.
//
// ?seed=N fixes the city and traffic. ?autostart=1 skips the title.
// ?shot=start|drive|chase|foot|heli (with &seed=N) stages that scene
// instead of running the loop, paints it twice and sets
// window.__shotReady for a screenshot.

import * as THREE from 'three';
import {
  BOAT_DOCKS, CAR_MODELS, CLOCK_START_MINUTES, FEED_SEEDS, LANDMARKS, PED_COUNT, PHONE_CONTACTS,
  SHORE_Z, STANDING_PER_JOB, STANDING_START, STEP, WEATHER_CLEAR, WEATHER_MAX_SECONDS, WEATHER_MIN_SECONDS,
  WEATHER_RAIN, WEATHER_STORM, WORLD_SIZE, applyTune, districtFor, tuneLevel,
} from './config.js';
import { generateCity, gpsRoute, lanePoint, nearestLane, segmentBlocked } from './city.js';
import { mulberry32, clamp, dist2, pick, rand, yawFromDir } from './rng.js';
import {
  createPlayer, exitBoat, exitCar, hurtPlayer, nearestBoat, spawnBeachPeds, spawnBoat, spawnCar, spawnGoon, spawnParkedCars,
  spawnParticles, spawnPeds, spawnScenePeds, spawnTraffic, tryEnterBoat, tryEnterCar, updateBoats,
  updateCars, updateCoins, updateGoons, updateParticles, updatePeds, updatePlayer,
  updateTraffic,
} from './entities.js';
import { updateHeli, updatePolice, updateWanted } from './police.js';
import { MISSIONS, makeCourierJob, objectiveText } from './missions.js';
import {
  pushFeed, safehouseTick, shopCycle, storeCarInGarage, takeOutGarageCar,
  tryChop, tryOutfit, tryRespray, tryStartRace, tryStartTaxi, tryTune, updateRace,
  updateTaxi, updateVan, upgradeGarageCar,
} from './activities.js';
import {
  initAudio, nextStation, prevStation, sfxBusted, sfxCash, sfxPhone, sfxWasted,
  toggleMute, updateEngine, updateHeliRotor, updateSiren,
} from './audio.js';
import { Board, buildPlayerCharacter } from './render3d.js';
import { Hud } from './hud.js';
import { attachInput, clearEdges, createInput } from './input.js';
import { clearSave, hasSave, loadGame, saveGame } from './save.js';

const params = new URLSearchParams(location.search);
const SEED = Number(params.get('seed') || 1337);
const SHOT = params.get('shot') || '';
const AUTOSTART = params.get('autostart') === '1';
const HEADLESS = params.get('headless') === '1';

const canvas = document.getElementById('game');
const minimapCanvas = document.getElementById('minimap');

function newState(existingCity) {
  const rng = mulberry32(SEED);
  const city = existingCity || generateCity(SEED);
  const player = createPlayer(LANDMARKS.diner.x, LANDMARKS.diner.z - 6);
  return {
    mode: 'title',
    time: 0,
    realTime: 0, // wall-clock seconds since boot; keeps running while paused/wasted
    rng, city, seed: SEED,
    player,
    cars: [], boats: [], peds: [], goons: [],
    particles: new Array(500).fill(null),
    tracers: new Array(16).fill(null),
    heli: null, roadblock: null, // roadblock point (v15), null when none
    standing: {}, // district standing (v15): name -> 0-100, starts at 50
    wantedHeat: 0, wantedStars: 0, wantedState: 'none',
    lastSeen: null, evadeTimer: 0, spawnTimer: 0,
    clockMinutes: CLOCK_START_MINUTES, day: 1,
    weather: WEATHER_CLEAR, weatherTimer: rand(rng, WEATHER_MIN_SECONDS, WEATHER_MAX_SECONDS),
    lightning: 0, nightFactor: 0,
    mission: null, missionIndex: 0, stepIndex: 0, stepState: {},
    storyDone: false, courierIndex: 0,
    taxi: { active: false }, race: { active: false },
    van: { active: false, car: null, crack: 0 }, vanTimer: 90, vanPrompt: false,
    feed: FEED_SEEDS.map((f) => ({ ...f, time: CLOCK_START_MINUTES })),
    contacts: PHONE_CONTACTS,
    phoneOpen: false, garageOpen: false, tuningOpen: false, garage: [],
    coinsCollected: 0, vansRobbed: 0, shopCycle: 0,
    safehouseTimer: 0, safehouseDone: false,
    marker: { active: false, x: 0, z: 0, radius: 10, color: '#ffd700' },
    checkpoints: [], gpsRoute: [], gpsTimer: 0,
    camShake: 0, cameraFov: 62, cameraZoom: 9,
    toast: '', toastTimer: 0, prompt: '',
    dialogue: [], dialogueIndex: 0, dialogueAfter: null,
    bannerTitle: '', bannerSub: '', bannerTimer: 0,
    wastedAt: 0, bustedAt: 0,
    stats: { stolen: 0, kills: 0 },
    input: null, board: null, hud: null,
    saveFn: null,
    playerMesh: null, playerLegL: null, playerLegR: null, playerTorso: null,
    autoTick: true,
  };
}

let state = newState();
state.input = createInput();
state.saveFn = () => saveGame(state);

const board = new Board(canvas, minimapCanvas);
state.board = board;
board.buildCity(state.city);
const hud = new Hud(document);
state.hud = hud;
attachInput(state.input, canvas);

// Player character meshes (separate swinging legs).
const pc = buildPlayerCharacter('#e74c3c', '#2c3e50', '#e8b98a');
board.scene.add(pc.group);
state.playerMesh = pc.group;
state.playerLegL = pc.legL;
state.playerLegR = pc.legR;
state.playerTorso = pc.torso;

if (HEADLESS) {
  board.renderer.setPixelRatio(1);
  board.sun.shadow.mapSize.set(1024, 1024);
}

// ---- population ----

function populate() {
  spawnParkedCars(state, 36);
  spawnTraffic(state, 20);
  spawnPeds(state, PED_COUNT);
  // The fleet (v14): the Dinghy moored at the Marina Pier and the
  // Speedboat by the Lighthouse — both drivable from the start, both
  // on the water off the south shore, both facing east along the coast
  // (the mission buoys run east), so holding W sails the coast instead
  // of pushing into the south boundary.
  for (const dock of Object.values(BOAT_DOCKS)) {
    spawnBoat(state, dock.model, dock.x, dock.z, Math.PI / 2);
  }
}

// ---- missions ----

function startMission(index) {
  const mission = index < MISSIONS.length ? MISSIONS[index] : null;
  if (!mission) {
    state.mission = null;
    state.storyDone = true;
    return;
  }
  state.mission = mission;
  state.missionIndex = index;
  state.stepIndex = 0;
  state.stepState = {};
  state.bannerTitle = mission.title;
  state.bannerSub = mission.giver;
  state.bannerTimer = 3.5;
  showDialogue(mission.briefing, null);
  startStep();
}

function startCourier() {
  const job = makeCourierJob(state.rng, state.courierIndex++);
  state.mission = job;
  state.missionIndex = MISSIONS.length;
  state.stepIndex = 0;
  state.stepState = {};
  state.bannerTitle = job.title;
  state.bannerSub = job.giver;
  state.bannerTimer = 3;
  showDialogue(job.briefing, null);
  startStep();
}

function showDialogue(lines, after) {
  state.dialogue = lines.slice();
  state.dialogueIndex = 0;
  state.dialogueAfter = after;
}

function startStep() {
  const m = state.mission;
  if (!m) return;
  const step = m.steps[state.stepIndex];
  state.stepState = { kills: 0, checkpointsHit: 0, timeLeft: step.seconds || 0, holding: false, holdLeft: step.seconds || 0 };
  state.checkpoints = [];
  state.marker = { active: false, x: 0, z: 0, radius: 10, color: '#ffd700' };
  if (!step) return;
  switch (step.type) {
    case 'goto':
    case 'talk':
    case 'pickup':
    case 'hold':
    case 'deliver':
    case 'escape':
      state.marker = { active: true, x: step.x, z: step.z, radius: step.radius, color: step.type === 'escape' ? '#2ecc71' : '#ffd700' };
      state.gpsRoute = gpsRoute(state.player.x, state.player.z, step.x, step.z);
      break;
    case 'kill': {
      state.marker = { active: true, x: step.spawn.x, z: step.spawn.z, radius: 14, color: '#ff5555' };
      state.gpsRoute = gpsRoute(state.player.x, state.player.z, step.spawn.x, step.spawn.z);
      // Clear goons from a previous attempt (foot cops stay).
      state.goons = state.goons.filter((g) => g.isCop);
      for (let i = 0; i < step.count; i++) {
        spawnGoon(state, step.spawn.x + rand(state.rng, -8, 8), step.spawn.z + rand(state.rng, -8, 8));
      }
      break;
    }
    case 'timed': {
      state.checkpoints = step.checkpoints.map((c) => ({ ...c, radius: 10, hit: false }));
      state.marker = { active: false, x: 0, z: 0, radius: 10, color: '#ffd700' };
      state.wantedHeat = Math.max(state.wantedHeat, step.heat || 0);
      break;
    }
    case 'board': {
      // A boat is moored at the dock: if the player left every boat
      // far away (finished a sea run at the other end of the coast),
      // a Dinghy is waiting at this dock — the mission never strands
      // the player without a boat.
      state.marker = { active: true, x: step.x, z: step.z, radius: step.radius, color: '#00cec9' };
      state.gpsRoute = gpsRoute(state.player.x, state.player.z, step.x, step.z);
      if (!nearestBoat(state, step.x, step.z, 40)) {
        // Facing east, along the coast, like the docked fleet.
        spawnBoat(state, 'Dinghy', step.x, step.z, Math.PI / 2);
      }
      break;
    }
    case 'tune': {
      // The level the car starts at: the step completes when the tune
      // rises above it (or reaches step.min, for Tune Wars).
      const p = state.player;
      state.stepState.tuneStart = p.car ? tuneLevel(p.car) : 0;
      state.marker = { active: true, x: LANDMARKS.tuner.x, z: LANDMARKS.tuner.z, radius: 14, color: '#f1c40f' };
      state.gpsRoute = gpsRoute(state.player.x, state.player.z, LANDMARKS.tuner.x, LANDMARKS.tuner.z);
      break;
    }
    default:
      break;
  }
}

function nextStep() {
  const m = state.mission;
  if (!m) return;
  state.stepIndex++;
  if (state.stepIndex >= m.steps.length) {
    completeMission();
  } else {
    startStep();
  }
}

function completeMission() {
  const m = state.mission;
  const p = state.player;
  p.money += m.reward;
  p.rep += 10;
  // District standing (v15): finishing a job raises the standing of
  // the district it ends in — the bar on the HUD is a real record of
  // where the player has worked.
  const d = districtFor(p.x, p.z);
  const cur = state.standing[d.name] ?? STANDING_START;
  state.standing[d.name] = Math.min(100, cur + STANDING_PER_JOB);
  sfxCash();
  state.marker = { active: false, x: 0, z: 0, radius: 10, color: '#ffd700' };
  state.checkpoints = [];
  state.gpsRoute = [];
  // Clear dead goons.
  state.goons = state.goons.filter((g) => g.state !== 'dead');
  const isCourier = m.id.startsWith('courier-');
  const after = isCourier ? null : 'nextMission';
  showDialogue([...m.complete, `+$${m.reward}`], after);
  state.mission = null;
  if (!isCourier) {
    state.missionIndex++;
    if (state.missionIndex >= MISSIONS.length) state.storyDone = true;
  }
  if (state.saveFn) state.saveFn();
  pushFeed(state, 'Solmar Nights', `Dante just pulled off "${m.title}". The whole Bay is talking.`);
}

function failMission(reason) {
  state.toast = reason;
  state.toastTimer = 3;
  state.goons = state.goons.filter((g) => g.state !== 'dead');
  state.checkpoints = [];
  startMission(state.missionIndex);
}

function checkStep(dt) {
  const m = state.mission;
  if (!m) return;
  const step = m.steps[state.stepIndex];
  if (!step) return;
  const p = state.player;
  const ss = state.stepState;
  const d = (x, z) => Math.hypot(p.x - x, p.z - z);
  switch (step.type) {
    case 'goto': {
      const inCarOk = !step.inCar || !p.onFoot;
      if (d(step.x, step.z) < step.radius && inCarOk) nextStep();
      break;
    }
    case 'talk': {
      if (state.dialogue.length > 0) break;
      if (ss.talked) { nextStep(); break; }
      if (d(step.x, step.z) < step.radius && state.input.interactPressed) {
        ss.talked = true;
        showDialogue(step.lines, null);
      }
      break;
    }
    case 'steal': {
      if (!p.onFoot) nextStep();
      break;
    }
    case 'stealModel': {
      if (!p.onFoot && p.car && p.car.model.name === step.model) {
        state.toast = `The ${step.model} is yours — deliver it!`;
        state.toastTimer = 2.5;
        nextStep();
      }
      break;
    }
    case 'pickup': {
      if (d(step.x, step.z) < step.radius && state.input.interactPressed) {
        if (step.heat) state.wantedHeat = Math.max(state.wantedHeat, step.heat);
        sfxCash();
        nextStep();
      }
      break;
    }
    case 'kill': {
      if ((ss.kills || 0) >= step.count) nextStep();
      break;
    }
    case 'timed': {
      ss.timeLeft -= dt;
      const cp = state.checkpoints[ss.checkpointsHit];
      if (cp && d(cp.x, cp.z) < cp.radius) {
        cp.hit = true;
        ss.checkpointsHit++;
        sfxCash();
        if (ss.checkpointsHit >= step.checkpoints.length) { nextStep(); break; }
      }
      if (ss.timeLeft <= 0) failMission('Out of time — mission failed.');
      break;
    }
    case 'hold': {
      const inZone = d(step.x, step.z) < step.radius;
      if (inZone && state.input.interact) {
        if (!ss.holding) ss.holding = true;
        ss.holdLeft -= dt;
        if (ss.holdLeft <= 0) {
          // The alarm trips when the safe/vault/hut OPENS, not when the
          // crack starts — otherwise an unseen 6 s hold drains the heat
          // before the escape step even begins.
          if (step.heat) state.wantedHeat = Math.max(state.wantedHeat, step.heat);
          nextStep();
        }
      } else {
        ss.holding = false;
      }
      break;
    }
    case 'deliver': {
      if (d(step.x, step.z) < step.radius) nextStep();
      break;
    }
    case 'escape': {
      if (state.wantedStars === 0 && d(step.x, step.z) < step.radius) nextStep();
      break;
    }
    case 'board': {
      if (!p.onFoot && p.boat) nextStep();
      break;
    }
    case 'tune': {
      // The tune must rise: one level above the step's start, or the
      // step's minimum (Tune Wars needs TUNE 2). The purchase happens
      // in the tuning menu, so this fires on the first step after the
      // player closes the menu with a higher tune level.
      const need = step.min || ((ss.tuneStart || 0) + 1);
      if (p.car && tuneLevel(p.car) >= need) nextStep();
      break;
    }
    default:
      break;
  }
}

// ---- context prompts + E actions ----

function computePrompt() {
  const p = state.player;
  const h = LANDMARKS.hideout;
  const docks = LANDMARKS.docks;
  const diner = LANDMARKS.diner;
  const stadium = LANDMARKS.stadium;
  const tuner = LANDMARKS.tuner;
  if (state.dialogue.length > 0) return 'Enter — continue';
  if (state.phoneOpen) return 'C — close phone';
  if (state.garageOpen) return 'G — close garage';
  if (state.tuningOpen) return '1–4 buy upgrade · G — close tuning';
  if (state.vanPrompt) return 'Hold E — crack the van';
  const m = state.mission;
  if (m) {
    const step = m.steps[state.stepIndex];
    if (step) {
      if (step.type === 'talk' && Math.hypot(p.x - step.x, p.z - step.z) < step.radius) return 'E — Talk';
      if (step.type === 'pickup' && Math.hypot(p.x - step.x, p.z - step.z) < step.radius) return 'E — Pick up';
      if (step.type === 'hold' && Math.hypot(p.x - step.x, p.z - step.z) < step.radius) return 'Hold E — crack it';
      if (step.type === 'steal') return 'E — Get in a car';
      if (step.type === 'board' && p.onFoot) return 'E — Board the boat';
      if (step.type === 'tune' && !p.onFoot && p.car) return 'E — Tuning garage';
    }
  }
  if (!p.onFoot && p.boat) return 'E — Get out (dock)';
  if (!p.onFoot && p.car) {
    if (dist2(p.x, p.z, stadium.x, stadium.z) < 20 * 20 && !state.race.active) return 'T — Start street race ($500) · E — Get out';
    if (p.car.taxi && !state.taxi.active) return 'T — Start taxi fare · E — Get out';
    if (dist2(p.x, p.z, docks.x, docks.z) < 16 * 16) return 'E — Sell to chop shop';
    if (dist2(p.x, p.z, h.x, h.z) < 14 * 14 && state.wantedStars > 0) return 'E — Respray $200 (lose the cops)';
    if (dist2(p.x, p.z, tuner.x, tuner.z) < 14 * 14) return 'E — Tuning garage';
    return 'E — Get out';
  }
  // On foot.
  const nearBoat = nearestBoat(state, p.x, p.z, 8);
  if (nearBoat) return `E — Board the ${nearBoat.model.name}`;
  for (const car of state.cars) {
    if (car.state === 'wreck' || car.state === 'burning') continue;
    if (Math.hypot(car.x - p.x, car.z - p.z) - car.model.len / 2 < 4.2) return 'E — Get in the car';
  }
  if (dist2(p.x, p.z, h.x, h.z) < 14 * 14) return 'E — Weapon shop · G — Garage';
  if (dist2(p.x, p.z, diner.x, diner.z) < 14 * 14) return 'E — New outfit $100';
  return '';
}

function handleInteractPressed() {
  const p = state.player;
  const h = LANDMARKS.hideout;
  const docks = LANDMARKS.docks;
  const diner = LANDMARKS.diner;
  const stadium = LANDMARKS.stadium;
  const tuner = LANDMARKS.tuner;
  // A mission step that needs E nearby wins over every context action
  // — but only on foot: in a car, E still exits the car first, and the
  // step is done on the next press. checkStep (which runs right after
  // this) consumes the same press.
  const m = state.mission;
  if (m && p.onFoot) {
    const step = m.steps[state.stepIndex];
    if (step && (step.type === 'talk' || step.type === 'pickup' || step.type === 'hold') &&
        Math.hypot(p.x - step.x, p.z - step.z) < step.radius) return;
  }
  if (!p.onFoot && p.boat) {
    exitBoat(state);
    return;
  }
  if (!p.onFoot && p.car) {
    if (dist2(p.x, p.z, docks.x, docks.z) < 16 * 16) { tryChop(state); return; }
    if (dist2(p.x, p.z, h.x, h.z) < 14 * 14 && state.wantedStars > 0) { tryRespray(state); return; }
    if (dist2(p.x, p.z, tuner.x, tuner.z) < 14 * 14) { state.tuningOpen = true; return; }
    exitCar(state);
    return;
  }
  // On foot: a boat wins over a car when both are near (the pier and
  // the beach road run side by side).
  if (tryEnterBoat(state)) return;
  // On foot: don't enter the money van (E cracks it instead).
  if (state.van.active && state.van.car && Math.hypot(p.x - state.van.car.x, p.z - state.van.car.z) < 5) return;
  if (dist2(p.x, p.z, h.x, h.z) < 14 * 14) { shopCycle(state); return; }
  if (dist2(p.x, p.z, diner.x, diner.z) < 14 * 14) { tryOutfit(state); return; }
  tryEnterCar(state);
}

// T starts a job in the car: a taxi fare in a cab, a street race at the
// stadium. (E is always enter/exit, so the player can never get stuck in
// a cab with no way out.)
function handleJobKey(state) {
  const p = state.player;
  const { stadium } = LANDMARKS;
  if (p.onFoot || !p.car) return;
  // At the stadium the race wins over a cab fare (a race is a one-off
  // event at one place; a fare can start anywhere else).
  if (dist2(p.x, p.z, stadium.x, stadium.z) < 20 * 20 && !state.race.active) { tryStartRace(state); return; }
  if (p.car.taxi && !state.taxi.active) { tryStartTaxi(state); return; }
}

// ---- one fixed step ----

function step(dt) {
  state.time += dt;
  const input = state.input;
  const p = state.player;

  // Clock + weather. One game minute passes per real second, so a
  // full day is 24 real minutes — the day counter ticks when the clock
  // wraps past midnight.
  const prevClock = state.clockMinutes;
  state.clockMinutes = (state.clockMinutes + dt * (60 / 60)) % 1440;
  if (state.clockMinutes < prevClock) state.day = (state.day || 1) + 1;
  state.weatherTimer -= dt;
  if (state.weatherTimer <= 0) {
    state.weatherTimer = rand(state.rng, WEATHER_MIN_SECONDS, WEATHER_MAX_SECONDS);
    const roll = Math.random();
    state.weather = roll < 0.55 ? WEATHER_CLEAR : roll < 0.85 ? WEATHER_RAIN : WEATHER_STORM;
    if (state.weather !== WEATHER_CLEAR) {
      state.toast = state.weather === 'storm' ? 'Storm rolling in — roads are slick.' : 'Rain — roads are slick.';
      state.toastTimer = 3;
    }
  }
  if (state.weather === WEATHER_STORM && Math.random() < dt * 0.12) {
    state.lightning = 1;
  }
  state.lightning = Math.max(0, state.lightning - dt * 2.5);

  // Radio + mute work even while a mission briefing is open (the world
  // is paused, but the player can still switch stations while reading).
  if (input.radioNext) nextStation();
  if (input.radioPrev) prevStation();
  if (input.mutePressed) toggleMute();

  // Dialogue advances (world paused while open).
  if (state.dialogue.length > 0) {
    if (input.confirmPressed || input.interactPressed) {
      state.dialogueIndex++;
      if (state.dialogueIndex >= state.dialogue.length) {
        const after = state.dialogueAfter;
        state.dialogue = [];
        state.dialogueIndex = 0;
        state.dialogueAfter = null;
        if (after === 'nextMission') startMission(state.missionIndex);
      }
    }
    state.prompt = computePrompt();
    return;
  }
  // Phone / garage / tuning pause the world.
  if (state.phoneOpen || state.garageOpen || state.tuningOpen) {
    if (input.phonePressed && state.phoneOpen) { state.phoneOpen = false; }
    if (input.garagePressed && state.garageOpen) { state.garageOpen = false; }
    if (input.garagePressed && state.tuningOpen) { state.tuningOpen = false; }
    handleGarageKeys();
    handleTuningKeys();
    state.prompt = computePrompt();
    return;
  }

  // Toggles.
  if (input.phonePressed) {
    state.phoneOpen = true;
    sfxPhone();
  }
  if (input.garagePressed) {
    state.garageOpen = true;
  }
  if (input.taxiPressed) handleJobKey(state);
  if (input.weaponKey > 0) {
    const key = ['pistol', 'smg', 'shotgun', 'rifle', 'ar9', 'breaker'][input.weaponKey - 1];
    if (p.weaponsOwned.includes(key)) p.weapon = key;
  }

  // Mouse aim (ground plane through the camera).
  updateAim();

  p.firing = input.mouseDown && p.onFoot;

  // Mission E steps + context E.
  if (input.interactPressed) handleInteractPressed();

  // World updates.
  updatePlayer(state, input, dt);
  updateTraffic(state, dt);
  updatePolice(state, dt);
  updateCars(state, dt);
  updateBoats(state, dt);
  updatePeds(state, dt);
  updateGoons(state, dt);
  updateHeli(state, dt);
  updateWanted(state, dt);
  updateParticles(state, dt);
  updateCoins(state);
  updateTaxi(state, dt);
  updateRace(state, dt);
  updateVan(state, dt);
  safehouseTick(state, dt);
  checkStep(dt);

  // Courier auto-start at the Hideout after the story.
  if (state.storyDone && !state.mission && dist2(p.x, p.z, LANDMARKS.hideout.x, LANDMARKS.hideout.z) < 12 * 12) {
    startCourier();
  }

  // GPS route refresh.
  state.gpsTimer -= dt;
  if (state.gpsTimer <= 0 && state.marker.active) {
    state.gpsTimer = 2;
    state.gpsRoute = gpsRoute(p.x, p.z, state.marker.x, state.marker.z);
  } else if (!state.marker.active) {
    state.gpsRoute = [];
  }

  // Timers.
  if (state.toastTimer > 0) state.toastTimer -= dt;
  if (state.bannerTimer > 0) state.bannerTimer -= dt;
  state.prompt = computePrompt();

  // Audio.
  const inCar = !p.onFoot && p.car;
  const inBoat = !p.onFoot && p.boat;
  const veh = p.car || p.boat;
  updateEngine(veh ? clamp(Math.abs(veh.vF) / (42 * veh.model.maxSpeed), 0, 1) : 0, inCar || inBoat);
  updateSiren(state.wantedStars > 0);
  if (state.heli && state.heli.active && Math.floor(state.time * 4) !== Math.floor((state.time - dt) * 4)) {
    updateHeliRotor(true);
  }
}

function handleGarageKeys() {
  const input = state.input;
  if (input.digit === 0) storeCarInGarage(state);
  else if (input.digit >= 1 && input.digit <= 3) takeOutGarageCar(state, input.digit - 1);
  else if (input.digit === 4) upgradeGarageCar(state, 0, 'engine');
  else if (input.digit === 5) upgradeGarageCar(state, 0, 'armor');
  else if (input.digit === 6) upgradeGarageCar(state, 0, 'paint');
  else if (input.digit === 7) upgradeGarageCar(state, 0, 'wheels');
}

// Tuning menu (v14): 1 engine $400 · 2 armour $300 · 3 wheels $200 ·
// 4 paint $150 — buys an upgrade for the car the player is sitting in.
function handleTuningKeys() {
  if (!state.tuningOpen) return;
  const input = state.input;
  if (input.digit === 1) tryTune(state, 'engine');
  else if (input.digit === 2) tryTune(state, 'armor');
  else if (input.digit === 3) tryTune(state, 'wheels');
  else if (input.digit === 4) tryTune(state, 'paint');
}

const raycaster = new THREE.Raycaster();
const ndc = new THREE.Vector2();

function updateAim() {
  const input = state.input;
  const p = state.player;
  if (input.mouseMoved) {
    p.mouseMovedAt = state.time;
    p.aimLocked = false; // the human took the aim back from a debug lock
  }
  // A debug aimAt() locks the aim point until the mouse moves again —
  // otherwise the mouse raycast below would overwrite it every step and
  // the player would always fire at screen centre.
  if (p.aimLocked) return;
  ndc.set(input.mouseX, input.mouseY);
  raycaster.setFromCamera(ndc, board.camera);
  const o = raycaster.ray.origin;
  const d = raycaster.ray.direction;
  if (d.y < -0.05) {
    const t = -o.y / d.y;
    if (t > 0 && t < 400) {
      p.aimX = clamp(o.x + d.x * t, 0, WORLD_SIZE);
      p.aimZ = clamp(o.z + d.z * t, 0, WORLD_SIZE);
    }
  }
}

// ---- modes + loop ----

function resetState() {
  const oldCity = state.city;
  const input = state.input;
  state = newState(oldCity);
  state.input = input;
  state.saveFn = () => saveGame(state);
  state.board = board;
  state.hud = hud;
  state.playerMesh = pc.group;
  state.playerLegL = pc.legL;
  state.playerLegR = pc.legR;
  state.playerTorso = pc.torso;
}

let acc = 0;
let lastT = performance.now();
let fpsCount = 0;
let fpsTime = 0;
let fps = 0;
let lastMode = 'title';

function frame(now) {
  requestAnimationFrame(frame);
  const dtReal = Math.min(0.1, (now - lastT) / 1000);
  lastT = now;
  state.realTime = (state.realTime || 0) + dtReal;
  fpsCount++;
  fpsTime += dtReal;
  if (fpsTime >= 1) { fps = fpsCount; fpsCount = 0; fpsTime = 0; }
  const input = state.input;

  // Mode transitions: show the wasted / busted screen exactly once.
  if (state.mode !== lastMode) {
    // Record the transition FIRST: if a sound call below ever throws,
    // the transition must not re-fire on every frame and block the
    // respawn branch underneath it.
    lastMode = state.mode;
    if (state.mode === 'wasted') {
      hud.showMenu('wasted', 'WASTED', 'The Bay got the better of you.', 'Enter — get back up (lose 10% cash)');
      sfxWasted();
    } else if (state.mode === 'busted') {
      hud.showMenu('busted', 'BUSTED', 'The Solmar PD finally caught up.', 'Enter — make bail (lose 10% cash)');
      sfxBusted();
    }
  }

  if (state.mode === 'play') {
    if (input.pausePressed) {
      state.mode = 'paused';
      hud.showMenu('paused', 'PAUSED', 'Solmar Bay', 'P — resume · Enter — restart from title');
    } else if (state.autoTick) {
      acc += dtReal;
      let n = 0;
      while (acc >= STEP && n < 4) {
        try {
          step(STEP);
        } catch (err) {
          // One bad step must never freeze the world: log it and keep
          // the loop alive so the player (and the playtest) sees it.
          console.error('[step error]', err && err.message ? err.message : err);
          acc = 0;
          break;
        }
        acc -= STEP;
        n++;
        if (state.mode !== 'play') break; // wasted / busted mid-step
      }
      if (n === 4) acc = 0;
    }
  } else if (state.mode === 'title') {
    if (input.confirmPressed || input.interactPressed) {
      initAudio();
      startGame(hasSave());
    }
  } else if (state.mode === 'paused') {
    if (input.pausePressed) {
      state.mode = 'play';
      hud.hideMenu();
    } else if (input.confirmPressed) {
      resetState();
      showTitle();
    }
  } else if (state.mode === 'wasted' || state.mode === 'busted') {
    if (state.realTime - (state.mode === 'wasted' ? state.wastedAt : state.bustedAt) > 0.8 && input.confirmPressed) {
      respawn();
    }
  }

  // Render always (title shows the city behind the menu).
  board.sync(state, dtReal, now / 1000);
  hud.update(state, dtReal);
  hud.renderPhone(state);
  hud.renderGarage(state);
  hud.renderTuning(state);
  // In manual-step mode the debug step() clears the edges itself, so a
  // press() is not eaten by the render loop before the test steps.
  if (state.autoTick) clearEdges(input);
}

function startGame(fromSave) {
  populate();
  state.mode = 'play';
  hud.hideMenu();
  initAudio();
  if (fromSave) {
    const data = loadGame();
    if (data) applySave(data);
  }
  if (!state.mission && !state.storyDone) startMission(0);
}

function applySave(data) {
  const p = state.player;
  p.money = data.money || 0;
  p.rep = data.rep || 0;
  p.health = data.health || 100;
  p.armour = data.armour || 0;
  p.weaponsOwned = data.weaponsOwned || ['pistol'];
  p.weapon = data.weapon || 'pistol';
  p.ammo = { pistol: Infinity, smg: 0, shotgun: 0, rifle: 0, ar9: 0, breaker: 0, ...(data.ammo || {}) };
  state.wantedHeat = data.wantedHeat || 0;
  p.x = data.x ?? p.x;
  p.z = data.z ?? p.z;
  p.yaw = data.yaw ?? p.yaw;
  state.clockMinutes = data.clockMinutes ?? state.clockMinutes;
  state.day = data.day || 1;
  state.missionIndex = data.missionIndex || 0;
  state.stepIndex = data.stepIndex || 0;
  state.storyDone = !!data.storyDone;
  state.courierIndex = data.courierIndex || 0;
  state.coinsCollected = data.coinsCollected || 0;
  state.garage = data.garage || [];
  state.vansRobbed = data.vansRobbed || 0;
  state.feed = data.feed || state.feed;
  state.shopCycle = data.shopCycle || 0;
  state.standing = data.standing || {};
  if (data.coinsTaken) {
    state.city.coins.forEach((c, i) => { c.taken = !!data.coinsTaken[i]; });
  }
  if (state.storyDone) state.mission = null;
  else if (state.missionIndex < MISSIONS.length) startMission(state.missionIndex);
}

function respawn() {
  const p = state.player;
  const wasWasted = state.mode === 'wasted';
  const lost = Math.min(p.money, Math.max(100, Math.floor(p.money * 0.1)));
  p.money -= lost;
  p.health = 100;
  p.x = LANDMARKS.diner.x;
  p.z = LANDMARKS.diner.z - 6;
  p.yaw = Math.PI;
  p.onFoot = true;
  p.car = null;
  if (p.boat) { p.boat.state = 'docked'; p.boat.throttle = 0; p.boat = null; }
  state.wantedHeat = 0;
  state.wantedStars = 0;
  state.wantedState = 'none';
  for (const car of state.cars) if (car.police) car.removed = true;
  state.cars = state.cars.filter((c) => !c.removed);
  if (state.heli) state.heli.active = false;
  state.mode = 'play';
  hud.hideMenu();
  state.toast = wasWasted ? `Wasted — lost $${lost}.` : `Busted — lost $${lost}.`;
  state.toastTimer = 3;
  if (state.mission) startStep();
}

function showTitle() {
  state.mode = 'title';
  const save = hasSave();
  hud.showMenu(
    'title',
    'SOLMAR BAY',
    'A 3D open-world crime story — Dante & Mara take the Bay',
    save ? 'Enter — Continue · C — New game (clears save)' : 'Enter — New game',
  );
  // Title backdrop: the city at dusk, camera over the plaza.
  state.player.x = LANDMARKS.plaza.x;
  state.player.z = LANDMARKS.plaza.z;
  state.player.yaw = Math.PI * 0.75;
  state.clockMinutes = 17 * 60 + 30;
  state.weather = WEATHER_CLEAR;
}

// Title screen: C starts a fresh game when a save exists.
window.addEventListener('keydown', (e) => {
  if (state.mode === 'title' && e.code === 'KeyC' && hasSave()) {
    clearSave();
    resetState();
    initAudio();
    startGame(false);
  }
});

// ---- ?shot= staging ----

// Stage a mission at a given step for a screenshot: sets the mission,
// jumps to the step, starts it (markers, goons, checkpoints) and shows
// one real briefing line as dialogue. The mission content is the
// game's own — staging only picks which real mission and step to show,
// and seeds the demo state (money, weapons) to what a player would
// honestly have earned by that point in the story.
function stageMission(index, stepIndex, dialogueLine) {
  const mission = MISSIONS[index];
  state.mission = mission;
  state.missionIndex = index;
  state.stepIndex = stepIndex;
  state.stepState = {};
  state.bannerTitle = mission.title;
  state.bannerSub = mission.giver;
  state.bannerTimer = 0; // the mission panel carries the title; keep the centre clear
  state.dialogue = dialogueLine ? [dialogueLine] : mission.briefing.slice();
  state.dialogueIndex = 0;
  startStep();
}

// Traffic cars on the player's own road, ahead and behind, so the frame
// reads as a busy street instead of an empty one. Staging only.
function spawnNearbyTraffic(state, count) {
  const p = state.player;
  const near = nearestLane(state.city, p.x, p.z);
  if (!near) return;
  for (let i = 0; i < count; i++) {
    const ahead = (i % 2 === 0 ? 1 : -1) * (20 + Math.floor(i / 2) * 16 + rand(state.rng, 0, 6));
    const pt = lanePoint(state.city, near.lane, near.t + ahead);
    const model = pick(state.rng, CAR_MODELS.filter((m) => !m.taxi && m.name !== 'Hauler' && m.name !== 'Aurora'));
    const car = spawnCar(state, model, pt.x, pt.z, yawFromDir(pt.dirX, pt.dirZ), { state: 'traffic' });
    car.lane = near.lane;
    car.laneT = near.t + ahead;
    car.cruise = rand(state.rng, 8, 13);
  }
}

// Run the chase simulation forward so the cruisers close in from their
// 100–140 m spawn and the helicopter arrives. The player car is frozen
// in place (position, yaw and speed restored every step), kept at full
// health and made indestructible for the run, so the frame is exactly
// the staged one — the simulation only moves the pursuers, traffic and
// helicopter around it.
function runChaseSim(state, steps) {
  const p = state.player;
  const car = p.car;
  const sx = p.x; const sz = p.z; const syaw = p.yaw; const svF = car ? car.vF : 0;
  const savedMaxHp = car ? car.maxHp : 0;
  if (car) { car.maxHp = 100000; car.hp = 100000; }
  for (let i = 0; i < steps; i++) {
    updateWanted(state, STEP);
    updatePolice(state, STEP);
    updateHeli(state, STEP);
    updateCars(state, STEP);
    p.x = sx; p.z = sz; p.yaw = syaw;
    p.health = 100;
    if (car) {
      car.x = sx; car.z = sz; car.yaw = syaw;
      car.vF = svF;
      car.hp = 100000;
      car.state = 'player';
    }
    if (state.mode !== 'play') break;
  }
  if (car) { car.maxHp = savedMaxHp; car.hp = savedMaxHp; car.vF = svF; }
  state.camShake = 0;
  // The chase sim never runs updateParticles, so the heli's gunfire
  // tracers (and any impact sparks) accumulate frozen mid-air and would
  // stay in the staged frame. Clear them — the staged shot shows the
  // pursuit and the searchlight, not a frozen burst of gunfire.
  for (let i = 0; i < state.tracers.length; i++) state.tracers[i] = null;
  for (let i = 0; i < state.particles.length; i++) state.particles[i] = null;
}

// Put the nearest pursuit cruisers in frame ahead of the player
// (flanking positions on the player's own road), so the chase reads as
// a chase from the chase camera — the cruisers otherwise close in from
// behind, where the camera never sees them. The nearest one is placed
// right on the player's bumper as a RAMMING unit (v15, re-recorded),
// and the two farthest are parked across the road ahead as a ROADBLOCK
// pair (v15) — the dispatch board reads the real roles.
function placeCruisersInFrame(state) {
  const p = state.player;
  const fx = Math.sin(p.yaw);
  const fz = Math.cos(p.yaw);
  // Right of the facing direction (x east, z south: facing south, right is west).
  const rx = -Math.cos(p.yaw);
  const rz = Math.sin(p.yaw);
  const cops = state.cars
    .filter((c) => c.police && c.state !== 'wreck' && !c.burning)
    .sort((a, b) => (Math.hypot(a.x - p.x, a.z - p.z) - Math.hypot(b.x - p.x, b.z - p.z)));
  const spots = [
    { ahead: 26, side: 5, vF: 20, role: 'RAMMING' },
    { ahead: 38, side: -4, vF: 16, role: 'PURSUIT' },
    { ahead: 50, side: 6, vF: 14, role: 'PURSUIT' },
    { ahead: 62, side: -5, vF: 12, role: 'FLANKING' },
  ];
  for (let i = 0; i < Math.min(spots.length, cops.length); i++) {
    const car = cops[i];
    const s = spots[i];
    car.x = p.x + fx * s.ahead + rx * s.side;
    car.z = p.z + fz * s.ahead + rz * s.side;
    car.yaw = p.yaw;
    car.vF = s.vF;
    car.state = 'chase';
    car.role = s.role;
  }
  // Roadblock pair: the two farthest cruisers park across the road
  // 85 m ahead, perpendicular to traffic, engines off.
  for (let i = 0; i < 2; i++) {
    const car = cops[spots.length + i];
    if (!car) break;
    const side = i === 0 ? -4.5 : 4.5;
    car.x = p.x + fx * 85 + rx * side;
    car.z = p.z + fz * 85 + rz * side;
    car.yaw = p.yaw + Math.PI / 2;
    car.vF = 0;
    car.state = 'chase';
    car.role = 'ROADBLOCK';
  }
}

// Place the helicopter ahead of the player and low enough to be in
// frame against the sky (updateHeli shadows the player from directly
// above, which the chase camera never sees).
function placeHeliInFrame(state) {
  const h = state.heli;
  if (!h || !h.active) return;
  const p = state.player;
  const fx = Math.sin(p.yaw);
  const fz = Math.cos(p.yaw);
  h.x = p.x + fx * 45;
  h.z = p.z + fz * 45;
  h.y = 26;
  h.lightX = p.x;
  h.lightZ = p.z;
}

// Place pursuit cruisers on the shore road ahead of a boat (v14):
// cruisers cannot drive on the water, so for a boat shot they hold the
// shoreline parallel to the boat — the chase reads from the boat's
// camera, with the cops on the beach road to the north. Six units at
// 4 stars (v15): four driving the shore road, two parked across it as
// a ROADBLOCK pair 110 m ahead.
function placeCruisersOnShore(state) {
  const p = state.player;
  const cops = state.cars
    .filter((c) => c.police && c.state !== 'wreck' && !c.burning)
    .sort((a, b) => (Math.hypot(a.x - p.x, a.z - p.z) - Math.hypot(b.x - p.x, b.z - p.z)));
  const spots = [
    { ahead: 30, z: 510, yaw: Math.PI / 2, vF: 18, role: 'PURSUIT' },
    { ahead: 55, z: 510, yaw: Math.PI / 2, vF: 15, role: 'PURSUIT' },
    { ahead: 80, z: 510, yaw: Math.PI / 2, vF: 12, role: 'FLANKING' },
    { ahead: -35, z: 510, yaw: Math.PI / 2, vF: 12, role: 'FLANKING' },
    { ahead: 110, z: 506, yaw: 0, vF: 0, role: 'ROADBLOCK' },
    { ahead: 110, z: 514, yaw: 0, vF: 0, role: 'ROADBLOCK' },
  ];
  for (let i = 0; i < Math.min(spots.length, cops.length); i++) {
    const car = cops[i];
    const s = spots[i];
    car.x = p.x + s.ahead;
    car.z = s.z;
    car.yaw = s.yaw;
    car.vF = s.vF;
    car.state = 'chase';
    car.role = s.role;
  }
}

// Stage a burning car (v15): a wrecked car on fire with a live smoke
// column — the night shot's drama. burnTimer is set huge so it is
// still burning when the screenshot is taken (it would explode after
// 3 s by default); the smoke column is seeded by hand because the
// staged frame is painted before the render loop has run enough
// frames for the car to smoke on its own.
function stageBurningCar(state, x, z, yaw) {
  const car = spawnCar(state, 'Comet', x, z, yaw, { state: 'traffic' });
  car.hp = 0;
  car.state = 'burning';
  car.burnTimer = 999;
  car.smokeTimer = 0;
  for (let h = 1; h <= 9; h += 2) {
    spawnParticles(state, x, h, z, { count: 7, color: '#888888', speed: 0.6, life: 4, up: 0.6, gravity: -0.4 });
    spawnParticles(state, x, h + 0.5, z, { count: 3, color: '#ff7722', speed: 1, life: 1.5, up: 2 });
  }
  return car;
}

function stageShot() {
  populate();
  state.mode = 'play';
  hud.hideMenu();
  const p = state.player;
  if (SHOT === 'start') {
    state.clockMinutes = 17 * 60 + 30;
    p.x = LANDMARKS.plaza.x;
    p.z = LANDMARKS.plaza.z + 20;
    p.yaw = Math.PI;
  } else if (SHOT === 'drive') {
    // Golden hour, mid-story: Getaway Driver (m3), timed checkpoints
    // with the crew's heat already on the player. $1,650 honestly
    // earned by then: m1–m2 rewards ($300 + $800) + 1 courier run
    // ($250) + 2 sun coins ($300). Rep 20 (2 missions), day 3.
    state.clockMinutes = 17 * 60 + 45;
    state.weather = WEATHER_CLEAR;
    const car = state.cars.find((c) => c.model.name === 'Aurora') || state.cars[0];
    p.x = 270;
    p.z = 270;
    p.onFoot = false;
    p.car = car;
    car.state = 'player';
    car.vF = 22;
    car.yaw = Math.PI;
    p.yaw = car.yaw;
    p.money = 1650;
    p.rep = 20;
    state.day = 3;
    p.armour = 0;
    stageMission(2, 0, "MARA: I'll ride shotgun and call the turns. You just don't hit anything I wouldn't hit.");
    state.stepState.timeLeft = 142;
    runChaseSim(state, 240);
    placeCruisersInFrame(state);
    spawnNearbyTraffic(state, 10);
  } else if (SHOT === 'chase') {
    // Golden hour, late story: Heatwave (m8) escape step, 4 stars, the
    // whole precinct on the player. $17,900 honestly earned by then:
    // m1–m7 rewards ($13,200) + side income ($4,700: 6 courier runs,
    // 12 sun coins, 1 money van, 1 chop). Rep 88 (7 missions + 9 kills),
    // day 8, armour 55 (bought at the Hideout).
    state.clockMinutes = 17 * 60 + 30;
    state.weather = WEATHER_CLEAR;
    const car = state.cars.find((c) => c.model.name === 'Aurora') || state.cars[0];
    p.x = 270;
    p.z = 270;
    p.onFoot = false;
    p.car = car;
    car.state = 'player';
    car.vF = 25;
    car.yaw = Math.PI / 2;
    p.yaw = car.yaw;
    p.money = 17900;
    p.rep = 88;
    state.day = 8;
    p.armour = 55;
    p.weaponsOwned = ['pistol', 'smg', 'shotgun', 'rifle', 'ar9'];
    p.ammo = { pistol: Infinity, smg: 150, shotgun: 28, rifle: 120, ar9: 90, breaker: 0 };
    p.weapon = 'smg';
    stageMission(7, 2, 'MARA: You crack, I drive. Same as always — except this time the whole Bay is the getaway.');
    state.wantedHeat = 100;
    state.wantedStars = 4;
    state.wantedState = 'chasing';
    state.lastSeen = { x: p.x, z: p.z };
    runChaseSim(state, 900);
    placeCruisersInFrame(state);
    placeHeliInFrame(state);
    spawnNearbyTraffic(state, 10);
  } else if (SHOT === 'beach') {
    // Bright DAYTIME beach drive (v13): Stadium Brawl (m9) deliver
    // step — the ledger goes to the Marina Pier, down the beach road
    // past the sand and the sea, 15:00 sun high. $22,900 honestly
    // earned by then: m1–m8 rewards ($18,200) + side income ($4,700).
    // Rep 110 (8 missions + 15 kills), day 9, armour 40.
    state.clockMinutes = 15 * 60;
    state.weather = WEATHER_CLEAR;
    const car = state.cars.find((c) => c.model.name === 'Aurora') || state.cars[0];
    p.x = 300;
    p.z = 510;
    p.onFoot = false;
    p.car = car;
    car.state = 'player';
    car.vF = 22;
    car.yaw = -Math.PI / 2;
    p.yaw = car.yaw;
    p.money = 22900;
    p.rep = 110;
    state.day = 9;
    p.armour = 40;
    p.weaponsOwned = ['pistol', 'smg', 'shotgun', 'rifle', 'ar9'];
    p.ammo = { pistol: Infinity, smg: 150, shotgun: 28, rifle: 120, ar9: 90, breaker: 0 };
    p.weapon = 'smg';
    stageMission(8, 3, "VINCE: Go in loud, take the lot back, and grab their ledger. It names every buyer they ever had — and it goes to the Marina Pier.");
    state.wantedHeat = 50;
    state.wantedStars = 2;
    state.wantedState = 'chasing';
    state.lastSeen = { x: p.x, z: p.z };
    runChaseSim(state, 600);
    placeCruisersInFrame(state);
    spawnNearbyTraffic(state, 10);
  } else if (SHOT === 'heli') {
    // Golden hour, finale: King of the Bay (m10) timed checkpoints,
    // 4 stars with the helicopter up. $24,900 honestly earned by then:
    // m1–m9 rewards ($20,200) + side income ($4,700). Rep 120
    // (9 missions + 15 kills), day 10, armour 80, all six weapons.
    state.clockMinutes = 17 * 60 + 15;
    state.weather = WEATHER_CLEAR;
    const car = state.cars.find((c) => c.model.name === 'Aurora') || state.cars[0];
    p.x = 270;
    p.z = 270;
    p.onFoot = false;
    p.car = car;
    car.state = 'player';
    car.vF = 24;
    car.yaw = Math.PI / 2;
    p.yaw = car.yaw;
    p.money = 24900;
    p.rep = 120;
    state.day = 10;
    p.armour = 80;
    p.weaponsOwned = ['pistol', 'smg', 'shotgun', 'rifle', 'ar9', 'breaker'];
    p.ammo = { pistol: Infinity, smg: 150, shotgun: 28, rifle: 120, ar9: 90, breaker: 40 };
    p.weapon = 'smg';
    stageMission(9, 0, "MARA: Last one. You drive like the Bay is on fire, I cover the exits, and we walk away kings.");
    state.stepState.timeLeft = 171;
    state.wantedHeat = 100;
    state.wantedStars = 4;
    state.wantedState = 'chasing';
    state.lastSeen = { x: p.x, z: p.z };
    runChaseSim(state, 900);
    placeCruisersInFrame(state);
    placeHeliInFrame(state);
    spawnNearbyTraffic(state, 10);
  } else if (SHOT === 'boat') {
    // Bright DAYTIME boat run (v14): The Smuggler's Run (m13) timed
    // checkpoints — the Dinghy on the water off the Marina coast,
    // the beach and the pier behind, the cops holding the shore road.
    // $38,000 honestly earned by then: m1–m12 rewards ($33,700) +
    // side income ($4,700) − the m11 engine tune ($400). Rep 150
    // (12 missions + 15 kills) — RANK S, day 13, armour 60.
    // (v15: 4 stars now, so 6 cruisers hold the shore — the boat
    // shot reads as a real chase, not three cars watching.)
    state.clockMinutes = 15 * 60;
    state.weather = WEATHER_CLEAR;
    const boat = state.boats.find((b) => b.model.name === 'Dinghy') || state.boats[0];
    p.x = 300;
    p.z = 533;
    p.onFoot = false;
    p.boat = boat;
    boat.state = 'player';
    boat.x = 300;
    boat.z = 533;
    boat.yaw = Math.PI / 2;
    boat.vF = 15;
    p.yaw = boat.yaw;
    p.money = 38000;
    p.rep = 150;
    state.day = 13;
    p.armour = 60;
    p.weaponsOwned = ['pistol', 'smg', 'shotgun', 'rifle', 'ar9', 'breaker'];
    p.ammo = { pistol: Infinity, smg: 150, shotgun: 28, rifle: 120, ar9: 90, breaker: 40 };
    p.weapon = 'smg';
    stageMission(12, 3, "VINCE: Grab the crate at the pier, take the Dinghy, and run the whole coast to the east buoy. The cops will be on the shore watching you sail past.");
    state.stepState.timeLeft = 138;
    state.wantedHeat = 100;
    state.wantedStars = 4;
    state.wantedState = 'chasing';
    state.lastSeen = { x: p.x, z: p.z };
    runChaseSim(state, 900);
    placeCruisersOnShore(state);
    // Beachgoers on the sand (v15): the beach the boat sails past is
    // crowded — umbrellas, towels and people on the sand.
    spawnBeachPeds(state, 10, p.x, p.z);
    spawnNearbyTraffic(state, 10);
  } else if (SHOT === 'night') {
    // NIGHT NEON (v14): Tune Wars (m14) timed checkpoints — a tuned
    // Strada at TUNE 2 down The Strip at 21:45, neon signs and lamps
    // glowing, headlights on, 4 stars with the helicopter up. $42,600
    // honestly earned by then: m1–m13 rewards ($38,700) + side income
    // ($4,700) − tuning ($800: engine Lv1 in m11, engine Lv2 in m14).
    // Rep 160 (13 missions + 15 kills) — RANK S, day 14, armour 70.
    // The car is the Strada the mission makes the player steal and
    // tune — the HUD reads "Strada · TUNE 2", matching the mission
    // panel ("Bring the tuned Strada to the Hideout").
    state.clockMinutes = 21 * 60 + 45;
    state.weather = WEATHER_CLEAR;
    const car = state.cars.find((c) => c.model.name === 'Strada')
      || state.cars.find((c) => c.model.name === 'Aurora') || state.cars[0];
    p.x = 390;
    p.z = 450;
    p.onFoot = false;
    p.car = car;
    car.state = 'player';
    car.vF = 24;
    car.yaw = Math.PI / 2;
    p.yaw = car.yaw;
    // The tune is real: engine level 2, applied through applyTune,
    // so the car genuinely drives faster and the HUD reads TUNE 2.
    car.tune = { engine: 2, armor: 0, wheels: 0 };
    car.engine = 2;
    applyTune(car);
    p.money = 42600;
    p.rep = 160;
    state.day = 14;
    p.armour = 70;
    p.weaponsOwned = ['pistol', 'smg', 'shotgun', 'rifle', 'ar9', 'breaker'];
    p.ammo = { pistol: Infinity, smg: 150, shotgun: 28, rifle: 120, ar9: 90, breaker: 40 };
    p.weapon = 'smg';
    stageMission(13, 3, "LIO: Two upgrades minimum, Dante. Engine and wheels. I'll make it fly.");
    state.stepState.timeLeft = 141;
    state.wantedHeat = 100;
    state.wantedStars = 4;
    state.wantedState = 'chasing';
    state.lastSeen = { x: p.x, z: p.z };
    runChaseSim(state, 900);
    placeCruisersInFrame(state);
    placeHeliInFrame(state);
    // A burning car ahead on The Strip (v15): the night shot's
    // explosion aftermath, smoke column rising over the neon. Staged
    // 35 m ahead of the player so the flame fills the frame — at 70 m
    // it was a speck the camera never showed.
    stageBurningCar(state, 425, 450, Math.PI / 2);
    spawnNearbyTraffic(state, 10);
  }
  // Scene pedestrians for the shot: NPCs on sidewalks near the player
  // so the frame reads as a living street (v5), more of them now (v15).
  spawnScenePeds(state, 40, p.x, p.z);
  // Snap the camera onto the chase framing (the spring would otherwise
  // still be travelling from the high title view), paint twice, then
  // signal the screenshot harness.
  board.snapCamera(state);
  board.sync(state, 0.016, 1);
  board.sync(state, 0.016, 1.05);
  hud.update(state, 0.016);
  window.__shotReady = true;
}

// ---- debug API (the playtest harness drives the game through this) ----

function apiState() {
  const p = state.player;
  return {
    mode: state.mode,
    x: +p.x.toFixed(2), z: +p.z.toFixed(2), yaw: +p.yaw.toFixed(3),
    onFoot: p.onFoot, health: Math.round(p.health), money: Math.floor(p.money),
    wantedStars: state.wantedStars, wantedState: state.wantedState,
    wantedHeat: Math.round(state.wantedHeat || 0),
    mission: state.mission ? state.mission.id : null,
    storyDone: state.storyDone,
    stepIndex: state.stepIndex,
    step: state.mission ? state.mission.steps[state.stepIndex]?.type : null,
    objective: objectiveText(state.mission, state.stepIndex, state.stepState),
    cars: state.cars.length, peds: state.peds.length, goons: state.goons.filter((g) => g.state !== 'dead').length,
    clock: Math.floor(state.clockMinutes), weather: state.weather,
    fps,
    car: p.car ? { model: p.car.model.name, speed: +Math.abs(p.car.vF).toFixed(1), hp: Math.round(p.car.hp), tune: tuneLevel(p.car), topSpeed: +(42 * p.car.model.maxSpeed).toFixed(1) } : null,
    boat: p.boat ? { model: p.boat.model.name, speed: +Math.abs(p.boat.vF).toFixed(1), hp: Math.round(p.boat.hp) } : null,
    boats: (state.boats || []).map((b) => ({ model: b.model.name, x: Math.round(b.x), z: Math.round(b.z), state: b.state })),
    tuningOpen: !!state.tuningOpen,
    feed: state.feed.length, garage: state.garage.length,
    coins: state.coinsCollected, vansRobbed: state.vansRobbed,
    heli: state.heli ? state.heli.active : false,
    // v15 debug hooks: chase-camera distance/FOV, district standing,
    // police roles + roadblock, the minimap search ring, beach props
    // and the bridge — the playtest reads these, the game never shows
    // them as text.
    cameraZoom: +(state.cameraZoom || 0).toFixed(2),
    cameraFov: +(state.cameraFov || 0).toFixed(1),
    standing: (() => {
      const d = districtFor(p.x, p.z);
      return { district: d.name, value: (state.standing || {})[d.name] ?? STANDING_START };
    })(),
    cops: (state.cars || [])
      .filter((c) => c.police && c.state !== 'wreck' && c.state !== 'burning')
      .map((c) => ({ callsign: c.callsign || 'SPD', role: c.role || null, d: Math.round(Math.hypot(c.x - p.x, c.z - p.z)) })),
    roadblock: !!state.roadblock,
    searchRing: (state.wantedStars || 0) > 0 && (state.playerSeen === true || state.wantedState === 'chasing'),
    beachProps: (state.city.beachProps || []).length,
    bridge: !!state.city.bridge,
    dialogue: state.dialogue.length > 0,
    dialogueIndex: state.dialogueIndex,
    dialogueLines: state.dialogue.length,
    marker: state.marker.active ? { x: state.marker.x, z: state.marker.z, radius: state.marker.radius } : null,
    checkpoints: state.checkpoints.map((c) => ({ x: c.x, z: c.z, hit: c.hit })),
    taxi: state.taxi.active ? { stage: state.taxi.stage, fare: state.taxi.fare } : null,
    race: state.race.active ? { next: state.race.next, total: state.race.checkpoints.length, timer: Math.ceil(state.race.timer) } : null,
    van: state.van.active ? { x: state.van.car.x, z: state.van.car.z, crack: +(state.van.crack || 0).toFixed(2) } : null,
  };
}

window.__solmar = {
  ready: Promise.resolve(true),
  state: apiState,
  setAutoTick(v) { state.autoTick = !!v; },
  step(n) {
    for (let i = 0; i < (n || 1); i++) {
      step(STEP);
      clearEdges(state.input);
      if (state.mode !== 'play') break;
    }
    board.sync(state, STEP, state.time);
  },
  render() { board.sync(state, 0.016, state.time); },
  setInput(o) {
    Object.assign(state.input, o);
    if (o.forward !== undefined || o.back !== undefined || o.left !== undefined || o.right !== undefined) {
      // held keys via the debug API
    }
  },
  press(code) {
    const ev = new KeyboardEvent('keydown', { code, bubbles: true });
    window.dispatchEvent(ev);
    const ev2 = new KeyboardEvent('keyup', { code, bubbles: true });
    window.dispatchEvent(ev2);
  },
  teleport(x, z, yaw) {
    const p = state.player;
    p.x = x;
    p.z = z;
    if (yaw !== undefined) p.yaw = yaw;
    if (p.car) { p.car.x = x; p.car.z = z; if (yaw !== undefined) p.car.yaw = yaw; }
    if (p.boat) { p.boat.x = x; p.boat.z = z; if (yaw !== undefined) p.boat.yaw = yaw; }
    board.camPos.set(x - Math.sin(p.yaw) * 12, 4, z - Math.cos(p.yaw) * 12);
  },
  enterNearestCar() { return tryEnterCar(state); },
  exitCar() { return exitCar(state); },
  enterBoat() { return tryEnterBoat(state); },
  exitBoat() { return exitBoat(state); },
  spawnBoat(model, x, z, yaw) {
    const boat = spawnBoat(state, model, x, z, yaw ?? 0);
    return boat.id;
  },
  tune(kind) { return tryTune(state, kind); },
  openTuning() { state.tuningOpen = true; },
  get tuningOpen() { return state.tuningOpen; },
  spawnCar(model, x, z, yaw) {
    const car = spawnCar(state, model, x, z, yaw ?? 0, { state: 'parked' });
    return car.id;
  },
  setHealth(car, h) { /* reserved */ },
  findCar(pred) { return state.cars.find(pred) || null; },
  setClock(minutes) { state.clockMinutes = minutes; },
  setWeather(w) { state.weather = w; },
  startMission(i) { startMission(i); },
  addWanted(n) {
    state.wantedHeat = Math.max(0, (state.wantedHeat || 0) + n);
    state.wantedStars = Math.min(6, Math.floor(state.wantedHeat / 25));
    if (state.wantedStars > 0) {
      state.wantedState = 'chasing';
      state.lastSeen = { x: state.player.x, z: state.player.z };
    }
  },
  startNewGame() { startGame(false); },
  save() { return saveGame(state); },
  load() { return loadGame(); },
  get mission() { return state.mission; },
  get feed() { return state.feed; },
  get phoneOpen() { return state.phoneOpen; },
  openPhone() { state.phoneOpen = true; },
  get garage() { return state.garage; },
  get wantedState() { return state.wantedState; },
  get lastSeen() { return state.lastSeen; },
  get evadeTimer() { return state.evadeTimer; },
  get gpsRoute() { return state.gpsRoute; },
  get zoom() { return state.cameraFov; },
  // Best hiding spot: the block centre (from the 8x8 grid) whose line of
  // sight is blocked from the roads on all four sides, at least 150 m
  // from (fx, fz). Counting buildings is not enough — a park block has
  // none and the cops see straight across; test the real LOS from the
  // four surrounding road midpoints.
  hidingSpot(fx, fz) {
    // v15: a hide spot must be invisible to every live cruiser, not
    // just covered from the escape origin — at 6 stars, 9 cruisers
    // converge from all directions, and one parked on a diagonal with
    // line of sight to the block centre pins the player 'seen' forever
    // (the heat never drains). A spot any cruiser can see scores -1.
    const cops = (state.cars || []).filter((c) => c.police && c.state !== 'wreck' && c.state !== 'burning');
    let best = null; let bestScore = -1;
    let fallback = null; let fallbackScore = -1;
    for (let i = 0; i < 8; i++) {
      for (let j = 0; j < 8; j++) {
        const cx = 30 + i * 60 + 30, cz = 30 + j * 60 + 30;
        const d = Math.hypot(cx - fx, cz - fz);
        if (d < 150) continue;
        let blocked = 0;
        for (const [rx, rz] of [[cx, cz - 30], [cx, cz + 30], [cx - 30, cz], [cx + 30, cz]]) {
          if (segmentBlocked(state.city, rx, rz, cx, cz)) blocked++;
        }
        let cover = 0;
        for (const b of state.city.buildings) {
          if (Math.abs(b.x - cx) < 25 && Math.abs(b.z - cz) < 25) cover++;
        }
        // No cruiser may have line of sight to the spot (sight range
        // is 130 m); also keep the spot well clear of the nearest one.
        let minCop = Infinity;
        let visible = false;
        for (const c of cops) {
          const cd = Math.hypot(c.x - cx, c.z - cz);
          if (cd < minCop) minCop = cd;
          if (cd < 130 && !segmentBlocked(state.city, c.x, c.z, cx, cz)) { visible = true; break; }
        }
        const score = blocked * 10000 + cover * 100 + d + Math.min(minCop, 300);
        if (score > fallbackScore) { fallbackScore = score; fallback = { x: cx, z: cz }; }
        if (visible) continue;
        if (score > bestScore) { bestScore = score; best = { x: cx, z: cz }; }
      }
    }
    // If every spot is visible to some cruiser, take the best-covered
    // one anyway (never return null — the caller teleports to it).
    return best || fallback;
  },
  get drift() { return state.player.car ? state.player.car.drifting : false; },
  get radioTrack() { return `${state.weather}`; },
  storeCar() { return storeCarInGarage(state); },
  takeOutCar(i) { return takeOutGarageCar(state, i); },
  respray() { return tryRespray(state); },
  openGarage() { state.garageOpen = true; },
  get busted() { return state.mode === 'busted'; },
  get wasted() { return state.mode === 'wasted'; },
  get screen() { return state.mode; },
  aimAt(x, z) {
    state.player.aimX = x;
    state.player.aimZ = z;
    state.player.aimLocked = true;
    state.player.mouseMovedAt = state.time;
  },
  heal() { state.player.health = 100; },
  hurt(n) { hurtPlayer(state, n); },
  goons() {
    return state.goons.map((g) => ({ x: +g.x.toFixed(1), z: +g.z.toFixed(1), hp: g.hp, state: g.state, isCop: !!g.isCop }));
  },
  spawnGoonAt(x, z, isCop) {
    const g = spawnGoon(state, x, z);
    if (isCop) { g.isCop = true; g.shirt = '#1c2733'; g.hp = 80; }
    return g;
  },
  spawnVan() { state.vanTimer = 0.01; },
  coins() {
    return state.city.coins.filter((c) => !c.taken).map((c) => ({ x: c.x, z: c.z }));
  },
};

// ---- boot ----

window.addEventListener('resize', () => board.resize());
if (SHOT) {
  stageShot();
} else {
  showTitle();
  if (AUTOSTART) {
    initAudio();
    startGame(false);
  }
  requestAnimationFrame(frame);
}

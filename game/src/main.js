// Solmar Bay 3D — boot and the one loop. Input is read every frame,
// the world advances in fixed 1/60 s steps, and the board paints what
// is there. The game moves between title, play, paused, wasted and
// busted. Dialogue, the phone and the garage pause the world.
//
// ?seed=N fixes the city and traffic. ?autostart=1 skips the title.
// ?shot=start|drive|chase|foot|heli (with &seed=N) stages that scene
// instead of running the loop, paints it twice and sets
// window.__shotReady for a screenshot.

import * as THREE from '../vendor/three.module.js';
import {
  CLOCK_START_MINUTES, FEED_SEEDS, LANDMARKS, PHONE_CONTACTS, STEP,
  WEATHER_CLEAR, WEATHER_MAX_SECONDS, WEATHER_MIN_SECONDS, WEATHER_RAIN,
  WEATHER_STORM, WORLD_SIZE,
} from './config.js';
import { generateCity, gpsRoute, segmentBlocked } from './city.js';
import { mulberry32, clamp, dist2, rand } from './rng.js';
import {
  createPlayer, exitCar, hurtPlayer, spawnCar, spawnGoon, spawnParkedCars,
  spawnPeds, spawnTraffic, tryEnterCar, updateCars, updateCoins, updateGoons,
  updateParticles, updatePeds, updatePlayer, updateTraffic,
} from './entities.js';
import { updateHeli, updatePolice, updateWanted } from './police.js';
import { MISSIONS, makeCourierJob, objectiveText } from './missions.js';
import {
  pushFeed, safehouseTick, shopCycle, storeCarInGarage, takeOutGarageCar,
  tryChop, tryOutfit, tryRespray, tryStartRace, tryStartTaxi, updateRace,
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
    cars: [], peds: [], goons: [],
    particles: new Array(500).fill(null),
    tracers: new Array(16).fill(null),
    heli: null,
    wantedHeat: 0, wantedStars: 0, wantedState: 'none',
    lastSeen: null, evadeTimer: 0, spawnTimer: 0,
    clockMinutes: CLOCK_START_MINUTES,
    weather: WEATHER_CLEAR, weatherTimer: rand(rng, WEATHER_MIN_SECONDS, WEATHER_MAX_SECONDS),
    lightning: 0, nightFactor: 0,
    mission: null, missionIndex: 0, stepIndex: 0, stepState: {},
    storyDone: false, courierIndex: 0,
    taxi: { active: false }, race: { active: false },
    van: { active: false, car: null, crack: 0 }, vanTimer: 90, vanPrompt: false,
    feed: FEED_SEEDS.map((f) => ({ ...f, time: CLOCK_START_MINUTES })),
    contacts: PHONE_CONTACTS,
    phoneOpen: false, garageOpen: false, garage: [],
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
  spawnParkedCars(state, 24);
  spawnTraffic(state, 14);
  spawnPeds(state, 24);
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
  if (state.dialogue.length > 0) return 'Enter — continue';
  if (state.phoneOpen) return 'C — close phone';
  if (state.garageOpen) return 'G — close garage';
  if (state.vanPrompt) return 'Hold E — crack the van';
  const m = state.mission;
  if (m) {
    const step = m.steps[state.stepIndex];
    if (step) {
      if (step.type === 'talk' && Math.hypot(p.x - step.x, p.z - step.z) < step.radius) return 'E — Talk';
      if (step.type === 'pickup' && Math.hypot(p.x - step.x, p.z - step.z) < step.radius) return 'E — Pick up';
      if (step.type === 'hold' && Math.hypot(p.x - step.x, p.z - step.z) < step.radius) return 'Hold E — crack it';
      if (step.type === 'steal') return 'E — Get in a car';
    }
  }
  if (!p.onFoot && p.car) {
    if (dist2(p.x, p.z, stadium.x, stadium.z) < 20 * 20 && !state.race.active) return 'T — Start street race ($500) · E — Get out';
    if (p.car.taxi && !state.taxi.active) return 'T — Start taxi fare · E — Get out';
    if (dist2(p.x, p.z, docks.x, docks.z) < 16 * 16) return 'E — Sell to chop shop';
    if (dist2(p.x, p.z, h.x, h.z) < 14 * 14 && state.wantedStars > 0) return 'E — Respray $200 (lose the cops)';
    return 'E — Get out';
  }
  // On foot.
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
  if (!p.onFoot && p.car) {
    if (dist2(p.x, p.z, docks.x, docks.z) < 16 * 16) { tryChop(state); return; }
    if (dist2(p.x, p.z, h.x, h.z) < 14 * 14 && state.wantedStars > 0) { tryRespray(state); return; }
    exitCar(state);
    return;
  }
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

  // Clock + weather.
  state.clockMinutes = (state.clockMinutes + dt * (60 / 60)) % 1440;
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
  // Phone / garage pause the world.
  if (state.phoneOpen || state.garageOpen) {
    if (input.phonePressed && state.phoneOpen) { state.phoneOpen = false; }
    if (input.garagePressed && state.garageOpen) { state.garageOpen = false; }
    handleGarageKeys();
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
    const key = ['pistol', 'smg', 'shotgun', 'rifle'][input.weaponKey - 1];
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
  updateEngine(inCar ? clamp(Math.abs(p.car.vF) / (42 * p.car.model.maxSpeed), 0, 1) : 0, inCar);
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
  p.weaponsOwned = data.weaponsOwned || ['pistol'];
  p.weapon = data.weapon || 'pistol';
  p.ammo = { pistol: Infinity, smg: 0, shotgun: 0, rifle: 0, ...(data.ammo || {}) };
  state.wantedHeat = data.wantedHeat || 0;
  p.x = data.x ?? p.x;
  p.z = data.z ?? p.z;
  p.yaw = data.yaw ?? p.yaw;
  state.clockMinutes = data.clockMinutes ?? state.clockMinutes;
  state.missionIndex = data.missionIndex || 0;
  state.stepIndex = data.stepIndex || 0;
  state.storyDone = !!data.storyDone;
  state.courierIndex = data.courierIndex || 0;
  state.coinsCollected = data.coinsCollected || 0;
  state.garage = data.garage || [];
  state.vansRobbed = data.vansRobbed || 0;
  state.feed = data.feed || state.feed;
  state.shopCycle = data.shopCycle || 0;
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
    state.clockMinutes = 17 * 60 + 45;
    const car = state.cars.find((c) => c.model.name === 'Aurora') || state.cars[0];
    p.x = car.x;
    p.z = car.z;
    p.onFoot = false;
    p.car = car;
    car.state = 'player';
    car.vF = 22;
    car.yaw = Math.PI / 2;
    p.yaw = car.yaw;
    startMission(0);
    state.dialogue = [];
  } else if (SHOT === 'chase') {
    state.clockMinutes = 20 * 60;
    state.weather = WEATHER_CLEAR;
    const car = state.cars.find((c) => c.model.name === 'Aurora') || state.cars[0];
    p.x = 270;
    p.z = 270;
    p.onFoot = false;
    p.car = car;
    car.state = 'player';
    car.vF = 25;
    car.yaw = Math.PI * 0.3;
    p.yaw = car.yaw;
    state.wantedHeat = 80;
    state.wantedStars = 3;
    state.wantedState = 'chasing';
    state.lastSeen = { x: p.x, z: p.z };
    updateWanted(state, 0.1);
    updatePolice(state, 0.1);
    for (let i = 0; i < 30; i++) { updatePolice(state, STEP); updateCars(state, STEP); }
  } else if (SHOT === 'foot') {
    state.clockMinutes = 21 * 60 + 30;
    p.x = LANDMARKS.casino.x - 20;
    p.z = LANDMARKS.casino.z;
    p.yaw = Math.PI * 0.6;
    p.onFoot = true;
    state.wantedHeat = 0;
  } else if (SHOT === 'heli') {
    state.clockMinutes = 22 * 60;
    state.weather = WEATHER_RAIN;
    const car = state.cars.find((c) => c.model.name === 'Aurora') || state.cars[0];
    p.x = 330;
    p.z = 330;
    p.onFoot = false;
    p.car = car;
    car.state = 'player';
    car.vF = 20;
    car.yaw = Math.PI * 0.8;
    p.yaw = car.yaw;
    state.wantedHeat = 100;
    state.wantedStars = 4;
    state.wantedState = 'chasing';
    state.lastSeen = { x: p.x, z: p.z };
    updateWanted(state, 0.1);
    for (let i = 0; i < 60; i++) { updatePolice(state, STEP); updateHeli(state, STEP); updateCars(state, STEP); }
  }
  // Paint twice, then signal the screenshot harness.
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
    car: p.car ? { model: p.car.model.name, speed: +Math.abs(p.car.vF).toFixed(1), hp: Math.round(p.car.hp) } : null,
    feed: state.feed.length, garage: state.garage.length,
    coins: state.coinsCollected, vansRobbed: state.vansRobbed,
    heli: state.heli ? state.heli.active : false,
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
    board.camPos.set(x - Math.sin(p.yaw) * 12, 4, z - Math.cos(p.yaw) * 12);
  },
  enterNearestCar() { return tryEnterCar(state); },
  exitCar() { return exitCar(state); },
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
    let best = null; let bestScore = -1;
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
        const score = blocked * 10000 + cover * 100 + d;
        if (score > bestScore) { bestScore = score; best = { x: cx, z: cz }; }
      }
    }
    return best;
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

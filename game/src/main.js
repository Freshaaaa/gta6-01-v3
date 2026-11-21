// Solmar Bay 3D — main: boots engine, city, player, vehicles, HUD, and the
// gameplay systems (traffic, pedestrians, police, missions, weapons, audio);
// game loop, state machine (menu → playing → paused), input, chase camera,
// save, and the ?shot= staging hook for screenshots. Written fresh for the
// gta6-01 3D rebuild (branch v12-3d).
import * as THREE from 'three';
import { Engine } from './engine.js';
import { City, BEACH_Z } from './city.js';
import { Player } from './player.js';
import { VehicleManager } from './vehicles.js';
import { HUD } from './hud.js';
import { loadSave, writeSave } from './save.js';
import { AudioStub } from './audio.js';
import { Traffic } from './traffic.js';
import { Pedestrians } from './pedestrians.js';
import { Police } from './police.js';
import { Missions } from './missions.js';
import { Weapons } from './weapons.js';

const params = new URLSearchParams(location.search);
const SHOT = params.get('shot') || '';
const SEED = parseInt(params.get('seed') || '7', 10);

const canvas = document.getElementById('game');
const engine = new Engine(canvas);
// Test hook: ?lowfx=1 disables shadows and renders at 60% resolution so
// the software renderer runs fast enough for sim-time waits.
if (params.get('lowfx')) {
  engine.renderer.shadowMap.enabled = false;
  engine.renderer.setPixelRatio(0.6);
}
const city = new City(engine.scene, SEED);
const player = new Player(engine.scene);
const vehicles = new VehicleManager(engine.scene, city, SEED + 14);
const hud = new HUD();
const audio = new AudioStub();

let state = 'menu'; // menu | playing | paused
let money = 250;
let health = 100;
let time = 17.5;
let simSeconds = 0; // simulation seconds advanced (frame-rate independent clock)
let drivenCar = null;
let autoDrive = false;
let saveTimer = 0;
let frames = 0;
const keys = {};
let drag = null;
let penalty = null; // {type: 'busted'|'wasted', t}
let lastShot = null;
let lastShotT = -100;

function getPlayer() {
  return {
    x: drivenCar ? drivenCar.x : player.x,
    z: drivenCar ? drivenCar.z : player.z,
    y: player.y,
    yaw: player.yaw,
    camYaw: player.camYaw,
    inCar: !!drivenCar,
    car: drivenCar,
  };
}

// Load the save BEFORE the systems: Missions.buildCoins() must know which
// sun coins are already collected, or they re-spawn and pay twice on reload
// (polish fix: the coin at the saved position re-collected every load).
const saved = loadSave();

// --- systems (constructed after the core, wired through closures) ---
const police = new Police(engine.scene, city, {
  getPlayer,
  damagePlayer: (n) => damagePlayer(n, 'ram'),
  onBusted: () => applyPenalty('busted'),
  audio,
});
const traffic = new Traffic(engine.scene, city, SEED + 31);
const peds = new Pedestrians(engine.scene, city, SEED + 47);
const missions = new Missions(engine.scene, city, {
  getPlayer,
  hud,
  police,
  audio,
  addMoney: (n) => { money += n; hud.setMoney(money); },
  saveNow: () => saveNow(),
  unlocked: 0,
  coinsCollected: saved?.coins ?? [],
});
const weapons = new Weapons(engine.scene, {
  camera: engine.camera,
  getPlayer,
  peds,
  police,
  traffic,
  audio,
  addWanted: (n) => police.addWanted(n),
  onWeaponChange: (t) => hud.setWeapon(t),
  onShot: (pos) => { lastShot = pos; lastShotT = simSeconds; },
});

// --- save (loaded above, before the systems) ---
if (saved) {
  money = saved.money;
  player.x = saved.x ?? player.x;
  player.z = saved.z ?? player.z;
  time = saved.time ?? time;
  health = saved.health ?? 100;
  player.group.position.set(player.x, 0, player.z);
  if (saved.weapons) {
    weapons.current = saved.weapons.current ?? 0;
    weapons.ammo = saved.weapons.ammo ?? weapons.ammo;
    weapons.reserve = saved.weapons.reserve ?? weapons.reserve;
  }
  if (typeof saved.mission === 'number') missions.unlocked = saved.mission;
}
engine.setTime(time);
hud.setMoney(money);
hud.setHealth(health);
hud.setWanted(0);
hud.setWeapon(weapons.hudText());
hud.setObjective('Explore Solmar Bay — find a car and press E');
hud.setLocation('Downtown');
// Auto-start the story: the next uncompleted mission.
missions.startMission(Math.min(missions.unlocked, 7));

function saveNow() {
  return writeSave({
    money,
    x: drivenCar ? drivenCar.x : player.x,
    z: drivenCar ? drivenCar.z : player.z,
    time,
    health,
    mission: missions.unlocked,
    weapons: { current: weapons.current, ammo: weapons.ammo, reserve: weapons.reserve },
    coins: [...missions.coinsCollected],
  });
}

// --- health / busted / wasted ---
function damagePlayer(n, source) {
  if (penalty) return;
  health = Math.max(0, health - n);
  hud.setHealth(health);
  if (health <= 0) applyPenalty('wasted');
}

function applyPenalty(type) {
  if (penalty) return;
  penalty = { type, t: 2.5 };
  if (type === 'busted') {
    money = Math.max(0, money - 200);
    hud.showBusted(true);
  } else {
    money = Math.max(0, money - 100);
    hud.showWasted(true);
  }
  hud.setMoney(money);
  audio.playFail();
}

function respawnAfterPenalty() {
  if (drivenCar) {
    drivenCar.driven = false;
    drivenCar.setHeadlight(false);
    drivenCar = null;
  }
  player.inCar = null;
  player.x = 26; player.z = 26; player.y = 0; player.vy = 0; player.grounded = true;
  player.group.visible = true;
  player.group.position.set(player.x, 0, player.z);
  health = 100;
  hud.setHealth(health);
  hud.showBusted(false);
  hud.showWasted(false);
  police.clearAll();
  hud.setWanted(0);
  hud.setObjective('Back on the streets — the story continues');
  saveNow();
  penalty = null;
}

// --- input ---
window.addEventListener('keydown', (e) => {
  if (e.repeat) return;
  keys[e.code] = true;
  if (e.code === 'Escape' && state === 'playing') { setState('paused'); saveNow(); return; }
  if (e.code === 'Escape' && state === 'paused') { setState('playing'); return; }
  if (state !== 'playing' || penalty) return;
  if (e.code === 'KeyE') toggleCar();
  if (e.code === 'KeyF') { player.punch(); weapons.punch(); }
  if (e.code === 'KeyM') audio.toggleMute();
  if (e.code === 'KeyQ') audio.nextStation();
  if (e.code === 'KeyR') weapons.reload();
  if (e.code === 'Digit1') weapons.switchTo(0);
  if (e.code === 'Digit2') weapons.switchTo(1);
  if (e.code === 'Digit3') weapons.switchTo(2);
});
window.addEventListener('keyup', (e) => { keys[e.code] = false; });
let downPos = null;
canvas.addEventListener('pointerdown', (e) => {
  drag = { x: e.clientX, y: e.clientY };
  downPos = { x: e.clientX, y: e.clientY };
  canvas.setPointerCapture(e.pointerId);
});
canvas.addEventListener('pointermove', (e) => {
  if (!drag) return;
  const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
  drag = { x: e.clientX, y: e.clientY };
  player.camYaw -= dx * 0.005;
  player.camPitch = Math.max(0.05, Math.min(1.1, player.camPitch + dy * 0.005));
});
canvas.addEventListener('pointerup', (e) => {
  drag = null;
  // A click (not a drag) fires the current weapon.
  if (downPos && state === 'playing' && !penalty && weapons.current !== 0) {
    const moved = Math.hypot(e.clientX - downPos.x, e.clientY - downPos.y);
    if (moved < 6) weapons.shoot();
  }
  downPos = null;
});

function setState(next) {
  state = next;
  hud.showMenu(state === 'menu');
  hud.showPause(state === 'paused');
  if (state === 'playing') audio.ensure();
}
document.getElementById('play-btn').addEventListener('click', () => setState('playing'));
document.getElementById('resume-btn').addEventListener('click', () => setState('playing'));
document.getElementById('restart-btn').addEventListener('click', () => {
  player.x = 0; player.z = 26; player.y = 0;
  if (drivenCar) { drivenCar.driven = false; drivenCar = null; }
  player.inCar = null;
  player.group.visible = true;
  health = 100;
  hud.setHealth(health);
  police.clearAll();
  hud.setWanted(0);
  setState('playing');
});

function toggleCar() {
  if (drivenCar) {
    player.exitCar();
    drivenCar.setHeadlight(false);
    drivenCar = null;
    missions.onExitCar();
    saveNow();
    hud.setObjective('Explore Solmar Bay — find a car and press E');
    return;
  }
  const car = vehicles.nearestCar(player.x, player.z, 4);
  if (car) {
    // Stealing in view of a pedestrian (or the police) raises the heat.
    const witness = peds.nearestPed(player.x, player.z, 30) || police.nearestPoliceDist(player.x, player.z) < 40;
    if (witness) police.addWanted(1);
    player.enterCar(car);
    drivenCar = car;
    car.setHeadlight(engine.isNight);
    missions.onEnterCar(car);
    hud.setObjective('Drive — WASD to steer, Space to drift');
  }
}

// --- camera ---
const camPos = new THREE.Vector3(0, 8, -14);
let chaseYaw = 0;
function updateCamera(dt) {
  const cam = engine.camera;
  if (drivenCar) {
    // Chase cam: ease yaw toward the car's heading, lag the position.
    // Low and a touch further back — the car fills the frame while the city,
    // sea and sunset stay in view ahead (poster framing).
    let dy = drivenCar.heading - chaseYaw;
    while (dy > Math.PI) dy -= Math.PI * 2;
    while (dy < -Math.PI) dy += Math.PI * 2;
    chaseYaw += dy * Math.min(1, dt * 2.2);
    // True three-quarter rear angle: a 4.2 m lateral offset at 7.5 m back
    // puts the camera ~29° off the car's heading, so the wedge side profile
    // reads (the old 1.4 m offset was only ~11° — nearly straight behind,
    // and the Comet read as a box with taillights). The offset stays over
    // the road (half-width 6 m), clear of buildings and streetlights.
    const dist = 7.5, height = 2.9, lateral = 4.2;
    const tx = drivenCar.x - Math.sin(chaseYaw) * dist + Math.cos(chaseYaw) * lateral;
    const tz = drivenCar.z - Math.cos(chaseYaw) * dist - Math.sin(chaseYaw) * lateral;
    const k = 1 - Math.exp(-dt * 6);
    camPos.x += (tx - camPos.x) * k;
    camPos.y += (height - camPos.y) * k;
    camPos.z += (tz - camPos.z) * k;
    cam.position.copy(camPos);
    cam.lookAt(drivenCar.x + Math.sin(chaseYaw) * 8, 1.4, drivenCar.z + Math.cos(chaseYaw) * 8);
    const speedF = Math.min(1, Math.abs(drivenCar.speed) / 48);
    const targetFov = 60 + speedF * 14;
    if (Math.abs(cam.fov - targetFov) > 0.1) { cam.fov += (targetFov - cam.fov) * Math.min(1, dt * 4); cam.updateProjectionMatrix(); }
  } else {
    // Third-person orbit cam.
    // ?shot=foot frames Dante at 6.0m: far enough that the street, peds and
    // marker share the frame with him (he is a rounded humanoid now, not a
    // cube filling the middle of the shot).
    const d = SHOT === 'foot' ? 6.0 : 7.5, cp = Math.cos(player.camPitch), sp = Math.sin(player.camPitch);
    const tx = player.x - Math.sin(player.camYaw) * d * cp;
    const tz = player.z - Math.cos(player.camYaw) * d * cp;
    const ty = 1.6 + sp * d;
    const k = 1 - Math.exp(-dt * 10);
    camPos.x += (tx - camPos.x) * k;
    camPos.y += (ty - camPos.y) * k;
    camPos.z += (tz - camPos.z) * k;
    cam.position.copy(camPos);
    cam.lookAt(player.x, 1.5, player.z);
    if (Math.abs(cam.fov - 60) > 0.1) { cam.fov = 60; cam.updateProjectionMatrix(); }
    chaseYaw = player.camYaw;
  }
}

function districtAt(x, z) {
  if (z > BEACH_Z) return 'Solmar Beach';
  const ns = z < -104 ? 'North ' : z > 104 ? 'South ' : '';
  const ew = x < -104 ? 'Old Harbor' : x < 0 ? 'Downtown' : x < 104 ? 'Marina' : 'Sunset Hills';
  return ns + ew;
}

// --- main loop ---
function update(dt) {
  if (state !== 'playing') return;
  if (penalty) {
    penalty.t -= dt;
    if (penalty.t <= 0) respawnAfterPenalty();
    return;
  }
  simSeconds += dt;
  time += dt / 240; // 1 game hour per 4 real minutes
  engine.setTime(time);
  city.update(dt);
  const input = {
    f: keys.KeyW || keys.ArrowUp,
    b: keys.KeyS || keys.ArrowDown,
    l: keys.KeyA || keys.ArrowLeft,
    r: keys.KeyD || keys.ArrowRight,
    sprint: keys.ShiftLeft || keys.ShiftRight,
    jump: keys.Space && !drivenCar,
  };
  if (drivenCar) {
    const drive = {
      throttle: autoDrive ? 0.7 : (input.f ? 1 : input.b ? -1 : 0),
      steer: autoDrive ? 0 : (input.l ? -1 : input.r ? 1 : 0),
      handbrake: keys.Space,
    };
    vehicles.update(dt, drivenCar, drive);
    // Ploughing through pedestrians is a crime.
    const hits = peds.checkCarHit(drivenCar);
    if (hits.length > 0) police.addWanted(1);
  } else {
    player.update(dt, input, city);
  }
  // Systems.
  traffic.update(dt, { px: getPlayer().x, pz: getPlayer().z, drivenCar });
  peds.update(dt, {
    px: getPlayer().x, pz: getPlayer().z,
    carX: drivenCar ? drivenCar.x : null,
    carZ: drivenCar ? drivenCar.z : null,
    carSpeed: drivenCar ? Math.abs(drivenCar.speed) : 0,
    threat: (lastShot && simSeconds - lastShotT < 1.5) ? lastShot : null,
  });
  police.update(dt);
  missions.update(dt);
  weapons.update(dt);
  // Health regen when the heat is off.
  if (police.wanted === 0 && health < 100) {
    health = Math.min(100, health + 4 * dt);
    hud.setHealth(health);
  }
  // Interaction prompt.
  if (!drivenCar) {
    const near = vehicles.nearestCar(player.x, player.z, 4);
    hud.setPrompt(near ? `Press E to steal the ${near.model.name}` : '');
  } else {
    hud.setPrompt('');
  }
  // HUD.
  const kmh = drivenCar ? Math.abs(drivenCar.speed) * 3.6 : (player.moving ? (input.sprint ? 29 : 15) : 0);
  const gear = !drivenCar ? '—' : kmh < 40 ? 'G1' : kmh < 80 ? 'G2' : kmh < 120 ? 'G3' : kmh < 160 ? 'G4' : 'G5';
  hud.setSpeed(kmh, gear, drivenCar ? drivenCar.model.name : 'On foot');
  hud.setClock(time);
  hud.setWanted(police.wanted);
  hud.setLocation(districtAt(drivenCar ? drivenCar.x : player.x, drivenCar ? drivenCar.z : player.z));
  hud.drawMinimap(player, vehicles.cars, drivenCar, {
    ...missions.getMinimapExtras(),
    police: police.positions,
    traffic: traffic.cars.filter((t) => !t.disabled).map((t) => ({ x: t.car.x, z: t.car.z })),
  });
  audio.setEngine(kmh, !!drivenCar);
  engine.followShadows(drivenCar ? drivenCar.x : player.x, drivenCar ? drivenCar.z : player.z);
  // Autosave every 10 s.
  saveTimer += dt;
  if (saveTimer > 10) { saveTimer = 0; saveNow(); }
}

function render(dt) {
  frames++;
  if (frames === 30) window.__shotReady = true;
  // Real elapsed time (not 1/60): on slow software renderers the camera
  // must still catch up, or it lags dozens of metres behind the car.
  updateCamera(Math.min(dt, 0.1));
}

engine.start(update, render);

// --- ?shot= staging for screenshots (deterministic scenes) ---
function stageShot() {
  if (!SHOT) return;
  setState('playing');
  if (SHOT === 'drive' || SHOT === 'night' || SHOT === 'beach' || SHOT === 'chase') {
    // Put Dante in the nearest sports car, or the first car.
    const sports = vehicles.cars.find((c) => c.modelKey === 'sports') || vehicles.cars[0];
    if (SHOT === 'beach') {
      sports.x = -40; sports.z = BEACH_Z + 12; sports.heading = 0; // facing the sea (+z), camera behind sees car + beach + ocean
      engine.setTime(17.5); // golden hour: the sun sits over the sea ahead-left
      time = 17.5;
      // Sun into the beach frame: the car turns west and the default
      // golden-hour disc sits ~70° off-frame left — stage the sun over the
      // sea to the west so the shot has a real sun (sharp disc + tight glow).
      engine.placeSun(-515, 110, 382);
      // Sun glitter path on the water points at the staged sun.
      city.glitter.rotation.y = -1.2;
      city.glitter.position.set(-320, 0.2, 360);
      // Beach life in the foreground: peds on the sand south of the run line
      // (the car stays at z≈262, so they are clear of the wheels).
      peds.spawnPed(false, -110, 270);
      peds.spawnPed(false, -120, 268);
      peds.spawnPed(false, -100, 272);
    } else if (SHOT === 'night') {
      // Start mid-block (z=26), not at the intersection: the car stalls
      // behind seeded traffic at the z=0 crossing (deterministic, both
      // previous runs), so the shot is taken mid-block either way — the
      // zebra at z=±7.5 stays ~19 m behind the lens, out of the foreground.
      sports.x = 0; sports.z = 26; sports.heading = 0;
      engine.setTime(21.5);
      time = 21.5;
    } else if (SHOT === 'chase') {
      // Cover shot: Dante's Comet STATIONARY (speed 0, no autoDrive) with
      // police cars closing in ahead — a moving player outruns every staged
      // police car before the screenshot (closing speed ~50 m/s, ~2 sim-s to
      // the shot), so the chase cars behind the camera never appear in frame.
      sports.x = 0; sports.z = 0; sports.heading = 0;
      sports.speed = 0;
      engine.setTime(17.5);
      time = 17.5;
      police.spawnChase(0, -6, 2);
      // Two police cars ahead on the road, facing the player: at screenshot
      // time (~2 sim-s) they are ~15m ahead, flashing light bars visible.
      for (const [px, pz] of [[-7, 45], [7, 52]]) {
        const pc = police.spawnPoliceCar(px, pz, true);
        pc.car.heading = Math.PI;
        pc.car.group.rotation.y = Math.PI;
      }
      hud.setObjective('Escape the police — wanted level 3!');
    } else {
      sports.x = 0; sports.z = 0; sports.heading = 0;
      engine.setTime(17.5);
      time = 17.5;
    }
    sports.group.position.set(sports.x, 0, sports.z);
    sports.group.rotation.y = sports.heading;
    player.x = sports.x; player.z = sports.z;
    player.enterCar(sports);
    drivenCar = sports;
    sports.setHeadlight(engine.isNight);
    chaseYaw = sports.heading;
    autoDrive = SHOT === 'drive'; // chase stays put (staged cover shot)
    if (SHOT === 'drive') sports.speed = 22;
    if (SHOT === 'night') {
      // Park a car in the next lane ahead: its taillights stay in frame for
      // the whole night drive. (A moving traffic car drifts out of frame —
      // it is already 50+ m ahead by the time the player gets rolling.)
      // The shot is taken mid-block (z≈30), so the parked car sits 15 m
      // ahead at z=45 instead of z=10 (which was right on the zebra).
      const parked = vehicles.cars.find((c) => c.modelKey !== 'sports' && c.modelKey !== 'taxi' && !c.police);
      if (parked) {
        parked.x = -2.2; parked.z = 45; parked.heading = 0;
        parked.group.position.set(-2.2, 0, 45);
        parked.group.rotation.y = 0;
      }
    }
    if (SHOT !== 'chase') hud.setObjective('Drive — WASD to steer, Space to drift');
  } else if (SHOT === 'foot') {
    player.x = 8; player.z = 30;
    player.camYaw = Math.PI * 0.15;
    player.camPitch = 0.18; // flatter orbit: more street + city in frame, less empty sidewalk
    engine.setTime(17.5);
    time = 17.5;
    player.group.position.set(player.x, 0, player.z);
    // Foreground dressing at the actual shot spot (the playtest teleports
    // Dante to (-44,-44), by the bank at (-52,-52)): a parked car on the
    // road edge west of Dante, so the bottom of the frame holds a car, not
    // bare sidewalk. Static, so it stays put until the shutter fires.
    const fgCar = vehicles.cars.find((c) => c.modelKey !== 'sports' && c.modelKey !== 'taxi' && !c.police);
    if (fgCar) {
      fgCar.x = -47.4; fgCar.z = -42; fgCar.heading = 0;
      fgCar.group.position.set(-47.4, 0, -42);
      fgCar.group.rotation.y = 0;
    }
  }
  camPos.set(player.x, 8, player.z - 14);
}
stageShot();

// --- debug API for the CDP playtest ---
window.__solmar = {
  get state() { return state; },
  get simSeconds() { return simSeconds; },
  get money() { return money; },
  get time() { return time; },
  get health() { return health; },
  get wanted() { return police.wanted; },
  get mission() { return { current: missions.current, step: missions.step, unlocked: missions.unlocked }; },
  get peds() { return peds.count; },
  get traffic() { return traffic.count; },
  get policeCount() { return police.count; },
  get coins() { return missions.coinsCollected.size; },
  get taxi() { return missions.taxi.phase; },
  get cops() { return police.cops.length; },
  get marker() { return missions.markerPos; },
  get vanPos() { return missions.van ? { x: missions.van.x, z: missions.van.z } : null; },
  get targetPos() { return missions.target ? { x: missions.target.x, z: missions.target.z } : null; },
  taxiPos() {
    const c = vehicles.cars.find((c) => c.modelKey === 'taxi');
    return c ? { x: c.x, z: c.z, model: c.model.name } : null;
  },
  unlockAll() { missions.unlocked = 7; return true; },
  get ammo() { return { current: weapons.current, mag: weapons.ammo[weapons.current], reserve: weapons.reserve[weapons.current] }; },
  get station() { return audio.station; },
  get player() { return { x: player.x, z: player.z, y: player.y, inCar: !!drivenCar, moving: player.moving }; },
  get car() {
    if (!drivenCar) return null;
    return { x: drivenCar.x, z: drivenCar.z, speed: drivenCar.speed, model: drivenCar.model.name };
  },
  get camera() {
    const p = engine.camera.position;
    return { x: p.x, y: p.y, z: p.z, fov: engine.camera.fov };
  },
  get cars() { return vehicles.cars.length; },
  nearestCarPos() {
    const c = vehicles.nearestCar(player.x, player.z, 500);
    return c ? { x: c.x, z: c.z, model: c.model.name } : null;
  },
  get buildings() { return city.buildingCount; },
  teleport(x, z) { if (drivenCar) { drivenCar.x = x; drivenCar.z = z; } else { player.x = x; player.z = z; player.group.position.set(x, 0, z); } },
  setHeading(h) {
    if (drivenCar) { drivenCar.heading = h; drivenCar.group.rotation.y = h; }
    else { player.yaw = h; player.camYaw = h; }
    chaseYaw = h;
    return true;
  },
  setTime(h) { time = h; engine.setTime(h); },
  enterNearestCar() { toggleCar(); return !!drivenCar; },
  exitCar() { if (drivenCar) toggleCar(); return !drivenCar; },
  setAutoDrive(b) { autoDrive = b; },
  saveNow() { return saveNow(); },
  readSave() { return localStorage.getItem('solmar-bay-save-v1'); },
  startMission(i) { return missions.startMission(i); },
  setWanted(n) { police.setWanted(n); },
  forceDecay() { police.debugForceDecay(); },
  damagePlayer(n) { damagePlayer(n, 'debug'); return health; },
  spawnPedNear(x, z) { peds.spawnPed(false, x, z); return true; },
  spawnCopNear() {
    const p = getPlayer();
    police.spawnCop(p.x + 3, p.z + 3);
    return true;
  },
  spawnPedAhead(d = 10) {
    const fx = Math.sin(player.camYaw), fz = Math.cos(player.camYaw);
    peds.spawnPed(false, player.x + fx * d, player.z + fz * d);
    return true;
  },
};
